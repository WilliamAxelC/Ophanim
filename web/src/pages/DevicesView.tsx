import React, { useState } from 'react';
import { Radio, Plus, CheckCircle2, XCircle, Server, Trash2, Cpu, Link, Layers, Edit3, X, Globe } from 'lucide-react';
import { DeviceNode } from '../types';

interface DevicesViewProps {
  devices: DeviceNode[];
  onOpenAddDevice: () => void;
  onDeleteDevice?: (id: string) => Promise<void>;
  onUpdateDevice?: (id: string, name: string, ip: string, token?: string) => Promise<void>;
  isDemo?: boolean;
}

export const DevicesView: React.FC<DevicesViewProps> = ({ 
  devices, 
  onOpenAddDevice, 
  onDeleteDevice,
  onUpdateDevice,
  isDemo = false 
}) => {
  const safeDevices = Array.isArray(devices) ? devices : [];
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Edit Modal State
  const [editingDevice, setEditingDevice] = useState<DeviceNode | null>(null);
  const [editName, setEditName] = useState('');
  const [editIp, setEditIp] = useState('');
  const [editPveUser, setEditPveUser] = useState('root');
  const [editPveRealm, setEditPveRealm] = useState('pam');
  const [editPveTokenId, setEditPveTokenId] = useState('ophanim');
  const [editPveSecret, setEditPveSecret] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Auto-detect Proxmox PVE Hypervisor and Docker LXC / Guest relationships
  const pveNode = safeDevices.find((d) => 
    d.name.toLowerCase().includes('proxmox') || 
    d.name.toLowerCase().includes('pve') || 
    d.name.toLowerCase().includes('homelab2') ||
    d.agent_type === 'proxmox'
  );

  const handleDelete = async (id: string) => {
    if (!onDeleteDevice) return;
    try {
      setIsDeleting(true);
      await onDeleteDevice(id);
      setConfirmDeleteId(null);
    } catch (err) {
      console.error('Failed to delete device:', err);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleStartEdit = (d: DeviceNode) => {
    setEditingDevice(d);
    setEditName(d.name);
    setEditIp(d.ip_address || '');
    
    // Parse existing Proxmox credentials if present
    const tok = (d.enroll_token || '').replace(/^PVEAPIToken=/, '').trim();
    if (tok.includes('=') && tok.includes('@') && tok.includes('!')) {
      const [headerPart, secretPart] = tok.split('=', 2);
      const [uPart, rest] = headerPart.split('@', 2);
      const [rPart, tPart] = rest.split('!', 2);
      setEditPveUser(uPart || 'root');
      setEditPveRealm(rPart || 'pam');
      setEditPveTokenId(tPart || 'ophanim');
      setEditPveSecret(secretPart || '');
    } else {
      setEditPveUser('root');
      setEditPveRealm('pam');
      setEditPveTokenId('ophanim');
      setEditPveSecret(tok);
    }
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDevice || !onUpdateDevice) return;
    try {
      setIsSaving(true);
      let finalToken = editPveSecret;
      if (editingDevice.agent_type === 'proxmox') {
        const trimmedSecret = editPveSecret.trim();
        if (trimmedSecret.includes('@') && trimmedSecret.includes('!')) {
          finalToken = trimmedSecret;
        } else {
          finalToken = `${editPveUser.trim() || 'root'}@${editPveRealm.trim() || 'pam'}!${editPveTokenId.trim() || 'ophanim'}=${trimmedSecret}`;
        }
      }
      await onUpdateDevice(editingDevice.id, editName, editIp, finalToken);
      setEditingDevice(null);
    } catch (err) {
      console.error('Failed to update device:', err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-[11px] font-mono uppercase tracking-widest text-muted">
          <span className="font-serif font-bold text-sepia">[ 🏛️ IV // MONITORED NODES &amp; HARDWARE PROBES // 🏛️ ]</span>
          <span className="text-gold font-serif font-bold">✦ INGESTION PROBES</span>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-ink flex items-center space-x-2.5 font-serif">
              <Radio className="w-5 h-5 text-gold" />
              <span>Devices &amp; Ingestion Probes</span>
            </h2>
            <p className="text-xs text-muted font-mono">
              Homelab bare-metal nodes, Proxmox hypervisors, and autonomous Ophanim edge monitors
            </p>
          </div>

          <button
            onClick={onOpenAddDevice}
            disabled={isDemo}
            className={`flex items-center space-x-2 text-xs px-4 py-2.5 rounded-2xl bg-gradient-to-r from-gold to-amber-600 hover:from-gold-light hover:to-gold text-slate-950 font-bold transition-all shadow-md shadow-gold/20 tracking-wide font-serif ${
              isDemo ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          >
            <Plus className="w-4 h-4 text-slate-950" />
            <span>ENROLL NEW DEVICE</span>
          </button>
        </div>
      </div>

      {/* Grid of Devices */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {safeDevices.map((d) => {
          const isPVE = d.name.toLowerCase().includes('proxmox') || d.name.toLowerCase().includes('pve') || d.agent_type === 'proxmox';
          const isOpenWRT = d.name.toLowerCase().includes('openwrt') || d.name.toLowerCase().includes('router') || d.agent_type === 'openwrt';

          return (
            <div
              key={d.id}
              className="bg-surface border border-border hover:border-gold/60 rounded-3xl p-5 transition-all shadow-sm relative overflow-hidden group greek-frame flex flex-col justify-between"
            >
              <div>
                <div className="greek-meander opacity-35 -mx-5 -mt-5 mb-4" />

                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center space-x-3 min-w-0">
                    <div className={`w-10 h-10 rounded-2xl border flex items-center justify-center shrink-0 ${
                      isPVE 
                        ? 'bg-gold-muted border-gold text-gold' 
                        : isOpenWRT
                        ? 'bg-teal-500/10 border-teal-500/30 text-teal-400'
                        : 'bg-surfaceLight border-border text-sepia'
                    }`}>
                      {isPVE ? <Cpu className="w-5 h-5" /> : isOpenWRT ? <Globe className="w-5 h-5" /> : <Server className="w-5 h-5" />}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center space-x-1.5">
                        <h3 className="font-bold text-ink text-sm tracking-wide font-serif truncate">{d.name}</h3>
                        <button
                          onClick={() => handleStartEdit(d)}
                          disabled={isDemo}
                          title="Edit Device Name & Details"
                          className="text-muted/60 hover:text-gold transition-colors p-0.5"
                        >
                          <Edit3 className="w-3 h-3" />
                        </button>
                      </div>
                      <span className="text-[11px] font-mono text-muted">{d.ip_address || 'Local Socket'}</span>
                    </div>
                  </div>

                  <span
                    className={`px-2.5 py-1 rounded-xl text-[10px] font-mono font-bold flex items-center space-x-1 shrink-0 ${
                      d.status === 'online'
                        ? 'bg-emerald/10 text-emerald border border-emerald/30'
                        : 'bg-crimson/10 text-crimson border border-crimson/30'
                    }`}
                  >
                    {d.status === 'online' ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                    <span className="uppercase font-serif">{d.status}</span>
                  </span>
                </div>

                {/* System Hierarchy Tag */}
                {isPVE && (
                  <div className="mb-3 px-2.5 py-1 rounded-xl bg-gold/10 border border-gold/30 text-gold text-[10px] font-mono font-bold flex items-center space-x-1.5">
                    <Layers className="w-3 h-3" />
                    <span>PROXMOX VE HYPERVISOR</span>
                  </div>
                )}
                {isOpenWRT && (
                  <div className="mb-3 px-2.5 py-1 rounded-xl bg-teal-500/10 border border-teal-500/30 text-teal-400 text-[10px] font-mono font-bold flex items-center space-x-1.5">
                    <Globe className="w-3 h-3" />
                    <span>OPENWRT NETWORK GATEWAY</span>
                  </div>
                )}

                <div className="space-y-2 text-xs font-mono border-t border-border pt-3">
                  <div className="flex items-center justify-between text-muted">
                    <span className="font-serif">Agent Type:</span>
                    <span className="text-gold font-bold bg-surfaceLight px-2 py-0.5 rounded text-[10px] border border-border">
                      {d.agent_type || 'OPH-DAEMON'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-muted">
                    <span className="font-serif">Last Heartbeat:</span>
                    <span className="text-ink font-medium">
                      {d.last_seen ? new Date(d.last_seen).toLocaleTimeString() : 'Continuous'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Card Footer Actions */}
              <div className="mt-4 pt-3 border-t border-border flex items-center justify-between">
                <span className="text-[10px] font-mono text-muted">ID: {d.id}</span>

                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => handleStartEdit(d)}
                    disabled={isDemo}
                    title="Edit Device"
                    className="p-1.5 text-muted/60 hover:text-gold hover:bg-gold/10 rounded-lg transition-colors"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>

                  {confirmDeleteId === d.id ? (
                    <div className="flex items-center space-x-1.5 animate-fadeIn">
                      <button
                        onClick={() => handleDelete(d.id)}
                        disabled={isDeleting}
                        className="px-2.5 py-1 rounded-lg bg-crimson hover:bg-rose-700 text-white font-mono text-[10px] font-bold shadow-xs transition-all"
                      >
                        {isDeleting ? 'Deleting...' : 'Confirm'}
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(null)}
                        className="px-2 py-1 rounded-lg bg-inset border border-border text-muted hover:text-ink font-mono text-[10px]"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmDeleteId(d.id)}
                      disabled={isDemo}
                      title="Delete Enrolled Device"
                      className="p-1.5 text-muted/60 hover:text-crimson hover:bg-crimson/10 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Edit Device Modal */}
      {editingDevice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 dark:bg-black/85 backdrop-blur-xl animate-in fade-in duration-200">
          <div 
            className="bg-surface border border-gold/40 rounded-3xl max-w-lg w-full shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 greek-frame"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="greek-meander opacity-35" />
            <div className="p-6 border-b border-border flex items-center justify-between bg-surfaceLight/50">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-2xl bg-gold-muted border border-gold flex items-center justify-center text-gold">
                  <Edit3 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-ink font-serif">Edit Enrolled Device</h3>
                  <span className="text-[11px] font-mono text-muted">ID: {editingDevice.id}</span>
                </div>
              </div>
              <button 
                onClick={() => setEditingDevice(null)}
                className="p-2 rounded-xl text-muted hover:text-ink hover:bg-surfaceLight transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="p-6 space-y-4 font-mono text-xs">
              <div>
                <label className="block text-ink mb-1 font-medium font-serif">Device Display Name</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="e.g. Proxmox PVE Node"
                  className="w-full bg-inset border border-border rounded-xl px-3.5 py-2.5 text-ink focus:outline-none focus:border-gold font-mono"
                  required
                />
              </div>

              <div>
                <label className="block text-ink mb-1 font-medium font-serif">IP Address / Endpoint URL</label>
                <input
                  type="text"
                  value={editIp}
                  onChange={(e) => setEditIp(e.target.value)}
                  placeholder="https://10.20.20.1:8006"
                  className="w-full bg-inset border border-border rounded-xl px-3.5 py-2.5 text-ink focus:outline-none focus:border-gold font-mono"
                />
              </div>

              {editingDevice.agent_type === 'proxmox' && (
                <div className="space-y-3 pt-2 border-t border-border">
                  <span className="text-[11px] font-bold text-ink font-serif block">
                    Proxmox VE API Authentication:
                  </span>

                  {/* 3-Column Split for User, Realm, and Token ID */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-ink mb-1 font-medium font-serif">PVE User</label>
                      <input
                        type="text"
                        placeholder="root"
                        value={editPveUser}
                        onChange={(e) => setEditPveUser(e.target.value)}
                        className="w-full bg-inset border border-border rounded-xl px-3 py-2.5 text-ink focus:outline-none focus:border-gold font-mono text-xs"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-ink mb-1 font-medium font-serif">Realm</label>
                      <select
                        value={editPveRealm}
                        onChange={(e) => setEditPveRealm(e.target.value)}
                        className="w-full bg-inset border border-border rounded-xl px-3 py-2.5 text-ink focus:outline-none focus:border-gold font-mono text-xs cursor-pointer"
                      >
                        <option value="pam">pam (Linux PAM)</option>
                        <option value="pve">pve (Proxmox Auth)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-ink mb-1 font-medium font-serif">Token ID / Name</label>
                      <input
                        type="text"
                        placeholder="ophanim"
                        value={editPveTokenId}
                        onChange={(e) => setEditPveTokenId(e.target.value)}
                        className="w-full bg-inset border border-border rounded-xl px-3 py-2.5 text-ink focus:outline-none focus:border-gold font-mono text-xs"
                        required
                      />
                    </div>
                  </div>

                  {/* Secret Key Input */}
                  <div>
                    <label className="block text-ink mb-1 font-medium font-serif">
                      Token Secret Key (UUID)
                    </label>
                    <input
                      type="password"
                      placeholder="f1e7da15-a68b-4888-b1b3-047ff64d3416"
                      value={editPveSecret}
                      onChange={(e) => setEditPveSecret(e.target.value)}
                      className="w-full bg-inset border border-border rounded-xl px-3.5 py-2.5 text-ink focus:outline-none focus:border-gold font-mono text-xs"
                      required
                    />
                  </div>

                  {/* Preview Banner */}
                  <div className="p-3 bg-surfaceLight/80 border border-gold/30 rounded-xl text-[11px] font-mono space-y-1">
                    <span className="text-muted block text-[10px] uppercase font-bold tracking-wider">Authentication Header Preview:</span>
                    <code className="text-gold break-all block">
                      PVEAPIToken={editPveUser.trim() || 'root'}@{editPveRealm.trim() || 'pam'}!{editPveTokenId.trim() || 'ophanim'}={editPveSecret ? '••••••••••••••••••••••••••••••••' : '(enter secret UUID)'}
                    </code>
                  </div>
                </div>
              )}

              <div className="pt-3 border-t border-border flex items-center justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setEditingDevice(null)}
                  className="px-4 py-2.5 rounded-xl bg-inset border border-border text-muted hover:text-ink font-mono text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-gold to-amber-600 hover:from-gold-light hover:to-gold text-slate-950 font-bold font-serif text-xs shadow-md shadow-gold/20"
                >
                  {isSaving ? 'Saving...' : 'SAVE CHANGES'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
