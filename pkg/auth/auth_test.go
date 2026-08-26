package auth

import (
	"testing"
	"time"

	"github.com/WilliamAxelC/Ophanim/pkg/types"
)

func TestPasswordHashing(t *testing.T) {
	password := "supersecret123"
	hash, err := HashPassword(password)
	if err != nil {
		t.Fatalf("HashPassword failed: %v", err)
	}
	if hash == "" {
		t.Fatal("hash should not be empty")
	}
	if hash == password {
		t.Fatal("hash should not equal plaintext password")
	}

	// Correct password
	if !CheckPassword(hash, password) {
		t.Error("CheckPassword should return true for correct password")
	}

	// Wrong password
	if CheckPassword(hash, "wrongpassword") {
		t.Error("CheckPassword should return false for wrong password")
	}
}

func TestJWTGenerationAndValidation(t *testing.T) {
	secret := "test-secret-key-for-jwt"
	user := &types.User{
		ID:       "user-001",
		Username: "admin",
		Role:     "admin",
	}

	token, exp, err := GenerateJWT(user, secret, 1*time.Hour)
	if err != nil {
		t.Fatalf("GenerateJWT failed: %v", err)
	}
	if token == "" {
		t.Fatal("token should not be empty")
	}
	if exp == 0 {
		t.Fatal("exp should not be zero")
	}

	// Valid token
	claims, err := ValidateJWT(token, secret)
	if err != nil {
		t.Fatalf("ValidateJWT failed for valid token: %v", err)
	}
	if claims.Sub != "user-001" {
		t.Errorf("expected sub=user-001, got %s", claims.Sub)
	}
	if claims.Username != "admin" {
		t.Errorf("expected username=admin, got %s", claims.Username)
	}
	if claims.Role != "admin" {
		t.Errorf("expected role=admin, got %s", claims.Role)
	}

	// Wrong secret
	_, err = ValidateJWT(token, "wrong-secret")
	if err == nil {
		t.Error("ValidateJWT should fail with wrong secret")
	}

	// Malformed token
	_, err = ValidateJWT("not.a.valid.token", secret)
	if err == nil {
		t.Error("ValidateJWT should fail with malformed token")
	}
}

func TestJWTExpiry(t *testing.T) {
	secret := "test-secret-key-for-jwt"
	user := &types.User{
		ID:       "user-002",
		Username: "viewer",
		Role:     "viewer",
	}

	// Generate a token that expires immediately (negative duration)
	token, _, err := GenerateJWT(user, secret, -1*time.Second)
	if err != nil {
		t.Fatalf("GenerateJWT failed: %v", err)
	}

	_, err = ValidateJWT(token, secret)
	if err == nil {
		t.Error("ValidateJWT should reject expired token")
	}
}

func TestRateLimiter(t *testing.T) {
	rl := &RateLimiter{
		attempts: make(map[string][]time.Time),
		maxRate:  5,
		window:   1 * time.Minute,
	}

	ip := "192.168.1.100"

	// First 5 attempts should be allowed
	for i := 0; i < 5; i++ {
		if !rl.Allow(ip) {
			t.Errorf("attempt %d should be allowed", i+1)
		}
	}

	// 6th attempt should be blocked
	if rl.Allow(ip) {
		t.Error("6th attempt should be blocked")
	}

	// Different IP should still be allowed
	if !rl.Allow("10.0.0.1") {
		t.Error("different IP should be allowed")
	}

	// After clearing attempts (simulating time passage), should allow again
	rl.mu.Lock()
	rl.attempts[ip] = nil
	rl.mu.Unlock()

	if !rl.Allow(ip) {
		t.Error("should allow after reset")
	}
}
