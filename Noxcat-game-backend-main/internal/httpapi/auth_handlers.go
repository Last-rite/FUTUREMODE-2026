package httpapi

import (
	"errors"
	"net/http"
	"regexp"
	"time"

	"github.com/Ian747-tw/noxcat_game_backend/internal/domain"
)

var usernamePattern = regexp.MustCompile(`^[A-Za-z0-9_]{3,32}$`)

type credentialsRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

func validateCredentials(request credentialsRequest) map[string]string {
	fields := make(map[string]string)
	if !usernamePattern.MatchString(request.Username) {
		fields["username"] = "must be 3 to 32 ASCII letters, digits, or underscores"
	}
	passwordLength := len([]byte(request.Password))
	if passwordLength < 8 || passwordLength > 72 {
		fields["password"] = "must be 8 to 72 bytes"
	}
	if len(fields) == 0 {
		return nil
	}
	return fields
}

func (s *Server) register(w http.ResponseWriter, r *http.Request) {
	var request credentialsRequest
	if !s.decodeJSON(w, r, &request) {
		return
	}
	if fields := validateCredentials(request); fields != nil {
		s.writeValidationError(w, r, fields)
		return
	}
	if s.auth == nil || s.store == nil {
		s.writeInternalError(w, r, "register", unexpectedNil("auth or store service"))
		return
	}
	passwordHash, err := s.auth.HashPassword(r.Context(), request.Password)
	if err != nil {
		s.writeInternalError(w, r, "hash_password", err)
		return
	}
	player, err := s.store.CreatePlayer(r.Context(), domain.NewPlayer{
		Username:      request.Username,
		PasswordHash:  passwordHash,
		StartingMoney: s.startingMoney,
		StartingUnits: append([]domain.NewUnit(nil), s.startingUnits...),
	})
	if err != nil {
		s.writeStoreError(w, r, opRegister, err)
		return
	}
	s.writeJSON(w, http.StatusCreated, map[string]any{"player": toPlayerResponse(player)})
}

func (s *Server) login(w http.ResponseWriter, r *http.Request) {
	var request credentialsRequest
	if !s.decodeJSON(w, r, &request) {
		return
	}
	if fields := validateCredentials(request); fields != nil {
		s.writeValidationError(w, r, fields)
		return
	}
	if s.auth == nil || s.store == nil {
		s.writeInternalError(w, r, "login", unexpectedNil("auth or store service"))
		return
	}
	player, err := s.store.PlayerByUsername(r.Context(), request.Username)
	if errors.Is(err, domain.ErrPlayerNotFound) {
		s.writeError(w, r, http.StatusUnauthorized, "invalid_credentials", "invalid username or password")
		return
	}
	if err != nil {
		s.writeStoreError(w, r, opDefault, err)
		return
	}
	if err := s.auth.VerifyPassword(r.Context(), player.PasswordHash, request.Password); err != nil {
		if errors.Is(err, domain.ErrInvalidCredentials) {
			s.writeError(w, r, http.StatusUnauthorized, "invalid_credentials", "invalid username or password")
			return
		}
		s.writeInternalError(w, r, "verify_password", err)
		return
	}
	if player.IsBanned {
		s.writeError(w, r, http.StatusForbidden, "player_banned", "player is banned")
		return
	}
	token, err := s.auth.IssueToken(r.Context(), player, s.tokenTTL)
	if err != nil {
		s.writeInternalError(w, r, "issue_token", err)
		return
	}
	expiresIn := token.ExpiresIn
	if expiresIn <= 0 {
		expiresIn = s.tokenTTL
	}
	s.writeJSON(w, http.StatusOK, map[string]any{
		"access_token": token.AccessToken,
		"token_type":   "Bearer",
		"expires_in":   int64(expiresIn / time.Second),
	})
}
