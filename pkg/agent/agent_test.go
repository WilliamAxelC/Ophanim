package agent

import (
	"context"
	"path/filepath"
	"testing"
	"time"

	"github.com/WilliamAxelC/Ophanim/pkg/config"
	"github.com/WilliamAxelC/Ophanim/pkg/storage"
	"github.com/WilliamAxelC/Ophanim/pkg/types"
)

func TestRCAEngineFallback(t *testing.T) {
	tmpDir := t.TempDir()
	store, _ := storage.NewStorage(filepath.Join(tmpDir, "rca_test.db"), 100)
	defer store.Close()

	// LLM disabled
	llm := NewLLMClient(config.LLMConfig{Enabled: false})
	rca := NewRCAEngine(llm, store)

	inc := &types.Incident{
		ID:              "inc-test-01",
		Title:           "Postgres Out of Memory",
		Description:     "Container exited with code 137",
		Severity:        types.SeverityCritical,
		Status:          types.IncidentOpen,
		ImpactedTargets: []string{"postgres"},
		CreatedAt:       time.Now(),
		UpdatedAt:       time.Now(),
	}

	res, err := rca.AnalyzeIncident(context.Background(), inc, "fatal: out of memory (oom-killer)")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if res.Summary == "" || res.ActionType != "CONTAINER_RESTART" {
		t.Errorf("unexpected fallback result: %+v", res)
	}
}
