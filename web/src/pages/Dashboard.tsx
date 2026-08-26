import React, { useState, useEffect, useRef } from 'react';
import { 
  Server, 
  Cpu, 
  HardDrive, 
  Activity, 
  AlertTriangle, 
  CheckCircle2, 
  Box, 
  ArrowUpRight, 
  Search, 
  Zap, 
  Eye, 
  Orbit, 
  Shield, 
  Layers, 
  Sparkles, 
  Network, 
  ArrowDownLeft, 
  SlidersHorizontal, 
  ChevronDown, 
  ChevronLeft,
  ChevronRight,
  Clock, 
  TrendingUp, 
  Globe, 
  Settings, 
  Plus, 
  Trash2, 
  RotateCcw, 
  X, 
  Flame, 
  Check, 
  LayoutGrid,
  Radio,
  ChevronUp,
  EyeOff
} from 'lucide-react';
import { HostMetrics, ContainerStatus, Incident, DeviceNode, DashboardPreset, WidgetKey } from '../types';
import { HardwareInspector } from '../components/HardwareInspector';
import { TelemetryChart } from '../components/TelemetryChart';

interface DashboardProps {
  metrics: HostMetrics | null;
  nodeMetrics?: Record<string, HostMetrics>;
  containers: ContainerStatus[];
  incidents: Incident[];
  devices: DeviceNode[];
  onNavigateToIncidents: () => void;
  onNavigateToTopology: () => void;
}

type ColumnKey = 'name' | 'stack' | 'state' | 'cpu' | 'memory' | 'network' | 'disk' | 'image' | 'node' | 'restarts';

const ALL_COLUMNS: { key: ColumnKey; label: string }[] = [
  { key: 'name', label: 'Container' },
  { key: 'stack', label: 'Stack / Project' },
  { key: 'state', label: 'State' },
  { key: 'cpu', label: 'CPU %' },
  { key: 'memory', label: 'RAM' },
  { key: 'network', label: 'Network I/O (Rx/Tx)' },
  { key: 'disk', label: 'Disk I/O (R/W)' },
  { key: 'image', label: 'Image' },
  { key: 'node', label: 'Node' },
  { key: 'restarts', label: 'Restarts' },
];

const DEFAULT_COLUMNS: ColumnKey[] = ['name', 'stack', 'state', 'cpu', 'memory', 'network', 'image', 'restarts'];

export interface WidgetDefinition {
  id: WidgetKey;
  name: string;
  category: 'overview' | 'hardware' | 'containers' | 'network' | 'incidents';
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}

export const ALL_WIDGET_DEFS: WidgetDefinition[] = [
  { id: 'slo_ribbon', name: 'SLO & Reliability Covenant Ribbon', category: 'overview', description: '99.9% SLO Target, 30d Error Budget, synthetic probe latency, disk & net rates', icon: Shield },
  { id: 'overview_cards', name: 'Sanctuary KPI Quad Cards (I - IV)', category: 'overview', description: 'Health %, Active Incidents count, Living Vessels count, Topology status', icon: LayoutGrid },
  { id: 'host_telemetry', name: 'Host Hardware Telemetry Gauges', category: 'hardware', description: '20-Core CPU Load, RAM & Swap saturation, Root storage capacity', icon: Server },
  { id: 'hardware_smt', name: 'Embedded 20-Core SMT Heatmap Matrix', category: 'hardware', description: 'Real-time per-core SMT utilization bars, package thermals & load averages', icon: Cpu },
  { id: 'top_containers', name: 'Top 5 Resource Consuming Vessels', category: 'containers', description: 'Ranked leaderboards by CPU % and RAM (MB) with live progress bars', icon: TrendingUp },
  { id: 'container_matrix', name: 'Living Vessels Status Grid / Tile Wall', category: 'containers', description: 'High-density tile matrix of all monitored containers and virtual machines', icon: Layers },
  { id: 'network_bus', name: 'Network Interface & Bandwidth Observatory', category: 'network', description: '1Hz Inbound/Outbound throughput, cumulative boot GBs, interface health', icon: Globe },
  { id: 'timeseries_charts', name: 'Time-Series Telemetry & Trends', category: 'hardware', description: 'Interactive multi-metric SVG area charts (15m, 1h, 6h, 24h)', icon: Activity },
  { id: 'incident_war_room', name: 'Incident War Room & Active Triage', category: 'incidents', description: 'Active incident cards, severity badges, root cause triage, and quick fix links', icon: AlertTriangle },
  { id: 'container_table', name: 'Monitored Containers Inventory Table', category: 'containers', description: 'Complete container table with column customizer, search, filters, and sorting', icon: Box },
];

export const DEFAULT_PRESETS: DashboardPreset[] = [
  {
    id: 'cluster_overview',
    name: 'Cluster Overview',
    icon: '🏛️',
    description: 'Golden Signals ribbon, host telemetry gauges, network bus, and full living vessels inventory',
    widgets: ['slo_ribbon', 'overview_cards', 'host_telemetry', 'network_bus', 'container_table'],
  },
  {
    id: 'hardware_thermals',
    name: 'Hardware & Thermals',
    icon: '⚡',
    description: 'Embedded 20-core SMT heatmap, package thermals, memory/swap saturation & time-series trends',
    widgets: ['host_telemetry', 'hardware_smt', 'timeseries_charts', 'container_table'],
  },
  {
    id: 'container_sre',
    name: 'Container & App SRE',
    icon: '📦',
    description: 'Top 5 resource hogs, restart frequency, living vessels health matrix & container inventory',
    widgets: ['top_containers', 'container_matrix', 'container_table'],
  },
  {
    id: 'network_traffic',
    name: 'Network & Traffic',
    icon: '🌐',
    description: 'Real-time Inbound/Outbound throughput rates, cumulative boot transfer, synthetic latency & charts',
    widgets: ['network_bus', 'timeseries_charts', 'container_table'],
  },
  {
    id: 'incident_war_room',
    name: 'Incident War Room',
    icon: '🚨',
    description: 'Active incident triage, impacted vessels, error budget burn & 1-click remediation actions',
    widgets: ['slo_ribbon', 'incident_war_room', 'top_containers', 'container_table'],
  },
];

const PRESET_ICONS = ['🏛️', '⚡', '📦', '🌐', '🚨', '👁️', '✦', '🔥', '📊', '🛡️', '💻', '⚙️'];

export const Dashboard: React.FC<DashboardProps> = ({
  metrics,
  nodeMetrics = {},
  containers,
  incidents,
  devices,
  onNavigateToIncidents,
  onNavigateToTopology,
}) => {
  const [isHardwareOpen, setIsHardwareOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [stateFilter, setStateFilter] = useState<'all' | 'running' | 'stopped'>('all');
  const [sortBy, setSortBy] = useState<'name' | 'cpu' | 'memory' | 'restarts' | 'network'>('name');

  // Presets State with LocalStorage Persistence
  const [presets, setPresets] = useState<DashboardPreset[]>(() => {
    try {
      const saved = localStorage.getItem('ophanim_dashboard_presets');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return DEFAULT_PRESETS;
  });

  const [activePresetId, setActivePresetId] = useState<string>(() => {
    try {
      const saved = localStorage.getItem('ophanim_active_preset_id');
      if (saved) return saved;
    } catch {}
    return 'cluster_overview';
  });

  // Modals for Customizing / Adding Presets
  const [isCustomizeModalOpen, setIsCustomizeModalOpen] = useState(false);
  const [isNewPresetModalOpen, setIsNewPresetModalOpen] = useState(false);

  // New Preset Form State
  const [newPresetName, setNewPresetName] = useState('');
  const [newPresetIcon, setNewPresetIcon] = useState('📊');
  const [newPresetDesc, setNewPresetDesc] = useState('');
  const [newPresetWidgets, setNewPresetWidgets] = useState<WidgetKey[]>([
    'slo_ribbon',
    'host_telemetry',
    'top_containers',
    'container_table'
  ]);

  // Active preset object
  const activePreset = presets.find((p) => p.id === activePresetId) || presets[0] || DEFAULT_PRESETS[0];

  // Save presets & active preset ID to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('ophanim_dashboard_presets', JSON.stringify(presets));
      localStorage.setItem('ophanim_active_preset_id', activePresetId);
    } catch {}
  }, [presets, activePresetId]);

  // Column customization state with localStorage persistence
  const [visibleColumns, setVisibleColumns] = useState<ColumnKey[]>(() => {
    try {
      const saved = localStorage.getItem('ophanim_container_columns');
      return saved ? JSON.parse(saved) : DEFAULT_COLUMNS;
    } catch {
      return DEFAULT_COLUMNS;
    }
  });
  const [isColumnDropdownOpen, setIsColumnDropdownOpen] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem('ophanim_container_columns', JSON.stringify(visibleColumns));
    } catch {}
  }, [visibleColumns]);

  const toggleColumn = (key: ColumnKey) => {
    if (visibleColumns.includes(key)) {
      if (visibleColumns.length > 1) {
        setVisibleColumns(visibleColumns.filter((c) => c !== key));
      }
    } else {
      setVisibleColumns([...visibleColumns, key]);
    }
  };

  const safeContainers = Array.isArray(containers) ? containers : [];
  const safeIncidents = Array.isArray(incidents) ? incidents : [];
  const safeDevices = Array.isArray(devices) ? devices : [];

  // Network interfaces collapsible state & filter
  const [isNetSocketsCollapsed, setIsNetSocketsCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('ophanim_net_sockets_collapsed') === 'true';
    } catch {
      return false;
    }
  });
  const [netSocketFilter, setNetSocketFilter] = useState<'all' | 'uplinks'>('uplinks');

  useEffect(() => {
    try {
      localStorage.setItem('ophanim_net_sockets_collapsed', isNetSocketsCollapsed.toString());
    } catch {}
  }, [isNetSocketsCollapsed]);

  // Helper for human-friendly node metadata & badges
  const getNodeMeta = (nodeId: string) => {
    const id = nodeId || 'local-lxc';
    if (id === 'local-lxc' || id === 'local') {
      return { 
        id: 'local-lxc', 
        label: 'Homelab LXC (Local)', 
        shortLabel: 'Homelab LXC', 
        platform: 'Docker Host', 
        ip: '10.20.20.11', 
        icon: '🐳', 
        color: 'emerald' 
      };
    }
    if (id === 'truenas') {
      return { 
        id: 'truenas', 
        label: 'TrueNAS SCALE (truenas)', 
        shortLabel: 'TrueNAS SCALE', 
        platform: 'Storage & Apps', 
        ip: '10.10.10.8', 
        icon: '💾', 
        color: 'amber' 
      };
    }
    if (id === 'dev-homelab') {
      return { 
        id: 'dev-homelab', 
        label: 'Proxmox PVE (homelab)', 
        shortLabel: 'homelab', 
        platform: 'PVE Hypervisor 1', 
        ip: '10.10.10.2', 
        icon: '🖥️', 
        color: 'sky' 
      };
    }
    if (id === 'dev-homelab2') {
      return { 
        id: 'dev-homelab2', 
        label: 'Proxmox PVE (homelab2)', 
        shortLabel: 'homelab2', 
        platform: 'PVE Hypervisor 2', 
        ip: '10.10.10.3', 
        icon: '🖥️', 
        color: 'indigo' 
      };
    }
    if (id === 'openwrt' || id.includes('openwrt') || id.includes('router')) {
      const d = safeDevices.find(dev => dev.id === id);
      return {
        id,
        label: d?.name || 'OpenWRT Gateway',
        shortLabel: 'OpenWRT',
        platform: 'Network Gateway',
        ip: d?.ip_address || '10.10.10.1',
        icon: '🌐',
        color: 'teal'
      };
    }
    const d = safeDevices.find(dev => dev.id === id);
    return {
      id,
      label: d?.name || id,
      shortLabel: d?.name || id,
      platform: d?.agent_type || 'Agent Host',
      ip: d?.ip_address || '',
      icon: '📦',
      color: 'gold'
    };
  };

  // Node filtering and grouping state
  const [nodeFilter, setNodeFilter] = useState<string>('all');
  const [groupByNode, setGroupByNode] = useState<boolean>(true);
  const [collapsedNodes, setCollapsedNodes] = useState<Record<string, boolean>>({});

  const toggleNodeCollapse = (nodeId: string) => {
    setCollapsedNodes(prev => ({
      ...prev,
      [nodeId]: !prev[nodeId]
    }));
  };

  // Extract all unique nodes present in containers
  const availableNodeIds = Array.from(
    new Set(safeContainers.map((c) => c.node_id || 'local-lxc'))
  ).sort((a, b) => {
    if (a === 'local-lxc' || a === 'local') return -1;
    if (b === 'local-lxc' || b === 'local') return 1;
    if (a === 'truenas') return -1;
    if (b === 'truenas') return 1;
    return a.localeCompare(b);
  });

  // Extract all unique node IDs across containers, devices, and live node metrics
  const allKnownNodeIds = Array.from(
    new Set([
      'local-lxc',
      ...safeDevices.map(d => d.id),
      ...safeContainers.map(c => c.node_id).filter(Boolean),
      ...Object.keys(nodeMetrics || {})
    ])
  ).sort((a, b) => {
    if (a === 'local-lxc' || a === 'local') return -1;
    if (b === 'local-lxc' || b === 'local') return 1;
    if (a === 'truenas') return -1;
    if (b === 'truenas') return 1;
    return a.localeCompare(b);
  });

  // Selected node for hardware telemetry and metrics cards
  const [selectedTelemetryNode, setSelectedTelemetryNode] = useState<string>('local-lxc');
  const [isNodeDropdownOpen, setIsNodeDropdownOpen] = useState<boolean>(false);
  const nodeDropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (nodeDropdownRef.current && !nodeDropdownRef.current.contains(e.target as Node)) {
        setIsNodeDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Resolve active telemetry metrics for the selected node (strictly authentic, no fallback to local node)
  const activeMetrics = (nodeMetrics && nodeMetrics[selectedTelemetryNode]) ||
    ((selectedTelemetryNode === 'local-lxc' || selectedTelemetryNode === 'local' || !selectedTelemetryNode) ? metrics : null);

  const currentSelectedMeta = getNodeMeta(selectedTelemetryNode);

  const runningContainers = safeContainers.filter((c) => c.state === 'running').length;
  const stoppedContainers = safeContainers.filter((c) => c.state !== 'running').length;

  const filteredContainers = safeContainers
    .filter((c) => {
      const containerNode = c.node_id || 'local-lxc';
      const matchesNode = nodeFilter === 'all' || containerNode === nodeFilter;
      const matchesSearch = c.name.toLowerCase().includes(search.toLowerCase()) || 
        c.image.toLowerCase().includes(search.toLowerCase()) ||
        (c.stack && c.stack.toLowerCase().includes(search.toLowerCase()));
      const matchesState = stateFilter === 'all' 
        ? true 
        : stateFilter === 'running' 
        ? c.state === 'running' 
        : c.state !== 'running';
      return matchesNode && matchesSearch && matchesState;
    })
    .sort((a, b) => {
      if (sortBy === 'cpu') return (b.cpu_percent || 0) - (a.cpu_percent || 0);
      if (sortBy === 'memory') return (b.memory_usage_mb || 0) - (a.memory_usage_mb || 0);
      if (sortBy === 'restarts') return (b.restart_count || 0) - (a.restart_count || 0);
      if (sortBy === 'network') return (b.network_rx_bytes || 0) - (a.network_rx_bytes || 0);
      return a.name.localeCompare(b.name);
    });

  // Group filtered containers by node_id
  const groupedContainers = availableNodeIds
    .map((nodeId) => {
      const nodeContainers = filteredContainers.filter(
        (c) => (c.node_id || 'local-lxc') === nodeId
      );
      return {
        nodeId,
        meta: getNodeMeta(nodeId),
        containers: nodeContainers,
        runningCount: nodeContainers.filter((c) => c.state === 'running').length,
        stoppedCount: nodeContainers.filter((c) => c.state !== 'running').length,
      };
    })
    .filter((g) => g.containers.length > 0 || (nodeFilter !== 'all' && g.nodeId === nodeFilter));

  // Calculate cumulative network bandwidth in GB for selected node
  const totalNetRxGB = ((activeMetrics?.net_bytes_recv || 0) / (1024 * 1024 * 1024)).toFixed(2);
  const totalNetTxGB = ((activeMetrics?.net_bytes_sent || 0) / (1024 * 1024 * 1024)).toFixed(2);
  const currentNetRxKBps = activeMetrics?.net_rx_rate_kbps || 0;
  const currentNetTxKBps = activeMetrics?.net_tx_rate_kbps || 0;

  // Node Telemetry Dropdown Selector renderer
  const renderNodeSelectorDropdown = (variant: 'host' | 'network' = 'host') => (
    <div 
      className={`relative inline-block text-left ${isNodeDropdownOpen ? 'z-50' : 'z-20'}`} 
      ref={variant === 'host' ? nodeDropdownRef : undefined}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setIsNodeDropdownOpen((prev) => !prev);
        }}
        className="flex items-center space-x-2 px-3 py-1.5 rounded-xl bg-surfaceLight hover:bg-gold/10 border border-gold/40 hover:border-gold text-ink font-serif text-xs transition-all shadow-sm group cursor-pointer"
        title="Switch Host / Node Telemetry"
      >
        <span className="text-sm">{currentSelectedMeta.icon}</span>
        <span className="font-bold text-ink group-hover:text-gold tracking-wide max-w-[130px] sm:max-w-[200px] truncate">
          {currentSelectedMeta.label}
        </span>
        <span className="hidden sm:inline-block text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-gold/10 border border-gold/30 text-gold uppercase">
          {currentSelectedMeta.platform}
        </span>
        <ChevronDown className={`w-3.5 h-3.5 text-gold transition-transform duration-200 ${isNodeDropdownOpen ? 'rotate-180' : ''}`} />
      </button>

      {isNodeDropdownOpen && (
        <div 
          className="!absolute left-0 top-full mt-1.5 w-72 sm:w-80 bg-surface border border-gold/40 rounded-2xl shadow-2xl z-50 p-1.5 backdrop-blur-md animate-in fade-in zoom-in-95 duration-150"
          style={{ position: 'absolute' }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="greek-meander opacity-30 -mx-1.5 -mt-1.5 mb-1.5 rounded-t-xl" />
          <div className="px-3 py-1.5 text-[10px] font-mono text-muted uppercase font-bold tracking-wider flex items-center justify-between border-b border-border mb-1">
            <span>Select Telemetry Node</span>
            <span className="text-gold font-bold">{allKnownNodeIds.length} Nodes</span>
          </div>
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {allKnownNodeIds.map((nid) => {
              const meta = getNodeMeta(nid);
              const nodeM = nodeMetrics?.[nid] || (nid === 'local-lxc' || nid === 'local' ? metrics : null);
              const isSelected = selectedTelemetryNode === nid;

              return (
                <button
                  key={nid}
                  type="button"
                  onClick={() => {
                    setSelectedTelemetryNode(nid);
                    setIsNodeDropdownOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2 rounded-xl flex items-center justify-between transition-all text-xs font-mono group cursor-pointer ${
                    isSelected
                      ? 'bg-gold-muted border border-gold/50 text-ink shadow-xs'
                      : 'hover:bg-surfaceLight/80 text-sepia hover:text-ink border border-transparent'
                  }`}
                >
                  <div className="flex items-center space-x-2.5 min-w-0">
                    <span className="text-base shrink-0">{meta.icon}</span>
                    <div className="truncate">
                      <p className={`font-serif font-bold truncate ${isSelected ? 'text-gold' : 'group-hover:text-ink'}`}>
                        {meta.label}
                      </p>
                      <p className="text-[10px] text-muted truncate">
                        {meta.platform} {meta.ip ? `• ${meta.ip}` : ''}
                      </p>
                    </div>
                  </div>
                  <div className="text-right shrink-0 pl-2">
                    {nodeM ? (
                      <span className="text-[10px] font-bold text-emerald flex items-center space-x-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald animate-pulse" />
                        <span>{nodeM.cpu_usage_percent.toFixed(0)}% CPU</span>
                      </span>
                    ) : (
                      <span className="text-[10px] text-muted font-serif">Enrolled</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );

  // Sorted Top 5 Containers
  const topCpuContainers = [...safeContainers]
    .sort((a, b) => (b.cpu_percent || 0) - (a.cpu_percent || 0))
    .slice(0, 5);

  const topMemContainers = [...safeContainers]
    .sort((a, b) => (b.memory_usage_mb || 0) - (a.memory_usage_mb || 0))
    .slice(0, 5);

  // Preset Handlers
  const handleToggleWidgetInActivePreset = (widgetId: WidgetKey) => {
    setPresets((prev) =>
      prev.map((p) => {
        if (p.id !== activePreset.id) return p;
        const exists = p.widgets.includes(widgetId);
        const newWidgets = exists
          ? p.widgets.filter((w) => w !== widgetId)
          : [...p.widgets, widgetId];
        return { ...p, widgets: newWidgets };
      })
    );
  };

  const handleCreatePreset = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPresetName.trim()) return;
    const newId = 'custom_' + Date.now();
    const newPreset: DashboardPreset = {
      id: newId,
      name: newPresetName.trim(),
      icon: newPresetIcon || '📊',
      description: newPresetDesc.trim() || 'Custom user-defined SRE telemetry dashboard',
      isCustom: true,
      widgets: newPresetWidgets.length > 0 ? newPresetWidgets : ['host_telemetry', 'container_table'],
    };
    setPresets((prev) => [...prev, newPreset]);
    setActivePresetId(newId);
    setNewPresetName('');
    setNewPresetDesc('');
    setIsNewPresetModalOpen(false);
  };

  const handleDeletePreset = (id: string) => {
    setPresets((prev) => prev.filter((p) => p.id !== id));
    if (activePresetId === id) {
      setActivePresetId('cluster_overview');
    }
  };

  const handleResetToDefaults = () => {
    setPresets(DEFAULT_PRESETS);
    setActivePresetId('cluster_overview');
    setIsCustomizeModalOpen(false);
  };

  const [isPresetDropdownOpen, setIsPresetDropdownOpen] = useState(false);

  return (
    <div className="space-y-7">
      {/* 🏛️ PRESET SELECTION & CUSTOMIZATION TOOLBAR */}
      <div className="bg-surface border border-border rounded-2xl p-3 sm:px-4 sm:py-3 shadow-sm greek-frame">
        <div className="greek-meander opacity-35 -mx-3 sm:-mx-4 -mt-3 sm:-mt-3 mb-2.5" />

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Left: Compact Preset Dropdown Trigger */}
          <div className="relative inline-block">
            <button
              onClick={() => setIsPresetDropdownOpen((prev) => !prev)}
              className="inline-flex items-center space-x-2.5 px-3.5 py-2 rounded-xl bg-surfaceLight/90 hover:bg-surfaceLight border border-border hover:border-gold/50 text-ink text-xs font-serif font-bold transition-all shadow-xs"
              title="Select Dashboard Preset"
            >
              <span className="text-base">{activePreset.icon}</span>
              <span className="text-ink font-serif">{activePreset.name}</span>
              {activePreset.isCustom ? (
                <span className="text-[9px] px-1.5 py-0.2 rounded font-mono uppercase bg-gold/15 text-gold border border-gold/30">
                  Custom
                </span>
              ) : (
                <span className="text-[9px] px-1.5 py-0.2 rounded font-mono text-muted bg-inset border border-border/70">
                  Preset
                </span>
              )}
              <ChevronDown className={`w-3.5 h-3.5 text-muted transition-transform duration-200 ${isPresetDropdownOpen ? 'rotate-180 text-gold' : ''}`} />
            </button>

            {/* Standard Floating Overlay Dropdown */}
            {isPresetDropdownOpen && (
              <>
                <div 
                  className="fixed inset-0 z-40" 
                  onClick={() => setIsPresetDropdownOpen(false)} 
                />
                <div className="absolute left-0 top-full mt-1.5 w-72 sm:w-80 bg-surface border border-gold/40 rounded-xl shadow-2xl z-50 animate-in fade-in-50 zoom-in-95 duration-150 overflow-hidden">
                  <div className="px-3 py-2 bg-surfaceLight/60 border-b border-border text-[10px] font-mono uppercase tracking-widest text-muted flex items-center justify-between">
                    <span className="font-serif font-bold text-ink">Dashboard Presets</span>
                    <span className="text-gold font-bold">{presets.length} Presets</span>
                  </div>

                  {/* Preset Items */}
                  <div className="max-h-60 overflow-y-auto p-1 space-y-0.5">
                    {presets.map((preset) => {
                      const isActive = preset.id === activePreset.id;
                      return (
                        <button
                          key={preset.id}
                          onClick={() => {
                            setActivePresetId(preset.id);
                            setIsPresetDropdownOpen(false);
                          }}
                          className={`w-full text-left px-2.5 py-2 rounded-lg transition-colors flex items-center justify-between text-xs ${
                            isActive
                              ? 'bg-gold-muted text-gold font-semibold'
                              : 'hover:bg-surfaceLight text-ink'
                          }`}
                        >
                          <div className="flex items-center space-x-2 min-w-0">
                            <span className="text-base shrink-0">{preset.icon}</span>
                            <div className="min-w-0">
                              <div className="font-serif font-bold truncate flex items-center space-x-1.5">
                                <span>{preset.name}</span>
                                {preset.isCustom && (
                                  <span className="text-[8px] font-mono px-1 py-0.2 rounded bg-gold/10 text-gold border border-gold/30 uppercase">
                                    Custom
                                  </span>
                                )}
                              </div>
                              <p className="text-[10px] font-mono text-muted line-clamp-1">
                                {preset.description}
                              </p>
                            </div>
                          </div>
                          {isActive && <Check className="w-3.5 h-3.5 text-gold shrink-0 ml-2" />}
                        </button>
                      );
                    })}
                  </div>

                  {/* Create New Preset Button at the bottom */}
                  <div className="p-1.5 border-t border-border bg-surfaceLight/30">
                    <button
                      onClick={() => {
                        setIsPresetDropdownOpen(false);
                        setIsNewPresetModalOpen(true);
                      }}
                      className="w-full flex items-center justify-center space-x-1.5 py-1.5 px-3 rounded-lg bg-gold/15 hover:bg-gold/25 border border-gold/40 text-gold text-xs font-serif font-bold transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5 text-gold" />
                      <span>Create New Preset</span>
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Right: Description & Customize View */}
          <div className="flex items-center space-x-3">
            <span className="hidden md:inline text-[11px] font-mono text-muted truncate max-w-md">
              <strong className="text-sepia font-serif">{activePreset.name}:</strong> {activePreset.description}
            </span>

            <button
              onClick={() => setIsCustomizeModalOpen(true)}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-surfaceLight hover:bg-border/60 border border-border text-ink text-xs font-mono font-medium transition-all shadow-xs shrink-0"
              title="Toggle or configure widgets for active preset"
            >
              <Settings className="w-3.5 h-3.5 text-gold" />
              <span>Customize View ({activePreset.widgets.length})</span>
            </button>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 🧩 MODULAR WIDGETS RENDERING ENGINE                                      */}
      {/* ========================================================================= */}

      {/* WIDGET 1: SLO & RELIABILITY COVENANT RIBBON */}
      {activePreset.widgets.includes('slo_ribbon') && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-[11px] font-mono uppercase tracking-widest text-muted">
            <span className="font-serif font-bold text-sepia flex items-center space-x-1.5">
              <span>[ 🏛️ I // SLO &amp; RELIABILITY TARGETS // 🏛️ ]</span>
            </span>
            <span className="text-gold font-serif font-bold">✦ OPHANIM OBSERVATORY</span>
          </div>

          <div className="bg-surface border border-gold/40 rounded-3xl overflow-hidden shadow-sm transition-colors duration-200 greek-frame">
            <div className="greek-meander opacity-35" />
            <div className="p-3.5 sm:p-5 flex flex-wrap items-center justify-between gap-3 sm:gap-4 text-xs font-mono">
              <div className="flex items-center space-x-2.5 sm:space-x-3">
                <span className="w-2.5 h-2.5 rounded-full bg-gold celestial-beacon" />
                <span className="text-ink font-serif font-bold text-xs sm:text-sm">SLO TARGET:</span>
                <span className="text-gold font-extrabold text-xs sm:text-sm tracking-wider font-mono">99.9%</span>
                <span className="text-muted text-[10px] hidden sm:inline">(30d Error Budget: 100%)</span>
              </div>

              {/* Desktop Rate Pills */}
              <div className="hidden sm:flex items-center gap-3">
                <div className="w-[180px] shrink-0 flex items-center justify-between px-3.5 py-2 rounded-xl bg-surfaceLight/70 border border-border/70 text-ink shadow-xs">
                  <span className="text-muted font-serif text-[11px] shrink-0">Probe Latency:</span>
                  <span className="text-gold font-bold font-mono tabular-nums text-right w-[70px] shrink-0">~8.4ms</span>
                </div>
                <div className="w-[200px] shrink-0 flex items-center justify-between px-3.5 py-2 rounded-xl bg-surfaceLight/70 border border-border/70 text-ink shadow-xs">
                  <span className="text-muted font-serif text-[11px] shrink-0">Disk I/O Rate:</span>
                  <span className="text-terracotta font-bold font-mono tabular-nums text-right w-[85px] shrink-0">
                    {((metrics?.disk_read_kbps || 0) + (metrics?.disk_write_kbps || 0)).toFixed(0)} KB/s
                  </span>
                </div>
                <div className="w-[200px] shrink-0 flex items-center justify-between px-3.5 py-2 rounded-xl bg-surfaceLight/70 border border-border/70 text-ink shadow-xs">
                  <span className="text-muted font-serif text-[11px] shrink-0">Network Rate:</span>
                  <span className="text-emerald font-bold font-mono tabular-nums text-right w-[85px] shrink-0">
                    {(currentNetRxKBps + currentNetTxKBps).toFixed(0)} KB/s
                  </span>
                </div>
              </div>

              {/* Mobile Rate Pills Strip */}
              <div className="flex sm:hidden w-full items-center gap-2 overflow-x-auto pt-2 border-t border-border/40 text-[10px] font-mono">
                <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-surfaceLight border border-border/60 shrink-0">
                  <span className="text-muted">Probe:</span>
                  <span className="text-gold font-bold">~8.4ms</span>
                </div>
                <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-surfaceLight border border-border/60 shrink-0">
                  <span className="text-muted">Disk:</span>
                  <span className="text-terracotta font-bold">{((metrics?.disk_read_kbps || 0) + (metrics?.disk_write_kbps || 0)).toFixed(0)} KB/s</span>
                </div>
                <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-surfaceLight border border-border/60 shrink-0">
                  <span className="text-muted">Net:</span>
                  <span className="text-emerald font-bold">{(currentNetRxKBps + currentNetTxKBps).toFixed(0)} KB/s</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* WIDGET 2: CLASSICAL OVERVIEW 4-CARD QUAD */}
      {activePreset.widgets.includes('overview_cards') && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {/* I. Cluster Health */}
          <div className="bg-surface border border-border hover:border-gold/60 rounded-2xl sm:rounded-3xl p-3.5 sm:p-5 relative overflow-hidden transition-all shadow-sm group greek-frame">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-1.5">
                <span className="text-[10px] sm:text-xs font-serif text-gold font-bold">I.</span>
                <span className="text-[10px] sm:text-xs font-serif text-muted uppercase tracking-wider font-bold truncate">Health</span>
              </div>
              <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-lg sm:rounded-xl bg-gold-muted border border-gold/40 flex items-center justify-center text-gold shrink-0">
                <Shield className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </div>
            </div>
            <div className="mt-2 sm:mt-3 flex items-baseline space-x-1.5">
              <span className="text-xl sm:text-3xl font-extrabold text-ink font-serif">99.8%</span>
              <span className="text-[9px] sm:text-xs text-emerald font-mono font-bold">ONLINE</span>
            </div>
            <div className="mt-1 sm:mt-2 text-[10px] sm:text-xs text-muted font-serif truncate">
              {safeDevices.filter((d) => d.status === 'online').length} of {safeDevices.length || 1} Online
            </div>
          </div>

          {/* II. Active Incidents */}
          <div 
            onClick={onNavigateToIncidents}
            className="bg-surface border border-border hover:border-crimson/60 rounded-2xl sm:rounded-3xl p-3.5 sm:p-5 relative overflow-hidden cursor-pointer transition-all group shadow-sm greek-frame"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-1.5">
                <span className="text-[10px] sm:text-xs font-serif text-crimson font-bold">II.</span>
                <span className="text-[10px] sm:text-xs font-serif text-muted uppercase tracking-wider font-bold truncate">Incidents</span>
              </div>
              <div className={`w-6 h-6 sm:w-8 sm:h-8 rounded-lg sm:rounded-xl flex items-center justify-center shrink-0 ${safeIncidents.length > 0 ? 'bg-rose-500/10 text-crimson' : 'bg-surfaceLight text-muted'}`}>
                <AlertTriangle className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </div>
            </div>
            <div className="mt-2 sm:mt-3 flex items-baseline space-x-1.5">
              <span className={`text-xl sm:text-3xl font-extrabold font-serif ${safeIncidents.length > 0 ? 'text-crimson' : 'text-ink'}`}>
                {safeIncidents.length}
              </span>
              {safeIncidents.length > 0 ? (
                <span className="text-[9px] sm:text-xs text-crimson font-mono font-bold">ACTIVE</span>
              ) : (
                <span className="text-[9px] sm:text-xs text-emerald font-mono font-medium">CLEAR</span>
              )}
            </div>
            <div className="mt-1 sm:mt-2 text-[10px] sm:text-xs text-muted flex items-center space-x-1 group-hover:text-gold transition-colors font-serif font-medium truncate">
              <span>Review Alerts</span>
              <ArrowUpRight className="w-2.5 h-2.5" />
            </div>
          </div>

          {/* III. Containers */}
          <div className="bg-surface border border-border hover:border-gold/60 rounded-2xl sm:rounded-3xl p-3.5 sm:p-5 relative overflow-hidden transition-all shadow-sm group greek-frame">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-1.5">
                <span className="text-[10px] sm:text-xs font-serif text-terracotta font-bold">III.</span>
                <span className="text-[10px] sm:text-xs font-serif text-muted uppercase tracking-wider font-bold truncate">Vessels</span>
              </div>
              <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-lg sm:rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-terracotta shrink-0">
                <Box className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </div>
            </div>
            <div className="mt-2 sm:mt-3 flex items-baseline space-x-1.5">
              <span className="text-xl sm:text-3xl font-extrabold text-ink font-serif">{safeContainers.length}</span>
              <span className="text-[9px] sm:text-xs text-muted font-mono">TOTAL</span>
            </div>
            <div className="mt-1 sm:mt-2 text-[10px] sm:text-xs text-muted font-mono truncate">
              <span className="text-emerald font-bold">{runningContainers} Active</span> • {stoppedContainers} Idle
            </div>
          </div>

          {/* IV. Topology */}
          <div 
            onClick={onNavigateToTopology}
            className="bg-surface border border-border hover:border-gold/60 rounded-2xl sm:rounded-3xl p-3.5 sm:p-5 relative overflow-hidden cursor-pointer transition-all group shadow-sm greek-frame"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-1.5">
                <span className="text-[10px] sm:text-xs font-serif text-gold font-bold">IV.</span>
                <span className="text-[10px] sm:text-xs font-serif text-muted uppercase tracking-wider font-bold truncate">Topology</span>
              </div>
              <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-lg sm:rounded-xl bg-gold-muted border border-gold/40 flex items-center justify-center text-gold shrink-0">
                <Orbit className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </div>
            </div>
            <div className="mt-2 sm:mt-3 flex items-baseline space-x-1.5">
              <span className="text-xl sm:text-3xl font-extrabold text-ink font-serif">Active</span>
              <span className="text-[9px] sm:text-xs text-gold font-mono font-medium">READY</span>
            </div>
            <div className="mt-1 sm:mt-2 text-[10px] sm:text-xs text-muted flex items-center space-x-1 group-hover:text-gold transition-colors font-serif font-medium truncate">
              <span>Explore DAG</span>
              <ArrowUpRight className="w-2.5 h-2.5" />
            </div>
          </div>
        </div>
      )}

      {/* WIDGET 3: HOST TELEMETRY & HARDWARE SENSORS */}
      {activePreset.widgets.includes('host_telemetry') && (
        <div className="space-y-2 relative z-20">
          <div className="flex items-center justify-between text-[10px] sm:text-[11px] font-mono uppercase tracking-widest text-muted">
            <span className="font-serif font-bold text-sepia flex items-center space-x-1.5 truncate">
              <span>[ 🏛️ II // HOST TELEMETRY &amp; HARDWARE SENSORS // 🏛️ ]</span>
            </span>
            <div className="flex items-center space-x-3">
              <span className="text-gold font-serif font-bold hidden sm:inline shrink-0">
                {activeMetrics ? '1Hz LIVE SMT SAMPLING' : 'TELEMETRY OFFLINE (N/A)'}
              </span>
            </div>
          </div>

          <div className="bg-surface border border-border rounded-3xl shadow-sm transition-colors duration-200 greek-frame relative z-20">
            <div className="greek-meander opacity-35 rounded-t-3xl" />
            <div className="p-4 sm:p-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-5">
                <div className="flex flex-wrap items-center gap-2.5 min-w-0">
                  <div className="flex items-center space-x-2">
                    <Eye className="w-4 h-4 text-gold shrink-0" />
                    <span className="font-serif font-bold text-ink text-sm sm:text-base tracking-wide">
                      Host Telemetry:
                    </span>
                  </div>
                  {renderNodeSelectorDropdown('host')}
                  <span className="text-[11px] text-muted font-mono hidden lg:inline">
                    {activeMetrics ? (
                      `• Kernel: ${activeMetrics.os ? activeMetrics.os.split('#')[0].trim() : 'Linux'} • Uptime: ${Math.floor((activeMetrics.uptime_seconds || 0) / 3600)}h ${Math.floor(((activeMetrics.uptime_seconds || 0) % 3600) / 60)}m`
                    ) : (
                      `• Status: Telemetry stream unavailable (N/A)`
                    )}
                  </span>
                </div>

                <div className="flex items-center space-x-2 shrink-0">
                  {activeMetrics?.cpu_temperature !== undefined && activeMetrics.cpu_temperature > 0 && (
                    <span className="flex items-center space-x-1.5 text-xs font-mono px-3 py-1.5 rounded-xl bg-surfaceLight border border-amber-500/30 text-terracotta font-semibold">
                      <Activity className="w-3.5 h-3.5 text-terracotta" />
                      <span>{activeMetrics.cpu_temperature.toFixed(1)}°C</span>
                    </span>
                  )}
                  {activeMetrics && (
                    <button
                      type="button"
                      onClick={() => setIsHardwareOpen(true)}
                      className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-gold-muted hover:bg-gold/20 text-gold border border-gold/40 text-xs font-bold transition-all shadow-sm font-mono cursor-pointer"
                    >
                      <Zap className="w-3.5 h-3.5 text-gold" />
                      <span>Hardware Inspector</span>
                    </button>
                  )}
                </div>
              </div>

              {!activeMetrics ? (
                <div className="p-8 bg-surfaceLight/40 border border-dashed border-border rounded-2xl text-center space-y-2 font-mono text-xs text-muted">
                  <Cpu className="w-8 h-8 text-muted/40 mx-auto" />
                  <p className="text-ink font-serif font-bold text-sm">Telemetry Unavailable (N/A)</p>
                  <p className="text-muted max-w-md mx-auto text-[11px]">
                    No telemetry reported for {currentSelectedMeta.label}. An active edge agent or configured API token is required.
                  </p>
                </div>
              ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {/* CPU */}
                <div 
                  onClick={() => setIsHardwareOpen(true)}
                  className="bg-surfaceLight/70 border border-border hover:border-gold/50 rounded-2xl p-4 cursor-pointer transition-all group shadow-sm"
                >
                  <div className="flex items-center justify-between text-xs mb-2">
                    <span className="text-sepia flex items-center space-x-1.5 group-hover:text-gold font-serif font-bold">
                      <Cpu className="w-3.5 h-3.5 text-gold" />
                      <span>CPU Load ({activeMetrics.cpu_cores || 4} Cores)</span>
                    </span>
                    <span className="font-bold text-ink font-mono">{activeMetrics.cpu_usage_percent.toFixed(1)}%</span>
                  </div>
                  <div className="w-full h-2 bg-inset rounded-full overflow-hidden">
                    <div 
                      className={`h-full rounded-full transition-all duration-500 ${
                        activeMetrics.cpu_usage_percent > 85 ? 'bg-crimson' : activeMetrics.cpu_usage_percent > 60 ? 'bg-terracotta' : 'bg-gold'
                      }`}
                      style={{ width: `${Math.min(activeMetrics.cpu_usage_percent, 100)}%` }}
                    />
                  </div>
                  <div className="mt-2 text-[10px] text-muted font-mono flex items-center justify-between">
                    <span className="group-hover:text-gold transition-colors font-medium">Inspect 1Hz Stream</span>
                    <span>Load: {(activeMetrics.load_avg_1 || 0).toFixed(1)}, {(activeMetrics.load_avg_5 || 0).toFixed(1)}</span>
                  </div>
                </div>

                {/* Memory */}
                <div 
                  onClick={() => setIsHardwareOpen(true)}
                  className="bg-surfaceLight/70 border border-border hover:border-gold/50 rounded-2xl p-4 cursor-pointer transition-all group shadow-sm"
                >
                  <div className="flex items-center justify-between text-xs mb-2">
                    <span className="text-sepia flex items-center space-x-1.5 group-hover:text-gold font-serif font-bold">
                      <Activity className="w-3.5 h-3.5 text-terracotta" />
                      <span>RAM</span>
                    </span>
                    <span className="font-bold text-ink font-mono">
                      {activeMetrics.memory_total_mb < 1024
                        ? `${activeMetrics.memory_used_mb}MB / ${activeMetrics.memory_total_mb}MB (${activeMetrics.memory_percent.toFixed(0)}%)`
                        : `${(activeMetrics.memory_used_mb / 1024).toFixed(1)}G / ${(activeMetrics.memory_total_mb / 1024).toFixed(0)}G (${activeMetrics.memory_percent.toFixed(0)}%)`}
                    </span>
                  </div>
                  <div className="w-full h-2 bg-inset rounded-full overflow-hidden">
                    <div 
                      className={`h-full rounded-full transition-all duration-500 ${
                        activeMetrics.memory_percent > 90 ? 'bg-crimson' : activeMetrics.memory_percent > 75 ? 'bg-terracotta' : 'bg-amber-500'
                      }`}
                      style={{ width: `${Math.min(activeMetrics.memory_percent, 100)}%` }}
                    />
                  </div>
                  <div className="mt-2 text-[10px] text-muted font-mono flex items-center justify-between">
                    <span>Free: {activeMetrics.memory_total_mb < 1024 
                      ? `${activeMetrics.memory_total_mb - activeMetrics.memory_used_mb}MB` 
                      : `${((activeMetrics.memory_total_mb - activeMetrics.memory_used_mb) / 1024).toFixed(1)}GB`}</span>
                    <span>Swap: {activeMetrics.swap_percent ? `${activeMetrics.swap_percent.toFixed(0)}%` : '0%'}</span>
                  </div>
                </div>

                {/* Storage */}
                <div 
                  onClick={() => setIsHardwareOpen(true)}
                  className="bg-surfaceLight/70 border border-border hover:border-gold/50 rounded-2xl p-4 cursor-pointer transition-all group shadow-sm sm:col-span-2 lg:col-span-1"
                >
                  <div className="flex items-center justify-between text-xs mb-2">
                    <span className="text-sepia flex items-center space-x-1.5 group-hover:text-gold font-serif font-bold">
                      <HardDrive className="w-3.5 h-3.5 text-gold" />
                      <span>Storage Capacity</span>
                    </span>
                    <span className="font-bold text-ink font-mono">
                      {activeMetrics.disk_total_gb < 1
                        ? `${(activeMetrics.disk_used_gb * 1024).toFixed(0)}MB / ${(activeMetrics.disk_total_gb * 1024).toFixed(0)}MB (${(activeMetrics.disk_percent || 0).toFixed(0)}%)`
                        : `${(activeMetrics.disk_used_gb || 0).toFixed(1)}G / ${(activeMetrics.disk_total_gb || 0).toFixed(0)}G (${(activeMetrics.disk_percent || 0).toFixed(0)}%)`}
                    </span>
                  </div>
                  <div className="w-full h-2 bg-inset rounded-full overflow-hidden">
                    <div 
                      className={`h-full rounded-full transition-all duration-500 ${
                        (activeMetrics.disk_percent || 0) > 90 ? 'bg-crimson' : (activeMetrics.disk_percent || 0) > 75 ? 'bg-terracotta' : 'bg-emerald'
                      }`}
                      style={{ width: `${Math.min(activeMetrics.disk_percent || 0, 100)}%` }}
                    />
                  </div>
                  <div className="mt-2 text-[10px] text-muted font-mono flex items-center justify-between">
                    <span>Cached (5m Interval)</span>
                    <span>I/O: {(activeMetrics.disk_read_kbps || 0).toFixed(0)} KB/s</span>
                  </div>
                </div>
              </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* WIDGET 4: EMBEDDED 20-CORE SMT HEATMAP MATRIX */}
      {activePreset.widgets.includes('hardware_smt') && activeMetrics && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-[10px] sm:text-[11px] font-mono uppercase tracking-widest text-muted">
            <span className="font-serif font-bold text-sepia flex items-center space-x-1.5 truncate">
              <span>[ ⚡ SMT CORES // {currentSelectedMeta.label} HARDWARE UTILIZATION MATRIX // ⚡ ]</span>
            </span>
            <span className="text-gold font-serif font-bold">1Hz LIVE THREAD MATRIX</span>
          </div>

          <div className="bg-surface border border-gold/40 rounded-3xl p-5 shadow-sm greek-frame space-y-4">
            <div className="greek-meander opacity-35 -mx-5 -mt-5 mb-4" />
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center space-x-2">
                <Cpu className="w-4 h-4 text-gold" />
                <span className="text-sm font-bold text-ink font-serif">Simultaneous Multithreading (SMT) Cores</span>
              </div>
              <div className="flex items-center space-x-3 text-xs font-mono">
                <span className="text-muted">Package: <strong className="text-terracotta font-bold">{activeMetrics.cpu_temperature ? `${activeMetrics.cpu_temperature.toFixed(1)}°C` : '52°C'}</strong></span>
                <span className="text-muted">Load 1m: <strong className="text-gold font-bold">{(activeMetrics.load_avg_1 || 0).toFixed(2)}</strong></span>
              </div>
            </div>

            <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-10 gap-2.5">
              {Array.from({ length: activeMetrics.cpu_cores || 4 }).map((_, i) => {
                const coreVal = (activeMetrics.cpu_cores_usage && activeMetrics.cpu_cores_usage[i] !== undefined)
                  ? activeMetrics.cpu_cores_usage[i]
                  : activeMetrics.cpu_usage_percent || 0;
                const isHigh = coreVal > 75;
                const isMed = coreVal > 40;

                return (
                  <div key={i} className="bg-surfaceLight/80 border border-border/80 rounded-xl p-2 text-center space-y-1">
                    <span className="text-[10px] font-mono text-muted block">C{i}</span>
                    <div className="h-10 w-full bg-inset rounded-md flex flex-col justify-end p-0.5 overflow-hidden">
                      <div 
                        className={`w-full rounded-sm transition-all duration-300 ${
                          isHigh ? 'bg-crimson' : isMed ? 'bg-terracotta' : 'bg-gold'
                        }`}
                        style={{ height: `${coreVal}%` }}
                      />
                    </div>
                    <span className="text-[10px] font-mono font-bold text-ink block">{coreVal.toFixed(0)}%</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* WIDGET 5: TOP 5 RESOURCE CONSUMING VESSELS LEADERBOARDS */}
      {activePreset.widgets.includes('top_containers') && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-[10px] sm:text-[11px] font-mono uppercase tracking-widest text-muted">
            <span className="font-serif font-bold text-sepia flex items-center space-x-1.5 truncate">
              <span>[ 📦 TOP RESOURCE CONSUMERS // LEADERBOARDS // 📦 ]</span>
            </span>
            <span className="text-terracotta font-serif font-bold">RESOURCE RANKINGS</span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Top 5 CPU */}
            <div className="bg-surface border border-border rounded-3xl p-5 shadow-sm greek-frame space-y-3">
              <div className="greek-meander opacity-35 -mx-5 -mt-5 mb-3" />
              <div className="flex items-center justify-between border-b border-border pb-2.5">
                <div className="flex items-center space-x-2">
                  <Flame className="w-4 h-4 text-gold" />
                  <h4 className="font-serif font-bold text-sm text-ink">Top 5 by CPU Utilization</h4>
                </div>
                <span className="text-[10px] font-mono text-muted uppercase">REAL-TIME</span>
              </div>
              <div className="space-y-2.5 font-mono text-xs">
                {topCpuContainers.map((c, idx) => (
                  <div key={c.id + c.name} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2 min-w-0">
                        <span className="text-[10px] text-muted w-4 font-bold">{idx + 1}.</span>
                        <span className="font-bold text-ink truncate max-w-[180px]">{c.name}</span>
                        <span className="text-[9px] px-1.5 py-0.2 rounded bg-surfaceLight border border-border text-muted uppercase">{c.node_id || 'local'}</span>
                      </div>
                      <span className="font-bold text-gold tabular-nums">{c.cpu_percent ? c.cpu_percent.toFixed(1) : '0.1'}%</span>
                    </div>
                    <div className="w-full h-1.5 bg-inset rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-gold rounded-full transition-all"
                        style={{ width: `${Math.min(c.cpu_percent || 1, 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Top 5 Memory */}
            <div className="bg-surface border border-border rounded-3xl p-5 shadow-sm greek-frame space-y-3">
              <div className="greek-meander opacity-35 -mx-5 -mt-5 mb-3" />
              <div className="flex items-center justify-between border-b border-border pb-2.5">
                <div className="flex items-center space-x-2">
                  <Activity className="w-4 h-4 text-terracotta" />
                  <h4 className="font-serif font-bold text-sm text-ink">Top 5 by RAM Allocation</h4>
                </div>
                <span className="text-[10px] font-mono text-muted uppercase">RAM USAGE</span>
              </div>
              <div className="space-y-2.5 font-mono text-xs">
                {topMemContainers.map((c, idx) => (
                  <div key={c.id + c.name} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2 min-w-0">
                        <span className="text-[10px] text-muted w-4 font-bold">{idx + 1}.</span>
                        <span className="font-bold text-ink truncate max-w-[180px]">{c.name}</span>
                        <span className="text-[9px] px-1.5 py-0.2 rounded bg-surfaceLight border border-border text-muted uppercase">{c.node_id || 'local'}</span>
                      </div>
                      <span className="font-bold text-amber-600 dark:text-amber-400 tabular-nums">{c.memory_usage_mb ? c.memory_usage_mb.toFixed(0) : '32'} MB</span>
                    </div>
                    <div className="w-full h-1.5 bg-inset rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-amber-500 rounded-full transition-all"
                        style={{ width: `${Math.min(c.memory_percent || 2, 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* WIDGET 6: LIVING VESSELS STATUS GRID / TILE WALL */}
      {activePreset.widgets.includes('container_matrix') && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-[10px] sm:text-[11px] font-mono uppercase tracking-widest text-muted">
            <span className="font-serif font-bold text-sepia flex items-center space-x-1.5 truncate">
              <span>[ 📦 VESSEL MATRIX // HIGH-DENSITY CONTAINER &amp; VM STATUS // 📦 ]</span>
            </span>
            <span className="text-emerald font-serif font-bold">{safeContainers.length} VESSELS MONITORED</span>
          </div>

          <div className="bg-surface border border-border rounded-3xl p-5 shadow-sm greek-frame space-y-4">
            <div className="greek-meander opacity-35 -mx-5 -mt-5 mb-4" />
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {safeContainers.map((c) => {
                const isRunning = c.state === 'running';
                return (
                  <div
                    key={c.id + c.name + c.node_id}
                    className={`p-3 rounded-2xl border transition-all text-xs font-mono space-y-1.5 ${
                      isRunning 
                        ? 'bg-surfaceLight/70 border-border hover:border-gold/50' 
                        : 'bg-inset/60 border-border/70 opacity-70'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${isRunning ? 'bg-emerald celestial-beacon' : 'bg-muted'}`} />
                      <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded uppercase ${
                        isRunning ? 'bg-emerald/10 text-emerald' : 'bg-inset text-muted'
                      }`}>
                        {c.state}
                      </span>
                    </div>
                    <div className="font-bold text-ink truncate text-xs" title={c.name}>{c.name}</div>
                    <div className="flex items-center justify-between text-[10px] text-muted pt-1 border-t border-border/50">
                      <span>{c.cpu_percent ? `${c.cpu_percent.toFixed(0)}%` : '0%'}</span>
                      <span>{c.memory_usage_mb ? `${c.memory_usage_mb.toFixed(0)}MB` : '-'}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* WIDGET 7: DEDICATED NETWORK BUS OBSERVABILITY */}
      {activePreset.widgets.includes('network_bus') && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-[10px] sm:text-[11px] font-mono uppercase tracking-widest text-muted">
            <span className="font-serif font-bold text-sepia flex items-center space-x-1.5 truncate">
              <span>[ 🏛️ III // NETWORK BUS &amp; TRAFFIC THROUGHPUT // 🏛️ ]</span>
            </span>
            <span className="text-lapis font-serif font-bold hidden sm:inline shrink-0">LIVE SOCKET TELEMETRY</span>
          </div>

          <div className="bg-surface border border-border rounded-3xl overflow-hidden shadow-sm transition-colors duration-200 greek-frame">
            <div className="greek-meander opacity-35" />
            <div className="p-4 sm:p-6 space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-2xl bg-lapis/10 border border-lapis/30 flex items-center justify-center text-lapis">
                    <Globe className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-serif font-bold text-ink text-base">{currentSelectedMeta.label} Network Bus Observatory</h3>
                    <p className="text-xs text-muted font-mono mt-0.5">Live socket throughput rates, interface status, and cumulative bandwidth on {currentSelectedMeta.platform}</p>
                  </div>
                </div>
                <div className="flex items-center space-x-2 font-mono text-xs">
                  {activeMetrics ? (
                    <span className="px-3 py-1 rounded-xl bg-emerald/10 text-emerald border border-emerald/30 font-bold flex items-center space-x-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald celestial-beacon" />
                      <span>INTERFACES HEALTHY</span>
                    </span>
                  ) : (
                    <span className="px-3 py-1 rounded-xl bg-surfaceLight text-muted border border-border font-bold flex items-center space-x-1.5">
                      <span className="w-2 h-2 rounded-full bg-muted" />
                      <span>OFFLINE / NO DATA (N/A)</span>
                    </span>
                  )}
                </div>
              </div>

              {/* Inbound & Outbound Bandwidth Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 font-mono text-xs">
                {/* Inbound Rate */}
                <div className="bg-surfaceLight/70 border border-border rounded-2xl p-4 space-y-1 shadow-sm">
                  <div className="flex items-center justify-between text-muted">
                    <span className="font-serif font-bold flex items-center space-x-1 text-lapis">
                      <ArrowDownLeft className="w-3.5 h-3.5" />
                      <span>Inbound Rate (Rx)</span>
                    </span>
                    <span className="text-[10px] text-lapis font-bold bg-lapis/10 px-1.5 py-0.5 rounded">
                      {activeMetrics ? '1Hz' : 'N/A'}
                    </span>
                  </div>
                  <div className="text-2xl font-bold text-ink">
                    {activeMetrics ? (
                      currentNetRxKBps > 1024 
                        ? `${(currentNetRxKBps / 1024).toFixed(2)} MB/s` 
                        : `${currentNetRxKBps.toFixed(1)} KB/s`
                    ) : (
                      'N/A'
                    )}
                  </div>
                  <p className="text-[10px] text-muted font-mono">Real-time packet ingress rate</p>
                </div>

                {/* Outbound Rate */}
                <div className="bg-surfaceLight/70 border border-border rounded-2xl p-4 space-y-1 shadow-sm">
                  <div className="flex items-center justify-between text-muted">
                    <span className="font-serif font-bold flex items-center space-x-1 text-gold">
                      <ArrowUpRight className="w-3.5 h-3.5" />
                      <span>Outbound Rate (Tx)</span>
                    </span>
                    <span className="text-[10px] text-gold font-bold bg-gold-muted px-1.5 py-0.5 rounded">
                      {activeMetrics ? '1Hz' : 'N/A'}
                    </span>
                  </div>
                  <div className="text-2xl font-bold text-ink">
                    {activeMetrics ? (
                      currentNetTxKBps > 1024 
                        ? `${(currentNetTxKBps / 1024).toFixed(2)} MB/s` 
                        : `${currentNetTxKBps.toFixed(1)} KB/s`
                    ) : (
                      'N/A'
                    )}
                  </div>
                  <p className="text-[10px] text-muted font-mono">Real-time packet egress rate</p>
                </div>

                {/* Cumulative Inbound */}
                <div className="bg-surfaceLight/70 border border-border rounded-2xl p-4 space-y-1 shadow-sm">
                  <div className="flex items-center justify-between text-muted">
                    <span className="font-serif font-bold flex items-center space-x-1 text-sepia">
                      <Globe className="w-3.5 h-3.5 text-lapis" />
                      <span>Total Ingress (Boot)</span>
                    </span>
                  </div>
                  <div className="text-2xl font-bold text-ink">{activeMetrics ? `${totalNetRxGB} GB` : 'N/A'}</div>
                  <p className="text-[10px] text-muted font-mono">Total received bytes since boot</p>
                </div>

                {/* Cumulative Outbound */}
                <div className="bg-surfaceLight/70 border border-border rounded-2xl p-4 space-y-1 shadow-sm">
                  <div className="flex items-center justify-between text-muted">
                    <span className="font-serif font-bold flex items-center space-x-1 text-sepia">
                      <Globe className="w-3.5 h-3.5 text-gold" />
                      <span>Total Egress (Boot)</span>
                    </span>
                  </div>
                  <div className="text-2xl font-bold text-ink">{activeMetrics ? `${totalNetTxGB} GB` : 'N/A'}</div>
                  <p className="text-[10px] text-muted font-mono">Total transmitted bytes since boot</p>
                </div>
              </div>

              {/* Dynamic Granular Network Interfaces Grid */}
              <div className="space-y-3 pt-2">
                {(() => {
                  const rawIfaces = activeMetrics?.network_interfaces || [];

                  // Deterministic tier ranking to prevent ANY shuffling
                  const getInterfaceTier = (iface: typeof rawIfaces[0]) => {
                    const n = (iface.name || '').toLowerCase();
                    const t = (iface.type || '').toLowerCase();
                    if (t.includes('wan') || n.includes('wan') || n.includes('pppoe')) return 1;
                    if (t.includes('lan') || n.includes('br-lan') || n === 'lan') return 2;
                    if (t.includes('physical') || n.startsWith('eth') || n.startsWith('eno') || n.startsWith('ens') || n.startsWith('enp') || n.startsWith('lan') || n.startsWith('net')) return 3;
                    if (t.includes('hypervisor') || n.startsWith('vmbr') || n.startsWith('bond')) return 4;
                    if (t.includes('wireless') || n.startsWith('wlan') || n.startsWith('phy') || n.startsWith('ath') || n.startsWith('ra')) return 5;
                    if (t.includes('vpn') || n.startsWith('tailscale') || n.startsWith('wg') || n.startsWith('tun')) return 6;
                    if (n === 'docker0') return 7;
                    if (n.startsWith('br-')) return 8;
                    if (n.startsWith('veth')) return 9;
                    return 10;
                  };

                  const isMajorUplink = (iface: typeof rawIfaces[0]) => {
                    const tier = getInterfaceTier(iface);
                    return tier <= 7;
                  };

                  // Stably sorted interfaces
                  const sortedAllIfaces = [...rawIfaces].sort((a, b) => {
                    const tierA = getInterfaceTier(a);
                    const tierB = getInterfaceTier(b);
                    if (tierA !== tierB) return tierA - tierB;
                    return a.name.localeCompare(b.name);
                  });

                  const filteredIfaces = netSocketFilter === 'uplinks' && sortedAllIfaces.some(isMajorUplink)
                    ? sortedAllIfaces.filter(isMajorUplink)
                    : sortedAllIfaces;

                  const maxIfRx = Math.max(...filteredIfaces.map(i => i.rx_rate_kbps || 0), 1);
                  const maxIfTx = Math.max(...filteredIfaces.map(i => i.tx_rate_kbps || 0), 1);

                  return (
                    <>
                      {/* Section Subheader & Controls */}
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2 text-xs font-mono">
                        <div className="flex items-center space-x-2">
                          <Network className="w-4 h-4 text-lapis" />
                          <span className="font-serif font-bold text-ink text-sm">Active Network Interfaces &amp; Bus Sockets</span>
                          <span className="px-2 py-0.5 rounded-md bg-surfaceLight border border-border text-[10px] text-muted font-bold">
                            {rawIfaces.length > 0 ? `${rawIfaces.length} Total Sockets` : 'N/A'}
                          </span>
                        </div>

                        {rawIfaces.length > 0 && (
                          <div className="flex items-center space-x-2">
                            {/* Filter Pills */}
                            {!isNetSocketsCollapsed && rawIfaces.length > 4 && (
                              <div className="flex items-center bg-surfaceLight border border-border rounded-xl p-0.5 text-[10px]">
                                <button
                                  type="button"
                                  onClick={() => setNetSocketFilter('uplinks')}
                                  className={`px-2 py-1 rounded-lg transition-all ${
                                    netSocketFilter === 'uplinks'
                                      ? 'bg-gold/20 text-gold font-bold shadow-xs'
                                      : 'text-muted hover:text-ink'
                                  }`}
                                >
                                  Uplinks &amp; Ports ({sortedAllIfaces.filter(isMajorUplink).length})
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setNetSocketFilter('all')}
                                  className={`px-2 py-1 rounded-lg transition-all ${
                                    netSocketFilter === 'all'
                                      ? 'bg-gold/20 text-gold font-bold shadow-xs'
                                      : 'text-muted hover:text-ink'
                                  }`}
                                >
                                  All Sockets ({rawIfaces.length})
                                </button>
                              </div>
                            )}

                            {/* Collapse / Expand Toggle Button */}
                            <button
                              type="button"
                              onClick={() => setIsNetSocketsCollapsed(prev => !prev)}
                              className="flex items-center space-x-1 px-2.5 py-1 rounded-xl bg-surfaceLight hover:bg-gold/10 border border-border hover:border-gold/40 text-ink text-[11px] font-serif transition-all cursor-pointer shadow-xs"
                              title={isNetSocketsCollapsed ? "Expand network sockets matrix" : "Collapse network sockets matrix to save space"}
                            >
                              {isNetSocketsCollapsed ? (
                                <>
                                  <Eye className="w-3.5 h-3.5 text-gold" />
                                  <span>Show Sockets ({rawIfaces.length})</span>
                                  <ChevronDown className="w-3 h-3 text-muted" />
                                </>
                              ) : (
                                <>
                                  <EyeOff className="w-3.5 h-3.5 text-muted" />
                                  <span>Hide Sockets</span>
                                  <ChevronUp className="w-3 h-3 text-muted" />
                                </>
                              )}
                            </button>
                          </div>
                        )}
                      </div>

                      {rawIfaces.length === 0 ? (
                        <div className="p-6 bg-surfaceLight/40 border border-dashed border-border rounded-2xl text-center space-y-2 font-mono text-xs text-muted">
                          <Network className="w-6 h-6 text-muted/50 mx-auto" />
                          <p className="text-ink font-serif font-bold">No Sockets Available</p>
                          <p className="text-[11px] text-muted max-w-md mx-auto">
                            Interface socket metrics are not available for {currentSelectedMeta.label} (N/A).
                          </p>
                        </div>
                      ) : isNetSocketsCollapsed ? (
                        /* Collapsed Summary Banner */
                        <div 
                          onClick={() => setIsNetSocketsCollapsed(false)}
                          className="p-3 bg-surfaceLight/60 hover:bg-gold/5 border border-dashed border-border hover:border-gold/40 rounded-2xl flex items-center justify-between text-xs font-mono cursor-pointer transition-all group"
                        >
                          <div className="flex items-center space-x-2 text-muted">
                            <span className="w-2 h-2 rounded-full bg-emerald celestial-beacon" />
                            <span>
                              <strong className="text-ink">{rawIfaces.length} network sockets</strong> operational on {currentSelectedMeta.label} ({sortedAllIfaces.filter(isMajorUplink).length} primary uplinks / physical interfaces)
                            </span>
                          </div>
                          <span className="text-[11px] text-gold group-hover:underline flex items-center space-x-1">
                            <span>Click to expand socket details</span>
                            <ChevronDown className="w-3.5 h-3.5" />
                          </span>
                        </div>
                      ) : (
                        /* Expanded Dynamic Sockets Grid */
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 font-mono text-xs">
                          {filteredIfaces.map((iface) => {
                            const isWAN = (iface.type && iface.type.includes('WAN')) || iface.name.includes('wan') || iface.name.includes('pppoe');
                            const isLAN = (iface.type && iface.type.includes('LAN')) || iface.name.includes('br-lan') || iface.name.includes('lan');
                            const isWLAN = (iface.type && iface.type.includes('Wireless')) || iface.name.includes('wlan') || iface.name.includes('phy');
                            const isVPN = (iface.type && iface.type.includes('VPN')) || iface.name.includes('tailscale') || iface.name.includes('wg');

                            const ifRxMB = (iface.rx_bytes / (1024 * 1024)).toFixed(0);
                            const ifTxMB = (iface.tx_bytes / (1024 * 1024)).toFixed(0);

                            return (
                              <div 
                                key={iface.name} 
                                className="bg-surfaceLight/80 border border-border hover:border-gold/50 rounded-2xl p-3.5 space-y-2.5 transition-all shadow-xs group"
                              >
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center space-x-2 min-w-0">
                                    <div className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 ${
                                      isWAN ? 'bg-amber-500/10 text-amber-500 border border-amber-500/30' :
                                      isLAN ? 'bg-lapis/10 text-lapis border border-lapis/30' :
                                      isWLAN ? 'bg-teal-500/10 text-teal-400 border border-teal-500/30' :
                                      isVPN ? 'bg-purple-500/10 text-purple-400 border border-purple-500/30' :
                                      'bg-surface border border-border text-muted'
                                    }`}>
                                      {isWAN ? <Globe className="w-3.5 h-3.5" /> :
                                       isWLAN ? <Radio className="w-3.5 h-3.5" /> :
                                       isVPN ? <Shield className="w-3.5 h-3.5" /> :
                                       <Network className="w-3.5 h-3.5" />}
                                    </div>
                                    <div className="min-w-0">
                                      <span className="font-bold text-ink text-xs font-mono truncate block group-hover:text-gold transition-colors">
                                        {iface.name}
                                      </span>
                                      <span className="text-[10px] text-muted font-sans block truncate">
                                        {iface.type || 'Physical Interface'}
                                      </span>
                                    </div>
                                  </div>

                                  <span className={`px-2 py-0.5 rounded-lg text-[9px] font-mono font-bold flex items-center space-x-1 shrink-0 ${
                                    iface.is_up !== false
                                      ? 'bg-emerald/10 text-emerald border border-emerald/30'
                                      : 'bg-inset text-muted border border-border'
                                  }`}>
                                    <span className={`w-1.5 h-1.5 rounded-full ${iface.is_up !== false ? 'bg-emerald celestial-beacon' : 'bg-muted'}`} />
                                    <span>{iface.is_up !== false ? 'LINK UP' : 'DOWN'}</span>
                                  </span>
                                </div>

                                {/* Rx and Tx Throughput Meters */}
                                <div className="space-y-1.5 pt-1 text-[11px]">
                                  {/* Rx */}
                                  <div className="space-y-0.5">
                                    <div className="flex items-center justify-between text-muted">
                                      <span className="flex items-center space-x-1 text-lapis font-medium">
                                        <ArrowDownLeft className="w-3 h-3" />
                                        <span>Rx Ingress</span>
                                      </span>
                                      <span className="text-ink font-bold tabular-nums">
                                        {iface.rx_rate_kbps > 1024 
                                          ? `${(iface.rx_rate_kbps / 1024).toFixed(2)} MB/s` 
                                          : `${iface.rx_rate_kbps.toFixed(1)} KB/s`}
                                      </span>
                                    </div>
                                    <div className="w-full h-1.5 bg-inset rounded-full overflow-hidden">
                                      <div 
                                        className="h-full bg-gradient-to-r from-lapis to-sky-400 rounded-full transition-all duration-500"
                                        style={{ width: `${Math.min(100, Math.max(3, (iface.rx_rate_kbps / maxIfRx) * 100))}%` }}
                                      />
                                    </div>
                                  </div>

                                  {/* Tx */}
                                  <div className="space-y-0.5">
                                    <div className="flex items-center justify-between text-muted">
                                      <span className="flex items-center space-x-1 text-gold font-medium">
                                        <ArrowUpRight className="w-3 h-3" />
                                        <span>Tx Egress</span>
                                      </span>
                                      <span className="text-ink font-bold tabular-nums">
                                        {iface.tx_rate_kbps > 1024 
                                          ? `${(iface.tx_rate_kbps / 1024).toFixed(2)} MB/s` 
                                          : `${iface.tx_rate_kbps.toFixed(1)} KB/s`}
                                      </span>
                                    </div>
                                    <div className="w-full h-1.5 bg-inset rounded-full overflow-hidden">
                                      <div 
                                        className="h-full bg-gradient-to-r from-amber-600 to-gold rounded-full transition-all duration-500"
                                        style={{ width: `${Math.min(100, Math.max(3, (iface.tx_rate_kbps / maxIfTx) * 100))}%` }}
                                      />
                                    </div>
                                  </div>
                                </div>

                                {/* Lifetime transfer footer */}
                                <div className="pt-1.5 border-t border-border flex items-center justify-between text-[10px] text-muted">
                                  <span>Boot Rx: <strong className="text-ink font-mono">{ifRxMB} MB</strong></span>
                                  <span>Boot Tx: <strong className="text-ink font-mono">{ifTxMB} MB</strong></span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* WIDGET 8: TIME-SERIES TELEMETRY & TRENDS */}
      {activePreset.widgets.includes('timeseries_charts') && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-[10px] sm:text-[11px] font-mono uppercase tracking-widest text-muted">
            <span className="font-serif font-bold text-sepia flex items-center space-x-1.5 truncate">
              <span>[ 🏛️ IV // TIME-SERIES TELEMETRY &amp; TRENDS // 🏛️ ]</span>
            </span>
            <span className="text-gold font-serif font-bold">HISTORICAL OBSERVABILITY</span>
          </div>

          <div className="bg-surface border border-border rounded-3xl p-5 shadow-sm greek-frame">
            <div className="greek-meander opacity-35 -mx-5 -mt-5 mb-4" />
            <TelemetryChart 
              containers={safeContainers} 
              devices={safeDevices} 
              initialTarget={selectedTelemetryNode === 'local-lxc' || selectedTelemetryNode === 'local' ? 'host' : selectedTelemetryNode} 
            />
          </div>
        </div>
      )}

      {/* WIDGET 9: INCIDENT WAR ROOM & ACTIVE TRIAGE */}
      {activePreset.widgets.includes('incident_war_room') && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-[10px] sm:text-[11px] font-mono uppercase tracking-widest text-muted">
            <span className="font-serif font-bold text-sepia flex items-center space-x-1.5 truncate">
              <span>[ 🚨 INCIDENT WAR ROOM // ACTIVE TRIAGE &amp; REMEDIATION // 🚨 ]</span>
            </span>
            <span className="text-crimson font-serif font-bold">P1/P2 TRIAGE</span>
          </div>

          <div className="bg-surface border border-crimson/40 rounded-3xl p-5 shadow-sm greek-frame space-y-4">
            <div className="greek-meander opacity-35 -mx-5 -mt-5 mb-4" />
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center space-x-2">
                <AlertTriangle className="w-5 h-5 text-crimson" />
                <h3 className="font-serif font-bold text-base text-ink">Active System Tribulations ({safeIncidents.length})</h3>
              </div>
              <button
                onClick={onNavigateToIncidents}
                className="text-xs font-serif font-bold text-gold hover:text-gold-light flex items-center space-x-1"
              >
                <span>Open Incidents Console</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {safeIncidents.length > 0 ? (
              <div className="space-y-3">
                {safeIncidents.map((inc) => (
                  <div key={inc.id} className="p-4 rounded-2xl bg-rose-500/10 border border-crimson/30 space-y-2 font-mono text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-crimson text-sm font-serif">{inc.title}</span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-crimson text-white">
                        {inc.severity}
                      </span>
                    </div>
                    <p className="text-ink leading-relaxed">{inc.root_cause_summary}</p>
                    {inc.proposed_action && (
                      <div className="pt-2 flex items-center justify-between">
                        <span className="text-muted text-[11px]">
                          Proposed Remediation: {typeof inc.proposed_action === 'string' ? inc.proposed_action : (inc.proposed_action.reason || inc.proposed_action.action_type || 'Automated Container Restart')}
                        </span>
                        <button
                          onClick={onNavigateToIncidents}
                          className="px-3 py-1 rounded-xl bg-crimson hover:bg-rose-700 text-white font-bold text-[10px] font-serif shadow-xs transition-all"
                        >
                          Execute 1-Click Fix
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-6 text-center rounded-2xl bg-surfaceLight/50 border border-border font-mono text-xs text-muted space-y-1">
                <CheckCircle2 className="w-6 h-6 text-emerald mx-auto mb-2" />
                <span className="font-serif text-sm font-bold text-ink block">Sanctuary Peaceful &amp; Serene</span>
                <span>Zero active incidents detected across all 28 monitored vessels.</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* WIDGET 10: MONITORED CONTAINERS INVENTORY TABLE */}
      {activePreset.widgets.includes('container_table') && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-[11px] font-mono uppercase tracking-widest text-muted">
            <span className="font-serif font-bold text-sepia flex items-center space-x-1.5">
              <span>[ 🏛️ IV // MONITORED CONTAINERS &amp; PROJECTS // 🏛️ ]</span>
            </span>
            <span className="text-gold font-serif font-bold">CGROUPS INGESTION</span>
          </div>

          <div className="bg-surface border border-border rounded-3xl overflow-hidden shadow-sm transition-colors duration-200 greek-frame">
            <div className="greek-meander opacity-35" />
            
            {/* Top Toolbar */}
            <div className="p-5 border-b border-border space-y-4 bg-surfaceLight/50">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h3 className="font-serif font-bold text-ink text-sm flex items-center space-x-2">
                    <Box className="w-4 h-4 text-gold" />
                    <span>Containers &amp; Guest VMs ({safeContainers.length})</span>
                  </h3>
                  <p className="text-xs text-muted font-mono mt-0.5">Real-time status and resource utilization across nodes and stacks</p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  {/* Search */}
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-muted absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="Search container..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="bg-inset border border-border rounded-xl pl-8 pr-3 py-1.5 text-xs text-ink placeholder-muted focus:outline-none focus:border-gold font-mono w-44 transition-colors"
                    />
                  </div>

                  {/* State Filter Pills */}
                  <div className="flex items-center bg-inset border border-border rounded-xl p-0.5 text-[11px] font-mono">
                    <button
                      onClick={() => setStateFilter('all')}
                      className={`px-2.5 py-1 rounded-lg transition-all ${stateFilter === 'all' ? 'bg-gold text-slate-950 font-bold shadow-sm' : 'text-muted hover:text-ink'}`}
                    >
                      All
                    </button>
                    <button
                      onClick={() => setStateFilter('running')}
                      className={`px-2.5 py-1 rounded-lg transition-all ${stateFilter === 'running' ? 'bg-emerald text-white font-bold shadow-sm' : 'text-muted hover:text-ink'}`}
                    >
                      Running
                    </button>
                    <button
                      onClick={() => setStateFilter('stopped')}
                      className={`px-2.5 py-1 rounded-lg transition-all ${stateFilter === 'stopped' ? 'bg-muted text-white font-bold shadow-sm' : 'text-muted hover:text-ink'}`}
                    >
                      Stopped
                    </button>
                  </div>

                  {/* Group By Node Toggle */}
                  <button
                    onClick={() => setGroupByNode(!groupByNode)}
                    className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl border text-xs font-mono transition-all ${
                      groupByNode 
                        ? 'bg-gold/15 border-gold text-gold font-bold shadow-xs' 
                        : 'bg-inset border-border text-muted hover:text-ink'
                    }`}
                    title="Toggle grouping containers by their parent host node"
                  >
                    <Layers className="w-3.5 h-3.5" />
                    <span>{groupByNode ? 'Grouped by Node' : 'Flat List'}</span>
                  </button>

                  {/* Sort Dropdown */}
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as any)}
                    className="bg-inset border border-border text-ink text-xs rounded-xl px-3 py-1.5 focus:outline-none focus:border-gold font-mono"
                  >
                    <option value="name">Sort: Name</option>
                    <option value="cpu">Sort: CPU %</option>
                    <option value="memory">Sort: RAM MB</option>
                    <option value="network">Sort: Network</option>
                    <option value="restarts">Sort: Restarts</option>
                  </select>

                  {/* Column Customization Button & Dropdown */}
                  <div className="relative">
                    <button
                      onClick={() => setIsColumnDropdownOpen(!isColumnDropdownOpen)}
                      className="flex items-center space-x-1.5 bg-inset border border-border hover:border-gold/50 text-ink text-xs rounded-xl px-3 py-1.5 font-mono transition-all"
                      title="Customize visible columns"
                    >
                      <SlidersHorizontal className="w-3.5 h-3.5 text-gold" />
                      <span className="hidden sm:inline">Columns</span>
                      <ChevronDown className="w-3 h-3 text-muted" />
                    </button>

                    {isColumnDropdownOpen && (
                      <div className="absolute right-0 top-full mt-2 w-56 bg-surface border border-gold/40 rounded-2xl shadow-xl p-3 z-30 space-y-1.5 font-mono text-xs animate-in fade-in zoom-in-95 duration-100">
                        <div className="text-[10px] font-serif font-bold uppercase text-muted px-2 pb-1 border-b border-border">
                          Toggle Columns
                        </div>
                        <div className="max-h-60 overflow-y-auto space-y-1 pt-1">
                          {ALL_COLUMNS.map((col) => (
                            <label
                              key={col.key}
                              className="flex items-center space-x-2.5 px-2 py-1.5 rounded-xl hover:bg-surfaceLight cursor-pointer select-none"
                            >
                              <input
                                type="checkbox"
                                checked={visibleColumns.includes(col.key)}
                                onChange={() => toggleColumn(col.key)}
                                className="rounded border-border text-gold focus:ring-gold"
                              />
                              <span className="text-ink">{col.label}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Node Selector Quick Filter Rail */}
              <div className="flex items-center space-x-2 overflow-x-auto pb-1 no-scrollbar text-xs font-mono">
                <span className="text-[10px] uppercase font-serif font-bold text-muted shrink-0 mr-1 flex items-center space-x-1">
                  <Server className="w-3 h-3 text-gold" />
                  <span>Nodes:</span>
                </span>
                <button
                  onClick={() => setNodeFilter('all')}
                  className={`px-3 py-1.5 rounded-xl transition-all shrink-0 flex items-center space-x-1.5 border ${
                    nodeFilter === 'all'
                      ? 'bg-gold text-slate-950 font-bold border-gold shadow-sm'
                      : 'bg-inset border-border text-muted hover:text-ink hover:border-gold/40'
                  }`}
                >
                  <span>🌐 All Nodes</span>
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-md ${
                    nodeFilter === 'all' ? 'bg-slate-950/20 text-slate-950 font-bold' : 'bg-surfaceLight text-muted'
                  }`}>
                    {safeContainers.length}
                  </span>
                </button>

                {availableNodeIds.map((nodeId) => {
                  const meta = getNodeMeta(nodeId);
                  const count = safeContainers.filter((c) => (c.node_id || 'local-lxc') === nodeId).length;
                  const isSelected = nodeFilter === nodeId;
                  return (
                    <button
                      key={nodeId}
                      onClick={() => setNodeFilter(nodeId)}
                      className={`px-3 py-1.5 rounded-xl transition-all shrink-0 flex items-center space-x-1.5 border ${
                        isSelected
                          ? 'bg-gold text-slate-950 font-bold border-gold shadow-sm'
                          : 'bg-inset border-border text-muted hover:text-ink hover:border-gold/40'
                      }`}
                    >
                      <span>{meta.icon}</span>
                      <span>{meta.shortLabel}</span>
                      <span className={`text-[10px] px-1.5 py-0.2 rounded-md ${
                        isSelected ? 'bg-slate-950/20 text-slate-950 font-bold' : 'bg-surfaceLight text-muted'
                      }`}>
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Desktop Container Table */}
            <div className="hidden md:block overflow-x-auto rounded-2xl border border-border bg-surface shadow-sm">
              <table className="w-full table-fixed min-w-[1050px] text-left text-xs">
                <thead className="bg-surfaceLight/80 border-b border-border text-muted font-serif uppercase text-[10px] tracking-wider font-bold">
                  <tr>
                    {visibleColumns.includes('name') && <th className="py-3.5 px-4 w-[210px] min-w-[210px]">Container</th>}
                    {visibleColumns.includes('stack') && <th className="py-3.5 px-4 w-[160px] min-w-[160px]">Stack / Project</th>}
                    {visibleColumns.includes('state') && <th className="py-3.5 px-4 w-[110px] min-w-[110px]">State</th>}
                    {visibleColumns.includes('cpu') && <th className="py-3.5 px-4 w-[130px] min-w-[130px] text-right">CPU %</th>}
                    {visibleColumns.includes('memory') && <th className="py-3.5 px-4 w-[160px] min-w-[160px] text-right">RAM</th>}
                    {visibleColumns.includes('network') && <th className="py-3.5 px-4 w-[170px] min-w-[170px] text-right">Network I/O</th>}
                    {visibleColumns.includes('disk') && <th className="py-3.5 px-4 w-[150px] min-w-[150px] text-right">Disk I/O</th>}
                    {visibleColumns.includes('image') && <th className="py-3.5 px-4 w-[180px] min-w-[180px]">Image</th>}
                    {visibleColumns.includes('node') && <th className="py-3.5 px-4 w-[110px] min-w-[110px]">Node</th>}
                    {visibleColumns.includes('restarts') && <th className="py-3.5 px-4 w-[90px] min-w-[90px] text-right">Restarts</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60 font-mono">
                  {groupByNode && nodeFilter === 'all' ? (
                    // GROUPED BY NODE ACCORDION
                    groupedContainers.map((group) => {
                      const isCollapsed = !!collapsedNodes[group.nodeId];
                      return (
                        <React.Fragment key={group.nodeId}>
                          {/* Collapsible Node Header Row */}
                          <tr
                            onClick={() => toggleNodeCollapse(group.nodeId)}
                            className="bg-surfaceLight/95 hover:bg-gold/10 cursor-pointer transition-colors border-y border-gold/30 select-none group"
                          >
                            <td colSpan={visibleColumns.length} className="py-2.5 px-4">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center space-x-3 min-w-0">
                                  <span className="p-1 rounded-md text-gold group-hover:bg-gold/20 transition-all">
                                    {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                  </span>
                                  <span className="text-base">{group.meta.icon}</span>
                                  <div className="flex items-center space-x-2 truncate">
                                    <span className="font-serif font-bold text-ink text-sm tracking-wide">{group.meta.label}</span>
                                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-gold/15 text-gold border border-gold/30 font-bold">
                                      {group.meta.platform}
                                    </span>
                                  </div>
                                </div>
                                <div className="flex items-center space-x-3 font-mono text-xs">
                                  <span className="text-muted text-[11px] hidden sm:inline">
                                    <strong className="text-emerald font-bold">{group.runningCount}</strong> living • <strong className="text-muted font-bold">{group.stoppedCount}</strong> idle
                                  </span>
                                  <span className="px-2.5 py-0.5 rounded-lg bg-inset border border-border text-ink font-bold text-[11px]">
                                    {group.containers.length} Vessels
                                  </span>
                                </div>
                              </div>
                            </td>
                          </tr>

                          {/* Containers in this node */}
                          {!isCollapsed && group.containers.map((c) => (
                            <tr key={c.id + c.name + c.node_id} className="hover:bg-surfaceLight/60 transition-colors">
                              {visibleColumns.includes('name') && (
                                <td className="py-3 px-4 w-[210px] min-w-[210px] pl-8">
                                  <div className="flex items-center space-x-2 truncate">
                                    <span className={`w-2 h-2 rounded-full shrink-0 ${c.state === 'running' ? 'bg-emerald' : 'bg-muted'}`} />
                                    <span className="font-bold text-ink truncate">{c.name}</span>
                                  </div>
                                </td>
                              )}
                              {visibleColumns.includes('stack') && (
                                <td className="py-3 px-4 w-[160px] min-w-[160px]">
                                  <span className="bg-surfaceLight px-2 py-0.5 rounded-md text-[10px] text-gold border border-border font-bold truncate max-w-[140px] inline-block">
                                    {c.stack || 'standalone'}
                                  </span>
                                </td>
                              )}
                              {visibleColumns.includes('state') && (
                                <td className="py-3 px-4 w-[110px] min-w-[110px]">
                                  <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                                    c.state === 'running' ? 'bg-emerald/10 text-emerald border border-emerald/30' : 'bg-inset text-muted border border-border'
                                  }`}>
                                    {c.state.toUpperCase()}
                                  </span>
                                </td>
                              )}
                              {visibleColumns.includes('cpu') && (
                                <td className="py-3 px-4 w-[130px] min-w-[130px] text-right text-ink">
                                  {c.state === 'running' ? (
                                    <div className="flex items-center justify-end space-x-2 tabular-nums">
                                      <span className="w-12 text-right font-medium">{c.cpu_percent ? c.cpu_percent.toFixed(1) : '0.1'}%</span>
                                      <div className="w-10 h-1.5 bg-inset rounded-full overflow-hidden hidden sm:block shrink-0">
                                        <div 
                                          className="h-full bg-gold rounded-full" 
                                          style={{ width: `${Math.min(c.cpu_percent || 1, 100)}%` }} 
                                        />
                                      </div>
                                    </div>
                                  ) : (
                                    <span className="text-muted text-right block">-</span>
                                  )}
                                </td>
                              )}
                              {visibleColumns.includes('memory') && (
                                <td className="py-3 px-4 w-[160px] min-w-[160px] text-right text-ink">
                                  {c.state === 'running' ? (
                                    <div className="flex items-center justify-end space-x-2 tabular-nums">
                                      <span className="w-16 text-right font-medium">{c.memory_usage_mb ? c.memory_usage_mb.toFixed(0) : '32'} MB</span>
                                      <div className="w-10 h-1.5 bg-inset rounded-full overflow-hidden hidden sm:block shrink-0">
                                        <div 
                                          className="h-full bg-amber-500 rounded-full" 
                                          style={{ width: `${Math.min(c.memory_percent || 2, 100)}%` }} 
                                        />
                                      </div>
                                    </div>
                                  ) : (
                                    <span className="text-muted text-right block">-</span>
                                  )}
                                </td>
                              )}
                              {visibleColumns.includes('network') && (
                                <td className="py-3 px-4 w-[170px] min-w-[170px] text-right text-ink">
                                  {c.state === 'running' ? (
                                    <span className="text-lapis font-medium text-[11px] tabular-nums block text-right">
                                      {(() => {
                                        const rate = (c.net_rx_rate_kbps || 0) + (c.net_tx_rate_kbps || 0);
                                        if (rate >= 1024) return `${(rate / 1024).toFixed(2)} MB/s`;
                                        if (rate > 0) return `${rate.toFixed(1)} KB/s`;
                                        const totalMB = ((c.network_rx_bytes || 0) + (c.network_tx_bytes || 0)) / (1024 * 1024);
                                        return totalMB > 0.1 ? `0.0 MB/s (${totalMB.toFixed(0)}MB)` : '0.0 MB/s';
                                      })()}
                                    </span>
                                  ) : (
                                    <span className="text-muted text-right block">-</span>
                                  )}
                                </td>
                              )}
                              {visibleColumns.includes('disk') && (
                                <td className="py-3 px-4 w-[150px] min-w-[150px] text-right text-ink">
                                  {c.state === 'running' ? (
                                    <span className="text-terracotta font-medium text-[11px] tabular-nums block text-right">
                                      {(() => {
                                        const rate = (c.disk_read_rate_kbps || 0) + (c.disk_write_rate_kbps || 0);
                                        if (rate >= 1024) return `${(rate / 1024).toFixed(2)} MB/s`;
                                        if (rate > 0) return `${rate.toFixed(1)} KB/s`;
                                        return '0.0 MB/s';
                                      })()}
                                    </span>
                                  ) : (
                                    <span className="text-muted text-right block">-</span>
                                  )}
                                </td>
                              )}
                              {visibleColumns.includes('image') && (
                                <td className="py-3 px-4 w-[180px] min-w-[180px] text-sepia">
                                  <div className="truncate max-w-[160px]" title={c.image}>
                                    {c.image}
                                  </div>
                                </td>
                              )}
                              {visibleColumns.includes('node') && (
                                <td className="py-3 px-4 w-[110px] min-w-[110px] text-muted truncate">
                                  <span className="px-2 py-0.5 rounded-md bg-surfaceLight border border-border text-[10px] font-bold text-ink">
                                    {group.meta.shortLabel}
                                  </span>
                                </td>
                              )}
                              {visibleColumns.includes('restarts') && (
                                <td className="py-3 px-4 w-[90px] min-w-[90px] text-right tabular-nums">
                                  <span className={c.restart_count > 0 ? 'text-terracotta font-bold' : 'text-muted'}>
                                    {c.restart_count}
                                  </span>
                                </td>
                              )}
                            </tr>
                          ))}
                        </React.Fragment>
                      );
                    })
                  ) : (
                    // FLAT LIST
                    filteredContainers.map((c) => {
                      const meta = getNodeMeta(c.node_id || 'local-lxc');
                      return (
                        <tr key={c.id + c.name + c.node_id} className="hover:bg-surfaceLight/60 transition-colors">
                          {visibleColumns.includes('name') && (
                            <td className="py-3.5 px-4 w-[210px] min-w-[210px]">
                              <div className="flex items-center space-x-2 truncate">
                                <span className={`w-2 h-2 rounded-full shrink-0 ${c.state === 'running' ? 'bg-emerald' : 'bg-muted'}`} />
                                <span className="font-bold text-ink truncate">{c.name}</span>
                              </div>
                            </td>
                          )}
                          {visibleColumns.includes('stack') && (
                            <td className="py-3.5 px-4 w-[160px] min-w-[160px]">
                              <span className="bg-surfaceLight px-2 py-0.5 rounded-md text-[10px] text-gold border border-border font-bold truncate max-w-[140px] inline-block">
                                {c.stack || 'standalone'}
                              </span>
                            </td>
                          )}
                          {visibleColumns.includes('state') && (
                            <td className="py-3.5 px-4 w-[110px] min-w-[110px]">
                              <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                                c.state === 'running' ? 'bg-emerald/10 text-emerald border border-emerald/30' : 'bg-inset text-muted border border-border'
                              }`}>
                                {c.state.toUpperCase()}
                              </span>
                            </td>
                          )}
                          {visibleColumns.includes('cpu') && (
                            <td className="py-3.5 px-4 w-[130px] min-w-[130px] text-right text-ink">
                              {c.state === 'running' ? (
                                <div className="flex items-center justify-end space-x-2 tabular-nums">
                                  <span className="w-12 text-right font-medium">{c.cpu_percent ? c.cpu_percent.toFixed(1) : '0.1'}%</span>
                                  <div className="w-10 h-1.5 bg-inset rounded-full overflow-hidden hidden sm:block shrink-0">
                                    <div 
                                      className="h-full bg-gold rounded-full" 
                                      style={{ width: `${Math.min(c.cpu_percent || 1, 100)}%` }} 
                                    />
                                  </div>
                                </div>
                              ) : (
                                <span className="text-muted text-right block">-</span>
                              )}
                            </td>
                          )}
                          {visibleColumns.includes('memory') && (
                            <td className="py-3.5 px-4 w-[160px] min-w-[160px] text-right text-ink">
                              {c.state === 'running' ? (
                                <div className="flex items-center justify-end space-x-2 tabular-nums">
                                  <span className="w-16 text-right font-medium">{c.memory_usage_mb ? c.memory_usage_mb.toFixed(0) : '32'} MB</span>
                                  <div className="w-10 h-1.5 bg-inset rounded-full overflow-hidden hidden sm:block shrink-0">
                                    <div 
                                      className="h-full bg-amber-500 rounded-full" 
                                      style={{ width: `${Math.min(c.memory_percent || 2, 100)}%` }} 
                                    />
                                  </div>
                                </div>
                              ) : (
                                <span className="text-muted text-right block">-</span>
                              )}
                            </td>
                          )}
                          {visibleColumns.includes('network') && (
                            <td className="py-3.5 px-4 w-[170px] min-w-[170px] text-right text-ink">
                              {c.state === 'running' ? (
                                <span className="text-lapis font-medium text-[11px] tabular-nums block text-right">
                                  {(() => {
                                    const rate = (c.net_rx_rate_kbps || 0) + (c.net_tx_rate_kbps || 0);
                                    if (rate >= 1024) return `${(rate / 1024).toFixed(2)} MB/s`;
                                    if (rate > 0) return `${rate.toFixed(1)} KB/s`;
                                    const totalMB = ((c.network_rx_bytes || 0) + (c.network_tx_bytes || 0)) / (1024 * 1024);
                                    return totalMB > 0.1 ? `0.0 MB/s (${totalMB.toFixed(0)}MB)` : '0.0 MB/s';
                                  })()}
                                </span>
                              ) : (
                                <span className="text-muted text-right block">-</span>
                              )}
                            </td>
                          )}
                          {visibleColumns.includes('disk') && (
                            <td className="py-3.5 px-4 w-[150px] min-w-[150px] text-right text-ink">
                              {c.state === 'running' ? (
                                <span className="text-terracotta font-medium text-[11px] tabular-nums block text-right">
                                  {(() => {
                                    const rate = (c.disk_read_rate_kbps || 0) + (c.disk_write_rate_kbps || 0);
                                    if (rate >= 1024) return `${(rate / 1024).toFixed(2)} MB/s`;
                                    if (rate > 0) return `${rate.toFixed(1)} KB/s`;
                                    return '0.0 MB/s';
                                  })()}
                                </span>
                              ) : (
                                <span className="text-muted text-right block">-</span>
                              )}
                            </td>
                          )}
                          {visibleColumns.includes('image') && (
                            <td className="py-3.5 px-4 w-[180px] min-w-[180px] text-sepia">
                              <div className="truncate max-w-[160px]" title={c.image}>
                                {c.image}
                              </div>
                            </td>
                          )}
                          {visibleColumns.includes('node') && (
                            <td className="py-3.5 px-4 w-[110px] min-w-[110px] text-muted truncate">
                              <span className="px-2 py-0.5 rounded-md bg-surfaceLight border border-border text-[10px] font-bold text-ink">
                                {meta.shortLabel}
                              </span>
                            </td>
                          )}
                          {visibleColumns.includes('restarts') && (
                            <td className="py-3.5 px-4 w-[90px] min-w-[90px] text-right tabular-nums">
                              <span className={c.restart_count > 0 ? 'text-terracotta font-bold' : 'text-muted'}>
                                {c.restart_count}
                              </span>
                            </td>
                          )}
                        </tr>
                      );
                    })
                  )}

                  {filteredContainers.length === 0 && (
                    <tr>
                      <td colSpan={visibleColumns.length} className="py-8 text-center text-muted font-mono">
                        No matching containers found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Mobile Container Cards List */}
            <div className="block md:hidden divide-y divide-border/60">
              {groupByNode && nodeFilter === 'all' ? (
                groupedContainers.map((group) => {
                  const isCollapsed = !!collapsedNodes[group.nodeId];
                  return (
                    <div key={group.nodeId} className="space-y-1">
                      {/* Collapsible Mobile Node Header */}
                      <button
                        onClick={() => toggleNodeCollapse(group.nodeId)}
                        className="w-full p-3.5 bg-surfaceLight border-y border-gold/30 flex items-center justify-between text-left select-none transition-colors"
                      >
                        <div className="flex items-center space-x-2.5 min-w-0">
                          <span className="text-gold">
                            {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </span>
                          <span className="text-base">{group.meta.icon}</span>
                          <div className="truncate">
                            <span className="font-serif font-bold text-ink text-sm block truncate">{group.meta.label}</span>
                            <span className="text-[10px] text-muted font-mono">{group.meta.platform}</span>
                          </div>
                        </div>
                        <span className="text-[10px] font-mono px-2 py-1 rounded-lg bg-inset border border-border text-gold font-bold shrink-0">
                          {group.containers.length} vessels
                        </span>
                      </button>

                      {!isCollapsed && group.containers.map((c) => (
                        <div key={c.id + c.name} className="p-3.5 space-y-2.5 bg-surface hover:bg-surfaceLight/40 transition-colors pl-6 border-l-2 border-gold/30">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-2 min-w-0">
                              <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${c.state === 'running' ? 'bg-emerald celestial-beacon' : 'bg-muted'}`} />
                              <span className="font-bold text-ink font-mono text-sm truncate">{c.name}</span>
                            </div>
                            <span className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-bold ${
                              c.state === 'running' ? 'bg-emerald/10 text-emerald border border-emerald/30' : 'bg-inset text-muted border border-border'
                            }`}>
                              {c.state.toUpperCase()}
                            </span>
                          </div>

                          <div className="flex items-center justify-between text-[11px] font-mono text-muted">
                            <span>Stack: <span className="text-gold font-bold">{c.stack || 'standalone'}</span></span>
                            <span>Restarts: <span className={c.restart_count > 0 ? 'text-terracotta font-bold' : 'text-muted'}>{c.restart_count}</span></span>
                          </div>

                          {c.state === 'running' && (
                            <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                              <div className="bg-surfaceLight/80 p-2 rounded-xl border border-border/70">
                                <div className="flex items-center justify-between text-[10px] text-muted font-mono mb-1">
                                  <span>CPU</span>
                                  <span className="text-gold font-bold">{c.cpu_percent ? c.cpu_percent.toFixed(1) : '0.1'}%</span>
                                </div>
                                <div className="w-full h-1 bg-inset rounded-full overflow-hidden">
                                  <div className="h-full bg-gold rounded-full" style={{ width: `${Math.min(c.cpu_percent || 1, 100)}%` }} />
                                </div>
                              </div>

                              <div className="bg-surfaceLight/80 p-2 rounded-xl border border-border/70">
                                <div className="flex items-center justify-between text-[10px] text-muted font-mono mb-1">
                                  <span>RAM</span>
                                  <span className="text-amber-700 dark:text-amber-400 font-bold">{c.memory_usage_mb ? c.memory_usage_mb.toFixed(0) : '32'} MB</span>
                                </div>
                                <div className="w-full h-1 bg-inset rounded-full overflow-hidden">
                                  <div className="h-full bg-amber-500 rounded-full" style={{ width: `${Math.min(c.memory_percent || 2, 100)}%` }} />
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  );
                })
              ) : (
                filteredContainers.map((c) => (
                  <div key={c.id + c.name} className="p-3.5 space-y-2.5 bg-surface hover:bg-surfaceLight/40 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2 min-w-0">
                        <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${c.state === 'running' ? 'bg-emerald celestial-beacon' : 'bg-muted'}`} />
                        <span className="font-bold text-ink font-mono text-sm truncate">{c.name}</span>
                      </div>
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-bold ${
                        c.state === 'running' ? 'bg-emerald/10 text-emerald border border-emerald/30' : 'bg-inset text-muted border border-border'
                      }`}>
                        {c.state.toUpperCase()}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[11px] font-mono text-muted">
                      <span>Stack: <span className="text-gold font-bold">{c.stack || 'standalone'}</span></span>
                      <span>Node: <span className="text-ink font-bold">{getNodeMeta(c.node_id || 'local-lxc').shortLabel}</span></span>
                    </div>

                    {c.state === 'running' && (
                      <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                        <div className="bg-surfaceLight/80 p-2 rounded-xl border border-border/70">
                          <div className="flex items-center justify-between text-[10px] text-muted font-mono mb-1">
                            <span>CPU</span>
                            <span className="text-gold font-bold">{c.cpu_percent ? c.cpu_percent.toFixed(1) : '0.1'}%</span>
                          </div>
                          <div className="w-full h-1 bg-inset rounded-full overflow-hidden">
                            <div className="h-full bg-gold rounded-full" style={{ width: `${Math.min(c.cpu_percent || 1, 100)}%` }} />
                          </div>
                        </div>

                        <div className="bg-surfaceLight/80 p-2 rounded-xl border border-border/70">
                          <div className="flex items-center justify-between text-[10px] text-muted font-mono mb-1">
                            <span>RAM</span>
                            <span className="text-amber-700 dark:text-amber-400 font-bold">{c.memory_usage_mb ? c.memory_usage_mb.toFixed(0) : '32'} MB</span>
                          </div>
                          <div className="w-full h-1 bg-inset rounded-full overflow-hidden">
                            <div className="h-full bg-amber-500 rounded-full" style={{ width: `${Math.min(c.memory_percent || 2, 100)}%` }} />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 🛠️ MODAL 1: CUSTOMIZE ACTIVE PRESET                                      */}
      {/* ========================================================================= */}
      {isCustomizeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 dark:bg-black/85 backdrop-blur-xl animate-in fade-in duration-200">
          <div 
            className="bg-surface border border-gold/50 rounded-3xl max-w-xl w-full shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 greek-frame flex flex-col max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="greek-meander opacity-35" />
            <div className="p-5 border-b border-border flex items-center justify-between bg-surfaceLight/50">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-2xl bg-gold-muted border border-gold flex items-center justify-center text-gold text-lg">
                  {activePreset.icon}
                </div>
                <div>
                  <h3 className="text-base font-bold text-ink font-serif">Customize Preset: {activePreset.name}</h3>
                  <span className="text-[11px] font-mono text-muted">Toggle modular SRE widgets in this dashboard view</span>
                </div>
              </div>
              <button 
                onClick={() => setIsCustomizeModalOpen(false)}
                className="p-2 rounded-xl text-muted hover:text-ink hover:bg-surfaceLight transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-3 font-mono text-xs">
              <div className="space-y-2">
                {ALL_WIDGET_DEFS.map((w) => {
                  const isChecked = activePreset.widgets.includes(w.id);
                  const Icon = w.icon;
                  return (
                    <div
                      key={w.id}
                      onClick={() => handleToggleWidgetInActivePreset(w.id)}
                      className={`p-3 rounded-2xl border transition-all cursor-pointer flex items-center justify-between select-none ${
                        isChecked 
                          ? 'bg-surfaceLight border-gold/60 text-ink shadow-xs ring-1 ring-gold/30' 
                          : 'bg-inset/50 border-border/70 text-muted hover:border-border'
                      }`}
                    >
                      <div className="flex items-center space-x-3 min-w-0">
                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                          isChecked ? 'bg-gold-muted text-gold' : 'bg-inset text-muted'
                        }`}>
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <span className="font-bold text-xs block truncate text-ink font-serif">{w.name}</span>
                          <span className="text-[10px] text-muted block truncate">{w.description}</span>
                        </div>
                      </div>

                      <div className={`w-5 h-5 rounded-lg border flex items-center justify-center shrink-0 ml-3 ${
                        isChecked ? 'bg-gold border-gold text-slate-950' : 'border-border bg-inset'
                      }`}>
                        {isChecked && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="p-4 border-t border-border bg-surfaceLight/50 flex items-center justify-between">
              {activePreset.isCustom ? (
                <button
                  type="button"
                  onClick={() => handleDeletePreset(activePreset.id)}
                  className="flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-rose-500/10 hover:bg-crimson text-crimson hover:text-white border border-crimson/30 text-xs font-mono font-bold transition-all"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete Custom Preset</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleResetToDefaults}
                  className="flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-inset hover:bg-border text-muted hover:text-ink border border-border text-xs font-mono transition-all"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reset All to Defaults</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setIsCustomizeModalOpen(false)}
                className="px-5 py-2 rounded-xl bg-gold hover:bg-gold-light text-slate-950 font-bold font-serif text-xs shadow-md shadow-gold/20 transition-all"
              >
                DONE CUSTOMIZING
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 🛠️ MODAL 2: CREATE NEW CUSTOM PRESET                                     */}
      {/* ========================================================================= */}
      {isNewPresetModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 dark:bg-black/85 backdrop-blur-xl animate-in fade-in duration-200">
          <div 
            className="bg-surface border border-gold/50 rounded-3xl max-w-lg w-full shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 greek-frame flex flex-col max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="greek-meander opacity-35" />
            <div className="p-5 border-b border-border flex items-center justify-between bg-surfaceLight/50">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-2xl bg-gold-muted border border-gold flex items-center justify-center text-gold">
                  <Plus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-ink font-serif">Create Custom Preset</h3>
                  <span className="text-[11px] font-mono text-muted">Assemble your personalized SRE command center</span>
                </div>
              </div>
              <button 
                onClick={() => setIsNewPresetModalOpen(false)}
                className="p-2 rounded-xl text-muted hover:text-ink hover:bg-surfaceLight transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreatePreset} className="p-5 overflow-y-auto space-y-4 font-mono text-xs">
              <div>
                <label className="block text-ink mb-1 font-medium font-serif">Preset Name</label>
                <input
                  type="text"
                  placeholder="e.g. My Trading Stack, Nightly Watch..."
                  value={newPresetName}
                  onChange={(e) => setNewPresetName(e.target.value)}
                  className="w-full bg-inset border border-border rounded-xl px-3.5 py-2.5 text-ink focus:outline-none focus:border-gold font-mono"
                  required
                />
              </div>

              <div>
                <label className="block text-ink mb-1.5 font-medium font-serif">Preset Icon</label>
                <div className="flex flex-wrap gap-2">
                  {PRESET_ICONS.map((ic) => (
                    <button
                      key={ic}
                      type="button"
                      onClick={() => setNewPresetIcon(ic)}
                      className={`w-9 h-9 rounded-xl text-base flex items-center justify-center transition-all ${
                        newPresetIcon === ic 
                          ? 'bg-gold text-slate-950 ring-2 ring-gold-light font-bold scale-105' 
                          : 'bg-inset border border-border hover:border-gold/40'
                      }`}
                    >
                      {ic}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-ink mb-1 font-medium font-serif">Description</label>
                <input
                  type="text"
                  placeholder="e.g. Focused view on PostgreSQL and trading engine..."
                  value={newPresetDesc}
                  onChange={(e) => setNewPresetDesc(e.target.value)}
                  className="w-full bg-inset border border-border rounded-xl px-3.5 py-2.5 text-ink focus:outline-none focus:border-gold font-mono text-xs"
                />
              </div>

              <div>
                <label className="block text-ink mb-2 font-medium font-serif">Initial Widgets</label>
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {ALL_WIDGET_DEFS.map((w) => {
                    const isChecked = newPresetWidgets.includes(w.id);
                    return (
                      <label
                        key={w.id}
                        className="flex items-center space-x-2.5 p-2 rounded-xl bg-surfaceLight hover:bg-border/60 cursor-pointer select-none"
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {
                            if (isChecked) {
                              setNewPresetWidgets(newPresetWidgets.filter((x) => x !== w.id));
                            } else {
                              setNewPresetWidgets([...newPresetWidgets, w.id]);
                            }
                          }}
                          className="rounded border-border text-gold focus:ring-gold"
                        />
                        <span className="text-ink font-serif text-xs">{w.name}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="pt-3 border-t border-border flex items-center justify-end space-x-2.5">
                <button
                  type="button"
                  onClick={() => setIsNewPresetModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl bg-inset border border-border text-muted hover:text-ink font-mono text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-gold to-amber-600 hover:from-gold-light hover:to-gold text-slate-950 font-bold font-serif text-xs shadow-md shadow-gold/20 transition-all"
                >
                  CREATE PRESET
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Deep Hardware Modal / Inspector */}
      <HardwareInspector
        isOpen={isHardwareOpen}
        onClose={() => setIsHardwareOpen(false)}
        metrics={activeMetrics}
        nodeId={selectedTelemetryNode}
        nodeName={currentSelectedMeta.label}
      />
    </div>
  );
};
