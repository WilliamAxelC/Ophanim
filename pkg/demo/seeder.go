package demo

import (
	"log"
	"time"

	"github.com/WilliamAxelC/Ophanim/pkg/storage"
	"github.com/WilliamAxelC/Ophanim/pkg/types"
)

// SeedDemoData populates the database with realistic homelab demonstration data.
func SeedDemoData(store *storage.Storage) error {
	log.Println("[Ophanim Demo] Seeding demonstration data...")

	now := time.Now()

	// --- 3 Devices ---
	devices := []types.DeviceNode{
		{
			ID:        "pve-node-01",
			Name:      "Proxmox PVE Node",
			IPAddress: "10.20.20.1",
			AgentType: "proxmox",
			Status:    "online",
			LastSeen:  now,
			CreatedAt: now.Add(-45 * 24 * time.Hour),
		},
		{
			ID:        "docker-lxc-01",
			Name:      "Docker LXC (10.20.20.11)",
			IPAddress: "10.20.20.11",
			AgentType: "ophanim-monitor",
			Status:    "online",
			LastSeen:  now,
			CreatedAt: now.Add(-30 * 24 * time.Hour),
		},
		{
			ID:        "dev-vm-01",
			Name:      "Dev VM (10.20.20.121)",
			IPAddress: "10.20.20.121",
			AgentType: "ophanim-monitor",
			Status:    "online",
			LastSeen:  now,
			CreatedAt: now.Add(-14 * 24 * time.Hour),
		},
	}
	for i := range devices {
		if err := store.EnrollDevice(&devices[i]); err != nil {
			log.Printf("[Ophanim Demo] Warning: failed to seed device %s: %v", devices[i].Name, err)
		}
	}

	// --- 8 Containers ---
	containers := []types.ContainerStatus{
		{
			ID:            "cnt-traefik-01",
			Name:          "traefik",
			Image:         "traefik:v3.1",
			State:         "running",
			Status:        "Up 12 days",
			Health:        "healthy",
			CPUPercent:    1.2,
			MemoryUsageMB: 128.0,
			MemoryLimitMB: 512.0,
			MemoryPercent: 25.0,
			RestartCount:  0,
			NodeID:        "docker-lxc-01",
			Labels:        map[string]string{"ophanim.group": "proxy"},
			Created:       now.Add(-12 * 24 * time.Hour),
			LastSeen:      now,
		},
		{
			ID:            "cnt-postgres-01",
			Name:          "postgres",
			Image:         "postgres:16-alpine",
			State:         "exited",
			Status:        "Exited (137) 23 minutes ago",
			Health:        "unhealthy",
			ExitCode:      137,
			CPUPercent:    0.0,
			MemoryUsageMB: 0.0,
			MemoryLimitMB: 2048.0,
			MemoryPercent: 0.0,
			RestartCount:  3,
			NodeID:        "docker-lxc-01",
			Labels:        map[string]string{"ophanim.group": "database"},
			Created:       now.Add(-30 * 24 * time.Hour),
			LastSeen:      now,
		},
		{
			ID:            "cnt-redis-01",
			Name:          "redis",
			Image:         "redis:7-alpine",
			State:         "running",
			Status:        "Up 30 days",
			Health:        "healthy",
			CPUPercent:    0.3,
			MemoryUsageMB: 64.0,
			MemoryLimitMB: 256.0,
			MemoryPercent: 25.0,
			RestartCount:  0,
			NodeID:        "docker-lxc-01",
			Labels:        map[string]string{"ophanim.group": "cache"},
			Created:       now.Add(-30 * 24 * time.Hour),
			LastSeen:      now,
		},
		{
			ID:            "cnt-nextcloud-01",
			Name:          "nextcloud",
			Image:         "nextcloud:29-apache",
			State:         "running",
			Status:        "Up 8 days",
			Health:        "healthy",
			CPUPercent:    12.4,
			MemoryUsageMB: 1884.16,
			MemoryLimitMB: 2048.0,
			MemoryPercent: 94.0,
			RestartCount:  1,
			NodeID:        "docker-lxc-01",
			Labels:        map[string]string{"ophanim.group": "cloud"},
			Created:       now.Add(-20 * 24 * time.Hour),
			LastSeen:      now,
		},
		{
			ID:            "cnt-jellyfin-01",
			Name:          "jellyfin",
			Image:         "jellyfin/jellyfin:latest",
			State:         "running",
			Status:        "Up 15 days",
			Health:        "healthy",
			CPUPercent:    3.7,
			MemoryUsageMB: 512.0,
			MemoryLimitMB: 2048.0,
			MemoryPercent: 25.0,
			RestartCount:  0,
			NodeID:        "docker-lxc-01",
			Labels:        map[string]string{"ophanim.group": "media"},
			Created:       now.Add(-15 * 24 * time.Hour),
			LastSeen:      now,
		},
		{
			ID:            "cnt-gitea-01",
			Name:          "gitea",
			Image:         "gitea/gitea:1.22",
			State:         "running",
			Status:        "Up 25 days",
			Health:        "healthy",
			CPUPercent:    0.8,
			MemoryUsageMB: 196.0,
			MemoryLimitMB: 512.0,
			MemoryPercent: 38.3,
			RestartCount:  0,
			NodeID:        "docker-lxc-01",
			Labels:        map[string]string{"ophanim.group": "devops"},
			Created:       now.Add(-25 * 24 * time.Hour),
			LastSeen:      now,
		},
		{
			ID:            "cnt-prometheus-01",
			Name:          "prometheus",
			Image:         "prom/prometheus:v2.53.0",
			State:         "running",
			Status:        "Up 10 days",
			Health:        "healthy",
			CPUPercent:    2.1,
			MemoryUsageMB: 384.0,
			MemoryLimitMB: 1024.0,
			MemoryPercent: 37.5,
			RestartCount:  0,
			NodeID:        "docker-lxc-01",
			Labels:        map[string]string{"ophanim.group": "monitoring"},
			Created:       now.Add(-10 * 24 * time.Hour),
			LastSeen:      now,
		},
		{
			ID:            "cnt-grafana-01",
			Name:          "grafana",
			Image:         "grafana/grafana:11.1.0",
			State:         "running",
			Status:        "Up 10 days",
			Health:        "healthy",
			CPUPercent:    1.5,
			MemoryUsageMB: 256.0,
			MemoryLimitMB: 512.0,
			MemoryPercent: 50.0,
			RestartCount:  0,
			NodeID:        "docker-lxc-01",
			Labels:        map[string]string{"ophanim.group": "monitoring"},
			Created:       now.Add(-10 * 24 * time.Hour),
			LastSeen:      now,
		},
	}
	for i := range containers {
		if err := store.SaveContainer(&containers[i]); err != nil {
			log.Printf("[Ophanim Demo] Warning: failed to seed container %s: %v", containers[i].Name, err)
		}
	}

	// --- 2 Active Incidents ---
	incidents := []types.Incident{
		{
			ID:          "inc-demo-001",
			Title:       "Postgres OOM Kill — Container Exited with Code 137",
			Description: "The postgres container on Docker LXC (10.20.20.11) has exited with code 137, indicating an out-of-memory kill by the Linux kernel OOM killer.",
			Severity:    types.SeverityCritical,
			Status:      types.IncidentOpen,
			RootCauseSummary: "Memory pressure on Docker LXC host caused PostgreSQL to exceed its 2GB memory limit. " +
				"The Linux OOM killer terminated the process (signal 9). Historical pattern shows this occurs " +
				"during nightly backup cron jobs when WAL replay spikes memory usage.",
			ImpactedTargets: []string{"postgres", "nextcloud", "gitea"},
			ProposedAction: &types.ActionRequest{
				ID:          "act-demo-001",
				IncidentID:  "inc-demo-001",
				ActionType:  types.ActionContainerRestart,
				TargetNode:  "docker-lxc-01",
				TargetID:    "cnt-postgres-01",
				TargetName:  "postgres",
				Reason:      "Restart OOM-killed PostgreSQL container to restore database services",
				Whitelisted: true,
				AutoExecute: false,
				RequestedAt: now,
			},
			CreatedAt: now.Add(-23 * time.Minute),
			UpdatedAt: now.Add(-5 * time.Minute),
		},
		{
			ID:               "inc-demo-002",
			Title:            "Nextcloud High Memory Usage — 94% RAM Utilization",
			Description:      "The nextcloud container is consuming 94% of its allocated memory (1.88GB of 2GB limit), risking an OOM kill similar to the recent postgres incident.",
			Severity:         types.SeverityWarning,
			Status:           types.IncidentTriaging,
			RootCauseSummary: "Nextcloud PHP-FPM worker pool is consuming 1.88GB of 2GB limit. File preview generation for recently uploaded media library is the primary driver.",
			ImpactedTargets:  []string{"nextcloud"},
			CreatedAt:        now.Add(-12 * time.Minute),
			UpdatedAt:        now.Add(-2 * time.Minute),
		},
	}
	for i := range incidents {
		if err := store.CreateIncident(&incidents[i]); err != nil {
			log.Printf("[Ophanim Demo] Warning: failed to seed incident %s: %v", incidents[i].Title, err)
		}
	}

	// --- 1 Host Metrics Snapshot ---
	metrics := &types.HostMetrics{
		NodeID:          "pve-node-01",
		Hostname:        "pve-node-01",
		OS:              "linux",
		UptimeSeconds:   45 * 24 * 60 * 60, // 45 days
		CPUUsagePercent: 62.0,
		CPUCores:        8,
		MemoryTotalMB:   32768,
		MemoryUsedMB:    24248, // ~74%
		MemoryPercent:   74.0,
		DiskTotalGB:     500.0,
		DiskUsedGB:      235.0,
		DiskPercent:     47.0,
		LoadAvg1:        4.2,
		LoadAvg5:        3.8,
		LoadAvg15:       3.1,
		NetBytesSent:    1024 * 1024 * 512,
		NetBytesRecv:    1024 * 1024 * 1024,
		Timestamp:       now,
	}
	if err := store.SaveHostMetrics(metrics); err != nil {
		log.Printf("[Ophanim Demo] Warning: failed to seed host metrics: %v", err)
	}

	log.Println("[Ophanim Demo] Demo data seeded successfully (3 devices, 8 containers, 2 incidents, 1 metrics snapshot)")
	return nil
}
