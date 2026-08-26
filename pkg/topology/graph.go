package topology

import (
	"strconv"
	"strings"
	"sync"

	"github.com/WilliamAxelC/Ophanim/pkg/types"
)

// GraphEngine maintains the in-memory dependency and topology graph of the homelab.
type GraphEngine struct {
	mu           sync.RWMutex
	nodes        map[string]types.TopologyNode
	edges        map[string]types.TopologyEdge
	dependencies map[string][]string // target -> list of dependencies it requires
	dependents   map[string][]string // dependency -> list of targets that depend on it
}

// NewGraphEngine creates a new topology graph manager.
func NewGraphEngine() *GraphEngine {
	return &GraphEngine{
		nodes:        make(map[string]types.TopologyNode),
		edges:        make(map[string]types.TopologyEdge),
		dependencies: make(map[string][]string),
		dependents:   make(map[string][]string),
	}
}

// UpdateFromTelemetry rebuilds the topology graph from current containers, devices, and probes.
func (g *GraphEngine) UpdateFromTelemetry(
	devices []types.DeviceNode,
	containers []types.ContainerStatus,
	probes []types.SyntheticProbeResult,
) {
	g.mu.Lock()
	defer g.mu.Unlock()

	g.nodes = make(map[string]types.TopologyNode)
	g.edges = make(map[string]types.TopologyEdge)
	g.dependencies = make(map[string][]string)
	g.dependents = make(map[string][]string)

	// 1. Add Host Nodes
	for _, dev := range devices {
		status := "healthy"
		if dev.Status == "offline" {
			status = "critical"
		}
		g.nodes[dev.ID] = types.TopologyNode{
			ID:     dev.ID,
			Label:  dev.Name,
			Type:   "host",
			Status: status,
			Metadata: map[string]string{
				"ip":    dev.IPAddress,
				"agent": dev.AgentType,
			},
		}
	}

	// 2. Add Container Nodes & Runs-On Edges
	for _, c := range containers {
		cStatus := "healthy"
		if c.State == "exited" || c.Health == "unhealthy" {
			cStatus = "critical"
		} else if c.State == "restarting" || c.Health == "starting" {
			cStatus = "warning"
		}

		cType := "container"
		nameLower := strings.ToLower(c.Name)
		imageLower := strings.ToLower(c.Image)

		if strings.Contains(nameLower, "postgres") || strings.Contains(nameLower, "mysql") || strings.Contains(nameLower, "redis") || strings.Contains(nameLower, "mariadb") || strings.Contains(nameLower, "mongo") || strings.Contains(imageLower, "postgres") || strings.Contains(imageLower, "redis") || strings.Contains(imageLower, "mongo") || strings.Contains(imageLower, "mysql") {
			cType = "database"
		} else if strings.Contains(nameLower, "traefik") || strings.Contains(nameLower, "nginx") || strings.Contains(nameLower, "caddy") || strings.Contains(nameLower, "cloudflared") || strings.Contains(nameLower, "proxy") || strings.Contains(nameLower, "warp") || strings.Contains(nameLower, "tunnel") || strings.Contains(imageLower, "cloudflared") || strings.Contains(imageLower, "proxy") || strings.Contains(imageLower, "envoy") || strings.Contains(imageLower, "haproxy") {
			cType = "proxy"
		}

		stackName := c.Stack
		if stackName == "" {
			stackName = "standalone"
		}

		g.nodes[c.Name] = types.TopologyNode{
			ID:       c.Name,
			Label:    c.Name,
			Type:     cType,
			Status:   cStatus,
			ParentID: c.NodeID,
			Metadata: map[string]string{
				"image":        c.Image,
				"state":        c.State,
				"status":       c.Status,
				"stack":        stackName,
				"restartCount": strconv.Itoa(c.RestartCount),
				"node":         c.NodeID,
			},
		}

		// Edge: Container runs on Host
		if c.NodeID != "" {
			edgeID := c.Name + "_runs_on_" + c.NodeID
			g.edges[edgeID] = types.TopologyEdge{
				ID:       edgeID,
				SourceID: c.Name,
				TargetID: c.NodeID,
				Type:     "runs_on",
				Status:   cStatus,
			}
		}

		// Parse `ophanim.depends_on` and Docker Compose `com.docker.compose.depends_on` labels
		var depTargets []string
		if depLabel, ok := c.Labels["ophanim.depends_on"]; ok && depLabel != "" {
			for _, d := range strings.Split(depLabel, ",") {
				if trimmed := strings.TrimSpace(d); trimmed != "" {
					depTargets = append(depTargets, trimmed)
				}
			}
		}
		if composeDeps, ok := c.Labels["com.docker.compose.depends_on"]; ok && composeDeps != "" {
			for _, entry := range strings.Split(composeDeps, ",") {
				parts := strings.Split(entry, ":")
				if len(parts) > 0 && strings.TrimSpace(parts[0]) != "" {
					depTargets = append(depTargets, strings.TrimSpace(parts[0]))
				}
			}
		}

		for _, dep := range depTargets {
			g.dependencies[c.Name] = append(g.dependencies[c.Name], dep)
			g.dependents[dep] = append(g.dependents[dep], c.Name)

			edgeID := c.Name + "_depends_on_" + dep
			g.edges[edgeID] = types.TopologyEdge{
				ID:       edgeID,
				SourceID: c.Name,
				TargetID: dep,
				Type:     "depends_on",
				Status:   "healthy",
			}
		}
	}

	// 3. Add Synthetic Probe Endpoints
	for _, p := range probes {
		pStatus := "healthy"
		if !p.Success {
			pStatus = "critical"
		} else if p.SSLExpiryDays > 0 && p.SSLExpiryDays < 14 {
			pStatus = "warning"
		}

		g.nodes[p.TargetID] = types.TopologyNode{
			ID:     p.TargetID,
			Label:  p.TargetName,
			Type:   "service",
			Status: pStatus,
			Metadata: map[string]string{
				"url":       p.TargetURL,
				"probeType": p.ProbeType,
			},
		}
	}
}

// FindDownstreamDependents returns all services affected when a root target fails.
func (g *GraphEngine) FindDownstreamDependents(rootTarget string) []string {
	g.mu.RLock()
	defer g.mu.RUnlock()

	visited := make(map[string]bool)
	var queue []string
	queue = append(queue, g.dependents[rootTarget]...)

	for len(queue) > 0 {
		curr := queue[0]
		queue = queue[1:]

		if !visited[curr] {
			visited[curr] = true
			queue = append(queue, g.dependents[curr]...)
		}
	}

	var results []string
	for k := range visited {
		results = append(results, k)
	}
	return results
}

// FindRootCauseCandidate checks if any upstream dependency of a failing target is also failing.
func (g *GraphEngine) FindRootCauseCandidate(failedTarget string, isTargetFailing func(string) bool) string {
	g.mu.RLock()
	defer g.mu.RUnlock()

	deps := g.dependencies[failedTarget]
	for _, dep := range deps {
		if isTargetFailing(dep) {
			// Found an upstream failing dependency; recursively search for its root
			return g.FindRootCauseCandidate(dep, isTargetFailing)
		}
	}
	return failedTarget
}

// ExportTopology returns nodes and edges suitable for frontend visualization.
func (g *GraphEngine) ExportTopology() ([]types.TopologyNode, []types.TopologyEdge) {
	g.mu.RLock()
	defer g.mu.RUnlock()

	nodes := make([]types.TopologyNode, 0, len(g.nodes))
	for _, n := range g.nodes {
		nodes = append(nodes, n)
	}

	edges := make([]types.TopologyEdge, 0, len(g.edges))
	for _, e := range g.edges {
		edges = append(edges, e)
	}

	return nodes, edges
}
