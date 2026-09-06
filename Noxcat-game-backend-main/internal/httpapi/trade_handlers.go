package httpapi

import (
	"net/http"
	"strconv"
	"strings"

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

func (s *Server) unequipTreasure(w http.ResponseWriter, r *http.Request) {
	treasureID := r.PathValue("treasure_id")
	if !isUUID(treasureID) {
		s.writeValidationError(w, r, map[string]string{"treasure_id": "must be a canonical UUID"})
		return
	}
	principal, ok := s.requirePrincipal(w, r)
	if !ok {
		return
	}
	if s.store == nil {
		s.writeInternalError(w, r, "unequip_treasure", unexpectedNil("store"))
		return
	}
	if err := s.store.UnequipTreasure(r.Context(), principal.PlayerID, treasureID); err != nil {
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
		if parsed != domain.TradeStatusPending && parsed != domain.TradeStatusAccepted && parsed != domain.TradeStatusRejected && parsed != domain.TradeStatusCancelled {
			s.writeValidationError(w, r, map[string]string{"status": "must be pending, accepted, rejected, or cancelled"})
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
	ToPlayerID      string                    `json:"to_player_id"`
	UnitID          *string                   `json:"unit_id"`
	TreasureID      *string                   `json:"treasure_id"`
	RequestedAssets []createTradeAssetRequest `json:"requested_assets"`
}

type createTradeAssetRequest struct {
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
	requestedAssets := make([]domain.TradeAsset, len(request.RequestedAssets))
	requestedUnitCount := 0
	requestedTreasureCount := 0
	requestedIDs := make(map[string]struct{}, len(request.RequestedAssets))
	if len(request.RequestedAssets) > 10 {
		fields["requested_assets"] = "must contain at most 10 assets"
	}
	for index, asset := range request.RequestedAssets {
		key := "requested_assets[" + strconv.Itoa(index) + "]"
		if (asset.UnitID == nil) == (asset.TreasureID == nil) {
			fields[key] = "exactly one of unit_id and treasure_id is required"
			continue
		}
		var id string
		if asset.UnitID != nil {
			requestedUnitCount++
			id = *asset.UnitID
		} else {
			requestedTreasureCount++
			id = *asset.TreasureID
		}
		if !isUUID(id) {
			fields[key] = "asset id must be a canonical UUID"
			continue
		}
		if _, duplicate := requestedIDs[id]; duplicate {
			fields[key] = "asset id must be unique"
		}
		requestedIDs[id] = struct{}{}
		requestedAssets[index] = domain.TradeAsset{UnitID: asset.UnitID, TreasureID: asset.TreasureID}
	}
	if requestedUnitCount > 1 || (requestedUnitCount > 0 && requestedTreasureCount > 0) {
		fields["requested_assets"] = "must be one unit or up to 10 treasures"
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
		FromPlayerID:    principal.PlayerID,
		ToPlayerID:      request.ToPlayerID,
		UnitID:          request.UnitID,
		TreasureID:      request.TreasureID,
		RequestedAssets: requestedAssets,
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

func (s *Server) cancelTrade(w http.ResponseWriter, r *http.Request) {
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
		s.writeInternalError(w, r, "cancel_trade", unexpectedNil("store"))
		return
	}
	trade, err := s.store.CancelTrade(r.Context(), tradeID, principal.PlayerID)
	if err != nil {
		s.writeStoreError(w, r, opDefault, err)
		return
	}
	s.notifyTrade(trade.ToPlayerID, TradeCancelled, trade)
	s.writeJSON(w, http.StatusOK, map[string]any{"trade": toTradeResponse(trade)})
}

func (s *Server) listTradeAssets(w http.ResponseWriter, r *http.Request) {
	if _, ok := s.requirePrincipal(w, r); !ok {
		return
	}
	if s.store == nil {
		s.writeInternalError(w, r, "list_trade_assets", unexpectedNil("store"))
		return
	}
	identifier := strings.TrimSpace(r.PathValue("player"))
	var player domain.Player
	var err error
	if isUUID(identifier) {
		player, err = s.store.PlayerByID(r.Context(), identifier)
	} else {
		if !usernamePattern.MatchString(identifier) {
			s.writeValidationError(w, r, map[string]string{"player": "must be a username or canonical UUID"})
			return
		}
		player, err = s.store.PlayerByUsername(r.Context(), identifier)
	}
	if err != nil {
		s.writeStoreError(w, r, opDefault, err)
		return
	}
	inventory, err := s.store.ListTradeAssets(r.Context(), player.ID)
	if err != nil {
		s.writeStoreError(w, r, opDefault, err)
		return
	}
	units := make([]unitResponse, len(inventory.Units))
	for index, unit := range inventory.Units {
		units[index] = toUnitResponse(unit)
	}
	treasures := make([]treasureResponse, len(inventory.Treasures))
	for index, treasure := range inventory.Treasures {
		treasures[index] = toTreasureResponse(treasure)
	}
	s.writeJSON(w, http.StatusOK, map[string]any{
		"player":    map[string]string{"id": player.ID, "username": player.Username},
		"units":     units,
		"treasures": treasures,
	})
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
