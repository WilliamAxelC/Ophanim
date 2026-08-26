package prometheus

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

// MetricScraper scrapes Prometheus endpoints and queries PromQL servers without external dependencies.
type MetricScraper struct {
	httpClient *http.Client
}

// NewMetricScraper creates a new Prometheus scraper.
func NewMetricScraper() *MetricScraper {
	return &MetricScraper{
		httpClient: &http.Client{
			Timeout: 10 * time.Second,
		},
	}
}

// ScrapedMetrics holds parsed key-value gauge and counter values.
type ScrapedMetrics struct {
	TargetURL string             `json:"target_url"`
	Metrics   map[string]float64 `json:"metrics"`
	Timestamp time.Time          `json:"timestamp"`
}

// ScrapeEndpoint fetches and parses a Prometheus /metrics endpoint.
func (s *MetricScraper) ScrapeEndpoint(ctx context.Context, scrapeURL string) (*ScrapedMetrics, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, scrapeURL, nil)
	if err != nil {
		return nil, err
	}

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to scrape %s: %w", scrapeURL, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("scrape %s returned HTTP %d", scrapeURL, resp.StatusCode)
	}

	metricsMap := ParsePrometheusText(resp.Body)

	return &ScrapedMetrics{
		TargetURL: scrapeURL,
		Metrics:   metricsMap,
		Timestamp: time.Now(),
	}, nil
}

// ParsePrometheusText parses standard Prometheus exposition format text into a map of metric values.
func ParsePrometheusText(r io.Reader) map[string]float64 {
	metrics := make(map[string]float64)
	scanner := bufio.NewScanner(r)

	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}

		// Format: metric_name{labels} value [timestamp] OR metric_name value
		var name string
		var valueStr string

		if idx := strings.Index(line, "{"); idx != -1 {
			name = line[:idx]
			closeIdx := strings.LastIndex(line, "}")
			if closeIdx != -1 && closeIdx+1 < len(line) {
				rest := strings.TrimSpace(line[closeIdx+1:])
				parts := strings.Fields(rest)
				if len(parts) > 0 {
					valueStr = parts[0]
				}
			}
		} else {
			parts := strings.Fields(line)
			if len(parts) >= 2 {
				name = parts[0]
				valueStr = parts[1]
			}
		}

		if name != "" && valueStr != "" {
			if val, err := strconv.ParseFloat(valueStr, 64); err == nil {
				metrics[name] = val
			}
		}
	}

	return metrics
}

// PromQLQueryResult represents the JSON response from Prometheus /api/v1/query.
type PromQLQueryResult struct {
	Status string `json:"status"`
	Data   struct {
		ResultType string `json:"resultType"`
		Result     []struct {
			Metric map[string]string `json:"metric"`
			Value  []interface{}     `json:"value"` // [timestamp, "value"]
		} `json:"result"`
	} `json:"data"`
}

// QueryPromQL executes an instant PromQL query against a Prometheus/VictoriaMetrics server.
func (s *MetricScraper) QueryPromQL(ctx context.Context, serverURL, query string) (*PromQLQueryResult, error) {
	serverURL = strings.TrimSuffix(serverURL, "/")
	endpoint := fmt.Sprintf("%s/api/v1/query?query=%s", serverURL, url.QueryEscape(query))

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, err
	}

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("PromQL query failed: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	var result PromQLQueryResult
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("failed to parse PromQL response: %w", err)
	}

	return &result, nil
}
