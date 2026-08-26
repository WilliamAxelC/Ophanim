import React from 'react';
import { Plus, Sparkles, RefreshCw, Search, Eye, Bell, Moon, Landmark } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

interface HeaderProps {
  onOpenAddDevice: () => void;
  onOpenChat: () => void;
  onOpenCommandPalette?: () => void;
  onRefresh: () => void;
  isRefreshing: boolean;
  activeIncidentsCount: number;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenAddDevice,
  onOpenChat,
  onOpenCommandPalette,
  onRefresh,
  isRefreshing,
  activeIncidentsCount,
}) => {
  const { theme, toggleTheme } = useTheme();

  return (
    <header className="bg-surface/95 backdrop-blur-xl border-b border-border sticky top-0 z-10 shadow-sm transition-colors duration-200">
      <div className="px-3 sm:px-6 md:px-8 py-2.5 md:py-3 flex items-center justify-between gap-2">
        {/* Left Brand & Cluster Status */}
        <div className="flex items-center space-x-2 sm:space-x-3 min-w-0">
          {/* Mobile Logo Branding with Integrated Status Beacon */}
          <div className="md:hidden flex items-center space-x-2 shrink-0">
            <img src="/logo.svg" alt="Ophanim" className="w-8 h-8 object-contain shrink-0 drop-shadow-xs" />
            <div className="flex items-center space-x-1.5">
              <span className="font-serif font-extrabold text-xs tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-gold to-amber-700 dark:from-gold-light dark:to-amber-400">
                OPHANIM
              </span>
              <span className="w-2 h-2 rounded-full bg-emerald celestial-beacon" title="Sanctuary: Optimal" />
            </div>
          </div>

          {/* Desktop Cluster Status Pill */}
          <div className="hidden sm:flex items-center space-x-1.5 text-xs font-mono bg-surfaceLight border border-gold/40 px-3 py-1.5 rounded-xl text-ink shadow-xs shrink-0">
            <span className="w-2 h-2 rounded-full bg-emerald celestial-beacon" />
            <span className="text-sepia font-mono text-[10px] uppercase tracking-wider font-semibold">
              CLUSTER:
            </span>
            <span className="text-emerald font-extrabold tracking-wide font-mono text-xs">OPTIMAL</span>
          </div>

          {activeIncidentsCount > 0 && (
            <div className="flex items-center space-x-1 text-xs font-mono bg-rose-500/10 border border-crimson/40 px-2 sm:px-2.5 py-1 rounded-xl text-crimson animate-pulse font-bold shrink-0">
              <Bell className="w-3 h-3 text-crimson" />
              <span>{activeIncidentsCount}</span>
            </div>
          )}
        </div>

        {/* Right Actions & Controls */}
        <div className="flex items-center space-x-1.5 sm:space-x-2.5 shrink-0">
          {/* Theme Switcher Button */}
          <button
            onClick={toggleTheme}
            className="flex items-center space-x-1.5 text-xs font-mono p-2 sm:px-3 sm:py-1.5 rounded-xl bg-surfaceLight border border-border text-ink hover:border-gold/60 transition-all shadow-xs group"
            title={`Switch to ${theme === 'parchment' ? 'Obsidian Dark' : 'Ancient Parchment'} Theme`}
          >
            {theme === 'parchment' ? (
              <>
                <Landmark className="w-3.5 h-3.5 text-gold group-hover:scale-110 transition-transform" />
                <span className="hidden lg:inline text-[10px] font-bold tracking-wider">PARCHMENT</span>
              </>
            ) : (
              <>
                <Moon className="w-3.5 h-3.5 text-gold group-hover:scale-110 transition-transform" />
                <span className="hidden lg:inline text-[10px] font-bold tracking-wider">OBSIDIAN</span>
              </>
            )}
          </button>

          {/* Search / Command Palette */}
          {onOpenCommandPalette && (
            <button
              onClick={onOpenCommandPalette}
              className="flex items-center space-x-1.5 text-xs font-mono p-2 sm:px-3 sm:py-1.5 rounded-xl bg-surfaceLight border border-border text-ink hover:border-gold/50 transition-all shadow-xs group"
              title="Search Sanctum (⌘K)"
            >
              <Search className="w-3.5 h-3.5 text-gold group-hover:scale-110 transition-transform" />
              <span className="hidden md:inline font-mono text-xs">Search...</span>
              <kbd className="hidden md:inline text-[10px] bg-inset px-1.5 py-0.5 rounded border border-border text-sepia font-mono">⌘K</kbd>
            </button>
          )}

          {/* Refresh Button */}
          <button
            onClick={onRefresh}
            className="p-2 text-sepia hover:text-gold bg-surfaceLight border border-border hover:border-gold/40 rounded-xl transition-all shadow-xs"
            title="Refresh Telemetry"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-gold' : ''}`} />
          </button>

          {/* Ask Ophanim AI Co-Pilot */}
          <button
            onClick={onOpenChat}
            className="flex items-center space-x-1.5 text-xs font-semibold px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-xl bg-amber-500/10 text-amber-800 dark:text-amber-300 border border-amber-500/30 hover:bg-amber-500/20 transition-all shadow-xs"
            title="Ask Ophanim AI Co-Pilot (⌘/)"
          >
            <Sparkles className="w-3.5 h-3.5 text-gold" />
            <span className="hidden sm:inline font-serif font-bold text-xs">Ophanim AI</span>
          </button>

          {/* Enroll Node Button */}
          <button
            onClick={onOpenAddDevice}
            className="flex items-center space-x-1.5 text-xs font-bold p-2 sm:px-3.5 sm:py-2 rounded-xl bg-gradient-to-r from-gold to-amber-600 hover:from-gold-light hover:to-gold text-slate-950 transition-all shadow-md shadow-gold/20 tracking-wide font-mono"
            title="Enroll New Sentinel Node"
          >
            <Plus className="w-3.5 h-3.5 text-slate-950 font-extrabold" />
            <span className="hidden sm:inline text-xs">ENROLL</span>
          </button>
        </div>
      </div>

      {/* Greek Key Meander Frieze Trim under Header */}
      <div className="greek-meander opacity-50" />
    </header>
  );
};
