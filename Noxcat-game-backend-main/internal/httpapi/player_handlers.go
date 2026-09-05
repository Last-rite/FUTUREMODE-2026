package httpapi

import (
	"net/http"
	"strconv"

	"github.com/Ian747-tw/noxcat_game_backend/internal/domain"
)

func (s *Server) getPlayer(w http.ResponseWriter, r *http.Request) {
	_, playerID, ok := s.authorizePlayerPath(w, r)
	if !ok {
		return
	}
	if s.store == nil {
		s.writeInternalError(w, r, "get_player", unexpectedNil("store"))
		return
	}
	player, err := s.store.PlayerByID(r.Context(), playerID)
	if err != nil {
		s.writeStoreError(w, r, opDefault, err)
		return
	}
	s.writeJSON(w, http.StatusOK, map[string]any{"player": toPlayerResponse(player)})
}

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

func (s *Server) listTreasures(w http.ResponseWriter, r *http.Request) {
	_, playerID, ok := s.authorizePlayerPath(w, r)
	if !ok {
		return
	}
	if s.store == nil {
		s.writeInternalError(w, r, "list_treasures", unexpectedNil("store"))
		return
	}
	treasures, err := s.store.ListPlayerTreasures(r.Context(), playerID)
	if err != nil {
		s.writeStoreError(w, r, opDefault, err)
		return
	}
	response := make([]treasureResponse, len(treasures))
	for index, treasure := range treasures {
		response[index] = toTreasureResponse(treasure)
	}
	s.writeJSON(w, http.StatusOK, map[string]any{"treasures": response})
}

func (s *Server) listLoadouts(w http.ResponseWriter, r *http.Request) {
	_, playerID, ok := s.authorizePlayerPath(w, r)
	if !ok {
		return
	}
	if s.store == nil {
		s.writeInternalError(w, r, "list_loadouts", unexpectedNil("store"))
		return
	}
	loadouts, err := s.store.ListPlayerLoadouts(r.Context(), playerID)
	if err != nil {
		s.writeStoreError(w, r, opDefault, err)
		return
	}
	response := make([]loadoutResponse, len(loadouts))
	for index, loadout := range loadouts {
		response[index] = toLoadoutResponse(loadout)
	}
	s.writeJSON(w, http.StatusOK, map[string]any{"loadouts": response})
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

func (s *Server) setLoadoutSlot(w http.ResponseWriter, r *http.Request) {
	request, ok := s.decodeLoadoutRequest(w, r)
	if !ok {
		return
	}
	slot, err := strconv.Atoi(r.PathValue("slot"))
	if err != nil || slot < 1 || slot > 5 {
		s.writeValidationError(w, r, map[string]string{"slot": "must be an integer from 1 to 5"})
		return
	}
	_, playerID, ok := s.authorizePlayerPath(w, r)
	if !ok {
		return
	}
	if s.store == nil {
		s.writeInternalError(w, r, "set_loadout_slot", unexpectedNil("store"))
		return
	}
	if err := s.store.SetPlayerLoadout(r.Context(), playerID, slot, request); err != nil {
		s.writeStoreError(w, r, opSetLoadout, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

type setActiveLoadoutRequest struct {
	Slot *int `json:"slot"`
}

func (s *Server) setActiveLoadout(w http.ResponseWriter, r *http.Request) {
	var request setActiveLoadoutRequest
	if !s.decodeJSON(w, r, &request) {
		return
	}
	if request.Slot == nil || *request.Slot < 1 || *request.Slot > 5 {
		s.writeValidationError(w, r, map[string]string{"slot": "is required and must be an integer from 1 to 5"})
		return
	}
	_, playerID, ok := s.authorizePlayerPath(w, r)
	if !ok {
		return
	}
	if s.store == nil {
		s.writeInternalError(w, r, "set_active_loadout", unexpectedNil("store"))
		return
	}
	if err := s.store.SetActivePlayerLoadout(r.Context(), playerID, *request.Slot); err != nil {
		s.writeStoreError(w, r, opSetLoadout, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) decodeLoadoutRequest(w http.ResponseWriter, r *http.Request) ([]string, bool) {
	var request setLoadoutRequest
	if !s.decodeJSON(w, r, &request) {
		return nil, false
	}
	if request.UnitIDs == nil {
		s.writeValidationError(w, r, map[string]string{"unit_ids": "is required and must be an array"})
		return nil, false
	}
	if len(*request.UnitIDs) > 3 {
		s.writeValidationError(w, r, map[string]string{"unit_ids": "must contain at most three IDs"})
		return nil, false
	}
	if fields := validateNoDuplicateUUIDs(*request.UnitIDs); fields != nil {
		s.writeValidationError(w, r, fields)
		return nil, false
	}
	return *request.UnitIDs, true
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

func (s *Server) listDungeons(w http.ResponseWriter, r *http.Request) {
	if _, ok := s.requirePrincipal(w, r); !ok {
		return
	}
	if s.store == nil {
		s.writeInternalError(w, r, "list_dungeons", unexpectedNil("store"))
		return
	}
	dungeons, err := s.store.ListDungeons(r.Context())
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
