import React, { useState, useEffect, useRef } from 'react';
import { Activity, Cpu, HardDrive, Network, Clock, RefreshCw, Box, Server } from 'lucide-react';
import { MetricPoint, ContainerStatus, DeviceNode } from '../types';

interface TelemetryChartProps {
  containers?: ContainerStatus[];
  devices?: DeviceNode[];
  initialTarget?: string; // 'host' or device.id or container.name
}

export const TelemetryChart: React.FC<TelemetryChartProps> = ({ 
  containers = [],
  devices = [],
  initialTarget = 'host' 
}) => {
  const [target, setTarget] = useState<string>(initialTarget);
  const [history, setHistory] = useState<MetricPoint[]>([]);
  const [range, setRange] = useState<'15m' | '1h' | '6h' | '24h'>('1h');
  const [metricTab, setMetricTab] = useState<'cpu' | 'memory' | 'network' | 'disk'>('cpu');
  const [loading, setLoading] = useState(false);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  // Dynamic responsive dimensions tracking surrounding container
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [dimensions, setDimensions] = useState<{ width: number; height: number }>({ 
    width: 600, 
    height: 250 
  });

  useEffect(() => {
    if (!containerRef.current) return;
    const updateSize = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const w = Math.max(Math.floor(rect.width), 260);
        // Flexible height: 240px on mobile (< 640px), 280px on tablet/desktop
        const h = window.innerWidth < 640 ? 240 : 280;
        setDimensions({ width: w, height: h });
      }
    };
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(containerRef.current);
    window.addEventListener('resize', updateSize);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateSize);
    };
  }, []);

  const fetchHistory = async () => {
    try {
      setLoading(true);
      const selectedDevice = devices.find(d => d.id === target || `host:${d.id}` === target);
      const isHost = target === 'host' || !!selectedDevice || target.startsWith('host:');
      const nodeId = selectedDevice ? selectedDevice.id : (target.startsWith('host:') ? target.replace('host:', '') : 'local');

      const url = isHost
        ? `/api/metrics/history?node_id=${encodeURIComponent(nodeId)}&range=${range}`
        : `/api/metrics/history?target=container&container_id=${encodeURIComponent(target)}&range=${range}`;
      
      const res = await fetch(url);
      const data = await res.json();
      if (Array.isArray(data)) {
        setHistory(data);
      }
    } catch (e) {
      console.error('Failed to fetch metric history:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
    const interval = setInterval(fetchHistory, 15000);
    return () => clearInterval(interval);
  }, [target, range]);

  const selectedDevice = devices.find(d => d.id === target || `host:${d.id}` === target || (target === 'host' && (d.id === 'local-lxc' || d.id === 'local')));
  const isHost = target === 'host' || !!selectedDevice || target.startsWith('host:');
  const isContainer = !isHost;
  const selectedContainer = isContainer ? containers.find(c => c.id === target || c.name === target) : undefined;

  // Determine values and units to plot
  const values: number[] = history.map((pt) => {
    if (metricTab === 'cpu') return pt.cpu_percent || 0;
    if (metricTab === 'memory') {
      return isContainer ? (pt.memory_usage_mb || pt.mem_percent || 0) : (pt.mem_percent || 0);
    }
    if (metricTab === 'network') return (pt.net_rx_kbps || 0) + (pt.net_tx_kbps || 0);
    if (metricTab === 'disk') return (pt.disk_read_kbps || 0) + (pt.disk_write_kbps || 0);
    return 0;
  });

  // Calculate dynamic min/max for Y axis
  let maxY = Math.max(...values, 0);
  if (metricTab === 'cpu') {
    maxY = Math.max(100, Math.ceil(maxY * 1.15));
  } else if (metricTab === 'memory') {
    maxY = isContainer ? Math.max(128, Math.ceil(maxY * 1.2)) : 100;
  } else {
    maxY = Math.max(10, Math.ceil(maxY * 1.25));
  }
  const minY = 0;

  // Chart Dynamic Dimensions based on real-time container size
  const { width, height } = dimensions;
  const isMobile = width < 520;
  const paddingLeft = isMobile ? 58 : 68;
  const paddingRight = 16;
  const paddingTop = 16;
  const paddingBottom = 30;

  const plotWidth = Math.max(width - paddingLeft - paddingRight, 10);
  const plotHeight = Math.max(height - paddingTop - paddingBottom, 10);

  // Dynamic Time Window based on the selected range (15m, 1h, 6h, 24h)
  const rangeDurationMs = {
    '15m': 15 * 60 * 1000,
    '1h': 60 * 60 * 1000,
    '6h': 6 * 60 * 60 * 1000,
    '24h': 24 * 60 * 60 * 1000,
  }[range];

  const now = Date.now();
  const windowEnd = now;
  const windowStart = now - rangeDurationMs;

  const points = values.map((val, idx) => {
    const pt = history[idx];
    const ptTime = pt?.timestamp ? new Date(pt.timestamp).getTime() : (windowStart + (idx / Math.max(values.length - 1, 1)) * (windowEnd - windowStart));
    const timeRatio = Math.max(0, Math.min(1, (ptTime - windowStart) / (windowEnd - windowStart)));
    const x = paddingLeft + timeRatio * plotWidth;
    const y = paddingTop + plotHeight - ((val - minY) / Math.max(maxY - minY, 1)) * plotHeight;
    return { x, y, val, point: pt, time: ptTime };
  });

  // Sort points by x coordinate for clean SVG stroke path
  points.sort((a, b) => a.x - b.x);

  let renderedPoints = [...points];
  if (renderedPoints.length === 1) {
    renderedPoints = [
      { ...renderedPoints[0], x: paddingLeft },
      { ...renderedPoints[0], x: paddingLeft + plotWidth }
    ];
  }

  const svgPath = renderedPoints.length > 0 
    ? `M ${renderedPoints[0].x} ${renderedPoints[0].y} ` + renderedPoints.slice(1).map(p => `L ${p.x} ${p.y}`).join(' ')
    : '';

  const areaPath = renderedPoints.length > 0
    ? `${svgPath} L ${renderedPoints[renderedPoints.length - 1].x} ${paddingTop + plotHeight} L ${renderedPoints[0].x} ${paddingTop + plotHeight} Z`
    : '';

  // Generate 4 Y-Axis tick values
  const yTicks = [
    { val: maxY, y: paddingTop },
    { val: (maxY * 0.75), y: paddingTop + plotHeight * 0.25 },
    { val: (maxY * 0.5), y: paddingTop + plotHeight * 0.5 },
    { val: (maxY * 0.25), y: paddingTop + plotHeight * 0.75 },
    { val: 0, y: paddingTop + plotHeight }
  ];

  // Format Y-axis label
  const formatYLabel = (v: number) => {
    if (metricTab === 'cpu') return `${v.toFixed(0)}%`;
    if (metricTab === 'memory') return isContainer ? `${v.toFixed(0)} MB` : `${v.toFixed(0)}%`;
    if (v >= 1024) return `${(v / 1024).toFixed(1)} MB/s`;
    return `${v.toFixed(0)} KB/s`;
  };

  // Generate responsive X-Axis timestamp ticks evenly distributed across the requested duration window
  const xTicks: { label: string; x: number }[] = [];
  const tickCount = isMobile ? 3 : 5;
  for (let i = 0; i < tickCount; i++) {
    const tickRatio = i / Math.max(tickCount - 1, 1);
    const tickTime = new Date(windowStart + tickRatio * (windowEnd - windowStart));
    const timeStr = tickTime.toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: true 
    });
    xTicks.push({ label: timeStr, x: paddingLeft + tickRatio * plotWidth });
  }

  const getMetricColor = () => {
    if (metricTab === 'cpu') return { stroke: '#d4af37', fill: 'url(#chartGoldGrad)', text: 'text-gold' };
    if (metricTab === 'memory') return { stroke: '#c85a17', fill: 'url(#chartTerraGrad)', text: 'text-terracotta' };
    if (metricTab === 'network') return { stroke: '#2e6b9e', fill: 'url(#chartLapisGrad)', text: 'text-lapis' };
    return { stroke: '#2e7d32', fill: 'url(#chartEmeraldGrad)', text: 'text-emerald' };
  };

  const color = getMetricColor();
  const currentVal = values[values.length - 1] || 0;
  const activePt = hoverIndex !== null && points[hoverIndex] ? points[hoverIndex] : points[points.length - 1];

  // Calculate min, max, avg for telemetry stats summary
  const minVal = values.length > 0 ? Math.min(...values) : 0;
  const peakVal = values.length > 0 ? Math.max(...values) : 0;
  const avgVal = values.length > 0 ? (values.reduce((a, b) => a + b, 0) / values.length) : 0;

  // Handle touch / pointer scrub on desktop & mobile with true SVG coordinate transformation
  const handlePointerMove = (clientX: number) => {
    if (!svgRef.current || points.length === 0) return;
    const svgRect = svgRef.current.getBoundingClientRect();
    if (svgRect.width === 0) return;

    // Transform screen clientX directly into SVG viewBox coordinates (eliminating padding & scaling offsets)
    const scaleX = width / svgRect.width;
    const svgX = (clientX - svgRect.left) * scaleX;

    // Find point closest to svgX
    let closestIdx = 0;
    let minDist = Infinity;
    for (let i = 0; i < points.length; i++) {
      const dist = Math.abs(points[i].x - svgX);
      if (dist < minDist) {
        minDist = dist;
        closestIdx = i;
      }
    }
    setHoverIndex(closestIdx);
  };

  return (
    <div className="space-y-4 font-mono w-full min-w-0">
      {/* Top Controls: Responsive Stacking (Target -> Metrics -> Time Range) */}
      <div className="flex flex-col gap-3 text-xs">
        {/* Row 1: Target Selector */}
        <div className="flex items-center space-x-2 w-full">
          <div className="relative flex-1 min-w-0">
            <select
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              className="w-full bg-surface border border-gold/40 text-ink rounded-xl pl-8 pr-4 py-2 font-mono text-xs focus:outline-none focus:border-gold font-bold shadow-xs cursor-pointer truncate"
            >
              <optgroup label="Enrolled Host Nodes & Hypervisors">
                {devices.length > 0 ? (
                  devices.map((d) => (
                    <option key={d.id} value={d.id === 'local-lxc' ? 'host' : `host:${d.id}`}>
                      🏛️ {d.name} ({d.agent_type.toUpperCase()})
                    </option>
                  ))
                ) : (
                  <option value="host">🏛️ Primary Host System</option>
                )}
              </optgroup>
              <optgroup label="Monitored Containers & Guest VMs">
                {containers.map((c) => {
                  const isVM = c.image.includes('qemu') || c.image.includes('vm');
                  const isLXC = c.image.includes('lxc');
                  const icon = isVM ? '🖥️' : isLXC ? '📦' : '📦';
                  return (
                    <option key={c.id + c.name} value={c.name}>
                      {icon} {c.name} ({c.stack || 'standalone'}) {c.state !== 'running' ? `[${c.state.toUpperCase()}]` : ''}
                    </option>
                  );
                })}
              </optgroup>
            </select>
            <div className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-gold">
              {isContainer ? <Box className="w-3.5 h-3.5" /> : <Server className="w-3.5 h-3.5" />}
            </div>
          </div>

          {selectedContainer && (
            <span className={`px-2.5 py-1.5 rounded-xl text-[10px] font-bold shrink-0 ${
              selectedContainer.state === 'running' ? 'bg-emerald/10 text-emerald border border-emerald/30' : 'bg-inset text-muted border border-border'
            }`}>
              {selectedContainer.state.toUpperCase()}
            </span>
          )}
        </div>

        {/* Row 2: Metric Switcher Tabs (2x2 on mobile, 4-col on desktop) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 bg-inset border border-border rounded-xl p-1 w-full">
          <button
            onClick={() => setMetricTab('cpu')}
            className={`flex items-center justify-center space-x-1.5 py-2 px-2 rounded-lg transition-all text-xs ${
              metricTab === 'cpu' ? 'bg-gold text-slate-950 font-bold shadow-xs' : 'text-muted hover:text-ink hover:bg-surfaceLight/60'
            }`}
          >
            <Cpu className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">CPU Load</span>
          </button>
          <button
            onClick={() => setMetricTab('memory')}
            className={`flex items-center justify-center space-x-1.5 py-2 px-2 rounded-lg transition-all text-xs ${
              metricTab === 'memory' ? 'bg-amber-600 text-white font-bold shadow-xs' : 'text-muted hover:text-ink hover:bg-surfaceLight/60'
            }`}
          >
            <Activity className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">RAM</span>
          </button>
          <button
            onClick={() => setMetricTab('network')}
            className={`flex items-center justify-center space-x-1.5 py-2 px-2 rounded-lg transition-all text-xs ${
              metricTab === 'network' ? 'bg-lapis text-white font-bold shadow-xs' : 'text-muted hover:text-ink hover:bg-surfaceLight/60'
            }`}
          >
            <Network className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">Network Bus</span>
          </button>
          {!isContainer ? (
            <button
              onClick={() => setMetricTab('disk')}
              className={`flex items-center justify-center space-x-1.5 py-2 px-2 rounded-lg transition-all text-xs ${
                metricTab === 'disk' ? 'bg-emerald text-white font-bold shadow-xs' : 'text-muted hover:text-ink hover:bg-surfaceLight/60'
              }`}
            >
              <HardDrive className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">Disk I/O</span>
            </button>
          ) : (
            <div className="flex items-center justify-center py-2 px-2 rounded-lg text-muted/50 text-[11px]">
              <span>Container Disk</span>
            </div>
          )}
        </div>

        {/* Row 3: Time Window Selector + Live Refresh */}
        <div className="flex items-center justify-between gap-2 w-full">
          <div className="flex items-center bg-inset border border-border rounded-xl p-1 text-[11px] flex-1 justify-between sm:justify-start gap-1">
            {(['15m', '1h', '6h', '24h'] as const).map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`flex-1 sm:flex-initial px-3 py-1.5 rounded-lg transition-all font-bold text-center ${
                  range === r ? 'bg-gold text-slate-950 shadow-xs' : 'text-muted hover:text-ink'
                }`}
              >
                {r}
              </button>
            ))}
          </div>

          <button
            onClick={fetchHistory}
            className="p-2 text-muted hover:text-gold bg-surface border border-border rounded-xl transition-colors shadow-xs shrink-0"
            title="Refresh History"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-gold' : ''}`} />
          </button>
        </div>
      </div>

      {/* Header Metric Stats Strip */}
      <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-1.5 font-mono text-xs px-1 pt-1">
        <div className="flex items-center space-x-2">
          <span className="text-muted font-serif font-bold truncate">
            {selectedDevice?.name || (target === 'host' ? 'Primary Host' : target.replace('host:', ''))} • {metricTab === 'memory' ? 'RAM' : metricTab.toUpperCase()}:
          </span>
          <span className={`font-bold text-sm sm:text-base ${color.text}`}>
            {activePt ? formatYLabel(activePt.val) : formatYLabel(currentVal)}
          </span>
        </div>

        <div className="flex items-center justify-between sm:justify-end gap-3 text-[10px] text-muted">
          <span>Min: <strong className="text-ink">{formatYLabel(minVal)}</strong></span>
          <span>Peak: <strong className="text-ink">{formatYLabel(peakVal)}</strong></span>
          <span>Avg: <strong className="text-ink">{formatYLabel(avgVal)}</strong></span>
          <div className="hidden sm:flex items-center space-x-1">
            <Clock className="w-3 h-3 text-gold" />
            <span>{activePt?.point ? new Date(activePt.point.timestamp).toLocaleTimeString() : 'Live'}</span>
          </div>
        </div>
      </div>

      {/* Dynamic SVG Time-Series Chart Box matching surrounding div width & height */}
      <div 
        ref={containerRef}
        className="w-full h-[240px] sm:h-[280px] bg-inset/80 border border-border rounded-2xl p-2 relative overflow-hidden shadow-inner flex items-center justify-center select-none touch-none"
        onTouchMove={(e) => {
          if (e.touches[0]) handlePointerMove(e.touches[0].clientX);
        }}
        onTouchEnd={() => setHoverIndex(null)}
        onMouseMove={(e) => handlePointerMove(e.clientX)}
        onMouseLeave={() => setHoverIndex(null)}
      >
        <svg 
          ref={svgRef}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`} 
          className="w-full h-full overflow-visible"
        >
          <defs>
            <linearGradient id="chartGoldGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#d4af37" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#d4af37" stopOpacity="0.0" />
            </linearGradient>
            <linearGradient id="chartTerraGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#c85a17" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#c85a17" stopOpacity="0.0" />
            </linearGradient>
            <linearGradient id="chartLapisGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#2e6b9e" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#2e6b9e" stopOpacity="0.0" />
            </linearGradient>
            <linearGradient id="chartEmeraldGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#2e7d32" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#2e7d32" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Y-Axis Gridlines & Numeric Tick Labels in True CSS Pixel Coordinates */}
          {yTicks.map((tick, i) => (
            <g key={i}>
              <line 
                x1={paddingLeft} 
                y1={tick.y} 
                x2={width - paddingRight} 
                y2={tick.y} 
                stroke="currentColor" 
                strokeOpacity={i === yTicks.length - 1 ? 0.25 : 0.08} 
                strokeDasharray={i === yTicks.length - 1 ? "0" : "3 3"} 
              />
              <text
                x={paddingLeft - 6}
                y={tick.y + 4}
                textAnchor="end"
                fontSize={isMobile ? "10" : "11"}
                fontWeight="600"
                className="fill-sepia font-mono"
              >
                {formatYLabel(tick.val)}
              </text>
            </g>
          ))}

          {/* Area Fill */}
          {areaPath && <path d={areaPath} fill={color.fill} />}

          {/* Line Stroke */}
          {svgPath && (
            <path 
              d={svgPath} 
              fill="none" 
              stroke={color.stroke} 
              strokeWidth="2.5" 
              strokeLinecap="round" 
              strokeLinejoin="round" 
            />
          )}

          {/* X-Axis Timestamps */}
          {xTicks.map((tick, i) => (
            <g key={i}>
              <line 
                x1={tick.x} 
                y1={paddingTop + plotHeight} 
                x2={tick.x} 
                y2={paddingTop + plotHeight + 5} 
                stroke="currentColor" 
                strokeOpacity={0.4} 
              />
              <text
                x={tick.x}
                y={paddingTop + plotHeight + 18}
                textAnchor="middle"
                fontSize={isMobile ? "10" : "11"}
                fontWeight="600"
                className="fill-sepia font-mono"
              >
                {tick.label}
              </text>
            </g>
          ))}

          {/* Interactive Hover Point Overlay & Tooltip */}
          {points.map((pt, i) => (
            <circle
              key={i}
              cx={pt.x}
              cy={pt.y}
              r={hoverIndex === i ? 5.5 : 2}
              fill={hoverIndex === i ? '#ffffff' : color.stroke}
              stroke={color.stroke}
              strokeWidth={hoverIndex === i ? 2.5 : 0}
              className="cursor-pointer transition-all"
            />
          ))}

          {/* Hover Crosshair vertical bar & Rich Floating Tooltip Badge */}
          {hoverIndex !== null && points[hoverIndex] && (
            <g className="pointer-events-none transition-all duration-75">
              <line
                x1={points[hoverIndex].x}
                y1={paddingTop}
                x2={points[hoverIndex].x}
                y2={paddingTop + plotHeight}
                stroke={color.stroke}
                strokeWidth="1.5"
                strokeDasharray="3 3"
                opacity={0.8}
              />
              <circle
                cx={points[hoverIndex].x}
                cy={points[hoverIndex].y}
                r="6.5"
                fill="none"
                stroke={color.stroke}
                strokeWidth="2"
                opacity="0.9"
              />
              <circle
                cx={points[hoverIndex].x}
                cy={points[hoverIndex].y}
                r="3"
                fill="#ffffff"
                stroke={color.stroke}
                strokeWidth="1.5"
              />

              {/* Floating Tooltip Box right above the hovered point */}
              {(() => {
                const pt = points[hoverIndex];
                const timeStr = pt.point ? new Date(pt.point.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '';
                const valStr = formatYLabel(pt.val);
                const isNearRight = pt.x > width - 120;
                const ttX = isNearRight ? pt.x - 105 : pt.x + 10;
                const ttY = Math.max(paddingTop + 4, Math.min(pt.y - 20, paddingTop + plotHeight - 38));

                return (
                  <g transform={`translate(${ttX}, ${ttY})`}>
                    <rect
                      x="0"
                      y="0"
                      width="96"
                      height="34"
                      rx="6"
                      className="fill-surface stroke-gold/50"
                      strokeWidth="1"
                      fillOpacity="0.95"
                    />
                    <text
                      x="8"
                      y="13"
                      fontSize="9"
                      fontWeight="600"
                      className="fill-muted font-mono"
                    >
                      {timeStr}
                    </text>
                    <text
                      x="8"
                      y="27"
                      fontSize="11"
                      fontWeight="700"
                      className="fill-ink font-mono"
                    >
                      {valStr}
                    </text>
                  </g>
                );
              })()}
            </g>
          )}
        </svg>
      </div>
    </div>
  );
};
