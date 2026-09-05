package httpapi

import (
	"bytes"
	"encoding/json"
	"net/http"
	"strings"

	"github.com/Ian747-tw/noxcat_game_backend/internal/domain"
)

type dungeonRequest struct {
	Name        string          `json:"name"`
	SortOrder   int             `json:"sort_order"`
	EnemyConfig json.RawMessage `json:"enemy_config"`
	RewardMoney int             `json:"reward_money"`
	RewardDrops json.RawMessage `json:"reward_drops"`
}

func validateDungeonRequest(request dungeonRequest) map[string]string {
	fields := make(map[string]string)
	if strings.TrimSpace(request.Name) == "" || len(request.Name) > 100 {
		fields["name"] = "is required and must not exceed 100 characters"
	}
	if !validJSONArray(request.EnemyConfig, false) {
		fields["enemy_config"] = "is required and must be a JSON array with at most 100 entries"
	}
	if request.RewardMoney < 0 {
		fields["reward_money"] = "must not be negative"
	}
	if request.SortOrder < 0 {
		fields["sort_order"] = "must not be negative"
	}
	if len(request.RewardDrops) > 0 && !bytes.Equal(bytes.TrimSpace(request.RewardDrops), []byte("null")) && !validJSONArray(request.RewardDrops, true) {
		fields["reward_drops"] = "must be null or a JSON array with at most 100 entries"
	}
	if len(fields) == 0 {
		return nil
	}
	return fields
}

func validJSONArray(raw json.RawMessage, allowEmpty bool) bool {
	var values []json.RawMessage
	if len(raw) == 0 || json.Unmarshal(raw, &values) != nil || values == nil || len(values) > 100 {
		return false
	}
	return allowEmpty || len(values) > 0
}

func (request dungeonRequest) domainDungeon(id string) domain.Dungeon {
	return domain.Dungeon{
		ID: id, Name: request.Name, SortOrder: request.SortOrder, EnemyConfig: request.EnemyConfig,
		RewardMoney: request.RewardMoney, RewardDrops: request.RewardDrops,
	}
}

func (s *Server) createDungeon(w http.ResponseWriter, r *http.Request) {
	if _, ok := s.requireAdmin(w, r); !ok {
		return
	}
	var request dungeonRequest
	if !s.decodeJSON(w, r, &request) {
		return
	}
	if fields := validateDungeonRequest(request); fields != nil {
		s.writeValidationError(w, r, fields)
		return
	}
	if s.store == nil {
		s.writeInternalError(w, r, "create_dungeon", unexpectedNil("store"))
		return
	}
	dungeon, err := s.store.CreateDungeon(r.Context(), request.domainDungeon(""))
	if err != nil {
		s.writeStoreError(w, r, opDefault, err)
		return
	}
	s.writeJSON(w, http.StatusCreated, map[string]any{"dungeon": toDungeonResponse(dungeon)})
}

func (s *Server) updateDungeon(w http.ResponseWriter, r *http.Request) {
	if _, ok := s.requireAdmin(w, r); !ok {
		return
	}
	dungeonID := r.PathValue("dungeon_id")
	if !isUUID(dungeonID) {
		s.writeValidationError(w, r, map[string]string{"dungeon_id": "must be a canonical UUID"})
		return
	}
	var request dungeonRequest
	if !s.decodeJSON(w, r, &request) {
		return
	}
	if fields := validateDungeonRequest(request); fields != nil {
		s.writeValidationError(w, r, fields)
		return
	}
	if s.store == nil {
		s.writeInternalError(w, r, "update_dungeon", unexpectedNil("store"))
		return
	}
	dungeon, err := s.store.UpdateDungeon(r.Context(), request.domainDungeon(dungeonID))
	if err != nil {
		s.writeStoreError(w, r, opDefault, err)
		return
	}
	s.writeJSON(w, http.StatusOK, map[string]any{"dungeon": toDungeonResponse(dungeon)})
}

func (s *Server) banPlayer(w http.ResponseWriter, r *http.Request) {
	if _, ok := s.requireAdmin(w, r); !ok {
		return
	}
	playerID := r.PathValue("player_id")
	if !isUUID(playerID) {
		s.writeValidationError(w, r, map[string]string{"player_id": "must be a canonical UUID"})
		return
	}
	if s.store == nil {
		s.writeInternalError(w, r, "ban_player", unexpectedNil("store"))
		return
	}
	if err := s.store.BanPlayer(r.Context(), playerID); err != nil {
		s.writeStoreError(w, r, opDefault, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

type adjustMoneyRequest struct {
	Delta *int `json:"delta"`
}

func (s *Server) adjustPlayerMoney(w http.ResponseWriter, r *http.Request) {
	if _, ok := s.requireAdmin(w, r); !ok {
		return
	}
	playerID := r.PathValue("player_id")
	if !isUUID(playerID) {
		s.writeValidationError(w, r, map[string]string{"player_id": "must be a canonical UUID"})
		return
	}
	var request adjustMoneyRequest
	if !s.decodeJSON(w, r, &request) {
		return
	}
	if request.Delta == nil || *request.Delta == 0 || *request.Delta < -1_000_000 || *request.Delta > 1_000_000 {
		s.writeValidationError(w, r, map[string]string{"delta": "is required, non-zero, and must be between -1000000 and 1000000"})
		return
	}
	if s.store == nil {
		s.writeInternalError(w, r, "adjust_player_money", unexpectedNil("store"))
		return
	}
	if err := s.store.AdjustPlayerMoney(r.Context(), playerID, *request.Delta); err != nil {
		s.writeStoreError(w, r, opAdjustMoney, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
