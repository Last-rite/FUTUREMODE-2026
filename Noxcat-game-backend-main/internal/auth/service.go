// Package auth implements password hashing and HS256 JWT authentication.
package auth

import (
	"context"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/Ian747-tw/noxcat_game_backend/internal/domain"
	"github.com/Ian747-tw/noxcat_game_backend/internal/httpapi"
	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
)

const minimumSecretBytes = 32

type Config struct {
	Secret       []byte
	Issuer       string
	PasswordCost int
	Now          func() time.Time
}

type Service struct {
	secret       []byte
	issuer       string
	passwordCost int
	now          func() time.Time
}

type Claims struct {
	PlayerID string            `json:"player_id"`
	Role     domain.PlayerRole `json:"role"`
	jwt.RegisteredClaims
}

func NewService(config Config) (*Service, error) {
	if len(config.Secret) < minimumSecretBytes {
		return nil, fmt.Errorf("JWT secret must contain at least %d bytes", minimumSecretBytes)
	}
	cost := config.PasswordCost
	if cost == 0 {
		cost = bcrypt.DefaultCost
	}
	if cost < bcrypt.MinCost || cost > bcrypt.MaxCost {
		return nil, errors.New("bcrypt cost is outside the supported range")
	}
	now := config.Now
	if now == nil {
		now = time.Now
	}
	return &Service{
		secret:       append([]byte(nil), config.Secret...),
		issuer:       config.Issuer,
		passwordCost: cost,
		now:          now,
	}, nil
}

func (s *Service) HashPassword(ctx context.Context, password string) (string, error) {
	if err := ctx.Err(); err != nil {
		return "", err
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(password), s.passwordCost)
	if err != nil {
		return "", fmt.Errorf("hash password: %w", err)
	}
	return string(hash), nil
}

func (s *Service) VerifyPassword(ctx context.Context, passwordHash, password string) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	err := bcrypt.CompareHashAndPassword([]byte(passwordHash), []byte(password))
	if errors.Is(err, bcrypt.ErrMismatchedHashAndPassword) {
		return domain.ErrInvalidCredentials
	}
	if err != nil {
		return fmt.Errorf("verify password hash: %w", err)
	}
	return nil
}

func (s *Service) IssueToken(ctx context.Context, player domain.Player, ttl time.Duration) (httpapi.Token, error) {
	if err := ctx.Err(); err != nil {
		return httpapi.Token{}, err
	}
	if !isCanonicalUUID(player.ID) || !validRole(player.Role) || ttl <= 0 {
		return httpapi.Token{}, domain.ErrInvalidInput
	}
	now := s.now().UTC()
	claims := Claims{
		PlayerID: player.ID,
		Role:     player.Role,
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    s.issuer,
			Subject:   player.ID,
			IssuedAt:  jwt.NewNumericDate(now),
			NotBefore: jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(ttl)),
		},
	}
	signed, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(s.secret)
	if err != nil {
		return httpapi.Token{}, fmt.Errorf("sign JWT: %w", err)
	}
	return httpapi.Token{AccessToken: signed, ExpiresIn: ttl}, nil
}

func (s *Service) Authenticate(ctx context.Context, tokenString string) (httpapi.Principal, error) {
	if err := ctx.Err(); err != nil {
		return httpapi.Principal{}, err
	}
	if tokenString == "" {
		return httpapi.Principal{}, domain.ErrUnauthorized
	}
	options := []jwt.ParserOption{
		jwt.WithValidMethods([]string{jwt.SigningMethodHS256.Alg()}),
		jwt.WithTimeFunc(s.now),
		jwt.WithExpirationRequired(),
	}
	if s.issuer != "" {
		options = append(options, jwt.WithIssuer(s.issuer))
	}
	claims := new(Claims)
	token, err := jwt.ParseWithClaims(tokenString, claims, func(token *jwt.Token) (any, error) {
		if token.Method != jwt.SigningMethodHS256 {
			return nil, domain.ErrUnauthorized
		}
		return s.secret, nil
	}, options...)
	if err != nil || token == nil || !token.Valid || claims.Subject != claims.PlayerID ||
		!isCanonicalUUID(claims.PlayerID) || !validRole(claims.Role) {
		return httpapi.Principal{}, domain.ErrUnauthorized
	}
	return httpapi.Principal{PlayerID: claims.PlayerID, Role: claims.Role}, nil
}

func validRole(role domain.PlayerRole) bool {
	return role == domain.PlayerRolePlayer || role == domain.PlayerRoleAdmin
}

func isCanonicalUUID(value string) bool {
	if len(value) != 36 || value != strings.ToLower(value) ||
		value[8] != '-' || value[13] != '-' || value[18] != '-' || value[23] != '-' {
		return false
	}
	_, err := hex.DecodeString(strings.ReplaceAll(value, "-", ""))
	return err == nil
}

var _ httpapi.AuthService = (*Service)(nil)
