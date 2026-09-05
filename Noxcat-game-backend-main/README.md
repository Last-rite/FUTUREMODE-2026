# NOXCAT backend

## Local database

The backend uses PostgreSQL through `pgxpool`. Start PostgreSQL with:

```sh
docker compose up -d --wait postgres
```

This creates both `noxcat` (development) and `noxcat_test` (tests), then applies
the ordered SQL files in `migrations/` to both databases. Copy the example
environment variables before running the application:

```sh
cp .env.example .env
```

Run all tests with `make test`, or verify the test database connection with
`make test-db`.

Table definitions and indexes are intentionally kept in separate migrations.
Add new migrations with an increasing numeric prefix so PostgreSQL applies them
in a deterministic order.

The HTTP endpoint, validation, and error-mapping contract is documented in
[`docs/api.md`](docs/api.md).

Set `JWT_SECRET` to an independently generated value of at least 32 bytes; the
example value is a development placeholder and must not be used in production.
Battle session tokens are generated randomly, stored only as SHA-256 hashes,
and persisted with their trusted snapshots in PostgreSQL.

Run the API server after exporting the variables from `.env`:

```sh
set -a
. ./.env
set +a
go run ./cmd/server
```

To serve the production Vite build from this same process, set `STATIC_DIR` to
the directory containing `index.html` (for this workspace, the parent
`dist/` directory). API and WebSocket paths continue to use the same origin;
unknown GET paths fall back to the SPA entry point. The root `Dockerfile`
builds this combined deployment with `VITE_BACKEND_MODE=http`.

The process handles `SIGINT` and `SIGTERM`, stops the battle-session cleanup
worker, lets in-flight HTTP requests complete within `SHUTDOWN_TIMEOUT`, and
then closes the PostgreSQL pool.
