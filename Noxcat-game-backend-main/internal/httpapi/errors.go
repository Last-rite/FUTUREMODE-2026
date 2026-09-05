package httpapi

import (
	"context"
	"errors"
	"net/http"
	"strings"

	"github.com/Ian747-tw/noxcat_game_backend/internal/domain"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

type operation string

const (
	opDefault      operation = "default"
	opRegister     operation = "register"
	opStartBattle  operation = "start_battle"
	opSetLoadout   operation = "set_loadout"
	opEquip        operation = "equip_treasure"
	opCreateTrade  operation = "create_trade"
	opAcceptTrade  operation = "accept_trade"
	opSettleBattle operation = "settle_battle"
	opAdjustMoney  operation = "adjust_money"
)

func (s *Server) writeStoreError(w http.ResponseWriter, r *http.Request, operation operation, err error) {
	if err == nil {
		return
	}

	// Operation-specific state errors take precedence over global guard rules.
	switch {
	case operation == opStartBattle && errors.Is(err, domain.ErrInvalidUnitSelection):
		s.writeError(w, r, http.StatusConflict, "battle_loadout_unavailable", "battle loadout has no available units")
		return
	case (operation == opEquip || operation == opSetLoadout || operation == opCreateTrade) && errors.Is(err, domain.ErrAssetNotOwned):
		s.writeError(w, r, http.StatusForbidden, "asset_not_owned", "asset is not owned by player")
		return
	case operation == opAcceptTrade && errors.Is(err, domain.ErrAssetNotOwned):
		s.writeError(w, r, http.StatusConflict, "trade_asset_unavailable", "trade asset is no longer available")
		return
	case operation == opSettleBattle && errors.Is(err, domain.ErrAssetNotOwned):
		s.writeError(w, r, http.StatusConflict, "battle_state_changed", "battle unit ownership changed")
		return
	case operation == opAdjustMoney && errors.Is(err, domain.ErrInvalidInput):
		s.writeError(w, r, http.StatusConflict, "insufficient_balance", "adjustment would make the balance negative")
		return
	}

	type mapping struct {
		target  error
		status  int
		code    string
		message string
	}
	mappings := []mapping{
		{domain.ErrPlayerNotFound, http.StatusNotFound, "player_not_found", "player not found"},
		{domain.ErrUnitNotFound, http.StatusNotFound, "unit_not_found", "unit not found"},
		{domain.ErrTreasureNotFound, http.StatusNotFound, "treasure_not_found", "treasure not found"},
		{domain.ErrDungeonNotFound, http.StatusNotFound, "dungeon_not_found", "dungeon not found"},
		{domain.ErrTradeNotFound, http.StatusNotFound, "trade_not_found", "trade not found"},
		{domain.ErrUsernameTaken, http.StatusConflict, "username_taken", "username already exists"},
		{domain.ErrPlayerBanned, http.StatusForbidden, "player_banned", "player is banned"},
		{domain.ErrPlayerBusy, http.StatusConflict, "player_busy", "player is not idle"},
		{domain.ErrPlayerNotInCombat, http.StatusConflict, "player_not_in_combat", "player is not in combat"},
		{domain.ErrTradeNotPending, http.StatusConflict, "trade_not_pending", "trade is not pending"},
		{domain.ErrTradeRecipient, http.StatusForbidden, "invalid_trade_recipient", "player is not the trade recipient"},
		{domain.ErrAlreadyEquipped, http.StatusConflict, "already_equipped", "treasure is equipped to another unit"},
		{domain.ErrBattleLoadoutFull, http.StatusConflict, "battle_loadout_full", "battle loadout already has three units"},
		{domain.ErrUnitUnavailable, http.StatusConflict, "unit_unavailable", "unit is not alive and available"},
		{domain.ErrBattleExpired, http.StatusConflict, "battle_expired", "battle session has expired"},
		{domain.ErrBattleNotActive, http.StatusConflict, "battle_not_active", "battle session is not active"},
	}
	for _, candidate := range mappings {
		if errors.Is(err, candidate.target) {
			if operation == opRegister && errors.Is(err, domain.ErrBattleLoadoutFull) {
				break
			}
			s.writeError(w, r, candidate.status, candidate.code, candidate.message)
			return
		}
	}

	if errors.Is(err, context.DeadlineExceeded) {
		s.writeError(w, r, http.StatusGatewayTimeout, "timeout", "request timed out")
		return
	}
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		if pgErr.Code == "40P01" {
			s.writeError(w, r, http.StatusServiceUnavailable, "temporarily_unavailable", "service is temporarily unavailable")
			return
		}
		if strings.HasPrefix(pgErr.Code, "08") {
			s.writeError(w, r, http.StatusServiceUnavailable, "service_unavailable", "database service is unavailable")
			return
		}
	}
	if errors.Is(err, pgx.ErrNoRows) || errors.Is(err, domain.ErrNotFound) ||
		errors.Is(err, domain.ErrInvalidInput) || errors.Is(err, domain.ErrInvalidTradeAsset) ||
		errors.Is(err, domain.ErrInvalidUnitSelection) || errors.Is(err, domain.ErrAssetNotOwned) {
		s.writeInternalError(w, r, string(operation), err)
		return
	}
	s.writeInternalError(w, r, string(operation), err)
}
