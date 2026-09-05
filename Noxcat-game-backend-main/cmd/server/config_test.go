package main

import (
	"testing"
	"time"

	"github.com/Ian747-tw/noxcat_game_backend/internal/domain"
)

func lookupFrom(values map[string]string) environmentLookup {
	return func(name string) (string, bool) {
		value, ok := values[name]
		return value, ok
	}
}

func TestLoadConfigDefaults(t *testing.T) {
	loaded, err := loadConfig(lookupFrom(map[string]string{
		"DATABASE_URL": "postgres://example",
		"JWT_SECRET":   "01234567890123456789012345678901",
	}))
	if err != nil {
		t.Fatal(err)
	}
	if loaded.httpAddress != ":8080" || loaded.jwtIssuer != "noxcat" ||
		loaded.battleSessionTTL != 2*time.Hour || loaded.cleanupInterval != time.Minute ||
		loaded.cleanupBatch != 100 || loaded.shutdownTimeout != 10*time.Second ||
		loaded.databaseTimeout != 10*time.Second || loaded.startingMoney != 100 {
		t.Fatalf("unexpected defaults: %+v", loaded)
	}
}

func TestLoadConfigOverrides(t *testing.T) {
	loaded, err := loadConfig(lookupFrom(map[string]string{
		"DATABASE_URL":             "postgres://example",
		"JWT_SECRET":               "01234567890123456789012345678901",
		"JWT_ISSUER":               "issuer",
		"HTTP_ADDRESS":             "127.0.0.1:9000",
		"STATIC_DIR":               "/srv/noxcat/public",
		"BATTLE_SESSION_TTL":       "30m",
		"BATTLE_CLEANUP_INTERVAL":  "10s",
		"BATTLE_CLEANUP_BATCH":     "25",
		"SHUTDOWN_TIMEOUT":         "3s",
		"DATABASE_CONNECT_TIMEOUT": "2s",
		"STARTING_MONEY":           "250",
	}))
	if err != nil {
		t.Fatal(err)
	}
	if loaded.httpAddress != "127.0.0.1:9000" || loaded.staticDir != "/srv/noxcat/public" || loaded.jwtIssuer != "issuer" ||
		loaded.battleSessionTTL != 30*time.Minute || loaded.cleanupInterval != 10*time.Second ||
		loaded.cleanupBatch != 25 || loaded.shutdownTimeout != 3*time.Second ||
		loaded.databaseTimeout != 2*time.Second || loaded.startingMoney != 250 {
		t.Fatalf("unexpected overrides: %+v", loaded)
	}
}

func TestLoadConfigRejectsMissingAndInvalidValues(t *testing.T) {
	tests := []map[string]string{
		{"JWT_SECRET": "01234567890123456789012345678901"},
		{"DATABASE_URL": "postgres://example"},
		{"DATABASE_URL": "postgres://example", "JWT_SECRET": "short"},
		{"DATABASE_URL": "postgres://example", "JWT_SECRET": "01234567890123456789012345678901", "BATTLE_SESSION_TTL": "never"},
		{"DATABASE_URL": "postgres://example", "JWT_SECRET": "01234567890123456789012345678901", "BATTLE_CLEANUP_INTERVAL": "0s"},
		{"DATABASE_URL": "postgres://example", "JWT_SECRET": "01234567890123456789012345678901", "BATTLE_CLEANUP_BATCH": "0"},
		{"DATABASE_URL": "postgres://example", "JWT_SECRET": "01234567890123456789012345678901", "STARTING_MONEY": "-1"},
	}
	for index, values := range tests {
		if _, err := loadConfig(lookupFrom(values)); err == nil {
			t.Errorf("case %d: loadConfig() error = nil", index)
		}
	}
}

func TestStartingRosterMatchesMVPContract(t *testing.T) {
	roster := startingRoster()
	if len(roster) != 6 {
		t.Fatalf("roster length = %d, want 6", len(roster))
	}
	equipped := 0
	species := make(map[domain.UnitSpecies]int)
	for _, unit := range roster {
		species[unit.Species]++
		if unit.IsEquipped {
			equipped++
		}
		if unit.BaseStats.Health <= 0 {
			t.Fatalf("unit has invalid starting stats: %+v", unit)
		}
	}
	if equipped != 3 || species[domain.UnitSpeciesGeneric] != 3 || species[domain.UnitSpeciesFire] != 1 ||
		species[domain.UnitSpeciesWind] != 1 || species[domain.UnitSpeciesWater] != 1 {
		t.Fatalf("unexpected starting roster: %+v", roster)
	}
}
