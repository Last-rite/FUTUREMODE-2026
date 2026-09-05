// Package domain contains application models without persistence or transport
// dependencies.
package domain

import (
	"encoding/json"
	"time"
)

type PlayerRole string

const (
	PlayerRolePlayer PlayerRole = "player"
	PlayerRoleAdmin  PlayerRole = "admin"
)

type PlayerStatus string

const (
	PlayerStatusIdle    PlayerStatus = "idle"
	PlayerStatusCombat  PlayerStatus = "in_combat"
	PlayerStatusTrading PlayerStatus = "trading"
)

type UnitSpecies string

const (
	UnitSpeciesGeneric UnitSpecies = "generic"
	UnitSpeciesFire    UnitSpecies = "fire"
	UnitSpeciesWind    UnitSpecies = "wind"
	UnitSpeciesWater   UnitSpecies = "water"
)

type TradeStatus string

const (
	TradeStatusPending  TradeStatus = "pending"
	TradeStatusAccepted TradeStatus = "accepted"
	TradeStatusRejected TradeStatus = "rejected"
)

type Stats struct {
	Attack  int `json:"atk"`
	Health  int `json:"hp"`
	Defense int `json:"def"`
	Speed   int `json:"spd"`
}

type Player struct {
	ID           string
	Username     string
	PasswordHash string
	Role         PlayerRole
	Money        int
	Status       PlayerStatus
	IsBanned     bool
	CreatedAt    time.Time
}

type NewPlayer struct {
	Username      string
	PasswordHash  string
	StartingMoney int
	StartingUnits []NewUnit
}

type PlayerDungeonProgress struct {
	ID        string
	PlayerID  string
	DungeonID string
	Solved    bool
	SolvedAt  *time.Time
}

type Unit struct {
	ID                 string
	OwnerID            string
	Species            UnitSpecies
	BaseStats          Stats
	CurrentStats       Stats
	EquippedTreasureID *string
	IsPermanent        bool
	IsAlive            bool
	IsEquipped         bool
	CreatedAt          time.Time
}

type NewUnit struct {
	Species     UnitSpecies
	BaseStats   Stats
	IsPermanent bool
	IsEquipped  bool
}

type UnitSettlement struct {
	UnitID       string
	CurrentStats Stats
	IsAlive      bool
}

type Treasure struct {
	ID               string
	OwnerID          string
	DamageBonus      int
	EquippedByUnitID *string
	CreatedAt        time.Time
}

type NewTreasure struct {
	DamageBonus int `json:"damage_bonus"`
}

type Dungeon struct {
	ID          string
	Name        string
	EnemyConfig json.RawMessage
	RewardMoney int
	RewardDrops json.RawMessage
}

type BattleSnapshot struct {
	PlayerID string
	Dungeon  Dungeon
	Units    []Unit
}

type BattleResult struct {
	SessionID     string
	PlayerID      string
	DungeonID     string
	Won           bool
	MoneyAward    int
	Units         []UnitSettlement
	TreasureDrops []NewTreasure
}

type BattleSessionStatus string

const (
	BattleSessionActive    BattleSessionStatus = "active"
	BattleSessionSettled   BattleSessionStatus = "settled"
	BattleSessionCancelled BattleSessionStatus = "cancelled"
	BattleSessionExpired   BattleSessionStatus = "expired"
)

type BattleSession struct {
	ID          string
	PlayerID    string
	DungeonID   string
	Snapshot    BattleSnapshot
	Status      BattleSessionStatus
	CreatedAt   time.Time
	ExpiresAt   time.Time
	CompletedAt *time.Time
}

type BattleStart struct {
	Token    string
	Snapshot BattleSnapshot
}

// BattleSubmission is the client's MVP battle outcome report. Identity,
// immutable unit state, and rewards remain server-controlled.
type BattleSubmission struct {
	BattleSeed     string            `json:"battle_seed"`
	UnitSnapshot   []json.RawMessage `json:"unit_snapshot"`
	ActionLog      []json.RawMessage `json:"action_log"`
	ClaimedOutcome string            `json:"claimed_outcome"`
}

type Trade struct {
	ID           string
	FromPlayerID string
	ToPlayerID   string
	UnitID       *string
	TreasureID   *string
	Status       TradeStatus
	CreatedAt    time.Time
}

type NewTrade struct {
	FromPlayerID string
	ToPlayerID   string
	UnitID       *string
	TreasureID   *string
}
