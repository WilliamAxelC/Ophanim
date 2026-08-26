package agent

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/WilliamAxelC/Ophanim/pkg/storage"
	"github.com/WilliamAxelC/Ophanim/pkg/types"
)

// RCAResult represents the structured Root Cause Analysis produced by the AI SRE agent.
type RCAResult struct {
	Summary        string   `json:"summary"`
	RootCause      string   `json:"root_cause"`
	BlastRadius    string   `json:"blast_radius"`
	RecommendedFix string   `json:"recommended_fix"`
	ActionType     string   `json:"action_type"` // e.g. "CONTAINER_RESTART", "NONE"
	Confidence     float64  `json:"confidence"`
}

// RCAEngine analyzes incidents using logs, topology context, historical incident RAG, and LLM reasoning.
type RCAEngine struct {
	llm     *LLMClient
	storage *storage.Storage
}

// NewRCAEngine creates a new Root Cause Analysis engine.
func NewRCAEngine(llm *LLMClient, store *storage.Storage) *RCAEngine {
	return &RCAEngine{
		llm:     llm,
		storage: store,
	}
}

// AnalyzeIncident conducts an automated SRE investigation on an incident.
func (e *RCAEngine) AnalyzeIncident(ctx context.Context, inc *types.Incident, recentLogs string) (*RCAResult, error) {
	// 1. Query Historical Incident Memory (RAG)
	similar, _ := e.storage.SearchSimilarIncidents(inc.Title+" "+inc.Description, 2)
	var ragContext strings.Builder
	if len(similar) > 0 {
		ragContext.WriteString("\nSimilar Past Incidents:\n")
		for i, s := range similar {
			ragContext.WriteString(fmt.Sprintf("%d. Title: %s | Fix: %s (Similarity Score: %.2f)\n", i+1, s.Title, s.Fix, s.Score))
		}
	}

	systemPrompt := `You are Ophanim, an expert SRE and Homelab Autonomous Monitoring Agent.
Your role is to diagnose infrastructure incidents, identify the true root cause, and provide a clear, actionable remediation recommendation.

You must respond ONLY with a JSON object matching this schema:
{
  "summary": "Brief 1-sentence summary of the incident",
  "root_cause": "Detailed technical explanation of what caused the failure",
  "blast_radius": "Which services and dependencies are impacted",
  "recommended_fix": "Clear step-by-step remediation recommendation",
  "action_type": "CONTAINER_RESTART" or "NONE",
  "confidence": 0.95
}`

	userPrompt := fmt.Sprintf(`Incident Title: %s
Severity: %s
Description: %s
Impacted Targets: %s

Recent Error Logs:
%s
%s
Analyze this incident and return the JSON diagnosis.`,
		inc.Title,
		inc.Severity,
		inc.Description,
		strings.Join(inc.ImpactedTargets, ", "),
		recentLogs,
		ragContext.String(),
	)

	response, err := e.llm.GenerateResponse(ctx, systemPrompt, userPrompt)
	if err != nil {
		return nil, err
	}

	// Clean code fence formatting if present
	cleanJSON := strings.TrimSpace(response)
	cleanJSON = strings.TrimPrefix(cleanJSON, "```json")
	cleanJSON = strings.TrimPrefix(cleanJSON, "```")
	cleanJSON = strings.TrimSuffix(cleanJSON, "```")
	cleanJSON = strings.TrimSpace(cleanJSON)

	var result RCAResult
	if err := json.Unmarshal([]byte(cleanJSON), &result); err != nil {
		// Fallback for non-JSON formatted text response
		return &RCAResult{
			Summary:        inc.Title,
			RootCause:      response,
			BlastRadius:    strings.Join(inc.ImpactedTargets, ", "),
			RecommendedFix: "Inspect container logs and restart service if safe.",
			ActionType:     "CONTAINER_RESTART",
			Confidence:     0.8,
		}, nil
	}

	// Update Incident in storage
	inc.RootCauseSummary = result.Summary + " — " + result.RootCause
	_ = e.storage.UpdateIncident(inc)

	// Save into Incident Memory for future RAG recall
	_ = e.storage.SaveIncidentEmbedding(storage.IncidentVector{
		IncidentID: inc.ID,
		Title:      inc.Title,
		Summary:    result.Summary + " " + result.RootCause,
		Fix:        result.RecommendedFix,
		Vector:     storage.SimpleTermVector(inc.Title+" "+result.Summary+" "+result.RootCause, 128),
	})

	return &result, nil
}
