import React, { useState } from 'react';
import { 
  AlertTriangle, 
  CheckCircle2, 
  Sparkles, 
  Clock, 
  Eye,
  Scroll
} from 'lucide-react';
import { Incident } from '../types';

interface IncidentsViewProps {
  incidents: Incident[];
  onApproveFix: (incidentID: string) => Promise<void>;
  onResolveIncident: (incidentID: string) => Promise<void>;
  onOpenLogs: (source: string) => void;
}

export const IncidentsView: React.FC<IncidentsViewProps> = ({
  incidents,
  onApproveFix,
  onResolveIncident,
  onOpenLogs,
}) => {
  const [actingId, setActingId] = useState<string | null>(null);

  const handleApprove = async (id: string) => {
    setActingId(id);
    try {
      await onApproveFix(id);
    } finally {
      setActingId(null);
    }
  };

  const handleResolve = async (id: string) => {
    setActingId(id);
    try {
      await onResolveIncident(id);
    } finally {
      setActingId(null);
    }
  };

  const safeIncidents = Array.isArray(incidents) ? incidents : [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-[11px] font-mono uppercase tracking-widest text-muted">
          <span className="font-serif font-bold text-sepia">[ 🏛️ III // INCIDENT TRIAGE &amp; AUTO-REMEDIATION // 🏛️ ]</span>
          <span className="text-gold font-serif font-bold">✦ ACTIVE INCIDENTS</span>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-ink flex items-center space-x-2.5 font-serif">
              <AlertTriangle className="w-5 h-5 text-crimson" />
              <span>Incidents &amp; Autonomous Remediation</span>
            </h2>
            <p className="text-xs text-muted font-mono">
              Real-time anomaly triage, AI root-cause analysis, and human-in-the-loop auto-remediation
            </p>
          </div>

          <div className="flex items-center space-x-2 text-xs font-mono">
            <span className="bg-surface border border-border px-3 py-1.5 rounded-xl text-sepia font-medium">
              Active Incidents: <span className="font-bold text-ink">{safeIncidents.length}</span>
            </span>
          </div>
        </div>
      </div>

      {/* Empty State */}
      {safeIncidents.length === 0 && (
        <div className="bg-surface border border-gold/40 rounded-3xl p-12 text-center space-y-4 shadow-sm relative overflow-hidden transition-colors duration-200 greek-frame">
          <div className="greek-meander opacity-35 -mx-12 -mt-12 mb-8" />
          <div className="w-16 h-16 rounded-2xl bg-gold-muted border border-gold/40 flex items-center justify-center mx-auto text-gold shadow-sm">
            <Eye className="w-8 h-8" />
          </div>
          <div className="space-y-1">
            <h3 className="font-serif font-bold text-lg text-ink">
              All Systems Operational — Zero Active Incidents
            </h3>
            <p className="text-xs text-muted font-mono max-w-md mx-auto">
              All monitored containers, hosts, and services are running normally within standard thresholds.
            </p>
          </div>
          <div className="pt-2">
            <span className="inline-flex items-center space-x-2 text-[10px] font-mono font-bold bg-emerald/10 text-emerald border border-emerald/30 px-4 py-1.5 rounded-xl">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>ALL MONITORED SYSTEMS HEALTHY</span>
            </span>
          </div>
        </div>
      )}

      {/* Active Incidents List */}
      {safeIncidents.length > 0 && (
        <div className="space-y-5">
          {safeIncidents.map((inc) => {
            const isCritical = inc.severity === 'CRITICAL';

            return (
              <div
                key={inc.id}
                className={`bg-surface border rounded-3xl p-6 shadow-sm space-y-5 relative overflow-hidden transition-all greek-frame ${
                  isCritical ? 'border-crimson/50 bg-rose-500/5' : 'border-amber-500/40 bg-amber-500/5'
                }`}
              >
                <div className="greek-meander opacity-35 -mx-6 -mt-6 mb-4" />

                {/* Top Badge Strip */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-4">
                  <div className="flex items-center space-x-3">
                    <span className={`px-3 py-1 rounded-xl text-[10px] font-mono font-bold tracking-wider uppercase border ${
                      isCritical 
                        ? 'bg-rose-500/20 text-crimson border-crimson/40 animate-pulse' 
                        : 'bg-amber-500/20 text-terracotta border-amber-500/40'
                    }`}>
                      {inc.severity}
                    </span>
                    <span className="text-xs font-mono text-muted flex items-center space-x-1">
                      <Clock className="w-3.5 h-3.5" />
                      <span>{new Date(inc.created_at).toLocaleTimeString()}</span>
                    </span>
                  </div>

                  <div className="flex items-center space-x-2">
                    <span className="text-[10px] font-mono text-muted font-serif">Impacted:</span>
                    {inc.impacted_targets.map((t) => (
                      <span key={t} className="text-[10px] font-mono px-2 py-0.5 rounded bg-surfaceLight border border-border text-ink font-bold">
                        {t}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Title & Description */}
                <div>
                  <h3 className="font-bold text-ink text-base font-serif">{inc.title}</h3>
                  <p className="text-xs text-sepia font-mono mt-1">{inc.description}</p>
                </div>

                {/* AI Root Cause Diagnosis */}
                {inc.root_cause_summary && (
                  <div className="bg-surfaceLight border border-gold/40 rounded-2xl p-4 space-y-2">
                    <div className="flex items-center space-x-2 text-xs text-gold font-bold font-serif">
                      <Sparkles className="w-4 h-4 text-gold" />
                      <span>AI Root-Cause Diagnosis</span>
                    </div>
                    <p className="text-xs text-sepia font-mono leading-relaxed">
                      {inc.root_cause_summary}
                    </p>
                  </div>
                )}

                {/* Proposed Remediation Action & Buttons */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2">
                  <div className="text-xs font-mono text-muted">
                    {inc.proposed_action ? (
                      <span className="text-gold font-semibold font-serif">
                        Proposed Action: <span className="font-bold underline">{inc.proposed_action.action_type}</span> on <span className="font-bold">{inc.proposed_action.target_name}</span>
                      </span>
                    ) : (
                      <span className="font-serif">Awaiting manual triage</span>
                    )}
                  </div>

                  <div className="flex items-center space-x-3 font-mono text-xs">
                    {inc.impacted_targets[0] && (
                      <button
                        onClick={() => onOpenLogs(inc.impacted_targets[0])}
                        className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-surfaceLight hover:bg-border border border-border text-sepia hover:text-ink transition-all font-serif"
                      >
                        <Scroll className="w-3.5 h-3.5" />
                        <span>Logs</span>
                      </button>
                    )}

                    <button
                      onClick={() => handleResolve(inc.id)}
                      disabled={actingId === inc.id}
                      className="px-3.5 py-2 rounded-xl bg-surfaceLight hover:bg-border border border-border text-sepia hover:text-ink transition-all disabled:opacity-50 font-serif"
                    >
                      Resolve
                    </button>

                    {inc.proposed_action && (
                      <button
                        onClick={() => handleApprove(inc.id)}
                        disabled={actingId === inc.id}
                        className="flex items-center space-x-2 px-4 py-2 rounded-xl bg-gradient-to-r from-gold to-amber-600 hover:from-gold-light hover:to-gold text-slate-950 font-bold transition-all shadow-md shadow-gold/20 disabled:opacity-50 tracking-wide font-serif"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-slate-950" />
                        <span>{actingId === inc.id ? 'EXECUTING...' : '✦ APPROVE 1-CLICK FIX'}</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
