package monitor

import (
	"context"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"log"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/WilliamAxelC/Ophanim/pkg/collector"
	"github.com/WilliamAxelC/Ophanim/pkg/hub"
	"github.com/WilliamAxelC/Ophanim/pkg/types"
	"github.com/gorilla/websocket"
)

// MonitorAgent runs on edge nodes and streams telemetry to the Ophanim Hub.
type MonitorAgent struct {
	nodeID       string
	hubURL       string
	token        string
	dockerHost   string
	pollInterval time.Duration
	hostCol      *collector.HostCollector
	dockerCol    *collector.DockerCollector
	conn         *websocket.Conn
	mu           sync.Mutex
	stopChan     chan struct{}
}

// NewMonitorAgent creates a new edge agent.
func NewMonitorAgent(nodeID, hubURL, token, dockerHost string, pollInterval time.Duration) (*MonitorAgent, error) {
	if pollInterval <= 0 {
		pollInterval = 10 * time.Second
	}
	if dockerHost == "" {
		dockerHost = "unix:///var/run/docker.sock"
	}

	hostCol := collector.NewHostCollector(nodeID)
	dockerCol, _ := collector.NewDockerCollector(nodeID, dockerHost, nil)

	return &MonitorAgent{
		nodeID:       nodeID,
		hubURL:       hubURL,
		token:        token,
		dockerHost:   dockerHost,
		pollInterval: pollInterval,
		hostCol:      hostCol,
		dockerCol:    dockerCol,
		stopChan:     make(chan struct{}),
	}, nil
}

// Start initiates the connection and background telemetry streaming loops.
func (a *MonitorAgent) Start(ctx context.Context) error {
	for {
		select {
		case <-ctx.Done():
			return nil
		case <-a.stopChan:
			return nil
		default:
			if err := a.connectAndStream(ctx); err != nil {
				log.Printf("[Ophanim-Monitor] Disconnected from Hub (%v). Retrying in 5s...", err)
				time.Sleep(5 * time.Second)
			}
		}
	}
}

// Stop shuts down the agent.
func (a *MonitorAgent) Stop() {
	close(a.stopChan)
	a.mu.Lock()
	if a.conn != nil {
		a.conn.Close()
	}
	a.mu.Unlock()
}

func (a *MonitorAgent) connectAndStream(ctx context.Context) error {
	wsURL := a.hubURL
	if strings.HasPrefix(wsURL, "http://") {
		wsURL = "ws://" + strings.TrimPrefix(wsURL, "http://")
	} else if strings.HasPrefix(wsURL, "https://") {
		wsURL = "wss://" + strings.TrimPrefix(wsURL, "https://")
	}
	wsURL = strings.TrimSuffix(wsURL, "/") + "/ws/monitor"

	u, err := url.Parse(wsURL)
	if err != nil {
		return fmt.Errorf("invalid hub URL: %w", err)
	}

	dialer := websocket.Dialer{
		TLSClientConfig: &tls.Config{
			InsecureSkipVerify: true,
		},
		HandshakeTimeout: 15 * time.Second,
	}

	conn, _, err := dialer.DialContext(ctx, u.String(), nil)
	if err != nil {
		return fmt.Errorf("failed to dial hub at %s: %w", wsURL, err)
	}

	a.mu.Lock()
	a.conn = conn
	a.mu.Unlock()
	defer conn.Close()

	// 1. Send Enrollment Message
	enrollMsg := hub.HubMessage{
		Type:      "enroll",
		NodeID:    a.nodeID,
		Token:     a.token,
		Timestamp: time.Now(),
	}
	if err := conn.WriteJSON(enrollMsg); err != nil {
		return err
	}

	log.Printf("[Ophanim-Monitor] Connected and enrolled with Hub as node '%s'", a.nodeID)

	// Launch sender goroutine
	streamCtx, cancel := context.WithCancel(ctx)
	defer cancel()

	go a.telemetryLoop(streamCtx, conn)

	// Read loop (handles action requests from Hub)
	for {
		var msg hub.HubMessage
		if err := conn.ReadJSON(&msg); err != nil {
			return err
		}

		if msg.Type == "action_request" && msg.ActionReq != nil {
			go a.handleAction(conn, msg.ActionReq)
		}
	}
}

func (a *MonitorAgent) telemetryLoop(ctx context.Context, conn *websocket.Conn) {
	ticker := time.NewTicker(a.pollInterval)
	defer ticker.Stop()

	// Send initial telemetry immediately upon connection
	a.sendTelemetryBatch(ctx, conn)

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			a.sendTelemetryBatch(ctx, conn)
		}
	}
}

func (a *MonitorAgent) sendTelemetryBatch(ctx context.Context, conn *websocket.Conn) {
	// Heartbeat
	_ = a.sendJSON(conn, hub.HubMessage{
		Type:      "heartbeat",
		NodeID:    a.nodeID,
		Token:     a.token,
		Timestamp: time.Now(),
	})

	// 1. Host Metrics
	if metrics, err := a.hostCol.Collect(ctx); err == nil && metrics != nil {
		payload, _ := json.Marshal(metrics)
		_ = a.sendJSON(conn, hub.HubMessage{
			Type:      "metrics",
			NodeID:    a.nodeID,
			Payload:   payload,
			Timestamp: time.Now(),
		})
	} else if err != nil {
		log.Printf("[Ophanim-Monitor] Host metrics error: %v", err)
	}

	// 2. Docker Containers
	if a.dockerCol != nil {
		if containers, err := a.dockerCol.CollectContainers(ctx); err == nil {
			log.Printf("[Ophanim-Monitor] Emitting %d containers for node '%s' to Hub", len(containers), a.nodeID)
			payload, _ := json.Marshal(containers)
			_ = a.sendJSON(conn, hub.HubMessage{
				Type:      "containers",
				NodeID:    a.nodeID,
				Payload:   payload,
				Timestamp: time.Now(),
			})
		} else {
			log.Printf("[Ophanim-Monitor] Docker containers error: %v", err)
		}
	}
}

func (a *MonitorAgent) handleAction(conn *websocket.Conn, req *types.ActionRequest) {
	resp := &types.ActionResponse{
		ActionID:   req.ID,
		ExecutedBy: "ophanim-monitor",
		ExecutedAt: time.Now(),
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	var execErr error
	if a.dockerCol != nil {
		switch req.ActionType {
		case types.ActionContainerRestart:
			execErr = a.dockerCol.RestartContainer(ctx, req.TargetID, 10)
			resp.Output = fmt.Sprintf("Restarted container %s successfully", req.TargetName)
		case types.ActionContainerStop:
			execErr = a.dockerCol.StopContainer(ctx, req.TargetID, 10)
			resp.Output = fmt.Sprintf("Stopped container %s successfully", req.TargetName)
		case types.ActionContainerStart:
			execErr = a.dockerCol.StartContainer(ctx, req.TargetID)
			resp.Output = fmt.Sprintf("Started container %s successfully", req.TargetName)
		default:
			execErr = fmt.Errorf("unsupported action type: %s", req.ActionType)
		}
	} else {
		execErr = fmt.Errorf("docker collector unavailable on node")
	}

	if execErr != nil {
		resp.Success = false
		resp.ErrorMessage = execErr.Error()
	} else {
		resp.Success = true
	}

	_ = a.sendJSON(conn, hub.HubMessage{
		Type:       "action_response",
		NodeID:     a.nodeID,
		ActionResp: resp,
		Timestamp:  time.Now(),
	})
}

func (a *MonitorAgent) sendJSON(conn *websocket.Conn, msg hub.HubMessage) error {
	a.mu.Lock()
	defer a.mu.Unlock()
	return conn.WriteJSON(msg)
}
