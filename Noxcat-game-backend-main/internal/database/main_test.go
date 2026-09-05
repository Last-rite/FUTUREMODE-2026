package database_test

import (
	"context"
	"fmt"
	"os"
	"testing"

	"github.com/Ian747-tw/noxcat_game_backend/internal/database"
	"github.com/jackc/pgx/v5/pgxpool"
)

var testPool *pgxpool.Pool

func TestMain(m *testing.M) {
	databaseURL := os.Getenv("TEST_DATABASE_URL")
	if databaseURL == "" {
		os.Exit(m.Run())
	}

	ctx := context.Background()
	pool, err := database.Open(ctx, databaseURL)
	if err != nil {
		fmt.Fprintf(os.Stderr, "open test database: %v\n", err)
		os.Exit(1)
	}

	var databaseName string
	if err := pool.QueryRow(ctx, `SELECT current_database()`).Scan(&databaseName); err != nil {
		fmt.Fprintf(os.Stderr, "identify test database: %v\n", err)
		pool.Close()
		os.Exit(1)
	}
	if databaseName != "noxcat_test" {
		fmt.Fprintf(os.Stderr, "refusing to reset non-test database %q\n", databaseName)
		pool.Close()
		os.Exit(1)
	}

	testPool = pool
	if err := resetDatabase(ctx); err != nil {
		fmt.Fprintf(os.Stderr, "initial test database reset: %v\n", err)
		pool.Close()
		os.Exit(1)
	}

	code := m.Run()
	if err := resetDatabase(ctx); err != nil {
		fmt.Fprintf(os.Stderr, "final test database reset: %v\n", err)
		code = 1
	}
	pool.Close()
	os.Exit(code)
}
