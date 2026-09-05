package httpapi

import (
	"encoding/json"
	"time"

	"github.com/Ian747-tw/noxcat_game_backend/internal/domain"
)

type playerResponse struct {
	ID                string              `json:"id"`
	Username          string              `json:"username"`
	Role              domain.PlayerRole   `json:"role"`
	Money             int                 `json:"money"`
	Status            domain.PlayerStatus `json:"status"`
	IsBanned          bool                `json:"is_banned"`
	ActiveLoadoutSlot int                 `json:"active_loadout_slot"`
	CreatedAt         time.Time           `json:"created_at"`
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
	SortOrder   int             `json:"sort_order"`
	EnemyConfig json.RawMessage `json:"enemy_config"`
	RewardMoney int             `json:"reward_money"`
	RewardDrops json.RawMessage `json:"reward_drops"`
}

type treasureResponse struct {
	ID               string    `json:"id"`
	OwnerID          string    `json:"owner_id"`
	Code             string    `json:"code"`
	Name             string    `json:"name"`
	TreasureType     string    `json:"treasure_type"`
	Rarity           string    `json:"rarity"`
	DamageBonus      int       `json:"damage_bonus"`
	HealthBonus      int       `json:"health_bonus"`
	DefenseBonus     int       `json:"defense_bonus"`
	SpeedBonus       int       `json:"speed_bonus"`
	EffectCode       *string   `json:"effect_code"`
	Charges          *int      `json:"charges"`
	EquippedByUnitID *string   `json:"equipped_by_unit_id"`
	CreatedAt        time.Time `json:"created_at"`
}

type loadoutResponse struct {
	ID        string    `json:"id"`
	PlayerID  string    `json:"player_id"`
	Slot      int       `json:"slot"`
	Name      string    `json:"name"`
	UnitIDs   []string  `json:"unit_ids"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

type tradeResponse struct {
	ID              string               `json:"id"`
	FromPlayerID    string               `json:"from_player_id"`
	ToPlayerID      string               `json:"to_player_id"`
	UnitID          *string              `json:"unit_id"`
	TreasureID      *string              `json:"treasure_id"`
	RequestedAssets []tradeAssetResponse `json:"requested_assets"`
	Status          domain.TradeStatus   `json:"status"`
	CreatedAt       time.Time            `json:"created_at"`
}

type tradeAssetResponse struct {
	UnitID     *string `json:"unit_id,omitempty"`
	TreasureID *string `json:"treasure_id,omitempty"`
}

func toPlayerResponse(player domain.Player) playerResponse {
	return playerResponse{
		ID: player.ID, Username: player.Username, Role: player.Role, Money: player.Money,
		Status: player.Status, IsBanned: player.IsBanned,
		ActiveLoadoutSlot: player.ActiveLoadoutSlot, CreatedAt: player.CreatedAt,
	}
}

func toTreasureResponse(treasure domain.Treasure) treasureResponse {
	return treasureResponse{
		ID: treasure.ID, OwnerID: treasure.OwnerID, Code: treasure.Code, Name: treasure.Name,
		TreasureType: treasure.TreasureType, Rarity: treasure.Rarity,
		DamageBonus: treasure.DamageBonus, HealthBonus: treasure.HealthBonus,
		DefenseBonus: treasure.DefenseBonus, SpeedBonus: treasure.SpeedBonus,
		EffectCode: treasure.EffectCode, Charges: treasure.Charges,
		EquippedByUnitID: treasure.EquippedByUnitID, CreatedAt: treasure.CreatedAt,
	}
}

func toLoadoutResponse(loadout domain.PlayerLoadout) loadoutResponse {
	return loadoutResponse{
		ID: loadout.ID, PlayerID: loadout.PlayerID, Slot: loadout.Slot, Name: loadout.Name,
		UnitIDs: loadout.UnitIDs, CreatedAt: loadout.CreatedAt, UpdatedAt: loadout.UpdatedAt,
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
		ID: dungeon.ID, Name: dungeon.Name, SortOrder: dungeon.SortOrder, EnemyConfig: dungeon.EnemyConfig,
		RewardMoney: dungeon.RewardMoney, RewardDrops: dungeon.RewardDrops,
	}
}

func toTradeResponse(trade domain.Trade) tradeResponse {
	requested := make([]tradeAssetResponse, len(trade.RequestedAssets))
	for index, asset := range trade.RequestedAssets {
		requested[index] = tradeAssetResponse{UnitID: asset.UnitID, TreasureID: asset.TreasureID}
	}
	return tradeResponse{
		ID: trade.ID, FromPlayerID: trade.FromPlayerID, ToPlayerID: trade.ToPlayerID,
		UnitID: trade.UnitID, TreasureID: trade.TreasureID, Status: trade.Status,
		RequestedAssets: requested, CreatedAt: trade.CreatedAt,
	}
}
