import React, { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { Dashboard } from './pages/Dashboard';
import { TopologyView } from './pages/TopologyView';
import { IncidentsView } from './pages/IncidentsView';
import { DevicesView } from './pages/DevicesView';
import { LogsView } from './pages/LogsView';
import { SettingsView } from './pages/SettingsView';
import { CommandPalette } from './components/CommandPalette';
import { AddDeviceModal } from './components/AddDeviceModal';
import { AIChatDrawer } from './components/AIChatDrawer';
import { ThemeProvider } from './context/ThemeContext';
import { 
  HostMetrics, 
  ContainerStatus, 
  Incident, 
  DeviceNode, 
  TopologyNode, 
  TopologyEdge 
} from './types';

const MainLayout: React.FC = () => {
  const [currentTab, setCurrentTab] = useState('dashboard');
  const [metrics, setMetrics] = useState<HostMetrics | null>(null);
  const [nodeMetrics, setNodeMetrics] = useState<Record<string, HostMetrics>>({});
  const [containers, setContainers] = useState<ContainerStatus[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [devices, setDevices] = useState<DeviceNode[]>([]);
  const [topologyNodes, setTopologyNodes] = useState<TopologyNode[]>([]);
  const [topologyEdges, setTopologyEdges] = useState<TopologyEdge[]>([]);

  // Modals & Panels state
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isAddDeviceOpen, setIsAddDeviceOpen] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [logTarget, setLogTarget] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Collapsible Left Sidebar state (persisted)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('ophanim_sidebar_collapsed') === 'true';
    } catch {
      return false;
    }
  });

  const toggleSidebarCollapse = () => {
    setIsSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('ophanim_sidebar_collapsed', next.toString());
      } catch {}
      return next;
    });
  };

  const fetchHostMetrics = async () => {
    try {
      const res = await fetch('/api/metrics?all=true');
      if (res.ok) {
        const data = await res.json();
        if (data && typeof data === 'object') {
          setNodeMetrics(data);
          const local = data['local-lxc'] || data['local'] || Object.values(data)[0];
          if (local && (local as HostMetrics).cpu_usage_percent !== undefined) {
            setMetrics(local as HostMetrics);
          }
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchAllData = async () => {
    try {
      setIsRefreshing(true);
      const [contRes, incRes, devRes, topoRes] = await Promise.all([
        fetch('/api/containers'),
        fetch('/api/incidents'),
        fetch('/api/devices'),
        fetch('/api/topology'),
      ]);

      if (contRes.ok) {
        const contData = await contRes.json();
        setContainers(Array.isArray(contData) ? contData : []);
      }
      if (incRes.ok) {
        const incData = await incRes.json();
        setIncidents(Array.isArray(incData) ? incData : []);
      }
      if (devRes.ok) {
        const devData = await devRes.json();
        setDevices(Array.isArray(devData) ? devData : []);
      }
      if (topoRes.ok) {
        const topoData = await topoRes.json();
        setTopologyNodes(Array.isArray(topoData?.nodes) ? topoData.nodes : []);
        setTopologyEdges(Array.isArray(topoData?.edges) ? topoData.edges : []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchHostMetrics();
    fetchAllData();

    // 1-second host metrics polling
    const metricInterval = setInterval(fetchHostMetrics, 1000);
    // 2-second background refresh fallback
    const metaInterval = setInterval(fetchAllData, 2000);

    // WebSocket real-time event listener for instant 1Hz metric pushes and incident notifications
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/events`;
    let ws: WebSocket | null = null;
    try {
      ws = new WebSocket(wsUrl);
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === 'metrics_updated' && msg.data) {
            const m = msg.data as HostMetrics;
            const nid = m.node_id || 'local-lxc';
            setNodeMetrics((prev) => ({ ...prev, [nid]: m }));
            if (nid === 'local-lxc' || nid === 'local') {
              setMetrics(m);
            }
          } else if (msg.type === 'containers_updated' && Array.isArray(msg.data)) {
            setContainers(msg.data);
          } else if (msg.type === 'incident_created' || msg.type === 'incident_resolved') {
            fetchAllData();
          }
        } catch {}
      };
    } catch {}

    // Global Keyboard Shortcuts (Cmd+K / Ctrl+K for Command Palette, Cmd+/ / Ctrl+/ for AI Sidebar)
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => !prev);
      } else if ((e.metaKey || e.ctrlKey) && e.key === '/') {
        e.preventDefault();
        setIsChatOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      clearInterval(metricInterval);
      clearInterval(metaInterval);
      window.removeEventListener('keydown', handleKeyDown);
      if (ws) ws.close();
    };
  }, []);

  const handleApproveFix = async (incidentID: string) => {
    await fetch('/api/incidents/approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ incident_id: incidentID }),
    });
    await fetchAllData();
  };

  const handleResolveIncident = async (incidentID: string) => {
    await fetch('/api/incidents/resolve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ incident_id: incidentID, notes: 'Manually marked resolved by user' }),
    });
    await fetchAllData();
  };

  const handleOpenLogs = (source: string) => {
    setLogTarget(source);
    setCurrentTab('logs');
  };

  const handleDeleteDevice = async (id: string) => {
    await fetch(`/api/devices?id=${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    await fetchAllData();
  };

  const handleUpdateDevice = async (id: string, name: string, ip: string, token?: string) => {
    await fetch('/api/devices', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, name, ip_address: ip, enroll_token: token }),
    });
    await fetchAllData();
  };

  return (
    <div className="h-screen max-h-screen w-screen overflow-hidden flex flex-col md:flex-row bg-canvas text-ink parchment-texture transition-colors duration-200">
      {/* Left Sidebar Navigation */}
      <Sidebar
        currentTab={currentTab}
        setCurrentTab={setCurrentTab}
        activeIncidentsCount={incidents.length}
        openChat={() => setIsChatOpen((prev) => !prev)}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={toggleSidebarCollapse}
      />

      {/* Main Content Area (Header fixed, Main scrolls independently) */}
      <div className="flex-1 flex flex-col h-full min-w-0 overflow-hidden">
        <Header
          onOpenAddDevice={() => setIsAddDeviceOpen(true)}
          onOpenChat={() => setIsChatOpen((prev) => !prev)}
          onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
          onRefresh={fetchAllData}
          isRefreshing={isRefreshing}
          activeIncidentsCount={incidents.length}
        />

        <main className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6 pb-24 md:pb-8">
          <div className="max-w-7xl w-full mx-auto space-y-6">
            {currentTab === 'dashboard' && (
              <Dashboard
                metrics={metrics}
                nodeMetrics={nodeMetrics}
                containers={containers}
                incidents={incidents}
                devices={devices}
                onNavigateToIncidents={() => setCurrentTab('incidents')}
                onNavigateToTopology={() => setCurrentTab('topology')}
              />
            )}

            {currentTab === 'topology' && (
              <TopologyView
                nodes={topologyNodes}
                edges={topologyEdges}
                onOpenLogs={handleOpenLogs}
              />
            )}

            {currentTab === 'incidents' && (
              <IncidentsView
                incidents={incidents}
                onApproveFix={handleApproveFix}
                onResolveIncident={handleResolveIncident}
                onOpenLogs={handleOpenLogs}
              />
            )}

            {currentTab === 'devices' && (
              <DevicesView
                devices={devices}
                onOpenAddDevice={() => setIsAddDeviceOpen(true)}
                onDeleteDevice={handleDeleteDevice}
                onUpdateDevice={handleUpdateDevice}
              />
            )}

            {currentTab === 'logs' && (
              <LogsView
                containers={containers}
                devices={devices}
                initialSource={logTarget}
              />
            )}

            {currentTab === 'settings' && (
              <SettingsView />
            )}
          </div>
        </main>
      </div>

      {/* Docked Independent Ophanim AI Sidebar (Fixed to Viewport, Independent Scroll, Drag-to-Resize) */}
      <AIChatDrawer
        isOpen={isChatOpen}
        onClose={() => setIsChatOpen(false)}
      />

      {/* Modals & Dialogs */}
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        onNavigate={(tab) => setCurrentTab(tab)}
        onOpenChat={() => {
          setIsCommandPaletteOpen(false);
          setIsChatOpen(true);
        }}
        onOpenLogs={(source) => {
          setIsCommandPaletteOpen(false);
          handleOpenLogs(source);
        }}
        containers={containers}
        incidents={incidents}
        devices={devices}
      />

      <AddDeviceModal
        isOpen={isAddDeviceOpen}
        onClose={() => setIsAddDeviceOpen(false)}
        onDeviceAdded={fetchAllData}
      />
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <ThemeProvider>
      <MainLayout />
    </ThemeProvider>
  );
};
