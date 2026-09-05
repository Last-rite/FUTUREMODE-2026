# NOXCAT HTTP API Contract

This document is the contract for the HTTP handler layer. Handlers validate
transport input and authorization before calling application services or the
PostgreSQL store. Store errors are not returned to clients verbatim.

## Conventions

- Base content type: `application/json`.
- Authentication: `Authorization: Bearer <JWT>` unless an endpoint is public.
- IDs are canonical UUID strings.
- Timestamps are RFC 3339 UTC strings.
- Unknown JSON fields are rejected.
- Request bodies are limited before decoding. The initial limit is 1 MiB.
- A body must contain exactly one JSON object; trailing JSON is rejected.
- Successful responses use JSON except for `204 No Content`.
- Password hashes, internal PostgreSQL errors, SQL, and stack traces are never
  included in a response.

### Error envelope

```json
{
  "error": {
    "code": "invalid_request",
    "message": "request validation failed",
    "fields": {
      "username": "must contain 3 to 32 characters"
    },
    "request_id": "01J..."
  }
}
```

`fields` is optional and is only used for handler validation failures.
`request_id` is copied from the request context and can be used to find the
corresponding internal log entry.

## Handler boundary and trust model

Every JSON handler follows this order:

1. Enforce method, content type, and body-size limits.
2. Strictly decode the transport DTO.
3. Validate required fields, lengths, UUID syntax, enum values, cardinality,
   duplicate IDs, and mutually exclusive fields.
4. Authenticate the JWT and authorize the authenticated player or admin.
5. Call an application service for business validation.
6. Call the store for authoritative ownership/state checks and persistence.
7. Map known domain errors using `errors.Is`; log and hide every other error.

HTTP request bodies must not be decoded directly into persistence models such
as `domain.BattleResult` or `domain.NewPlayer`. The handler or service builds
those values after validation. In particular, battle money, drops, unit state,
player ID, role, and password hash are server-derived values.

Validation in the handler does not replace transactional store validation.
Ownership, current status, loadout availability, and trade state can change
between requests and must still be checked while database rows are locked.

## Status code policy

| Status | Meaning |
|---|---|
| `400 Bad Request` | Malformed JSON, unknown fields, invalid UUID/enum, missing field, invalid length, duplicate IDs, or an invalid field combination caught by the handler. |
| `401 Unauthorized` | Missing, malformed, expired, or invalid JWT; invalid login credentials. |
| `403 Forbidden` | Authenticated caller lacks the required role or does not own the requested resource; banned player. |
| `404 Not Found` | Requested player, unit, treasure, dungeon, or trade does not exist. |
| `409 Conflict` | Valid request conflicts with current state: duplicate username, busy player, stale trade, unavailable unit, full loadout, or equipment conflict. |
| `422 Unprocessable Entity` | A structurally valid battle result does not match its durable battle session or allowed final-state bounds. |
| `429 Too Many Requests` | Authentication rate limit exceeded. |
| `500 Internal Server Error` | Handler/service invariant violation, unexpected store sentinel, PostgreSQL constraint error, scan/decode failure, or other unclassified internal failure. |
| `503 Service Unavailable` | Database connection is unavailable before the request can be processed. |
| `504 Gateway Timeout` | The server-side request/database deadline expires. |

Client disconnect cancellation should stop work and be logged; the server may
not be able to deliver a response.

## Store error mapping

The mapping is operation-specific. A sentinel that proves a handler bug in one
operation can represent a legitimate state race in another.

### Safe global mappings

These are expected store outcomes. Their messages are safe to return exactly as
shown; they must not be collapsed into `500`.

| Domain error | HTTP status | Response code | Client message |
|---|---:|---|---|
| `ErrPlayerNotFound` | `404` | `player_not_found` | `player not found` |
| `ErrUnitNotFound` | `404` | `unit_not_found` | `unit not found` |
| `ErrTreasureNotFound` | `404` | `treasure_not_found` | `treasure not found` |
| `ErrDungeonNotFound` | `404` | `dungeon_not_found` | `dungeon not found` |
| `ErrTradeNotFound` | `404` | `trade_not_found` | `trade not found` |
| `ErrUsernameTaken` | `409` | `username_taken` | `username already exists` |
| `ErrPlayerBanned` | `403` | `player_banned` | `player is banned` |
| `ErrPlayerBusy` | `409` | `player_busy` | `player is not idle` |
| `ErrPlayerNotInCombat` | `409` | `player_not_in_combat` | `player is not in combat` |
| `ErrTradeNotPending` | `409` | `trade_not_pending` | `trade is not pending` |
| `ErrTradeRecipient` | `403` | `invalid_trade_recipient` | `player is not the trade recipient` |
| `ErrTradeSender` | `403` | `invalid_trade_sender` | `player is not the trade sender` |
| `ErrAssetReserved` | `409` | `asset_reserved` | `asset is reserved by a pending trade` |
| `ErrAlreadyEquipped` | `409` | `already_equipped` | `treasure is equipped to another unit` |
| `ErrBattleLoadoutFull` | `409` | `battle_loadout_full` | `battle loadout already has three units` |
| `ErrUnitUnavailable` | `409` | `unit_unavailable` | `unit is not alive and available` |
| `ErrBattleExpired` | `409` | `battle_expired` | `battle session has expired` |
| `ErrBattleNotActive` | `409` | `battle_not_active` | `battle session is not active` |

Specific not-found errors take precedence over the wrapped generic
`ErrNotFound` sentinel.

### Store guard errors that normally indicate a server bug

These mappings apply only after the handler has completed the validation
required by this contract.

| Store method | Domain error | Default status | Reason |
|---|---|---:|---|
| `CreatePlayer` | `ErrInvalidInput` | `500` | Username, password hash, and starting money are server-validated or server-generated. |
| `CreatePlayer` | `ErrBattleLoadoutFull` | `500` | The server, not the client, constructs the starting roster. |
| `CreateDungeon`, `UpdateDungeon` | `ErrInvalidInput` | `500` | The admin DTO must be validated first. |
| `SetBattleLoadout` | `ErrInvalidUnitSelection` | `500` | The handler must reject more than three IDs and duplicate IDs. |
| `SetUnitEquipped`, `EquipTreasure` | `ErrInvalidInput` | `500` | Path/body UUIDs and authenticated player ID must already be valid. |
| `CreateTrade` | `ErrInvalidTradeAsset` | `500` | The handler must enforce distinct players, exactly one offered asset, and a valid requested bundle. |
| `AcceptTrade` | `ErrInvalidTradeAsset` | `500` | Persisted offered/requested assets violate a database/application invariant. |
| `SettleBattle` | `ErrInvalidInput` | `500` | A trusted battle service constructs the settlement after validating the durable session and bounded final state. |

Bare `ErrNotFound` without a specific resource sentinel is also `500`; store
not-found paths are expected to wrap a specific error such as
`ErrUnitNotFound`.

### Escaped validation is always 5xx

The location where an error is detected determines its status:

| Condition | Detected by handler | Escapes into store/service |
|---|---:|---:|
| Missing required string or UUID | `400 invalid_request` | `500 internal_error` |
| Malformed UUID rejected by PostgreSQL | not applicable | `500 internal_error` |
| More than three or duplicate loadout IDs | `400 invalid_request` | `500 internal_error` |
| Trade has both asset IDs or neither | `400 invalid_request` | `500 internal_error` |
| Sender and recipient are the same | `400 invalid_request` | `500 internal_error` |
| Invalid dungeon JSON, name, or negative reward | `400 invalid_request` | `500 internal_error` |
| Invalid trusted settlement, duplicate unit IDs, or negative award | not client-controlled | `500 internal_error` |
| Invalid server-generated starting roster or money | not client-controlled | `500 internal_error` |

An escaped validation error must not be changed back to `400`, because doing so
would hide a handler/service defect and incorrectly blame the client after its
request already passed validation.

This rule does not apply when a shared sentinel represents a separately
documented transactional state outcome. For example, `AdjustPlayerMoney`
returns `ErrInvalidInput` when a valid delta would make the stored balance
negative; that specific case remains `409 insufficient_balance`.

Unexpected persistence failures use these mappings:

| Internal error | HTTP status | Response code |
|---|---:|---|
| Untranslated `pgx.ErrNoRows` | `500` | `internal_error` |
| PostgreSQL invalid-text, not-null, check, enum, or unrecognized unique violation | `500` | `internal_error` |
| JSON scan/unmarshal or row scan failure | `500` | `internal_error` |
| Transaction begin/query/commit failure not classified below | `500` | `internal_error` |
| PostgreSQL connection unavailable or SQLSTATE connection exception | `503` | `service_unavailable` |
| Server-side database/request deadline | `504` | `timeout` |
| PostgreSQL deadlock (`40P01`) | `503` | `temporarily_unavailable` |

Raw PostgreSQL messages are logged internally and never used as the public
message. A known state sentinel still takes precedence over these fallback
rules.

These errors must be logged with request ID, operation, authenticated player
ID, and the wrapped internal error. The client receives only:

```json
{
  "error": {
    "code": "internal_error",
    "message": "an internal error occurred",
    "request_id": "01J..."
  }
}
```

### Context-dependent mappings

These are also expected client-facing outcomes, not internal errors.

| Operation | Domain error | HTTP status | Response code | Client message |
|---|---|---:|---|---|
| Start battle | `ErrInvalidUnitSelection` | `409` | `battle_loadout_unavailable` | `battle loadout has no available units` |
| Equip/loadout/create trade | `ErrAssetNotOwned` | `403` | `asset_not_owned` | `asset is not owned by player` |
| Accept trade | `ErrAssetNotOwned` | `409` | `trade_asset_unavailable` | `trade asset is no longer available` |
| Settle battle | `ErrAssetNotOwned` | `409` | `battle_state_changed` | `battle unit ownership changed` |
| Adjust money | `ErrInvalidInput` after a valid delta | `409` | `insufficient_balance` | `adjustment would make the balance negative` |

The handler must not rely on error-string comparison. It uses `errors.Is` and
checks the most specific sentinels first. The public message comes from the
tables above, not directly from `err.Error()`, because wrapped errors may
contain internal operation or PostgreSQL details.

Operation-specific mappings run before the default mapping. For example,
`AcceptTrade` maps `ErrAssetNotOwned` to `409 trade_asset_unavailable`, while
an equip request maps the same sentinel to `403 asset_not_owned`. Only after
known global and operation-specific cases are exhausted does the handler emit
`500 internal_error`.

## Public endpoints

### `POST /auth/register`

Creates a player, hashes the password with bcrypt, and grants the configured
starting roster. The server selects which starting units are initially active;
the client cannot submit money, role, units, status, or password hash.

Request:

```json
{
  "username": "alice_01",
  "password": "correct horse battery staple"
}
```

Handler validation:

- `username`: required, 3–32 characters, ASCII letters, digits, or underscore.
- `password`: required, 8–72 bytes. The byte limit matches bcrypt input limits.
- Reject leading/trailing whitespace rather than silently normalizing it.

Response: `201 Created`

```json
{
  "player": {
    "id": "uuid",
    "username": "alice_01",
    "role": "player",
    "money": 100,
    "status": "idle",
    "is_banned": false,
    "created_at": "2026-09-05T00:00:00Z"
  }
}
```

Errors:

- `400 invalid_request`
- `409 username_taken`
- `429 rate_limited`
- `500 internal_error`

### `POST /auth/login`

Request:

```json
{
  "username": "alice_01",
  "password": "correct horse battery staple"
}
```

The handler applies the same length validation as registration, loads the
player by username, checks bcrypt, rejects banned players, and creates a
24-hour HS256 JWT containing `player_id` and `role`.

Response: `200 OK`

```json
{
  "access_token": "jwt",
  "token_type": "Bearer",
  "expires_in": 86400
}
```

To avoid account enumeration, an unknown username and incorrect password both
return `401 invalid_credentials`. `ErrPlayerNotFound` is therefore not mapped
to `404` in this handler.

## Authenticated player endpoints

For `/players/{player_id}/...`, the authenticated player ID must match the path
ID unless the caller is an admin. This authorization check happens before the
store query.

### `GET /players/{player_id}`

Returns the authenticated player's public profile, including money, current
status, and `active_loadout_slot`. Password data is never returned.

### `GET /dungeons`

Returns all playable dungeons ordered by `sort_order`. A fresh schema includes
the two initial MVP dungeons. This endpoint is authenticated.

### `GET /players/{player_id}/units`

Response: `200 OK`

```json
{
  "units": [
    {
      "id": "uuid",
      "owner_id": "uuid",
      "species": "generic",
      "base_stats": {"atk": 5, "hp": 20, "def": 3, "spd": 4},
      "current_stats": {"atk": 5, "hp": 20, "def": 3, "spd": 4},
      "equipped_treasure_id": null,
      "is_permanent": true,
      "is_alive": true,
      "is_equipped": true,
      "created_at": "2026-09-05T00:00:00Z"
    }
  ]
}
```

Errors: `400 invalid_request`, `403 forbidden`, `404 player_not_found`.

### `PUT /players/{player_id}/loadout`

Atomically replaces the active battle loadout.

Request:

```json
{
  "unit_ids": ["uuid-1", "uuid-2", "uuid-3"]
}
```

Handler validation:

- `unit_ids` is required and contains zero to three canonical UUIDs.
- IDs must be unique.
- An empty array clears the loadout; `null` is rejected.

The store authoritatively checks ownership and availability while holding the
player lock. Loadout changes are rejected while the player is in combat.
Errors: `403 asset_not_owned`, `404 unit_not_found`, `409 unit_unavailable`,
`409 player_busy`, and `500 internal_error` if the store still reports an
invalid selection after handler validation.

Response: `204 No Content`.

### `GET /players/{player_id}/loadouts`

Returns all five persisted presets. Each resource contains `slot` (1–5) and
its ordered `unit_ids` array.

### `PUT /players/{player_id}/loadouts/{slot}`

Replaces one preset with zero to three unique, living, owned unit IDs. Editing
an inactive preset does not alter compatibility `is_equipped` flags.

### `PUT /players/{player_id}/loadouts/active`

Request: `{"slot":2}`. Activates a saved preset and atomically updates the
legacy unit flags. All preset mutations are rejected during combat.

### `GET /players/{player_id}/treasures`

Returns owned equipment instances with display identity, rarity, type, all
four stat bonuses, optional `effect_code`/`charges`, and equipment linkage.

### `GET /players/{player_id}/status`

Response: `200 OK`

```json
{"status":"idle"}
```

Errors: `400 invalid_request`, `403 forbidden`, `404 player_not_found`.

### `GET /players/{player_id}/dungeons`

Returns dungeons solved by the player.

Response: `200 OK`

```json
{"dungeons":[]}
```

Errors: `400 invalid_request`, `403 forbidden`, `404 player_not_found`.

## Battle endpoints

### `POST /battles/start`

The player ID comes only from the verified JWT.

Request:

```json
{"dungeon_id":"uuid"}
```

The handler validates the UUID and calls the battle service. The store locks
the player, loads one to three living equipped units, and changes the status to
`in_combat` atomically.

Response: `200 OK`

```json
{
  "battle_seed": "server-generated-battle-token",
  "dungeon": {
    "id": "uuid",
    "name": "First Dungeon",
    "enemy_config": []
  },
  "units": []
}
```

Errors:

- `400 invalid_request`
- `403 player_banned`
- `404 dungeon_not_found`
- `409 player_busy`
- `409 battle_loadout_unavailable`

### `POST /battles/result`

Request DTO:

```json
{
  "battle_seed": "server-issued-battle-token",
  "unit_snapshot": [],
  "action_log": [],
  "claimed_outcome": "won"
}
```

Handler validation checks required fields, collection limits, and payload
size. For the current MVP, `unit_snapshot` is the client-reported final unit
state. The battle service hashes the opaque token and loads its durable
PostgreSQL session, then verifies the authenticated player,
unit membership, immutable fields, and HP/alive bounds, but does not replay
combat. `action_log` is optional and currently ignored so the frontend may
retain it for a future replay implementation. The client does not submit
trusted `player_id`, `money_award`, `treasure_drops`, or dungeon identity.
The service constructs `domain.BattleResult` from server-held battle-start
state and the bounded final HP/alive report.

During the settlement transaction, an equipped `home_stone` with a positive
charge changes a non-permanent unit's fatal result to 1 HP and consumes one
charge. Settlement locks units and then treasures in UUID order, matching the
equipment mutation order. A depleted stone does not prevent a later death.

On successful validation and settlement: `204 No Content`.

An unknown, malformed, or foreign token returns the mismatch below without
resetting any battle. An invalid final state cancels only the verified
player-owned session and returns:

```text
422 battle_result_mismatch
```

If cancelling the verified invalid session fails, log the complete error and
return `500 internal_error`; do not report a successful reset.

Other errors: `404 dungeon_not_found`, `409 player_not_in_combat`, and
`409 battle_state_changed`, `409 battle_expired`, and `409 battle_not_active`.

### `POST /battles/cancel`

Request:

```json
{"battle_seed":"server-issued-battle-token"}
```

The token must resolve to a session owned by the authenticated player. Active
sessions are atomically marked `cancelled` and the player is returned to
`idle`. Repeating cancellation for the same cancelled session is idempotent.
An unknown or foreign token never resets the player's current battle.

Response: `204 No Content`.

## Treasure endpoint

### `POST /treasures/{treasure_id}/equip`

Request:

```json
{"unit_id":"uuid"}
```

The authenticated player ID is passed as the owner ID. The handler validates
both UUIDs before calling the service/store.

Response: `204 No Content`.

Errors: `404 unit_not_found`, `404 treasure_not_found`, `403 asset_not_owned`,
`409 already_equipped`, and `409 player_busy` during combat.

### `DELETE /treasures/{treasure_id}/equip`

Idempotently removes the treasure from its current unit and restores that
unit's current stats to base stats. It uses the same player → units → treasures
lock order as equip and returns `204 No Content`.

## Trade endpoints

### `GET /trades?status=pending`

Lists trades involving the authenticated player. `status` is optional and, if
present, must be `pending`, `accepted`, `rejected`, or `cancelled`.

Response: `200 OK`

```json
{"trades":[]}
```

Every trade includes an ordered `requested_assets` array. An empty array is a
one-way gift; a non-empty array is a bidirectional exchange.

### `GET /players/{player_id}/trade-assets`

Returns only the target player's assets that are currently eligible for a
trade: living, non-permanent, inactive units without equipment, plus unequipped
treasures. Assets reserved by another pending offer are omitted. Any
authenticated player may query this restricted view to select exact asset IDs;
the endpoint never reserves the target player's inventory.

Response: `200 OK` with `units` and `treasures` arrays.

### `POST /trades`

Request with a unit:

```json
{
  "to_player_id": "uuid",
  "unit_id": "uuid",
  "requested_assets": [
    {"treasure_id": "uuid"},
    {"treasure_id": "uuid"}
  ]
}
```

Request with a treasure:

```json
{
  "to_player_id": "uuid",
  "treasure_id": "uuid",
  "requested_assets": []
}
```

Handler validation:

- `to_player_id` is a valid UUID and differs from the JWT player ID.
- Exactly one of `unit_id` and `treasure_id` is present and valid.
- `requested_assets` is either empty, exactly one unit, or one to ten distinct
  treasure instances. Unit/treasure mixtures and repeated IDs are rejected.
- Supplying both or neither returns `400 invalid_request`; it must not reach
  the store as `ErrInvalidTradeAsset`.

Response: `201 Created` with the trade resource.

Creation reserves only the authenticated sender's offered asset. The requested
assets are checked against the recipient's current ownership and availability,
but are deliberately not reserved; this prevents a malicious sender from
locking another player's inventory. An offered unit must be living,
non-permanent, inactive, and carry no treasure. An offered treasure must be
unequipped. A sender may create a proposal during combat only with a separate
eligible asset that is not in the active battle loadout.

Errors: `404 player_not_found`, `404 unit_not_found`,
`404 treasure_not_found`, `403 asset_not_owned`, `409 already_equipped`,
`409 unit_unavailable`, and `409 asset_reserved`.

### `POST /trades/{trade_id}/accept`

The recipient ID comes from the JWT. The store locks the trade, both players in
UUID order, all involved units in UUID order, all involved treasures in UUID
order, and finally loadout memberships. It revalidates ownership,
transferability, and all reservations before changing any owner. The offered
asset and every requested asset transfer in one transaction; any stale asset
rolls the entire exchange back.

Response: `200 OK` with the accepted trade.

Errors: `404 trade_not_found`, `403 invalid_trade_recipient`,
`409 trade_not_pending`, `409 trade_asset_unavailable`, and `409 player_busy`
when either participant is in combat, plus `409 asset_reserved` if a requested
asset has since been offered in another pending trade. A failed acceptance
leaves the trade pending and preserves the sender's reservation.

### `POST /trades/{trade_id}/reject`

Response: `200 OK` with the rejected trade.

Errors: `404 trade_not_found`, `403 invalid_trade_recipient`,
`409 trade_not_pending`.

Rejection atomically changes the status and releases the sender's reservation.

### `POST /trades/{trade_id}/cancel`

Only the authenticated sender may cancel a pending trade. Cancellation changes
the status to `cancelled`, releases the sender's reservation, and leaves all
ownership unchanged.

Errors: `404 trade_not_found`, `403 invalid_trade_sender`,
`409 trade_not_pending`.

Trade WebSocket notifications are sent only after the database transaction
commits. Notification failure never changes an already committed REST response.

## WebSocket trade notifications

### `GET /ws?token={access_token}`

Opens a WebSocket authenticated with the same JWT issued by login. The query
must contain exactly one non-empty `token`; missing, duplicate, or invalid
tokens fail the HTTP handshake with `401 unauthorized`. Browser origin checks
use the WebSocket library's same-origin policy.

Every open connection for the authenticated player receives relevant events,
so separate tabs and devices remain updated. Event types are:

- `trade.created`, delivered to the recipient after offer creation commits.
- `trade.accepted`, delivered to the sender after acceptance commits.
- `trade.rejected`, delivered to the sender after rejection commits.
- `trade.cancelled`, delivered to the recipient after cancellation commits.

Each message contains the complete current trade resource:

```json
{
  "type": "trade.created",
  "trade": {
    "id": "uuid",
    "from_player_id": "uuid",
    "to_player_id": "uuid",
    "unit_id": "uuid",
    "treasure_id": null,
    "requested_assets": [{"treasure_id":"uuid"}],
    "status": "pending",
    "created_at": "2026-09-06T00:00:00Z"
  }
}
```

Delivery is best-effort: offline or slow clients must refresh `GET /trades` to
recover the durable state. The server sends ping frames and removes connections
that disconnect or stop answering. Graceful application shutdown closes all
active WebSocket connections.

## Admin endpoints

All admin endpoints run authentication and admin-role middleware before body
decoding, preventing unauthorized callers from probing validation behavior.

### `POST /admin/dungeons`

Creates a dungeon.

Request:

```json
{
  "name": "First Dungeon",
  "enemy_config": [],
  "reward_money": 25,
  "reward_drops": null
}
```

Validation: non-empty name, valid bounded enemy configuration, non-negative
reward, and valid reward-drop structure. Response: `201 Created`.

### `PUT /admin/dungeons/{dungeon_id}`

Uses the same body validation as creation and returns the updated dungeon with
`200 OK`. A missing dungeon returns `404 dungeon_not_found`.

### `POST /admin/players/{player_id}/ban`

No request body. Response: `204 No Content`. A missing player returns
`404 player_not_found`.

### `POST /admin/players/{player_id}/money`

Request:

```json
{"delta":25}
```

The handler validates an application-configured absolute adjustment limit.
The store prevents a negative resulting balance. Response: `204 No Content`.
An adjustment that would make the balance negative returns
`409 insufficient_balance`; a missing player returns `404 player_not_found`.

## Internal failure handling

Handlers log the complete wrapped error but never expose it. Logs should
include:

- request ID;
- route and method;
- authenticated player ID and role when available;
- domain operation;
- duration;
- HTTP status;
- complete wrapped error.

Do not log passwords, JWTs, password hashes, full action logs, or database URLs.
If response headers have already been written, log the failure and close the
response; do not attempt to write a second JSON error.
