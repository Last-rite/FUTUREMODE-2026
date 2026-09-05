# NOXCAT Backend Structure (MVP — blockchain-ready)

## Stack
- **Language**: Go
- **DB**: PostgreSQL (via `pgxpool`)
- **Auth**: bcrypt password hashing + JWT (HS256)
- **Realtime**: WebSocket for trade notifications
- **Async**: in-process goroutines (no message queue at MVP)

## Design Principles
1. Backend is the **single source of truth** for ownership, immutable stats, rewards, and player state. For the current MVP, the frontend runs battle locally and reports final HP/alive state; the backend bounds that report against the locked start snapshot and commits it. No mid-battle network calls.
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
| status | enum | `idle` / `in_combat` / `trading` (extendable) |
| created_at | timestamp | |

### `player_dungeon_progress`
| column | type | notes |
|---|---|---|
| id | uuid | PK |
| player_id | uuid | FK → players.id |
| dungeon_id | uuid | FK → dungeons.id |
| solved | bool | |
| solved_at | timestamp, nullable | |
| **index** | `(player_id, dungeon_id)` unique | one progress row per player per dungeon |
| **index** | `(player_id, solved)` | "which dungeons has this player solved" lookups |
| **index** | `dungeon_id` | supports dungeon FK checks and cascade deletion |

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
| is_equipped | bool | true when selected for the player's active battle loadout |
| created_at | timestamp | |
| **index** | `(owner_id, is_equipped)` | active battle loadout queries |

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

### `battle_sessions`
| column | type | notes |
|---|---|---|
| id | uuid | PK |
| player_id | uuid | FK → players.id |
| dungeon_id | uuid | FK → dungeons.id |
| token_hash | bytea | unique SHA-256 hash; raw token is returned only to the client |
| snapshot | jsonb | trusted dungeon/unit state captured at start |
| status | enum | active / settled / cancelled / expired |
| expires_at | timestamptz | abandoned-session deadline |
| completed_at | timestamptz, nullable | set for every terminal state |
| **index** | unique active `player_id` | one active battle per player |
| **index** | active `expires_at` | cleanup worker lookup |
| **index** | `dungeon_id` | supports dungeon FK checks |

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
| **index** | `unit_id` | supports unit FK checks |
| **index** | `treasure_id` | supports treasure FK checks |

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

The complete handler validation, response, and error-mapping contract is in
[`docs/api.md`](api.md).

### Auth
- `POST /auth/register` — create player (status: `idle`), hash password, grant starting units (3 generic + 1 each fire/wind/water)
- `POST /auth/login` — verify password, issue JWT

### Player / Units
- `GET /players/:id/units` — list owned units *(RequireAuth)*
- `GET /players/:id/status` — current status (idle/in_combat/trading) *(RequireAuth)*
- `GET /players/:id/dungeons` — list dungeons solved (from `player_dungeon_progress`) *(RequireAuth)*

### Battle
- `POST /battles/start` *(RequireAuth)*
  - Input: dungeon_id (player_id from JWT)
  - Atomically inserts a durable battle session and sets player status to `in_combat`
  - Output: locked stats snapshot of the player's living units where `is_equipped = true` (up to 3), enemy_config, and opaque battle token
- `POST /battles/result` *(RequireAuth)*
  - Input: battle_seed, final unit snapshot, optional action log, claimed outcome
  - Current MVP trusts the claimed win/loss and final HP/alive state after checking the hashed durable session token, player, unit membership, immutable stats, and legal HP bounds
  - On success: commits HP/death changes to `units`, awards money/drops, upserts `player_dungeon_progress` (solved = true), sets player `status = idle`
  - Unknown/foreign tokens are rejected without changing state; an invalid final state cancels only its verified session and resets that player to `idle`
- `POST /battles/cancel` *(RequireAuth)* — atomically cancels the verified player-owned session and resets status to `idle`
- Expired sessions are recovered during the next start and by the dedicated
  `battle.CleanupWorker` started by the application lifecycle. Each bounded
  cleanup sweep uses the same player-then-session lock order and transient
  sweep failures are logged and retried on the next interval.

### Treasures
- `POST /treasures/:id/equip` *(RequireAuth)* — enforces 1-per-unit, updates `current_stats`

### Trading
- `POST /trades` *(RequireAuth)* — create offer
- `POST /trades/:id/accept` *(RequireAuth)* — atomically transfers the offered asset after locking both players and rejecting combat participants, then pushes a WebSocket notification to the other party
- `POST /trades/:id/reject` *(RequireAuth)*

### Admin
- `POST /admin/dungeons` *(RequireAuth + RequireAdmin)* — create/edit dungeon configs
- `POST /admin/players/:id/ban` *(RequireAuth + RequireAdmin)*

---

## WebSocket (trade notifications)

- `GET /ws` — client connects with JWT (typically `?token=...` on handshake, since browsers can't set custom headers on the WS upgrade). Server verifies token before upgrading.
- Server keeps an in-memory `Hub` — `map[playerID]set[*client]`, guarded by a mutex — so every tab/device for a player can connect. Clients are registered after upgrade and removed on disconnect.
- **Trigger**: normal REST trade endpoints (`POST /trades`, `POST /trades/:id/accept`, and `POST /trades/:id/reject`) enqueue an event only after the store call has committed. Created offers notify the recipient; accepted/rejected offers notify the sender.
- **Delivery**: each socket has a bounded outbound channel and one write pump, preserving Gorilla's single-writer rule. Enqueue is non-blocking; offline or slow-client pushes are skipped because the durable state remains in Postgres and can be recovered through `GET /trades`. Ping/pong deadlines remove stale clients. No retry queue is used at MVP.
- **Shutdown**: the application closes the hub before draining HTTP handlers, which terminates hijacked WebSocket connections that `http.Server.Shutdown` does not own.
- **Scope limit**: this only works for a single backend instance — with multiple instances behind a load balancer, cross-instance delivery would need Redis pub/sub. Not needed yet.

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
- **Async side-effects** use bounded, non-blocking WebSocket queues after commit. Per-connection write pumps perform network I/O, so REST handlers never wait for a socket write. No message queue is needed at MVP scale.
- **Connection pooling**: `pgxpool`, `MaxConns` ~20-50 to start, tune under load.

---

## Key Internal Functions (abstraction for future blockchain swap)

```go
// Today: accepts and transfers the offered asset in one locked DB transaction.
// Later: the transfer step can call a smart contract without changing the HTTP API.
func AcceptTrade(tradeID, recipientID string) (Trade, error)

// Called at battle end after validation — updates units, progress, status
func SettleBattle(battleResult BattleResult) error

// Current MVP validates the battle session and bounds the reported final unit state.
// Deterministic replay can replace these internals later without changing HTTP or settlement storage.
func ValidateBattleResult(seed string, unitSnapshot []Unit, claimedOutcome string) (BattleResult, error)
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
Pinball physics, bounce positions, animations, and turn-by-turn visual state stay entirely client-side. Only two backend calls per battle: **start** (fetch snapshot, sets status) and **result** (submit + validate + commit, resets status).
