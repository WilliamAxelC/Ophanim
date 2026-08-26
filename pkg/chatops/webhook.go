package chatops

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/WilliamAxelC/Ophanim/pkg/types"
)

// WebhookDispatcher pushes incident alerts to NTFY, Gotify, or generic webhook URLs.
type WebhookDispatcher struct {
	endpoints  []string
	httpClient *http.Client
}

// NewWebhookDispatcher creates a webhook dispatcher.
func NewWebhookDispatcher(endpoints []string) *WebhookDispatcher {
	return &WebhookDispatcher{
		endpoints: endpoints,
		httpClient: &http.Client{
			Timeout: 10 * time.Second,
		},
	}
}

// BroadcastIncident dispatches an incident payload to all configured webhook endpoints.
func (w *WebhookDispatcher) BroadcastIncident(ctx context.Context, inc *types.Incident) {
	if len(w.endpoints) == 0 {
		return
	}

	payload, _ := json.Marshal(map[string]interface{}{
		"topic":    "ophanim-alerts",
		"title":    fmt.Sprintf("[%s] %s", inc.Severity, inc.Title),
		"message":  inc.Description,
		"priority": 4,
		"tags":     []string{"warning", "homelab", "ophanim"},
		"incident": inc,
	})

	for _, ep := range w.endpoints {
		go func(url string) {
			req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(payload))
			if err == nil {
				req.Header.Set("Content-Type", "application/json")
				resp, err := w.httpClient.Do(req)
				if err == nil {
					resp.Body.Close()
				}
			}
		}(ep)
	}
}
