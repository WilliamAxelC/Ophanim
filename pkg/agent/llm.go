package agent

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/WilliamAxelC/Ophanim/pkg/config"
	"github.com/WilliamAxelC/Ophanim/pkg/types"
)

// LLMClient provides a unified interface for Gemini, Claude, OpenAI, and Ollama.
type LLMClient struct {
	config     config.LLMConfig
	httpClient *http.Client
	mu         sync.RWMutex
}

// NewLLMClient creates an LLM client.
func NewLLMClient(cfg config.LLMConfig) *LLMClient {
	return &LLMClient{
		config: cfg,
		httpClient: &http.Client{
			Timeout: 45 * time.Second,
		},
	}
}

// GenerateResponse generates text completion from the configured LLM provider.
func (c *LLMClient) GenerateResponse(ctx context.Context, systemPrompt, userPrompt string) (string, error) {
	return c.GenerateChatResponse(ctx, systemPrompt, nil, userPrompt)
}

// GenerateChatResponse generates text completion with multi-turn conversation memory.
func (c *LLMClient) GenerateChatResponse(ctx context.Context, systemPrompt string, history []types.ChatMessage, userPrompt string) (string, error) {
	if !c.config.Enabled {
		return "LLM integration is disabled in configuration.", nil
	}

	switch strings.ToLower(c.config.Provider) {
	case "gemini":
		return c.callGeminiChat(ctx, systemPrompt, history, userPrompt)
	case "claude", "anthropic":
		return c.callClaudeChat(ctx, systemPrompt, history, userPrompt)
	case "ollama":
		return c.callOllamaChat(ctx, systemPrompt, history, userPrompt)
	case "openai":
		return c.callOpenAIChat(ctx, systemPrompt, history, userPrompt)
	case "mistral":
		return c.callMistralChat(ctx, systemPrompt, history, userPrompt)
	default:
		return c.callGeminiChat(ctx, systemPrompt, history, userPrompt)
	}
}

func (c *LLMClient) callGeminiChat(ctx context.Context, systemPrompt string, history []types.ChatMessage, userPrompt string) (string, error) {
	model := c.config.Model
	if model == "" {
		model = "gemini-2.5-flash"
	}

	url := fmt.Sprintf("https://generativelanguage.googleapis.com/v1beta/models/%s:generateContent?key=%s", model, c.config.APIKey)

	var contents []map[string]interface{}
	for _, m := range history {
		role := "user"
		if strings.ToLower(m.Role) == "assistant" || strings.ToLower(m.Role) == "model" {
			role = "model"
		}
		if m.Content != "" {
			contents = append(contents, map[string]interface{}{
				"role": role,
				"parts": []map[string]interface{}{
					{"text": m.Content},
				},
			})
		}
	}
	contents = append(contents, map[string]interface{}{
		"role": "user",
		"parts": []map[string]interface{}{
			{"text": userPrompt},
		},
	})

	payload := map[string]interface{}{
		"systemInstruction": map[string]interface{}{
			"parts": []map[string]interface{}{
				{"text": systemPrompt},
			},
		},
		"contents": contents,
		"generationConfig": map[string]interface{}{
			"temperature":     c.config.Temperature,
			"maxOutputTokens": c.config.MaxTokens,
		},
	}

	body, _ := json.Marshal(payload)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("gemini API call failed: %w", err)
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("gemini API error (%d): %s", resp.StatusCode, string(respBody))
	}

	var result struct {
		Candidates []struct {
			Content struct {
				Parts []struct {
					Text string `json:"text"`
				} `json:"parts"`
			} `json:"content"`
		} `json:"candidates"`
	}

	if err := json.Unmarshal(respBody, &result); err != nil || len(result.Candidates) == 0 || len(result.Candidates[0].Content.Parts) == 0 {
		return "", fmt.Errorf("failed to parse Gemini response: %w", err)
	}

	return result.Candidates[0].Content.Parts[0].Text, nil
}

func (c *LLMClient) callClaudeChat(ctx context.Context, systemPrompt string, history []types.ChatMessage, userPrompt string) (string, error) {
	model := c.config.Model
	if model == "" {
		model = "claude-3-5-sonnet-20241022"
	}

	url := "https://api.anthropic.com/v1/messages"

	var messages []map[string]string
	for _, m := range history {
		role := "user"
		if strings.ToLower(m.Role) == "assistant" || strings.ToLower(m.Role) == "model" {
			role = "assistant"
		}
		if m.Content != "" {
			messages = append(messages, map[string]string{
				"role":    role,
				"content": m.Content,
			})
		}
	}
	messages = append(messages, map[string]string{
		"role":    "user",
		"content": userPrompt,
	})

	payload := map[string]interface{}{
		"model":      model,
		"max_tokens": c.config.MaxTokens,
		"system":     systemPrompt,
		"messages":   messages,
	}

	body, _ := json.Marshal(payload)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("x-api-key", c.config.APIKey)
	req.Header.Set("anthropic-version", "2023-06-01")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("claude API call failed: %w", err)
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("claude API error (%d): %s", resp.StatusCode, string(respBody))
	}

	var result struct {
		Content []struct {
			Text string `json:"text"`
		} `json:"content"`
	}

	if err := json.Unmarshal(respBody, &result); err != nil || len(result.Content) == 0 {
		return "", fmt.Errorf("failed to parse Claude response: %w", err)
	}

	return result.Content[0].Text, nil
}

func (c *LLMClient) UpdateConfig(cfg config.LLMConfig) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.config = cfg
}

func (c *LLMClient) GetConfig() config.LLMConfig {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.config
}

func (c *LLMClient) callOpenAIChat(ctx context.Context, systemPrompt string, history []types.ChatMessage, userPrompt string) (string, error) {
	c.mu.RLock()
	model := c.config.Model
	apiKey := c.config.APIKey
	endpoint := c.config.Endpoint
	c.mu.RUnlock()

	if model == "" {
		model = "gpt-4o-mini"
	}
	if endpoint == "" {
		endpoint = "https://api.openai.com/v1"
	}

	return c.callOpenAICompatibleChat(ctx, endpoint, model, apiKey, systemPrompt, history, userPrompt)
}

func (c *LLMClient) callOllamaChat(ctx context.Context, systemPrompt string, history []types.ChatMessage, userPrompt string) (string, error) {
	endpoint := c.config.Endpoint
	if endpoint == "" {
		endpoint = "http://localhost:11434"
	}
	model := c.config.Model
	if model == "" {
		model = "llama3"
	}

	url := fmt.Sprintf("%s/api/chat", strings.TrimSuffix(endpoint, "/"))

	var messages []map[string]string
	messages = append(messages, map[string]string{
		"role":    "system",
		"content": systemPrompt,
	})
	for _, m := range history {
		role := "user"
		if strings.ToLower(m.Role) == "assistant" || strings.ToLower(m.Role) == "model" {
			role = "assistant"
		}
		if m.Content != "" {
			messages = append(messages, map[string]string{
				"role":    role,
				"content": m.Content,
			})
		}
	}
	messages = append(messages, map[string]string{
		"role":    "user",
		"content": userPrompt,
	})

	payload := map[string]interface{}{
		"model":    model,
		"messages": messages,
		"stream":   false,
	}

	body, _ := json.Marshal(payload)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("ollama API call failed: %w", err)
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("ollama API error (%d): %s", resp.StatusCode, string(respBody))
	}

	var result struct {
		Message struct {
			Content string `json:"content"`
		} `json:"message"`
	}

	if err := json.Unmarshal(respBody, &result); err == nil && result.Message.Content != "" {
		return result.Message.Content, nil
	}

	// Fallback to /api/generate format
	var genResult struct {
		Response string `json:"response"`
	}
	if err := json.Unmarshal(respBody, &genResult); err == nil && genResult.Response != "" {
		return genResult.Response, nil
	}

	return "", fmt.Errorf("failed to parse Ollama response: %s", string(respBody))
}

func (c *LLMClient) callMistralChat(ctx context.Context, systemPrompt string, history []types.ChatMessage, userPrompt string) (string, error) {
	model := c.config.Model
	if model == "" {
		model = "mistral-large-latest"
	}

	endpoint := "https://api.mistral.ai/v1"
	if c.config.Endpoint != "" {
		endpoint = c.config.Endpoint
	}

	return c.callOpenAICompatibleChat(ctx, endpoint, model, c.config.APIKey, systemPrompt, history, userPrompt)
}

func (c *LLMClient) callOpenAICompatibleChat(ctx context.Context, endpoint, model, apiKey, systemPrompt string, history []types.ChatMessage, userPrompt string) (string, error) {
	url := fmt.Sprintf("%s/chat/completions", strings.TrimSuffix(endpoint, "/"))

	temp := c.config.Temperature
	if temp <= 0 {
		temp = 0.2
	}
	maxTok := c.config.MaxTokens
	if maxTok <= 0 {
		maxTok = 2048
	}

	var messages []map[string]string
	messages = append(messages, map[string]string{
		"role":    "system",
		"content": systemPrompt,
	})
	for _, m := range history {
		role := "user"
		if strings.ToLower(m.Role) == "assistant" || strings.ToLower(m.Role) == "model" {
			role = "assistant"
		}
		if m.Content != "" {
			messages = append(messages, map[string]string{
				"role":    role,
				"content": m.Content,
			})
		}
	}
	messages = append(messages, map[string]string{
		"role":    "user",
		"content": userPrompt,
	})

	payload := map[string]interface{}{
		"model":       model,
		"messages":    messages,
		"temperature": temp,
		"max_tokens":  maxTok,
	}

	body, _ := json.Marshal(payload)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	if apiKey != "" {
		req.Header.Set("Authorization", "Bearer "+apiKey)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("API call failed: %w", err)
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("API error (%d): %s", resp.StatusCode, string(respBody))
	}

	var result struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}

	if err := json.Unmarshal(respBody, &result); err != nil || len(result.Choices) == 0 {
		return "", fmt.Errorf("failed to parse response: %w", err)
	}

	return result.Choices[0].Message.Content, nil
}

// ListAvailableModels queries the provider or custom endpoint for available models.
func (c *LLMClient) ListAvailableModels(ctx context.Context, provider, endpoint, apiKey string) ([]string, error) {
	provider = strings.ToLower(provider)
	if provider == "" {
		provider = strings.ToLower(c.config.Provider)
	}
	if endpoint == "" {
		endpoint = c.config.Endpoint
	}
	if apiKey == "" {
		apiKey = c.config.APIKey
	}

	switch provider {
	case "mistral":
		if apiKey != "" {
			if models, err := c.queryOpenAICompatibleModels(ctx, "https://api.mistral.ai/v1", apiKey); err == nil && len(models) > 0 {
				return models, nil
			}
		}
		return []string{
			"mistral-large-latest",
			"mistral-small-latest",
			"codestral-latest",
			"ministral-8b-latest",
			"ministral-3b-latest",
			"open-mistral-nemo",
			"open-mixtral-8x22b",
			"open-mixtral-8x7b",
		}, nil

	case "ollama":
		if endpoint == "" {
			endpoint = "http://localhost:11434"
		}
		endpoint = strings.TrimSuffix(endpoint, "/")

		// Try /api/tags first
		tagsURL := fmt.Sprintf("%s/api/tags", endpoint)
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, tagsURL, nil)
		if err == nil {
			resp, err := c.httpClient.Do(req)
			if err == nil {
				defer resp.Body.Close()
				if resp.StatusCode == http.StatusOK {
					var result struct {
						Models []struct {
							Name  string `json:"name"`
							Model string `json:"model"`
						} `json:"models"`
					}
					if err := json.NewDecoder(resp.Body).Decode(&result); err == nil && len(result.Models) > 0 {
						var models []string
						for _, m := range result.Models {
							name := m.Name
							if name == "" {
								name = m.Model
							}
							if name != "" {
								models = append(models, name)
							}
						}
						return models, nil
					}
				}
			}
		}

		// Fallback to /v1/models for Ollama OpenAI compatibility
		return c.queryOpenAICompatibleModels(ctx, endpoint, apiKey)

	case "openai", "openrouter", "vllm", "localai", "lmstudio":
		if endpoint == "" {
			endpoint = "https://api.openai.com/v1"
		}
		return c.queryOpenAICompatibleModels(ctx, endpoint, apiKey)

	case "gemini":
		if apiKey != "" {
			url := fmt.Sprintf("https://generativelanguage.googleapis.com/v1beta/models?key=%s", apiKey)
			req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
			if err == nil {
				resp, err := c.httpClient.Do(req)
				if err == nil {
					defer resp.Body.Close()
					if resp.StatusCode == http.StatusOK {
						var result struct {
							Models []struct {
								Name string `json:"name"`
							} `json:"models"`
						}
						if err := json.NewDecoder(resp.Body).Decode(&result); err == nil && len(result.Models) > 0 {
							var models []string
							for _, m := range result.Models {
								cleanName := strings.TrimPrefix(m.Name, "models/")
								if strings.Contains(cleanName, "gemini") {
									models = append(models, cleanName)
								}
							}
							if len(models) > 0 {
								return models, nil
							}
						}
					}
				}
			}
		}
		return []string{
			"gemini-2.5-flash",
			"gemini-2.5-pro",
			"gemini-2.0-flash",
			"gemini-2.0-flash-lite",
			"gemini-1.5-pro",
			"gemini-1.5-flash",
		}, nil

	case "claude", "anthropic":
		return []string{
			"claude-3-5-sonnet-20241022",
			"claude-3-5-haiku-20241022",
			"claude-3-opus-20240229",
			"claude-3-sonnet-20240229",
			"claude-3-haiku-20240307",
		}, nil

	default:
		return []string{"gemini-2.5-flash", "llama3.2", "gpt-4o-mini", "claude-3-5-sonnet-20241022"}, nil
	}
}

func (c *LLMClient) queryOpenAICompatibleModels(ctx context.Context, endpoint, apiKey string) ([]string, error) {
	endpoint = strings.TrimSuffix(endpoint, "/")
	modelsURL := endpoint + "/models"
	if !strings.HasSuffix(endpoint, "/v1") && !strings.Contains(endpoint, "/models") {
		modelsURL = endpoint + "/v1/models"
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, modelsURL, nil)
	if err != nil {
		return nil, err
	}
	if apiKey != "" {
		req.Header.Set("Authorization", "Bearer "+apiKey)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to reach model endpoint (%s): %w", modelsURL, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("model endpoint returned %d: %s", resp.StatusCode, string(respBody))
	}

	var result struct {
		Data []struct {
			ID string `json:"id"`
		} `json:"data"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil || len(result.Data) == 0 {
		return nil, fmt.Errorf("no models found in response from %s", modelsURL)
	}

	var models []string
	for _, item := range result.Data {
		if item.ID != "" {
			models = append(models, item.ID)
		}
	}
	return models, nil
}
