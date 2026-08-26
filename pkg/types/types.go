package types

import (
	"time"
)

// Severity indicates the urgency of an alert or incident.
type Severity string

const (
	SeverityInfo     Severity = "INFO"
	SeverityWarning  Severity = "WARNING"
	SeverityError    Severity = "ERROR"
	SeverityCritical Severity = "CRITICAL"
)

// IncidentStatus tracks the lifecycle state of an incident.
type IncidentStatus string

const (
	IncidentOpen        IncidentStatus = "OPEN"
	IncidentTriaging    IncidentStatus = "TRIAGING"
	IncidentRemediating IncidentStatus = "REMEDIATING"
	IncidentResolved    IncidentStatus = "RESOLVED"
	IncidentIgnored     IncidentStatus = "IGNORED"
)

// HostMetrics represents system-level resource telemetry for a node.
type HostMetrics struct {
	NodeID          string    `json:"node_id"`
	Hostname        string    `json:"hostname"`
	OS              string    `json:"os"`
	UptimeSeconds   uint64    `json:"uptime_seconds"`
	CPUUsagePercent float64   `json:"cpu_usage_percent"`
	CPUCores        int       `json:"cpu_cores"`
	CPUCoresUsage   []float64 `json:"cpu_cores_usage,omitempty"`
	CPUTemperature  float64   `json:"cpu_temperature,omitempty"`
	MemoryTotalMB   uint64    `json:"memory_total_mb"`
	MemoryUsedMB    uint64    `json:"memory_used_mb"`
	MemoryPercent   float64   `json:"memory_percent"`
	SwapTotalMB     uint64    `json:"swap_total_mb,omitempty"`
	SwapUsedMB      uint64    `json:"swap_used_mb,omitempty"`
	SwapPercent     float64   `json:"swap_percent,omitempty"`
	DiskTotalGB     float64   `json:"disk_total_gb"`
	DiskUsedGB      float64   `json:"disk_used_gb"`
	DiskPercent     float64   `json:"disk_percent"`
	DiskReadKBps    float64   `json:"disk_read_kbps,omitempty"`
	DiskWriteKBps   float64   `json:"disk_write_kbps,omitempty"`
	LoadAvg1        float64   `json:"load_avg_1"`
	LoadAvg5        float64   `json:"load_avg_5"`
	LoadAvg15       float64   `json:"load_avg_15"`
	NetBytesSent    uint64    `json:"net_bytes_sent"`
	NetBytesRecv    uint64    `json:"net_bytes_recv"`
	NetRxRateKBps   float64            `json:"net_rx_rate_kbps,omitempty"`
	NetTxRateKBps   float64            `json:"net_tx_rate_kbps,omitempty"`
	NetworkInterfaces []NetworkInterface `json:"network_interfaces,omitempty"`
	Timestamp       time.Time          `json:"timestamp"`
}

// NetworkInterface represents a physical or virtual network interface on a node.
type NetworkInterface struct {
	Name       string  `json:"name"`
	RxBytes    uint64  `json:"rx_bytes"`
	TxBytes    uint64  `json:"tx_bytes"`
	RxRateKBps float64 `json:"rx_rate_kbps"`
	TxRateKBps float64 `json:"tx_rate_kbps"`
	IsUp       bool    `json:"is_up"`
	Type       string  `json:"type,omitempty"`
	IPAddress  string  `json:"ip_address,omitempty"`
}

// MetricPoint represents a time-series telemetry point for historical charts.
type MetricPoint struct {
	Timestamp     time.Time `json:"timestamp"`
	CPUPercent    float64   `json:"cpu_percent"`
	MemoryPercent float64   `json:"mem_percent"`
	MemoryUsageMB float64   `json:"memory_usage_mb,omitempty"`
	NetRxKBps     float64   `json:"net_rx_kbps"`
	NetTxKBps     float64   `json:"net_tx_kbps"`
	DiskReadKBps  float64   `json:"disk_read_kbps"`
	DiskWriteKBps float64   `json:"disk_write_kbps"`
	CPUTemp       float64   `json:"cpu_temp,omitempty"`
}

// ContainerStatus represents the state of a container.
type ContainerStatus struct {
	ID                string            `json:"id"`
	Name              string            `json:"name"`
	Image             string            `json:"image"`
	State             string            `json:"state"` // running, exited, paused, restarting
	Status            string            `json:"status"`
	Health            string            `json:"health"` // healthy, unhealthy, starting, none
	ExitCode          int               `json:"exit_code"`
	CPUPercent        float64           `json:"cpu_percent"`
	MemoryUsageMB     float64           `json:"memory_usage_mb"`
	MemoryLimitMB     float64           `json:"memory_limit_mb"`
	MemoryPercent     float64           `json:"memory_percent"`
	NetworkRxBytes    uint64            `json:"network_rx_bytes"`
	NetworkTxBytes    uint64            `json:"network_tx_bytes"`
	NetworkRxRateKBps float64           `json:"net_rx_rate_kbps"`
	NetworkTxRateKBps float64           `json:"net_tx_rate_kbps"`
	BlockReadMB       float64           `json:"block_read_mb"`
	BlockWriteMB      float64           `json:"block_write_mb"`
	DiskReadRateKBps  float64           `json:"disk_read_rate_kbps"`
	DiskWriteRateKBps float64           `json:"disk_write_rate_kbps"`
	Stack             string            `json:"stack,omitempty"` // docker compose project / namespace
	RestartCount      int               `json:"restart_count"`
	NodeID            string            `json:"node_id"`
	Labels            map[string]string `json:"labels"`
	Created           time.Time         `json:"created"`
	LastSeen          time.Time         `json:"last_seen"`
}

// SyntheticProbeResult holds the outcome of an HTTP, TLS, DNS, or TCP probe.
type SyntheticProbeResult struct {
	TargetID      string        `json:"target_id"`
	TargetName    string        `json:"target_name"`
	TargetURL     string        `json:"target_url"`
	ProbeType     string        `json:"probe_type"` // http, https, tcp, dns, tls
	Success       bool          `json:"success"`
	StatusCode    int           `json:"status_code,omitempty"`
	ResponseTime  time.Duration `json:"response_time_ns"`
	LatencyMs     float64       `json:"latency_ms"`
	SSLExpiryDays int           `json:"ssl_expiry_days,omitempty"`
	ErrorMessage  string        `json:"error_message,omitempty"`
	Timestamp     time.Time     `json:"timestamp"`
}

// ProxmoxGuestStatus represents an LXC or VM on a Proxmox node.
type ProxmoxGuestStatus struct {
	NodeID        string  `json:"node_id"`
	VMID          int     `json:"vmid"`
	Name          string  `json:"name"`
	Type          string  `json:"type"` // qemu or lxc
	Status        string  `json:"status"` // running, stopped
	CPUs          int     `json:"cpus"`
	CPUUsage      float64 `json:"cpu_usage"`
	MaxMemMB      uint64  `json:"max_mem_mb"`
	MemMB         uint64  `json:"mem_mb"`
	MaxDiskGB     float64 `json:"max_disk_gb"`
	DiskGB        float64 `json:"disk_gb"`
	UptimeSeconds uint64  `json:"uptime_seconds"`
}

// LogEntry represents a single log line captured from a container or service.
type LogEntry struct {
	Source    string    `json:"source"`
	NodeID    string    `json:"node_id"`
	Level     string    `json:"level"` // INFO, WARN, ERROR
	Message   string    `json:"message"`
	Timestamp time.Time `json:"timestamp"`
}

// Incident encapsulates an anomalous event undergoing diagnosis and remediation.
type Incident struct {
	ID               string         `json:"id"`
	Title            string         `json:"title"`
	Description      string         `json:"description"`
	Severity         Severity       `json:"severity"`
	Status           IncidentStatus `json:"status"`
	RootCauseSummary string         `json:"root_cause_summary,omitempty"`
	ImpactedTargets  []string       `json:"impacted_targets"`
	ProposedAction   *ActionRequest `json:"proposed_action,omitempty"`
	ResolutionNotes  string         `json:"resolution_notes,omitempty"`
	CreatedAt        time.Time      `json:"created_at"`
	UpdatedAt        time.Time      `json:"updated_at"`
	ResolvedAt       *time.Time     `json:"resolved_at,omitempty"`
}

// ActionType defines structured remediation commands.
type ActionType string

const (
	ActionContainerRestart ActionType = "CONTAINER_RESTART"
	ActionContainerStop    ActionType = "CONTAINER_STOP"
	ActionContainerStart   ActionType = "CONTAINER_START"
	ActionProxmoxReboot    ActionType = "PROXMOX_REBOOT"
	ActionSystemdRestart   ActionType = "SYSTEMD_RESTART"
	ActionWebhookTrigger   ActionType = "WEBHOOK_TRIGGER"
)

// ActionRequest defines a strictly-typed remediation execution payload.
type ActionRequest struct {
	ID          string     `json:"id"`
	IncidentID  string     `json:"incident_id"`
	ActionType  ActionType `json:"action_type"`
	TargetNode  string     `json:"target_node"`
	TargetID    string     `json:"target_id"` // container ID, VMID, or service name
	TargetName  string     `json:"target_name"`
	Reason      string     `json:"reason"`
	Whitelisted bool       `json:"whitelisted"`
	AutoExecute bool       `json:"auto_execute"`
	RequestedAt time.Time  `json:"requested_at"`
}

// ActionResponse records the execution outcome of an action.
type ActionResponse struct {
	ActionID     string    `json:"action_id"`
	Success      bool      `json:"success"`
	Output       string    `json:"output"`
	ErrorMessage string    `json:"error_message,omitempty"`
	ExecutedBy   string    `json:"executed_by"` // "agent_auto" or user ID
	ExecutedAt   time.Time `json:"executed_at"`
}

// DeviceNode represents an enrolled homelab machine or probe.
type DeviceNode struct {
	ID          string    `json:"id"`
	Name        string    `json:"name"`
	IPAddress   string    `json:"ip_address"`
	AgentType   string    `json:"agent_type"` // "local", "ophanim-monitor", "prometheus-exporter", "proxmox"
	Status      string    `json:"status"`     // "online", "offline", "degraded"
	EnrollToken string    `json:"enroll_token,omitempty"`
	LastSeen    time.Time `json:"last_seen"`
	CreatedAt   time.Time `json:"created_at"`
}

// TopologyNode represents a node in the visual dependency graph.
type TopologyNode struct {
	ID       string            `json:"id"`
	Label    string            `json:"label"`
	Type     string            `json:"type"` // host, container, service, proxy, database, router
	Status   string            `json:"status"` // healthy, warning, critical, unknown
	ParentID string            `json:"parent_id,omitempty"`
	Metadata map[string]string `json:"metadata,omitempty"`
}

// TopologyEdge represents a dependency connection between two topology nodes.
type TopologyEdge struct {
	ID       string `json:"id"`
	SourceID string `json:"source_id"`
	TargetID string `json:"target_id"`
	Type     string `json:"type"` // depends_on, runs_on, routes_to, proxies_for
	Status   string `json:"status"`
}

// User represents an authenticated Ophanim user.
type User struct {
	ID           string    `json:"id"`
	Username     string    `json:"username"`
	PasswordHash string    `json:"-"`
	Role         string    `json:"role"`
	CreatedAt    time.Time `json:"created_at"`
}

// ChatMessage represents a message in a multi-turn conversation.
type ChatMessage struct {
	Role    string `json:"role"`    // "user", "assistant", "system"
	Content string `json:"content"` // message content
}
