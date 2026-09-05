package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/Ian747-tw/noxcat_game_backend/internal/database"
	"github.com/Ian747-tw/noxcat_game_backend/internal/domain"
	"github.com/jackc/pgx/v5/pgconn"
)

const (
	playerID   = "11111111-1111-4111-8111-111111111111"
	otherID    = "22222222-2222-4222-8222-222222222222"
	unitID     = "33333333-3333-4333-8333-333333333333"
	treasureID = "44444444-4444-4444-8444-444444444444"
	dungeonID  = "55555555-5555-4555-8555-555555555555"
	tradeID    = "66666666-6666-4666-8666-666666666666"
)

type fakeStore struct {
	createPlayer      func(context.Context, domain.NewPlayer) (domain.Player, error)
	playerByUsername  func(context.Context, string) (domain.Player, error)
	listPlayerUnits   func(context.Context, string) ([]domain.Unit, error)
	playerStatus      func(context.Context, string) (domain.PlayerStatus, error)
	listDungeons      func(context.Context, string) ([]domain.Dungeon, error)
	setLoadout        func(context.Context, string, []string) error
	equipTreasure     func(context.Context, string, string, string) error
	listTrades        func(context.Context, string, *domain.TradeStatus) ([]domain.Trade, error)
	createTrade       func(context.Context, domain.NewTrade) (domain.Trade, error)
	acceptTrade       func(context.Context, string, string) (domain.Trade, error)
	rejectTrade       func(context.Context, string, string) (domain.Trade, error)
	createDungeon     func(context.Context, domain.Dungeon) (domain.Dungeon, error)
	updateDungeon     func(context.Context, domain.Dungeon) (domain.Dungeon, error)
	banPlayer         func(context.Context, string) error
	adjustPlayerMoney func(context.Context, string, int) error
}

func unexpected(name string) error { return errors.New("unexpected store call: " + name) }
func (f *fakeStore) CreatePlayer(c context.Context, v domain.NewPlayer) (domain.Player, error) {
	if f.createPlayer != nil {
		return f.createPlayer(c, v)
	}
	return domain.Player{}, unexpected("CreatePlayer")
}
func (f *fakeStore) PlayerByUsername(c context.Context, v string) (domain.Player, error) {
	if f.playerByUsername != nil {
		return f.playerByUsername(c, v)
	}
	return domain.Player{}, unexpected("PlayerByUsername")
}
func (f *fakeStore) ListPlayerUnits(c context.Context, v string) ([]domain.Unit, error) {
	if f.listPlayerUnits != nil {
		return f.listPlayerUnits(c, v)
	}
	return nil, unexpected("ListPlayerUnits")
}
func (f *fakeStore) PlayerStatus(c context.Context, v string) (domain.PlayerStatus, error) {
	if f.playerStatus != nil {
		return f.playerStatus(c, v)
	}
	return "", unexpected("PlayerStatus")
}
func (f *fakeStore) ListSolvedDungeons(c context.Context, v string) ([]domain.Dungeon, error) {
	if f.listDungeons != nil {
		return f.listDungeons(c, v)
	}
	return nil, unexpected("ListSolvedDungeons")
}
func (f *fakeStore) SetBattleLoadout(c context.Context, p string, ids []string) error {
	if f.setLoadout != nil {
		return f.setLoadout(c, p, ids)
	}
	return unexpected("SetBattleLoadout")
}
func (f *fakeStore) EquipTreasure(c context.Context, p, tr, u string) error {
	if f.equipTreasure != nil {
		return f.equipTreasure(c, p, tr, u)
	}
	return unexpected("EquipTreasure")
}
func (f *fakeStore) ListPlayerTrades(c context.Context, p string, s *domain.TradeStatus) ([]domain.Trade, error) {
	if f.listTrades != nil {
		return f.listTrades(c, p, s)
	}
	return nil, unexpected("ListPlayerTrades")
}
func (f *fakeStore) CreateTrade(c context.Context, v domain.NewTrade) (domain.Trade, error) {
	if f.createTrade != nil {
		return f.createTrade(c, v)
	}
	return domain.Trade{}, unexpected("CreateTrade")
}
func (f *fakeStore) AcceptTrade(c context.Context, tr, p string) (domain.Trade, error) {
	if f.acceptTrade != nil {
		return f.acceptTrade(c, tr, p)
	}
	return domain.Trade{}, unexpected("AcceptTrade")
}
func (f *fakeStore) RejectTrade(c context.Context, tr, p string) (domain.Trade, error) {
	if f.rejectTrade != nil {
		return f.rejectTrade(c, tr, p)
	}
	return domain.Trade{}, unexpected("RejectTrade")
}
func (f *fakeStore) CreateDungeon(c context.Context, v domain.Dungeon) (domain.Dungeon, error) {
	if f.createDungeon != nil {
		return f.createDungeon(c, v)
	}
	return domain.Dungeon{}, unexpected("CreateDungeon")
}
func (f *fakeStore) UpdateDungeon(c context.Context, v domain.Dungeon) (domain.Dungeon, error) {
	if f.updateDungeon != nil {
		return f.updateDungeon(c, v)
	}
	return domain.Dungeon{}, unexpected("UpdateDungeon")
}
func (f *fakeStore) BanPlayer(c context.Context, p string) error {
	if f.banPlayer != nil {
		return f.banPlayer(c, p)
	}
	return unexpected("BanPlayer")
}
func (f *fakeStore) AdjustPlayerMoney(c context.Context, p string, d int) error {
	if f.adjustPlayerMoney != nil {
		return f.adjustPlayerMoney(c, p, d)
	}
	return unexpected("AdjustPlayerMoney")
}

type fakeAuth struct {
	principal domain.PlayerRole
	authErr   error
	hashErr   error
	verifyErr error
	tokenErr  error
}

func (f *fakeAuth) Authenticate(context.Context, string) (Principal, error) {
	return Principal{PlayerID: playerID, Role: f.principal}, f.authErr
}
func (f *fakeAuth) HashPassword(context.Context, string) (string, error) {
	return "stored-hash", f.hashErr
}
func (f *fakeAuth) VerifyPassword(context.Context, string, string) error { return f.verifyErr }
func (f *fakeAuth) IssueToken(context.Context, domain.Player, time.Duration) (Token, error) {
	return Token{AccessToken: "signed-token", ExpiresIn: time.Hour}, f.tokenErr
}

type fakeBattles struct {
	start       domain.BattleStart
	startErr    error
	finishErr   error
	cancelErr   error
	finishCalls int
	cancelCalls int
}

func (f *fakeBattles) Start(context.Context, string, string) (domain.BattleStart, error) {
	return f.start, f.startErr
}
func (f *fakeBattles) Finish(context.Context, string, domain.BattleSubmission) error {
	f.finishCalls++
	return f.finishErr
}
func (f *fakeBattles) Cancel(context.Context, string, string) error {
	f.cancelCalls++
	return f.cancelErr
}

var _ Store = (*fakeStore)(nil)
var _ Store = (*database.Store)(nil)
var _ AuthService = (*fakeAuth)(nil)
var _ BattleService = (*fakeBattles)(nil)

func testServer(store Store) *Server {
	return NewServer(Config{
		Store:         store,
		Auth:          &fakeAuth{principal: domain.PlayerRolePlayer},
		Battles:       &fakeBattles{start: domain.BattleStart{Token: "seed"}},
		StartingMoney: 25,
		StartingUnits: []domain.NewUnit{{Species: domain.UnitSpeciesFire, IsEquipped: true}},
		MaxBodyBytes:  128,
		TokenTTL:      2 * time.Hour,
	})
}

func request(t *testing.T, server *Server, method, path, body string, authenticated bool) *httptest.ResponseRecorder {
	t.Helper()
	r := httptest.NewRequest(method, path, strings.NewReader(body))
	if body != "" {
		r.Header.Set("Content-Type", "application/json")
	}
	if authenticated {
		r.Header.Set("Authorization", "Bearer test-token")
	}
	r.Header.Set("X-Request-ID", "test-request")
	w := httptest.NewRecorder()
	server.Handler().ServeHTTP(w, r)
	return w
}

func assertResponse(t *testing.T, response *httptest.ResponseRecorder, status int, code string) {
	t.Helper()
	if response.Code != status {
		t.Fatalf("status = %d, want %d; body=%s", response.Code, status, response.Body.String())
	}
	if got := response.Header().Get("X-Request-ID"); got != "test-request" {
		t.Fatalf("request ID = %q", got)
	}
	if code == "" {
		return
	}
	var envelope errorEnvelope
	if err := json.Unmarshal(response.Body.Bytes(), &envelope); err != nil {
		t.Fatalf("decode error: %v", err)
	}
	if envelope.Error.Code != code {
		t.Fatalf("error code = %q, want %q", envelope.Error.Code, code)
	}
	if envelope.Error.RequestID != "test-request" {
		t.Fatalf("error request ID = %q", envelope.Error.RequestID)
	}
}

func TestTransportRejectsBeforeStore(t *testing.T) {
	tests := []struct {
		name, method, path, body string
		auth                     bool
		status                   int
		code                     string
	}{
		{"missing auth", http.MethodGet, "/players/" + playerID + "/units", "", false, 401, "unauthorized"},
		{"foreign player", http.MethodGet, "/players/" + otherID + "/units", "", true, 403, "forbidden"},
		{"bad path id", http.MethodGet, "/players/not-a-uuid/units", "", true, 400, "invalid_request"},
		{"unknown field", http.MethodPost, "/battles/start", `{"dungeon_id":"` + dungeonID + `","extra":1}`, true, 400, "invalid_request"},
		{"trailing json", http.MethodPost, "/battles/start", `{"dungeon_id":"` + dungeonID + `"}{}`, true, 400, "invalid_request"},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			assertResponse(t, request(t, testServer(&fakeStore{}), tc.method, tc.path, tc.body, tc.auth), tc.status, tc.code)
		})
	}
}

func TestStrictJSONAndAuthenticationOrder(t *testing.T) {
	t.Run("ordinary JSON validation precedes authentication", func(t *testing.T) {
		response := request(t, testServer(&fakeStore{}), "POST", "/battles/start", "{", false)
		assertResponse(t, response, 400, "invalid_request")
	})
	t.Run("missing content type", func(t *testing.T) {
		r := httptest.NewRequest("POST", "/auth/register", strings.NewReader(`{"username":"alice","password":"password123"}`))
		r.Header.Set("X-Request-ID", "test-request")
		w := httptest.NewRecorder()
		testServer(&fakeStore{}).Handler().ServeHTTP(w, r)
		assertResponse(t, w, 400, "invalid_request")
	})
	t.Run("body limit", func(t *testing.T) {
		response := request(t, testServer(&fakeStore{}), "POST", "/auth/register", `{"username":"alice","password":"`+strings.Repeat("x", 200)+`"}`, false)
		assertResponse(t, response, 400, "invalid_request")
	})
	t.Run("method mismatch", func(t *testing.T) {
		assertResponse(t, request(t, testServer(&fakeStore{}), "GET", "/auth/login", "", false), 405, "")
	})
	t.Run("invalid token", func(t *testing.T) {
		s := testServer(&fakeStore{})
		s.auth = &fakeAuth{principal: domain.PlayerRolePlayer, authErr: domain.ErrUnauthorized}
		assertResponse(t, request(t, s, "GET", "/players/"+playerID+"/units", "", true), 401, "unauthorized")
	})
	t.Run("authentication infrastructure error is hidden", func(t *testing.T) {
		s := testServer(&fakeStore{})
		s.auth = &fakeAuth{principal: domain.PlayerRolePlayer, authErr: errors.New("JWT key leaked")}
		response := request(t, s, "GET", "/players/"+playerID+"/units", "", true)
		assertResponse(t, response, 500, "internal_error")
		if strings.Contains(response.Body.String(), "JWT key") {
			t.Fatal("internal error leaked")
		}
	})
	t.Run("panic is recovered", func(t *testing.T) {
		fs := &fakeStore{playerStatus: func(context.Context, string) (domain.PlayerStatus, error) { panic("secret panic") }}
		response := request(t, testServer(fs), "GET", "/players/"+playerID+"/status", "", true)
		assertResponse(t, response, 500, "internal_error")
		if strings.Contains(response.Body.String(), "secret panic") {
			t.Fatal("panic leaked")
		}
	})
}

func TestRegisterAndLogin(t *testing.T) {
	t.Run("register uses trusted defaults and omits password", func(t *testing.T) {
		store := &fakeStore{createPlayer: func(_ context.Context, input domain.NewPlayer) (domain.Player, error) {
			if input.PasswordHash != "stored-hash" || input.StartingMoney != 25 || len(input.StartingUnits) != 1 {
				t.Fatalf("unexpected input: %+v", input)
			}
			return domain.Player{ID: playerID, Username: input.Username, PasswordHash: "secret", Role: domain.PlayerRolePlayer}, nil
		}}
		response := request(t, testServer(store), http.MethodPost, "/auth/register", `{"username":"alice_1","password":"password123"}`, false)
		assertResponse(t, response, http.StatusCreated, "")
		if strings.Contains(response.Body.String(), "secret") || strings.Contains(response.Body.String(), "password123") {
			t.Fatal("password material leaked")
		}
	})
	t.Run("register maps duplicate but escaped guard is internal", func(t *testing.T) {
		for _, tc := range []struct {
			err    error
			status int
			code   string
		}{{domain.ErrUsernameTaken, 409, "username_taken"}, {domain.ErrInvalidInput, 500, "internal_error"}} {
			store := &fakeStore{createPlayer: func(context.Context, domain.NewPlayer) (domain.Player, error) { return domain.Player{}, tc.err }}
			assertResponse(t, request(t, testServer(store), "POST", "/auth/register", `{"username":"alice","password":"password123"}`, false), tc.status, tc.code)
		}
	})
	t.Run("invalid registration never calls store", func(t *testing.T) {
		assertResponse(t, request(t, testServer(&fakeStore{}), "POST", "/auth/register", `{"username":"x","password":"short"}`, false), 400, "invalid_request")
	})
	t.Run("login does not enumerate usernames", func(t *testing.T) {
		unknown := &fakeStore{playerByUsername: func(context.Context, string) (domain.Player, error) { return domain.Player{}, domain.ErrPlayerNotFound }}
		r1 := request(t, testServer(unknown), "POST", "/auth/login", `{"username":"alice","password":"password123"}`, false)
		server := testServer(&fakeStore{playerByUsername: func(context.Context, string) (domain.Player, error) { return domain.Player{PasswordHash: "hash"}, nil }})
		server.auth = &fakeAuth{principal: domain.PlayerRolePlayer, verifyErr: domain.ErrInvalidCredentials}
		r2 := request(t, server, "POST", "/auth/login", `{"username":"alice","password":"password123"}`, false)
		assertResponse(t, r1, 401, "invalid_credentials")
		assertResponse(t, r2, 401, "invalid_credentials")
		if r1.Body.String() != r2.Body.String() {
			t.Fatalf("credential errors differ: %s / %s", r1.Body.String(), r2.Body.String())
		}
	})
	t.Run("login success", func(t *testing.T) {
		store := &fakeStore{playerByUsername: func(context.Context, string) (domain.Player, error) {
			return domain.Player{ID: playerID, PasswordHash: "hash"}, nil
		}}
		response := request(t, testServer(store), "POST", "/auth/login", `{"username":"alice","password":"password123"}`, false)
		assertResponse(t, response, 200, "")
		if !strings.Contains(response.Body.String(), `"access_token":"signed-token"`) {
			t.Fatalf("body=%s", response.Body.String())
		}
	})
}

func TestPlayerEndpoints(t *testing.T) {
	store := &fakeStore{
		listPlayerUnits: func(context.Context, string) ([]domain.Unit, error) {
			return []domain.Unit{{ID: unitID, OwnerID: playerID, IsEquipped: true}}, nil
		},
		playerStatus: func(context.Context, string) (domain.PlayerStatus, error) { return domain.PlayerStatusIdle, nil },
		listDungeons: func(context.Context, string) ([]domain.Dungeon, error) {
			return []domain.Dungeon{{ID: dungeonID, EnemyConfig: json.RawMessage(`[]`)}}, nil
		},
		setLoadout: func(_ context.Context, p string, ids []string) error {
			if p != playerID || len(ids) != 1 || ids[0] != unitID {
				t.Fatal("wrong loadout")
			}
			return nil
		},
	}
	assertResponse(t, request(t, testServer(store), "GET", "/players/"+playerID+"/units", "", true), 200, "")
	assertResponse(t, request(t, testServer(store), "GET", "/players/"+playerID+"/status", "", true), 200, "")
	assertResponse(t, request(t, testServer(store), "GET", "/players/"+playerID+"/dungeons", "", true), 200, "")
	assertResponse(t, request(t, testServer(store), "PUT", "/players/"+playerID+"/loadout", `{"unit_ids":["`+unitID+`"]}`, true), 204, "")

	for _, body := range []string{`{}`, `{"unit_ids":null}`, `{"unit_ids":["bad"]}`, `{"unit_ids":["` + unitID + `","` + unitID + `"]}`, `{"unit_ids":["` + unitID + `","` + otherID + `","` + tradeID + `","` + dungeonID + `"]}`} {
		assertResponse(t, request(t, testServer(&fakeStore{}), "PUT", "/players/"+playerID+"/loadout", body, true), 400, "invalid_request")
	}
	for _, tc := range []struct {
		err    error
		status int
		code   string
	}{{domain.ErrAssetNotOwned, 403, "asset_not_owned"}, {domain.ErrUnitUnavailable, 409, "unit_unavailable"}, {domain.ErrPlayerBusy, 409, "player_busy"}, {domain.ErrInvalidUnitSelection, 500, "internal_error"}} {
		fs := &fakeStore{setLoadout: func(context.Context, string, []string) error { return tc.err }}
		assertResponse(t, request(t, testServer(fs), "PUT", "/players/"+playerID+"/loadout", `{"unit_ids":["`+unitID+`"]}`, true), tc.status, tc.code)
	}
}

func TestBattleEndpoints(t *testing.T) {
	t.Run("start success", func(t *testing.T) {
		s := testServer(&fakeStore{})
		s.battles = &fakeBattles{start: domain.BattleStart{Token: "seed", Snapshot: domain.BattleSnapshot{
			PlayerID: playerID, Dungeon: domain.Dungeon{ID: dungeonID, EnemyConfig: json.RawMessage(`[]`)}, Units: []domain.Unit{{ID: unitID}},
		}}}
		response := request(t, s, "POST", "/battles/start", `{"dungeon_id":"`+dungeonID+`"}`, true)
		assertResponse(t, response, 200, "")
		if !strings.Contains(response.Body.String(), `"battle_seed":"seed"`) {
			t.Fatal(response.Body.String())
		}
	})
	t.Run("start error mapping", func(t *testing.T) {
		for _, tc := range []struct {
			err    error
			status int
			code   string
		}{{domain.ErrPlayerBusy, 409, "player_busy"}, {domain.ErrPlayerBanned, 403, "player_banned"}, {domain.ErrInvalidUnitSelection, 409, "battle_loadout_unavailable"}} {
			s := testServer(&fakeStore{})
			s.battles = &fakeBattles{startErr: tc.err}
			assertResponse(t, request(t, s, "POST", "/battles/start", `{"dungeon_id":"`+dungeonID+`"}`, true), tc.status, tc.code)
		}
	})
	t.Run("atomic start failure is internal", func(t *testing.T) {
		s := testServer(&fakeStore{})
		s.battles = &fakeBattles{startErr: errors.New("start failed")}
		assertResponse(t, request(t, s, "POST", "/battles/start", `{"dungeon_id":"`+dungeonID+`"}`, true), 500, "internal_error")
	})
	t.Run("result success is orchestrated by service", func(t *testing.T) {
		battles := &fakeBattles{}
		s := testServer(&fakeStore{})
		s.battles = battles
		assertResponse(t, request(t, s, "POST", "/battles/result", validResultBody(), true), 204, "")
		if battles.finishCalls != 1 {
			t.Fatal("finish not called")
		}
	})
	t.Run("mismatch does not trigger a blanket player reset", func(t *testing.T) {
		s := testServer(&fakeStore{})
		s.battles = &fakeBattles{finishErr: domain.ErrBattleResultMismatch}
		assertResponse(t, request(t, s, "POST", "/battles/result", validResultBody(), true), 422, "battle_result_mismatch")
	})
	t.Run("battle service state errors remain precise", func(t *testing.T) {
		for _, tc := range []struct {
			err    error
			status int
			code   string
		}{{domain.ErrDungeonNotFound, 404, "dungeon_not_found"}, {domain.ErrPlayerNotInCombat, 409, "player_not_in_combat"}} {
			s := testServer(&fakeStore{})
			s.battles = &fakeBattles{finishErr: tc.err}
			assertResponse(t, request(t, s, "POST", "/battles/result", validResultBody(), true), tc.status, tc.code)
		}
	})
	t.Run("result shape validation blocks services", func(t *testing.T) {
		for _, body := range []string{
			`{"unit_snapshot":[{}],"action_log":[],"claimed_outcome":"won"}`,
			`{"battle_seed":"seed","unit_snapshot":[],"action_log":[],"claimed_outcome":"won"}`,
			`{"battle_seed":"seed","unit_snapshot":[{}],"action_log":[],"claimed_outcome":"draw"}`,
		} {
			assertResponse(t, request(t, testServer(&fakeStore{}), "POST", "/battles/result", body, true), 400, "invalid_request")
		}
	})
	t.Run("escaped settlement guard is internal", func(t *testing.T) {
		s := testServer(&fakeStore{})
		s.battles = &fakeBattles{finishErr: domain.ErrInvalidInput}
		assertResponse(t, request(t, s, "POST", "/battles/result", validResultBody(), true), 500, "internal_error")
	})
	t.Run("cancel", func(t *testing.T) {
		battles := &fakeBattles{}
		s := testServer(&fakeStore{})
		s.battles = battles
		assertResponse(t, request(t, s, "POST", "/battles/cancel", `{"battle_seed":"seed"}`, true), 204, "")
		if battles.cancelCalls != 1 {
			t.Fatal("cancel not called")
		}
	})
	t.Run("cancel maps unknown token without touching store", func(t *testing.T) {
		s := testServer(&fakeStore{})
		s.battles = &fakeBattles{cancelErr: domain.ErrBattleResultMismatch}
		assertResponse(t, request(t, s, "POST", "/battles/cancel", `{"battle_seed":"unknown"}`, true), 422, "battle_result_mismatch")
	})
}

func validResultBody() string {
	return `{"battle_seed":"seed","unit_snapshot":[{}],"action_log":[],"claimed_outcome":"won"}`
}

func TestTreasureAndTradeEndpoints(t *testing.T) {
	t.Run("equip and mappings", func(t *testing.T) {
		for _, tc := range []struct {
			err    error
			status int
			code   string
		}{{nil, 204, ""}, {domain.ErrAssetNotOwned, 403, "asset_not_owned"}, {domain.ErrAlreadyEquipped, 409, "already_equipped"}, {domain.ErrPlayerBusy, 409, "player_busy"}, {domain.ErrInvalidInput, 500, "internal_error"}} {
			fs := &fakeStore{equipTreasure: func(context.Context, string, string, string) error { return tc.err }}
			assertResponse(t, request(t, testServer(fs), "POST", "/treasures/"+treasureID+"/equip", `{"unit_id":"`+unitID+`"}`, true), tc.status, tc.code)
		}
	})
	t.Run("list validates status and passes filter", func(t *testing.T) {
		fs := &fakeStore{listTrades: func(_ context.Context, p string, s *domain.TradeStatus) ([]domain.Trade, error) {
			if p != playerID || s == nil || *s != domain.TradeStatusPending {
				t.Fatal("wrong filter")
			}
			return []domain.Trade{}, nil
		}}
		assertResponse(t, request(t, testServer(fs), "GET", "/trades?status=pending", "", true), 200, "")
		assertResponse(t, request(t, testServer(&fakeStore{}), "GET", "/trades?status=bad", "", true), 400, "invalid_request")
	})
	t.Run("create enforces exactly one asset", func(t *testing.T) {
		valid := `{"to_player_id":"` + otherID + `","unit_id":"` + unitID + `"}`
		fs := &fakeStore{createTrade: func(_ context.Context, v domain.NewTrade) (domain.Trade, error) {
			if v.FromPlayerID != playerID || v.UnitID == nil {
				t.Fatal("wrong trade")
			}
			return domain.Trade{ID: tradeID, FromPlayerID: playerID, ToPlayerID: otherID, UnitID: v.UnitID, Status: domain.TradeStatusPending}, nil
		}}
		assertResponse(t, request(t, testServer(fs), "POST", "/trades", valid, true), 201, "")
		for _, body := range []string{`{"to_player_id":"` + otherID + `"}`, `{"to_player_id":"` + otherID + `","unit_id":"` + unitID + `","treasure_id":"` + treasureID + `"}`, `{"to_player_id":"` + playerID + `","unit_id":"` + unitID + `"}`} {
			assertResponse(t, request(t, testServer(&fakeStore{}), "POST", "/trades", body, true), 400, "invalid_request")
		}
	})
	t.Run("create and accept map ownership differently", func(t *testing.T) {
		create := &fakeStore{createTrade: func(context.Context, domain.NewTrade) (domain.Trade, error) {
			return domain.Trade{}, domain.ErrAssetNotOwned
		}}
		assertResponse(t, request(t, testServer(create), "POST", "/trades", `{"to_player_id":"`+otherID+`","unit_id":"`+unitID+`"}`, true), 403, "asset_not_owned")
		accept := &fakeStore{acceptTrade: func(context.Context, string, string) (domain.Trade, error) {
			return domain.Trade{}, domain.ErrAssetNotOwned
		}}
		assertResponse(t, request(t, testServer(accept), "POST", "/trades/"+tradeID+"/accept", "", true), 409, "trade_asset_unavailable")
		busy := &fakeStore{acceptTrade: func(context.Context, string, string) (domain.Trade, error) {
			return domain.Trade{}, domain.ErrPlayerBusy
		}}
		assertResponse(t, request(t, testServer(busy), "POST", "/trades/"+tradeID+"/accept", "", true), 409, "player_busy")
	})
	t.Run("accept and reject use authenticated recipient", func(t *testing.T) {
		accept := &fakeStore{acceptTrade: func(_ context.Context, tr, p string) (domain.Trade, error) {
			if tr != tradeID || p != playerID {
				t.Fatal("wrong IDs")
			}
			return domain.Trade{ID: tr}, nil
		}}
		reject := &fakeStore{rejectTrade: func(_ context.Context, tr, p string) (domain.Trade, error) {
			if tr != tradeID || p != playerID {
				t.Fatal("wrong IDs")
			}
			return domain.Trade{ID: tr}, nil
		}}
		assertResponse(t, request(t, testServer(accept), "POST", "/trades/"+tradeID+"/accept", "", true), 200, "")
		assertResponse(t, request(t, testServer(reject), "POST", "/trades/"+tradeID+"/reject", "", true), 200, "")
	})
}

func TestAdminEndpoints(t *testing.T) {
	validDungeon := `{"name":"Crypt","enemy_config":[{}],"reward_money":10,"reward_drops":[]}`
	t.Run("player is rejected before malformed body", func(t *testing.T) {
		assertResponse(t, request(t, testServer(&fakeStore{}), "POST", "/admin/dungeons", "{", true), 403, "forbidden")
	})
	t.Run("create and update", func(t *testing.T) {
		fs := &fakeStore{createDungeon: func(_ context.Context, d domain.Dungeon) (domain.Dungeon, error) { d.ID = dungeonID; return d, nil }, updateDungeon: func(_ context.Context, d domain.Dungeon) (domain.Dungeon, error) {
			if d.ID != dungeonID {
				t.Fatal("wrong dungeon")
			}
			return d, nil
		}}
		s := testServer(fs)
		s.auth = &fakeAuth{principal: domain.PlayerRoleAdmin}
		assertResponse(t, request(t, s, "POST", "/admin/dungeons", validDungeon, true), 201, "")
		assertResponse(t, request(t, s, "PUT", "/admin/dungeons/"+dungeonID, validDungeon, true), 200, "")
	})
	t.Run("validation blocks store", func(t *testing.T) {
		s := testServer(&fakeStore{})
		s.auth = &fakeAuth{principal: domain.PlayerRoleAdmin}
		assertResponse(t, request(t, s, "POST", "/admin/dungeons", `{"name":"","enemy_config":{},"reward_money":-1}`, true), 400, "invalid_request")
	})
	t.Run("ban and money", func(t *testing.T) {
		fs := &fakeStore{banPlayer: func(_ context.Context, p string) error {
			if p != otherID {
				t.Fatal("wrong player")
			}
			return nil
		}, adjustPlayerMoney: func(_ context.Context, p string, d int) error {
			if p != otherID || d != 10 {
				t.Fatal("wrong adjustment")
			}
			return nil
		}}
		s := testServer(fs)
		s.auth = &fakeAuth{principal: domain.PlayerRoleAdmin}
		assertResponse(t, request(t, s, "POST", "/admin/players/"+otherID+"/ban", "", true), 204, "")
		assertResponse(t, request(t, s, "POST", "/admin/players/"+otherID+"/money", `{"delta":10}`, true), 204, "")
	})
	t.Run("money store guard has deliberate conflict mapping", func(t *testing.T) {
		fs := &fakeStore{adjustPlayerMoney: func(context.Context, string, int) error { return domain.ErrInvalidInput }}
		s := testServer(fs)
		s.auth = &fakeAuth{principal: domain.PlayerRoleAdmin}
		assertResponse(t, request(t, s, "POST", "/admin/players/"+otherID+"/money", `{"delta":-10}`, true), 409, "insufficient_balance")
	})
	t.Run("documented not found and escaped dungeon guard", func(t *testing.T) {
		for _, tc := range []struct {
			err    error
			status int
			code   string
		}{{domain.ErrDungeonNotFound, 404, "dungeon_not_found"}, {domain.ErrInvalidInput, 500, "internal_error"}} {
			fs := &fakeStore{updateDungeon: func(context.Context, domain.Dungeon) (domain.Dungeon, error) { return domain.Dungeon{}, tc.err }}
			s := testServer(fs)
			s.auth = &fakeAuth{principal: domain.PlayerRoleAdmin}
			assertResponse(t, request(t, s, "PUT", "/admin/dungeons/"+dungeonID, validDungeon, true), tc.status, tc.code)
		}
	})
	t.Run("invalid money delta never reaches store", func(t *testing.T) {
		s := testServer(&fakeStore{})
		s.auth = &fakeAuth{principal: domain.PlayerRoleAdmin}
		for _, body := range []string{`{}`, `{"delta":0}`, `{"delta":1000001}`} {
			assertResponse(t, request(t, s, "POST", "/admin/players/"+otherID+"/money", body, true), 400, "invalid_request")
		}
	})
}

func TestAllSafeDomainErrorsHaveExactPublicMappings(t *testing.T) {
	tests := []struct {
		err     error
		status  int
		code    string
		message string
	}{
		{domain.ErrPlayerNotFound, 404, "player_not_found", "player not found"},
		{domain.ErrUnitNotFound, 404, "unit_not_found", "unit not found"},
		{domain.ErrTreasureNotFound, 404, "treasure_not_found", "treasure not found"},
		{domain.ErrDungeonNotFound, 404, "dungeon_not_found", "dungeon not found"},
		{domain.ErrTradeNotFound, 404, "trade_not_found", "trade not found"},
		{domain.ErrUsernameTaken, 409, "username_taken", "username already exists"},
		{domain.ErrPlayerBanned, 403, "player_banned", "player is banned"},
		{domain.ErrPlayerBusy, 409, "player_busy", "player is not idle"},
		{domain.ErrPlayerNotInCombat, 409, "player_not_in_combat", "player is not in combat"},
		{domain.ErrTradeNotPending, 409, "trade_not_pending", "trade is not pending"},
		{domain.ErrTradeRecipient, 403, "invalid_trade_recipient", "player is not the trade recipient"},
		{domain.ErrAlreadyEquipped, 409, "already_equipped", "treasure is equipped to another unit"},
		{domain.ErrBattleLoadoutFull, 409, "battle_loadout_full", "battle loadout already has three units"},
		{domain.ErrUnitUnavailable, 409, "unit_unavailable", "unit is not alive and available"},
		{domain.ErrBattleExpired, 409, "battle_expired", "battle session has expired"},
		{domain.ErrBattleNotActive, 409, "battle_not_active", "battle session is not active"},
	}
	for _, tc := range tests {
		t.Run(tc.code, func(t *testing.T) {
			fs := &fakeStore{playerStatus: func(context.Context, string) (domain.PlayerStatus, error) { return "", tc.err }}
			response := request(t, testServer(fs), "GET", "/players/"+playerID+"/status", "", true)
			assertResponse(t, response, tc.status, tc.code)
			var envelope errorEnvelope
			if err := json.Unmarshal(response.Body.Bytes(), &envelope); err != nil {
				t.Fatal(err)
			}
			if envelope.Error.Message != tc.message {
				t.Fatalf("message = %q, want %q", envelope.Error.Message, tc.message)
			}
		})
	}
}

func TestInfrastructureErrorMapping(t *testing.T) {
	for _, tc := range []struct {
		name   string
		err    error
		status int
		code   string
	}{
		{"deadline", context.DeadlineExceeded, 504, "timeout"},
		{"deadlock", &pgconn.PgError{Code: "40P01"}, 503, "temporarily_unavailable"},
		{"connection", &pgconn.PgError{Code: "08006"}, 503, "service_unavailable"},
		{"unknown", errors.New("boom"), 500, "internal_error"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			fs := &fakeStore{playerStatus: func(context.Context, string) (domain.PlayerStatus, error) { return "", tc.err }}
			assertResponse(t, request(t, testServer(fs), "GET", "/players/"+playerID+"/status", "", true), tc.status, tc.code)
		})
	}
}
