import React, { useState, useEffect } from 'react';
import { 
  Sliders, 
  Sparkles, 
  ShieldAlert, 
  Bell, 
  Save, 
  CheckCircle2, 
  AlertCircle,
  Eye,
  EyeOff,
  Server,
  RefreshCw,
  Landmark,
  Moon,
  ListFilter,
  Lock,
  Send,
  HelpCircle,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  MessageSquare
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

export const SettingsView: React.FC = () => {
  const { theme, setTheme } = useTheme();
  const [activeTab, setActiveTab] = useState<'llm' | 'thresholds' | 'chatops' | 'appearance'>('llm');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showApiKey, setShowApiKey] = useState(false);

  // LLM Settings state
  const [provider, setProvider] = useState('gemini');
  const [model, setModel] = useState('gemini-2.5-flash');
  const [endpoint, setEndpoint] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [apiKeyMasked, setApiKeyMasked] = useState('');
  const [temperature, setTemperature] = useState(0.2);

  // Model Query state
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [isFetchingModels, setIsFetchingModels] = useState(false);
  const [modelFetchMsg, setModelFetchMsg] = useState<string | null>(null);

  // Thresholds state
  const [cpuCritical, setCpuCritical] = useState(95);
  const [memoryCritical, setMemoryCritical] = useState(95);
  const [diskCritical, setDiskCritical] = useState(92);
  const [autoHealMax, setAutoHealMax] = useState(2);

  // ChatOps state & Wizard inputs
  const [discordEnabled, setDiscordEnabled] = useState(false);
  const [discordWebhook, setDiscordWebhook] = useState('');
  const [telegramEnabled, setTelegramEnabled] = useState(false);
  const [telegramToken, setTelegramToken] = useState('');
  const [telegramChatID, setTelegramChatID] = useState('');
  
  // ChatOps testing state
  const [testingChannel, setTestingChannel] = useState<'discord' | 'telegram' | null>(null);
  const [testResult, setTestResult] = useState<{ channel: string; success: boolean; msg: string } | null>(null);
  const [showDiscordGuide, setShowDiscordGuide] = useState(false);
  const [showTelegramGuide, setShowTelegramGuide] = useState(false);

  const isCustomEndpointAllowed = provider === 'custom' || provider === 'ollama';

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      setIsLoading(true);
      const res = await fetch('/api/settings');
      if (res.ok) {
        const data = await res.json();
        if (data.llm) {
          setProvider(data.llm.provider || 'gemini');
          setModel(data.llm.model || 'gemini-2.5-flash');
          setEndpoint(data.llm.endpoint || '');
          setApiKeyMasked(data.llm.api_key_masked || '');
          setTemperature(data.llm.temperature || 0.2);
        }
        if (data.thresholds) {
          setCpuCritical(data.thresholds.cpu_critical_percent || 95);
          setMemoryCritical(data.thresholds.memory_critical_percent || 95);
          setDiskCritical(data.thresholds.disk_critical_percent || 92);
          setAutoHealMax(data.thresholds.auto_heal_max_per_hour || 2);
        }
        if (data.chatops) {
          setDiscordEnabled(data.chatops.discord_enabled || false);
          setTelegramEnabled(data.chatops.telegram_enabled || false);
        }
      }
    } catch (e) {
      console.error('Failed to fetch settings:', e);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchAvailableModels = async (prov = provider, ep = endpoint, key = apiKey) => {
    try {
      setIsFetchingModels(true);
      setModelFetchMsg(null);
      const res = await fetch('/api/settings/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: prov,
          endpoint: ep,
          api_key: key,
        }),
      });

      const contentType = res.headers.get('content-type') || '';
      let data: any = null;
      if (contentType.includes('application/json')) {
        data = await res.json();
      } else {
        const text = await res.text();
        data = { error: text.startsWith('<') ? `Server returned HTTP ${res.status}: ${res.statusText}` : text };
      }

      if (res.ok && data) {
        if (Array.isArray(data.models) && data.models.length > 0) {
          setAvailableModels(data.models);
          setModelFetchMsg(`Discovered ${data.models.length} available models from endpoint!`);
          if (!model || !data.models.includes(model)) {
            setModel(data.models[0]);
          }
        } else if (data.error) {
          setModelFetchMsg(`Discovery notice: ${data.error}`);
        } else {
          setModelFetchMsg('No models returned from endpoint.');
        }
      } else {
        setModelFetchMsg(`Discovery notice: ${data?.error || `HTTP ${res.status}: ${res.statusText}`}`);
      }
    } catch (e: any) {
      setModelFetchMsg(`Failed to query models: ${e.message}`);
    } finally {
      setIsFetchingModels(false);
    }
  };

  const handleProviderChange = (p: string) => {
    setProvider(p);
    if (p === 'gemini') {
      setModel('gemini-2.5-flash');
      setEndpoint('https://generativelanguage.googleapis.com');
    } else if (p === 'claude') {
      setModel('claude-3-5-sonnet-20241022');
      setEndpoint('https://api.anthropic.com');
    } else if (p === 'openai') {
      setModel('gpt-4o-mini');
      setEndpoint('https://api.openai.com/v1');
    } else if (p === 'mistral') {
      setModel('mistral-large-latest');
      setEndpoint('https://api.mistral.ai/v1');
    } else if (p === 'ollama') {
      setModel('llama3.2');
      setEndpoint('http://10.20.20.10:11434');
    } else if (p === 'custom') {
      setModel('meta-llama/llama-3.2-3b-instruct');
      setEndpoint('http://10.20.20.10:8000/v1');
    }
    fetchAvailableModels(p);
  };

  const handleSave = async () => {
    try {
      setIsSaving(true);
      setStatusMsg(null);

      const payload: any = {
        llm: {
          enabled: true, // Automatically active
          provider: provider,
          model: model,
          endpoint: endpoint,
          temperature: temperature,
        },
        thresholds: {
          cpu_critical_percent: cpuCritical,
          memory_critical_percent: memoryCritical,
          disk_critical_percent: diskCritical,
          auto_heal_max_per_hour: autoHealMax,
        },
      };

      if (apiKey.trim()) {
        payload.llm.api_key = apiKey.trim();
      }

      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setStatusMsg({ type: 'success', text: 'All settings and LLM configurations successfully persisted!' });
        if (apiKey.trim()) {
          setApiKeyMasked(apiKey.length > 6 ? apiKey.slice(0, 3) + '...' + apiKey.slice(-3) : '******');
          setApiKey('');
        }
      } else {
        const err = await res.json();
        setStatusMsg({ type: 'error', text: err.error || 'Failed to save settings' });
      }
    } catch (e: any) {
      setStatusMsg({ type: 'error', text: e.message });
    } finally {
      setIsSaving(false);
      setTimeout(() => setStatusMsg(null), 5000);
    }
  };

  const testChatOps = async (channel: 'discord' | 'telegram') => {
    try {
      setTestingChannel(channel);
      setTestResult(null);

      const body: any = { channel };
      if (channel === 'discord' && discordWebhook.trim()) {
        body.webhook_url = discordWebhook.trim();
      }
      if (channel === 'telegram') {
        if (telegramToken.trim()) body.bot_token = telegramToken.trim();
        if (telegramChatID.trim()) body.chat_id = telegramChatID.trim();
      }

      const res = await fetch('/api/chatops/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (res.ok) {
        setTestResult({ channel, success: true, msg: data.status || 'Test alert delivered successfully!' });
      } else {
        setTestResult({ channel, success: false, msg: data.error || 'Failed to send test alert.' });
      }
    } catch (e: any) {
      setTestResult({ channel, success: false, msg: e.message });
    } finally {
      setTestingChannel(null);
    }
  };

  if (isLoading) {
    return (
      <div className="p-12 text-center text-muted font-mono text-xs">
        Loading configuration decrees...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-[11px] font-mono uppercase tracking-widest text-muted">
          <span className="font-serif font-bold text-sepia">[ 🏛️ VI // SYSTEM SETTINGS &amp; CONFIGURATION // 🏛️ ]</span>
          <span className="text-gold font-serif font-bold">✦ PERSISTENT SQLITE STORAGE</span>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-ink flex items-center space-x-2.5 font-serif">
              <Sliders className="w-5 h-5 text-gold" />
              <span>System Settings</span>
            </h2>
            <p className="text-xs text-muted font-mono">
              Configure Ophanim AI intelligence, ChatOps setup wizard, SRE guardrails, and visual themes
            </p>
          </div>

          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center space-x-2 px-5 py-2.5 rounded-2xl bg-gradient-to-r from-gold to-amber-600 hover:from-gold-light hover:to-gold text-slate-950 text-xs font-bold transition-all shadow-md shadow-gold/20 disabled:opacity-50 font-serif"
          >
            <Save className="w-4 h-4 text-slate-950" />
            <span>{isSaving ? 'SAVING...' : 'SAVE CHANGES'}</span>
          </button>
        </div>
      </div>

      {/* Feedback Toast */}
      {statusMsg && (
        <div className={`p-4 rounded-2xl border flex items-center space-x-3 text-xs font-mono animate-in fade-in duration-200 ${
          statusMsg.type === 'success' ? 'bg-emerald/10 border-emerald/30 text-emerald' : 'bg-rose-500/10 border-rose-500/30 text-crimson'
        }`}>
          {statusMsg.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
          <span>{statusMsg.text}</span>
        </div>
      )}

      {/* Tabs Ribbon */}
      <div className="flex items-center space-x-2 border-b border-border pb-3 overflow-x-auto text-xs font-serif font-bold">
        <button
          onClick={() => setActiveTab('llm')}
          className={`flex items-center space-x-2 px-4 py-2 rounded-xl transition-all ${
            activeTab === 'llm' ? 'bg-gold-muted text-gold border border-gold/40 shadow-sm' : 'text-muted hover:text-ink'
          }`}
        >
          <Sparkles className="w-4 h-4 text-gold" />
          <span>Ophanim AI Intelligence</span>
        </button>

        <button
          onClick={() => setActiveTab('chatops')}
          className={`flex items-center space-x-2 px-4 py-2 rounded-xl transition-all ${
            activeTab === 'chatops' ? 'bg-gold-muted text-gold border border-gold/40 shadow-sm' : 'text-muted hover:text-ink'
          }`}
        >
          <Bell className="w-4 h-4 text-gold" />
          <span>ChatOps Setup Wizard</span>
        </button>

        <button
          onClick={() => setActiveTab('appearance')}
          className={`flex items-center space-x-2 px-4 py-2 rounded-xl transition-all ${
            activeTab === 'appearance' ? 'bg-gold-muted text-gold border border-gold/40 shadow-sm' : 'text-muted hover:text-ink'
          }`}
        >
          <Landmark className="w-4 h-4 text-gold" />
          <span>Theme &amp; Appearance</span>
        </button>

        <button
          onClick={() => setActiveTab('thresholds')}
          className={`flex items-center space-x-2 px-4 py-2 rounded-xl transition-all ${
            activeTab === 'thresholds' ? 'bg-gold-muted text-gold border border-gold/40 shadow-sm' : 'text-muted hover:text-ink'
          }`}
        >
          <ShieldAlert className="w-4 h-4 text-terracotta" />
          <span>Guardrails &amp; Thresholds</span>
        </button>
      </div>

      {/* TAB 1: OPHANIM AI INTELLIGENCE */}
      {activeTab === 'llm' && (
        <div className="bg-surface border border-border rounded-3xl p-6 space-y-6 shadow-sm transition-colors duration-200 greek-frame">
          <div className="greek-meander opacity-35 -mx-6 -mt-6 mb-4" />

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-border">
            <div>
              <h3 className="font-bold text-ink text-sm flex items-center space-x-2 font-serif">
                <Sparkles className="w-4 h-4 text-gold" />
                <span>Ophanim AI Autonomous Intelligence</span>
              </h3>
              <p className="text-xs text-muted font-mono mt-0.5">
                Configure LLM providers, query available models, and adjust reasoning temperature
              </p>
            </div>

            <div className="flex items-center space-x-2 text-xs font-mono">
              <span className="bg-emerald/10 border border-emerald/30 text-emerald px-3 py-1 rounded-xl font-bold flex items-center space-x-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald celestial-beacon" />
                <span>ACTIVE &amp; GROUNDED</span>
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* LLM Provider Selection */}
            <div className="space-y-2">
              <label className="text-xs font-mono text-ink block font-medium font-serif">LLM Provider</label>
              <select
                value={provider}
                onChange={(e) => handleProviderChange(e.target.value)}
                className="w-full bg-inset border border-border text-ink text-xs rounded-xl px-3.5 py-2.5 font-mono focus:outline-none focus:border-gold"
              >
                <option value="gemini">Google Gemini (Cloud)</option>
                <option value="claude">Anthropic Claude (Cloud)</option>
                <option value="mistral">Mistral AI (Cloud)</option>
                <option value="openai">OpenAI (Cloud)</option>
                <option value="ollama">Ollama (Self-Hosted Homelab)</option>
                <option value="custom">Custom OpenAI-Compatible (vLLM / LocalAI / LMStudio)</option>
              </select>
            </div>

            {/* Model Name & Live Query Button */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-mono text-ink font-medium font-serif">Model Identifier</label>
                <button
                  type="button"
                  onClick={() => fetchAvailableModels()}
                  disabled={isFetchingModels}
                  className="flex items-center space-x-1 text-[11px] text-gold hover:text-gold-light transition-colors font-mono font-bold"
                  title="Query models from endpoint"
                >
                  <RefreshCw className={`w-3 h-3 ${isFetchingModels ? 'animate-spin' : ''}`} />
                  <span>{isFetchingModels ? 'Querying...' : 'Query Endpoint'}</span>
                </button>
              </div>

              {availableModels.length > 0 ? (
                <div className="relative">
                  <select
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    className="w-full bg-inset border border-gold/50 text-ink text-xs rounded-xl px-3.5 py-2.5 font-mono focus:outline-none focus:border-gold"
                  >
                    {availableModels.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                  <ListFilter className="w-3.5 h-3.5 text-gold absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              ) : (
                <input
                  type="text"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder="gemini-2.5-flash or llama3.2"
                  className="w-full bg-inset border border-border text-ink text-xs rounded-xl px-3.5 py-2.5 font-mono focus:outline-none focus:border-gold"
                />
              )}
              {modelFetchMsg && (
                <p className="text-[10px] text-gold font-mono">{modelFetchMsg}</p>
              )}
            </div>

            {/* Custom Endpoint URL */}
            <div className="space-y-2 md:col-span-2">
              <label className="text-xs font-mono text-ink flex items-center justify-between font-medium font-serif">
                <span>API Endpoint URL</span>
                {!isCustomEndpointAllowed ? (
                  <span className="text-[10px] text-muted flex items-center space-x-1 font-mono">
                    <Lock className="w-3 h-3" />
                    <span>Fixed Cloud Provider (Locked)</span>
                  </span>
                ) : (
                  <span className="text-[10px] text-gold font-bold font-mono">Custom Editable</span>
                )}
              </label>
              <div className="relative">
                <Server className={`w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 ${isCustomEndpointAllowed ? 'text-gold' : 'text-muted opacity-50'}`} />
                <input
                  type="text"
                  value={endpoint}
                  disabled={!isCustomEndpointAllowed}
                  onChange={(e) => setEndpoint(e.target.value)}
                  placeholder={provider === 'ollama' ? 'http://10.20.20.10:11434' : 'http://10.20.20.10:8000/v1'}
                  className={`w-full bg-inset border rounded-xl pl-10 pr-3.5 py-2.5 font-mono text-xs transition-all ${
                    isCustomEndpointAllowed
                      ? 'border-gold text-ink focus:outline-none'
                      : 'border-border text-muted cursor-not-allowed opacity-70'
                  }`}
                />
              </div>
            </div>

            {/* API Secret Key */}
            <div className="space-y-2 md:col-span-2">
              <label className="text-xs font-mono text-ink flex items-center justify-between font-medium font-serif">
                <span>API Secret Key {provider === 'ollama' && '(Optional for local Ollama)'}</span>
                {apiKeyMasked && (
                  <span className="text-[10px] text-emerald font-mono font-bold">Saved: {apiKeyMasked}</span>
                )}
              </label>
              <div className="relative">
                <input
                  type={showApiKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={apiKeyMasked ? 'Enter new key to replace existing...' : 'sk-... or AIzaSy...'}
                  className="w-full bg-inset border border-border text-ink text-xs rounded-xl pl-3.5 pr-10 py-2.5 font-mono focus:outline-none focus:border-gold"
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-ink"
                >
                  {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Temperature Slider */}
            <div className="space-y-2 md:col-span-2">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-ink font-serif font-medium">Temperature &amp; SRE Determinism:</span>
                <span className="text-gold font-bold">{temperature}</span>
              </div>
              <input
                type="range"
                min="0.0"
                max="1.0"
                step="0.05"
                value={temperature}
                onChange={(e) => setTemperature(parseFloat(e.target.value))}
                className="w-full accent-gold bg-inset h-2 rounded-lg cursor-pointer"
              />
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: CHATOPS SETUP WIZARD */}
      {activeTab === 'chatops' && (
        <div className="bg-surface border border-border rounded-3xl p-6 space-y-6 shadow-sm transition-colors duration-200 greek-frame font-mono">
          <div className="greek-meander opacity-35 -mx-6 -mt-6 mb-4" />

          <div>
            <h3 className="font-bold text-ink text-sm flex items-center space-x-2 font-serif">
              <Bell className="w-4 h-4 text-gold" />
              <span>ChatOps Setup Wizard &amp; Alert Conduits</span>
            </h3>
            <p className="text-xs text-muted mt-0.5">
              Transmit incidents and auto-remediation notifications directly into your Discord &amp; Telegram channels
            </p>
          </div>

          {/* Test Status Feedback Banner */}
          {testResult && (
            <div className={`p-4 rounded-2xl border flex items-center space-x-3 text-xs animate-in fade-in duration-150 ${
              testResult.success ? 'bg-emerald/10 border-emerald/30 text-emerald' : 'bg-rose-500/10 border-rose-500/30 text-crimson'
            }`}>
              {testResult.success ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
              <span>[{testResult.channel.toUpperCase()}] {testResult.msg}</span>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 text-xs">
            {/* 1. DISCORD WEBHOOK WIZARD */}
            <div className="bg-surfaceLight/70 border border-border hover:border-gold/40 rounded-3xl p-5 space-y-4 shadow-sm transition-all">
              <div className="flex items-center justify-between pb-2 border-b border-border">
                <div className="flex items-center space-x-2.5">
                  <div className="w-8 h-8 rounded-xl bg-lapis/10 border border-lapis/30 flex items-center justify-center text-lapis">
                    <MessageSquare className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="font-serif font-bold text-ink text-sm">Discord Webhook</h4>
                    <span className="text-[10px] text-muted">Channel Alert Notifications</span>
                  </div>
                </div>

                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-lg ${
                  discordEnabled || discordWebhook ? 'bg-emerald/10 text-emerald border border-emerald/30' : 'bg-inset text-muted'
                }`}>
                  {discordEnabled || discordWebhook ? 'READY' : 'UNCONFIGURED'}
                </span>
              </div>

              <div className="space-y-2">
                <label className="text-[11px] text-ink block font-serif font-bold">Discord Webhook URL</label>
                <input
                  type="text"
                  value={discordWebhook}
                  onChange={(e) => setDiscordWebhook(e.target.value)}
                  placeholder="https://discord.com/api/webhooks/12345/abcdef..."
                  className="w-full bg-inset border border-border text-ink text-xs rounded-xl px-3 py-2 focus:outline-none focus:border-gold font-mono"
                />
              </div>

              <div className="flex items-center justify-between pt-1">
                <button
                  type="button"
                  onClick={() => setShowDiscordGuide(!showDiscordGuide)}
                  className="text-[11px] text-gold hover:text-gold-light flex items-center space-x-1 font-serif font-bold"
                >
                  <HelpCircle className="w-3.5 h-3.5" />
                  <span>Setup Guide</span>
                  {showDiscordGuide ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </button>

                <button
                  type="button"
                  onClick={() => testChatOps('discord')}
                  disabled={testingChannel === 'discord'}
                  className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-lapis text-white text-xs font-bold transition-all hover:bg-lapis/90 shadow-sm disabled:opacity-50"
                >
                  <Send className={`w-3 h-3 ${testingChannel === 'discord' ? 'animate-spin' : ''}`} />
                  <span>{testingChannel === 'discord' ? 'Sending...' : 'Send Test Alert'}</span>
                </button>
              </div>

              {/* Collapsible Discord Wizard Guide */}
              {showDiscordGuide && (
                <div className="bg-inset border border-border p-3.5 rounded-2xl space-y-2 text-[11px] leading-relaxed text-sepia animate-in fade-in">
                  <div className="font-serif font-bold text-ink">3-Step Discord Webhook Setup:</div>
                  <ol className="list-decimal list-inside space-y-1">
                    <li>Open your Discord server and right-click your desired alerts channel → <strong>Edit Channel</strong>.</li>
                    <li>Navigate to <strong>Integrations</strong> → <strong>Webhooks</strong> → <strong>New Webhook</strong>.</li>
                    <li>Copy the Webhook URL, paste it into the field above, and click <strong>Send Test Alert</strong>!</li>
                  </ol>
                </div>
              )}
            </div>

            {/* 2. TELEGRAM BOT WIZARD */}
            <div className="bg-surfaceLight/70 border border-border hover:border-gold/40 rounded-3xl p-5 space-y-4 shadow-sm transition-all">
              <div className="flex items-center justify-between pb-2 border-b border-border">
                <div className="flex items-center space-x-2.5">
                  <div className="w-8 h-8 rounded-xl bg-gold-muted border border-gold/40 flex items-center justify-center text-gold">
                    <Send className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="font-serif font-bold text-ink text-sm">Telegram Bot</h4>
                    <span className="text-[10px] text-muted">Direct Mobile Alerts</span>
                  </div>
                </div>

                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-lg ${
                  telegramEnabled || (telegramToken && telegramChatID) ? 'bg-emerald/10 text-emerald border border-emerald/30' : 'bg-inset text-muted'
                }`}>
                  {telegramEnabled || (telegramToken && telegramChatID) ? 'READY' : 'UNCONFIGURED'}
                </span>
              </div>

              <div className="space-y-2">
                <label className="text-[11px] text-ink block font-serif font-bold">Bot API Token</label>
                <input
                  type="password"
                  value={telegramToken}
                  onChange={(e) => setTelegramToken(e.target.value)}
                  placeholder="123456789:ABCdefGhIJKlmNoPQRstuv..."
                  className="w-full bg-inset border border-border text-ink text-xs rounded-xl px-3 py-2 focus:outline-none focus:border-gold font-mono"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[11px] text-ink block font-serif font-bold">Chat ID</label>
                <input
                  type="text"
                  value={telegramChatID}
                  onChange={(e) => setTelegramChatID(e.target.value)}
                  placeholder="987654321 or -100123456789"
                  className="w-full bg-inset border border-border text-ink text-xs rounded-xl px-3 py-2 focus:outline-none focus:border-gold font-mono"
                />
              </div>

              <div className="flex items-center justify-between pt-1">
                <button
                  type="button"
                  onClick={() => setShowTelegramGuide(!showTelegramGuide)}
                  className="text-[11px] text-gold hover:text-gold-light flex items-center space-x-1 font-serif font-bold"
                >
                  <HelpCircle className="w-3.5 h-3.5" />
                  <span>Setup Guide</span>
                  {showTelegramGuide ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </button>

                <button
                  type="button"
                  onClick={() => testChatOps('telegram')}
                  disabled={testingChannel === 'telegram'}
                  className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-gold text-slate-950 text-xs font-bold transition-all hover:bg-gold-light shadow-sm disabled:opacity-50"
                >
                  <Send className={`w-3 h-3 ${testingChannel === 'telegram' ? 'animate-spin' : ''}`} />
                  <span>{testingChannel === 'telegram' ? 'Sending...' : 'Send Test Alert'}</span>
                </button>
              </div>

              {/* Collapsible Telegram Wizard Guide */}
              {showTelegramGuide && (
                <div className="bg-inset border border-border p-3.5 rounded-2xl space-y-2 text-[11px] leading-relaxed text-sepia animate-in fade-in">
                  <div className="font-serif font-bold text-ink">4-Step Telegram Bot Setup:</div>
                  <ol className="list-decimal list-inside space-y-1">
                    <li>Open Telegram and search for <strong>@BotFather</strong>. Send <code>/newbot</code> and follow prompts to get your Bot Token.</li>
                    <li>Search for <strong>@userinfobot</strong> in Telegram and press start to retrieve your numerical <strong>Id (Chat ID)</strong>.</li>
                    <li>Send <code>/start</code> directly to your new bot to initialize the conversation.</li>
                    <li>Paste both values above and click <strong>Send Test Alert</strong>!</li>
                  </ol>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: THEME & APPEARANCE */}
      {activeTab === 'appearance' && (
        <div className="bg-surface border border-border rounded-3xl p-6 space-y-6 shadow-sm transition-colors duration-200 greek-frame">
          <div className="greek-meander opacity-35 -mx-6 -mt-6 mb-4" />

          <div>
            <h3 className="font-bold text-ink text-sm flex items-center space-x-2 font-serif">
              <Landmark className="w-4 h-4 text-gold" />
              <span>Theme &amp; Architectural Aesthetic</span>
            </h3>
            <p className="text-xs text-muted font-mono mt-0.5">
              Choose between ancient Greek light beige parchment style and obsidian celestial dark mode
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 font-mono text-xs">
            {/* Parchment Greek Card */}
            <div
              onClick={() => setTheme('parchment')}
              className={`p-6 rounded-3xl border cursor-pointer transition-all ${
                theme === 'parchment'
                  ? 'bg-[#fcf9f2] border-gold ring-2 ring-gold/60 shadow-md text-[#1f1610]'
                  : 'bg-surfaceLight border-border text-muted hover:border-gold/50'
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center space-x-2">
                  <Landmark className="w-5 h-5 text-[#b8860b]" />
                  <span className="font-serif font-bold text-base">Parchment Greek (Default)</span>
                </div>
                {theme === 'parchment' && (
                  <span className="text-[10px] font-bold bg-[#b8860b] text-white px-2.5 py-0.5 rounded-full font-mono">ACTIVE</span>
                )}
              </div>
              <p className="text-[11px] leading-relaxed opacity-85 font-serif">
                Light, warm ancient parchment beige background (#f4ece1) with subtle papyrus grain texture, Greek Key meander friezes, and deep iron gall ink typography.
              </p>
            </div>

            {/* Obsidian Dark Card */}
            <div
              onClick={() => setTheme('dark')}
              className={`p-6 rounded-3xl border cursor-pointer transition-all ${
                theme === 'dark'
                  ? 'bg-[#090d15] border-gold ring-2 ring-gold/60 shadow-md text-white'
                  : 'bg-surfaceLight border-border text-muted hover:border-gold/50'
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center space-x-2">
                  <Moon className="w-5 h-5 text-gold" />
                  <span className="font-serif font-bold text-base">Obsidian Celestial (Dark)</span>
                </div>
                {theme === 'dark' && (
                  <span className="text-[10px] font-bold bg-gold text-slate-950 px-2.5 py-0.5 rounded-full font-mono">ACTIVE</span>
                )}
              </div>
              <p className="text-[11px] leading-relaxed opacity-85 font-serif">
                Deep obsidian midnight background with luminous celestial gold accents, seraphic star grid, and high-contrast night-mode readability.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: ALERT THRESHOLDS */}
      {activeTab === 'thresholds' && (
        <div className="bg-surface border border-border rounded-3xl p-6 space-y-6 shadow-sm transition-colors duration-200 greek-frame">
          <div className="greek-meander opacity-35 -mx-6 -mt-6 mb-4" />

          <div>
            <h3 className="font-bold text-ink text-sm flex items-center space-x-2 font-serif">
              <ShieldAlert className="w-4 h-4 text-terracotta" />
              <span>Alert Thresholds &amp; Guardrails</span>
            </h3>
            <p className="text-xs text-muted font-mono mt-0.5">
              Set alert triggers for system resource metrics and container auto-remediation limits
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 font-mono text-xs">
            <div className="space-y-2">
              <label className="text-xs text-ink block font-medium font-serif font-bold">CPU Critical Threshold (%)</label>
              <input
                type="number"
                min="10"
                max="100"
                value={cpuCritical}
                onChange={(e) => setCpuCritical(Number(e.target.value))}
                className="w-full bg-inset border border-border text-ink text-xs rounded-xl px-3.5 py-2.5 focus:outline-none focus:border-gold font-mono"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs text-ink block font-medium font-serif font-bold">Memory Critical Threshold (%)</label>
              <input
                type="number"
                min="10"
                max="100"
                value={memoryCritical}
                onChange={(e) => setMemoryCritical(Number(e.target.value))}
                className="w-full bg-inset border border-border text-ink text-xs rounded-xl px-3.5 py-2.5 focus:outline-none focus:border-gold font-mono"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs text-ink block font-medium font-serif font-bold">Storage Critical Threshold (%)</label>
              <input
                type="number"
                min="10"
                max="100"
                value={diskCritical}
                onChange={(e) => setDiskCritical(Number(e.target.value))}
                className="w-full bg-inset border border-border text-ink text-xs rounded-xl px-3.5 py-2.5 focus:outline-none focus:border-gold font-mono"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs text-ink block font-medium font-serif font-bold">Max Autonomous Heals Per Hour</label>
              <input
                type="number"
                min="1"
                max="10"
                value={autoHealMax}
                onChange={(e) => setAutoHealMax(Number(e.target.value))}
                className="w-full bg-inset border border-border text-ink text-xs rounded-xl px-3.5 py-2.5 focus:outline-none focus:border-gold font-mono"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
