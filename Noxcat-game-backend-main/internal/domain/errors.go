package domain

import "errors"

// ErrorCode values are stable identifiers intended for HTTP error responses.
type ErrorCode string

const (
	CodeInvalidInput       ErrorCode = "invalid_input"
	CodeNotFound           ErrorCode = "not_found"
	CodeConflict           ErrorCode = "conflict"
	CodeForbidden          ErrorCode = "forbidden"
	CodePlayerBanned       ErrorCode = "player_banned"
	CodePlayerBusy         ErrorCode = "player_busy"
	CodeInvalidSelection   ErrorCode = "invalid_unit_selection"
	CodeTradeNotPending    ErrorCode = "trade_not_pending"
	CodeAssetNotOwned      ErrorCode = "asset_not_owned"
	CodePlayerNotFound     ErrorCode = "player_not_found"
	CodeUnitNotFound       ErrorCode = "unit_not_found"
	CodeTreasureNotFound   ErrorCode = "treasure_not_found"
	CodeDungeonNotFound    ErrorCode = "dungeon_not_found"
	CodeTradeNotFound      ErrorCode = "trade_not_found"
	CodeUsernameTaken      ErrorCode = "username_taken"
	CodeNotInCombat        ErrorCode = "player_not_in_combat"
	CodeTradeRecipient     ErrorCode = "invalid_trade_recipient"
	CodeInvalidTrade       ErrorCode = "invalid_trade_asset"
	CodeAssetReserved      ErrorCode = "asset_reserved"
	CodeTradeSender        ErrorCode = "invalid_trade_sender"
	CodeAlreadyEquipped    ErrorCode = "already_equipped"
	CodeLoadoutFull        ErrorCode = "battle_loadout_full"
	CodeUnitUnavailable    ErrorCode = "unit_unavailable"
	CodeInvalidCredentials ErrorCode = "invalid_credentials"
	CodeUnauthorized       ErrorCode = "unauthorized"
	CodeBattleMismatch     ErrorCode = "battle_result_mismatch"
	CodeBattleExpired      ErrorCode = "battle_expired"
	CodeBattleNotActive    ErrorCode = "battle_not_active"
)

// Sentinel errors let handlers use errors.Is and map failures to exact status
// codes and response bodies without depending on PostgreSQL errors.
var (
	ErrInvalidInput          = errors.New("invalid input")
	ErrNotFound              = errors.New("not found")
	ErrPlayerNotFound        = errors.New("player not found")
	ErrUnitNotFound          = errors.New("unit not found")
	ErrTreasureNotFound      = errors.New("treasure not found")
	ErrDungeonNotFound       = errors.New("dungeon not found")
	ErrTradeNotFound         = errors.New("trade not found")
	ErrUsernameTaken         = errors.New("username already exists")
	ErrPlayerBanned          = errors.New("player is banned")
	ErrPlayerBusy            = errors.New("player is not idle")
	ErrPlayerNotInCombat     = errors.New("player is not in combat")
	ErrInvalidUnitSelection  = errors.New("battle loadout must contain up to three distinct owned units")
	ErrTradeNotPending       = errors.New("trade is not pending")
	ErrTradeRecipient        = errors.New("player is not the trade recipient")
	ErrAssetNotOwned         = errors.New("asset is not owned by player")
	ErrInvalidTradeAsset     = errors.New("trade must contain exactly one asset")
	ErrAssetReserved         = errors.New("asset is reserved by a pending trade")
	ErrTradeSender           = errors.New("player is not the trade sender")
	ErrAlreadyEquipped       = errors.New("treasure is equipped to another unit")
	ErrBattleLoadoutFull     = errors.New("battle loadout already has three units")
	ErrUnitUnavailable       = errors.New("unit is not alive and available")
	ErrInvalidCredentials    = errors.New("invalid credentials")
	ErrUnauthorized          = errors.New("unauthorized")
	ErrBattleResultMismatch  = errors.New("battle result does not match battle session")
	ErrBattleSessionNotFound = errors.New("battle session not found")
	ErrBattleExpired         = errors.New("battle session expired")
	ErrBattleNotActive       = errors.New("battle session is not active")
)
