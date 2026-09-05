package httpapi

import (
	"encoding/json"
	"time"

	"github.com/Ian747-tw/noxcat_game_backend/internal/domain"
)

type playerResponse struct {
	ID        string              `json:"id"`
	Username  string              `json:"username"`
	Role      domain.PlayerRole   `json:"role"`
	Money     int                 `json:"money"`
	Status    domain.PlayerStatus `json:"status"`
	IsBanned  bool                `json:"is_banned"`
	CreatedAt time.Time           `json:"created_at"`
}

type unitResponse struct {
	ID                 string             `json:"id"`
	OwnerID            string             `json:"owner_id"`
	Species            domain.UnitSpecies `json:"species"`
	BaseStats          domain.Stats       `json:"base_stats"`
	CurrentStats       domain.Stats       `json:"current_stats"`
	EquippedTreasureID *string            `json:"equipped_treasure_id"`
	IsPermanent        bool               `json:"is_permanent"`
	IsAlive            bool               `json:"is_alive"`
	IsEquipped         bool               `json:"is_equipped"`
	CreatedAt          time.Time          `json:"created_at"`
}

type dungeonResponse struct {
	ID          string          `json:"id"`
	Name        string          `json:"name"`
	EnemyConfig json.RawMessage `json:"enemy_config"`
	RewardMoney int             `json:"reward_money"`
	RewardDrops json.RawMessage `json:"reward_drops"`
}

type tradeResponse struct {
	ID           string             `json:"id"`
	FromPlayerID string             `json:"from_player_id"`
	ToPlayerID   string             `json:"to_player_id"`
	UnitID       *string            `json:"unit_id"`
	TreasureID   *string            `json:"treasure_id"`
	Status       domain.TradeStatus `json:"status"`
	CreatedAt    time.Time          `json:"created_at"`
}

func toPlayerResponse(player domain.Player) playerResponse {
	return playerResponse{
		ID: player.ID, Username: player.Username, Role: player.Role, Money: player.Money,
		Status: player.Status, IsBanned: player.IsBanned, CreatedAt: player.CreatedAt,
	}
}

func toUnitResponse(unit domain.Unit) unitResponse {
	return unitResponse{
		ID: unit.ID, OwnerID: unit.OwnerID, Species: unit.Species,
		BaseStats: unit.BaseStats, CurrentStats: unit.CurrentStats,
		EquippedTreasureID: unit.EquippedTreasureID, IsPermanent: unit.IsPermanent,
		IsAlive: unit.IsAlive, IsEquipped: unit.IsEquipped, CreatedAt: unit.CreatedAt,
	}
}

func toDungeonResponse(dungeon domain.Dungeon) dungeonResponse {
	return dungeonResponse{
		ID: dungeon.ID, Name: dungeon.Name, EnemyConfig: dungeon.EnemyConfig,
		RewardMoney: dungeon.RewardMoney, RewardDrops: dungeon.RewardDrops,
	}
}

func toTradeResponse(trade domain.Trade) tradeResponse {
	return tradeResponse{
		ID: trade.ID, FromPlayerID: trade.FromPlayerID, ToPlayerID: trade.ToPlayerID,
		UnitID: trade.UnitID, TreasureID: trade.TreasureID, Status: trade.Status,
		CreatedAt: trade.CreatedAt,
	}
}
