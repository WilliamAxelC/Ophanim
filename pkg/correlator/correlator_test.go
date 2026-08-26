package correlator

import (
	"path/filepath"
	"testing"
	"time"

	"github.com/WilliamAxelC/Ophanim/pkg/config"
	"github.com/WilliamAxelC/Ophanim/pkg/storage"
	"github.com/WilliamAxelC/Ophanim/pkg/topology"
	"github.com/WilliamAxelC/Ophanim/pkg/types"
)

func TestCorrelatorIncidentCreation(t *testing.T) {
	tmpDir := t.TempDir()
	store, _ := storage.NewStorage(filepath.Join(tmpDir, "test.db"), 100)
	defer store.Close()

	graph := topology.NewGraphEngine()

	incChan := make(chan *types.Incident, 1)
	corr := NewCorrelator(
		config.ThresholdsConfig{
			DiskCriticalPercent: 90.0,
			AntiFlapWindow:      1 * time.Minute,
		},
		store,
		graph,
		func(inc *types.Incident) {
			incChan <- inc
		},
	)

	// Simulate OOMKilled container
	containers := []types.ContainerStatus{
		{
			ID:       "cnt-1",
			Name:     "postgres",
			NodeID:   "node-1",
			State:    "exited",
			ExitCode: 137,
			LastSeen: time.Now(),
		},
	}

	corr.ProcessContainers(containers)

	select {
	case capturedIncident := <-incChan:
		if capturedIncident.Severity != types.SeverityCritical {
			t.Errorf("expected critical severity, got %s", capturedIncident.Severity)
		}
		if capturedIncident.ProposedAction == nil || capturedIncident.ProposedAction.ActionType != types.ActionContainerRestart {
			t.Errorf("expected auto restart proposed action, got %+v", capturedIncident.ProposedAction)
		}
	case <-time.After(1 * time.Second):
		t.Fatalf("timeout waiting for incident to be generated")
	}
}
