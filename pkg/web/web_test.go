package web

import (
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"github.com/WilliamAxelC/Ophanim/pkg/config"
	"github.com/WilliamAxelC/Ophanim/pkg/storage"
	"github.com/WilliamAxelC/Ophanim/pkg/topology"
)

func TestWebServerStatusAPI(t *testing.T) {
	tmpDir := t.TempDir()
	store, _ := storage.NewStorage(filepath.Join(tmpDir, "web_test.db"), 100)
	defer store.Close()

	cfg := config.DefaultConfig()
	topo := topology.NewGraphEngine()

	server := NewServer(cfg, store, nil, topo, nil, nil, EmbeddedDistFS)

	req := httptest.NewRequest("GET", "/api/status", nil)
	w := httptest.NewRecorder()

	server.handleStatus(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d", w.Code)
	}
	if w.Body.Len() == 0 {
		t.Errorf("expected JSON body")
	}
}
