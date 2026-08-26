package collector

import (
	"context"
	"crypto/tls"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/WilliamAxelC/Ophanim/pkg/types"
)

// SyntheticProber executes synthetic health checks on HTTP, HTTPS, TCP, and DNS endpoints.
type SyntheticProber struct {
	httpClient *http.Client
}

// NewSyntheticProber creates a prober with a custom TLS transport.
func NewSyntheticProber() *SyntheticProber {
	tr := &http.Transport{
		TLSClientConfig: &tls.Config{InsecureSkipVerify: true}, // Allow homelab self-signed certs for probing
		DialContext: (&net.Dialer{
			Timeout: 5 * time.Second,
		}).DialContext,
	}
	return &SyntheticProber{
		httpClient: &http.Client{
			Transport: tr,
			Timeout:   10 * time.Second,
		},
	}
}

// Probe executes a probe against the target.
func (p *SyntheticProber) Probe(ctx context.Context, targetID, targetName, targetURL, probeType string, expectedCode int, timeout time.Duration) *types.SyntheticProbeResult {
	if timeout <= 0 {
		timeout = 10 * time.Second
	}
	if expectedCode == 0 {
		expectedCode = 200
	}

	result := &types.SyntheticProbeResult{
		TargetID:   targetID,
		TargetName: targetName,
		TargetURL:  targetURL,
		ProbeType:  probeType,
		Timestamp:  time.Now(),
	}

	start := time.Now()

	switch strings.ToLower(probeType) {
	case "http", "https", "":
		p.probeHTTP(ctx, targetURL, expectedCode, timeout, result)
	case "tcp":
		p.probeTCP(ctx, targetURL, timeout, result)
	case "dns":
		p.probeDNS(ctx, targetURL, timeout, result)
	default:
		p.probeHTTP(ctx, targetURL, expectedCode, timeout, result)
	}

	result.ResponseTime = time.Since(start)
	result.LatencyMs = float64(result.ResponseTime.Microseconds()) / 1000.0
	return result
}

func (p *SyntheticProber) probeHTTP(ctx context.Context, rawURL string, expectedCode int, timeout time.Duration, result *types.SyntheticProbeResult) {
	if _, err := url.Parse(rawURL); err != nil {
		result.Success = false
		result.ErrorMessage = fmt.Sprintf("invalid URL: %v", err)
		return
	}

	reqCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	req, err := http.NewRequestWithContext(reqCtx, http.MethodGet, rawURL, nil)
	if err != nil {
		result.Success = false
		result.ErrorMessage = err.Error()
		return
	}
	req.Header.Set("User-Agent", "Ophanim-SRE-Prober/1.0")

	resp, err := p.httpClient.Do(req)
	if err != nil {
		result.Success = false
		result.ErrorMessage = err.Error()
		return
	}
	defer resp.Body.Close()

	result.StatusCode = resp.StatusCode

	// Check SSL Certificate if HTTPS
	if resp.TLS != nil && len(resp.TLS.PeerCertificates) > 0 {
		cert := resp.TLS.PeerCertificates[0]
		remaining := time.Until(cert.NotAfter)
		days := int(remaining.Hours() / 24)
		result.SSLExpiryDays = days
	}

	// Validate status code
	if expectedCode > 0 && resp.StatusCode == expectedCode {
		result.Success = true
	} else if expectedCode == 0 && resp.StatusCode >= 200 && resp.StatusCode < 400 {
		result.Success = true
	} else {
		result.Success = false
		result.ErrorMessage = fmt.Sprintf("HTTP status %d (expected %d)", resp.StatusCode, expectedCode)
	}
}

func (p *SyntheticProber) probeTCP(ctx context.Context, address string, timeout time.Duration, result *types.SyntheticProbeResult) {
	var d net.Dialer
	connCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	conn, err := d.DialContext(connCtx, "tcp", address)
	if err != nil {
		result.Success = false
		result.ErrorMessage = err.Error()
		return
	}
	defer conn.Close()

	result.Success = true
}

func (p *SyntheticProber) probeDNS(ctx context.Context, hostname string, timeout time.Duration, result *types.SyntheticProbeResult) {
	r := &net.Resolver{}
	dnsCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	ips, err := r.LookupIP(dnsCtx, "ip", hostname)
	if err != nil || len(ips) == 0 {
		result.Success = false
		if err != nil {
			result.ErrorMessage = err.Error()
		} else {
			result.ErrorMessage = "no IP addresses resolved"
		}
		return
	}

	result.Success = true
}
