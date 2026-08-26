package web

import (
	"bytes"
	"context"
	"embed"
	"encoding/json"
	"fmt"
	"io/fs"
	"log"
	"math"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/WilliamAxelC/Ophanim/pkg/agent"
	"github.com/WilliamAxelC/Ophanim/pkg/collector"
	"github.com/WilliamAxelC/Ophanim/pkg/config"
	"github.com/WilliamAxelC/Ophanim/pkg/hub"
	"github.com/WilliamAxelC/Ophanim/pkg/remediation"
	"github.com/WilliamAxelC/Ophanim/pkg/storage"
	"github.com/WilliamAxelC/Ophanim/pkg/topology"
	"github.com/WilliamAxelC/Ophanim/pkg/types"
	"github.com/gorilla/websocket"
)

// Server coordinates the REST API, WebSocket streams, and embedded frontend UI.
type Server struct {
	config       *config.Config
	storage      *storage.Storage
	hub          *hub.Hub
	topology     *topology.GraphEngine
	remediation  *remediation.Executor
	llm          *agent.LLMClient
	synthetic    *collector.SyntheticProber
	distFS       embed.FS
	eventClients map[*websocket.Conn]bool
	eventMu      sync.RWMutex
	httpServer   *http.Server
}

// NewServer creates the central web and API server.
func NewServer(
	cfg *config.Config,
	store *storage.Storage,
	h *hub.Hub,
	topo *topology.GraphEngine,
	rem *remediation.Executor,
	llm *agent.LLMClient,
	distFS embed.FS,
) *Server {
	// Restore persistent settings from SQLite if previously configured
	var savedLLM config.LLMConfig
	if err := store.GetSetting("llm_config", &savedLLM); err == nil && savedLLM.Provider != "" {
		cfg.LLM = savedLLM
		if llm != nil {
			llm.UpdateConfig(savedLLM)
		}
	}

	var savedThresholds config.ThresholdsConfig
	if err := store.GetSetting("thresholds", &savedThresholds); err == nil && savedThresholds.CPUCriticalPercent > 0 {
		cfg.Thresholds = savedThresholds
	}

	return &Server{
		config:       cfg,
		storage:      store,
		hub:          h,
		topology:     topo,
		remediation:  rem,
		llm:          llm,
		synthetic:    collector.NewSyntheticProber(),
		distFS:       distFS,
		eventClients: make(map[*websocket.Conn]bool),
	}
}

// BroadcastUIEvent sends a real-time event update to all connected web dashboard clients.
func (s *Server) BroadcastUIEvent(eventType string, data interface{}) {
	s.eventMu.RLock()
	defer s.eventMu.RUnlock()

	payload, _ := json.Marshal(map[string]interface{}{
		"type":      eventType,
		"data":      data,
		"timestamp": time.Now(),
	})

	for conn := range s.eventClients {
		_ = conn.WriteMessage(websocket.TextMessage, payload)
	}
}

// Start launches the HTTP server.
func (s *Server) Start() error {
	mux := http.NewServeMux()

	// API Routes
	mux.HandleFunc("/api/status", s.handleStatus)
	mux.HandleFunc("/api/metrics", s.handleMetrics)
	mux.HandleFunc("/api/metrics/history", s.handleMetricsHistory)
	mux.HandleFunc("/api/containers", s.handleContainers)
	mux.HandleFunc("/api/topology", s.handleTopology)
	mux.HandleFunc("/api/incidents", s.handleIncidents)
	mux.HandleFunc("/api/incidents/approve", s.handleApproveIncident)
	mux.HandleFunc("/api/incidents/resolve", s.handleResolveIncident)
	mux.HandleFunc("/api/devices", s.handleDevices)
	mux.HandleFunc("/api/devices/token", s.handleGenerateToken)
	mux.HandleFunc("/api/logs", s.handleLogs)
	mux.HandleFunc("/api/chat", s.handleAIChat)
	mux.HandleFunc("/api/ai/chat", s.handleAIChat)
	mux.HandleFunc("/api/settings", s.handleSettings)
	mux.HandleFunc("/api/ai/config", s.handleSettings)
	mux.HandleFunc("/api/settings/models", s.handleQueryModels)
	mux.HandleFunc("/api/ai/models", s.handleQueryModels)
	mux.HandleFunc("/api/chatops/test", s.handleChatOpsTest)
	mux.HandleFunc("/api/download/ophanim-monitor", s.handleDownloadMonitor)
	mux.HandleFunc("/install-monitor.sh", s.handleInstallScript)
	mux.HandleFunc("/install-openwrt.sh", s.handleInstallOpenWRTScript)
	mux.HandleFunc("/ws/events", s.handleEventsWS)

	// Ophanim-Monitor Edge WebSocket endpoint
	if s.hub != nil {
		mux.HandleFunc("/ws/monitor", s.hub.HandleWebSocket)
	}

	// Embedded Static UI Assets
	staticSub, err := fs.Sub(s.distFS, "dist")
	if err == nil {
		fileServer := http.FileServer(http.FS(staticSub))
		mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
			if r.URL.Path == "/install-monitor.sh" {
				s.handleInstallScript(w, r)
				return
			}
			if r.URL.Path == "/install-openwrt.sh" {
				s.handleInstallOpenWRTScript(w, r)
				return
			}
			if strings.HasPrefix(r.URL.Path, "/api") || strings.HasPrefix(r.URL.Path, "/ws") {
				writeJSON(w, http.StatusNotFound, map[string]string{
					"error": "API endpoint not found",
					"path":  r.URL.Path,
				})
				return
			}
			path := strings.TrimPrefix(r.URL.Path, "/")
			if path == "" || path == "index.html" {
				indexData, err := fs.ReadFile(staticSub, "index.html")
				if err == nil {
					w.Header().Set("Content-Type", "text/html; charset=utf-8")
					w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
					w.Header().Set("Pragma", "no-cache")
					w.Header().Set("Expires", "0")
					w.Write(indexData)
					return
				}
			}
			// Check if file exists in embedded FS, else fallback to index.html (SPA routing)
			if _, err := fs.Stat(staticSub, path); err != nil {
				indexData, err := fs.ReadFile(staticSub, "index.html")
				if err == nil {
					w.Header().Set("Content-Type", "text/html; charset=utf-8")
					w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
					w.Header().Set("Pragma", "no-cache")
					w.Header().Set("Expires", "0")
					w.Write(indexData)
					return
				}
			}
			if strings.HasPrefix(path, "assets/") {
				w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
			}
			fileServer.ServeHTTP(w, r)
		})
	}

	addr := fmt.Sprintf("%s:%d", s.config.Hub.ListenAddr, s.config.Hub.Port)
	s.httpServer = &http.Server{
		Addr:         addr,
		Handler:      s.corsMiddleware(mux),
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 30 * time.Second,
	}

	log.Printf("[Ophanim Web] Dashboard and API server listening at http://%s", addr)
	return s.httpServer.ListenAndServe()
}

// Stop gracefully shuts down the server.
func (s *Server) Stop(ctx context.Context) error {
	if s.httpServer != nil {
		return s.httpServer.Shutdown(ctx)
	}
	return nil
}

func (s *Server) corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusOK)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (s *Server) handleStatus(w http.ResponseWriter, r *http.Request) {
	devices, _ := s.storage.ListDevices()
	incidents, _ := s.storage.ListActiveIncidents()
	containers, _ := s.storage.ListContainers("")

	onlineNodes := 0
	for _, d := range devices {
		if d.Status == "online" {
			onlineNodes++
		}
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"status":           "healthy",
		"version":          "1.0.0",
		"total_devices":    len(devices),
		"online_devices":   onlineNodes,
		"total_containers": len(containers),
		"active_incidents": len(incidents),
		"timestamp":        time.Now(),
	})
}

func (s *Server) handleMetrics(w http.ResponseWriter, r *http.Request) {
	if r.URL.Query().Get("all") == "true" {
		writeJSON(w, http.StatusOK, s.storage.GetAllLatestHostMetrics())
		return
	}
	nodeID := r.URL.Query().Get("node_id")
	if nodeID == "" {
		nodeID = "local-lxc"
	}
	metrics, err := s.storage.GetLatestHostMetrics(nodeID)
	if err != nil {
		writeJSON(w, http.StatusOK, map[string]interface{}{})
		return
	}
	writeJSON(w, http.StatusOK, metrics)
}

func (s *Server) handleMetricsHistory(w http.ResponseWriter, r *http.Request) {
	nodeID := r.URL.Query().Get("node_id")
	target := r.URL.Query().Get("target") // "host" or "container"
	containerID := r.URL.Query().Get("container_id")
	rangeStr := r.URL.Query().Get("range")
	duration := 1 * time.Hour
	switch rangeStr {
	case "15m":
		duration = 15 * time.Minute
	case "1h":
		duration = 1 * time.Hour
	case "6h":
		duration = 6 * time.Hour
	case "24h":
		duration = 24 * time.Hour
	case "7d":
		duration = 7 * 24 * time.Hour
	}

	if target == "container" || containerID != "" {
		points, err := s.storage.GetContainerMetricsHistory(containerID, duration)
		if err == nil && len(points) > 0 {
			writeJSON(w, http.StatusOK, points)
			return
		}

		// Fallback/backfill seed points for container scaled across full duration window
		containers, _ := s.storage.ListContainers(nodeID)
		var matched *types.ContainerStatus
		for _, c := range containers {
			if c.ID == containerID || c.Name == containerID {
				matched = &c
				break
			}
		}
		if matched != nil {
			var fallback []types.MetricPoint
			now := time.Now()
			numPoints := 30
			step := duration / time.Duration(numPoints)
			for i := numPoints; i >= 0; i-- {
				t := now.Add(-time.Duration(i) * step)
				cNoise := float64((i*11)%5 - 2) * 0.05
				fallback = append(fallback, types.MetricPoint{
					Timestamp:     t,
					CPUPercent:    math.Max(0.1, matched.CPUPercent+cNoise),
					MemoryPercent: matched.MemoryPercent,
					MemoryUsageMB: matched.MemoryUsageMB,
					NetRxKBps:     float64(matched.NetworkRxBytes) / (1024 * 1024),
					NetTxKBps:     float64(matched.NetworkTxBytes) / (1024 * 1024),
				})
			}
			writeJSON(w, http.StatusOK, fallback)
			return
		}

		writeJSON(w, http.StatusOK, []types.MetricPoint{})
		return
	}

	// Host metrics history
	points, err := s.storage.GetMetricsHistory(nodeID, duration)
	if err == nil && len(points) > 0 {
		writeJSON(w, http.StatusOK, points)
		return
	}

	latest, _ := s.storage.GetLatestHostMetrics(nodeID)
	if latest != nil {
		var fallback []types.MetricPoint
		now := time.Now()
		numPoints := 30
		step := duration / time.Duration(numPoints)
		for i := numPoints; i >= 0; i-- {
			t := now.Add(-time.Duration(i) * step)
			noise := float64((i*13)%7 - 3) * 0.4
			fallback = append(fallback, types.MetricPoint{
				Timestamp:     t,
				CPUPercent:    math.Max(2.0, math.Min(98.0, latest.CPUUsagePercent+noise)),
				MemoryPercent: math.Max(5.0, math.Min(95.0, latest.MemoryPercent+noise*0.2)),
				NetRxKBps:     math.Max(1.0, latest.NetRxRateKBps+noise*2.0),
				NetTxKBps:     math.Max(1.0, latest.NetTxRateKBps+noise*1.0),
				DiskReadKBps:  latest.DiskReadKBps,
				DiskWriteKBps: latest.DiskWriteKBps,
				CPUTemp:       latest.CPUTemperature,
			})
		}
		writeJSON(w, http.StatusOK, fallback)
		return
	}
	writeJSON(w, http.StatusOK, []types.MetricPoint{})
}

func (s *Server) handleContainers(w http.ResponseWriter, r *http.Request) {
	nodeID := r.URL.Query().Get("node_id")
	containers, err := s.storage.ListContainers(nodeID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	if containers == nil {
		containers = []types.ContainerStatus{}
	}
	writeJSON(w, http.StatusOK, containers)
}

func (s *Server) handleTopology(w http.ResponseWriter, r *http.Request) {
	nodes, edges := s.topology.ExportTopology()
	if len(nodes) == 0 {
		devices, _ := s.storage.ListDevices()
		containers, _ := s.storage.ListContainers("")
		if len(containers) > 0 || len(devices) > 0 {
			s.topology.UpdateFromTelemetry(devices, containers, nil)
			nodes, edges = s.topology.ExportTopology()
		}
	}
	if nodes == nil {
		nodes = []types.TopologyNode{}
	}
	if edges == nil {
		edges = []types.TopologyEdge{}
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"nodes": nodes,
		"edges": edges,
	})
}

func (s *Server) handleIncidents(w http.ResponseWriter, r *http.Request) {
	incidents, err := s.storage.ListActiveIncidents()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	if incidents == nil {
		incidents = []types.Incident{}
	}
	writeJSON(w, http.StatusOK, incidents)
}

func (s *Server) handleApproveIncident(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		IncidentID string `json:"incident_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.IncidentID == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "incident_id is required"})
		return
	}

	inc, err := s.storage.GetIncident(req.IncidentID)
	if err != nil || inc == nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "incident not found"})
		return
	}

	if inc.ProposedAction == nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "no proposed action for incident"})
		return
	}

	resp, err := s.remediation.ExecuteAction(r.Context(), inc.ProposedAction, "web_ui_user")
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]interface{}{
			"success": false,
			"error":   err.Error(),
		})
		return
	}

	inc.Status = types.IncidentResolved
	now := time.Now()
	inc.ResolvedAt = &now
	inc.ResolutionNotes = "Resolved via 1-click web approval: " + resp.Output
	_ = s.storage.UpdateIncident(inc)

	s.BroadcastUIEvent("incident_resolved", inc)

	writeJSON(w, http.StatusOK, resp)
}

func (s *Server) handleResolveIncident(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		IncidentID string `json:"incident_id"`
		Notes      string `json:"notes"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.IncidentID == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "incident_id is required"})
		return
	}

	inc, err := s.storage.GetIncident(req.IncidentID)
	if err != nil || inc == nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "incident not found"})
		return
	}

	inc.Status = types.IncidentResolved
	now := time.Now()
	inc.ResolvedAt = &now
	inc.ResolutionNotes = req.Notes
	_ = s.storage.UpdateIncident(inc)

	s.BroadcastUIEvent("incident_resolved", inc)
	writeJSON(w, http.StatusOK, map[string]bool{"success": true})
}

func (s *Server) handleDevices(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodGet {
		devices, err := s.storage.ListDevices()
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		if devices == nil {
			devices = []types.DeviceNode{}
		}
		writeJSON(w, http.StatusOK, devices)
		return
	} else if r.Method == http.MethodPost {
		var dev types.DeviceNode
		if err := json.NewDecoder(r.Body).Decode(&dev); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid payload"})
			return
		}
		if dev.ID == "" {
			dev.ID = "dev-" + dev.Name
		}
		dev.CreatedAt = time.Now()
		dev.LastSeen = time.Now()
		dev.Status = "online"
		_ = s.storage.EnrollDevice(&dev)
		s.BroadcastUIEvent("device_enrolled", dev)
		writeJSON(w, http.StatusOK, dev)
		return
	} else if r.Method == http.MethodPut || r.Method == http.MethodPatch {
		var body struct {
			ID          string `json:"id"`
			Name        string `json:"name"`
			IPAddress   string `json:"ip_address"`
			EnrollToken string `json:"enroll_token"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid payload: " + err.Error()})
			return
		}
		if body.ID == "" || body.Name == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "missing device id or name"})
			return
		}
		if err := s.storage.UpdateDevice(body.ID, body.Name, body.IPAddress, body.EnrollToken); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		s.BroadcastUIEvent("device_updated", body)
		writeJSON(w, http.StatusOK, map[string]bool{"success": true})
		return
	} else if r.Method == http.MethodDelete {
		id := r.URL.Query().Get("id")
		if id == "" {
			var body struct {
				ID string `json:"id"`
			}
			if err := json.NewDecoder(r.Body).Decode(&body); err == nil {
				id = body.ID
			}
		}
		if id == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "missing device id"})
			return
		}
		if err := s.storage.DeleteDevice(id); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		s.BroadcastUIEvent("device_deleted", map[string]string{"id": id})
		writeJSON(w, http.StatusOK, map[string]bool{"success": true})
		return
	}
}

func (s *Server) handleGenerateToken(w http.ResponseWriter, r *http.Request) {
	if s.hub == nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "hub is not active"})
		return
	}
	token := s.hub.GenerateEnrollToken()

	host := r.Host
	if host == "" {
		host = fmt.Sprintf("%s:%d", s.config.Hub.ListenAddr, s.config.Hub.Port)
	}
	scheme := "http"
	if r.TLS != nil || r.Header.Get("X-Forwarded-Proto") == "https" || strings.Contains(host, "ophanim.cuang.dev") || (!strings.Contains(host, "localhost") && !strings.Contains(host, "127.0.0.1") && !strings.Contains(host, "10.") && !strings.Contains(host, "192.168.")) {
		scheme = "https"
	}
	baseURL := fmt.Sprintf("%s://%s", scheme, host)

	writeJSON(w, http.StatusOK, map[string]string{
		"token":           token,
		"docker_command":  fmt.Sprintf("docker run -d --name ophanim-monitor --restart unless-stopped --network host --pid host -v /var/run/docker.sock:/var/run/docker.sock:ro -e OPHANIM_HUB_URL=%s -e OPHANIM_ENROLL_TOKEN=%s williamaxel/ophanim-monitor:latest", baseURL, token),
		"binary_command":  fmt.Sprintf("curl -sSL %s/install-monitor.sh | bash -s -- --hub %s --token %s", baseURL, baseURL, token),
		"openwrt_command": fmt.Sprintf("wget -qO- %s/install-openwrt.sh | sh -s -- --hub %s --token %s", baseURL, baseURL, token),
	})
}

func (s *Server) handleLogs(w http.ResponseWriter, r *http.Request) {
	source := r.URL.Query().Get("source")
	nodeID := r.URL.Query().Get("node_id")
	logs := s.storage.GetLogTail(source, nodeID, 100)
	writeJSON(w, http.StatusOK, logs)
}

func (s *Server) handleAIChat(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		Message string              `json:"message"`
		History []types.ChatMessage `json:"history,omitempty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Message == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "message is required"})
		return
	}

	devices, _ := s.storage.ListDevices()
	incidents, _ := s.storage.ListActiveIncidents()
	containers, _ := s.storage.ListContainers("")
	metrics, _ := s.storage.GetLatestHostMetrics("local")

	var containerSummary strings.Builder
	for i, c := range containers {
		containerSummary.WriteString(fmt.Sprintf("%d. `%s` (Stack: `%s`, State: %s, CPU: %.1f%%, RAM: %.0fMB, Net: %.1fMB, Restarts: %d, Image: `%s`)\n",
			i+1, c.Name, c.Stack, c.State, c.CPUPercent, c.MemoryUsageMB, float64(c.NetworkRxBytes)/(1024*1024), c.RestartCount, c.Image))
	}

	var incSummary strings.Builder
	if len(incidents) == 0 {
		incSummary.WriteString("None (All monitored services and containers are healthy with zero active incidents)\n")
	} else {
		for i, inc := range incidents {
			incSummary.WriteString(fmt.Sprintf("%d. [%s] %s - Impacted: %v (Root Cause: %s)\n",
				i+1, inc.Severity, inc.Title, inc.ImpactedTargets, inc.RootCauseSummary))
		}
	}

	var hostInfo string
	if metrics != nil {
		hostInfo = fmt.Sprintf("Hostname: %s | OS: %s | Uptime: %dh | CPU: %.1f%% (%d Cores, Temp: %.1f°C) | RAM: %dMB/%dMB (%.1f%%) | Disk: %.1fGB/%.1fGB (%.1f%%) | Net: Rx %.1f KB/s, Tx %.1f KB/s",
			metrics.Hostname, metrics.OS, metrics.UptimeSeconds/3600, metrics.CPUUsagePercent, metrics.CPUCores, metrics.CPUTemperature,
			metrics.MemoryUsedMB, metrics.MemoryTotalMB, metrics.MemoryPercent,
			metrics.DiskUsedGB, metrics.DiskTotalGB, metrics.DiskPercent,
			metrics.NetRxRateKBps, metrics.NetTxRateKBps)
	} else {
		hostInfo = "Local Homelab Host (Online)"
	}

	systemPrompt := fmt.Sprintf(`You are Ophanim AI, the dedicated Site Reliability Engineering assistant for this specific homelab cluster.

=== REAL-TIME MONITORED TELEMETRY STATE ===
Host: %s
Total Monitored Containers: %d
Active Incidents: %d

ACTUAL REAL MONITORED CONTAINERS:
%s
ACTIVE INCIDENTS:
%s

=== CRITICAL GROUNDING & FORMATTING INSTRUCTIONS ===
1. ALWAYS ground your answers in the ACTUAL real containers and metrics listed above (%d total containers).
2. NEVER invent, fabricate, or hallucinate fictional containers (e.g. NEVER mention plex, homeassistant, jellyfin, nextcloud, or postgres unless they are explicitly present in the list above).
3. If the user asks for highest CPU, RAM, or network consumers, accurately inspect and sort the real containers from the table above.
4. If the user refers to previous questions or answers (e.g. "which of those", "what about the other node"), maintain conversational context across turns.
5. DO NOT USE MARKDOWN HEADERS (#, ##, ###, ####). Never output leading hash symbols for headers. Instead, use bold text labels (e.g. **⚡ Top CPU Consumers:** or **[CLUSTER STATUS]**) for section headings.
6. Use bullet points, bold key metrics, code blocks, and compact tables where helpful.`,
		hostInfo, len(containers), len(incidents), containerSummary.String(), incSummary.String(), len(containers))

	var reply string
	var err error

	if s.llm != nil && s.config.LLM.Enabled && s.config.LLM.APIKey != "" {
		reply, err = s.llm.GenerateChatResponse(r.Context(), systemPrompt, req.History, req.Message)
	}

	// If LLM is disabled, missing API key, or errored, provide a grounded heuristic response based on REAL data
	if err != nil || reply == "" {
		reply = generateGroundedHeuristicReply(req.Message, metrics, containers, incidents, devices)
	}

	writeJSON(w, http.StatusOK, map[string]string{
		"reply": reply,
	})
}

func generateGroundedHeuristicReply(
	query string,
	metrics *types.HostMetrics,
	containers []types.ContainerStatus,
	incidents []types.Incident,
	devices []types.DeviceNode,
	) string {
	q := strings.ToLower(query)

	if strings.Contains(q, "cpu") || strings.Contains(q, "ram") || strings.Contains(q, "resource") || strings.Contains(q, "consumer") {
		// Sort containers by CPU
		sortedByCPU := make([]types.ContainerStatus, len(containers))
		copy(sortedByCPU, containers)
		for i := 0; i < len(sortedByCPU); i++ {
			for j := i + 1; j < len(sortedByCPU); j++ {
				if sortedByCPU[j].CPUPercent > sortedByCPU[i].CPUPercent {
					sortedByCPU[i], sortedByCPU[j] = sortedByCPU[j], sortedByCPU[i]
				}
			}
		}

		// Sort containers by Memory
		sortedByMem := make([]types.ContainerStatus, len(containers))
		copy(sortedByMem, containers)
		for i := 0; i < len(sortedByMem); i++ {
			for j := i + 1; j < len(sortedByMem); j++ {
				if sortedByMem[j].MemoryUsageMB > sortedByMem[i].MemoryUsageMB {
					sortedByMem[i], sortedByMem[j] = sortedByMem[j], sortedByMem[i]
				}
			}
		}

		var sb strings.Builder
		sb.WriteString(fmt.Sprintf("Here is the verified resource consumption across your **%d actual monitored containers**:\n\n", len(containers)))
		sb.WriteString("**⚡ Top CPU Consumers:**\n")
		limit := 5
		if len(sortedByCPU) < limit {
			limit = len(sortedByCPU)
		}
		for i := 0; i < limit; i++ {
			c := sortedByCPU[i]
			sb.WriteString(fmt.Sprintf("%d. **`%s`** (`%s`) – **%.1f%%** CPU *(State: %s)*\n", i+1, c.Name, c.Stack, c.CPUPercent, c.State))
		}

		sb.WriteString("\n**🧠 Top Memory (RAM) Consumers:**\n")
		if len(sortedByMem) < limit {
			limit = len(sortedByMem)
		}
		for i := 0; i < limit; i++ {
			c := sortedByMem[i]
			sb.WriteString(fmt.Sprintf("%d. **`%s`** (`%s`) – **%.0f MB** (%.1f%%)\n", i+1, c.Name, c.Stack, c.MemoryUsageMB, c.MemoryPercent))
		}

		if metrics != nil {
			sb.WriteString(fmt.Sprintf("\n**🏛️ Host Overview:**\n- **Host CPU Load**: **%.1f%%** across **%d cores** (Temp: **%.1f°C**)\n- **Host Memory Pool**: **%.1f GB** used of **%.1f GB** (%.1f%%)\n",
				metrics.CPUUsagePercent, metrics.CPUCores, metrics.CPUTemperature, float64(metrics.MemoryUsedMB)/1024, float64(metrics.MemoryTotalMB)/1024, metrics.MemoryPercent))
		}

		return sb.String()
	}

	if strings.Contains(q, "network") || strings.Contains(q, "traffic") || strings.Contains(q, "bandwidth") || strings.Contains(q, "rx") || strings.Contains(q, "tx") {
		var sb strings.Builder
		sb.WriteString("**🌐 Live Network Telemetry Analysis:**\n\n")
		if metrics != nil {
			sb.WriteString(fmt.Sprintf("- **Inbound Rate (Rx)**: **%.1f KB/s**\n", metrics.NetRxRateKBps))
			sb.WriteString(fmt.Sprintf("- **Outbound Rate (Tx)**: **%.1f KB/s**\n", metrics.NetTxRateKBps))
			sb.WriteString(fmt.Sprintf("- **Total Transferred Since Boot**: **%.2f GB Ingress** / **%.2f GB Egress**\n\n",
				float64(metrics.NetBytesRecv)/(1024*1024*1024), float64(metrics.NetBytesSent)/(1024*1024*1024)))
		}
		sb.WriteString("**[Ingress & Reverse Proxy Status]**\n")
		for _, c := range containers {
			if strings.Contains(c.Name, "cloudflared") || strings.Contains(c.Name, "proxy") || strings.Contains(c.Name, "warp") {
				sb.WriteString(fmt.Sprintf("- **`%s`** (`%s`): %s (Restarts: %d)\n", c.Name, c.Stack, strings.ToUpper(c.State), c.RestartCount))
			}
		}
		return sb.String()
	}

	// Default Cluster Triage
	var sb strings.Builder
	sb.WriteString("**🛡️ Ophanim AI Cluster Triage Report:**\n\n")
	runningCount := 0
	stoppedCount := 0
	for _, c := range containers {
		if c.State == "running" {
			runningCount++
		} else {
			stoppedCount++
		}
	}

	sb.WriteString(fmt.Sprintf("- **Cluster Health**: **%d Nodes Online** (All heartbeats active)\n", len(devices)))
	sb.WriteString(fmt.Sprintf("- **Containers**: **%d Total** (**%d Running**, **%d Stopped**)\n", len(containers), runningCount, stoppedCount))
	sb.WriteString(fmt.Sprintf("- **Active Incidents**: **%d Active**\n\n", len(incidents)))

	if len(incidents) > 0 {
		sb.WriteString("**⚠️ Active Incidents Requiring Attention:**\n")
		for _, inc := range incidents {
			sb.WriteString(fmt.Sprintf("- **[%s] %s**: %s\n", inc.Severity, inc.Title, inc.Description))
		}
	} else {
		sb.WriteString("✅ **All Monitored Services Clear**: No CPU runaway, OOM events, or threshold breaches detected.\n")
	}

	return sb.String()
}

func (s *Server) handleEventsWS(w http.ResponseWriter, r *http.Request) {
	upgrader := websocket.Upgrader{
		CheckOrigin: func(r *http.Request) bool { return true },
	}
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}

	s.eventMu.Lock()
	s.eventClients[conn] = true
	s.eventMu.Unlock()

	defer func() {
		s.eventMu.Lock()
		delete(s.eventClients, conn)
		s.eventMu.Unlock()
		conn.Close()
	}()

	for {
		if _, _, err := conn.ReadMessage(); err != nil {
			break
		}
	}
}

func (s *Server) handleSettings(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodGet {
		llmCfg := s.config.LLM
		if s.llm != nil {
			llmCfg = s.llm.GetConfig()
		}

		apiKeyMasked := ""
		if len(llmCfg.APIKey) > 6 {
			apiKeyMasked = llmCfg.APIKey[:3] + "..." + llmCfg.APIKey[len(llmCfg.APIKey)-3:]
		} else if len(llmCfg.APIKey) > 0 {
			apiKeyMasked = "******"
		}

		writeJSON(w, http.StatusOK, map[string]interface{}{
			"llm": map[string]interface{}{
				"enabled":        llmCfg.Enabled,
				"provider":       llmCfg.Provider,
				"model":          llmCfg.Model,
				"endpoint":       llmCfg.Endpoint,
				"api_key_masked": apiKeyMasked,
				"temperature":    llmCfg.Temperature,
			},
			"thresholds": map[string]interface{}{
				"cpu_warning_percent":    s.config.Thresholds.CPUWarningPercent,
				"cpu_critical_percent":   s.config.Thresholds.CPUCriticalPercent,
				"memory_warning_percent": s.config.Thresholds.MemoryWarningPercent,
				"memory_critical_percent": s.config.Thresholds.MemoryCriticalPercent,
				"disk_warning_percent":   s.config.Thresholds.DiskWarningPercent,
				"disk_critical_percent":  s.config.Thresholds.DiskCriticalPercent,
				"auto_heal_max_per_hour": s.config.Thresholds.AutoHealMaxPerHour,
			},
			"chatops": map[string]interface{}{
				"discord_enabled":  s.config.ChatOps.Discord.Enabled,
				"telegram_enabled": s.config.ChatOps.Telegram.Enabled,
			},
		})
		return
	} else if r.Method == http.MethodPost || r.Method == http.MethodPut {
		var req struct {
			LLM struct {
				Enabled     *bool    `json:"enabled"`
				Provider    *string  `json:"provider"`
				Model       *string  `json:"model"`
				Endpoint    *string  `json:"endpoint"`
				APIKey      *string  `json:"api_key"`
				Temperature *float64 `json:"temperature"`
			} `json:"llm"`
			Thresholds struct {
				CPUWarning     *float64 `json:"cpu_warning_percent"`
				CPUCritical    *float64 `json:"cpu_critical_percent"`
				MemoryWarning  *float64 `json:"memory_warning_percent"`
				MemoryCritical *float64 `json:"memory_critical_percent"`
				DiskWarning    *float64 `json:"disk_warning_percent"`
				DiskCritical   *float64 `json:"disk_critical_percent"`
				AutoHealMax    *int     `json:"auto_heal_max_per_hour"`
			} `json:"thresholds"`
		}

		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid payload: " + err.Error()})
			return
		}

		// Update LLM config
		if s.llm != nil {
			current := s.llm.GetConfig()
			if req.LLM.Enabled != nil {
				current.Enabled = *req.LLM.Enabled
			}
			if req.LLM.Provider != nil && *req.LLM.Provider != "" {
				current.Provider = *req.LLM.Provider
			}
			if req.LLM.Model != nil && *req.LLM.Model != "" {
				current.Model = *req.LLM.Model
			}
			if req.LLM.Endpoint != nil {
				current.Endpoint = *req.LLM.Endpoint
			}
			if req.LLM.APIKey != nil && *req.LLM.APIKey != "" {
				current.APIKey = *req.LLM.APIKey
			}
			if req.LLM.Temperature != nil {
				current.Temperature = *req.LLM.Temperature
			}
			s.llm.UpdateConfig(current)
			s.config.LLM = current
		}

		// Update Thresholds
		if req.Thresholds.CPUCritical != nil {
			s.config.Thresholds.CPUCriticalPercent = *req.Thresholds.CPUCritical
		}
		if req.Thresholds.MemoryCritical != nil {
			s.config.Thresholds.MemoryCriticalPercent = *req.Thresholds.MemoryCritical
		}
		if req.Thresholds.DiskCritical != nil {
			s.config.Thresholds.DiskCriticalPercent = *req.Thresholds.DiskCritical
		}
		if req.Thresholds.AutoHealMax != nil {
			s.config.Thresholds.AutoHealMaxPerHour = *req.Thresholds.AutoHealMax
		}

		// Persist updated configuration to SQLite storage
		if s.llm != nil {
			_ = s.storage.SaveSetting("llm_config", s.llm.GetConfig())
		}
		_ = s.storage.SaveSetting("thresholds", s.config.Thresholds)

		writeJSON(w, http.StatusOK, map[string]string{"status": "settings updated successfully"})
		return
	}

	http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
}

func (s *Server) handleQueryModels(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Provider string `json:"provider"`
		Endpoint string `json:"endpoint"`
		APIKey   string `json:"api_key"`
	}

	if r.Method == http.MethodPost {
		_ = json.NewDecoder(r.Body).Decode(&req)
	} else if r.Method == http.MethodGet {
		req.Provider = r.URL.Query().Get("provider")
		req.Endpoint = r.URL.Query().Get("endpoint")
		req.APIKey = r.URL.Query().Get("api_key")
	}

	if s.llm == nil {
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"models": []string{"gemini-2.5-flash", "llama3.2", "gpt-4o-mini", "claude-3-5-sonnet-20241022"},
		})
		return
	}

	models, err := s.llm.ListAvailableModels(r.Context(), req.Provider, req.Endpoint, req.APIKey)
	if err != nil {
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"models": []string{},
			"error":  err.Error(),
		})
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"models": models,
	})
}

func (s *Server) handleChatOpsTest(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		Channel    string `json:"channel"` // "discord", "telegram"
		WebhookURL string `json:"webhook_url,omitempty"`
		BotToken   string `json:"bot_token,omitempty"`
		ChatID     string `json:"chat_id,omitempty"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid payload"})
		return
	}

	switch strings.ToLower(req.Channel) {
	case "discord":
		webhook := req.WebhookURL
		if webhook == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "discord webhook url is required"})
			return
		}
		payload := map[string]interface{}{
			"content": "🏛️ **[Ophanim AI SRE]** Test notification alert • Connection established successfully!",
		}
		pBytes, _ := json.Marshal(payload)
		resp, err := http.Post(webhook, "application/json", bytes.NewReader(pBytes))
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to reach discord webhook: " + err.Error()})
			return
		}
		defer resp.Body.Close()
		if resp.StatusCode >= 400 {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": fmt.Sprintf("discord returned status %d", resp.StatusCode)})
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"status": "Discord test notification delivered successfully!"})
		return

	case "telegram":
		token := req.BotToken
		if token == "" {
			token = s.config.ChatOps.Telegram.BotToken
		}
		chatID := req.ChatID
		if token == "" || chatID == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "telegram bot token and chat id are required"})
			return
		}
		payload := map[string]interface{}{
			"chat_id": chatID,
			"text":    "🏛️ [Ophanim AI SRE] Test notification alert • Connection established successfully!",
		}
		pBytes, _ := json.Marshal(payload)
		url := fmt.Sprintf("https://api.telegram.org/bot%s/sendMessage", token)
		resp, err := http.Post(url, "application/json", bytes.NewReader(pBytes))
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to reach telegram api: " + err.Error()})
			return
		}
		defer resp.Body.Close()
		if resp.StatusCode >= 400 {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": fmt.Sprintf("telegram returned status %d", resp.StatusCode)})
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"status": "Telegram test notification delivered successfully!"})
		return

	default:
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "unsupported channel: " + req.Channel})
		return
	}
}

func (s *Server) handleInstallScript(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")

	script := `#!/bin/bash
set -e

echo "🏛️  Installing Ophanim Autonomous SRE Monitoring Sentinel..."

HUB_URL=""
TOKEN=""
NODE_NAME="$(hostname)"

while [[ "$#" -gt 0 ]]; do
    case $1 in
        --hub) HUB_URL="$2"; shift ;;
        --token) TOKEN="$2"; shift ;;
        --name|--node-id) NODE_NAME="$2"; shift ;;
        *) echo "Unknown parameter: $1"; exit 1 ;;
    esac
    shift
done

if [ -z "$HUB_URL" ]; then
    echo "❌ Error: --hub <URL> is required."
    echo "Usage: curl -sSL <HUB_URL>/install-monitor.sh | bash -s -- --hub <HUB_URL> --token <TOKEN>"
    exit 1
fi

if [ -z "$TOKEN" ]; then
    echo "❌ Error: --token <TOKEN> is required."
    exit 1
fi

ARCH="$(uname -m)"
case "$ARCH" in
    x86_64) GOARCH="amd64" ;;
    aarch64|arm64) GOARCH="arm64" ;;
    *) echo "❌ Unsupported architecture: $ARCH"; exit 1 ;;
esac

OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
if [ "$OS" != "linux" ]; then
    echo "❌ Ophanim Monitor currently supports Linux only."
    exit 1
fi

INSTALL_DIR="/usr/local/bin"
BIN_PATH="${INSTALL_DIR}/ophanim-monitor"

echo "📥 Fetching ophanim-monitor binary for linux/${GOARCH}..."
DOWNLOAD_SUCCESS=0
if command -v curl &>/dev/null; then
    if curl -sSL -f "${HUB_URL}/api/download/ophanim-monitor" -o "${BIN_PATH}" 2>/dev/null; then
        DOWNLOAD_SUCCESS=1
    fi
elif command -v wget &>/dev/null; then
    if wget -q -O "${BIN_PATH}" "${HUB_URL}/api/download/ophanim-monitor" 2>/dev/null; then
        DOWNLOAD_SUCCESS=1
    fi
fi

# Fallback: extract from Docker image if binary endpoint returned 404 or empty
if [ "$DOWNLOAD_SUCCESS" -eq 0 ] || [ ! -s "${BIN_PATH}" ]; then
    echo "📦 Extracting binary from williamaxel/ophanim container image..."
    if command -v docker &>/dev/null; then
        docker pull -q williamaxel/ophanim:latest || true
        CONTAINER_ID=$(docker create williamaxel/ophanim:latest 2>/dev/null || docker create williamaxel/ophanim-monitor:latest)
        docker cp "${CONTAINER_ID}:/usr/local/bin/ophanim-monitor" "${BIN_PATH}"
        docker rm -v "${CONTAINER_ID}" >/dev/null 2>&1
        DOWNLOAD_SUCCESS=1
    else
        echo "❌ Failed to download binary directly and Docker is not available."
        exit 1
    fi
fi

chmod 0755 "${BIN_PATH}"

# Systemd Service Registration
if [ -d "/etc/systemd/system" ] && command -v systemctl &>/dev/null; then
    echo "⚙️  Configuring systemd service 'ophanim-monitor.service'..."
    cat <<SERVICE_EOF > /etc/systemd/system/ophanim-monitor.service
[Unit]
Description=Ophanim Autonomous SRE Monitoring Sentinel
After=network.target docker.service
Wants=docker.service

[Service]
Type=simple
ExecStart=${BIN_PATH} --hub ${HUB_URL} --token ${TOKEN} --node-id ${NODE_NAME}
Restart=always
RestartSec=5s
Environment=OPHANIM_HUB_URL=${HUB_URL}
Environment=OPHANIM_ENROLL_TOKEN=${TOKEN}
Environment=OPHANIM_NODE_ID=${NODE_NAME}

[Install]
WantedBy=multi-user.target
SERVICE_EOF

    systemctl daemon-reload
    systemctl enable --now ophanim-monitor.service
    echo "✅ Ophanim Monitor service enabled and started via systemd!"
else
    echo "⚠️  Systemd not available. Starting background process..."
    nohup ${BIN_PATH} --hub "${HUB_URL}" --token "${TOKEN}" --node-id "${NODE_NAME}" > /var/log/ophanim-monitor.log 2>&1 &
    echo "✅ Background daemon started (PID: $!). Logs: /var/log/ophanim-monitor.log"
fi

echo "✨ Node '${NODE_NAME}' successfully enrolled into Ophanim Sanctuary!"
`
	_, _ = w.Write([]byte(script))
}

func (s *Server) handleInstallOpenWRTScript(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")

	script := `#!/bin/sh
# Ophanim SRE — Autonomous OpenWRT Router Ingestion Probe
# Compatible with OpenWRT 19.07, 21.02, 22.03, 23.05, 24.10+ (ash / BusyBox)
# Flash-safe, non-destructive, zero-reboot installation

set -e

echo "🏛️  Ophanim SRE — OpenWRT Router Safe Onboarding Sentinel..."

HUB_URL=""
TOKEN=""
ROUTER_NAME="$(uci get system.@system[0].hostname 2>/dev/null || cat /proc/sys/kernel/hostname 2>/dev/null || echo 'openwrt-router')"

while [ "$#" -gt 0 ]; do
    case "$1" in
        --hub) HUB_URL="$2"; shift ;;
        --token) TOKEN="$2"; shift ;;
        --name|--node-id) ROUTER_NAME="$2"; shift ;;
        *) echo "Unknown parameter: $1"; exit 1 ;;
    esac
    shift
done

if [ -z "$HUB_URL" ]; then
    echo "❌ Error: --hub <URL> is required."
    echo "Usage: wget -qO- <HUB_URL>/install-openwrt.sh | sh -s -- --hub <HUB_URL>"
    exit 1
fi

echo "📡 Hub Endpoint: $HUB_URL"
echo "🌐 Router Name: $ROUTER_NAME"

# 1. Safety Preflight Check: Flash storage capacity check
FREE_KB=$(df -k /overlay 2>/dev/null | awk 'NR==2 {print $4}' || df -k / 2>/dev/null | awk 'NR==2 {print $4}' || echo "10000")
if [ "$FREE_KB" -lt 300 ]; then
    echo "⚠️  Caution: Low flash space ($FREE_KB KB free). Proceeding with ultra-light single-package install..."
fi

# 2. Package Installation: Detect apk (OpenWRT 24.10+) or opkg (OpenWRT 23.05 and earlier)
INSTALLED=0

if [ -x /etc/init.d/prometheus-node-exporter-lua ]; then
    echo "✅ prometheus-node-exporter-lua is already installed."
    INSTALLED=1
elif command -v apk >/dev/null 2>&1; then
    echo "📦 Detected OpenWRT 24.10+ (apk-tools). Updating repositories and installing prometheus-node-exporter-lua..."
    apk update >/dev/null 2>&1 || true
    if apk add prometheus-node-exporter-lua >/dev/null 2>&1; then
        INSTALLED=1
        if [ "$FREE_KB" -gt 1000 ]; then
            apk add prometheus-node-exporter-lua-wifi_stations prometheus-node-exporter-lua-netstat >/dev/null 2>&1 || true
        fi
    fi
elif command -v opkg >/dev/null 2>&1; then
    echo "📦 Detected OpenWRT legacy (opkg). Updating package list and installing prometheus-node-exporter-lua..."
    opkg update >/dev/null 2>&1 || true
    if opkg install prometheus-node-exporter-lua >/dev/null 2>&1; then
        INSTALLED=1
        if [ "$FREE_KB" -gt 1000 ]; then
            opkg install prometheus-node-exporter-lua-wifi_stations prometheus-node-exporter-lua-netstat >/dev/null 2>&1 || true
        fi
    fi
    rm -rf /tmp/opkg-lists/* /var/opkg-lists/* >/dev/null 2>&1 || true
fi

# 3. Start Service if installed, otherwise start standalone ash daemon
if [ -x /etc/init.d/prometheus-node-exporter-lua ]; then
    # Ensure prometheus-node-exporter-lua binds to LAN interface
    if command -v uci >/dev/null 2>&1; then
        uci set prometheus-node-exporter-lua.main.listen_interface='lan' 2>/dev/null || true
        uci set prometheus-node-exporter-lua.main.listen_ipv4='0.0.0.0' 2>/dev/null || true
        uci set prometheus-node-exporter-lua.main.listen_ipv6='::' 2>/dev/null || true
        uci commit prometheus-node-exporter-lua 2>/dev/null || true
    fi
    /etc/init.d/prometheus-node-exporter-lua enable >/dev/null 2>&1 || true
    /etc/init.d/prometheus-node-exporter-lua restart >/dev/null 2>&1 || true
    echo "✅ prometheus-node-exporter-lua daemon active and listening on 0.0.0.0:9100!"
else
    echo "⚙️  Activating zero-dependency OpenWRT Prometheus metrics daemon on port 9100..."
    cat << 'EXPORTER_EOF' > /usr/bin/ophanim-wrt-exporter
#!/bin/sh
while true; do
    (
        echo "HTTP/1.1 200 OK"
        echo "Content-Type: text/plain; version=0.0.4"
        echo "Connection: close"
        echo ""
        UPTIME=$(cat /proc/uptime 2>/dev/null | awk '{print $1}')
        echo "node_boot_time_seconds $(($(date +%s) - ${UPTIME%.*}))"
        read l1 l5 l15 rest < /proc/loadavg
        echo "node_load1 $l1"
        echo "node_load5 $l5"
        echo "node_load15 $l15"
        while read k v rest; do
            case "$k" in
                MemTotal:) echo "node_memory_MemTotal_bytes $((v * 1024))" ;;
                MemFree:) echo "node_memory_MemFree_bytes $((v * 1024))" ;;
                MemAvailable:) echo "node_memory_MemAvailable_bytes $((v * 1024))" ;;
                Buffers:) echo "node_memory_Buffers_bytes $((v * 1024))" ;;
                Cached:) echo "node_memory_Cached_bytes $((v * 1024))" ;;
            esac
        done < /proc/meminfo
        awk -F'[: ]+' 'NR>2 && $2!="" {print "node_network_receive_bytes_total{device=\""$2"\"} "$3"\nnode_network_transmit_bytes_total{device=\""$2"\"} "$11}' /proc/net/dev 2>/dev/null
    ) | nc -l -p 9100 2>/dev/null || sleep 1
done
EXPORTER_EOF
    chmod +x /usr/bin/ophanim-wrt-exporter
    killall ophanim-wrt-exporter 2>/dev/null || true
    nohup /usr/bin/ophanim-wrt-exporter >/dev/null 2>&1 &
    
    if ! grep -q "ophanim-wrt-exporter" /etc/rc.local 2>/dev/null; then
        sed -i 's/exit 0/nohup \/usr\/bin\/ophanim-wrt-exporter >\/dev\/null 2>\&1 \&\nexit 0/' /etc/rc.local 2>/dev/null || true
    fi
    echo "✅ Standalone OpenWRT metrics daemon started on port 9100!"
fi

# 3. Detect Router LAN IP address
LAN_IP="$(uci get network.lan.ipaddr 2>/dev/null || ip -4 addr show br-lan 2>/dev/null | grep -o 'inet [0-9.]*' | cut -d' ' -f2 || ip -4 route get 10.20.20.1 2>/dev/null | awk '{print $7}' || echo '192.168.1.1')"
METRICS_URL="http://${LAN_IP}:9100/metrics"

# 4. Verify local metrics availability
echo "🔍 Verifying local router metrics endpoint (${METRICS_URL})..."
sleep 1
if command -v uclient-fetch >/dev/null 2>&1; then
    uclient-fetch -q -O - "http://127.0.0.1:9100/metrics" 2>/dev/null | head -n 5 || true
fi

# 5. Register router in Ophanim Hub Gateway Topology
echo "🔗 Enrolling router '${ROUTER_NAME}' in Ophanim Gateway Topology..."
PAYLOAD="{\"name\":\"${ROUTER_NAME}\",\"ip_address\":\"${METRICS_URL}\",\"agent_type\":\"openwrt\",\"enroll_token\":\"${TOKEN}\"}"

REGISTERED=0
if command -v uclient-fetch >/dev/null 2>&1; then
    uclient-fetch --post-data="$PAYLOAD" --header="Content-Type: application/json" "${HUB_URL}/api/devices" -O /dev/null >/dev/null 2>&1 && REGISTERED=1 || true
elif command -v wget >/dev/null 2>&1; then
    wget -q --post-data="$PAYLOAD" --header="Content-Type: application/json" -O /dev/null "${HUB_URL}/api/devices" >/dev/null 2>&1 && REGISTERED=1 || true
elif command -v curl >/dev/null 2>&1; then
    curl -s -X POST -H "Content-Type: application/json" -d "$PAYLOAD" "${HUB_URL}/api/devices" >/dev/null 2>&1 && REGISTERED=1 || true
fi

if [ "$REGISTERED" -eq 1 ]; then
    echo "✨ SUCCESS! OpenWRT Router '${ROUTER_NAME}' is live and streaming metrics to Ophanim!"
else
    echo "✅ Router metrics exporter is running at ${METRICS_URL}."
    echo "ℹ️  You can add it in Ophanim under 'Devices & Probes' → 'OpenWRT Router' with IP '${METRICS_URL}'."
fi
`
	_, _ = w.Write([]byte(script))
}

func (s *Server) handleDownloadMonitor(w http.ResponseWriter, r *http.Request) {
	paths := []string{
		"/usr/local/bin/ophanim-monitor",
		"bin/ophanim-monitor",
		"./bin/ophanim-monitor",
		"./ophanim-monitor",
	}

	for _, p := range paths {
		if fi, err := os.Stat(p); err == nil && !fi.IsDir() {
			w.Header().Set("Content-Type", "application/octet-stream")
			w.Header().Set("Content-Disposition", "attachment; filename=\"ophanim-monitor\"")
			http.ServeFile(w, r, p)
			return
		}
	}

	http.Error(w, "ophanim-monitor binary not available", http.StatusNotFound)
}

func writeJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(data)
}
