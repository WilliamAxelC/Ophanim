package correlator

import (
	"fmt"
	"sync"
	"time"

	"github.com/WilliamAxelC/Ophanim/pkg/config"
	"github.com/WilliamAxelC/Ophanim/pkg/storage"
	"github.com/WilliamAxelC/Ophanim/pkg/topology"
	"github.com/WilliamAxelC/Ophanim/pkg/types"
	"github.com/google/uuid"
)

// FailureEvent represents an alert condition detected by a collector or prober.
type FailureEvent struct {
	TargetID    string
	TargetName  string
	NodeID      string
	Type        string // "container_exit", "probe_failure", "high_memory", "high_cpu", "disk_full"
	Severity    types.Severity
	Description string
	Timestamp   time.Time
}

// Correlator handles anomaly evaluation, root-cause correlation, and anti-flapping suppression.
type Correlator struct {
	config       config.ThresholdsConfig
	storage      *storage.Storage
	graph        *topology.GraphEngine
	failingItems map[string]FailureEvent // active failing targets
	flapHistory  map[string][]time.Time  // target -> recent failure timestamps
	mu           sync.RWMutex
	onIncident   func(incident *types.Incident)
}

// NewCorrelator creates an anomaly correlator.
func NewCorrelator(cfg config.ThresholdsConfig, store *storage.Storage, graph *topology.GraphEngine, onIncident func(incident *types.Incident)) *Correlator {
	return &Correlator{
		config:       cfg,
		storage:      store,
		graph:        graph,
		failingItems: make(map[string]FailureEvent),
		flapHistory:  make(map[string][]time.Time),
		onIncident:   onIncident,
	}
}

// ProcessContainers evaluates container states for crashes, OOMs, and unhealthiness.
func (c *Correlator) ProcessContainers(containers []types.ContainerStatus) {
	c.mu.Lock()
	defer c.mu.Unlock()

	for _, cnt := range containers {
		isFailing := false
		var event FailureEvent

		if cnt.State == "exited" && cnt.ExitCode != 0 {
			isFailing = true
			sev := types.SeverityCritical
			desc := fmt.Sprintf("Container '%s' exited with code %d", cnt.Name, cnt.ExitCode)
			if cnt.ExitCode == 137 {
				desc = fmt.Sprintf("Container '%s' terminated by OOMKilled (Exit Code 137)", cnt.Name)
			}
			event = FailureEvent{
				TargetID:    cnt.ID,
				TargetName:  cnt.Name,
				NodeID:      cnt.NodeID,
				Type:        "container_exit",
				Severity:    sev,
				Description: desc,
				Timestamp:   time.Now(),
			}
		} else if cnt.Health == "unhealthy" {
			isFailing = true
			event = FailureEvent{
				TargetID:    cnt.ID,
				TargetName:  cnt.Name,
				NodeID:      cnt.NodeID,
				Type:        "container_unhealthy",
				Severity:    types.SeverityError,
				Description: fmt.Sprintf("Container '%s' failed health checks", cnt.Name),
				Timestamp:   time.Now(),
			}
		}

		if isFailing {
			c.handleFailure(event)
		} else {
			c.resolveTarget(cnt.Name)
		}
	}
}

// ProcessProbeResult evaluates synthetic probe outcomes.
func (c *Correlator) ProcessProbeResult(r *types.SyntheticProbeResult) {
	c.mu.Lock()
	defer c.mu.Unlock()

	if !r.Success {
		c.handleFailure(FailureEvent{
			TargetID:    r.TargetID,
			TargetName:  r.TargetName,
			Type:        "probe_failure",
			Severity:    types.SeverityCritical,
			Description: fmt.Sprintf("Synthetic probe '%s' failed: %s", r.TargetName, r.ErrorMessage),
			Timestamp:   time.Now(),
		})
	} else {
		c.resolveTarget(r.TargetID)
	}
}

// ProcessHostMetrics evaluates host resource thresholds.
func (c *Correlator) ProcessHostMetrics(m *types.HostMetrics) {
	c.mu.Lock()
	defer c.mu.Unlock()

	if m.DiskPercent >= c.config.DiskCriticalPercent {
		c.handleFailure(FailureEvent{
			TargetID:    m.NodeID + "-disk",
			TargetName:  m.Hostname + " Root Storage",
			NodeID:      m.NodeID,
			Type:        "disk_full",
			Severity:    types.SeverityCritical,
			Description: fmt.Sprintf("Host '%s' disk storage is critically full (%.1f%% used)", m.Hostname, m.DiskPercent),
			Timestamp:   time.Now(),
		})
	} else if m.MemoryPercent >= c.config.MemoryCriticalPercent {
		c.handleFailure(FailureEvent{
			TargetID:    m.NodeID + "-memory",
			TargetName:  m.Hostname + " Memory",
			NodeID:      m.NodeID,
			Type:        "high_memory",
			Severity:    types.SeverityWarning,
			Description: fmt.Sprintf("Host '%s' RAM usage is critically high (%.1f%% used)", m.Hostname, m.MemoryPercent),
			Timestamp:   time.Now(),
		})
	}
}

func (c *Correlator) handleFailure(ev FailureEvent) {
	// 1. Anti-Flapping Filter
	now := time.Now()
	history := c.flapHistory[ev.TargetName]
	var recent []time.Time
	window := c.config.AntiFlapWindow
	if window <= 0 {
		window = 5 * time.Minute
	}
	for _, t := range history {
		if now.Sub(t) <= window {
			recent = append(recent, t)
		}
	}
	recent = append(recent, now)
	c.flapHistory[ev.TargetName] = recent

	// 2. Check if already active failure
	if _, exists := c.failingItems[ev.TargetName]; exists {
		return // already tracked, avoid alert storms
	}
	c.failingItems[ev.TargetName] = ev

	// 3. Topology-Aware Root Cause Correlation
	rootCandidate := ev.TargetName
	if c.graph != nil {
		rootCandidate = c.graph.FindRootCauseCandidate(ev.TargetName, func(name string) bool {
			_, failing := c.failingItems[name]
			return failing
		})
	}

	// Downstream dependents impacted
	var impacted []string
	impacted = append(impacted, ev.TargetName)
	if c.graph != nil {
		impacted = append(impacted, c.graph.FindDownstreamDependents(rootCandidate)...)
	}

	// 4. Create Incident
	incidentID := "inc-" + uuid.New().String()[:8]
	title := fmt.Sprintf("[%s] %s", ev.Severity, ev.Description)
	if rootCandidate != ev.TargetName {
		title = fmt.Sprintf("[%s] Cascading Impact on '%s' caused by root dependency '%s'", ev.Severity, ev.TargetName, rootCandidate)
	}

	inc := &types.Incident{
		ID:              incidentID,
		Title:           title,
		Description:     ev.Description,
		Severity:        ev.Severity,
		Status:          types.IncidentOpen,
		ImpactedTargets: impacted,
		CreatedAt:       now,
		UpdatedAt:       now,
	}

	// Check for safe whitelisted auto-action
	if ev.Type == "container_exit" || ev.Type == "container_unhealthy" {
		inc.ProposedAction = &types.ActionRequest{
			ID:          "act-" + uuid.New().String()[:8],
			IncidentID:  incidentID,
			ActionType:  types.ActionContainerRestart,
			TargetNode:  ev.NodeID,
			TargetID:    ev.TargetID,
			TargetName:  ev.TargetName,
			Reason:      "Automated remediation for crashed/unhealthy container",
			Whitelisted: true,
			RequestedAt: now,
		}
	}

	if c.storage != nil {
		_ = c.storage.CreateIncident(inc)
	}

	if c.onIncident != nil {
		go c.onIncident(inc)
	}
}

func (c *Correlator) resolveTarget(targetName string) {
	if _, exists := c.failingItems[targetName]; exists {
		delete(c.failingItems, targetName)
	}
}
