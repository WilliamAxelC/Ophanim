import React, { useState } from 'react';
import { 
  LayoutDashboard, 
  Network, 
  AlertTriangle, 
  Radio, 
  TrendingUp, 
  Sliders, 
  Sparkles,
  ChevronLeft,
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen,
  MoreHorizontal,
  X,
  Server,
  Zap,
  CheckCircle2
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

interface SidebarProps {
  currentTab: string;
  setCurrentTab: (tab: string) => void;
  activeIncidentsCount: number;
  openChat: () => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ 
  currentTab, 
  setCurrentTab, 
  activeIncidentsCount,
  openChat,
  isCollapsed = false,
  onToggleCollapse
}) => {
  const { theme } = useTheme();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const navItems = [
    { id: 'dashboard', num: 'I', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'topology', num: 'II', label: 'Topology Map', icon: Network },
    { 
      id: 'incidents', 
      num: 'III', 
      label: 'Incidents', 
      icon: AlertTriangle, 
      badge: activeIncidentsCount > 0 ? activeIncidentsCount : undefined,
      badgeColor: 'bg-crimson text-white animate-pulse'
    },
    { id: 'devices', num: 'IV', label: 'Devices & Probes', icon: Radio },
    { id: 'logs', num: 'V', label: 'Observability & Logs', icon: TrendingUp },
    { id: 'settings', num: 'VI', label: 'Settings', icon: Sliders },
  ];

  const dockItems = [
    { id: 'dashboard', label: 'Overview', icon: LayoutDashboard },
    { id: 'topology', label: 'Topology', icon: Network },
    { 
      id: 'incidents', 
      label: 'Alerts', 
      icon: AlertTriangle,
      badge: activeIncidentsCount > 0 ? activeIncidentsCount : undefined
    },
    { id: 'logs', label: 'Telemetry', icon: TrendingUp },
    { id: 'more', label: 'Menu', icon: MoreHorizontal }
  ];

  return (
    <>
      {/* Desktop Sidebar */}
      <aside 
        className={`hidden md:flex flex-col bg-surface/95 backdrop-blur-xl border-r border-border h-full shrink-0 shadow-xl transition-[width] duration-200 z-20 select-none ${
          isCollapsed ? 'w-20' : 'w-64 lg:w-72'
        }`}
      >
        {/* Brand Header */}
        <div className="p-4 border-b border-border bg-surfaceLight/60 shrink-0 flex items-center justify-between">
          <div className="flex items-center space-x-3 min-w-0">
            <img 
              src="/logo.svg" 
              alt="Ophanim" 
              className="w-11 h-11 object-contain shrink-0 drop-shadow-md hover:scale-105 transition-transform duration-200" 
            />
            {!isCollapsed && (
              <div className="min-w-0">
                <div className="flex items-center space-x-1.5">
                  <span className="font-serif font-extrabold text-base tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-gold to-amber-700 dark:from-gold-light dark:to-amber-400 truncate">
                    OPHANIM
                  </span>
                  <span className="text-[9px] font-mono text-gold px-1.5 py-0.2 rounded border border-gold/40 font-bold">
                    SRE
                  </span>
                </div>
                <p className="text-[9px] font-mono tracking-widest text-sepia uppercase mt-0.5 font-medium truncate">
                  Homelab Observability
                </p>
              </div>
            )}
          </div>

          {onToggleCollapse && !isCollapsed && (
            <button
              onClick={onToggleCollapse}
              className="p-1.5 text-muted hover:text-gold rounded-xl hover:bg-inset transition-colors"
              title="Collapse Sidebar"
            >
              <PanelLeftClose className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Greek Meander Decorative Ribbon */}
        <div className="greek-meander opacity-40 shrink-0" />

        {/* Navigation Items */}
        <nav className="flex-1 p-3 space-y-1.5 overflow-y-auto min-h-0">
          {!isCollapsed && (
            <div className="px-3 py-1.5 text-[10px] font-mono uppercase tracking-widest text-muted flex items-center justify-between">
              <span className="font-serif font-semibold">// NAVIGATION</span>
              <span className="text-gold">✦</span>
            </div>
          )}

          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setCurrentTab(item.id)}
                title={isCollapsed ? item.label : undefined}
                className={`w-full flex items-center ${isCollapsed ? 'justify-center p-3' : 'justify-between px-3.5 py-2.5'} rounded-2xl text-left transition-all duration-150 group relative ${
                  isActive
                    ? 'bg-gold-muted border border-gold/50 text-gold font-bold shadow-sm ring-1 ring-gold/30'
                    : 'text-sepia hover:text-ink hover:bg-surfaceLight border border-transparent'
                }`}
              >
                <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'space-x-3 min-w-0'}`}>
                  {!isCollapsed && (
                    <span className={`text-[11px] font-serif font-bold w-5 text-center shrink-0 ${isActive ? 'text-gold' : 'text-muted group-hover:text-sepia'}`}>
                      {item.num}
                    </span>
                  )}
                  <Icon className={`w-4 h-4 shrink-0 transition-colors ${isActive ? 'text-gold' : 'text-sepia group-hover:text-ink'}`} />
                  {!isCollapsed && (
                    <span className="text-xs tracking-wide truncate font-semibold font-serif">{item.label}</span>
                  )}
                </div>

                {item.badge !== undefined && (
                  <span className={`${isCollapsed ? 'absolute -top-1 -right-1' : ''} text-[10px] px-2 py-0.5 rounded-full font-mono font-bold ${item.badgeColor}`}>
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}

          {/* AI Assistant Button */}
          <div className={`${isCollapsed ? 'pt-2' : 'pt-4'}`}>
            {!isCollapsed && (
              <div className="px-3 py-1.5 text-[10px] font-mono uppercase tracking-widest text-muted flex items-center justify-between">
                <span className="font-serif font-semibold">// AI CO-PILOT</span>
                <span className="text-gold">✦</span>
              </div>
            )}
            <button
              onClick={openChat}
              title={isCollapsed ? "Ophanim AI (⌘/)" : undefined}
              className={`w-full flex items-center ${isCollapsed ? 'justify-center p-3' : 'justify-between px-3.5 py-2.5'} rounded-2xl text-left text-xs font-semibold text-amber-900 dark:text-amber-300 bg-amber-500/10 border border-amber-500/30 hover:bg-amber-500/20 transition-all shadow-sm`}
            >
              <div className="flex items-center space-x-2.5">
                <Sparkles className="w-4 h-4 text-gold shrink-0" />
                {!isCollapsed && <span className="font-serif font-bold">Ophanim AI</span>}
              </div>
              {!isCollapsed && <span className="text-[10px] font-mono text-gold opacity-80">⌘/</span>}
            </button>
          </div>
        </nav>

        {/* Footer */}
        <div className="p-3 border-t border-border bg-surfaceLight/40 space-y-2 shrink-0">
          {isCollapsed ? (
            <div className="flex flex-col items-center space-y-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald celestial-beacon" title="Daemon: Optimal" />
              {onToggleCollapse && (
                <button
                  onClick={onToggleCollapse}
                  className="p-2 text-muted hover:text-gold rounded-xl hover:bg-inset transition-colors"
                  title="Expand Sidebar"
                >
                  <PanelLeftOpen className="w-4 h-4" />
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between text-xs font-mono">
                <div className="flex items-center space-x-2 text-ink">
                  <span className="w-2 h-2 rounded-full bg-emerald celestial-beacon" />
                  <span className="text-[11px] font-serif font-semibold">Daemon Status</span>
                </div>
                <span className="text-[10px] text-emerald font-bold bg-emerald/10 px-2 py-0.5 rounded border border-emerald/30">
                  OPTIMAL
                </span>
              </div>

              <div className="text-[10px] font-mono text-muted flex items-center justify-between pt-1">
                <span className="font-serif">Ophanim SRE</span>
                <span className="text-sepia font-mono">v1.0.0</span>
              </div>
            </>
          )}
        </div>
      </aside>

      {/* Mobile Floating Glass Navigation Dock */}
      <div className="md:hidden fixed bottom-3 inset-x-3 max-w-md mx-auto z-40">
        <div className="bg-surface/90 backdrop-blur-2xl border border-gold/40 rounded-2xl shadow-2xl p-1.5 flex items-center justify-between gap-1 greek-frame">
          {dockItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  if (item.id === 'more') {
                    setIsMobileMenuOpen(true);
                  } else {
                    setCurrentTab(item.id);
                  }
                }}
                className={`flex-1 flex flex-col items-center justify-center py-1.5 px-1.5 rounded-xl relative transition-all duration-200 ${
                  isActive
                    ? 'bg-gold text-slate-950 font-bold shadow-md scale-105 ring-1 ring-gold/40'
                    : 'text-sepia hover:text-ink hover:bg-surfaceLight/60'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-slate-950' : 'text-sepia'}`} />
                <span className={`text-[9px] mt-0.5 font-serif tracking-wider truncate max-w-[56px] ${
                  isActive ? 'font-extrabold text-slate-950' : 'font-semibold'
                }`}>
                  {item.label}
                </span>

                {item.badge !== undefined && (
                  <span className="absolute -top-1 -right-0.5 min-w-[16px] h-4 px-1 bg-crimson text-white rounded-full text-[8px] font-mono font-bold flex items-center justify-center shadow-xs animate-pulse">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Mobile More Sheet Drawer */}
      {isMobileMenuOpen && (
        <div 
          className="md:hidden fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex flex-col justify-end animate-in fade-in duration-200"
          onClick={() => setIsMobileMenuOpen(false)}
        >
          <div 
            className="bg-surface border-t border-gold/40 rounded-t-3xl p-5 shadow-2xl space-y-4 max-h-[80vh] overflow-y-auto animate-in slide-in-from-bottom duration-200 greek-frame"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Sheet Handle */}
            <div className="w-12 h-1.5 rounded-full bg-border mx-auto -mt-1 mb-2" />

            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center space-x-2">
                <span className="text-gold font-serif font-bold text-sm">🏛️</span>
                <span className="font-serif font-bold text-sm text-ink tracking-wider">Sanctuary Menu</span>
              </div>
              <button 
                onClick={() => setIsMobileMenuOpen(false)}
                className="p-1.5 rounded-xl bg-inset text-muted hover:text-ink"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Menu Nav Links */}
            <div className="grid grid-cols-2 gap-2.5">
              <button
                onClick={() => { setCurrentTab('devices'); setIsMobileMenuOpen(false); }}
                className={`p-3 rounded-2xl border text-left flex items-center space-x-3 transition-all ${
                  currentTab === 'devices' 
                    ? 'bg-gold-muted border-gold/50 text-gold font-bold' 
                    : 'bg-surfaceLight border-border text-ink hover:border-gold/40'
                }`}
              >
                <Radio className="w-4 h-4 text-gold shrink-0" />
                <div className="min-w-0">
                  <div className="text-xs font-serif font-bold truncate">IV. Devices &amp; Probes</div>
                  <div className="text-[10px] text-muted font-mono truncate">Nodes &amp; Gateways</div>
                </div>
              </button>

              <button
                onClick={() => { setCurrentTab('settings'); setIsMobileMenuOpen(false); }}
                className={`p-3 rounded-2xl border text-left flex items-center space-x-3 transition-all ${
                  currentTab === 'settings' 
                    ? 'bg-gold-muted border-gold/50 text-gold font-bold' 
                    : 'bg-surfaceLight border-border text-ink hover:border-gold/40'
                }`}
              >
                <Sliders className="w-4 h-4 text-gold shrink-0" />
                <div className="min-w-0">
                  <div className="text-xs font-serif font-bold truncate">VI. Settings</div>
                  <div className="text-[10px] text-muted font-mono truncate">AI, ChatOps, Decrees</div>
                </div>
              </button>
            </div>

            {/* AI Co-Pilot Quick Launcher */}
            <button
              onClick={() => { openChat(); setIsMobileMenuOpen(false); }}
              className="w-full p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 hover:bg-amber-500/20 text-ink flex items-center justify-between transition-all shadow-xs"
            >
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 rounded-xl bg-gold/20 flex items-center justify-center text-gold">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div className="text-left">
                  <div className="text-xs font-serif font-bold text-gold">Ask Ophanim AI Co-Pilot</div>
                  <div className="text-[10px] text-muted font-mono">Autonomous SRE triage &amp; analytics</div>
                </div>
              </div>
              <span className="text-[10px] font-mono px-2.5 py-1 rounded-lg bg-gold text-slate-950 font-bold">
                OPEN ✦
              </span>
            </button>

            {/* Daemon Footer Info */}
            <div className="pt-2 border-t border-border flex items-center justify-between text-[11px] font-mono text-muted">
              <div className="flex items-center space-x-2">
                <span className="w-2 h-2 rounded-full bg-emerald celestial-beacon" />
                <span>Daemon: Optimal</span>
              </div>
              <span className="text-sepia">Ophanim SRE v1.0.0</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
