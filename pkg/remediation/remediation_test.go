package remediation

import (
	"context"
	"path/filepath"
	"testing"

	"github.com/WilliamAxelC/Ophanim/pkg/config"
	"github.com/WilliamAxelC/Ophanim/pkg/storage"
	"github.com/WilliamAxelC/Ophanim/pkg/types"
)

func TestRemediationRateLimiter(t *testing.T) {
	tmpDir := t.TempDir()
	store, _ := storage.NewStorage(filepath.Join(tmpDir, "rem_test.db"), 100)
	defer store.Close()

	cfg := config.ThresholdsConfig{
		AutoHealMaxPerHour: 2,
	}

	executor := NewExecutor(cfg, store, nil, nil)

	req := &types.ActionRequest{
		ID:          "act-1",
		ActionType:  types.ActionContainerRestart,
		TargetNode:  "local",
		TargetID:    "cnt-rate-test",
		TargetName:  "my-app",
		AutoExecute: true,
	}

	// 1st action (fails because mock local docker is nil, but consumes rate limit slot)
	_, _ = executor.ExecuteAction(context.Background(), req, "test")

	// 2nd action
	_, _ = executor.ExecuteAction(context.Background(), req, "test")

	// 3rd action should be rejected by rate limiter
	resp, err := executor.ExecuteAction(context.Background(), req, "test")
	if err == nil || resp.Success {
		t.Errorf("expected 3rd action to be rate limited, got err: %v, resp: %+v", err, resp)
	}
}
