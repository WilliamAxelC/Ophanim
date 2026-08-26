package storage

import (
	"math"
	"sort"
	"strings"
	"unicode"
)

// IncidentVector represents an incident with its semantic embedding vector.
type IncidentVector struct {
	IncidentID string    `json:"incident_id"`
	Title      string    `json:"title"`
	Summary    string    `json:"summary"`
	Fix        string    `json:"fix"`
	Vector     []float32 `json:"vector"`
}

// ScoredIncident is an incident matched by cosine similarity.
type ScoredIncident struct {
	IncidentVector
	Score float32 `json:"score"`
}

// CosineSimilarity computes the cosine similarity between two float vectors.
func CosineSimilarity(a, b []float32) float32 {
	if len(a) != len(b) || len(a) == 0 {
		return 0
	}

	var dotProduct, normA, normB float64
	for i := range a {
		dotProduct += float64(a[i]) * float64(b[i])
		normA += float64(a[i]) * float64(a[i])
		normB += float64(b[i]) * float64(b[i])
	}

	if normA == 0 || normB == 0 {
		return 0
	}

	return float32(dotProduct / (math.Sqrt(normA) * math.Sqrt(normB)))
}

// SimpleTermVector generates a fixed-dimension (128-dim) normalized term-frequency feature vector for text.
// This allows high-speed zero-dependency in-process semantic indexing for incident matching.
func SimpleTermVector(text string, dim int) []float32 {
	if dim <= 0 {
		dim = 128
	}
	vec := make([]float32, dim)
	words := strings.FieldsFunc(strings.ToLower(text), func(r rune) bool {
		return !unicode.IsLetter(r) && !unicode.IsNumber(r)
	})

	if len(words) == 0 {
		return vec
	}

	for _, w := range words {
		if len(w) < 2 {
			continue
		}
		// Hash token into vector bucket using FNV-like polynomial
		var h uint32 = 2166136261
		for i := 0; i < len(w); i++ {
			h ^= uint32(w[i])
			h *= 16777619
		}
		bucket := int(h % uint32(dim))
		vec[bucket] += 1.0
	}

	// Normalize vector (L2 norm)
	var norm float64
	for _, v := range vec {
		norm += float64(v * v)
	}
	if norm > 0 {
		sqrtNorm := float32(math.Sqrt(norm))
		for i := range vec {
			vec[i] /= sqrtNorm
		}
	}

	return vec
}

// SearchTopK returns the top k incident vectors closest to the query vector.
func SearchTopK(query []float32, items []IncidentVector, k int, minScore float32) []ScoredIncident {
	var scored []ScoredIncident
	for _, item := range items {
		score := CosineSimilarity(query, item.Vector)
		if score >= minScore {
			scored = append(scored, ScoredIncident{
				IncidentVector: item,
				Score:          score,
			})
		}
	}

	sort.Slice(scored, func(i, j int) bool {
		return scored[i].Score > scored[j].Score
	})

	if k > 0 && len(scored) > k {
		scored = scored[:k]
	}
	return scored
}
