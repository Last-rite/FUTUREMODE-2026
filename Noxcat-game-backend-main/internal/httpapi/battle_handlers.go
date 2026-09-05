package httpapi

import (
	"errors"
	"net/http"
	"strings"

	"github.com/Ian747-tw/noxcat_game_backend/internal/domain"
)

type startBattleRequest struct {
	DungeonID string `json:"dungeon_id"`
}

func (s *Server) startBattle(w http.ResponseWriter, r *http.Request) {
	var request startBattleRequest
	if !s.decodeJSON(w, r, &request) {
		return
	}
	if !isUUID(request.DungeonID) {
		s.writeValidationError(w, r, map[string]string{"dungeon_id": "must be a canonical UUID"})
		return
	}
	principal, ok := s.requirePrincipal(w, r)
	if !ok {
		return
	}
	if s.battles == nil {
		s.writeInternalError(w, r, "start_battle", unexpectedNil("battle service"))
		return
	}
	start, err := s.battles.Start(r.Context(), principal.PlayerID, request.DungeonID)
	if err != nil {
		s.writeStoreError(w, r, opStartBattle, err)
		return
	}
	units := make([]unitResponse, len(start.Snapshot.Units))
	for index, unit := range start.Snapshot.Units {
		units[index] = toUnitResponse(unit)
	}
	s.writeJSON(w, http.StatusOK, map[string]any{
		"battle_seed": start.Token,
		"dungeon":     toDungeonResponse(start.Snapshot.Dungeon),
		"units":       units,
	})
}

func (s *Server) submitBattleResult(w http.ResponseWriter, r *http.Request) {
	var request BattleResultRequest
	if !s.decodeJSON(w, r, &request) {
		return
	}
	fields := make(map[string]string)
	if strings.TrimSpace(request.BattleSeed) == "" || len(request.BattleSeed) > 256 {
		fields["battle_seed"] = "is required and must not exceed 256 characters"
	}
	if request.UnitSnapshot == nil || len(request.UnitSnapshot) == 0 || len(request.UnitSnapshot) > 3 {
		fields["unit_snapshot"] = "must contain one to three units"
	}
	if len(request.ActionLog) > 10000 {
		fields["action_log"] = "must contain at most 10000 actions"
	}
	if request.ClaimedOutcome != "won" && request.ClaimedOutcome != "lost" {
		fields["claimed_outcome"] = "must be won or lost"
	}
	if len(fields) > 0 {
		s.writeValidationError(w, r, fields)
		return
	}
	principal, ok := s.requirePrincipal(w, r)
	if !ok {
		return
	}
	if s.battles == nil {
		s.writeInternalError(w, r, "submit_battle_result", unexpectedNil("battle service"))
		return
	}
	err := s.battles.Finish(r.Context(), principal.PlayerID, request)
	if errors.Is(err, domain.ErrBattleResultMismatch) {
		s.writeError(w, r, http.StatusUnprocessableEntity, "battle_result_mismatch", "battle result does not match battle session")
		return
	}
	if err != nil {
		s.writeStoreError(w, r, opSettleBattle, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

type cancelBattleRequest struct {
	BattleSeed string `json:"battle_seed"`
}

func (s *Server) cancelBattle(w http.ResponseWriter, r *http.Request) {
	var request cancelBattleRequest
	if !s.decodeJSON(w, r, &request) {
		return
	}
	if strings.TrimSpace(request.BattleSeed) == "" || len(request.BattleSeed) > 256 {
		s.writeValidationError(w, r, map[string]string{"battle_seed": "is required and must not exceed 256 characters"})
		return
	}
	principal, ok := s.requirePrincipal(w, r)
	if !ok {
		return
	}
	if s.battles == nil {
		s.writeInternalError(w, r, "cancel_battle", unexpectedNil("battle service"))
		return
	}
	if err := s.battles.Cancel(r.Context(), principal.PlayerID, request.BattleSeed); err != nil {
		if errors.Is(err, domain.ErrBattleResultMismatch) {
			s.writeError(w, r, http.StatusUnprocessableEntity, "battle_result_mismatch", "battle result does not match battle session")
			return
		}
		s.writeStoreError(w, r, opSettleBattle, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
