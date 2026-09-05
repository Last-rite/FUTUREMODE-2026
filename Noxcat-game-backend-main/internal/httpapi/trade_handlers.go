package httpapi

import (
	"net/http"

	"github.com/Ian747-tw/noxcat_game_backend/internal/domain"
)

type equipTreasureRequest struct {
	UnitID string `json:"unit_id"`
}

func (s *Server) equipTreasure(w http.ResponseWriter, r *http.Request) {
	treasureID := r.PathValue("treasure_id")
	var request equipTreasureRequest
	if !s.decodeJSON(w, r, &request) {
		return
	}
	fields := make(map[string]string)
	if !isUUID(treasureID) {
		fields["treasure_id"] = "must be a canonical UUID"
	}
	if !isUUID(request.UnitID) {
		fields["unit_id"] = "must be a canonical UUID"
	}
	if len(fields) > 0 {
		s.writeValidationError(w, r, fields)
		return
	}
	principal, ok := s.requirePrincipal(w, r)
	if !ok {
		return
	}
	if s.store == nil {
		s.writeInternalError(w, r, "equip_treasure", unexpectedNil("store"))
		return
	}
	if err := s.store.EquipTreasure(r.Context(), principal.PlayerID, treasureID, request.UnitID); err != nil {
		s.writeStoreError(w, r, opEquip, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) listTrades(w http.ResponseWriter, r *http.Request) {
	principal, ok := s.requirePrincipal(w, r)
	if !ok {
		return
	}
	var status *domain.TradeStatus
	if rawStatus := r.URL.Query().Get("status"); rawStatus != "" {
		parsed := domain.TradeStatus(rawStatus)
		if parsed != domain.TradeStatusPending && parsed != domain.TradeStatusAccepted && parsed != domain.TradeStatusRejected {
			s.writeValidationError(w, r, map[string]string{"status": "must be pending, accepted, or rejected"})
			return
		}
		status = &parsed
	}
	if s.store == nil {
		s.writeInternalError(w, r, "list_trades", unexpectedNil("store"))
		return
	}
	trades, err := s.store.ListPlayerTrades(r.Context(), principal.PlayerID, status)
	if err != nil {
		s.writeStoreError(w, r, opDefault, err)
		return
	}
	response := make([]tradeResponse, len(trades))
	for index, trade := range trades {
		response[index] = toTradeResponse(trade)
	}
	s.writeJSON(w, http.StatusOK, map[string]any{"trades": response})
}

type createTradeRequest struct {
	ToPlayerID string  `json:"to_player_id"`
	UnitID     *string `json:"unit_id"`
	TreasureID *string `json:"treasure_id"`
}

func (s *Server) createTrade(w http.ResponseWriter, r *http.Request) {
	var request createTradeRequest
	if !s.decodeJSON(w, r, &request) {
		return
	}
	fields := make(map[string]string)
	if !isUUID(request.ToPlayerID) {
		fields["to_player_id"] = "must be a canonical UUID"
	}
	if (request.UnitID == nil) == (request.TreasureID == nil) {
		fields["asset"] = "exactly one of unit_id and treasure_id is required"
	} else if request.UnitID != nil && !isUUID(*request.UnitID) {
		fields["unit_id"] = "must be a canonical UUID"
	} else if request.TreasureID != nil && !isUUID(*request.TreasureID) {
		fields["treasure_id"] = "must be a canonical UUID"
	}
	if len(fields) > 0 {
		s.writeValidationError(w, r, fields)
		return
	}
	principal, ok := s.requirePrincipal(w, r)
	if !ok {
		return
	}
	if request.ToPlayerID == principal.PlayerID {
		s.writeValidationError(w, r, map[string]string{"to_player_id": "must differ from the authenticated player"})
		return
	}
	if s.store == nil {
		s.writeInternalError(w, r, "create_trade", unexpectedNil("store"))
		return
	}
	trade, err := s.store.CreateTrade(r.Context(), domain.NewTrade{
		FromPlayerID: principal.PlayerID,
		ToPlayerID:   request.ToPlayerID,
		UnitID:       request.UnitID,
		TreasureID:   request.TreasureID,
	})
	if err != nil {
		s.writeStoreError(w, r, opCreateTrade, err)
		return
	}
	s.notifyTrade(trade.ToPlayerID, TradeCreated, trade)
	s.writeJSON(w, http.StatusCreated, map[string]any{"trade": toTradeResponse(trade)})
}

func (s *Server) acceptTrade(w http.ResponseWriter, r *http.Request) {
	s.changeTradeStatus(w, r, true)
}

func (s *Server) rejectTrade(w http.ResponseWriter, r *http.Request) {
	s.changeTradeStatus(w, r, false)
}

func (s *Server) changeTradeStatus(w http.ResponseWriter, r *http.Request, accept bool) {
	principal, ok := s.requirePrincipal(w, r)
	if !ok {
		return
	}
	tradeID := r.PathValue("trade_id")
	if !isUUID(tradeID) {
		s.writeValidationError(w, r, map[string]string{"trade_id": "must be a canonical UUID"})
		return
	}
	if s.store == nil {
		s.writeInternalError(w, r, "change_trade_status", unexpectedNil("store"))
		return
	}
	var trade domain.Trade
	var err error
	operation := opDefault
	if accept {
		operation = opAcceptTrade
		trade, err = s.store.AcceptTrade(r.Context(), tradeID, principal.PlayerID)
	} else {
		trade, err = s.store.RejectTrade(r.Context(), tradeID, principal.PlayerID)
	}
	if err != nil {
		s.writeStoreError(w, r, operation, err)
		return
	}
	if accept {
		s.notifyTrade(trade.FromPlayerID, TradeAccepted, trade)
	} else {
		s.notifyTrade(trade.FromPlayerID, TradeRejected, trade)
	}
	s.writeJSON(w, http.StatusOK, map[string]any{"trade": toTradeResponse(trade)})
}

func (s *Server) notifyTrade(playerID, eventType string, trade domain.Trade) {
	if s.tradeNotifier == nil {
		return
	}
	defer func() {
		if recovered := recover(); recovered != nil {
			s.logger.Error("trade notifier panicked", "player_id", playerID, "event", eventType, "panic", recovered)
		}
	}()
	s.tradeNotifier.NotifyTrade(playerID, TradeNotification{Type: eventType, Trade: trade})
}
