package httpapi

import (
	"bufio"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime"
	"net"
	"net/http"
	"strings"
	"time"

	"github.com/Ian747-tw/noxcat_game_backend/internal/domain"
)

type errorEnvelope struct {
	Error apiError `json:"error"`
}

type apiError struct {
	Code      string            `json:"code"`
	Message   string            `json:"message"`
	Fields    map[string]string `json:"fields,omitempty"`
	RequestID string            `json:"request_id,omitempty"`
}

func (s *Server) writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(value); err != nil {
		s.logger.Error("encode HTTP response", "error", err)
	}
}

func (s *Server) writeError(w http.ResponseWriter, r *http.Request, status int, code, message string) {
	s.writeErrorFields(w, r, status, code, message, nil)
}

func (s *Server) writeErrorFields(w http.ResponseWriter, r *http.Request, status int, code, message string, fields map[string]string) {
	s.writeJSON(w, status, errorEnvelope{Error: apiError{
		Code:      code,
		Message:   message,
		Fields:    fields,
		RequestID: requestIDFromContext(r.Context()),
	}})
}

func (s *Server) decodeJSON(w http.ResponseWriter, r *http.Request, destination any) bool {
	mediaType, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if err != nil || mediaType != "application/json" {
		s.writeError(w, r, http.StatusBadRequest, "invalid_request", "Content-Type must be application/json")
		return false
	}

	r.Body = http.MaxBytesReader(w, r.Body, s.maxBodyBytes)
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(destination); err != nil {
		message := "request body contains invalid JSON"
		var maxBytesError *http.MaxBytesError
		if errors.As(err, &maxBytesError) {
			message = "request body is too large"
		} else if errors.Is(err, io.EOF) {
			message = "request body is required"
		} else if strings.HasPrefix(err.Error(), "json: unknown field ") {
			message = err.Error()
		}
		s.writeError(w, r, http.StatusBadRequest, "invalid_request", message)
		return false
	}
	if err := decoder.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
		s.writeError(w, r, http.StatusBadRequest, "invalid_request", "request body must contain one JSON object")
		return false
	}
	return true
}

func (s *Server) requestIDMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requestID := r.Header.Get("X-Request-ID")
		if requestID == "" || len(requestID) > 128 {
			var bytes [16]byte
			if _, err := rand.Read(bytes[:]); err != nil {
				requestID = "unavailable"
			} else {
				requestID = hex.EncodeToString(bytes[:])
			}
		}
		w.Header().Set("X-Request-ID", requestID)
		ctx := context.WithValue(r.Context(), requestIDContextKey{}, requestID)
		ctx = context.WithValue(ctx, requestStartedContextKey{}, time.Now())
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func (s *Server) recoverMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if recovered := recover(); recovered != nil {
				s.logger.Error("panic in HTTP handler", "request_id", requestIDFromContext(r.Context()), "panic", recovered)
				if state, ok := w.(*responseState); !ok || !state.wroteHeader {
					s.writeError(w, r, http.StatusInternalServerError, "internal_error", "an internal error occurred")
				}
			}
		}()
		next.ServeHTTP(w, r)
	})
}

type responseState struct {
	http.ResponseWriter
	status      int
	wroteHeader bool
}

func (w *responseState) Unwrap() http.ResponseWriter { return w.ResponseWriter }

// Hijack preserves WebSocket support through the access-log wrapper. Once the
// connection is hijacked, net/http no longer writes a status through this
// ResponseWriter, so record the protocol-switch status here for access logs.
func (w *responseState) Hijack() (net.Conn, *bufio.ReadWriter, error) {
	hijacker, ok := w.ResponseWriter.(http.Hijacker)
	if !ok {
		return nil, nil, errors.New("HTTP response writer does not support hijacking")
	}
	connection, buffered, err := hijacker.Hijack()
	if err == nil {
		w.status = http.StatusSwitchingProtocols
		w.wroteHeader = true
	}
	return connection, buffered, err
}

func (w *responseState) WriteHeader(status int) {
	if w.wroteHeader {
		return
	}
	w.status = status
	w.wroteHeader = true
	w.ResponseWriter.WriteHeader(status)
}

func (w *responseState) Write(body []byte) (int, error) {
	if !w.wroteHeader {
		w.WriteHeader(http.StatusOK)
	}
	return w.ResponseWriter.Write(body)
}

func (s *Server) accessLogMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		started := time.Now()
		state := &responseState{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(state, r)
		principal, _ := r.Context().Value(principalContextKey{}).(Principal)
		s.logger.Info("HTTP request", "request_id", requestIDFromContext(r.Context()),
			"method", r.Method, "route", r.URL.Path, "status", state.status,
			"duration", time.Since(started), "player_id", principal.PlayerID, "role", principal.Role)
	})
}

func (s *Server) requirePrincipal(w http.ResponseWriter, r *http.Request) (Principal, bool) {
	header := r.Header.Get("Authorization")
	parts := strings.Split(header, " ")
	if len(parts) != 2 || parts[0] != "Bearer" || parts[1] == "" {
		s.writeError(w, r, http.StatusUnauthorized, "unauthorized", "authentication is required")
		return Principal{}, false
	}
	return s.authenticateToken(w, r, parts[1])
}

func (s *Server) authenticateToken(w http.ResponseWriter, r *http.Request, token string) (Principal, bool) {
	if s.auth == nil {
		s.writeInternalError(w, r, "authenticate", errors.New("auth service is not configured"))
		return Principal{}, false
	}
	principal, err := s.auth.Authenticate(r.Context(), token)
	if errors.Is(err, domain.ErrUnauthorized) || errors.Is(err, domain.ErrInvalidCredentials) {
		s.writeError(w, r, http.StatusUnauthorized, "unauthorized", "authentication is required")
		return Principal{}, false
	}
	if err != nil {
		s.writeInternalError(w, r, "authenticate", err)
		return Principal{}, false
	}
	if !isUUID(principal.PlayerID) || (principal.Role != domain.PlayerRolePlayer && principal.Role != domain.PlayerRoleAdmin) {
		s.writeInternalError(w, r, "authenticate", errors.New("auth service returned invalid principal"))
		return Principal{}, false
	}
	*r = *r.WithContext(context.WithValue(r.Context(), principalContextKey{}, principal))
	return principal, true
}

func (s *Server) requireAdmin(w http.ResponseWriter, r *http.Request) (Principal, bool) {
	principal, ok := s.requirePrincipal(w, r)
	if !ok {
		return Principal{}, false
	}
	if principal.Role != domain.PlayerRoleAdmin {
		s.writeError(w, r, http.StatusForbidden, "forbidden", "admin role is required")
		return Principal{}, false
	}
	return principal, true
}

func (s *Server) authorizePlayerPath(w http.ResponseWriter, r *http.Request) (Principal, string, bool) {
	principal, ok := s.requirePrincipal(w, r)
	if !ok {
		return Principal{}, "", false
	}
	playerID := r.PathValue("player_id")
	if !isUUID(playerID) {
		s.writeValidationError(w, r, map[string]string{"player_id": "must be a canonical UUID"})
		return Principal{}, "", false
	}
	if principal.Role != domain.PlayerRoleAdmin && principal.PlayerID != playerID {
		s.writeError(w, r, http.StatusForbidden, "forbidden", "access to this player is forbidden")
		return Principal{}, "", false
	}
	return principal, playerID, true
}

func (s *Server) writeValidationError(w http.ResponseWriter, r *http.Request, fields map[string]string) {
	s.writeErrorFields(w, r, http.StatusBadRequest, "invalid_request", "request validation failed", fields)
}

func (s *Server) writeInternalError(w http.ResponseWriter, r *http.Request, operation string, err error) {
	principal, _ := r.Context().Value(principalContextKey{}).(Principal)
	started, _ := r.Context().Value(requestStartedContextKey{}).(time.Time)
	duration := time.Duration(0)
	if !started.IsZero() {
		duration = time.Since(started)
	}
	s.logger.Error("HTTP operation failed", "request_id", requestIDFromContext(r.Context()),
		"method", r.Method, "route", r.URL.Path, "status", http.StatusInternalServerError,
		"duration", duration, "player_id", principal.PlayerID, "role", principal.Role,
		"operation", operation, "error", err)
	s.writeError(w, r, http.StatusInternalServerError, "internal_error", "an internal error occurred")
}

func isUUID(value string) bool {
	if len(value) != 36 || value != strings.ToLower(value) || value[8] != '-' || value[13] != '-' || value[18] != '-' || value[23] != '-' {
		return false
	}
	compact := strings.ReplaceAll(value, "-", "")
	_, err := hex.DecodeString(compact)
	return err == nil
}

func validateNoDuplicateUUIDs(values []string) map[string]string {
	seen := make(map[string]struct{}, len(values))
	for _, value := range values {
		if !isUUID(value) {
			return map[string]string{"unit_ids": "must contain only canonical UUIDs"}
		}
		if _, exists := seen[value]; exists {
			return map[string]string{"unit_ids": "must not contain duplicate IDs"}
		}
		seen[value] = struct{}{}
	}
	return nil
}

func unexpectedNil(name string) error {
	return fmt.Errorf("%s is not configured", name)
}
