.PHONY: db-up db-down run test test-db

db-up:
	docker compose up -d --wait postgres

db-down:
	docker compose down

run:
	set -a; . ./.env; set +a; go run ./cmd/server

test:
	TEST_DATABASE_URL="$${TEST_DATABASE_URL:-postgres://noxcat:noxcat@localhost:5432/noxcat_test?sslmode=disable}" go test ./...

test-db:
	TEST_DATABASE_URL="$${TEST_DATABASE_URL:-postgres://noxcat:noxcat@localhost:5432/noxcat_test?sslmode=disable}" go test ./internal/database -count=1
