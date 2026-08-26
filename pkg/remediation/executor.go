package remediation

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/WilliamAxelC/Ophanim/pkg/collector"
	"github.com/WilliamAxelC/Ophanim/pkg/config"
	"github.com/WilliamAxelC/Ophanim/pkg/hub"
	"github.com/WilliamAxelC/Ophanim/pkg/storage"
	"github.com/WilliamAxelC/Ophanim/pkg/types"
)

// Executor manages guardrailed remediation actions, rate limits, and post-fix verification.
type Executor struct {
	config       config.ThresholdsConfig
	storage      *storage.Storage
	hub          *hub.Hub
	localDocker  *collector.DockerCollector
	actionCounts map[string][]time.Time // targetID -> timestamps of recent executions
	mu           sync.Mutex
}

// NewExecutor creates a new remediation executor.
func NewExecutor(cfg config.ThresholdsConfig, store *storage.Storage, h *hub.Hub, localDocker *collector.DockerCollector) *Executor {
	return &Executor{
		config:       cfg,
		storage:      store,
		hub:          h,
		localDocker:  localDocker,
		actionCounts: make(map[string][]time.Time),
	}
}

// ExecuteAction executes a structured action with rate-limiting and audit logging.
func (e *Executor) ExecuteAction(ctx context.Context, req *types.ActionRequest, executedBy string) (*types.ActionResponse, error) {
	e.mu.Lock()
	defer e.mu.Unlock()

	// 1. Rate Limiting Check (Max N actions per hour per target)
	maxPerHour := e.config.AutoHealMaxPerHour
	if maxPerHour <= 0 {
		maxPerHour = 2
	}

	now := time.Now()
	history := e.actionCounts[req.TargetID]
	var recent []time.Time
	for _, t := range history {
		if now.Sub(t) < time.Hour {
			recent = append(recent, t)
		}
	}
	if len(recent) >= maxPerHour && req.AutoExecute {
		resp := &types.ActionResponse{
			ActionID:     req.ID,
			Success:      false,
			ErrorMessage: fmt.Sprintf("rate limit exceeded: max %d restarts per hour reached for %s", maxPerHour, req.TargetName),
			ExecutedBy:   executedBy,
			ExecutedAt:   now,
		}
		_ = e.storage.RecordAuditLog(req, resp)
		return resp, fmt.Errorf("rate limit exceeded for target %s", req.TargetName)
	}

	recent = append(recent, now)
	e.actionCounts[req.TargetID] = recent

	// 2. Dispatch Action
	resp := &types.ActionResponse{
		ActionID:   req.ID,
		ExecutedBy: executedBy,
		ExecutedAt: now,
	}

	var execErr error

	// If remote edge node, dispatch via WebSocket Hub
	if req.TargetNode != "" && req.TargetNode != "local" && req.TargetNode != "local-lxc" {
		if e.hub != nil {
			hubResp, err := e.hub.DispatchAction(req, 15*time.Second)
			if err != nil {
				execErr = err
			} else {
				resp = hubResp
			}
		} else {
			execErr = fmt.Errorf("hub is not configured to dispatch to remote node '%s'", req.TargetNode)
		}
	} else {
		// Local action execution
		if e.localDocker != nil {
			switch req.ActionType {
			case types.ActionContainerRestart:
				execErr = e.localDocker.RestartContainer(ctx, req.TargetID, 10)
				resp.Output = fmt.Sprintf("Restarted container %s on local host", req.TargetName)
			case types.ActionContainerStop:
				execErr = e.localDocker.StopContainer(ctx, req.TargetID, 10)
				resp.Output = fmt.Sprintf("Stopped container %s on local host", req.TargetName)
			case types.ActionContainerStart:
				execErr = e.localDocker.StartContainer(ctx, req.TargetID)
				resp.Output = fmt.Sprintf("Started container %s on local host", req.TargetName)
			default:
				execErr = fmt.Errorf("unsupported action type: %s", req.ActionType)
			}
		} else {
			execErr = fmt.Errorf("local docker daemon client unavailable")
		}
	}

	if execErr != nil {
		resp.Success = false
		resp.ErrorMessage = execErr.Error()
	} else {
		resp.Success = true
	}

	// 3. Record Audit Log
	if e.storage != nil {
		_ = e.storage.RecordAuditLog(req, resp)
	}

	return resp, nil
}
