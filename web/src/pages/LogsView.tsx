import React, { useState, useEffect } from 'react';
import { 
  Scroll, 
  Search, 
  RefreshCw, 
  Terminal, 
  Activity, 
  TrendingUp, 
  Download, 
  Play, 
  Pause,
  Filter
} from 'lucide-react';
import { LogEntry, ContainerStatus, DeviceNode } from '../types';
import { TelemetryChart } from '../components/TelemetryChart';

interface LogsViewProps {
  containers: ContainerStatus[];
  devices?: DeviceNode[];
  initialSource?: string;
}

export const LogsView: React.FC<LogsViewProps> = ({ containers, devices = [], initialSource }) => {
  const safeContainers = Array.isArray(containers) ? containers : [];
  const [activeTab, setActiveTab] = useState<'metrics' | 'logs'>('metrics');

  // Find first running container as default source
  const firstRunning = safeContainers.find((c) => c.state === 'running')?.name;
  const defaultSource = initialSource || firstRunning || safeContainers[0]?.name || '';

  const [selectedSource, setSelectedSource] = useState(defaultSource);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [search, setSearch] = useState('');
  const [levelFilter, setLevelFilter] = useState<'ALL' | 'ERR' | 'WRN'>('ALL');
  const [loading, setLoading] = useState(false);
  const [autoTail, setAutoTail] = useState(true);

  useEffect(() => {
    if (initialSource) {
      setSelectedSource(initialSource);
      setActiveTab('logs');
    } else if (!selectedSource && safeContainers.length > 0) {
      const active = safeContainers.find((c) => c.state === 'running')?.name || safeContainers[0].name;
      setSelectedSource(active);
    }
  }, [initialSource, safeContainers]);

  const fetchLogs = async (source: string) => {
    if (!source) return;
    try {
      const container = safeContainers.find((c) => c.name === source || c.id === source);
      const isDevice = devices.find((d) => d.id === source || d.name === source || (source === 'host' && (d.id === 'local-lxc' || d.id === 'local')));
      const nodeId = container?.node_id || isDevice?.id || (source === 'host' ? 'local' : source);
      const res = await fetch(`/api/logs?source=${encodeURIComponent(source)}&node_id=${encodeURIComponent(nodeId)}`);
      const data = await res.json();
      setLogs(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedSource && activeTab === 'logs') {
      setLoading(true);
      fetchLogs(selectedSource);
    }
  }, [selectedSource, activeTab]);

  // Live auto-tail polling interval
  useEffect(() => {
    if (!autoTail || !selectedSource || activeTab !== 'logs') return;
    const interval = setInterval(() => {
      fetchLogs(selectedSource);
    }, 3000);
    return () => clearInterval(interval);
  }, [autoTail, selectedSource, containers, activeTab]);

  const filteredLogs = logs.filter((l) => {
    const matchesSearch = l.message.toLowerCase().includes(search.toLowerCase());
    if (levelFilter === 'ERR') return matchesSearch && (l.level === 'ERROR' || l.message.includes('ERR') || l.message.includes('error'));
    if (levelFilter === 'WRN') return matchesSearch && (l.level === 'WARN' || l.message.includes('WRN') || l.message.includes('warning'));
    return matchesSearch;
  });

  const downloadLogs = () => {
    const text = logs.map(l => `[${new Date(l.timestamp).toISOString()}] [${l.level || 'INFO'}] ${l.message}`).join('\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedSource || 'container'}_logs_${new Date().toISOString().slice(0, 10)}.log`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Section Header */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-[10px] sm:text-[11px] font-mono uppercase tracking-widest text-muted">
          <span className="font-serif font-bold text-sepia truncate">[ 🏛️ V // OBSERVABILITY &amp; TIME-SERIES // 🏛️ ]</span>
          <span className="text-gold font-serif font-bold hidden sm:inline shrink-0">✦ SQLITE METRICS &amp; LOG STREAM</span>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-ink flex items-center space-x-2 font-serif">
              <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 text-gold shrink-0" />
              <span>Observability &amp; Telemetry</span>
            </h2>
            <p className="text-[11px] sm:text-xs text-muted font-mono mt-0.5">
              Historical time-series analytics and real-time ring-buffer logs
            </p>
          </div>

          {/* Sub-Tab Navigation */}
          <div className="grid grid-cols-2 gap-1.5 p-1 bg-surface border border-gold/40 rounded-2xl shadow-xs font-mono text-xs w-full sm:w-auto">
            <button
              onClick={() => setActiveTab('metrics')}
              className={`flex items-center justify-center space-x-1.5 py-2 px-3.5 rounded-xl font-bold transition-all ${
                activeTab === 'metrics'
                  ? 'bg-gold text-slate-950 shadow-xs'
                  : 'text-muted hover:text-ink'
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
              <span className="truncate">Time-Series</span>
            </button>
            <button
              onClick={() => setActiveTab('logs')}
              className={`flex items-center justify-center space-x-1.5 py-2 px-3.5 rounded-xl font-bold transition-all ${
                activeTab === 'logs'
                  ? 'bg-gold text-slate-950 shadow-xs'
                  : 'text-muted hover:text-ink'
              }`}
            >
              <Scroll className="w-3.5 h-3.5" />
              <span className="truncate">Live Logs</span>
            </button>
          </div>
        </div>
      </div>

      {/* TAB 1: TIME-SERIES METRICS */}
      {activeTab === 'metrics' && (
        <div className="bg-surface border border-border rounded-2xl sm:rounded-3xl p-3.5 sm:p-6 shadow-sm transition-colors duration-200 greek-frame space-y-4 sm:space-y-6">
          <div className="greek-meander opacity-35 -mx-3.5 sm:-mx-6 -mt-3.5 sm:-mt-6 mb-3 sm:mb-4" />

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3">
            <div>
              <h3 className="font-serif font-bold text-ink text-sm sm:text-base flex items-center space-x-2">
                <Activity className="w-4 h-4 text-gold" />
                <span>Multi-Target Telemetry Visualizer</span>
              </h3>
              <p className="text-[11px] sm:text-xs text-muted font-mono mt-0.5">
                Inspect historical CPU, RAM, Network, and Disk throughput
              </p>
            </div>

            <span className="text-[10px] font-mono text-muted bg-surfaceLight border border-border px-2.5 py-1 rounded-xl font-bold self-start sm:self-auto">
              1m Rollups • 7-Day Retention
            </span>
          </div>

          <TelemetryChart containers={containers} devices={devices} initialTarget="host" />
        </div>
      )}

      {/* TAB 2: LIVE LOGS STREAM */}
      {activeTab === 'logs' && (
        <div className="bg-surface border border-border rounded-2xl sm:rounded-3xl overflow-hidden shadow-sm transition-colors duration-200 greek-frame">
          <div className="greek-meander opacity-35" />

          {/* Controls Bar */}
          <div className="p-3.5 sm:p-5 border-b border-border bg-surfaceLight/50 flex flex-col gap-3 font-mono text-xs">
            {/* Row 1: Target Selector */}
            <div className="w-full">
              <select
                value={selectedSource}
                onChange={(e) => setSelectedSource(e.target.value)}
                className="w-full bg-surface border border-gold/50 text-ink text-xs rounded-xl px-3.5 py-2.5 font-mono focus:outline-none focus:border-gold shadow-xs font-bold cursor-pointer truncate"
              >
                {devices.length > 0 && (
                  <optgroup label="Enrolled Host Nodes & Hypervisors">
                    {devices.map((d) => (
                      <option key={d.id} value={d.id === 'local-lxc' ? 'host' : d.id}>
                        🏛️ {d.name} ({d.agent_type.toUpperCase()})
                      </option>
                    ))}
                  </optgroup>
                )}
                <optgroup label="Monitored Containers & Services">
                  {containers.map((c) => (
                    <option key={c.id + c.name} value={c.name}>
                      📦 {c.name} ({c.stack || 'standalone'}) {c.state !== 'running' ? `[${c.state.toUpperCase()}]` : ''}
                    </option>
                  ))}
                </optgroup>
              </select>
            </div>

            {/* Row 2: Search input + Level Filters */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <div className="relative flex-1 min-w-0">
                <Search className="w-3.5 h-3.5 text-muted absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Filter logs by keyword..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full bg-inset border border-border rounded-xl pl-8 pr-3 py-2 text-xs text-ink placeholder-muted focus:outline-none focus:border-gold transition-colors font-mono"
                />
              </div>

              {/* Log Level Filter Pills */}
              <div className="flex items-center bg-inset border border-border rounded-xl p-1 text-[11px] justify-between sm:justify-start gap-1">
                {(['ALL', 'ERR', 'WRN'] as const).map((lvl) => (
                  <button
                    key={lvl}
                    onClick={() => setLevelFilter(lvl)}
                    className={`flex-1 sm:flex-initial px-3 py-1 rounded-lg transition-all font-bold text-center ${
                      levelFilter === lvl
                        ? lvl === 'ERR'
                          ? 'bg-crimson text-white shadow-xs'
                          : lvl === 'WRN'
                          ? 'bg-amber-500 text-slate-950 shadow-xs'
                          : 'bg-gold text-slate-950 shadow-xs'
                        : 'text-muted hover:text-ink'
                    }`}
                  >
                    {lvl}
                  </button>
                ))}
              </div>
            </div>

            {/* Row 3: Action Buttons */}
            <div className="flex items-center justify-between gap-2 pt-0.5">
              {/* Auto Tail Toggle */}
              <button
                onClick={() => setAutoTail(!autoTail)}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold transition-all shadow-xs ${
                  autoTail
                    ? 'bg-emerald/10 text-emerald border-emerald/40'
                    : 'bg-inset text-muted border-border'
                }`}
                title={autoTail ? 'Pause Auto-Tail' : 'Resume Auto-Tail'}
              >
                {autoTail ? <Play className="w-3 h-3 fill-emerald" /> : <Pause className="w-3 h-3" />}
                <span>{autoTail ? 'LIVE STREAMING' : 'PAUSED'}</span>
              </button>

              <div className="flex items-center space-x-2">
                {/* Refresh */}
                <button
                  onClick={() => fetchLogs(selectedSource)}
                  className="p-2 text-muted hover:text-gold bg-surface border border-border rounded-xl transition-colors shadow-xs"
                  title="Refresh Logs"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-gold' : ''}`} />
                </button>

                {/* Download */}
                <button
                  onClick={downloadLogs}
                  className="p-2 text-muted hover:text-gold bg-surface border border-border rounded-xl transition-colors shadow-xs"
                  title="Download Log File"
                >
                  <Download className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>

          {/* Terminal Log Console with Safe Padding for Floating Dock & Proper Parchment/Obsidian Theming */}
          <div className="p-3.5 sm:p-5 font-mono text-xs bg-inset border-t border-border text-ink min-h-[380px] max-h-[580px] overflow-y-auto space-y-1.5 select-text pb-28 sm:pb-5 transition-colors duration-200">
            {filteredLogs.map((log, index) => {
              const isError = log.level === 'ERROR' || log.message.includes('ERR') || log.message.includes('error');
              const isWarn = log.level === 'WARN' || log.message.includes('WRN') || log.message.includes('warning');

              return (
                <div key={index} className="flex flex-col sm:flex-row sm:items-start sm:space-x-3 leading-relaxed hover:bg-surfaceLight/80 p-1.5 sm:p-1 rounded-lg transition-colors border-b border-border/40 sm:border-0">
                  <div className="flex items-center space-x-2 shrink-0 select-none pb-0.5 sm:pb-0">
                    <span className="text-muted text-[10px] sm:text-[11px] font-mono">
                      {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>

                    <span className={`px-1.5 py-0.2 rounded text-[9px] sm:text-[10px] font-bold font-mono ${
                      isError
                        ? 'bg-crimson/15 text-crimson border border-crimson/30'
                        : isWarn
                        ? 'bg-terracotta/15 text-terracotta border border-terracotta/30'
                        : 'bg-emerald/15 text-emerald border border-emerald/30'
                    }`}>
                      {log.level || 'INFO'}
                    </span>
                  </div>

                  <span className={`text-[11px] sm:text-xs break-all font-mono ${
                    isError ? 'text-crimson font-medium' : isWarn ? 'text-terracotta font-medium' : 'text-ink'
                  }`}>
                    {log.message}
                  </span>
                </div>
              );
            })}

            {filteredLogs.length === 0 && (
              <div className="py-20 text-center text-muted flex flex-col items-center justify-center space-y-2 font-mono">
                <Terminal className="w-8 h-8 text-sepia/70" />
                <p className="text-xs">
                  {loading
                    ? 'Connecting to container log stream...'
                    : `No log entries captured for ${selectedSource || 'container'}.`}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
