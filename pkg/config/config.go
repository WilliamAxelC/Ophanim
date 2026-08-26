package config

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"gopkg.in/yaml.v3"
)

// Config is the root configuration structure for Ophanim.
type Config struct {
	Hub        HubConfig          `yaml:"hub"`
	Storage    StorageConfig      `yaml:"storage"`
	LLM        LLMConfig          `yaml:"llm"`
	ChatOps    ChatOpsConfig      `yaml:"chatops"`
	Thresholds ThresholdsConfig   `yaml:"thresholds"`
	Auth       AuthConfig         `yaml:"auth"`
	Nodes      []NodeConfig       `yaml:"nodes"`
	Proxmox    []ProxmoxConfig    `yaml:"proxmox"`
	SNMP       []SNMPConfig       `yaml:"snmp"`
	Synthetic  []SyntheticConfig  `yaml:"synthetic"`
	Prometheus []PrometheusConfig `yaml:"prometheus"`
}

type AuthConfig struct {
	JWTSecret string        `yaml:"jwt_secret"`
	JWTExpiry time.Duration `yaml:"jwt_expiry"`
	DemoMode  bool          `yaml:"demo_mode"`
}

type HubConfig struct {
	ListenAddr       string        `yaml:"listen_addr"`
	Port             int           `yaml:"port"`
	SecretToken      string        `yaml:"secret_token"`
	PollInterval     time.Duration `yaml:"poll_interval"`
	RetentionDays    int           `yaml:"retention_days"`
	EnableZeroConfig bool          `yaml:"enable_zero_config"`
}

type StorageConfig struct {
	DBPath     string `yaml:"db_path"`
	RingBuffer int    `yaml:"ring_buffer_lines"`
}

type LLMConfig struct {
	Enabled     bool    `yaml:"enabled"`
	Provider    string  `yaml:"provider"` // gemini, claude, openai, ollama
	APIKey      string  `yaml:"api_key"`
	Endpoint    string  `yaml:"endpoint"` // e.g. http://localhost:11434 for Ollama
	Model       string  `yaml:"model"`    // e.g. gemini-2.5-flash, claude-3-5-sonnet, gpt-4o-mini, llama3
	Temperature float64 `yaml:"temperature"`
	MaxTokens   int     `yaml:"max_tokens"`
}

type ChatOpsConfig struct {
	Discord  DiscordConfig  `yaml:"discord"`
	Telegram TelegramConfig `yaml:"telegram"`
	Webhooks []string       `yaml:"webhooks"` // NTFY / Pushover URLs
}

type DiscordConfig struct {
	Enabled        bool   `yaml:"enabled"`
	BotToken       string `yaml:"bot_token"`
	AlertChannelID string `yaml:"alert_channel_id"`
	AdminRoleID    string `yaml:"admin_role_id"`
}

type TelegramConfig struct {
	Enabled  bool   `yaml:"enabled"`
	BotToken string `yaml:"bot_token"`
	ChatID   int64  `yaml:"chat_id"`
	TopicID  int    `yaml:"topic_id,omitempty"`
}

type ThresholdsConfig struct {
	CPUWarningPercent     float64       `yaml:"cpu_warning_percent"`
	CPUCriticalPercent    float64       `yaml:"cpu_critical_percent"`
	MemoryWarningPercent  float64       `yaml:"memory_warning_percent"`
	MemoryCriticalPercent float64       `yaml:"memory_critical_percent"`
	DiskWarningPercent    float64       `yaml:"disk_warning_percent"`
	DiskCriticalPercent   float64       `yaml:"disk_critical_percent"`
	SSLExpiryWarningDays  int           `yaml:"ssl_expiry_warning_days"`
	AutoHealMaxPerHour    int           `yaml:"auto_heal_max_per_hour"`
	AntiFlapWindow        time.Duration `yaml:"anti_flap_window"`
}

type NodeConfig struct {
	ID           string `yaml:"id"`
	Name         string `yaml:"name"`
	Host         string `yaml:"host"` // e.g. "unix:///var/run/docker.sock" or "tcp://10.20.20.121:2375"
	DockerSocket string `yaml:"docker_socket,omitempty"`
	SSHUser      string `yaml:"ssh_user,omitempty"`
	SSHKeyPath   string `yaml:"ssh_key_path,omitempty"`
	AutoHeal     bool   `yaml:"auto_heal"`
}

type ProxmoxConfig struct {
	ID       string `yaml:"id"`
	Name     string `yaml:"name"`
	Endpoint string `yaml:"endpoint"` // https://10.20.20.X:8006
	User     string `yaml:"user"`     // root@pam!ophanim
	Token    string `yaml:"token"`    // uuid token secret
	Insecure bool   `yaml:"insecure"` // skip TLS verify for self-signed
}

type SNMPConfig struct {
	ID        string `yaml:"id"`
	Name      string `yaml:"name"`
	Host      string `yaml:"host"`
	Port      uint16 `yaml:"port"`
	Community string `yaml:"community"`
	Version   string `yaml:"version"` // 2c or 3
}

type SyntheticConfig struct {
	ID            string        `yaml:"id"`
	Name          string        `yaml:"name"`
	URL           string        `yaml:"url"`
	Type          string        `yaml:"type"` // http, https, tcp, dns
	ExpectedCode  int           `yaml:"expected_code"`
	Timeout       time.Duration `yaml:"timeout"`
	CheckInterval time.Duration `yaml:"check_interval"`
}

type PrometheusConfig struct {
	ID       string        `yaml:"id"`
	Name     string        `yaml:"name"`
	URL      string        `yaml:"url"` // Scrape URL (http://ip:9100/metrics) or PromQL Server
	IsServer bool          `yaml:"is_server"`
	Interval time.Duration `yaml:"interval"`
}

// DefaultConfig returns a production-ready configuration with sensible defaults.
func DefaultConfig() *Config {
	return &Config{
		Hub: HubConfig{
			ListenAddr:       "0.0.0.0",
			Port:             8080,
			SecretToken:      "",
			PollInterval:     10 * time.Second,
			RetentionDays:    30,
			EnableZeroConfig: true,
		},
		Storage: StorageConfig{
			DBPath:     "data/ophanim.db",
			RingBuffer: 1000,
		},
		LLM: LLMConfig{
			Enabled:     false,
			Provider:    "gemini",
			Model:       "gemini-2.5-flash",
			Temperature: 0.2,
			MaxTokens:   2048,
		},
		ChatOps: ChatOpsConfig{
			Discord: DiscordConfig{
				Enabled: false,
			},
			Telegram: TelegramConfig{
				Enabled: false,
			},
		},
		Thresholds: ThresholdsConfig{
			CPUWarningPercent:     80.0,
			CPUCriticalPercent:    95.0,
			MemoryWarningPercent:  85.0,
			MemoryCriticalPercent: 95.0,
			DiskWarningPercent:    80.0,
			DiskCriticalPercent:   92.0,
			SSLExpiryWarningDays:  14,
			AutoHealMaxPerHour:    2,
			AntiFlapWindow:        5 * time.Minute,
		},
		Nodes: []NodeConfig{
			{
				ID:           "local-lxc",
				Name:         "Homelab LXC (Local)",
				Host:         "unix:///var/run/docker.sock",
				DockerSocket: "/var/run/docker.sock",
				AutoHeal:     true,
			},
		},
		Synthetic: []SyntheticConfig{},
		Auth: AuthConfig{
			JWTExpiry: 24 * time.Hour,
			DemoMode:  false,
		},
	}
}

// LoadConfig reads YAML from path or creates a default one if missing, then applies env overrides.
func LoadConfig(path string) (*Config, error) {
	cfg := DefaultConfig()

	if path == "" {
		path = "config.yaml"
	}

	data, err := os.ReadFile(path)
	if os.IsNotExist(err) {
		// Auto-generate default configuration file
		if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil && filepath.Dir(path) != "." {
			return nil, fmt.Errorf("failed to create config directory: %w", err)
		}
		marshaled, mErr := yaml.Marshal(cfg)
		if mErr == nil {
			_ = os.WriteFile(path, marshaled, 0644)
		}
	} else if err != nil {
		return nil, fmt.Errorf("failed to read config file at %s: %w", path, err)
	} else {
		if err := yaml.Unmarshal(data, cfg); err != nil {
			return nil, fmt.Errorf("failed to parse yaml config: %w", err)
		}
	}

	applyEnvOverrides(cfg)
	return cfg, nil
}

func applyEnvOverrides(cfg *Config) {
	if token := os.Getenv("OPHANIM_SECRET_TOKEN"); token != "" {
		cfg.Hub.SecretToken = token
	}
	if dbPath := os.Getenv("OPHANIM_DB_PATH"); dbPath != "" {
		cfg.Storage.DBPath = dbPath
	}
	if geminiKey := os.Getenv("GEMINI_API_KEY"); geminiKey != "" {
		cfg.LLM.APIKey = geminiKey
		cfg.LLM.Enabled = true
		cfg.LLM.Provider = "gemini"
	}
	if anthropicKey := os.Getenv("ANTHROPIC_API_KEY"); anthropicKey != "" {
		cfg.LLM.APIKey = anthropicKey
		cfg.LLM.Enabled = true
		cfg.LLM.Provider = "claude"
	}
	if openaiKey := os.Getenv("OPENAI_API_KEY"); openaiKey != "" {
		cfg.LLM.APIKey = openaiKey
		cfg.LLM.Enabled = true
		cfg.LLM.Provider = "openai"
	}
	if discordToken := os.Getenv("DISCORD_BOT_TOKEN"); discordToken != "" {
		cfg.ChatOps.Discord.BotToken = discordToken
		cfg.ChatOps.Discord.Enabled = true
	}
	if telegramToken := os.Getenv("TELEGRAM_BOT_TOKEN"); telegramToken != "" {
		cfg.ChatOps.Telegram.BotToken = telegramToken
		cfg.ChatOps.Telegram.Enabled = true
	}
	if demoMode := os.Getenv("OPHANIM_DEMO_MODE"); demoMode == "true" || demoMode == "1" {
		cfg.Auth.DemoMode = true
	}
	if cfg.Auth.JWTSecret == "" {
		b := make([]byte, 32)
		_, _ = rand.Read(b)
		cfg.Auth.JWTSecret = hex.EncodeToString(b)
	}
}
