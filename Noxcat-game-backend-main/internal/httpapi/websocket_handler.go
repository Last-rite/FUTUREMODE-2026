package httpapi

import "net/http"

func (s *Server) webSocket(w http.ResponseWriter, r *http.Request) {
	tokens := r.URL.Query()["token"]
	if len(tokens) != 1 || tokens[0] == "" {
		s.writeError(w, r, http.StatusUnauthorized, "unauthorized", "authentication is required")
		return
	}
	principal, ok := s.authenticateToken(w, r, tokens[0])
	if !ok {
		return
	}
	if s.webSockets == nil {
		s.writeInternalError(w, r, "websocket", unexpectedNil("WebSocket server"))
		return
	}
	s.webSockets.ServePlayer(w, r, principal.PlayerID)
}
