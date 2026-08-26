package prometheus

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestPrometheusScraper(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		payload := `# HELP node_cpu_seconds_total Total CPU seconds
# TYPE node_cpu_seconds_total counter
node_cpu_seconds_total{mode="idle"} 1234.56
# HELP node_memory_MemAvailable_bytes Available memory
# TYPE node_memory_MemAvailable_bytes gauge
node_memory_MemAvailable_bytes 8589934592
`
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(payload))
	}))
	defer server.Close()

	scraper := NewMetricScraper()
	res, err := scraper.ScrapeEndpoint(context.Background(), server.URL)
	if err != nil {
		t.Fatalf("failed to scrape endpoint: %v", err)
	}

	if val, ok := res.Metrics["node_memory_MemAvailable_bytes"]; !ok || val != 8589934592 {
		t.Errorf("expected node_memory_MemAvailable_bytes to be 8589934592, got %v", val)
	}
}
