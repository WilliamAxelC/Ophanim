import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  X, 
  Send, 
  Sparkles, 
  User, 
  Eye, 
  Flame, 
  Columns,
  RotateCcw
} from 'lucide-react';
import { MarkdownRenderer } from './MarkdownRenderer';

interface AIChatDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

interface Message {
  sender: 'user' | 'assistant';
  text: string;
  time: string;
}

const DEFAULT_WIDTH = 480;
const MIN_WIDTH = 340;

const INITIAL_WELCOME: Message = {
  sender: 'assistant',
  text: "Hello! I'm **Ophanim AI**. I'm actively monitoring your nodes, containers, and network telemetry.\n\nYou can keep this panel open while browsing your dashboard, topology, and logs.\n\nQuick actions:\n- **Triage Cluster**: Analyze all 28 monitored vessels & active incidents\n- **Top Resource Consumers**: Real-time CPU & RAM rankings\n- **Network Telemetry**: Bandwidth & proxy throughput analysis\n\nWhat would you like to inspect?",
  time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
};

export const AIChatDrawer: React.FC<AIChatDrawerProps> = ({ isOpen, onClose }) => {
  const [messages, setMessages] = useState<Message[]>(() => {
    try {
      const saved = localStorage.getItem('ophanim_ai_chat_history');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch {}
    return [INITIAL_WELCOME];
  });
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  // Persist conversation history in localStorage
  useEffect(() => {
    try {
      localStorage.setItem('ophanim_ai_chat_history', JSON.stringify(messages));
    } catch {}
  }, [messages]);

  const handleClearHistory = () => {
    setMessages([INITIAL_WELCOME]);
    try {
      localStorage.removeItem('ophanim_ai_chat_history');
    } catch {}
  };

  // Resizing state
  const [width, setWidth] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('ophanim_chat_width');
      return saved ? Math.max(MIN_WIDTH, parseInt(saved, 10)) : DEFAULT_WIDTH;
    } catch {
      return DEFAULT_WIDTH;
    }
  });
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem('ophanim_chat_width', width.toString());
    } catch {}
  }, [width]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // Drag-to-resize handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';
  };

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDragging) return;
      const newWidth = window.innerWidth - e.clientX;
      const maxWidth = Math.max(MIN_WIDTH, window.innerWidth - 300);
      if (newWidth >= MIN_WIDTH && newWidth <= maxWidth) {
        setWidth(newWidth);
      }
    },
    [isDragging]
  );

  const handleMouseUp = useCallback(() => {
    if (isDragging) {
      setIsDragging(false);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    }
  }, [isDragging]);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    } else {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, handleMouseMove, handleMouseUp]);

  const handleSend = async (customPrompt?: string) => {
    const textToSend = customPrompt || input;
    if (!textToSend.trim() || loading) return;

    const userMsg: Message = {
      sender: 'user',
      text: textToSend,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    if (!customPrompt) setInput('');
    setLoading(true);

    // Format conversation history for LLM multi-turn context
    const historyPayload = messages.slice(-12).map((m) => ({
      role: m.sender === 'user' ? 'user' : 'assistant',
      content: m.text,
    }));

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          message: textToSend,
          history: historyPayload
        }),
      });

      let replyText = '';
      const contentType = res.headers.get('content-type') || '';

      if (contentType.includes('application/json')) {
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || `HTTP ${res.status}: ${res.statusText}`);
        }
        replyText = data.reply || 'No response from assistant.';
      } else {
        const rawText = await res.text();
        if (!res.ok) {
          throw new Error(rawText.startsWith('<') ? `HTTP ${res.status}: ${res.statusText}` : rawText);
        }
        try {
          const parsed = JSON.parse(rawText);
          replyText = parsed.reply || rawText;
        } catch {
          replyText = rawText;
        }
      }

      setMessages((prev) => [
        ...prev,
        {
          sender: 'assistant',
          text: replyText || 'No response from assistant.',
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } catch (e: any) {
      setMessages((prev) => [
        ...prev,
        {
          sender: 'assistant',
          text: `Error connecting to AI service: ${e.message}`,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Mobile Overlay Drawer (< 1024px) */}
      <div className="lg:hidden fixed inset-0 z-50 flex flex-col bg-surface animate-in slide-in-from-bottom duration-200">
        <div className="p-4 border-b border-border flex items-center justify-between bg-surfaceLight/70 shrink-0">
          <div className="flex items-center space-x-2.5">
            <Sparkles className="w-4 h-4 text-gold" />
            <span className="font-serif font-bold text-ink text-sm">Ophanim AI</span>
          </div>
          <div className="flex items-center space-x-1.5">
            <button
              onClick={handleClearHistory}
              className="p-1.5 rounded-xl bg-inset text-muted hover:text-ink"
              title="Clear Conversation History"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-xl bg-inset text-muted hover:text-ink"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Message Feed Mobile */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
          {/* Quick Action Prompt Pills */}
          <div className="flex flex-wrap gap-1.5 pb-1 font-mono text-[10px]">
            <button
              onClick={() => handleSend("Triage the entire cluster and report any anomalies, degraded containers, or resource constraints.")}
              className="px-2.5 py-1 rounded-xl bg-gold-muted hover:bg-gold/20 text-gold border border-gold/40 transition-all shadow-xs flex items-center space-x-1 font-bold"
            >
              <Eye className="w-3 h-3 text-gold" />
              <span>Triage</span>
            </button>
            <button
              onClick={() => handleSend("Which containers are using the highest CPU and RAM right now?")}
              className="px-2.5 py-1 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-terracotta border border-amber-500/30 transition-all shadow-xs flex items-center space-x-1 font-bold"
            >
              <Flame className="w-3 h-3 text-terracotta" />
              <span>Top Consumers</span>
            </button>
            <button
              onClick={() => handleSend("Summarize the current network bus throughput and identify any heavy network traffic.")}
              className="px-2.5 py-1 rounded-xl bg-lapis/10 hover:bg-lapis/20 text-lapis border border-lapis/30 transition-all shadow-xs flex items-center space-x-1 font-bold"
            >
              <Columns className="w-3 h-3 text-lapis" />
              <span>Network</span>
            </button>
          </div>

          {messages.map((m, idx) => (
            <div key={idx} className={`flex items-start space-x-2.5 ${m.sender === 'user' ? 'flex-row-reverse space-x-reverse' : ''}`}>
              <div className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 text-xs ${m.sender === 'user' ? 'bg-surfaceLight border border-border text-sepia' : 'bg-gold-muted border border-gold/40 text-gold'}`}>
                {m.sender === 'user' ? <User className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </div>
              <div className={`w-full max-w-[90%] rounded-2xl p-3 text-xs ${m.sender === 'user' ? 'bg-surfaceLight border border-border text-ink' : 'bg-inset border border-gold/30 text-ink'}`}>
                {m.sender === 'user' ? <div className="whitespace-pre-wrap">{m.text}</div> : <MarkdownRenderer content={m.text} />}
                <div className="text-[9px] text-muted text-right pt-1">{m.time}</div>
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex items-center space-x-2 text-xs text-gold font-mono animate-pulse">
              <Sparkles className="w-4 h-4 animate-spin" />
              <span>Ophanim AI analyzing...</span>
            </div>
          )}
          <div ref={endRef} />
        </div>

        {/* Mobile Input */}
        <div className="p-3 border-t border-border bg-surface shrink-0">
          <form onSubmit={(e) => { e.preventDefault(); handleSend(); }} className="flex items-center space-x-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask Ophanim AI..."
              className="flex-1 bg-inset border border-border rounded-2xl px-3.5 py-2.5 text-xs font-mono text-ink focus:outline-none focus:border-gold"
            />
            <button type="submit" disabled={!input.trim() || loading} className="p-2.5 bg-gold text-slate-950 rounded-2xl disabled:opacity-40">
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>

      {/* Desktop Docked Sidebar (>= 1024px): Strictly bound to h-full inside shell */}
      <aside
        style={{ width: `${width}px` }}
        className="hidden lg:flex flex-col h-full max-h-full bg-surface border-l border-border shadow-xl z-20 shrink-0 select-text relative greek-frame overflow-hidden"
      >
        {/* Left Border Drag Handle (Continuous Horizontal Resize) */}
        <div
          onMouseDown={handleMouseDown}
          className="absolute left-0 inset-y-0 w-3.5 cursor-col-resize hover:bg-gold/40 active:bg-gold transition-colors z-30 flex items-center justify-center group select-none"
          title="Drag left/right to resize AI sidebar"
        >
          <div className="w-1 h-8 rounded-full bg-border group-hover:bg-gold transition-colors" />
        </div>

        <div className="greek-meander opacity-35 shrink-0" />

        {/* Header */}
        <div className="p-4 border-b border-border flex items-center justify-between bg-surfaceLight/60 shrink-0 select-none">
          <div className="flex items-center space-x-3 min-w-0">
            <div className="w-9 h-9 rounded-2xl bg-gold-muted border border-gold/40 flex items-center justify-center text-gold shadow-sm shrink-0">
              <Sparkles className="w-4 h-4" />
            </div>
            <div className="truncate">
              <h3 className="font-bold text-ink text-sm tracking-wide font-serif truncate">Ophanim AI</h3>
              <p className="text-[10px] font-mono text-muted">Co-Pilot &amp; Autonomous SRE</p>
            </div>
          </div>

          <div className="flex items-center space-x-1.5 shrink-0">
            <button
              onClick={handleClearHistory}
              className="p-1.5 text-muted hover:text-ink rounded-lg bg-inset hover:bg-border transition-all text-[10px] font-mono font-bold flex items-center space-x-1"
              title="Clear Conversation History"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Clear</span>
            </button>

            <button
              onClick={() => setWidth(Math.min(window.innerWidth - 300, width + 120))}
              className="p-1.5 text-muted hover:text-ink rounded-lg bg-inset hover:bg-border transition-all text-[10px] font-mono font-bold"
              title="Expand width"
            >
              +Wide
            </button>

            <button
              onClick={() => setWidth(Math.max(MIN_WIDTH, width - 120))}
              className="p-1.5 text-muted hover:text-ink rounded-lg bg-inset hover:bg-border transition-all text-[10px] font-mono font-bold"
              title="Narrow width"
            >
              -Narrow
            </button>

            <button
              onClick={onClose}
              className="p-1.5 text-muted hover:text-ink rounded-xl bg-inset hover:bg-border transition-all"
              title="Close Sidebar"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Messages Feed: Independently Scrollable Container */}
        <div className="flex-1 min-h-0 p-4 overflow-y-auto space-y-4">
          {/* Quick Action Prompt Pills */}
          <div className="flex flex-wrap gap-2 pb-1 font-mono text-[11px]">
            <button
              onClick={() => handleSend("Triage the entire cluster and report any anomalies, degraded containers, or resource constraints.")}
              className="px-2.5 py-1 rounded-xl bg-gold-muted hover:bg-gold/20 text-gold border border-gold/40 transition-all shadow-sm flex items-center space-x-1 font-bold"
            >
              <Eye className="w-3 h-3 text-gold" />
              <span>Triage</span>
            </button>
            <button
              onClick={() => handleSend("Which containers are using the highest CPU and RAM right now?")}
              className="px-2.5 py-1 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-terracotta border border-amber-500/30 transition-all shadow-sm flex items-center space-x-1 font-bold"
            >
              <Flame className="w-3 h-3 text-terracotta" />
              <span>Top Consumers</span>
            </button>
            <button
              onClick={() => handleSend("Summarize the current network bus throughput and identify any heavy network traffic.")}
              className="px-2.5 py-1 rounded-xl bg-lapis/10 hover:bg-lapis/20 text-lapis border border-lapis/30 transition-all shadow-sm flex items-center space-x-1 font-bold"
            >
              <Columns className="w-3 h-3 text-lapis" />
              <span>Network</span>
            </button>
          </div>

          {messages.map((m, idx) => {
            const isUser = m.sender === 'user';
            return (
              <div
                key={idx}
                className={`flex items-start space-x-2.5 ${isUser ? 'flex-row-reverse space-x-reverse' : ''}`}
              >
                <div
                  className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 text-xs ${
                    isUser
                      ? 'bg-surfaceLight border border-border text-sepia'
                      : 'bg-gold-muted border border-gold/40 text-gold'
                  }`}
                >
                  {isUser ? <User className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </div>

                <div
                  className={`w-full max-w-[94%] rounded-2xl p-3.5 text-xs leading-relaxed shadow-sm ${
                    isUser
                      ? 'bg-surfaceLight border border-border text-ink font-mono font-medium'
                      : 'bg-inset/85 border border-gold/30 text-ink space-y-2'
                  }`}
                >
                  {isUser ? (
                    <div className="whitespace-pre-wrap">{m.text}</div>
                  ) : (
                    <div className="w-full overflow-x-auto">
                      <MarkdownRenderer content={m.text} />
                    </div>
                  )}
                  <div className="text-[9px] text-muted text-right select-none pt-1">{m.time}</div>
                </div>
              </div>
            );
          })}

          {loading && (
            <div className="flex items-center space-x-3">
              <div className="w-7 h-7 rounded-xl bg-gold-muted border border-gold/40 flex items-center justify-center text-gold">
                <Sparkles className="w-3.5 h-3.5 animate-spin text-gold" />
              </div>
              <div className="bg-surface border border-gold/30 rounded-2xl p-2.5 text-xs font-mono text-gold animate-pulse font-medium">
                Ophanim AI analyzing...
              </div>
            </div>
          )}

          <div ref={endRef} />
        </div>

        {/* Pinned Bottom Input Form */}
        <div className="p-3 border-t border-border bg-surface shrink-0 z-10">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="flex items-center space-x-2"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask Ophanim AI..."
              className="flex-1 bg-inset border border-border focus:border-gold rounded-2xl px-3.5 py-2.5 text-xs font-mono text-ink placeholder-muted focus:outline-none transition-colors"
            />
            <button
              type="submit"
              disabled={!input.trim() || loading}
              className="p-2.5 bg-gradient-to-r from-gold to-amber-600 hover:from-gold-light hover:to-gold text-slate-950 rounded-2xl transition-all disabled:opacity-40 shadow-md shadow-gold/20"
              title="Send Message"
            >
              <Send className="w-3.5 h-3.5 text-slate-950" />
            </button>
          </form>
        </div>
      </aside>
    </>
  );
};
