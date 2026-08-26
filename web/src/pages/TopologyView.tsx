import React, { useState } from 'react';
import { 
  Orbit, 
  Server, 
  Database, 
  Globe, 
  Box, 
  Layers, 
  CheckCircle2, 
  AlertTriangle, 
  X,
  Scroll,
  Eye,
  LayoutGrid,
  GitFork,
  ChevronDown,
  ChevronRight
} from 'lucide-react';
import { TopologyNode, TopologyEdge } from '../types';

interface TopologyViewProps {
  nodes: TopologyNode[];
  edges: TopologyEdge[];
  onOpenLogs: (source: string) => void;
}

export const TopologyView: React.FC<TopologyViewProps> = ({ nodes, edges, onOpenLogs }) => {
  const safeNodes = Array.isArray(nodes) ? nodes : [];
  const safeEdges = Array.isArray(edges) ? edges : [];
  const [viewMode, setViewMode] = useState<'boxy' | 'dag'>('boxy');
  const [selectedNode, setSelectedNode] = useState<TopologyNode | null>(null);
  const [collapsedStacks, setCollapsedStacks] = useState<Record<string, boolean>>({});

  const toggleStack = (stackName: string) => {
    setCollapsedStacks((prev) => ({
      ...prev,
      [stackName]: !prev[stackName],
    }));
  };

  // Group nodes by host and architectural tier
  const routers = safeNodes.filter((n) => n.type === 'router' || n.type === 'proxy').sort((a, b) => a.label.localeCompare(b.label));
  const hosts = safeNodes.filter((n) => n.type === 'host').sort((a, b) => {
    if (a.id.includes('local') || a.label.toLowerCase().includes('local')) return -1;
    if (b.id.includes('local') || b.label.toLowerCase().includes('local')) return 1;
    return a.label.localeCompare(b.label);
  });
  const databases = safeNodes.filter((n) => n.type === 'database').sort((a, b) => a.label.localeCompare(b.label));
  const services = safeNodes.filter((n) => n.type === 'container' || n.type === 'service').sort((a, b) => a.label.localeCompare(b.label));

  // Map containers to their respective host
  const getHostContainers = (hostId: string) => {
    return safeNodes.filter((n) => {
      if (n.type === 'host') return false;
      if (n.parent_id === hostId || n.metadata?.node === hostId) return true;
      if (hosts.length === 1) return true;
      // Fallback: if node ID not explicit and host is local
      if (!n.parent_id && (hostId.includes('local') || hostId === 'local-lxc')) return true;
      return false;
    });
  };

  const getNodeIcon = (type: string) => {
    switch (type) {
      case 'host':
        return Server;
      case 'database':
        return Database;
      case 'router':
      case 'proxy':
        return Globe;
      case 'service':
        return Layers;
      default:
        return Box;
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header & View Mode Switcher */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-[11px] font-mono uppercase tracking-widest text-muted">
          <span className="font-serif font-bold text-sepia">[ 🏛️ II // TOPOLOGY &amp; SERVICE FLOW ARCHITECTURE // 🏛️ ]</span>
          <span className="text-gold font-serif font-bold">✦ SERVICE GRAPH</span>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-ink flex items-center space-x-2.5 font-serif">
              <Orbit className="w-5 h-5 text-gold" />
              <span>Topology Map &amp; Multi-System Architecture</span>
            </h2>
            <p className="text-xs text-muted font-mono">
              {viewMode === 'boxy' 
                ? 'Multi-System Infrastructure: Host Nodes → Stacks → Containers & VMs'
                : 'Service flow: Ingress Proxies → Core Services → Databases'}
            </p>
          </div>

          {/* View Mode Toggle Switch */}
          <div className="flex items-center space-x-3">
            <div className="bg-surface border border-border rounded-2xl p-1 flex items-center space-x-1 shadow-sm">
              <button
                onClick={() => setViewMode('boxy')}
                className={`flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold font-serif transition-all ${
                  viewMode === 'boxy' 
                    ? 'bg-gold text-slate-950 shadow-sm font-bold' 
                    : 'text-muted hover:text-ink'
                }`}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span>Infrastructure View</span>
              </button>

              <button
                onClick={() => setViewMode('dag')}
                className={`flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold font-serif transition-all ${
                  viewMode === 'dag' 
                    ? 'bg-gold text-slate-950 shadow-sm font-bold' 
                    : 'text-muted hover:text-ink'
                }`}
              >
                <GitFork className="w-3.5 h-3.5" />
                <span>Service Flow (DAG)</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* VIEW MODE 1: MULTI-SYSTEM INFRASTRUCTURE VIEW */}
      {viewMode === 'boxy' && (
        <div className="space-y-6">
          {hosts.map((hostNode) => {
            const hostContainers = getHostContainers(hostNode.id);
            const isPVE = hostNode.label.toLowerCase().includes('proxmox') || 
                          hostNode.label.toLowerCase().includes('pve') || 
                          hostNode.metadata?.agent === 'proxmox';

            // Group this host's containers by stack (sorted alphabetically)
            const hostStacksMap: Record<string, TopologyNode[]> = {};
            hostContainers.forEach((n) => {
              const stack = n.metadata?.stack || 'standalone';
              if (!hostStacksMap[stack]) hostStacksMap[stack] = [];
              hostStacksMap[stack].push(n);
            });
            const sortedStacks = Object.entries(hostStacksMap).sort(([a], [b]) => a.localeCompare(b));

            return (
              <div 
                key={hostNode.id}
                className="bg-surface border border-border hover:border-gold/50 rounded-3xl p-6 shadow-sm relative overflow-hidden transition-all greek-frame space-y-6"
              >
                <div className="greek-meander opacity-35 -mx-6 -mt-6 mb-6" />

                {/* Host System Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-4">
                  <div className="flex items-center space-x-3.5">
                    <div className={`w-11 h-11 rounded-2xl border flex items-center justify-center shrink-0 ${
                      isPVE ? 'bg-gold-muted border-gold text-gold shadow-xs' : 'bg-surfaceLight border-border text-sepia'
                    }`}>
                      <Server className="w-6 h-6" />
                    </div>
                    <div>
                      <div className="flex items-center space-x-2.5">
                        <h3 className="font-bold text-ink text-base font-serif">{hostNode.label}</h3>
                        <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-md border ${
                          isPVE 
                            ? 'bg-gold/15 text-gold border-gold/40' 
                            : 'bg-surfaceLight text-sepia border-border'
                        }`}>
                          {isPVE ? 'PROXMOX VE HYPERVISOR' : (hostNode.metadata?.agent || 'HOST SYSTEM').toUpperCase()}
                        </span>
                        <span className="text-[10px] font-mono font-bold bg-emerald/10 text-emerald border border-emerald/30 px-2 py-0.5 rounded-md">
                          ONLINE
                        </span>
                      </div>
                      <span className="text-xs text-muted font-mono">
                        {hostNode.metadata?.ip || 'Local Daemon'} • {hostContainers.length} Monitored Containers &amp; VMs
                      </span>
                    </div>
                  </div>
                </div>

                {/* Nested Project Stacks */}
                {sortedStacks.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {sortedStacks.map(([stackName, stackNodes]) => {
                      const isExpanded = !collapsedStacks[`${hostNode.id}:${stackName}`];
                      const hasIncident = stackNodes.some((n) => n.status === 'critical');
                      const sortedNodes = [...stackNodes].sort((a, b) => a.label.localeCompare(b.label));

                      return (
                        <div
                          key={stackName}
                          className={`bg-surfaceLight/60 border rounded-2xl p-4 transition-all shadow-sm ${
                            hasIncident ? 'border-crimson/50 bg-rose-500/10' : 'border-border hover:border-gold/40'
                          }`}
                        >
                          {/* Stack Header */}
                          <div 
                            onClick={() => toggleStack(`${hostNode.id}:${stackName}`)}
                            className="flex items-center justify-between cursor-pointer select-none pb-3 border-b border-border/50"
                          >
                            <div className="flex items-center space-x-2">
                              {isExpanded ? (
                                <ChevronDown className="w-4 h-4 text-gold" />
                              ) : (
                                <ChevronRight className="w-4 h-4 text-muted" />
                              )}
                              <span className="font-bold text-xs text-ink uppercase tracking-wider font-mono">
                                {stackName}
                              </span>
                            </div>
                            <span className="text-[10px] font-mono bg-inset border border-border px-2 py-0.5 rounded text-sepia font-bold">
                              {stackNodes.length} containers
                            </span>
                          </div>

                          {/* Containers List */}
                          {isExpanded && (
                            <div className="mt-3 space-y-2">
                              {sortedNodes.map((n) => {
                                const isStopped = n.metadata?.state && n.metadata.state !== 'running';
                                const isCrit = n.status === 'critical';
                                const isWarn = n.status === 'warning';
                                const Icon = getNodeIcon(n.type);

                                return (
                                  <div
                                    key={n.id}
                                    onClick={() => setSelectedNode(n)}
                                    className={`p-2.5 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                                      isCrit 
                                        ? 'bg-crimson/10 border-crimson/40 text-crimson'
                                        : isWarn
                                        ? 'bg-amber-500/10 border-amber-500/40 text-amber-600'
                                        : isStopped
                                        ? 'bg-inset/60 border-border text-muted opacity-75'
                                        : 'bg-surfaceLight/70 border-border hover:border-gold/50 text-ink'
                                    }`}
                                  >
                                    <div className="flex items-center space-x-2 min-w-0">
                                      <Icon className={`w-3.5 h-3.5 shrink-0 ${isCrit ? 'text-crimson' : isWarn ? 'text-amber-500' : 'text-gold'}`} />
                                      <span className="text-xs font-mono font-bold truncate">{n.label}</span>
                                    </div>
                                    <span className={`text-[10px] font-mono uppercase font-bold shrink-0 ${
                                      isCrit ? 'text-crimson' : isWarn ? 'text-amber-600' : isStopped ? 'text-muted' : 'text-emerald'
                                    }`}>
                                      {n.metadata?.state || n.status}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="p-8 text-center bg-surfaceLight/40 rounded-2xl border border-dashed border-border font-mono text-xs text-muted">
                    <span>No monitored containers or guest VMs discovered on this host yet.</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* VIEW MODE 2: SERVICE FLOW (DAG) */}
      {viewMode === 'dag' && (
        <div className="bg-surface border border-border rounded-3xl p-6 min-h-[520px] relative overflow-hidden flex flex-col justify-between shadow-sm greek-frame">
          <div className="greek-meander opacity-30 -mx-6 -mt-6 mb-6" />

          <div className="space-y-8 relative z-10">
            {/* Layer 1: Ingress */}
            {routers.length > 0 && (
              <div>
                <div className="text-[11px] font-mono uppercase tracking-wider text-muted mb-3 flex items-center space-x-2 font-serif font-bold">
                  <Globe className="w-3.5 h-3.5 text-lapis" />
                  <span>Tier I: Ingress &amp; Reverse Proxies</span>
                </div>
                <div className="flex flex-wrap gap-4">
                  {routers.map((node) => (
                    <NodeCard
                      key={node.id}
                      node={node}
                      isSelected={selectedNode?.id === node.id}
                      onClick={() => setSelectedNode(node)}
                      icon={getNodeIcon(node.type)}
                    />
                  ))}
                </div>

                <div className="flex items-center justify-center pt-6">
                  <div className="flex items-center space-x-2 text-[10px] font-mono text-lapis bg-lapis/10 px-4 py-1 rounded-full border border-lapis/30 shadow-sm font-bold">
                    <span className="w-1.5 h-1.5 rounded-full bg-lapis celestial-beacon" />
                    <span>TRAFFIC ROUTING FLOW ↓</span>
                  </div>
                </div>
              </div>
            )}

            {/* Layer 2: Core Services */}
            <div>
              <div className="text-[11px] font-mono uppercase tracking-wider text-muted mb-3 flex items-center space-x-2 font-serif font-bold">
                <Layers className="w-3.5 h-3.5 text-gold" />
                <span>Tier II: Monitored Services &amp; Applications</span>
              </div>
              <div className="flex flex-wrap gap-4">
                {services.map((node) => (
                  <NodeCard
                    key={node.id}
                    node={node}
                    isSelected={selectedNode?.id === node.id}
                    onClick={() => setSelectedNode(node)}
                    icon={getNodeIcon(node.type)}
                  />
                ))}
              </div>

              {databases.length > 0 && (
                <div className="flex items-center justify-center pt-6">
                  <div className="flex items-center space-x-2 text-[10px] font-mono text-terracotta bg-terracotta/10 px-4 py-1 rounded-full border border-terracotta/30 shadow-sm font-bold">
                    <span className="w-1.5 h-1.5 rounded-full bg-terracotta celestial-beacon" />
                    <span>DATA PERSISTENCE FLOW ↓</span>
                  </div>
                </div>
              )}
            </div>

            {/* Layer 3: Databases */}
            {databases.length > 0 && (
              <div>
                <div className="text-[11px] font-mono uppercase tracking-wider text-muted mb-3 flex items-center space-x-2 font-serif font-bold">
                  <Database className="w-3.5 h-3.5 text-emerald" />
                  <span>Tier III: Databases &amp; Persistent Storage</span>
                </div>
                <div className="flex flex-wrap gap-4">
                  {databases.map((node) => (
                    <NodeCard
                      key={node.id}
                      node={node}
                      isSelected={selectedNode?.id === node.id}
                      onClick={() => setSelectedNode(node)}
                      icon={getNodeIcon(node.type)}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Node Detail Slide-Over */}
      {selectedNode && (
        <>
          <div 
            onClick={() => setSelectedNode(null)}
            className="fixed inset-0 bg-black/40 dark:bg-black/65 backdrop-blur-sm z-40 animate-in fade-in duration-150"
          />
          <div className="fixed inset-y-0 right-0 w-84 sm:w-96 h-screen max-h-screen bg-surface/98 backdrop-blur-2xl border-l border-gold/50 p-6 shadow-2xl z-50 flex flex-col justify-between overflow-hidden animate-in slide-in-from-right duration-200">
            <div className="flex-1 min-h-0 overflow-y-auto pr-1">
            <div className="flex items-center justify-between border-b border-border pb-4 mb-5">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-2xl bg-gold-muted border border-gold/40 flex items-center justify-center text-gold">
                  <Eye className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-bold text-ink text-base font-serif">{selectedNode.label}</h4>
                  <span className="text-[10px] font-mono text-muted uppercase tracking-wider">{selectedNode.type}</span>
                </div>
              </div>
              <button
                onClick={() => setSelectedNode(null)}
                className="p-1.5 text-muted hover:text-ink rounded-xl bg-surfaceLight hover:bg-border transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4 text-xs font-mono">
              <div className="bg-surfaceLight border border-border p-3.5 rounded-2xl flex items-center justify-between">
                <span className="text-muted font-serif">Status</span>
                <span className={`font-bold uppercase px-2.5 py-1 rounded-lg text-[10px] ${
                  selectedNode.status === 'healthy' ? 'bg-emerald/10 text-emerald border border-emerald/30' : 'bg-crimson/10 text-crimson border border-crimson/30'
                }`}>
                  {selectedNode.status}
                </span>
              </div>

              <div className="bg-surfaceLight border border-border p-3.5 rounded-2xl space-y-2.5">
                {selectedNode.metadata && Object.entries(selectedNode.metadata).map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between">
                    <span className="text-muted capitalize">{k}:</span>
                    <span className="text-ink truncate max-w-[160px] font-bold" title={v}>{v}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-border">
            <button
              onClick={() => {
                onOpenLogs(selectedNode.label);
                setSelectedNode(null);
              }}
              className="w-full flex items-center justify-center space-x-2 py-3 rounded-2xl bg-gradient-to-r from-gold to-amber-600 hover:from-gold-light hover:to-gold text-slate-950 font-bold text-xs transition-all shadow-md shadow-gold/10 tracking-wide font-mono"
            >
              <Scroll className="w-4 h-4 text-slate-950" />
              <span>VIEW CONTAINER LOGS</span>
            </button>
          </div>
        </div>
      </>
      )}
    </div>
  );
};

interface NodeCardProps {
  node: TopologyNode;
  isSelected: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
}

const NodeCard: React.FC<NodeCardProps> = ({ node, isSelected, onClick, icon: Icon }) => {
  const isStopped = node.metadata?.state && node.metadata.state !== 'running';
  const isCritical = node.status === 'critical';
  const isWarning = node.status === 'warning';

  return (
    <div
      onClick={onClick}
      className={`px-4 py-3 rounded-2xl border transition-all cursor-pointer flex items-center space-x-3 select-none ${
        isSelected
          ? 'bg-gold-muted border-gold shadow-sm ring-1 ring-gold text-gold font-bold'
          : isCritical
          ? 'bg-rose-500/10 border-crimson/50 hover:border-crimson animate-pulse text-crimson'
          : isWarning
          ? 'bg-amber-500/10 border-amber-500/40 hover:border-amber-500 text-terracotta'
          : isStopped
          ? 'bg-inset/70 border-border opacity-75 hover:opacity-100'
          : 'bg-surfaceLight border-border hover:border-gold/50'
      }`}
    >
      <div
        className={`w-9 h-9 rounded-xl flex items-center justify-center ${
          isCritical
            ? 'bg-crimson/20 text-crimson'
            : isWarning
            ? 'bg-amber-500/20 text-terracotta'
            : isStopped
            ? 'bg-inset text-muted'
            : 'bg-gold-muted text-gold'
        }`}
      >
        <Icon className="w-4 h-4" />
      </div>

      <div>
        <div className="font-bold text-xs text-ink font-mono">{node.label}</div>
        <div className="text-[10px] text-muted flex items-center space-x-1 font-mono">
          {isCritical ? (
            <AlertTriangle className="w-3 h-3 text-crimson" />
          ) : isStopped ? (
            <span className="w-2 h-2 rounded-full bg-muted" />
          ) : (
            <CheckCircle2 className="w-3 h-3 text-emerald" />
          )}
          <span className="capitalize font-serif">{isStopped ? 'Stopped' : node.status}</span>
        </div>
      </div>
    </div>
  );
};
