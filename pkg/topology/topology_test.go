package topology

import (
	"testing"
	"time"

	"github.com/WilliamAxelC/Ophanim/pkg/types"
)

func TestTopologyGraph(t *testing.T) {
	g := NewGraphEngine()

	devices := []types.DeviceNode{
		{ID: "node-1", Name: "homelab-lxc", Status: "online"},
	}

	containers := []types.ContainerStatus{
		{
			ID:       "cnt-pg",
			Name:     "postgres",
			NodeID:   "node-1",
			State:    "running",
			Health:   "healthy",
			LastSeen: time.Now(),
		},
		{
			ID:       "cnt-app",
			Name:     "nextcloud",
			NodeID:   "node-1",
			State:    "running",
			Health:   "healthy",
			Labels:   map[string]string{"ophanim.depends_on": "postgres"},
			LastSeen: time.Now(),
		},
		{
			ID:       "cnt-vault",
			Name:     "vaultwarden",
			NodeID:   "node-1",
			State:    "running",
			Health:   "healthy",
			Labels:   map[string]string{"ophanim.depends_on": "postgres"},
			LastSeen: time.Now(),
		},
	}

	g.UpdateFromTelemetry(devices, containers, nil)

	// Test downstream dependents when postgres fails
	dependents := g.FindDownstreamDependents("postgres")
	if len(dependents) != 2 {
		t.Errorf("expected 2 dependents (nextcloud, vaultwarden), got %d: %+v", len(dependents), dependents)
	}

	// Test root cause candidate finding
	failingMap := map[string]bool{
		"postgres":  true,
		"nextcloud": true,
	}
	root := g.FindRootCauseCandidate("nextcloud", func(name string) bool {
		return failingMap[name]
	})
	if root != "postgres" {
		t.Errorf("expected root cause to be postgres, got '%s'", root)
	}

	// Test export topology
	nodes, edges := g.ExportTopology()
	if len(nodes) < 4 { // 1 host + 3 containers
		t.Errorf("expected at least 4 nodes, got %d", len(nodes))
	}
	if len(edges) < 5 { // 3 runs_on + 2 depends_on
		t.Errorf("expected at least 5 edges, got %d", len(edges))
	}
}
