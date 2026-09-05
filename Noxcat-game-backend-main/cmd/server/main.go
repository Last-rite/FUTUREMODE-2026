package main

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/Ian747-tw/noxcat_game_backend/internal/application"
	"github.com/Ian747-tw/noxcat_game_backend/internal/auth"
	"github.com/Ian747-tw/noxcat_game_backend/internal/battle"
	"github.com/Ian747-tw/noxcat_game_backend/internal/database"
	"github.com/Ian747-tw/noxcat_game_backend/internal/domain"
	"github.com/Ian747-tw/noxcat_game_backend/internal/httpapi"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	config, err := loadConfig(os.LookupEnv)
	if err != nil {
		logger.Error("invalid application configuration", "error", err)
		os.Exit(1)
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	if err := run(ctx, config, logger); err != nil {
		logger.Error("application stopped", "error", err)
		os.Exit(1)
	}
}

func run(ctx context.Context, config config, logger *slog.Logger) error {
	databaseCtx, cancelDatabase := context.WithTimeout(ctx, config.databaseTimeout)
	pool, err := database.Open(databaseCtx, config.databaseURL)
	cancelDatabase()
	if err != nil {
		return err
	}
	defer pool.Close()

	store := database.NewStore(pool)
	authService, err := auth.NewService(auth.Config{Secret: config.jwtSecret, Issuer: config.jwtIssuer})
	if err != nil {
		return err
	}
	battleService, err := battle.NewService(battle.Config{Repository: store, SessionTTL: config.battleSessionTTL})
	if err != nil {
		return err
	}
	cleanupWorker, err := battle.NewCleanupWorker(battle.CleanupConfig{
		Repository: store, Interval: config.cleanupInterval, BatchSize: config.cleanupBatch, Logger: logger,
	})
	if err != nil {
		return err
	}
	tradeHub := httpapi.NewTradeHub(logger)
	handler := httpapi.NewServer(httpapi.Config{
		Store: store, Auth: authService, Battles: battleService, Logger: logger,
		TradeNotifier: tradeHub, WebSockets: tradeHub,
		StartingMoney: config.startingMoney, StartingUnits: startingRoster(),
	}).Handler()
	httpServer := &http.Server{
		Addr:              config.httpAddress,
		Handler:           handler,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       time.Minute,
		ErrorLog:          slog.NewLogLogger(logger.Handler(), slog.LevelError),
	}
	listener, err := (&net.ListenConfig{}).Listen(ctx, "tcp", config.httpAddress)
	if err != nil {
		return err
	}

	app, err := application.New(application.Config{
		Server: httpServer, Listener: listener, Cleanup: cleanupWorker,
		ShutdownClosers: []io.Closer{tradeHub},
		ShutdownTimeout: config.shutdownTimeout,
	})
	if err != nil {
		_ = listener.Close()
		return err
	}
	logger.Info("HTTP server starting", "address", listener.Addr().String())
	err = app.Run(ctx)
	if err == nil || errors.Is(err, context.Canceled) {
		logger.Info("HTTP server stopped gracefully")
		return nil
	}
	return err
}

func startingRoster() []domain.NewUnit {
	stats := domain.Stats{Attack: 5, Health: 20, Defense: 3, Speed: 4}
	return []domain.NewUnit{
		{Species: domain.UnitSpeciesGeneric, BaseStats: stats, IsPermanent: true, IsEquipped: true},
		{Species: domain.UnitSpeciesGeneric, BaseStats: stats, IsPermanent: true, IsEquipped: true},
		{Species: domain.UnitSpeciesGeneric, BaseStats: stats, IsPermanent: true, IsEquipped: true},
		{Species: domain.UnitSpeciesFire, BaseStats: stats},
		{Species: domain.UnitSpeciesWind, BaseStats: stats},
		{Species: domain.UnitSpeciesWater, BaseStats: stats},
	}
}
