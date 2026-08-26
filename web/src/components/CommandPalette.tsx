import React, { useState, useEffect } from 'react';
import { 
  Search, 
  Eye, 
  Orbit, 
  AlertTriangle, 
  Radio, 
  Scroll, 
  Sliders, 
  Sparkles, 
  Box, 
  X,
  CornerDownLeft,
  TrendingUp
} from 'lucide-react';
import { ContainerStatus, Incident, DeviceNode } from '../types';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (tab: string) => void;
  onOpenChat: () => void;
  onOpenLogs: (source: string) => void;
  containers: ContainerStatus[];
  incidents: Incident[];
  devices: DeviceNode[];
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  onNavigate,
  onOpenChat,
  onOpenLogs,
  containers,
  incidents,
  devices,
}) => {
  const [query, setQuery] = useState('');

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        onClose();
      }
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const safeContainers = Array.isArray(containers) ? containers : [];
  const safeIncidents = Array.isArray(incidents) ? incidents : [];
  const safeDevices = Array.isArray(devices) ? devices : [];

  const filteredContainers = safeContainers.filter((c) => 
    c.name.toLowerCase().includes(query.toLowerCase()) || 
    (c.stack && c.stack.toLowerCase().includes(query.toLowerCase()))
  );

  const filteredIncidents = safeIncidents.filter((i) =>
    i.title.toLowerCase().includes(query.toLowerCase()) ||
    (i.description && i.description.toLowerCase().includes(query.toLowerCase()))
  );

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 p-4 bg-black/60 dark:bg-black/85 backdrop-blur-xl animate-in fade-in duration-150">
      <div 
        className="bg-surface border border-gold/40 rounded-3xl max-w-2xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[80vh] animate-in zoom-in-95 duration-150 transition-colors duration-200 greek-frame"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="greek-meander opacity-35" />

        {/* Search Input Bar */}
        <div className="p-4 border-b border-border flex items-center space-x-3 bg-surfaceLight/50">
          <Search className="w-5 h-5 text-gold shrink-0" />
          <input
            autoFocus
            type="text"
            placeholder="Search containers, stacks, incidents, or telemetry... (⌘K)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full bg-transparent text-ink text-sm placeholder-muted font-mono focus:outline-none"
          />
          <button 
            onClick={onClose}
            className="p-1 text-muted hover:text-ink rounded-xl bg-inset hover:bg-border transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Results Body */}
        <div className="p-4 overflow-y-auto space-y-4 text-xs font-mono">
          {/* Quick Page Navigation */}
          <div>
            <span className="text-[10px] font-serif uppercase tracking-widest text-muted px-2 block mb-1 font-bold">
              // NAVIGATION
            </span>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => { onNavigate('dashboard'); onClose(); }}
                className="flex items-center space-x-2.5 p-2.5 rounded-2xl text-ink hover:bg-surfaceLight text-left transition-colors border border-transparent hover:border-gold/30 font-serif"
              >
                <Eye className="w-4 h-4 text-gold shrink-0" />
                <span>I. Dashboard &amp; Telemetry</span>
              </button>
              <button
                onClick={() => { onNavigate('topology'); onClose(); }}
                className="flex items-center space-x-2.5 p-2.5 rounded-2xl text-ink hover:bg-surfaceLight text-left transition-colors border border-transparent hover:border-gold/30 font-serif"
              >
                <Orbit className="w-4 h-4 text-gold shrink-0" />
                <span>II. Topology Map</span>
              </button>
              <button
                onClick={() => { onNavigate('incidents'); onClose(); }}
                className="flex items-center space-x-2.5 p-2.5 rounded-2xl text-ink hover:bg-surfaceLight text-left transition-colors border border-transparent hover:border-crimson/30 font-serif"
              >
                <AlertTriangle className="w-4 h-4 text-crimson shrink-0" />
                <span>III. Incidents ({safeIncidents.length})</span>
              </button>
              <button
                onClick={() => { onNavigate('devices'); onClose(); }}
                className="flex items-center space-x-2.5 p-2.5 rounded-2xl text-ink hover:bg-surfaceLight text-left transition-colors border border-transparent hover:border-emerald/30 font-serif"
              >
                <Radio className="w-4 h-4 text-emerald shrink-0" />
                <span>IV. Devices &amp; Probes ({safeDevices.length})</span>
              </button>
              <button
                onClick={() => { onNavigate('logs'); onClose(); }}
                className="flex items-center space-x-2.5 p-2.5 rounded-2xl text-ink hover:bg-surfaceLight text-left transition-colors border border-transparent hover:border-gold/30 font-serif"
              >
                <TrendingUp className="w-4 h-4 text-gold shrink-0" />
                <span>V. Observability &amp; Logs</span>
              </button>
              <button
                onClick={() => { onNavigate('settings'); onClose(); }}
                className="flex items-center space-x-2.5 p-2.5 rounded-2xl text-ink hover:bg-surfaceLight text-left transition-colors border border-transparent hover:border-gold/30 font-serif"
              >
                <Sliders className="w-4 h-4 text-gold shrink-0" />
                <span>VI. Settings &amp; AI Config</span>
              </button>
            </div>
          </div>

          {/* AI Assistant Quick Trigger */}
          <div>
            <span className="text-[10px] font-serif uppercase tracking-widest text-muted px-2 block mb-1 font-bold">
              // OPHANIM AI
            </span>
            <button
              onClick={() => { onOpenChat(); onClose(); }}
              className="w-full flex items-center justify-between p-3 rounded-2xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-800 dark:text-amber-300 border border-amber-500/30 transition-all text-left"
            >
              <div className="flex items-center space-x-2.5">
                <Sparkles className="w-4 h-4 text-gold" />
                <span className="font-serif font-bold">Ask Ophanim AI</span>
              </div>
              <CornerDownLeft className="w-3.5 h-3.5 opacity-60" />
            </button>
          </div>

          {/* Filtered Containers */}
          {filteredContainers.length > 0 && (
            <div>
              <span className="text-[10px] font-serif uppercase tracking-widest text-muted px-2 block mb-1 font-bold">
                // CONTAINERS ({filteredContainers.length})
              </span>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {filteredContainers.map((c) => (
                  <div
                    key={c.id + c.name}
                    className="flex items-center justify-between p-2.5 rounded-xl hover:bg-surfaceLight transition-colors group"
                  >
                    <div className="flex items-center space-x-2.5 min-w-0">
                      <span className={`w-2 h-2 rounded-full ${c.state === 'running' ? 'bg-emerald' : 'bg-muted'}`} />
                      <Box className="w-3.5 h-3.5 text-gold shrink-0" />
                      <span className="text-ink font-bold truncate">{c.name}</span>
                      <span className="text-[10px] text-muted bg-inset px-1.5 py-0.5 rounded border border-border">
                        {c.stack || 'standalone'}
                      </span>
                    </div>

                    <div className="flex items-center space-x-2 shrink-0">
                      <button
                        onClick={() => { onOpenLogs(c.name); onClose(); }}
                        className="text-[10px] px-2 py-1 rounded bg-surfaceLight hover:bg-gold hover:text-slate-950 text-sepia border border-border transition-all flex items-center space-x-1 font-bold"
                      >
                        <Scroll className="w-3.5 h-3.5" />
                        <span>Logs</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Filtered Incidents */}
          {filteredIncidents.length > 0 && (
            <div>
              <span className="text-[10px] font-serif uppercase tracking-widest text-muted px-2 block mb-1 font-bold">
                // ACTIVE INCIDENTS ({filteredIncidents.length})
              </span>
              <div className="space-y-1">
                {filteredIncidents.map((inc) => (
                  <div
                    key={inc.id}
                    onClick={() => { onNavigate('incidents'); onClose(); }}
                    className="p-2.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-crimson/30 cursor-pointer transition-colors space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-crimson text-xs font-serif">{inc.title}</span>
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-rose-500/20 text-crimson uppercase font-bold font-mono">
                        {inc.severity}
                      </span>
                    </div>
                    <p className="text-[11px] text-muted truncate">{inc.description}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
