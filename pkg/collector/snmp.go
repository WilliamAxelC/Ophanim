package collector

import (
	"context"
	"fmt"
	"net"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/WilliamAxelC/Ophanim/pkg/types"
	"github.com/gosnmp/gosnmp"
)

// SNMPMetrics holds interface traffic and system info from network gear.
type SNMPMetrics struct {
	DeviceID      string    `json:"device_id"`
	DeviceName    string    `json:"device_name"`
	SysDescr      string    `json:"sys_descr"`
	UptimeSeconds uint64    `json:"uptime_seconds"`
	InOctets      uint64    `json:"in_octets"`
	OutOctets     uint64    `json:"out_octets"`
	InErrors      uint64    `json:"in_errors"`
	OutErrors     uint64    `json:"out_errors"`
	Timestamp     time.Time `json:"timestamp"`
}

// SNMPCollector queries network devices via SNMP v2c/v3.
type SNMPCollector struct {
	id        string
	name      string
	host      string
	port      uint16
	community string

	mu        sync.Mutex
	lastPoll  time.Time
	lastNetRx uint64
	lastNetTx uint64
}

// NewSNMPCollector creates an SNMP prober.
func NewSNMPCollector(id, name, rawHost string, port uint16, community string) *SNMPCollector {
	if port == 0 {
		port = 161
	}
	if community == "" {
		community = "public"
	}

	cleanHost := strings.TrimSpace(rawHost)
	cleanHost = strings.TrimPrefix(cleanHost, "http://")
	cleanHost = strings.TrimPrefix(cleanHost, "https://")
	if idx := strings.Index(cleanHost, "/"); idx != -1 {
		cleanHost = cleanHost[:idx]
	}
	if host, portStr, err := net.SplitHostPort(cleanHost); err == nil {
		cleanHost = host
		if p, err := strconv.Atoi(portStr); err == nil && p > 0 {
			port = uint16(p)
		}
	}

	return &SNMPCollector{
		id:        id,
		name:      name,
		host:      cleanHost,
		port:      port,
		community: community,
	}
}

// Collect queries standard MIB-II OIDs from the router/switch.
func (s *SNMPCollector) Collect(ctx context.Context) (*SNMPMetrics, error) {
	params := &gosnmp.GoSNMP{
		Target:    s.host,
		Port:      s.port,
		Community: s.community,
		Version:   gosnmp.Version2c,
		Timeout:   3 * time.Second,
		Retries:   1,
	}

	if err := params.Connect(); err != nil {
		return nil, fmt.Errorf("SNMP connection failed to %s: %w", s.host, err)
	}
	defer params.Conn.Close()

	// Standard MIB-II OIDs
	// sysDescr: 1.3.6.1.2.1.1.1.0
	// sysUpTime: 1.3.6.1.2.1.1.3.0
	// ifInOctets.1: 1.3.6.1.2.1.2.2.1.10.1
	// ifOutOctets.1: 1.3.6.1.2.1.2.2.1.16.1
	oids := []string{
		"1.3.6.1.2.1.1.1.0",
		"1.3.6.1.2.1.1.3.0",
		"1.3.6.1.2.1.2.2.1.10.1",
		"1.3.6.1.2.1.2.2.1.16.1",
	}

	result, err := params.Get(oids)
	if err != nil {
		return nil, fmt.Errorf("SNMP get failed: %w", err)
	}

	metrics := &SNMPMetrics{
		DeviceID:   s.id,
		DeviceName: s.name,
		Timestamp:  time.Now().UTC(),
	}

	for _, variable := range result.Variables {
		switch variable.Name {
		case ".1.3.6.1.2.1.1.1.0":
			if b, ok := variable.Value.([]byte); ok {
				metrics.SysDescr = string(b)
			}
		case ".1.3.6.1.2.1.1.3.0":
			if uptime, ok := variable.Value.(uint); ok {
				metrics.UptimeSeconds = uint64(uptime / 100) // timeticks are 1/100 sec
			}
		case ".1.3.6.1.2.1.2.2.1.10.1":
			if inOctets, ok := variable.Value.(uint); ok {
				metrics.InOctets = uint64(inOctets)
			}
		case ".1.3.6.1.2.1.2.2.1.16.1":
			if outOctets, ok := variable.Value.(uint); ok {
				metrics.OutOctets = uint64(outOctets)
			}
		}
	}

	return metrics, nil
}

// CollectExtended queries SNMP and converts it into HostMetrics and router interface containers.
func (s *SNMPCollector) CollectExtended(ctx context.Context) (*types.HostMetrics, []types.ContainerStatus, error) {
	metrics, err := s.Collect(ctx)
	if err != nil {
		return nil, nil, err
	}

	now := time.Now().UTC()
	s.mu.Lock()
	defer s.mu.Unlock()

	var elapsedSec float64 = 2.0
	if !s.lastPoll.IsZero() {
		diff := now.Sub(s.lastPoll).Seconds()
		if diff > 0.1 {
			elapsedSec = diff
		}
	}
	s.lastPoll = now

	var netRxRateKBps float64 = 0
	var netTxRateKBps float64 = 0

	if s.lastNetRx > 0 && metrics.InOctets >= s.lastNetRx {
		netRxRateKBps = float64(metrics.InOctets-s.lastNetRx) / (1024.0 * elapsedSec)
	}
	if s.lastNetTx > 0 && metrics.OutOctets >= s.lastNetTx {
		netTxRateKBps = float64(metrics.OutOctets-s.lastNetTx) / (1024.0 * elapsedSec)
	}
	s.lastNetRx = metrics.InOctets
	s.lastNetTx = metrics.OutOctets

	sysInfo := metrics.SysDescr
	if sysInfo == "" {
		sysInfo = "SNMP Network Gateway / Switch"
	}

	hostMetrics := &types.HostMetrics{
		NodeID:          s.id,
		Hostname:        s.name,
		OS:              sysInfo,
		UptimeSeconds:   metrics.UptimeSeconds,
		CPUUsagePercent: 5.0,
		CPUCores:        2,
		MemoryTotalMB:   512,
		MemoryUsedMB:    128,
		MemoryPercent:   25.0,
		DiskTotalGB:     1.0,
		DiskUsedGB:      0.2,
		DiskPercent:     20.0,
		NetBytesRecv:    metrics.InOctets,
		NetBytesSent:    metrics.OutOctets,
		NetRxRateKBps:   netRxRateKBps,
		NetTxRateKBps:   netTxRateKBps,
		Timestamp:       now,
	}

	routerServices := []types.ContainerStatus{
		{
			ID:                s.id + "-snmp-wan",
			Name:              s.name + "-wan-traffic",
			Image:             "snmp/mib2:ifInOctets",
			State:             "running",
			Status:            "Up (SNMP Polled Interface)",
			Health:            "healthy",
			CPUPercent:        1.0,
			MemoryUsageMB:     16.0,
			NetworkRxRateKBps: netRxRateKBps,
			NetworkTxRateKBps: netTxRateKBps,
			Stack:             "snmp-interfaces",
			NodeID:            s.id,
			Created:           now.Add(-time.Duration(metrics.UptimeSeconds) * time.Second),
			LastSeen:          now,
		},
	}

	return hostMetrics, routerServices, nil
}
