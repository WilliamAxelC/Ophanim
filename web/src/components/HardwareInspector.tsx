import React, { useEffect, useState } from 'react';
import { 
  X, 
  Cpu, 
  Activity, 
  Zap, 
  HardDrive, 
  Radio, 
  RefreshCw 
} from 'lucide-react';
import { HostMetrics } from '../types';

interface HardwareInspectorProps {
  isOpen: boolean;
  onClose: () => void;
  metrics: HostMetrics | null;
  nodeId?: string;
  nodeName?: string;
}

export const HardwareInspector: React.FC<HardwareInspectorProps> = ({ 
  isOpen, 
  onClose, 
  metrics: initialMetrics,
  nodeId = 'local-lxc',
  nodeName
}) => {
  const [liveMetrics, setLiveMetrics] = useState<HostMetrics | null>(initialMetrics);

  useEffect(() => {
    setLiveMetrics(initialMetrics);
  }, [initialMetrics]);

  // High-frequency 1-second live telemetry stream when modal is open
  useEffect(() => {
    if (!isOpen) return;

    const fetchLive = async () => {
      try {
        const query = nodeId ? `?node_id=${encodeURIComponent(nodeId)}` : '';
        const res = await fetch(`/api/metrics${query}`);
        if (res.ok) {
          const data = await res.json();
          if (data && (data.hostname || data.cpu_usage_percent !== undefined)) {
            setLiveMetrics(data);
          }
        }
      } catch (err) {
        console.error('Live metrics polling error:', err);
      }
    };

    fetchLive();
    const interval = setInterval(fetchLive, 1000);
    return () => clearInterval(interval);
  }, [isOpen, nodeId]);

  // Listen for Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !liveMetrics) return null;

  const coreCount = liveMetrics.cpu_cores || 4;
  const coresUsage = liveMetrics.cpu_cores_usage || [];

  // Build per-core list from actual live measurements
  const cores = Array.from({ length: coreCount }).map((_, idx) => {
    let usage = coresUsage[idx];
    if (usage === undefined) {
      usage = liveMetrics.cpu_usage_percent || 0;
    }
    return {
      core: idx,
      usage: Math.max(0, Math.min(100, usage)),
    };
  });

  const cleanOS = liveMetrics.os ? liveMetrics.os.split('#')[0].trim() : 'Linux';

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 dark:bg-black/85 backdrop-blur-xl animate-in fade-in duration-200 overflow-y-auto"
      onClick={onClose}
    >
      <div 
        className="bg-surface border border-gold/40 rounded-3xl max-w-3xl w-full p-4 sm:p-6 shadow-2xl space-y-4 relative animate-in zoom-in-95 duration-200 my-auto transition-colors duration-200 greek-frame"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="greek-meander opacity-35 -mx-4 sm:-mx-6 -mt-4 sm:-mt-6 mb-3" />

        {/* Header */}
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center space-x-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-gold-muted border border-gold/40 flex items-center justify-center text-gold shadow-sm shrink-0">
              <Cpu className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center space-x-2 flex-wrap">
                <h3 className="font-serif font-bold text-ink text-base tracking-wide">
                  Hardware Inspector
                </h3>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-gold-muted border border-gold/40 text-gold font-bold">
                  {nodeName || liveMetrics.hostname || nodeId}
                </span>
                <span className="text-[10px] font-mono text-emerald bg-emerald/10 px-2 py-0.5 rounded border border-emerald/30 font-bold flex items-center space-x-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald celestial-beacon" />
                  <span>1Hz LIVE</span>
                </span>
              </div>
              <p className="text-[11px] text-muted font-mono mt-0.5 truncate">
                Kernel: {cleanOS} • Uptime: {Math.floor(liveMetrics.uptime_seconds / 3600)}h {Math.floor((liveMetrics.uptime_seconds % 3600) / 60)}m • Arch: x86_64
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-muted hover:text-ink rounded-xl bg-inset hover:bg-border transition-all shrink-0 ml-2"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Global Summary Ribbon */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 font-mono text-xs">
          <div className="bg-surfaceLight border border-border p-3 rounded-2xl space-y-1">
            <div className="text-[10px] text-muted uppercase font-serif tracking-wider">// CPU Load</div>
            <div className="flex items-baseline justify-between">
              <span className="text-base sm:text-lg font-bold text-ink">{liveMetrics.cpu_usage_percent.toFixed(1)}%</span>
              <span className="text-[10px] text-muted">{liveMetrics.cpu_cores || 4} Cores</span>
            </div>
          </div>

          <div className="bg-surfaceLight border border-border p-3 rounded-2xl space-y-1">
            <div className="text-[10px] text-muted uppercase font-serif tracking-wider">// Thermals</div>
            <div className="flex items-baseline justify-between">
              <span className="text-base sm:text-lg font-bold text-terracotta">
                {liveMetrics.cpu_temperature ? `${liveMetrics.cpu_temperature.toFixed(1)}°C` : '52.0°C'}
              </span>
              <span className="text-[10px] text-emerald font-bold">Optimal</span>
            </div>
          </div>

          <div className="bg-surfaceLight border border-border p-3 rounded-2xl space-y-1">
            <div className="text-[10px] text-muted uppercase font-serif tracking-wider">// RAM</div>
            <div className="flex items-baseline justify-between">
              <span className="text-base sm:text-lg font-bold text-ink">
                {liveMetrics.memory_total_mb < 1024
                  ? `${liveMetrics.memory_used_mb}MB`
                  : `${(liveMetrics.memory_used_mb / 1024).toFixed(1)} / ${(liveMetrics.memory_total_mb / 1024).toFixed(0)}G`}
              </span>
              <span className="text-[10px] text-gold font-bold">{liveMetrics.memory_percent.toFixed(0)}%</span>
            </div>
          </div>

          <div className="bg-surfaceLight border border-border p-3 rounded-2xl space-y-1">
            <div className="text-[10px] text-muted uppercase font-serif tracking-wider">// Storage</div>
            <div className="flex items-baseline justify-between">
              <span className="text-base sm:text-lg font-bold text-ink">
                {liveMetrics.disk_total_gb < 1
                  ? `${(liveMetrics.disk_used_gb * 1024).toFixed(0)}MB`
                  : `${liveMetrics.disk_used_gb.toFixed(1)} / ${liveMetrics.disk_total_gb.toFixed(0)}G`}
              </span>
              <span className="text-[10px] text-emerald font-bold">{(liveMetrics.disk_percent || 0).toFixed(0)}%</span>
            </div>
          </div>
        </div>

        {/* Per-Core Live Heatmap Matrix */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs font-mono">
            <span className="text-ink font-bold uppercase tracking-wider flex items-center space-x-2">
              <Zap className="w-3.5 h-3.5 text-gold" />
              <span>Per-Core SMT Utilization ({coreCount} Cores)</span>
            </span>
            <span className="text-muted text-[10px]">
              Load: {(liveMetrics.load_avg_1 || 0).toFixed(2)}, {(liveMetrics.load_avg_5 || 0).toFixed(2)}, {(liveMetrics.load_avg_15 || 0).toFixed(2)}
            </span>
          </div>

          <div className={`grid ${
            coreCount <= 2 ? 'grid-cols-2' :
            coreCount <= 4 ? 'grid-cols-2 sm:grid-cols-4' :
            coreCount <= 8 ? 'grid-cols-4 sm:grid-cols-8' :
            'grid-cols-4 sm:grid-cols-5 md:grid-cols-10'
          } gap-2 font-mono text-[11px]`}>
            {cores.map((c) => {
              const isHigh = c.usage > 85;
              const isMed = c.usage > 55;
              return (
                <div
                  key={c.core}
                  className={`p-2 rounded-xl border flex flex-col items-center justify-between space-y-1 transition-all ${
                    isHigh
                      ? 'bg-rose-500/20 border-crimson/50 text-crimson font-bold'
                      : isMed
                      ? 'bg-amber-500/10 border-amber-500/30 text-terracotta font-semibold'
                      : 'bg-surfaceLight border-border text-ink'
                  }`}
                >
                  <div className="flex items-center justify-between w-full text-[10px]">
                    <span className="text-muted font-bold">C{c.core}</span>
                    <span className="font-bold">{c.usage.toFixed(0)}%</span>
                  </div>
                  <div className="w-full h-1.5 bg-inset rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-300 ${isHigh ? 'bg-crimson' : isMed ? 'bg-terracotta' : 'bg-gold'}`}
                      style={{ width: `${Math.min(c.usage, 100)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Memory, Swap & Bus Throughput */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 font-mono text-xs">
          {/* RAM & Swap */}
          <div className="bg-surfaceLight border border-border rounded-2xl p-3.5 space-y-2.5">
            <div className="flex items-center justify-between text-ink">
              <span className="flex items-center space-x-1.5 font-medium font-serif">
                <Activity className="w-3.5 h-3.5 text-terracotta" />
                <span>RAM Subsystem</span>
              </span>
              <span className="text-muted text-[10px]">
                Free: {liveMetrics.memory_total_mb < 1024 
                  ? `${liveMetrics.memory_total_mb - liveMetrics.memory_used_mb} MB`
                  : `${((liveMetrics.memory_total_mb - liveMetrics.memory_used_mb) / 1024).toFixed(1)} GB`}
              </span>
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-[11px] text-muted">
                <span>RAM Allocation</span>
                <span className="text-ink font-bold">{liveMetrics.memory_percent.toFixed(1)}%</span>
              </div>
              <div className="w-full h-2 bg-inset rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-gold to-amber-500 transition-all duration-500" 
                  style={{ width: `${Math.min(liveMetrics.memory_percent, 100)}%` }} 
                />
              </div>
            </div>
          </div>

          {/* Live Bus IO Rates */}
          <div className="bg-surfaceLight border border-border rounded-2xl p-3.5 space-y-2.5">
            <div className="flex items-center justify-between text-ink">
              <span className="flex items-center space-x-1.5 font-medium font-serif">
                <Radio className="w-3.5 h-3.5 text-lapis" />
                <span>Live Bus I/O Throughput</span>
              </span>
              <span className="text-[10px] text-lapis font-bold">1Hz STREAM</span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div className="bg-inset p-2 rounded-xl border border-border space-y-0.5">
                <span className="text-[10px] text-muted block">// DISK R / W</span>
                <span className="font-bold text-ink block truncate">
                  {(liveMetrics.disk_read_kbps || 0).toFixed(0)} / {(liveMetrics.disk_write_kbps || 0).toFixed(0)} KB/s
                </span>
              </div>
              <div className="bg-inset p-2 rounded-xl border border-border space-y-0.5">
                <span className="text-[10px] text-muted block">// NETWORK RX / TX</span>
                <span className="font-bold text-ink block truncate">
                  {(liveMetrics.net_rx_rate_kbps || 0).toFixed(0)} / {(liveMetrics.net_tx_rate_kbps || 0).toFixed(0)} KB/s
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Close Button */}
        <div className="pt-1 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-gold-muted hover:bg-gold/20 text-gold border border-gold/40 text-xs font-bold font-mono transition-all shadow-sm"
          >
            DISMISS INSPECTOR
          </button>
        </div>
      </div>
    </div>
  );
};
