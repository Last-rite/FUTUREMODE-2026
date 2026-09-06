// Package httpapi implements NOXCAT's HTTP transport boundary.
package httpapi

import (
	"context"
	"io"
	"log/slog"
	"net/http"
	"time"

	"github.com/Ian747-tw/noxcat_game_backend/internal/domain"
)

const (
	defaultMaxBodyBytes int64 = 1 << 20
	defaultTokenTTL           = 24 * time.Hour
)

type Store interface {
	CreatePlayer(context.Context, domain.NewPlayer) (domain.Player, error)
	PlayerByID(context.Context, string) (domain.Player, error)
	PlayerByUsername(context.Context, string) (domain.Player, error)
	ListPlayerUnits(context.Context, string) ([]domain.Unit, error)
	ListPlayerTreasures(context.Context, string) ([]domain.Treasure, error)
	ListPlayerLoadouts(context.Context, string) ([]domain.PlayerLoadout, error)
	PlayerStatus(context.Context, string) (domain.PlayerStatus, error)
	ListDungeons(context.Context) ([]domain.Dungeon, error)
	ListSolvedDungeons(context.Context, string) ([]domain.Dungeon, error)
	SetBattleLoadout(context.Context, string, []string) error
	SetPlayerLoadout(context.Context, string, int, []string) error
	SetActivePlayerLoadout(context.Context, string, int) error
	EquipTreasure(context.Context, string, string, string) error
	UnequipTreasure(context.Context, string, string) error
	ListPlayerTrades(context.Context, string, *domain.TradeStatus) ([]domain.Trade, error)
	ListTradeAssets(context.Context, string) (domain.TradeInventory, error)
	CreateTrade(context.Context, domain.NewTrade) (domain.Trade, error)
	AcceptTrade(context.Context, string, string) (domain.Trade, error)
	RejectTrade(context.Context, string, string) (domain.Trade, error)
	CancelTrade(context.Context, string, string) (domain.Trade, error)
	CreateDungeon(context.Context, domain.Dungeon) (domain.Dungeon, error)
	UpdateDungeon(context.Context, domain.Dungeon) (domain.Dungeon, error)
	BanPlayer(context.Context, string) error
	AdjustPlayerMoney(context.Context, string, int) error
}

type Principal struct {
	PlayerID string
	Role     domain.PlayerRole
}

type Token struct {
	AccessToken string
	ExpiresIn   time.Duration
}

type AuthService interface {
	Authenticate(context.Context, string) (Principal, error)
	HashPassword(context.Context, string) (string, error)
	VerifyPassword(context.Context, string, string) error
	IssueToken(context.Context, domain.Player, time.Duration) (Token, error)
}

type BattleService interface {
	Start(context.Context, string, string) (domain.BattleStart, error)
	Finish(context.Context, string, domain.BattleSubmission) error
	Cancel(context.Context, string, string) error
}

type Config struct {
	Store         Store
	Auth          AuthService
	Battles       BattleService
	TradeNotifier TradeNotifier
	WebSockets    WebSocketServer
	Logger        *slog.Logger
	StartingMoney int
	StartingUnits []domain.NewUnit
	MaxBodyBytes  int64
	TokenTTL      time.Duration
}

type Server struct {
	store         Store
	auth          AuthService
	battles       BattleService
	tradeNotifier TradeNotifier
	webSockets    WebSocketServer
	logger        *slog.Logger
	startingMoney int
	startingUnits []domain.NewUnit
	maxBodyBytes  int64
	tokenTTL      time.Duration
	handler       http.Handler
}

func NewServer(config Config) *Server {
	logger := config.Logger
	if logger == nil {
		logger = slog.New(slog.NewTextHandler(io.Discard, nil))
	}
	maxBodyBytes := config.MaxBodyBytes
	if maxBodyBytes <= 0 {
		maxBodyBytes = defaultMaxBodyBytes
	}
	tokenTTL := config.TokenTTL
	if tokenTTL <= 0 {
		tokenTTL = defaultTokenTTL
	}

	server := &Server{
		store:         config.Store,
		auth:          config.Auth,
		battles:       config.Battles,
		tradeNotifier: config.TradeNotifier,
		webSockets:    config.WebSockets,
		logger:        logger,
		startingMoney: config.StartingMoney,
		startingUnits: append([]domain.NewUnit(nil), config.StartingUnits...),
		maxBodyBytes:  maxBodyBytes,
		tokenTTL:      tokenTTL,
	}
	server.handler = server.routes()
	return server
}

func (s *Server) Handler() http.Handler {
	return s.handler
}

func (s *Server) routes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("POST /auth/register", s.register)
	mux.HandleFunc("POST /auth/login", s.login)
	mux.HandleFunc("GET /players/{player_id}", s.getPlayer)
	mux.HandleFunc("GET /players/{player_id}/units", s.listUnits)
	mux.HandleFunc("GET /players/{player_id}/treasures", s.listTreasures)
	mux.HandleFunc("GET /players/{player_id}/loadouts", s.listLoadouts)
	mux.HandleFunc("GET /players/{player}/trade-assets", s.listTradeAssets)
	mux.HandleFunc("PUT /players/{player_id}/loadouts/{slot}", s.setLoadoutSlot)
	mux.HandleFunc("PUT /players/{player_id}/loadouts/active", s.setActiveLoadout)
	mux.HandleFunc("PUT /players/{player_id}/loadout", s.setLoadout)
	mux.HandleFunc("GET /players/{player_id}/status", s.playerStatus)
	mux.HandleFunc("GET /players/{player_id}/dungeons", s.listSolvedDungeons)
	mux.HandleFunc("GET /dungeons", s.listDungeons)
	mux.HandleFunc("POST /battles/start", s.startBattle)
	mux.HandleFunc("POST /battles/result", s.submitBattleResult)
	mux.HandleFunc("POST /battles/cancel", s.cancelBattle)
	mux.HandleFunc("POST /treasures/{treasure_id}/equip", s.equipTreasure)
	mux.HandleFunc("DELETE /treasures/{treasure_id}/equip", s.unequipTreasure)
	mux.HandleFunc("GET /trades", s.listTrades)
	mux.HandleFunc("POST /trades", s.createTrade)
	mux.HandleFunc("POST /trades/{trade_id}/accept", s.acceptTrade)
	mux.HandleFunc("POST /trades/{trade_id}/reject", s.rejectTrade)
	mux.HandleFunc("POST /trades/{trade_id}/cancel", s.cancelTrade)
	mux.HandleFunc("GET /ws", s.webSocket)
	mux.HandleFunc("POST /admin/dungeons", s.createDungeon)
	mux.HandleFunc("PUT /admin/dungeons/{dungeon_id}", s.updateDungeon)
	mux.HandleFunc("POST /admin/players/{player_id}/ban", s.banPlayer)
	mux.HandleFunc("POST /admin/players/{player_id}/money", s.adjustPlayerMoney)
	return s.requestIDMiddleware(s.accessLogMiddleware(s.recoverMiddleware(mux)))
}

type requestIDContextKey struct{}
type principalContextKey struct{}
type requestStartedContextKey struct{}

func requestIDFromContext(ctx context.Context) string {
	requestID, _ := ctx.Value(requestIDContextKey{}).(string)
	return requestID
}

// BattleResultRequest remains an HTTP-facing name while the shared untrusted
// submission contract lives in domain for battle-service implementations.
type BattleResultRequest = domain.BattleSubmission
