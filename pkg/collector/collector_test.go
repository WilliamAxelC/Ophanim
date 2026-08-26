package collector

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestHostCollector(t *testing.T) {
	h := NewHostCollector("test-node")
	metrics, err := h.Collect(context.Background())
	if err != nil {
		t.Fatalf("failed to collect host metrics: %v", err)
	}

	if metrics.NodeID != "test-node" {
		t.Errorf("expected node ID 'test-node', got '%s'", metrics.NodeID)
	}
	if metrics.Hostname == "" {
		t.Errorf("expected hostname to be set")
	}
	if metrics.CPUCores <= 0 {
		t.Errorf("expected positive CPU cores, got %d", metrics.CPUCores)
	}
}

func TestSyntheticProber(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("OK"))
	}))
	defer server.Close()

	prober := NewSyntheticProber()
	res := prober.Probe(context.Background(), "test-srv", "Test Server", server.URL, "http", 200, 5*time.Second)

	if !res.Success {
		t.Errorf("expected successful probe, got error: %s", res.ErrorMessage)
	}
	if res.StatusCode != 200 {
		t.Errorf("expected status code 200, got %d", res.StatusCode)
	}
	if res.LatencyMs <= 0 {
		t.Errorf("expected positive latency, got %f", res.LatencyMs)
	}
}
