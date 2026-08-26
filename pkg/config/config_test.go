package config

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLoadDefaultConfig(t *testing.T) {
	tmpDir := t.TempDir()
	configPath := filepath.Join(tmpDir, "config.yaml")

	cfg, err := LoadConfig(configPath)
	if err != nil {
		t.Fatalf("unexpected error loading config: %v", err)
	}

	if cfg.Hub.Port != 8080 {
		t.Errorf("expected port 8080, got %d", cfg.Hub.Port)
	}

	if len(cfg.Nodes) == 0 {
		t.Errorf("expected default nodes, got none")
	}

	// Verify file was written
	if _, err := os.Stat(configPath); os.IsNotExist(err) {
		t.Errorf("expected default config to be generated at %s", configPath)
	}
}

func TestEnvOverrides(t *testing.T) {
	tmpDir := t.TempDir()
	configPath := filepath.Join(tmpDir, "config.yaml")

	os.Setenv("OPHANIM_SECRET_TOKEN", "test-secret-token")
	os.Setenv("GEMINI_API_KEY", "test-gemini-key")
	defer func() {
		os.Unsetenv("OPHANIM_SECRET_TOKEN")
		os.Unsetenv("GEMINI_API_KEY")
	}()

	cfg, err := LoadConfig(configPath)
	if err != nil {
		t.Fatalf("unexpected error loading config: %v", err)
	}

	if cfg.Hub.SecretToken != "test-secret-token" {
		t.Errorf("expected secret token 'test-secret-token', got '%s'", cfg.Hub.SecretToken)
	}

	if cfg.LLM.APIKey != "test-gemini-key" || !cfg.LLM.Enabled || cfg.LLM.Provider != "gemini" {
		t.Errorf("expected Gemini API key to override LLM config, got %+v", cfg.LLM)
	}
}
