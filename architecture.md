# NOXCAT Backend Structure (MVP — blockchain-ready)

> **Implementation status:** 本文件描述未來正式後端。現在前端所使用的 `src/demo-backend/` 是瀏覽器內的測試替身，不是此架構的實作，也不具備任何安全性或資產權威性。測試方式請見 `docs/TEST_BACKEND.md`。

## Stack
- **Language**: Go
- **DB**: PostgreSQL (via `pgxpool`)
- **Auth**: bcrypt password hashing + JWT (HS256)
- **Realtime**: WebSocket for trade notifications
- **Async**: in-process goroutines (no message queue at MVP)

## Design Principles
1. Backend is the **single source of truth** for anything that changes ownership or permanently changes stats. Frontend runs pinball physics/battle locally against a locked snapshot; backend validates and commits the result. No mid-battle network calls.
2. Ownership-changing operations (trades, battle settlement) use **Postgres row-level locks** (`FOR UPDATE`), not application-level distributed locks.
3. Keep infra minimal at MVP — no message queue, no Redis, no microservices, no read replicas — until real traffic numbers justify it.

---

## Database Schema

### `players`
| column | type | notes |
|---|---|---|
| id | uuid | PK — later can map to wallet address |
| username | text | unique |
| password_hash | text | bcrypt hash |
| role | enum | `player` / `admin` |
| money | int | |
| created_at | timestamp | |

### `units` (future NFT candidates)
| column | type | notes |
|---|---|---|
| id | uuid | PK — future `tokenId` |
| owner_id | uuid | FK → players.id — future wallet address |
| species | enum | generic / fire / wind / water |
| base_stats | jsonb | `{atk, hp, def, spd}` |
| current_stats | jsonb | after treasure bonuses etc. |
| equipped_treasure_id | uuid, nullable | FK → treasures.id |
| is_permanent | bool | true for generic (never falls), false for elemental |
| is_alive | bool | elemental units can become false (falls) |
| created_at | timestamp | |
| **index** | `owner_id` | "get my units" lookups |
| **index** | `(owner_id, is_alive)` | battle-start queries |

### `treasures` (future NFT candidates / consumables)
| column | type | notes |
|---|---|---|
| id | uuid | PK |
| owner_id | uuid | FK → players.id |
| damage_bonus | int | e.g. +1 |
| equipped_by_unit_id | uuid, nullable | enforces "only 1 treasure per unit" |
| created_at | timestamp | |
| **index** | `owner_id` | same pattern as units |
| **index** | `equipped_by_unit_id` | enforce 1-treasure-per-unit lookup |

### `dungeons`
| column | type | notes |
|---|---|---|
| id | uuid | PK |
| name | text | |
| enemy_config | jsonb | list of enemy units + stats |
| reward_money | int | |
| reward_drops | jsonb, nullable | |

### `trades`
| column | type | notes |
|---|---|---|
| id | uuid | PK |
| from_player_id | uuid | |
| to_player_id | uuid | |
| unit_id / treasure_id | uuid | asset being transferred |
| status | enum | pending / accepted / rejected |
| created_at | timestamp | |
| **index** | `(to_player_id, status)` | "pending trades for me" |
| **index** | `(from_player_id, status)` | same, other direction |

---

## Auth

### Password handling
- `golang.org/x/crypto/bcrypt`, `DefaultCost` — never store plaintext, never roll custom hashing.

### JWT
- `golang-jwt/jwt` v5, HS256, secret from env var.
- Claims: `player_id`, `role`, expiry (~24h). No refresh tokens at MVP.

```go
type Claims struct {
    PlayerID string `json:"player_id"`
    Role     string `json:"role"` // "player" or "admin"
    jwt.RegisteredClaims
}
```

### Middleware
```go
func RequireAuth(next http.Handler) http.Handler   // verifies JWT, sets context
func RequireAdmin(next http.Handler) http.Handler  // must run after RequireAuth, checks role
```

- Public: `POST /auth/register`, `POST /auth/login` (rate-limited per IP, simple in-memory counter at MVP)
- Player-only: battle, trade, my units → `RequireAuth`
- Admin-only: manage dungeons, ban players, adjust economy → `RequireAuth` + `RequireAdmin`

---

## Core API Endpoints

### Auth
- `POST /auth/register` — create player, hash password, grant starting units (3 generic + 1 each fire/wind/water)
- `POST /auth/login` — verify password, issue JWT

### Player / Units
- `GET /players/:id/units` — list owned units *(RequireAuth)*

### Battle
- `POST /battles/start` *(RequireAuth)*
  - Input: dungeon_id (player_id from JWT)
  - Output: locked stats snapshot of player's chosen 3 units, enemy_config from dungeon, RNG seed
  - Read-only — no DB write
- `POST /battles/result` *(RequireAuth)*
  - Input: battle_seed, unit snapshot used, action log, claimed outcome
  - Server **re-runs deterministic combat math** (damage/turn resolution, not full physics) to verify
  - On success: commits HP/death changes to `units`, awards money/drops, updates progress
  - On mismatch: rejected, no state change

### Treasures
- `POST /treasures/:id/equip` *(RequireAuth)* — enforces 1-per-unit, updates `current_stats`

### Trading
- `POST /trades` *(RequireAuth)* — create offer
- `POST /trades/:id/accept` *(RequireAuth)* — atomic transfer via `TransferUnit()`, pushes WebSocket notification to the other party
- `POST /trades/:id/reject` *(RequireAuth)*

### Admin
- `POST /admin/dungeons` *(RequireAuth + RequireAdmin)* — create/edit dungeon configs
- `POST /admin/players/:id/ban` *(RequireAuth + RequireAdmin)*

### WebSocket
- `GET /ws` *(RequireAuth on handshake)* — client connects, server keeps `map[playerID]*Connection` (mutex-protected) registry; pushes trade-created/trade-accepted events to the relevant player if online

---

## Concurrency Strategy

- **Row-level locking**, not global locks:
  ```sql
  BEGIN;
  SELECT * FROM units WHERE id = $1 FOR UPDATE;
  -- check ownership, mutate, commit
  COMMIT;
  ```
- For trade acceptance, lock both unit row and both player rows **in a consistent order** (e.g. lower player_id first) to avoid deadlocks between simultaneous trades.
- **No dedicated worker pool for requests** — Go's `net/http` already handles each request in its own goroutine; this scales naturally.
- **Async side-effects** (WebSocket push, logging) fire via goroutine after commit: `go func() { notifyTrade(...) }()`. No message queue needed at MVP scale.
- **Connection pooling**: `pgxpool`, `MaxConns` ~20-50 to start, tune under load.

---

## Key Internal Functions (abstraction for future blockchain swap)

```go
// Today: DB update inside a locked transaction. Later: swap internals to call smart contract transfer.
func TransferUnit(unitID, fromPlayerID, toPlayerID string) error

// Called at battle end after validation
func SettleBattle(battleResult BattleResult) error

// Deterministic re-simulation used to validate client-submitted battle results
func ValidateBattleResult(seed string, unitSnapshot []Unit, actionLog []Action) (BattleOutcome, error)
```

Keeping asset transfer and battle settlement behind these function boundaries means trade/battle UIs never touch the DB directly — swapping DB-backed ownership for on-chain ownership later only touches these functions.

---

## Explicitly NOT built at MVP
- No 助戰 (assist battle) — deferred
- No message queue (Kafka/RabbitMQ) — goroutines + channels cover async needs
- No Redis — Postgres + in-memory WS registry sufficient until multiple server instances
- No microservices split — one Go binary, one Postgres instance
- No read replicas — premature before real traffic data
- No refresh tokens / OAuth — short-lived JWT + re-login is enough for now

---

## What's NOT synced mid-battle
Pinball physics, bounce positions, animations, and turn-by-turn visual state stay entirely client-side. Only two backend calls per battle: **start** (fetch snapshot) and **result** (submit + validate + commit).
