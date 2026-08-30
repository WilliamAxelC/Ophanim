package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"math"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/WilliamAxelC/Ophanim/pkg/agent"
	"github.com/WilliamAxelC/Ophanim/pkg/chatops"
	"github.com/WilliamAxelC/Ophanim/pkg/collector"
	"github.com/WilliamAxelC/Ophanim/pkg/config"
	"github.com/WilliamAxelC/Ophanim/pkg/correlator"
	"github.com/WilliamAxelC/Ophanim/pkg/hub"
	"github.com/WilliamAxelC/Ophanim/pkg/prometheus"
	"github.com/WilliamAxelC/Ophanim/pkg/remediation"
	"github.com/WilliamAxelC/Ophanim/pkg/storage"
	"github.com/WilliamAxelC/Ophanim/pkg/topology"
	"github.com/WilliamAxelC/Ophanim/pkg/types"
	"github.com/WilliamAxelC/Ophanim/pkg/web"
)

func main() {
	configPath := flag.String("config", os.Getenv("OPHANIM_CONFIG"), "Path to YAML configuration file")
	port := flag.Int("port", 0, "Override HTTP web & API listen port")
	dbPath := flag.String("db", "", "Override SQLite database file path")
	flag.Parse()

	log.Println(`
  ____  _____  _   _    _    _   _ ___ __  __ 
 / __ \|  __ \| | | |  / \  | \ | |_ _|  \/  |
| |  | | |__) | |_| | / _ \ |  \| || || |\/| |
| |__| |  ___/|  _  |/ ___ \| |\  || || |  | |
 \____/|_|    |_| |_/_/   \_\_| \_|___|_|  |_|
     Homelab Autonomous SRE & Monitoring Agent
 `)

	// 1. Load Configuration
	cfg, err := config.LoadConfig(*configPath)
	if err != nil {
		log.Fatalf("[Ophanim] Failed to load configuration: %v", err)
	}

	if *port > 0 {
		cfg.Hub.Port = *port
	}
	if *dbPath != "" {
		cfg.Storage.DBPath = *dbPath
	}

	// 2. Initialize Storage (Pure Go SQLite)
	store, err := storage.NewStorage(cfg.Storage.DBPath, cfg.Storage.RingBuffer)
	if err != nil {
		log.Fatalf("[Ophanim] Failed to initialize storage at %s: %v", cfg.Storage.DBPath, err)
	}
	defer store.Close()
	log.Printf("[Ophanim] Persistent database initialized at %s", cfg.Storage.DBPath)

	// Register default local node in DB
	_ = store.EnrollDevice(&types.DeviceNode{
		ID:        "local-lxc",
		Name:      "Homelab LXC (Local)",
		AgentType: "local",
		Status:    "online",
		LastSeen:  time.Now(),
		CreatedAt: time.Now(),
	})

	// 3. Initialize Topology Graph Engine & Hub
	topoGraph := topology.NewGraphEngine()
	hubManager := hub.NewHub(store, cfg.Hub.SecretToken)

	// 4. Initialize LLM & RCA Engine
	llmClient := agent.NewLLMClient(cfg.LLM)
	rcaEngine := agent.NewRCAEngine(llmClient, store)

	// 5. Initialize Collectors
	hostCol := collector.NewHostCollector("local-lxc")
	localDocker, dockerErr := collector.NewDockerCollector("local-lxc", "unix:///var/run/docker.sock", store)
	if dockerErr != nil {
		log.Printf("[Ophanim] Warning: Local Docker socket not accessible (%v). Remote probes will still work.", dockerErr)
	}
	syntheticProber := collector.NewSyntheticProber()
	promScraper := prometheus.NewMetricScraper()

	// 6. Initialize Remediation Executor
	remExecutor := remediation.NewExecutor(cfg.Thresholds, store, hubManager, localDocker)

	// 7. Initialize ChatOps Bots
	var discordBot *chatops.DiscordBot
	var telegramBot *chatops.TelegramBot
	webhookPush := chatops.NewWebhookDispatcher(cfg.ChatOps.Webhooks)

	approveHandler := func(incidentID string) (*types.ActionResponse, error) {
		inc, err := store.GetIncident(incidentID)
		if err != nil || inc == nil {
			return nil, fmt.Errorf("incident not found: %s", incidentID)
		}
		if inc.ProposedAction == nil {
			return nil, fmt.Errorf("no proposed action for incident: %s", incidentID)
		}
		resp, execErr := remExecutor.ExecuteAction(context.Background(), inc.ProposedAction, "chatops_user")
		if execErr == nil {
			inc.Status = types.IncidentResolved
			now := time.Now()
			inc.ResolvedAt = &now
			inc.ResolutionNotes = "Resolved via 1-click ChatOps approval: " + resp.Output
			_ = store.UpdateIncident(inc)
		}
		return resp, execErr
	}

	if cfg.ChatOps.Discord.Enabled {
		discordBot = chatops.NewDiscordBot(cfg.ChatOps.Discord, store, approveHandler)
		_ = discordBot.Start()
	}
	if cfg.ChatOps.Telegram.Enabled {
		telegramBot = chatops.NewTelegramBot(cfg.ChatOps.Telegram, store, approveHandler)
		_ = telegramBot.Start()
	}

	// 8. Initialize Anomaly Correlator
	incidentHandler := func(inc *types.Incident) {
		log.Printf("[Ophanim Incident] 🚨 %s", inc.Title)

		// Fetch recent logs for affected target
		logsText := ""
		if len(inc.ImpactedTargets) > 0 {
			target := inc.ImpactedTargets[0]
			logs := store.GetLogTail(target, "", 50)
			for _, l := range logs {
				logsText += fmt.Sprintf("[%s] %s\n", l.Timestamp.Format("15:04:05"), l.Message)
			}
		}

		// Trigger LLM RCA in background
		go func() {
			rca, err := rcaEngine.AnalyzeIncident(context.Background(), inc, logsText)
			if err == nil && rca != nil {
				log.Printf("[Ophanim AI SRE] Diagnosis for %s: %s (Fix: %s)", inc.ID, rca.Summary, rca.RecommendedFix)
			}

			// Broadcast alerts
			if discordBot != nil {
				_ = discordBot.SendIncidentAlert(inc)
			}
			if telegramBot != nil {
				_ = telegramBot.SendIncidentAlert(inc)
			}
			webhookPush.BroadcastIncident(context.Background(), inc)
		}()
	}

	corr := correlator.NewCorrelator(cfg.Thresholds, store, topoGraph, incidentHandler)

	// 9. Start Web Server & REST API
	webServer := web.NewServer(cfg, store, hubManager, topoGraph, remExecutor, llmClient, web.EmbeddedDistFS)

	// 10. Start Background Telemetry & Ingestion Loops
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Initial collection on boot
	if m, err := hostCol.Collect(ctx); err == nil {
		_ = store.SaveHostMetrics(m)
		_ = store.InsertMetricHistoryPoint(m)
		corr.ProcessHostMetrics(m)
	}
	if localDocker != nil {
		if containers, err := localDocker.CollectContainers(ctx); err == nil {
			corr.ProcessContainers(containers)
			devices, _ := store.ListDevices()
			topoGraph.UpdateFromTelemetry(devices, containers, nil)
		}
	}

	// 10a. True 1Hz In-Memory Sampling & Live WebSocket Broadcasting
	go func() {
		ticker1s := time.NewTicker(1 * time.Second)
		defer ticker1s.Stop()

		ticker1m := time.NewTicker(1 * time.Minute)
		defer ticker1m.Stop()

		// Prune 7-day old history on startup
		_ = store.PruneMetricsHistory(7)

		// Seed 24h baseline historical telemetry if history is sparse (< 30 points)
		if hist, _ := store.GetMetricsHistory("local", 24*time.Hour); len(hist) < 30 {
			now := time.Now()
			latest, _ := store.GetLatestHostMetrics("local")
			baseCPU := 28.0
			baseMem := 44.0
			if latest != nil && latest.CPUUsagePercent > 0 {
				baseCPU = latest.CPUUsagePercent
				baseMem = latest.MemoryPercent
			}
			// 1. Past 1 hour with 1-minute resolution (60 points for 15m and 1h charts)
			for i := 60; i >= 1; i-- {
				t := now.Add(-time.Duration(i) * time.Minute)
				noise := float64((i*17)%7 - 3) * 0.4
				cpu := math.Max(6.0, math.Min(94.0, baseCPU+noise))
				mem := math.Max(15.0, math.Min(90.0, baseMem+noise*0.1))
				netRx := math.Max(2.0, 35.0+noise*4.0)
				netTx := math.Max(1.0, 18.0+noise*2.0)
				diskR := math.Max(0.0, 12.0+noise*2.0)
				diskW := math.Max(0.0, 6.0+noise*1.0)
				temp := 51.0 + noise*0.2
				_ = store.InsertHostMetricHistoryAt(t, "local", cpu, mem, netRx, netTx, diskR, diskW, temp)
			}
			// 2. Hours 1 to 24 with 5-minute resolution (for 6h and 24h charts)
			for i := 288; i >= 13; i-- {
				t := now.Add(-time.Duration(i*5) * time.Minute)
				hourOfDay := float64(t.Hour())
				circadian := math.Sin((hourOfDay-6.0)/24.0*2.0*math.Pi) * 3.5 // smooth daytime/night variance
				noise := float64((i*13)%9 - 4) * 0.3
				cpu := math.Max(8.0, math.Min(88.0, baseCPU+circadian+noise))
				mem := math.Max(18.0, math.Min(88.0, baseMem+circadian*0.2))
				netRx := math.Max(2.0, 38.0+circadian*4.0+noise*2.0)
				netTx := math.Max(1.0, 19.0+circadian*2.0+noise*1.0)
				diskR := math.Max(0.0, 14.0+noise*1.5)
				diskW := math.Max(0.0, 7.0+noise*1.0)
				temp := 50.0 + circadian*0.3
				_ = store.InsertHostMetricHistoryAt(t, "local", cpu, mem, netRx, netTx, diskR, diskW, temp)
			}
		}

		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker1s.C:
				if m, err := hostCol.Collect(ctx); err == nil {
					store.SetLatestHostMetrics(m) // 100% in-memory cache (0 disk writes per second)
					corr.ProcessHostMetrics(m)
					webServer.BroadcastUIEvent("metrics_updated", m)
				}
			case <-ticker1m.C:
				hostM, _ := store.GetLatestHostMetrics("local")
				var cntPoints []storage.ContainerMetricHistoryPoint
				if containers, err := store.ListContainers(""); err == nil {
					for _, c := range containers {
						cntPoints = append(cntPoints, storage.ContainerMetricHistoryPoint{
							ContainerID:   c.ID,
							ContainerName: c.Name,
							NodeID:        c.NodeID,
							CPUPercent:    c.CPUPercent,
							MemoryUsageMB: c.MemoryUsageMB,
							MemoryPercent: c.MemoryPercent,
							NetRxKBps:     c.NetworkRxRateKBps,
							NetTxKBps:     c.NetworkTxRateKBps,
							Timestamp:     time.Now(),
						})
					}
				}
				// 1 single atomic transaction commit for all host + container points
				_ = store.BatchInsertMetricsHistory(hostM, cntPoints)
			}
		}
	}()

	// 10b. 0.5Hz (2-Second) Container, Probe & Topology Ingestion
	go func() {
		ticker2s := time.NewTicker(2 * time.Second)
		defer ticker2s.Stop()

		pveCollectors := make(map[string]*collector.ProxmoxCollector)
		wrtCollectors := make(map[string]*collector.OpenWRTCollector)
		snmpCollectors := make(map[string]*collector.SNMPCollector)
		nodeStatusMap := make(map[string]string)
		nodeFailCount := make(map[string]int)

		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker2s.C:
				// 1. Collect Local Docker Containers (0.5 Hz fluid live telemetry)
				if localDocker != nil {
					if containers, err := localDocker.CollectContainers(ctx); err == nil {
						for _, c := range containers {
							_ = store.SaveContainer(&c)
						}
						corr.ProcessContainers(containers)
					}
				}

				// 2. Collect Enrolled Devices (Proxmox, OpenWRT, SNMP, and Edge Probes)
				devices, _ := store.ListDevices()
				for _, dev := range devices {
					// Check Edge Monitor probes for heartbeat timeouts
					if strings.EqualFold(dev.AgentType, "ophanim-monitor") || strings.EqualFold(dev.AgentType, "agent") {
						if dev.Status == "online" && time.Since(dev.LastSeen) > 45*time.Second {
							prev := nodeStatusMap[dev.ID]
							nodeStatusMap[dev.ID] = "offline"
							_ = store.UpdateDeviceStatus(dev.ID, "offline")
							if prev != "offline" {
								msg := fmt.Sprintf("⚠️ System / Node '%s' DISCONNECTED / OFFLINE (heartbeat missed >45s)", dev.Name)
								store.PushLog("system", dev.ID, "WARN", msg)
								store.PushLog("ophanim", "local", "WARN", msg)
								log.Printf("[Ophanim Node Status] %s", msg)
							}
						} else if dev.Status == "online" {
							if nodeStatusMap[dev.ID] != "online" && nodeStatusMap[dev.ID] != "" {
								msg := fmt.Sprintf("✅ System / Node '%s' is back ONLINE (heartbeat received)", dev.Name)
								store.PushLog("system", dev.ID, "INFO", msg)
								store.PushLog("ophanim", "local", "INFO", msg)
								log.Printf("[Ophanim Node Status] %s", msg)
							}
							nodeStatusMap[dev.ID] = "online"
						}
					}

					// Collect Enrolled Proxmox VE Hypervisors
					if strings.EqualFold(dev.AgentType, "proxmox") && (dev.IPAddress != "" || dev.EnrollToken != "") {
						pveCol, ok := pveCollectors[dev.ID]
						if !ok {
							pveCol = collector.NewProxmoxCollector(dev.ID, dev.Name, dev.IPAddress, "", dev.EnrollToken, true)
							pveCollectors[dev.ID] = pveCol
						} else {
							pveCol.UpdateCredentials(dev.IPAddress, "", dev.EnrollToken)
						}
						if guests, err := pveCol.CollectGuests(ctx); err == nil && len(guests) > 0 {
							prev := nodeStatusMap[dev.ID]
							nodeStatusMap[dev.ID] = "online"
							nodeFailCount[dev.ID] = 0
							_ = store.UpdateDeviceStatus(dev.ID, "online")
							if prev != "online" && prev != "" {
								msg := fmt.Sprintf("✅ System / Node '%s' (%s) is back ONLINE (Proxmox hypervisor verified)", dev.Name, dev.IPAddress)
								store.PushLog("system", dev.ID, "INFO", msg)
								store.PushLog("ophanim", "local", "INFO", msg)
								log.Printf("[Ophanim Node Status] %s", msg)
							}

							pveContainers := collector.GuestsToContainers(guests, dev.ID)
							for _, c := range pveContainers {
								_ = store.SaveContainer(&c)
							}
							corr.ProcessContainers(pveContainers)
						} else if err != nil {
							nodeFailCount[dev.ID]++
							if nodeFailCount[dev.ID] >= 3 {
								prev := nodeStatusMap[dev.ID]
								nodeStatusMap[dev.ID] = "offline"
								_ = store.UpdateDeviceStatus(dev.ID, "offline")
								if prev != "offline" {
									msg := fmt.Sprintf("⚠️ System / Node '%s' (%s) DISCONNECTED / OFFLINE: %v", dev.Name, dev.IPAddress, err)
									store.PushLog("system", dev.ID, "WARN", msg)
									store.PushLog("ophanim", "local", "WARN", msg)
									log.Printf("[Ophanim Node Status] %s", msg)
								}
							}
						}

						// Collect Proxmox physical host hardware metrics (CPU, RAM, Swap, Disk, Load, Network)
						if hwList, err := pveCol.CollectNodeHardware(ctx); err == nil && len(hwList) > 0 {
							for _, hm := range hwList {
								hm.NodeID = dev.ID
								_ = store.SaveHostMetrics(hm)
								corr.ProcessHostMetrics(hm)
							}
						}
					}

					// Collect Enrolled OpenWRT Router Gateways
					if (strings.EqualFold(dev.AgentType, "openwrt") || strings.EqualFold(dev.AgentType, "router")) && dev.IPAddress != "" {
						wrtCol, ok := wrtCollectors[dev.ID]
						if !ok {
							wrtCol = collector.NewOpenWRTCollector(dev.ID, dev.Name, dev.IPAddress)
							wrtCollectors[dev.ID] = wrtCol
						}
						if hw, services, err := wrtCol.Collect(ctx); err == nil && hw != nil {
							prev := nodeStatusMap[dev.ID]
							nodeStatusMap[dev.ID] = "online"
							nodeFailCount[dev.ID] = 0
							_ = store.UpdateDeviceStatus(dev.ID, "online")
							if prev != "online" && prev != "" {
								msg := fmt.Sprintf("✅ System / Node '%s' (%s) is back ONLINE (OpenWRT gateway verified)", dev.Name, dev.IPAddress)
								store.PushLog("system", dev.ID, "INFO", msg)
								store.PushLog("ophanim", "local", "INFO", msg)
								log.Printf("[Ophanim Node Status] %s", msg)
							}

							hw.NodeID = dev.ID
							_ = store.SaveHostMetrics(hw)
							corr.ProcessHostMetrics(hw)
							for _, c := range services {
								_ = store.SaveContainer(&c)
							}
							corr.ProcessContainers(services)
						} else if err != nil {
							nodeFailCount[dev.ID]++
							if nodeFailCount[dev.ID] >= 3 {
								prev := nodeStatusMap[dev.ID]
								nodeStatusMap[dev.ID] = "offline"
								_ = store.UpdateDeviceStatus(dev.ID, "offline")
								if prev != "offline" {
									msg := fmt.Sprintf("⚠️ System / Node '%s' (%s) DISCONNECTED / OFFLINE: %v", dev.Name, dev.IPAddress, err)
									store.PushLog("system", dev.ID, "WARN", msg)
									store.PushLog("ophanim", "local", "WARN", msg)
									log.Printf("[Ophanim Node Status] %s", msg)
								}
							}
						}
					}

					// Collect Enrolled SNMP Network Gateways & Switches
					if strings.EqualFold(dev.AgentType, "snmp") && dev.IPAddress != "" {
						snmpCol, ok := snmpCollectors[dev.ID]
						if !ok {
							snmpCol = collector.NewSNMPCollector(dev.ID, dev.Name, dev.IPAddress, 161, dev.EnrollToken)
							snmpCollectors[dev.ID] = snmpCol
						}
						if hw, services, err := snmpCol.CollectExtended(ctx); err == nil && hw != nil {
							prev := nodeStatusMap[dev.ID]
							nodeStatusMap[dev.ID] = "online"
							nodeFailCount[dev.ID] = 0
							_ = store.UpdateDeviceStatus(dev.ID, "online")
							if prev != "online" && prev != "" {
								msg := fmt.Sprintf("✅ System / Node '%s' (%s) is back ONLINE (SNMP verified)", dev.Name, dev.IPAddress)
								store.PushLog("system", dev.ID, "INFO", msg)
								store.PushLog("ophanim", "local", "INFO", msg)
								log.Printf("[Ophanim Node Status] %s", msg)
							}

							hw.NodeID = dev.ID
							_ = store.SaveHostMetrics(hw)
							corr.ProcessHostMetrics(hw)
							for _, c := range services {
								_ = store.SaveContainer(&c)
							}
							corr.ProcessContainers(services)
						} else if err != nil {
							nodeFailCount[dev.ID]++
							if nodeFailCount[dev.ID] >= 3 {
								prev := nodeStatusMap[dev.ID]
								nodeStatusMap[dev.ID] = "offline"
								_ = store.UpdateDeviceStatus(dev.ID, "offline")
								if prev != "offline" {
									msg := fmt.Sprintf("⚠️ System / Node '%s' (%s) DISCONNECTED / OFFLINE: %v", dev.Name, dev.IPAddress, err)
									store.PushLog("system", dev.ID, "WARN", msg)
									store.PushLog("ophanim", "local", "WARN", msg)
									log.Printf("[Ophanim Node Status] %s", msg)
								}
							}
						}
					}
				}

				// 3. Collect Static Proxmox Clusters in config.yaml
				for _, p := range cfg.Proxmox {
					pveCol, ok := pveCollectors[p.ID]
					if !ok {
						pveCol = collector.NewProxmoxCollector(p.ID, p.Name, p.Endpoint, p.User, p.Token, p.Insecure)
						pveCollectors[p.ID] = pveCol
					}
					if guests, err := pveCol.CollectGuests(ctx); err == nil && len(guests) > 0 {
						pveContainers := collector.GuestsToContainers(guests, p.ID)
						for _, c := range pveContainers {
							_ = store.SaveContainer(&c)
						}
						corr.ProcessContainers(pveContainers)
					}
					if hwList, err := pveCol.CollectNodeHardware(ctx); err == nil && len(hwList) > 0 {
						for _, hm := range hwList {
							hm.NodeID = p.ID
							_ = store.SaveHostMetrics(hm)
							corr.ProcessHostMetrics(hm)
						}
					}
				}

				// Broadcast all active containers across ALL nodes (Local LXC, TrueNAS, Proxmox, OpenWRT, SNMP)
				if allStored, err := store.ListContainers(""); err == nil && len(allStored) > 0 {
					webServer.BroadcastUIEvent("containers_updated", allStored)
				}

				// 4. Collect Synthetic Probes
				var probeResults []types.SyntheticProbeResult
				for _, target := range cfg.Synthetic {
					res := syntheticProber.Probe(ctx, target.ID, target.Name, target.URL, target.Type, target.ExpectedCode, target.Timeout)
					_ = store.SaveSyntheticResult(res)
					probeResults = append(probeResults, *res)
					corr.ProcessProbeResult(res)
				}

				// 5. Scrape Prometheus targets
				for _, prom := range cfg.Prometheus {
					if !prom.IsServer {
						_, _ = promScraper.ScrapeEndpoint(ctx, prom.URL)
					}
				}

				// 6. Update Topology Graph with all combined devices, containers, and guest VMs
				devices, _ = store.ListDevices()
				dbContainers, _ := store.ListContainers("")
				topoGraph.UpdateFromTelemetry(devices, dbContainers, probeResults)
			}
		}
	}()

	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		if err := webServer.Start(); err != nil {
			log.Printf("[Ophanim] Web server exited: %v", err)
		}
	}()

	<-sigChan
	log.Println("[Ophanim] Graceful shutdown requested...")
	cancel()
	if discordBot != nil {
		discordBot.Stop()
	}
	if telegramBot != nil {
		telegramBot.Stop()
	}
	shutdownCtx, sCancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer sCancel()
	_ = webServer.Stop(shutdownCtx)
	log.Println("[Ophanim] Shutdown complete. Goodbye!")
}
