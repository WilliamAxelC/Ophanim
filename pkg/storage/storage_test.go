package storage

import (
	"path/filepath"
	"testing"
	"time"

	"github.com/WilliamAxelC/Ophanim/pkg/types"
)

func TestStorageLifecycle(t *testing.T) {
	tmpDir := t.TempDir()
	dbPath := filepath.Join(tmpDir, "test_ophanim.db")

	s, err := NewStorage(dbPath, 100)
	if err != nil {
		t.Fatalf("failed to create storage: %v", err)
	}
	defer s.Close()

	// 1. Test Host Metrics
	now := time.Now()
	metric := &types.HostMetrics{
		NodeID:          "node-1",
		Hostname:        "proxmox-lxc",
		OS:              "linux",
		UptimeSeconds:   3600,
		CPUUsagePercent: 25.5,
		CPUCores:        4,
		MemoryTotalMB:   8192,
		MemoryUsedMB:    4096,
		MemoryPercent:   50.0,
		DiskTotalGB:     100.0,
		DiskUsedGB:      45.0,
		DiskPercent:     45.0,
		LoadAvg1:        0.5,
		LoadAvg5:        0.6,
		LoadAvg15:       0.7,
		NetBytesSent:    1024,
		NetBytesRecv:    2048,
		Timestamp:       now,
	}

	if err := s.SaveHostMetrics(metric); err != nil {
		t.Fatalf("failed to save host metrics: %v", err)
	}

	latest, err := s.GetLatestHostMetrics("node-1")
	if err != nil {
		t.Fatalf("failed to get latest host metrics: %v", err)
	}
	if latest.Hostname != "proxmox-lxc" || latest.CPUUsagePercent != 25.5 {
		t.Errorf("host metrics mismatch: got %+v", latest)
	}

	// 2. Test Container Status
	container := &types.ContainerStatus{
		ID:            "cnt-postgres-1",
		NodeID:        "node-1",
		Name:          "postgres",
		Image:         "postgres:16-alpine",
		State:         "running",
		Status:        "Up 2 hours",
		Health:        "healthy",
		CPUPercent:    2.1,
		MemoryUsageMB: 128.5,
		MemoryPercent: 1.5,
		RestartCount:  0,
		Labels:        map[string]string{"ophanim.group": "database"},
		Created:       now,
		LastSeen:      now,
	}

	if err := s.SaveContainer(container); err != nil {
		t.Fatalf("failed to save container: %v", err)
	}

	containers, err := s.ListContainers("node-1")
	if err != nil {
		t.Fatalf("failed to list containers: %v", err)
	}
	if len(containers) != 1 || containers[0].Name != "postgres" {
		t.Errorf("containers list mismatch: got %+v", containers)
	}

	// 3. Test Incidents & Incident RAG Memory
	inc := &types.Incident{
		ID:               "inc-1001",
		Title:            "Postgres OOMKilled",
		Description:      "Postgres exited with 137 due to memory spike",
		Severity:         types.SeverityCritical,
		Status:           types.IncidentOpen,
		RootCauseSummary: "Memory exceeded container limit of 1GB during vacuum",
		ImpactedTargets:  []string{"postgres", "nextcloud"},
		ProposedAction: &types.ActionRequest{
			ID:          "act-1",
			IncidentID:  "inc-1001",
			ActionType:  types.ActionContainerRestart,
			TargetNode:  "node-1",
			TargetID:    "cnt-postgres-1",
			TargetName:  "postgres",
			Reason:      "Restart crashed database",
			Whitelisted: true,
			RequestedAt: now,
		},
		CreatedAt: now,
		UpdatedAt: now,
	}

	if err := s.CreateIncident(inc); err != nil {
		t.Fatalf("failed to create incident: %v", err)
	}

	retrieved, err := s.GetIncident("inc-1001")
	if err != nil {
		t.Fatalf("failed to get incident: %v", err)
	}
	if retrieved.Title != "Postgres OOMKilled" || retrieved.Severity != types.SeverityCritical {
		t.Errorf("incident retrieval mismatch: got %+v", retrieved)
	}

	activeIncidents, err := s.ListActiveIncidents()
	if err != nil || len(activeIncidents) != 1 {
		t.Errorf("expected 1 active incident, got %d", len(activeIncidents))
	}

	// 4. Test Vector RAG Similarity
	vec := IncidentVector{
		IncidentID: "inc-1001",
		Title:      "Postgres OOMKilled",
		Summary:    "Postgres memory leak causing OOM error 137",
		Fix:        "Restart container and increase memory limit",
		Vector:     SimpleTermVector("Postgres memory leak causing OOM error 137 database crashed", 128),
	}
	if err := s.SaveIncidentEmbedding(vec); err != nil {
		t.Fatalf("failed to save incident embedding: %v", err)
	}

	similar, err := s.SearchSimilarIncidents("Postgres crashed with out of memory error", 3)
	if err != nil {
		t.Fatalf("failed to search similar incidents: %v", err)
	}
	if len(similar) == 0 || similar[0].IncidentID != "inc-1001" {
		t.Errorf("expected match with inc-1001, got %+v", similar)
	}

	// 5. Test Ring Buffer
	s.PushLog("postgres", "node-1", "ERROR", "fatal: out of memory (killed)")
	logs := s.GetLogTail("postgres", "node-1", 10)
	if len(logs) != 1 || logs[0].Message != "fatal: out of memory (killed)" {
		t.Errorf("unexpected log tail: %+v", logs)
	}

	// 6. Test Devices
	dev := &types.DeviceNode{
		ID:          "dev-node-2",
		Name:        "Local VM 10.20.20.121",
		IPAddress:   "10.20.20.121",
		AgentType:   "ophanim-monitor",
		Status:      "online",
		EnrollToken: "tok-12345",
		LastSeen:    now,
		CreatedAt:   now,
	}
	if err := s.EnrollDevice(dev); err != nil {
		t.Fatalf("failed to enroll device: %v", err)
	}

	devices, err := s.ListDevices()
	if err != nil || len(devices) != 1 {
		t.Errorf("expected 1 enrolled device, got %d", len(devices))
	}
}
