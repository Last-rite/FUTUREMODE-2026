package auth

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/Ian747-tw/noxcat_game_backend/internal/domain"
	"github.com/golang-jwt/jwt/v5"
)

const testPlayerID = "11111111-1111-4111-8111-111111111111"

func newTestService(t *testing.T, now *time.Time) *Service {
	t.Helper()
	service, err := NewService(Config{
		Secret: []byte("0123456789abcdef0123456789abcdef"), Issuer: "noxcat-test",
		PasswordCost: bcryptTestCost, Now: func() time.Time { return *now },
	})
	if err != nil {
		t.Fatal(err)
	}
	return service
}

const bcryptTestCost = 4

func TestPasswordHashAndVerification(t *testing.T) {
	now := time.Date(2026, 9, 5, 0, 0, 0, 0, time.UTC)
	service := newTestService(t, &now)
	hash, err := service.HashPassword(context.Background(), "correct horse")
	if err != nil {
		t.Fatal(err)
	}
	if hash == "correct horse" {
		t.Fatal("password was not hashed")
	}
	if err := service.VerifyPassword(context.Background(), hash, "correct horse"); err != nil {
		t.Fatalf("verify correct password: %v", err)
	}
	if err := service.VerifyPassword(context.Background(), hash, "wrong password"); !errors.Is(err, domain.ErrInvalidCredentials) {
		t.Fatalf("wrong password error = %v", err)
	}
	if err := service.VerifyPassword(context.Background(), "not-a-bcrypt-hash", "password"); err == nil || errors.Is(err, domain.ErrInvalidCredentials) {
		t.Fatalf("corrupt stored hash must be internal, got %v", err)
	}
}

func TestIssueAndAuthenticateToken(t *testing.T) {
	now := time.Date(2026, 9, 5, 0, 0, 0, 0, time.UTC)
	service := newTestService(t, &now)
	token, err := service.IssueToken(context.Background(), domain.Player{ID: testPlayerID, Role: domain.PlayerRoleAdmin}, time.Hour)
	if err != nil {
		t.Fatal(err)
	}
	if token.AccessToken == "" || token.ExpiresIn != time.Hour {
		t.Fatalf("unexpected token: %+v", token)
	}
	principal, err := service.Authenticate(context.Background(), token.AccessToken)
	if err != nil {
		t.Fatal(err)
	}
	if principal.PlayerID != testPlayerID || principal.Role != domain.PlayerRoleAdmin {
		t.Fatalf("principal = %+v", principal)
	}
}

func TestAuthenticateRejectsUntrustedTokens(t *testing.T) {
	now := time.Date(2026, 9, 5, 0, 0, 0, 0, time.UTC)
	service := newTestService(t, &now)
	issued, err := service.IssueToken(context.Background(), domain.Player{ID: testPlayerID, Role: domain.PlayerRolePlayer}, time.Minute)
	if err != nil {
		t.Fatal(err)
	}

	tests := map[string]func() string{
		"malformed": func() string { return "not-a-jwt" },
		"tampered":  func() string { return issued.AccessToken + "x" },
		"expired":   func() string { now = now.Add(2 * time.Minute); return issued.AccessToken },
		"wrong algorithm": func() string {
			claims := Claims{PlayerID: testPlayerID, Role: domain.PlayerRolePlayer, RegisteredClaims: jwt.RegisteredClaims{
				Subject: testPlayerID, Issuer: "noxcat-test", ExpiresAt: jwt.NewNumericDate(now.Add(time.Hour)),
			}}
			token, signErr := jwt.NewWithClaims(jwt.SigningMethodHS384, claims).SignedString([]byte("0123456789abcdef0123456789abcdef"))
			if signErr != nil {
				t.Fatal(signErr)
			}
			return token
		},
	}
	for name, makeToken := range tests {
		t.Run(name, func(t *testing.T) {
			token := makeToken()
			if _, err := service.Authenticate(context.Background(), token); !errors.Is(err, domain.ErrUnauthorized) {
				t.Fatalf("error = %v", err)
			}
		})
	}
}

func TestAuthConfigurationAndCancellation(t *testing.T) {
	if _, err := NewService(Config{Secret: []byte("short")}); err == nil {
		t.Fatal("short secret accepted")
	}
	now := time.Now()
	service := newTestService(t, &now)
	if _, err := service.IssueToken(context.Background(), domain.Player{ID: "bad", Role: domain.PlayerRolePlayer}, time.Hour); !errors.Is(err, domain.ErrInvalidInput) {
		t.Fatalf("invalid player error = %v", err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := service.HashPassword(ctx, "password"); !errors.Is(err, context.Canceled) {
		t.Fatalf("cancellation error = %v", err)
	}
}
