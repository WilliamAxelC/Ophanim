import React, { useState, useEffect } from 'react';
import { X, Copy, Check, Terminal, Radio, Cpu, Globe, Activity } from 'lucide-react';

interface AddDeviceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDeviceAdded: () => void;
}

export const AddDeviceModal: React.FC<AddDeviceModalProps> = ({ isOpen, onClose, onDeviceAdded }) => {
  const [tab, setTab] = useState<'monitor' | 'openwrt' | 'prometheus' | 'proxmox' | 'snmp'>('monitor');
  const [tokenData, setTokenData] = useState<{ token?: string; docker_command?: string; binary_command?: string; openwrt_command?: string }>({});
  const [copiedType, setCopiedType] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Form states
  const [formData, setFormData] = useState({
    name: '',
    ip_address: '',
    url: '',
    endpoint: '',
    community: 'public',
    token: '',
  });

  // Proxmox specific explicit credentials
  const [pveUser, setPveUser] = useState('root');
  const [pveRealm, setPveRealm] = useState('pam');
  const [pveTokenId, setPveTokenId] = useState('ophanim');
  const [pveSecret, setPveSecret] = useState('');

  useEffect(() => {
    if (isOpen) {
      fetchToken();
    }
  }, [isOpen]);

  const fetchToken = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/devices/token', { method: 'POST' });
      const data = await res.json();
      setTokenData(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string, type: string) => {
    navigator.clipboard.writeText(text);
    setCopiedType(type);
    setTimeout(() => setCopiedType(null), 2000);
  };

  const handleManualAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      let finalToken = formData.token;
      if (tab === 'proxmox') {
        const trimmedSecret = pveSecret.trim();
        if (trimmedSecret.includes('@') && trimmedSecret.includes('!')) {
          finalToken = trimmedSecret;
        } else {
          finalToken = `${pveUser.trim() || 'root'}@${pveRealm.trim() || 'pam'}!${pveTokenId.trim() || 'ophanim'}=${trimmedSecret}`;
        }
      }

      const payload = {
        name: formData.name || (tab === 'proxmox' ? 'Proxmox PVE Node' : tab === 'openwrt' ? 'OpenWRT Gateway' : 'Enrolled Probe'),
        ip_address: formData.url || formData.ip_address || formData.endpoint,
        agent_type: tab.toLowerCase(),
        enroll_token: finalToken,
      };
      await fetch('/api/devices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      onDeviceAdded();
      onClose();
    } catch (err) {
      console.error(err);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 dark:bg-black/85 backdrop-blur-xl animate-in fade-in duration-200 overflow-y-auto">
      <div 
        className="bg-surface border border-gold/40 rounded-3xl max-w-2xl w-full shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 my-auto transition-colors duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="p-6 border-b border-border flex items-center justify-between bg-surfaceLight/50">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-gold-muted border border-gold/40 flex items-center justify-center text-gold shadow-sm">
              <Radio className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-serif font-bold text-ink tracking-wide">Enroll Node or Ingestion Probe</h2>
              <p className="text-xs text-muted font-mono">Deploy an Ophanim monitor agent or connect an external scraper</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-muted hover:text-ink rounded-xl bg-inset hover:bg-border transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border px-6 overflow-x-auto bg-surfaceLight/30 text-xs font-mono">
          <button
            onClick={() => setTab('monitor')}
            className={`flex items-center space-x-2 py-3.5 px-3 border-b-2 font-bold whitespace-nowrap transition-all ${
              tab === 'monitor'
                ? 'border-gold text-gold font-bold'
                : 'border-transparent text-muted hover:text-ink'
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>Ophanim Monitor (1-Click)</span>
          </button>
          <button
            onClick={() => setTab('openwrt')}
            className={`flex items-center space-x-2 py-3.5 px-3 border-b-2 font-bold whitespace-nowrap transition-all ${
              tab === 'openwrt'
                ? 'border-gold text-gold font-bold'
                : 'border-transparent text-muted hover:text-ink'
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            <span>OpenWRT Router</span>
          </button>
          <button
            onClick={() => setTab('proxmox')}
            className={`flex items-center space-x-2 py-3.5 px-3 border-b-2 font-bold whitespace-nowrap transition-all ${
              tab === 'proxmox'
                ? 'border-gold text-gold font-bold'
                : 'border-transparent text-muted hover:text-ink'
            }`}
          >
            <Cpu className="w-3.5 h-3.5" />
            <span>Proxmox VE Cluster</span>
          </button>
          <button
            onClick={() => setTab('prometheus')}
            className={`flex items-center space-x-2 py-3.5 px-3 border-b-2 font-bold whitespace-nowrap transition-all ${
              tab === 'prometheus'
                ? 'border-gold text-gold font-bold'
                : 'border-transparent text-muted hover:text-ink'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>Prometheus Target</span>
          </button>
          <button
            onClick={() => setTab('snmp')}
            className={`flex items-center space-x-2 py-3.5 px-3 border-b-2 font-bold whitespace-nowrap transition-all ${
              tab === 'snmp'
                ? 'border-gold text-gold font-bold'
                : 'border-transparent text-muted hover:text-ink'
            }`}
          >
            <Radio className="w-3.5 h-3.5" />
            <span>SNMP Network Gear</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6">
          {tab === 'monitor' && (
            <div className="space-y-5">
              <p className="text-xs text-sepia font-mono">
                Deploy the lightweight <code className="text-gold font-bold">ophanim-monitor</code> agent (&lt;10MB binary / 15MB container) to stream host metrics, Docker cgroups, and logs:
              </p>

              {/* Docker One Liner */}
              <div>
                <div className="flex items-center justify-between text-xs font-mono text-muted mb-1.5">
                  <span className="font-semibold text-ink">Option A: Docker Run (Host Network &amp; Cgroups)</span>
                  <button
                    onClick={() => copyToClipboard(tokenData.docker_command || '', 'docker')}
                    className="flex items-center space-x-1 text-gold hover:opacity-80 font-bold"
                  >
                    {copiedType === 'docker' ? <Check className="w-3.5 h-3.5 text-emerald" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedType === 'docker' ? 'COPIED!' : 'COPY'}</span>
                  </button>
                </div>
                <div className="bg-inset border border-border p-3.5 rounded-2xl font-mono text-xs text-ink overflow-x-auto">
                  <code>{tokenData.docker_command || 'Generating enrollment command...'}</code>
                </div>
              </div>

              {/* Static Binary One Liner */}
              <div>
                <div className="flex items-center justify-between text-xs font-mono text-muted mb-1.5">
                  <span className="font-semibold text-ink">Option B: Static Go Binary One-Liner</span>
                  <button
                    onClick={() => copyToClipboard(tokenData.binary_command || '', 'binary')}
                    className="flex items-center space-x-1 text-gold hover:opacity-80 font-bold"
                  >
                    {copiedType === 'binary' ? <Check className="w-3.5 h-3.5 text-emerald" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedType === 'binary' ? 'COPIED!' : 'COPY'}</span>
                  </button>
                </div>
                <div className="bg-inset border border-border p-3.5 rounded-2xl font-mono text-xs text-ink overflow-x-auto">
                  <code>{tokenData.binary_command || 'Generating curl script...'}</code>
                </div>
              </div>
            </div>
          )}

          {tab === 'openwrt' && (
            <div className="space-y-5 font-mono text-xs">
              <p className="text-sepia">
                Connect and monitor any OpenWRT router / gateway (CPU, RAM, WAN/LAN rates, DHCP/WiFi clients):
              </p>

              {/* Automated One-Liner */}
              <div>
                <div className="flex items-center justify-between text-xs text-muted mb-1.5">
                  <span className="font-semibold text-ink">Method 1: Automated 1-Line Onboard Script (SSH into Router)</span>
                  <button
                    onClick={() => copyToClipboard(tokenData.openwrt_command || 'wget -qO- http://10.20.20.11:8085/install-openwrt.sh | sh', 'openwrt')}
                    className="flex items-center space-x-1 text-gold hover:opacity-80 font-bold"
                  >
                    {copiedType === 'openwrt' ? <Check className="w-3.5 h-3.5 text-emerald" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedType === 'openwrt' ? 'COPIED!' : 'COPY'}</span>
                  </button>
                </div>
                <div className="bg-inset border border-border p-3.5 rounded-2xl text-ink overflow-x-auto">
                  <code>{tokenData.openwrt_command || 'Generating OpenWRT onboarding command...'}</code>
                </div>
                <div className="text-[11px] text-muted space-y-1 mt-1.5">
                  <p>
                    Installs lightweight <code className="text-gold font-bold">prometheus-node-exporter-lua</code> (&lt;50KB) and configures LAN binding automatically.
                  </p>
                  <p className="text-[10px] text-sepia">
                    Manual steps: <code className="text-ink">apk add (or opkg install) prometheus-node-exporter-lua && uci set prometheus-node-exporter-lua.main.listen_interface='lan' && uci commit && /etc/init.d/prometheus-node-exporter-lua restart</code>
                  </p>
                </div>
              </div>

              {/* Manual Form */}
              <form onSubmit={handleManualAdd} className="space-y-4 pt-3 border-t border-border">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-ink font-serif">Method 2: Connect Existing Router IP / Exporter</span>
                  <span className="text-[10px] text-gold uppercase font-bold">Manual Enrollment</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-ink mb-1 font-medium font-serif">Router Name</label>
                    <input
                      type="text"
                      placeholder="e.g. OpenWRT Main Gateway"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full bg-inset border border-border rounded-xl px-3.5 py-2.5 text-ink focus:outline-none focus:border-gold"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-ink mb-1 font-medium font-serif">Router IP / Metrics URL</label>
                    <input
                      type="text"
                      placeholder="http://10.10.10.1:9100/metrics"
                      value={formData.endpoint}
                      onChange={(e) => setFormData({ ...formData, endpoint: e.target.value })}
                      className="w-full bg-inset border border-border rounded-xl px-3.5 py-2.5 text-ink focus:outline-none focus:border-gold"
                      required
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  className="w-full py-3 rounded-2xl bg-gradient-to-r from-gold to-amber-500 hover:from-gold-light hover:to-gold text-slate-950 font-bold tracking-wide shadow-md shadow-gold/20"
                >
                  ENROLL OPENWRT ROUTER
                </button>
              </form>
            </div>
          )}

          {tab === 'prometheus' && (
            <form onSubmit={handleManualAdd} className="space-y-4 font-mono text-xs">
              <p className="text-sepia">
                Connect an external Prometheus scrape endpoint:
              </p>
              <div>
                <label className="block text-ink mb-1 font-medium">Target Name</label>
                <input
                  type="text"
                  placeholder="e.g. node-exporter-pve1"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full bg-inset border border-border rounded-xl px-3.5 py-2.5 text-ink focus:outline-none focus:border-gold"
                  required
                />
              </div>
              <div>
                <label className="block text-ink mb-1 font-medium">Metrics Endpoint URL</label>
                <input
                  type="text"
                  placeholder="http://192.168.1.50:9100/metrics"
                  value={formData.endpoint}
                  onChange={(e) => setFormData({ ...formData, endpoint: e.target.value })}
                  className="w-full bg-inset border border-border rounded-xl px-3.5 py-2.5 text-ink focus:outline-none focus:border-gold"
                  required
                />
              </div>
              <button
                type="submit"
                className="w-full py-3 rounded-2xl bg-gradient-to-r from-gold to-amber-500 hover:from-gold-light hover:to-gold text-slate-950 font-bold tracking-wide shadow-md shadow-gold/20"
              >
                SAVE PROMETHEUS TARGET
              </button>
            </form>
          )}

          {tab === 'proxmox' && (
            <form onSubmit={handleManualAdd} className="space-y-4 font-mono text-xs">
              <p className="text-sepia">
                Connect a Proxmox VE Cluster API for hypervisor VM/LXC telemetry:
              </p>
              <div>
                <label className="block text-ink mb-1 font-medium font-serif">Node / Cluster Name</label>
                <input
                  type="text"
                  placeholder="e.g. Proxmox PVE (homelab2)"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full bg-inset border border-border rounded-xl px-3.5 py-2.5 text-ink focus:outline-none focus:border-gold font-mono"
                  required
                />
              </div>
              <div>
                <label className="block text-ink mb-1 font-medium font-serif">PVE API URL / Host</label>
                <input
                  type="text"
                  placeholder="https://10.10.10.3:8006"
                  value={formData.url}
                  onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                  className="w-full bg-inset border border-border rounded-xl px-3.5 py-2.5 text-ink focus:outline-none focus:border-gold font-mono"
                  required
                />
              </div>

              {/* 3-Column Split for User, Realm, and Token ID */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-ink mb-1 font-medium font-serif">PVE User</label>
                  <input
                    type="text"
                    placeholder="root"
                    value={pveUser}
                    onChange={(e) => setPveUser(e.target.value)}
                    className="w-full bg-inset border border-border rounded-xl px-3 py-2.5 text-ink focus:outline-none focus:border-gold font-mono text-xs"
                    required
                  />
                </div>
                <div>
                  <label className="block text-ink mb-1 font-medium font-serif">Realm</label>
                  <select
                    value={pveRealm}
                    onChange={(e) => setPveRealm(e.target.value)}
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
                    value={pveTokenId}
                    onChange={(e) => setPveTokenId(e.target.value)}
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
                  value={pveSecret}
                  onChange={(e) => setPveSecret(e.target.value)}
                  className="w-full bg-inset border border-border rounded-xl px-3.5 py-2.5 text-ink focus:outline-none focus:border-gold font-mono text-xs"
                  required
                />
              </div>

              {/* Preview Banner */}
              <div className="p-3 bg-surfaceLight/80 border border-gold/30 rounded-xl text-[11px] font-mono space-y-1">
                <span className="text-muted block text-[10px] uppercase font-bold tracking-wider">Authentication Header Preview:</span>
                <code className="text-gold break-all block">
                  PVEAPIToken={pveUser.trim() || 'root'}@{pveRealm.trim() || 'pam'}!{pveTokenId.trim() || 'ophanim'}={pveSecret ? '••••••••••••••••••••••••••••••••' : '(enter secret UUID)'}
                </code>
              </div>
              <button
                type="submit"
                className="w-full py-3 rounded-2xl bg-gradient-to-r from-gold to-amber-500 hover:from-gold-light hover:to-gold text-slate-950 font-bold tracking-wide shadow-md shadow-gold/20"
              >
                CONNECT PROXMOX CLUSTER
              </button>
            </form>
          )}

          {tab === 'snmp' && (
            <form onSubmit={handleManualAdd} className="space-y-4 font-mono text-xs">
              <p className="text-sepia">
                Monitor routers (OpenWRT, MikroTik, pfSense), managed switches, or UPS hardware via standard SNMP v2c:
              </p>

              {/* OpenWRT quick setup note */}
              <div className="bg-inset border border-border p-3 rounded-xl space-y-1">
                <span className="text-[11px] text-gold font-bold flex items-center space-x-1">
                  <span>💡 OpenWRT SNMP 1-Liner:</span>
                </span>
                <code className="text-ink text-[11px] block overflow-x-auto">
                  opkg update && opkg install snmpd && /etc/init.d/snmpd enable && /etc/init.d/snmpd restart
                </code>
              </div>

              <div>
                <label className="block text-ink mb-1 font-medium font-serif">Device Name</label>
                <input
                  type="text"
                  placeholder="e.g. OpenWRT Router (SNMP) or Core Switch"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full bg-inset border border-border rounded-xl px-3.5 py-2.5 text-ink focus:outline-none focus:border-gold"
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-ink mb-1 font-medium font-serif">Device IP Address / Host</label>
                  <input
                    type="text"
                    placeholder="10.10.10.1"
                    value={formData.ip_address}
                    onChange={(e) => setFormData({ ...formData, ip_address: e.target.value })}
                    className="w-full bg-inset border border-border rounded-xl px-3.5 py-2.5 text-ink focus:outline-none focus:border-gold"
                    required
                  />
                </div>
                <div>
                  <label className="block text-ink mb-1 font-medium font-serif">SNMP Community String</label>
                  <input
                    type="text"
                    placeholder="public"
                    value={formData.community}
                    onChange={(e) => setFormData({ ...formData, community: e.target.value })}
                    className="w-full bg-inset border border-border rounded-xl px-3.5 py-2.5 text-ink focus:outline-none focus:border-gold"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-3 rounded-2xl bg-gradient-to-r from-gold to-amber-500 hover:from-gold-light hover:to-gold text-slate-950 font-bold tracking-wide shadow-md shadow-gold/20"
              >
                ENROLL SNMP TARGET
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
