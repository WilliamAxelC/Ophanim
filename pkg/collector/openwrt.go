package collector

import (
	"bufio"
	"context"
	"fmt"
	"io"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/WilliamAxelC/Ophanim/pkg/types"
)

// OpenWRTCollector scrapes and parses OpenWRT router telemetry via prometheus-node-exporter-lua or ubus HTTP.
type OpenWRTCollector struct {
	id         string
	name       string
	endpoint   string
	httpClient *http.Client

	mu           sync.Mutex
	lastPoll     time.Time
	lastNetRx    uint64
	lastNetTx    uint64
	lastDevRx    map[string]uint64
	lastDevTx    map[string]uint64
	lastCPUTotal float64
	lastCPUIdle  float64
}

// NewOpenWRTCollector initializes an OpenWRT router telemetry collector.
func NewOpenWRTCollector(id, name, endpoint string) *OpenWRTCollector {
	cleanEndpoint := strings.TrimSpace(endpoint)
	if !strings.HasPrefix(cleanEndpoint, "http://") && !strings.HasPrefix(cleanEndpoint, "https://") {
		cleanEndpoint = "http://" + cleanEndpoint
	}
	if !strings.Contains(cleanEndpoint, ":") || strings.HasSuffix(cleanEndpoint, "http://") || strings.HasSuffix(cleanEndpoint, "https://") {
		cleanEndpoint = cleanEndpoint + ":9100/metrics"
	} else if !strings.Contains(cleanEndpoint, "/metrics") && !strings.Contains(cleanEndpoint, "/api") {
		if !strings.HasSuffix(cleanEndpoint, ":9100") {
			cleanEndpoint = cleanEndpoint + ":9100/metrics"
		} else {
			cleanEndpoint = cleanEndpoint + "/metrics"
		}
	}

	return &OpenWRTCollector{
		id:        id,
		name:      name,
		endpoint:  cleanEndpoint,
		lastDevRx: make(map[string]uint64),
		lastDevTx: make(map[string]uint64),
		httpClient: &http.Client{
			Timeout: 5 * time.Second,
		},
	}
}

type promSample struct {
	Name   string
	Labels map[string]string
	Value  float64
}

// Collect polls the OpenWRT router metrics endpoint.
func (o *OpenWRTCollector) Collect(ctx context.Context) (*types.HostMetrics, []types.ContainerStatus, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, o.endpoint, nil)
	if err != nil {
		return nil, nil, fmt.Errorf("invalid OpenWRT request: %w", err)
	}

	resp, err := o.httpClient.Do(req)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to reach OpenWRT router at %s: %w", o.endpoint, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, nil, fmt.Errorf("OpenWRT router returned HTTP %d", resp.StatusCode)
	}

	samples := parsePromSamples(resp.Body)
	now := time.Now().UTC()

	o.mu.Lock()
	defer o.mu.Unlock()

	var elapsedSec float64 = 2.0
	if !o.lastPoll.IsZero() {
		diff := now.Sub(o.lastPoll).Seconds()
		if diff > 0.1 {
			elapsedSec = diff
		}
	}
	o.lastPoll = now

	// Aggregate metrics lookup & per-interface maps
	metrics := make(map[string]float64)
	devRxBytes := make(map[string]uint64)
	devTxBytes := make(map[string]uint64)
	devIsUp := make(map[string]bool)

	for _, s := range samples {
		if strings.HasSuffix(s.Name, "_total") {
			metrics[s.Name] += s.Value
		} else {
			metrics[s.Name] = s.Value
		}

		devName := s.Labels["device"]
		if devName == "" {
			devName = s.Labels["interface"]
		}

		if devName != "" {
			switch s.Name {
			case "node_network_receive_bytes_total":
				devRxBytes[devName] = uint64(s.Value)
			case "node_network_transmit_bytes_total":
				devTxBytes[devName] = uint64(s.Value)
			case "node_network_up":
				devIsUp[devName] = (s.Value > 0)
			}
		}
	}

	// 1. Memory metrics
	memTotalBytes := metrics["node_memory_MemTotal_bytes"]
	memAvailBytes := metrics["node_memory_MemAvailable_bytes"]
	if memAvailBytes == 0 {
		memFree := metrics["node_memory_MemFree_bytes"]
		memBuffers := metrics["node_memory_Buffers_bytes"]
		memCached := metrics["node_memory_Cached_bytes"]
		memAvailBytes = memFree + memBuffers + memCached
	}

	memTotalMB := uint64(memTotalBytes / (1024 * 1024))
	if memTotalMB == 0 {
		memTotalMB = 256 // fallback typical router RAM
	}
	memUsedBytes := memTotalBytes - memAvailBytes
	if memUsedBytes < 0 {
		memUsedBytes = 0
	}
	memUsedMB := uint64(memUsedBytes / (1024 * 1024))
	memPercent := 0.0
	if memTotalBytes > 0 {
		memPercent = (float64(memUsedBytes) / float64(memTotalBytes)) * 100.0
	}

	// 2. Storage / Flash root filesystem
	diskTotalBytes := metrics["node_filesystem_size_bytes"]
	diskFreeBytes := metrics["node_filesystem_free_bytes"]
	diskTotalGB := diskTotalBytes / (1024 * 1024 * 1024)
	diskUsedGB := (diskTotalBytes - diskFreeBytes) / (1024 * 1024 * 1024)
	diskPercent := 0.0
	if diskTotalBytes > 0 {
		diskPercent = ((diskTotalBytes - diskFreeBytes) / diskTotalBytes) * 100.0
	}

	// 3. Network Interfaces collection & per-interface differential rates
	var networkInterfaces []types.NetworkInterface
	var totalActiveRxBytes, totalActiveTxBytes uint64
	var totalActiveRxRate, totalActiveTxRate float64

	var sortedDevs []string
	for dev := range devRxBytes {
		if dev != "lo" {
			sortedDevs = append(sortedDevs, dev)
		}
	}
	sort.Strings(sortedDevs)

	for _, dev := range sortedDevs {
		rxB := devRxBytes[dev]
		txB := devTxBytes[dev]

		var rxRate, txRate float64
		if prevRx, ok := o.lastDevRx[dev]; ok && rxB >= prevRx {
			rxRate = float64(rxB-prevRx) / (1024.0 * elapsedSec)
		}
		if prevTx, ok := o.lastDevTx[dev]; ok && txB >= prevTx {
			txRate = float64(txB-prevTx) / (1024.0 * elapsedSec)
		}
		o.lastDevRx[dev] = rxB
		o.lastDevTx[dev] = txB

		isUp := true
		if upVal, exists := devIsUp[dev]; exists {
			isUp = upVal
		} else if rxB == 0 && txB == 0 {
			isUp = false
		}

		// Classify OpenWRT interface role
		devLower := strings.ToLower(dev)
		ifType := "Physical Port"
		if strings.Contains(devLower, "wan") || strings.Contains(devLower, "pppoe") || devLower == "eth1" {
			ifType = "WAN (Internet)"
		} else if strings.Contains(devLower, "br-lan") || devLower == "lan" {
			ifType = "LAN (Bridge)"
		} else if strings.Contains(devLower, "wlan") || strings.Contains(devLower, "phy") || strings.Contains(devLower, "ath") || strings.Contains(devLower, "ra") {
			ifType = "Wireless (Wi-Fi)"
		} else if strings.Contains(devLower, "tailscale") || strings.Contains(devLower, "wg") || strings.Contains(devLower, "tun") {
			ifType = "VPN / Tunnel"
		} else if strings.Contains(devLower, "docker") || strings.Contains(devLower, "veth") || strings.Contains(devLower, "br-") {
			ifType = "Container / Bridge"
		}

		networkInterfaces = append(networkInterfaces, types.NetworkInterface{
			Name:       dev,
			RxBytes:    rxB,
			TxBytes:    txB,
			RxRateKBps: rxRate,
			TxRateKBps: txRate,
			IsUp:       isUp,
			Type:       ifType,
		})

		// Aggregate active external rates (prioritize WAN if available, or sum physical/bridge)
		if ifType == "WAN (Internet)" || (ifType == "Physical Port" && !strings.Contains(devLower, "veth")) {
			totalActiveRxBytes += rxB
			totalActiveTxBytes += txB
			totalActiveRxRate += rxRate
			totalActiveTxRate += txRate
		}
	}

	// Fallback if no specific WAN was summed
	if totalActiveRxBytes == 0 && len(networkInterfaces) > 0 {
		for _, iface := range networkInterfaces {
			totalActiveRxBytes += iface.RxBytes
			totalActiveTxBytes += iface.TxBytes
			totalActiveRxRate += iface.RxRateKBps
			totalActiveTxRate += iface.TxRateKBps
		}
	}

	if totalActiveRxBytes == 0 {
		totalActiveRxBytes = uint64(metrics["node_network_receive_bytes_total"])
		totalActiveTxBytes = uint64(metrics["node_network_transmit_bytes_total"])
		if o.lastNetRx > 0 && totalActiveRxBytes >= o.lastNetRx {
			totalActiveRxRate = float64(totalActiveRxBytes-o.lastNetRx) / (1024.0 * elapsedSec)
		}
		if o.lastNetTx > 0 && totalActiveTxBytes >= o.lastNetTx {
			totalActiveTxRate = float64(totalActiveTxBytes-o.lastNetTx) / (1024.0 * elapsedSec)
		}
	}
	o.lastNetRx = totalActiveRxBytes
	o.lastNetTx = totalActiveTxBytes

	// 4. Load Averages & CPU
	load1 := metrics["node_load1"]
	load5 := metrics["node_load5"]
	load15 := metrics["node_load15"]

	cpuUsage := load1 * 25.0 // fallback estimation from load
	if cpuUsage > 100.0 {
		cpuUsage = 95.0
	}
	if cpuUsage < 1.0 {
		cpuUsage = 2.5
	}

	// 5. Uptime
	bootTime := metrics["node_boot_time_seconds"]
	uptimeSeconds := uint64(0)
	if bootTime > 0 {
		uptimeSeconds = uint64(time.Now().Unix() - int64(bootTime))
	}

	hostMetrics := &types.HostMetrics{
		NodeID:            o.id,
		Hostname:          o.name,
		OS:                "OpenWRT Linux (Gateway)",
		UptimeSeconds:     uptimeSeconds,
		CPUUsagePercent:   cpuUsage,
		CPUCores:          2,
		CPUTemperature:    metrics["node_thermal_zone_temp"] / 1000.0,
		MemoryTotalMB:     memTotalMB,
		MemoryUsedMB:      memUsedMB,
		MemoryPercent:     memPercent,
		DiskTotalGB:       diskTotalGB,
		DiskUsedGB:        diskUsedGB,
		DiskPercent:       diskPercent,
		LoadAvg1:          load1,
		LoadAvg5:          load5,
		LoadAvg15:         load15,
		NetBytesRecv:      totalActiveRxBytes,
		NetBytesSent:      totalActiveTxBytes,
		NetRxRateKBps:     totalActiveRxRate,
		NetTxRateKBps:     totalActiveTxRate,
		NetworkInterfaces: networkInterfaces,
		Timestamp:         now,
	}

	// 6. Generate virtual service containers representing OpenWRT router daemons
	routerServices := []types.ContainerStatus{
		{
			ID:                o.id + "-wan",
			Name:              "openwrt-wan-gateway",
			Image:             "openwrt/netifd:wan",
			State:             "running",
			Status:            "Up (Active Gateway)",
			Health:            "healthy",
			CPUPercent:        cpuUsage * 0.4,
			MemoryUsageMB:     float64(memUsedMB) * 0.3,
			NetworkRxRateKBps: totalActiveRxRate,
			NetworkTxRateKBps: totalActiveTxRate,
			Stack:             "network-gateway",
			NodeID:            o.id,
			Created:           now.Add(-time.Duration(uptimeSeconds) * time.Second),
			LastSeen:          now,
		},
		{
			ID:                o.id + "-dnsmasq",
			Name:              "openwrt-dnsmasq-dhcp",
			Image:             "openwrt/dnsmasq:v2",
			State:             "running",
			Status:            "Up (DNS & DHCP Server)",
			Health:            "healthy",
			CPUPercent:        0.5,
			MemoryUsageMB:     8.0,
			Stack:             "core-services",
			NodeID:            o.id,
			Created:           now.Add(-time.Duration(uptimeSeconds) * time.Second),
			LastSeen:          now,
		},
		{
			ID:                o.id + "-firewall",
			Name:              "openwrt-nftables-firewall",
			Image:             "openwrt/fw4:nftables",
			State:             "running",
			Status:            "Up (NAT & State Filter)",
			Health:            "healthy",
			CPUPercent:        cpuUsage * 0.2,
			MemoryUsageMB:     12.0,
			Stack:             "security",
			NodeID:            o.id,
			Created:           now.Add(-time.Duration(uptimeSeconds) * time.Second),
			LastSeen:          now,
		},
	}

	return hostMetrics, routerServices, nil
}

func parsePromSamples(r io.Reader) []promSample {
	var samples []promSample
	scanner := bufio.NewScanner(r)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}

		var name string
		labels := make(map[string]string)
		var valStr string

		if idx := strings.Index(line, "{"); idx != -1 {
			name = strings.TrimSpace(line[:idx])
			closeIdx := strings.LastIndex(line, "}")
			if closeIdx != -1 {
				labelContent := line[idx+1 : closeIdx]
				pairs := strings.Split(labelContent, ",")
				for _, p := range pairs {
					kv := strings.SplitN(strings.TrimSpace(p), "=", 2)
					if len(kv) == 2 {
						k := strings.TrimSpace(kv[0])
						v := strings.Trim(strings.TrimSpace(kv[1]), "\"")
						labels[k] = v
					}
				}
				if closeIdx+1 < len(line) {
					rest := strings.TrimSpace(line[closeIdx+1:])
					parts := strings.Fields(rest)
					if len(parts) > 0 {
						valStr = parts[0]
					}
				}
			}
		} else {
			parts := strings.Fields(line)
			if len(parts) >= 2 {
				name = parts[0]
				valStr = parts[1]
			}
		}

		if name != "" && valStr != "" {
			if val, err := strconv.ParseFloat(valStr, 64); err == nil {
				samples = append(samples, promSample{
					Name:   name,
					Labels: labels,
					Value:  val,
				})
			}
		}
	}
	return samples
}
