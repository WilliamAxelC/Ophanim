package hub

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/WilliamAxelC/Ophanim/pkg/storage"
	"github.com/WilliamAxelC/Ophanim/pkg/types"
	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true // Allow homelab LAN / proxy connections
	},
}

// HubMessage represents a bi-directional WebSocket message between Hub and Ophanim-Monitor.
type HubMessage struct {
	Type       string                `json:"type"` // "enroll", "heartbeat", "metrics", "containers", "action_request", "action_response", "log"
	NodeID     string                `json:"node_id"`
	Token      string                `json:"token,omitempty"`
	Payload    json.RawMessage       `json:"payload,omitempty"`
	ActionReq  *types.ActionRequest  `json:"action_req,omitempty"`
	ActionResp *types.ActionResponse `json:"action_resp,omitempty"`
	Timestamp  time.Time             `json:"timestamp"`
}

// EdgeClient represents a connected edge agent.
type EdgeClient struct {
	NodeID   string
	Conn     *websocket.Conn
	SendChan chan HubMessage
	LastSeen time.Time
}

// Hub manages connected edge monitors, token enrollment, and remote action routing.
type Hub struct {
	storage      *storage.Storage
	secretToken  string
	clients      map[string]*EdgeClient
	mu           sync.RWMutex
	pendingReqs  map[string]chan *types.ActionResponse
	pendingMu    sync.RWMutex
	enrollTokens map[string]time.Time // valid pairing tokens
	tokenMu      sync.RWMutex
}

// NewHub creates a central hub manager.
func NewHub(store *storage.Storage, secretToken string) *Hub {
	return &Hub{
		storage:      store,
		secretToken:  secretToken,
		clients:      make(map[string]*EdgeClient),
		pendingReqs:  make(map[string]chan *types.ActionResponse),
		enrollTokens: make(map[string]time.Time),
	}
}

// GenerateEnrollToken creates a single-use pairing token for a new node.
func (h *Hub) GenerateEnrollToken() string {
	h.tokenMu.Lock()
	defer h.tokenMu.Unlock()

	bytes := make([]byte, 16)
	_, _ = rand.Read(bytes)
	token := "oph_tok_" + hex.EncodeToString(bytes)
	h.enrollTokens[token] = time.Now().Add(24 * time.Hour)
	return token
}

// ValidateToken checks if a token is valid (either master secret token or generated enroll token).
func (h *Hub) ValidateToken(token string) bool {
	if h.secretToken != "" && token == h.secretToken {
		return true
	}

	h.tokenMu.Lock()
	defer h.tokenMu.Unlock()

	expiry, exists := h.enrollTokens[token]
	if exists && time.Now().Before(expiry) {
		return true
	}
	return false
}

// HandleWebSocket manages the WebSocket connection from an Ophanim-Monitor edge agent.
func (h *Hub) HandleWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		http.Error(w, "WebSocket upgrade failed", http.StatusBadRequest)
		return
	}

	client := &EdgeClient{
		Conn:     conn,
		SendChan: make(chan HubMessage, 32),
		LastSeen: time.Now(),
	}

	go h.writePump(client)
	h.readPump(client)
}

func (h *Hub) readPump(client *EdgeClient) {
	defer func() {
		h.unregisterClient(client)
		client.Conn.Close()
	}()

	for {
		var msg HubMessage
		if err := client.Conn.ReadJSON(&msg); err != nil {
			break
		}

		client.LastSeen = time.Now()

		switch msg.Type {
		case "enroll", "heartbeat":
			if !h.ValidateToken(msg.Token) && h.secretToken != "" {
				client.Conn.WriteJSON(HubMessage{
					Type:    "error",
					Payload: json.RawMessage(`"unauthorized token"`),
				})
				return
			}
			client.NodeID = msg.NodeID
			h.registerClient(client)

			// Enroll in database
			_ = h.storage.EnrollDevice(&types.DeviceNode{
				ID:        msg.NodeID,
				Name:      msg.NodeID,
				AgentType: "ophanim-monitor",
				Status:    "online",
				LastSeen:  time.Now(),
				CreatedAt: time.Now(),
			})

		case "metrics":
			var metrics types.HostMetrics
			if err := json.Unmarshal(msg.Payload, &metrics); err == nil {
				if metrics.NodeID == "" {
					metrics.NodeID = msg.NodeID
				}
				_ = h.storage.SaveHostMetrics(&metrics)
				_ = h.storage.UpdateDeviceStatus(msg.NodeID, "online")
			}

		case "containers":
			var containers []types.ContainerStatus
			if err := json.Unmarshal(msg.Payload, &containers); err == nil {
				now := time.Now().UTC()
				for _, c := range containers {
					if c.NodeID == "" {
						c.NodeID = msg.NodeID
					}
					c.LastSeen = now
					if err := h.storage.SaveContainer(&c); err != nil {
						log.Printf("[Hub] Failed to save container %s (%s): %v", c.Name, c.ID, err)
					}
				}
				log.Printf("[Hub] Successfully persisted %d containers from node '%s'", len(containers), msg.NodeID)
				_ = h.storage.UpdateDeviceStatus(msg.NodeID, "online")
			} else {
				log.Printf("[Hub] Failed to unmarshal containers from node '%s': %v", msg.NodeID, err)
			}

		case "log":
			var logEntry types.LogEntry
			if err := json.Unmarshal(msg.Payload, &logEntry); err == nil {
				h.storage.PushLog(logEntry.Source, logEntry.NodeID, logEntry.Level, logEntry.Message)
			}

		case "action_response":
			if msg.ActionResp != nil {
				h.pendingMu.Lock()
				ch, exists := h.pendingReqs[msg.ActionResp.ActionID]
				h.pendingMu.Unlock()
				if exists {
					ch <- msg.ActionResp
				}
			}
		}
	}
}

func (h *Hub) writePump(client *EdgeClient) {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case msg, ok := <-client.SendChan:
			if !ok {
				client.Conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			if err := client.Conn.WriteJSON(msg); err != nil {
				return
			}
		case <-ticker.C:
			if err := client.Conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

func (h *Hub) registerClient(client *EdgeClient) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.clients[client.NodeID] = client
	if client.NodeID != "" && h.storage != nil {
		h.storage.PushLog("system", client.NodeID, "INFO", fmt.Sprintf("✅ System / Node '%s' connected via edge monitor WebSocket stream", client.NodeID))
		h.storage.PushLog("ophanim", "local", "INFO", fmt.Sprintf("✅ System / Node '%s' connected via edge monitor WebSocket stream", client.NodeID))
	}
}

func (h *Hub) unregisterClient(client *EdgeClient) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if client.NodeID != "" {
		delete(h.clients, client.NodeID)
		if h.storage != nil {
			_ = h.storage.EnrollDevice(&types.DeviceNode{
				ID:        client.NodeID,
				Name:      client.NodeID,
				AgentType: "ophanim-monitor",
				Status:    "offline",
				LastSeen:  time.Now(),
			})
			h.storage.PushLog("system", client.NodeID, "WARN", fmt.Sprintf("⚠️ System / Node '%s' DISCONNECTED / OFFLINE (WebSocket connection closed)", client.NodeID))
			h.storage.PushLog("ophanim", "local", "WARN", fmt.Sprintf("⚠️ System / Node '%s' DISCONNECTED / OFFLINE (WebSocket connection closed)", client.NodeID))
		}
	}
	close(client.SendChan)
}

// DispatchAction sends a remediation command to a connected edge node and waits for response.
func (h *Hub) DispatchAction(req *types.ActionRequest, timeout time.Duration) (*types.ActionResponse, error) {
	h.mu.RLock()
	client, online := h.clients[req.TargetNode]
	h.mu.RUnlock()

	if !online {
		return nil, fmt.Errorf("target node '%s' is not connected", req.TargetNode)
	}

	respChan := make(chan *types.ActionResponse, 1)
	h.pendingMu.Lock()
	h.pendingReqs[req.ID] = respChan
	h.pendingMu.Unlock()

	defer func() {
		h.pendingMu.Lock()
		delete(h.pendingReqs, req.ID)
		h.pendingMu.Unlock()
	}()

	client.SendChan <- HubMessage{
		Type:      "action_request",
		NodeID:    req.TargetNode,
		ActionReq: req,
		Timestamp: time.Now(),
	}

	select {
	case resp := <-respChan:
		return resp, nil
	case <-time.After(timeout):
		return nil, fmt.Errorf("timeout waiting for node '%s' action execution", req.TargetNode)
	}
}

// ConnectedNodes returns a list of actively connected node IDs.
func (h *Hub) ConnectedNodes() []string {
	h.mu.RLock()
	defer h.mu.RUnlock()
	var nodes []string
	for id := range h.clients {
		nodes = append(nodes, id)
	}
	return nodes
}
