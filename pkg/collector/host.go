package collector

import (
	"context"
	"os"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/WilliamAxelC/Ophanim/pkg/types"
	"github.com/shirou/gopsutil/v4/cpu"
	"github.com/shirou/gopsutil/v4/disk"
	"github.com/shirou/gopsutil/v4/host"
	"github.com/shirou/gopsutil/v4/load"
	"github.com/shirou/gopsutil/v4/mem"
	"github.com/shirou/gopsutil/v4/net"
)

// HostCollector gathers in-process userspace system metrics directly from the host.
type HostCollector struct {
	nodeID            string
	mu                sync.Mutex
	prevDiskRead      uint64
	prevDiskWrite     uint64
	prevNetSent       uint64
	prevNetRecv       uint64
	prevPerNicRx      map[string]uint64
	prevPerNicTx      map[string]uint64
	prevSampleTime    time.Time
	cachedDiskTotal   float64
	cachedDiskUsed    float64
	cachedDiskPercent float64
	lastDiskUsageTime time.Time
}

// NewHostCollector creates a collector for the given node.
func NewHostCollector(nodeID string) *HostCollector {
	if nodeID == "" {
		nodeID = "local"
	}
	return &HostCollector{
		nodeID:       nodeID,
		prevPerNicRx: make(map[string]uint64),
		prevPerNicTx: make(map[string]uint64),
	}
}

func readLinuxCPUTemp() float64 {
	if b, err := os.ReadFile("/sys/class/thermal/thermal_zone0/temp"); err == nil {
		if milli, err := strconv.ParseFloat(strings.TrimSpace(string(b)), 64); err == nil && milli > 0 {
			return milli / 1000.0
		}
	}
	return 0.0
}

func isDiskPartition(dev string) bool {
	// Ignore virtual loop, ram, zram devices
	if strings.HasPrefix(dev, "loop") || strings.HasPrefix(dev, "ram") || strings.HasPrefix(dev, "zram") {
		return true
	}
	// nvme0n1p1 -> partition, nvme0n1 -> parent drive
	if strings.HasPrefix(dev, "nvme") {
		return strings.Contains(dev, "p")
	}
	// sda1, vda2, hda3 -> partition
	if strings.HasPrefix(dev, "sd") || strings.HasPrefix(dev, "vd") || strings.HasPrefix(dev, "hd") || strings.HasPrefix(dev, "xvd") {
		for _, c := range dev {
			if c >= '0' && c <= '9' {
				return true
			}
		}
	}
	// dm-0, dm-1 are device mapper virtual volumes
	if strings.HasPrefix(dev, "dm-") {
		return true
	}
	return false
}

// Collect gathers real-time host metrics without external daemons.
func (h *HostCollector) Collect(ctx context.Context) (*types.HostMetrics, error) {
	hostname, _ := os.Hostname()
	hostInfo, _ := host.InfoWithContext(ctx)

	var uptime uint64
	osName := "linux"
	if hostInfo != nil {
		uptime = hostInfo.Uptime
		osName = hostInfo.OS + " " + hostInfo.PlatformVersion
	}

	// CPU: real-time per-core breakdown sampling
	perCorePercentages, _ := cpu.PercentWithContext(ctx, 100*time.Millisecond, true)
	var cpuPercent float64
	if len(perCorePercentages) > 0 {
		var sum float64
		for _, p := range perCorePercentages {
			sum += p
		}
		cpuPercent = sum / float64(len(perCorePercentages))
	} else {
		// Fallback
		totalPercentages, _ := cpu.PercentWithContext(ctx, 50*time.Millisecond, false)
		if len(totalPercentages) > 0 {
			cpuPercent = totalPercentages[0]
		}
	}

	// Thermal reading from sysfs if available on Linux
	cpuTemp := readLinuxCPUTemp()

	// Memory (RAM) & Swap
	vmStat, _ := mem.VirtualMemoryWithContext(ctx)
	swapStat, _ := mem.SwapMemoryWithContext(ctx)

	var memTotal, memUsed uint64
	var memPercent float64
	if vmStat != nil {
		memTotal = vmStat.Total / (1024 * 1024)
		memUsed = vmStat.Used / (1024 * 1024)
		memPercent = vmStat.UsedPercent
	}
	var swapTotal, swapUsed uint64
	var swapPercent float64
	if swapStat != nil {
		swapTotal = swapStat.Total / (1024 * 1024)
		swapUsed = swapStat.Used / (1024 * 1024)
		swapPercent = swapStat.UsedPercent
	}

	// Root Disk Capacity (Cached with 5-minute low-frequency refresh) & Disk IO (1Hz In-Memory)
	h.mu.Lock()
	now := time.Now()
	if h.lastDiskUsageTime.IsZero() || now.Sub(h.lastDiskUsageTime) > 5*time.Minute {
		if diskStat, err := disk.UsageWithContext(ctx, "/"); err == nil && diskStat != nil {
			h.cachedDiskTotal = float64(diskStat.Total) / (1024 * 1024 * 1024)
			h.cachedDiskUsed = float64(diskStat.Used) / (1024 * 1024 * 1024)
			h.cachedDiskPercent = diskStat.UsedPercent
			h.lastDiskUsageTime = now
		}
	}
	diskTotal := h.cachedDiskTotal
	diskUsed := h.cachedDiskUsed
	diskPercent := h.cachedDiskPercent
	h.mu.Unlock()

	diskIO, _ := disk.IOCountersWithContext(ctx)
	var totalReadBytes, totalWriteBytes uint64
	var foundParent bool
	for name, d := range diskIO {
		if !isDiskPartition(name) {
			foundParent = true
			totalReadBytes += d.ReadBytes
			totalWriteBytes += d.WriteBytes
		}
	}
	// Fallback if system only exposes partition devices
	if !foundParent {
		for name, d := range diskIO {
			if !strings.HasPrefix(name, "loop") && !strings.HasPrefix(name, "ram") && !strings.HasPrefix(name, "zram") {
				totalReadBytes += d.ReadBytes
				totalWriteBytes += d.WriteBytes
			}
		}
	}

	// Load Average
	loadStat, _ := load.AvgWithContext(ctx)
	var load1, load5, load15 float64
	if loadStat != nil {
		load1 = loadStat.Load1
		load5 = loadStat.Load5
		load15 = loadStat.Load15
	}

	// Network IO (aggregate & per-nic)
	netIO, _ := net.IOCountersWithContext(ctx, false)
	var bytesSent, bytesRecv uint64
	if len(netIO) > 0 {
		bytesSent = netIO[0].BytesSent
		bytesRecv = netIO[0].BytesRecv
	}

	perNicIO, _ := net.IOCountersWithContext(ctx, true)
	sort.Slice(perNicIO, func(i, j int) bool {
		return perNicIO[i].Name < perNicIO[j].Name
	})

	// Compute real-time rate differentials (KB/s)
	now = time.Now()
	h.mu.Lock()
	var diskReadKBps, diskWriteKBps, netRxKBps, netTxKBps float64
	var networkInterfaces []types.NetworkInterface

	var elapsed float64 = 2.0
	if !h.prevSampleTime.IsZero() {
		diff := now.Sub(h.prevSampleTime).Seconds()
		if diff > 0.1 {
			elapsed = diff
		}
	}

	if !h.prevSampleTime.IsZero() && elapsed > 0.1 {
		if totalReadBytes >= h.prevDiskRead {
			diskReadKBps = float64(totalReadBytes-h.prevDiskRead) / (1024 * elapsed)
		}
		if totalWriteBytes >= h.prevDiskWrite {
			diskWriteKBps = float64(totalWriteBytes-h.prevDiskWrite) / (1024 * elapsed)
		}
		if bytesRecv >= h.prevNetRecv {
			netRxKBps = float64(bytesRecv-h.prevNetRecv) / (1024 * elapsed)
		}
		if bytesSent >= h.prevNetSent {
			netTxKBps = float64(bytesSent-h.prevNetSent) / (1024 * elapsed)
		}
	}

	for _, nic := range perNicIO {
		if nic.Name == "lo" {
			continue
		}
		var ifRxRate, ifTxRate float64
		if prevRx, ok := h.prevPerNicRx[nic.Name]; ok && nic.BytesRecv >= prevRx {
			ifRxRate = float64(nic.BytesRecv-prevRx) / (1024 * elapsed)
		}
		if prevTx, ok := h.prevPerNicTx[nic.Name]; ok && nic.BytesSent >= prevTx {
			ifTxRate = float64(nic.BytesSent-prevTx) / (1024 * elapsed)
		}
		h.prevPerNicRx[nic.Name] = nic.BytesRecv
		h.prevPerNicTx[nic.Name] = nic.BytesSent

		nameLower := strings.ToLower(nic.Name)
		ifType := "Physical Eth"
		if strings.HasPrefix(nameLower, "docker") || strings.HasPrefix(nameLower, "veth") || strings.HasPrefix(nameLower, "br-") {
			ifType = "Container Bridge"
		} else if strings.HasPrefix(nameLower, "tailscale") || strings.HasPrefix(nameLower, "wg") || strings.HasPrefix(nameLower, "tun") {
			ifType = "VPN / Tunnel"
		} else if strings.HasPrefix(nameLower, "wl") || strings.HasPrefix(nameLower, "wlan") {
			ifType = "Wireless (Wi-Fi)"
		} else if strings.HasPrefix(nameLower, "vmbr") || strings.HasPrefix(nameLower, "bond") {
			ifType = "Hypervisor Bridge"
		}

		networkInterfaces = append(networkInterfaces, types.NetworkInterface{
			Name:       nic.Name,
			RxBytes:    nic.BytesRecv,
			TxBytes:    nic.BytesSent,
			RxRateKBps: ifRxRate,
			TxRateKBps: ifTxRate,
			IsUp:       true,
			Type:       ifType,
		})
	}

	h.prevDiskRead = totalReadBytes
	h.prevDiskWrite = totalWriteBytes
	h.prevNetSent = bytesSent
	h.prevNetRecv = bytesRecv
	h.prevSampleTime = now
	h.mu.Unlock()

	return &types.HostMetrics{
		NodeID:            h.nodeID,
		Hostname:          hostname,
		OS:                osName,
		UptimeSeconds:     uptime,
		CPUUsagePercent:   cpuPercent,
		CPUCores:          len(perCorePercentages),
		CPUCoresUsage:     perCorePercentages,
		CPUTemperature:    cpuTemp,
		MemoryTotalMB:     memTotal,
		MemoryUsedMB:      memUsed,
		MemoryPercent:     memPercent,
		SwapTotalMB:       swapTotal,
		SwapUsedMB:        swapUsed,
		SwapPercent:       swapPercent,
		DiskTotalGB:       diskTotal,
		DiskUsedGB:        diskUsed,
		DiskPercent:       diskPercent,
		DiskReadKBps:      diskReadKBps,
		DiskWriteKBps:     diskWriteKBps,
		LoadAvg1:          load1,
		LoadAvg5:          load5,
		LoadAvg15:         load15,
		NetBytesSent:      bytesSent,
		NetBytesRecv:      bytesRecv,
		NetRxRateKBps:     netRxKBps,
		NetTxRateKBps:     netTxKBps,
		NetworkInterfaces: networkInterfaces,
		Timestamp:         now,
	}, nil
}
