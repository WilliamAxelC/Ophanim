package collector

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/WilliamAxelC/Ophanim/pkg/storage"
	"github.com/WilliamAxelC/Ophanim/pkg/types"
)

type containerPrevSample struct {
	rxBytes    uint64
	txBytes    uint64
	readBytes  uint64
	writeBytes uint64
	timestamp  time.Time
}

// DockerCollector communicates directly with the Docker Engine REST API via unix socket or TCP.
type DockerCollector struct {
	nodeID      string
	host        string
	httpClient  *http.Client
	storage     *storage.Storage
	prevSamples map[string]containerPrevSample
	prevMu      sync.Mutex
}

// NewDockerCollector initializes a direct REST client for Docker daemon.
func NewDockerCollector(nodeID, host string, store *storage.Storage) (*DockerCollector, error) {
	if host == "" {
		host = "unix:///var/run/docker.sock"
	}

	var transport *http.Transport
	if strings.HasPrefix(host, "unix://") {
		socketPath := strings.TrimPrefix(host, "unix://")
		transport = &http.Transport{
			DialContext: func(ctx context.Context, proto, addr string) (net.Conn, error) {
				var d net.Dialer
				return d.DialContext(ctx, "unix", socketPath)
			},
		}
	} else {
		// TCP host (e.g. tcp://10.20.20.121:2375 or http://...)
		tcpHost := strings.TrimPrefix(host, "tcp://")
		if !strings.HasPrefix(tcpHost, "http://") && !strings.HasPrefix(tcpHost, "https://") {
			tcpHost = "http://" + tcpHost
		}
		transport = &http.Transport{
			DialContext: (&net.Dialer{
				Timeout: 5 * time.Second,
			}).DialContext,
		}
	}

	return &DockerCollector{
		nodeID:      nodeID,
		host:        host,
		httpClient:  &http.Client{Transport: transport, Timeout: 15 * time.Second},
		storage:     store,
		prevSamples: make(map[string]containerPrevSample),
	}, nil
}

// Close closes any idle connections.
func (d *DockerCollector) Close() error {
	d.httpClient.CloseIdleConnections()
	return nil
}

func (d *DockerCollector) baseURL() string {
	if strings.HasPrefix(d.host, "unix://") {
		return "http://docker"
	}
	tcpHost := strings.TrimPrefix(d.host, "tcp://")
	if !strings.HasPrefix(tcpHost, "http://") && !strings.HasPrefix(tcpHost, "https://") {
		tcpHost = "http://" + tcpHost
	}
	return strings.TrimSuffix(tcpHost, "/")
}

type dockerContainerSummary struct {
	ID      string            `json:"Id"`
	Names   []string          `json:"Names"`
	Image   string            `json:"Image"`
	State   string            `json:"State"`
	Status  string            `json:"Status"`
	Created int64             `json:"Created"`
	Labels  map[string]string `json:"Labels"`
}

type dockerContainerInspect struct {
	ID    string `json:"Id"`
	Name  string `json:"Name"`
	State struct {
		Status     string `json:"Status"`
		ExitCode   int    `json:"ExitCode"`
		Restarting bool   `json:"Restarting"`
		Health     *struct {
			Status string `json:"Status"`
		} `json:"Health"`
	} `json:"State"`
	RestartCount int `json:"RestartCount"`
	HostConfig   struct {
		Memory int64 `json:"Memory"`
	} `json:"HostConfig"`
}

// CollectContainers queries all containers on the Docker host.
func (d *DockerCollector) CollectContainers(ctx context.Context) ([]types.ContainerStatus, error) {
	url := fmt.Sprintf("%s/containers/json?all=1", d.baseURL())
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}

	resp, err := d.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to contact docker daemon at %s: %w", d.host, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("docker API returned %d: %s", resp.StatusCode, string(body))
	}

	var summaries []dockerContainerSummary
	if err := json.NewDecoder(resp.Body).Decode(&summaries); err != nil {
		return nil, fmt.Errorf("failed to decode container list: %w", err)
	}

	log.Printf("[DockerCollector] Found %d containers on node '%s'", len(summaries), d.nodeID)

	var statuses []types.ContainerStatus
	var activeIDs []string
	var mu sync.Mutex
	var wg sync.WaitGroup

	for _, c := range summaries {
		name := ""
		if len(c.Names) > 0 {
			name = strings.TrimPrefix(c.Names[0], "/")
		}

		shortID := c.ID
		if len(shortID) > 12 {
			shortID = shortID[:12]
		}
		activeIDs = append(activeIDs, shortID)

		stack := ""
		if s, ok := c.Labels["com.docker.compose.project"]; ok && s != "" {
			stack = s
		} else if s, ok := c.Labels["com.docker.stack.namespace"]; ok && s != "" {
			stack = s
		}

		status := types.ContainerStatus{
			ID:       shortID,
			Name:     name,
			Image:    c.Image,
			State:    c.State,
			Status:   c.Status,
			Health:   "none",
			NodeID:   d.nodeID,
			Labels:   c.Labels,
			Stack:    stack,
			Created:  time.Unix(c.Created, 0),
			LastSeen: time.Now(),
		}

		wg.Add(1)
		go func(cSummary dockerContainerSummary, st types.ContainerStatus) {
			defer wg.Done()

			subCtx, cancel := context.WithTimeout(ctx, 2*time.Second)
			defer cancel()

			// Inspect container for deeper health and exit codes
			if inspect, err := d.InspectContainer(subCtx, cSummary.ID); err == nil && inspect != nil {
				st.ExitCode = inspect.State.ExitCode
				st.RestartCount = inspect.RestartCount
				if inspect.State.Health != nil {
					st.Health = inspect.State.Health.Status
				}
				if inspect.HostConfig.Memory > 0 {
					st.MemoryLimitMB = float64(inspect.HostConfig.Memory) / (1024 * 1024)
				}
			}

			// Fetch real-time hardware stats for active containers
			if st.State == "running" {
				if stats, err := d.FetchContainerStats(subCtx, cSummary.ID); err == nil && stats != nil {
					// CPU % calculation
					cpuDelta := float64(stats.CPUStats.CPUUsage.TotalUsage - stats.PreCPUStats.CPUUsage.TotalUsage)
					systemDelta := float64(stats.CPUStats.SystemCPUUsage - stats.PreCPUStats.SystemCPUUsage)
					onlineCPUs := float64(stats.CPUStats.OnlineCPUs)
					if onlineCPUs == 0 {
						onlineCPUs = float64(len(stats.CPUStats.CPUUsage.PercpuUsage))
					}
					if onlineCPUs == 0 {
						onlineCPUs = 1
					}
					if systemDelta > 0.0 && cpuDelta > 0.0 {
						st.CPUPercent = (cpuDelta / systemDelta) * onlineCPUs * 100.0
					}

					// Memory calculation
					memUsage := float64(stats.MemoryStats.Usage)
					if inactiveFile, ok := stats.MemoryStats.Stats["inactive_file"]; ok && inactiveFile < stats.MemoryStats.Usage {
						memUsage -= float64(inactiveFile)
					}
					st.MemoryUsageMB = memUsage / (1024 * 1024)
					if stats.MemoryStats.Limit > 0 {
						st.MemoryLimitMB = float64(stats.MemoryStats.Limit) / (1024 * 1024)
						st.MemoryPercent = (memUsage / float64(stats.MemoryStats.Limit)) * 100.0
					}

					// Network IO
					for _, netw := range stats.Networks {
						st.NetworkRxBytes += netw.RxBytes
						st.NetworkTxBytes += netw.TxBytes
					}

					// Block IO
					for _, b := range stats.BlkioStats.IOServiceBytesRecursive {
						if strings.EqualFold(b.Op, "Read") {
							st.BlockReadMB += float64(b.Value) / (1024 * 1024)
						} else if strings.EqualFold(b.Op, "Write") {
							st.BlockWriteMB += float64(b.Value) / (1024 * 1024)
						}
					}

					// Calculate Instantaneous Rates (KB/s & MB/s)
					d.prevMu.Lock()
					prev, hasPrev := d.prevSamples[cSummary.ID]
					now := time.Now()
					if hasPrev && now.After(prev.timestamp) {
						dt := now.Sub(prev.timestamp).Seconds()
						if dt > 0.1 {
							if st.NetworkRxBytes >= prev.rxBytes {
								st.NetworkRxRateKBps = float64(st.NetworkRxBytes-prev.rxBytes) / (dt * 1024)
							}
							if st.NetworkTxBytes >= prev.txBytes {
								st.NetworkTxRateKBps = float64(st.NetworkTxBytes-prev.txBytes) / (dt * 1024)
							}
							readBytesTotal := uint64(st.BlockReadMB * 1024 * 1024)
							writeBytesTotal := uint64(st.BlockWriteMB * 1024 * 1024)
							if readBytesTotal >= prev.readBytes {
								st.DiskReadRateKBps = float64(readBytesTotal-prev.readBytes) / (dt * 1024)
							}
							if writeBytesTotal >= prev.writeBytes {
								st.DiskWriteRateKBps = float64(writeBytesTotal-prev.writeBytes) / (dt * 1024)
							}
						}
					}
					d.prevSamples[cSummary.ID] = containerPrevSample{
						rxBytes:    st.NetworkRxBytes,
						txBytes:    st.NetworkTxBytes,
						readBytes:  uint64(st.BlockReadMB * 1024 * 1024),
						writeBytes: uint64(st.BlockWriteMB * 1024 * 1024),
						timestamp:  now,
					}
					d.prevMu.Unlock()
				}
			}

			mu.Lock()
			statuses = append(statuses, st)
			if d.storage != nil {
				_ = d.storage.SaveContainer(&st)
			}
			mu.Unlock()
		}(c, status)
	}

	wg.Wait()

	if d.storage != nil && len(activeIDs) > 0 {
		_ = d.storage.PruneStaleContainers(d.nodeID, activeIDs)
	}

	return statuses, nil
}

// InspectContainer gets details on a specific container.
func (d *DockerCollector) InspectContainer(ctx context.Context, containerID string) (*dockerContainerInspect, error) {
	url := fmt.Sprintf("%s/containers/%s/json", d.baseURL(), containerID)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}

	resp, err := d.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("inspect returned %d", resp.StatusCode)
	}

	var inspect dockerContainerInspect
	if err := json.NewDecoder(resp.Body).Decode(&inspect); err != nil {
		return nil, err
	}

	return &inspect, nil
}

// RestartContainer restarts a container via Docker API.
func (d *DockerCollector) RestartContainer(ctx context.Context, containerID string, timeoutSeconds int) error {
	if timeoutSeconds <= 0 {
		timeoutSeconds = 10
	}
	url := fmt.Sprintf("%s/containers/%s/restart?t=%d", d.baseURL(), containerID, timeoutSeconds)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, nil)
	if err != nil {
		return err
	}

	resp, err := d.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusNoContent {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("docker restart failed (%d): %s", resp.StatusCode, string(body))
	}

	return nil
}

// StopContainer stops a container.
func (d *DockerCollector) StopContainer(ctx context.Context, containerID string, timeoutSeconds int) error {
	if timeoutSeconds <= 0 {
		timeoutSeconds = 10
	}
	url := fmt.Sprintf("%s/containers/%s/stop?t=%d", d.baseURL(), containerID, timeoutSeconds)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, nil)
	if err != nil {
		return err
	}

	resp, err := d.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusNoContent && resp.StatusCode != http.StatusNotModified {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("docker stop failed (%d): %s", resp.StatusCode, string(body))
	}

	return nil
}

// StartContainer starts a stopped container.
func (d *DockerCollector) StartContainer(ctx context.Context, containerID string) error {
	url := fmt.Sprintf("%s/containers/%s/start", d.baseURL(), containerID)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, nil)
	if err != nil {
		return err
	}

	resp, err := d.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusNoContent && resp.StatusCode != http.StatusNotModified {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("docker start failed (%d): %s", resp.StatusCode, string(body))
	}

	return nil
}

// FetchRecentLogs streams the latest stdout/stderr logs from a container.
func (d *DockerCollector) FetchRecentLogs(ctx context.Context, containerID string, tailLines string) (string, error) {
	if tailLines == "" {
		tailLines = "100"
	}
	url := fmt.Sprintf("%s/containers/%s/logs?stdout=1&stderr=1&tail=%s&timestamps=1", d.baseURL(), containerID, tailLines)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return "", err
	}

	resp, err := d.httpClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}

	// Clean binary multiplexed header bytes if present (8-byte header per frame in Docker logs)
	clean := cleanDockerLogFrames(body)
	return clean, nil
}

func cleanDockerLogFrames(raw []byte) string {
	if len(raw) == 0 {
		return ""
	}
	var sb strings.Builder
	idx := 0
	for idx < len(raw) {
		if idx+8 <= len(raw) && (raw[idx] == 1 || raw[idx] == 2 || raw[idx] == 0) && raw[idx+1] == 0 && raw[idx+2] == 0 && raw[idx+3] == 0 {
			// 8-byte multiplex header detected: [STREAM_TYPE, 0, 0, 0, SIZE_B1, SIZE_B2, SIZE_B3, SIZE_B4]
			frameSize := int(uint32(raw[idx+4])<<24 | uint32(raw[idx+5])<<16 | uint32(raw[idx+6])<<8 | uint32(raw[idx+7]))
			idx += 8
			if idx+frameSize <= len(raw) {
				sb.Write(raw[idx : idx+frameSize])
				idx += frameSize
			} else {
				sb.Write(raw[idx:])
				break
			}
		} else {
			sb.WriteByte(raw[idx])
			idx++
		}
	}
	return strings.TrimSpace(sb.String())
}

// FetchContainerStats retrieves raw cgroup CPU, Memory, and IO stats from Docker daemon.
func (d *DockerCollector) FetchContainerStats(ctx context.Context, containerID string) (*dockerContainerStats, error) {
	url := fmt.Sprintf("%s/containers/%s/stats?stream=0&one-shot=1", d.baseURL(), containerID)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}

	resp, err := d.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("stats endpoint returned %d", resp.StatusCode)
	}

	var stats dockerContainerStats
	if err := json.NewDecoder(resp.Body).Decode(&stats); err != nil {
		return nil, err
	}
	return &stats, nil
}

type dockerContainerStats struct {
	CPUStats struct {
		CPUUsage struct {
			TotalUsage  uint64   `json:"total_usage"`
			PercpuUsage []uint64 `json:"percpu_usage"`
		} `json:"cpu_usage"`
		SystemCPUUsage uint64 `json:"system_cpu_usage"`
		OnlineCPUs     int    `json:"online_cpus"`
	} `json:"cpu_stats"`
	PreCPUStats struct {
		CPUUsage struct {
			TotalUsage uint64 `json:"total_usage"`
		} `json:"cpu_usage"`
		SystemCPUUsage uint64 `json:"system_cpu_usage"`
	} `json:"precpu_stats"`
	MemoryStats struct {
		Usage uint64            `json:"usage"`
		Limit uint64            `json:"limit"`
		Stats map[string]uint64 `json:"stats"`
	} `json:"memory_stats"`
	Networks map[string]struct {
		RxBytes uint64 `json:"rx_bytes"`
		TxBytes uint64 `json:"tx_bytes"`
	} `json:"networks"`
	BlkioStats struct {
		IOServiceBytesRecursive []struct {
			Op    string `json:"op"`
			Value uint64 `json:"value"`
		} `json:"io_service_bytes_recursive"`
	} `json:"blkio_stats"`
}
