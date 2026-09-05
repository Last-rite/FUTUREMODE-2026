package database_test

import (
	"context"
	"testing"

	"github.com/Ian747-tw/noxcat_game_backend/internal/database"
)

func TestOpenRequiresDatabaseURL(t *testing.T) {
	pool, err := database.Open(context.Background(), "")
	if err == nil {
		pool.Close()
		t.Fatal("Open() error = nil, want an error")
	}
}

func TestOpenRejectsMalformedDatabaseURL(t *testing.T) {
	pool, err := database.Open(context.Background(), "://not-a-database-url")
	if err == nil {
		pool.Close()
		t.Fatal("Open() error = nil, want parse error")
	}
}
