package hub

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/WilliamAxelC/Ophanim/pkg/storage"
	"github.com/WilliamAxelC/Ophanim/pkg/types"
	"github.com/gorilla/websocket"
)

func TestHubWebSocketStreaming(t *testing.T) {
	tmpDir := t.TempDir()
	dbPath := filepath.Join(tmpDir, "hub_test.db")
	store, err := storage.NewStorage(dbPath, 100)
	if err != nil {
		t.Fatalf("failed to create storage: %v", err)
	}
	defer store.Close()

	h := NewHub(store, "test-secret-token")
	server := httptest.NewServer(http.HandlerFunc(h.HandleWebSocket))
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http")

	// Connect mock client
	conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("failed to dial hub: %v", err)
	}
	defer conn.Close()

	// 1. Send Enroll
	enrollMsg := HubMessage{
		Type:      "enroll",
		NodeID:    "edge-vm-1",
		Token:     "test-secret-token",
		Timestamp: time.Now(),
	}
	if err := conn.WriteJSON(enrollMsg); err != nil {
		t.Fatalf("failed to write enroll msg: %v", err)
	}

	time.Sleep(50 * time.Millisecond)

	// Verify connected node registered
	nodes := h.ConnectedNodes()
	if len(nodes) != 1 || nodes[0] != "edge-vm-1" {
		t.Errorf("expected edge-vm-1 connected, got %+v", nodes)
	}

	// 2. Stream Metrics
	metrics := types.HostMetrics{
		NodeID:          "edge-vm-1",
		Hostname:        "edge-vm-1",
		CPUUsagePercent: 33.3,
		CPUCores:        2,
		MemoryPercent:   40.0,
		Timestamp:       time.Now(),
	}
	payload, _ := json.Marshal(metrics)
	if err := conn.WriteJSON(HubMessage{
		Type:      "metrics",
		NodeID:    "edge-vm-1",
		Payload:   payload,
		Timestamp: time.Now(),
	}); err != nil {
		t.Fatalf("failed to write metrics: %v", err)
	}

	time.Sleep(50 * time.Millisecond)

	savedMetrics, err := store.GetLatestHostMetrics("edge-vm-1")
	if err != nil || savedMetrics.CPUUsagePercent != 33.3 {
		t.Errorf("metrics not saved properly in hub: %+v, err: %v", savedMetrics, err)
	}

	// 3. Test Action Dispatch
	go func() {
		// Mock agent reading action request and replying
		var incoming HubMessage
		if err := conn.ReadJSON(&incoming); err == nil && incoming.Type == "action_request" {
			conn.WriteJSON(HubMessage{
				Type:   "action_response",
				NodeID: "edge-vm-1",
				ActionResp: &types.ActionResponse{
					ActionID:   incoming.ActionReq.ID,
					Success:    true,
					Output:     "restarted container ok",
					ExecutedBy: "mock_agent",
					ExecutedAt: time.Now(),
				},
				Timestamp: time.Now(),
			})
		}
	}()

	actionReq := &types.ActionRequest{
		ID:         "act-test-99",
		TargetNode: "edge-vm-1",
		TargetID:   "cnt-123",
		ActionType: types.ActionContainerRestart,
	}

	resp, err := h.DispatchAction(actionReq, 2*time.Second)
	if err != nil {
		t.Fatalf("action dispatch failed: %v", err)
	}
	if !resp.Success || resp.Output != "restarted container ok" {
		t.Errorf("unexpected action response: %+v", resp)
	}
}

func TestEnrollTokens(t *testing.T) {
	h := NewHub(nil, "master-secret")
	token := h.GenerateEnrollToken()
	if !strings.HasPrefix(token, "oph_tok_") {
		t.Errorf("expected oph_tok_ prefix, got %s", token)
	}

	if !h.ValidateToken(token) {
		t.Errorf("token should be valid")
	}

	if !h.ValidateToken("master-secret") {
		t.Errorf("master secret should be valid")
	}

	if h.ValidateToken("invalid-token") {
		t.Errorf("invalid token should be rejected")
	}
}
