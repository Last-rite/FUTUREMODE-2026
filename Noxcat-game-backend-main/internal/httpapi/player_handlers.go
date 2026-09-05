package httpapi

import (
	"net/http"

	"github.com/Ian747-tw/noxcat_game_backend/internal/domain"
)

func (s *Server) listUnits(w http.ResponseWriter, r *http.Request) {
	_, playerID, ok := s.authorizePlayerPath(w, r)
	if !ok {
		return
	}
	if s.store == nil {
		s.writeInternalError(w, r, "list_units", unexpectedNil("store"))
		return
	}
	units, err := s.store.ListPlayerUnits(r.Context(), playerID)
	if err != nil {
		s.writeStoreError(w, r, opDefault, err)
		return
	}
	response := make([]unitResponse, len(units))
	for index, unit := range units {
		response[index] = toUnitResponse(unit)
	}
	s.writeJSON(w, http.StatusOK, map[string]any{"units": response})
}

type setLoadoutRequest struct {
	UnitIDs *[]string `json:"unit_ids"`
}

func (s *Server) setLoadout(w http.ResponseWriter, r *http.Request) {
	var request setLoadoutRequest
	if !s.decodeJSON(w, r, &request) {
		return
	}
	if request.UnitIDs == nil {
		s.writeValidationError(w, r, map[string]string{"unit_ids": "is required and must be an array"})
		return
	}
	if len(*request.UnitIDs) > 3 {
		s.writeValidationError(w, r, map[string]string{"unit_ids": "must contain at most three IDs"})
		return
	}
	if fields := validateNoDuplicateUUIDs(*request.UnitIDs); fields != nil {
		s.writeValidationError(w, r, fields)
		return
	}
	_, playerID, ok := s.authorizePlayerPath(w, r)
	if !ok {
		return
	}
	if s.store == nil {
		s.writeInternalError(w, r, "set_loadout", unexpectedNil("store"))
		return
	}
	if err := s.store.SetBattleLoadout(r.Context(), playerID, *request.UnitIDs); err != nil {
		s.writeStoreError(w, r, opSetLoadout, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) playerStatus(w http.ResponseWriter, r *http.Request) {
	_, playerID, ok := s.authorizePlayerPath(w, r)
	if !ok {
		return
	}
	if s.store == nil {
		s.writeInternalError(w, r, "player_status", unexpectedNil("store"))
		return
	}
	status, err := s.store.PlayerStatus(r.Context(), playerID)
	if err != nil {
		s.writeStoreError(w, r, opDefault, err)
		return
	}
	s.writeJSON(w, http.StatusOK, map[string]domain.PlayerStatus{"status": status})
}

func (s *Server) listSolvedDungeons(w http.ResponseWriter, r *http.Request) {
	_, playerID, ok := s.authorizePlayerPath(w, r)
	if !ok {
		return
	}
	if s.store == nil {
		s.writeInternalError(w, r, "list_solved_dungeons", unexpectedNil("store"))
		return
	}
	dungeons, err := s.store.ListSolvedDungeons(r.Context(), playerID)
	if err != nil {
		s.writeStoreError(w, r, opDefault, err)
		return
	}
	response := make([]dungeonResponse, len(dungeons))
	for index, dungeon := range dungeons {
		response[index] = toDungeonResponse(dungeon)
	}
	s.writeJSON(w, http.StatusOK, map[string]any{"dungeons": response})
}
