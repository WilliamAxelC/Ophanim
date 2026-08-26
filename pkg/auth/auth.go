package auth

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/WilliamAxelC/Ophanim/pkg/types"
	"golang.org/x/crypto/bcrypt"
)

// contextKey is an unexported type for context value keys to avoid collisions.
type contextKey string

const userContextKey contextKey = "ophanim_user"

// UserStore defines the persistence interface for user management.
type UserStore interface {
	GetUserByUsername(username string) (*types.User, error)
	GetUserByID(id string) (*types.User, error)
	CreateUser(user *types.User) error
	CountUsers() (int, error)
}

// JWTClaims holds the decoded JWT payload.
type JWTClaims struct {
	Sub      string `json:"sub"`
	Username string `json:"username"`
	Role     string `json:"role"`
	Exp      int64  `json:"exp"`
	Iat      int64  `json:"iat"`
}

// HashPassword produces a bcrypt hash of the given password.
func HashPassword(password string) (string, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return "", fmt.Errorf("failed to hash password: %w", err)
	}
	return string(hash), nil
}

// CheckPassword returns true if the password matches the bcrypt hash.
func CheckPassword(hash, password string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)) == nil
}

// GenerateJWT creates a HMAC-SHA256 signed JWT token.
func GenerateJWT(user *types.User, secret string, expiry time.Duration) (string, int64, error) {
	now := time.Now()
	exp := now.Add(expiry).Unix()

	header := map[string]string{"alg": "HS256", "typ": "JWT"}
	headerJSON, _ := json.Marshal(header)
	headerB64 := base64URLEncode(headerJSON)

	claims := JWTClaims{
		Sub:      user.ID,
		Username: user.Username,
		Role:     user.Role,
		Exp:      exp,
		Iat:      now.Unix(),
	}
	claimsJSON, _ := json.Marshal(claims)
	claimsB64 := base64URLEncode(claimsJSON)

	signingInput := headerB64 + "." + claimsB64
	signature := hmacSHA256([]byte(signingInput), []byte(secret))
	sigB64 := base64URLEncode(signature)

	token := signingInput + "." + sigB64
	return token, exp, nil
}

// ValidateJWT parses and validates a JWT token string. Returns an error if the
// token is malformed, the signature is invalid, or the token has expired.
func ValidateJWT(tokenStr, secret string) (*JWTClaims, error) {
	parts := strings.Split(tokenStr, ".")
	if len(parts) != 3 {
		return nil, fmt.Errorf("invalid token format")
	}

	signingInput := parts[0] + "." + parts[1]
	expectedSig := hmacSHA256([]byte(signingInput), []byte(secret))
	actualSig, err := base64URLDecode(parts[2])
	if err != nil {
		return nil, fmt.Errorf("invalid token signature encoding")
	}

	if !hmac.Equal(expectedSig, actualSig) {
		return nil, fmt.Errorf("invalid token signature")
	}

	claimsJSON, err := base64URLDecode(parts[1])
	if err != nil {
		return nil, fmt.Errorf("invalid token claims encoding")
	}

	var claims JWTClaims
	if err := json.Unmarshal(claimsJSON, &claims); err != nil {
		return nil, fmt.Errorf("invalid token claims: %w", err)
	}

	if time.Now().Unix() > claims.Exp {
		return nil, fmt.Errorf("token expired")
	}

	return &claims, nil
}

// AuthMiddleware returns HTTP middleware that validates JWT Bearer tokens.
// Exempt paths: /api/auth/login, /api/auth/setup, /ws/monitor, and all non-/api/ paths.
func AuthMiddleware(secret string, store UserStore) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			path := r.URL.Path

			// Exempt paths
			if strings.HasPrefix(path, "/api/auth/login") ||
				strings.HasPrefix(path, "/api/auth/setup") ||
				strings.HasPrefix(path, "/ws/monitor") ||
				!strings.HasPrefix(path, "/api/") {
				next.ServeHTTP(w, r)
				return
			}

			authHeader := r.Header.Get("Authorization")
			if authHeader == "" || !strings.HasPrefix(authHeader, "Bearer ") {
				writeJSONError(w, http.StatusUnauthorized, "missing or invalid authorization header")
				return
			}

			tokenStr := strings.TrimPrefix(authHeader, "Bearer ")
			claims, err := ValidateJWT(tokenStr, secret)
			if err != nil {
				writeJSONError(w, http.StatusUnauthorized, "invalid token: "+err.Error())
				return
			}

			user, err := store.GetUserByID(claims.Sub)
			if err != nil || user == nil {
				writeJSONError(w, http.StatusUnauthorized, "user not found")
				return
			}

			ctx := context.WithValue(r.Context(), userContextKey, user)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// GetUserFromContext extracts the authenticated user from the request context.
func GetUserFromContext(ctx context.Context) *types.User {
	user, _ := ctx.Value(userContextKey).(*types.User)
	return user
}

// RequireRole returns middleware that restricts access to users with specified roles.
func RequireRole(roles ...string) func(http.Handler) http.Handler {
	allowed := make(map[string]bool, len(roles))
	for _, r := range roles {
		allowed[r] = true
	}
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			user := GetUserFromContext(r.Context())
			if user == nil {
				writeJSONError(w, http.StatusUnauthorized, "authentication required")
				return
			}
			if !allowed[user.Role] {
				writeJSONError(w, http.StatusForbidden, "insufficient permissions")
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// RateLimiter provides in-memory IP-based rate limiting for login attempts.
type RateLimiter struct {
	mu       sync.Mutex
	attempts map[string][]time.Time
	maxRate  int
	window   time.Duration
}

// NewRateLimiter creates a rate limiter allowing maxRate attempts per window per IP.
func NewRateLimiter(maxRate int, window time.Duration) *RateLimiter {
	rl := &RateLimiter{
		attempts: make(map[string][]time.Time),
		maxRate:  maxRate,
		window:   window,
	}
	go rl.CleanupLoop()
	return rl
}

// Allow returns true if the IP has not exceeded its rate limit.
func (rl *RateLimiter) Allow(ip string) bool {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	now := time.Now()
	cutoff := now.Add(-rl.window)

	// Filter out expired entries
	var valid []time.Time
	for _, t := range rl.attempts[ip] {
		if t.After(cutoff) {
			valid = append(valid, t)
		}
	}

	if len(valid) >= rl.maxRate {
		rl.attempts[ip] = valid
		return false
	}

	rl.attempts[ip] = append(valid, now)
	return true
}

// CleanupLoop periodically removes stale entries from the rate limiter map.
func (rl *RateLimiter) CleanupLoop() {
	ticker := time.NewTicker(5 * time.Minute)
	defer ticker.Stop()
	for range ticker.C {
		rl.mu.Lock()
		now := time.Now()
		cutoff := now.Add(-rl.window)
		for ip, times := range rl.attempts {
			var valid []time.Time
			for _, t := range times {
				if t.After(cutoff) {
					valid = append(valid, t)
				}
			}
			if len(valid) == 0 {
				delete(rl.attempts, ip)
			} else {
				rl.attempts[ip] = valid
			}
		}
		rl.mu.Unlock()
	}
}

// GenerateRandomSecret produces a cryptographically random 32-byte hex string.
func GenerateRandomSecret() string {
	b := make([]byte, 32)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

// --- internal helpers ---

func hmacSHA256(data, key []byte) []byte {
	h := hmac.New(sha256.New, key)
	h.Write(data)
	return h.Sum(nil)
}

func base64URLEncode(data []byte) string {
	return base64.RawURLEncoding.EncodeToString(data)
}

func base64URLDecode(s string) ([]byte, error) {
	return base64.RawURLEncoding.DecodeString(s)
}

func writeJSONError(w http.ResponseWriter, status int, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": message})
}
