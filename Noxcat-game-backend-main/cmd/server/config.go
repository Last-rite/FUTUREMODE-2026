package main

import (
	"errors"
	"fmt"
	"strconv"
	"time"
)

type config struct {
	databaseURL      string
	jwtSecret        []byte
	jwtIssuer        string
	httpAddress      string
	battleSessionTTL time.Duration
	cleanupInterval  time.Duration
	cleanupBatch     int
	shutdownTimeout  time.Duration
	databaseTimeout  time.Duration
	startingMoney    int
}

type environmentLookup func(string) (string, bool)

func loadConfig(lookup environmentLookup) (config, error) {
	databaseURL, ok := lookup("DATABASE_URL")
	if !ok || databaseURL == "" {
		return config{}, errors.New("DATABASE_URL is required")
	}
	secret, ok := lookup("JWT_SECRET")
	if !ok || secret == "" {
		return config{}, errors.New("JWT_SECRET is required")
	}
	if len([]byte(secret)) < 32 {
		return config{}, errors.New("JWT_SECRET must contain at least 32 bytes")
	}

	result := config{databaseURL: databaseURL, jwtSecret: []byte(secret)}
	result.jwtIssuer = stringValue(lookup, "JWT_ISSUER", "noxcat")
	result.httpAddress = stringValue(lookup, "HTTP_ADDRESS", ":8080")
	var err error
	if result.battleSessionTTL, err = durationValue(lookup, "BATTLE_SESSION_TTL", 2*time.Hour); err != nil {
		return config{}, err
	}
	if result.cleanupInterval, err = durationValue(lookup, "BATTLE_CLEANUP_INTERVAL", time.Minute); err != nil {
		return config{}, err
	}
	if result.shutdownTimeout, err = durationValue(lookup, "SHUTDOWN_TIMEOUT", 10*time.Second); err != nil {
		return config{}, err
	}
	if result.databaseTimeout, err = durationValue(lookup, "DATABASE_CONNECT_TIMEOUT", 10*time.Second); err != nil {
		return config{}, err
	}
	if result.cleanupBatch, err = intValue(lookup, "BATTLE_CLEANUP_BATCH", 100, 1); err != nil {
		return config{}, err
	}
	if result.startingMoney, err = intValue(lookup, "STARTING_MONEY", 100, 0); err != nil {
		return config{}, err
	}
	return result, nil
}

func stringValue(lookup environmentLookup, name, fallback string) string {
	if value, ok := lookup(name); ok && value != "" {
		return value
	}
	return fallback
}

func durationValue(lookup environmentLookup, name string, fallback time.Duration) (time.Duration, error) {
	raw, ok := lookup(name)
	if !ok || raw == "" {
		return fallback, nil
	}
	value, err := time.ParseDuration(raw)
	if err != nil || value <= 0 {
		return 0, fmt.Errorf("%s must be a positive duration", name)
	}
	return value, nil
}

func intValue(lookup environmentLookup, name string, fallback, minimum int) (int, error) {
	raw, ok := lookup(name)
	if !ok || raw == "" {
		return fallback, nil
	}
	value, err := strconv.Atoi(raw)
	if err != nil || value < minimum {
		return 0, fmt.Errorf("%s must be an integer greater than or equal to %d", name, minimum)
	}
	return value, nil
}
