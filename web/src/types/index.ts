export type Severity = 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';
export type IncidentStatus = 'OPEN' | 'TRIAGING' | 'REMEDIATING' | 'RESOLVED' | 'IGNORED';

export interface HostMetrics {
  node_id: string;
  hostname: string;
  os: string;
  uptime_seconds: number;
  cpu_usage_percent: number;
  cpu_cores: number;
  cpu_cores_usage?: number[];
  cpu_temperature?: number;
  memory_total_mb: number;
  memory_used_mb: number;
  memory_percent: number;
  swap_total_mb?: number;
  swap_used_mb?: number;
  swap_percent?: number;
  disk_total_gb: number;
  disk_used_gb: number;
  disk_percent: number;
  disk_read_kbps?: number;
  disk_write_kbps?: number;
  load_avg_1: number;
  load_avg_5: number;
  load_avg_15: number;
  net_bytes_sent: number;
  net_bytes_recv: number;
  net_rx_rate_kbps?: number;
  net_tx_rate_kbps?: number;
  network_interfaces?: NetworkInterface[];
  timestamp: string;
}

export interface NetworkInterface {
  name: string;
  rx_bytes: number;
  tx_bytes: number;
  rx_rate_kbps: number;
  tx_rate_kbps: number;
  is_up: boolean;
  type?: string;
  ip_address?: string;
}

export interface MetricPoint {
  timestamp: string;
  cpu_percent: number;
  mem_percent: number;
  memory_usage_mb?: number;
  net_rx_kbps: number;
  net_tx_kbps: number;
  disk_read_kbps: number;
  disk_write_kbps: number;
  cpu_temp?: number;
}

export interface ContainerStatus {
  id: string;
  name: string;
  image: string;
  state: string;
  status: string;
  health: string;
  exit_code: number;
  cpu_percent: number;
  memory_usage_mb: number;
  memory_limit_mb: number;
  memory_percent: number;
  network_rx_bytes?: number;
  network_tx_bytes?: number;
  net_rx_rate_kbps?: number;
  net_tx_rate_kbps?: number;
  block_read_mb?: number;
  block_write_mb?: number;
  disk_read_rate_kbps?: number;
  disk_write_rate_kbps?: number;
  stack?: string;
  restart_count: number;
  node_id: string;
  labels: Record<string, string>;
  created: string;
  last_seen: string;
}

export interface ActionRequest {
  id: string;
  incident_id: string;
  action_type: string;
  target_node: string;
  target_id: string;
  target_name: string;
  reason: string;
  whitelisted: boolean;
  auto_execute: boolean;
  requested_at: string;
}

export interface Incident {
  id: string;
  title: string;
  description: string;
  severity: Severity;
  status: IncidentStatus;
  root_cause_summary?: string;
  impacted_targets: string[];
  proposed_action?: ActionRequest;
  resolution_notes?: string;
  created_at: string;
  updated_at: string;
  resolved_at?: string;
}

export interface DeviceNode {
  id: string;
  name: string;
  ip_address: string;
  agent_type: string;
  status: string;
  enroll_token?: string;
  last_seen: string;
  created_at: string;
  parent_node_id?: string;
  is_hypervisor?: boolean;
  merged_host?: string;
}

export interface TopologyNode {
  id: string;
  label: string;
  type: 'host' | 'container' | 'service' | 'proxy' | 'database' | 'router';
  status: 'healthy' | 'warning' | 'critical' | 'unknown';
  parent_id?: string;
  metadata?: Record<string, string>;
  x?: number;
  y?: number;
}

export interface TopologyEdge {
  id: string;
  source_id: string;
  target_id: string;
  type: string;
  status: string;
}

export interface LogEntry {
  source: string;
  node_id: string;
  level: string;
  message: string;
  timestamp: string;
}

export type WidgetKey = 
  | 'slo_ribbon'
  | 'overview_cards'
  | 'host_telemetry'
  | 'hardware_smt'
  | 'top_containers'
  | 'container_matrix'
  | 'network_bus'
  | 'timeseries_charts'
  | 'incident_war_room'
  | 'container_table';

export interface DashboardPreset {
  id: string;
  name: string;
  icon: string;
  description: string;
  isCustom?: boolean;
  widgets: WidgetKey[];
}

