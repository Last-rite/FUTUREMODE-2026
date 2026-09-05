package battle

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"time"
)

type CleanupRepository interface {
	ExpireBattleSessions(context.Context, int) (int64, error)
}

type CleanupConfig struct {
	Repository CleanupRepository
	Interval   time.Duration
	BatchSize  int
	Logger     *slog.Logger
}

// CleanupWorker periodically releases players from abandoned battle sessions.
// StartBattleSession independently recovers an expired session for its player;
// this worker makes that recovery prompt even when the player does not return.
type CleanupWorker struct {
	repository CleanupRepository
	interval   time.Duration
	batchSize  int
	logger     *slog.Logger
}

func NewCleanupWorker(config CleanupConfig) (*CleanupWorker, error) {
	if config.Repository == nil {
		return nil, errors.New("battle cleanup repository is required")
	}
	if config.Interval <= 0 {
		return nil, errors.New("battle cleanup interval must be positive")
	}
	if config.BatchSize <= 0 {
		return nil, errors.New("battle cleanup batch size must be positive")
	}
	logger := config.Logger
	if logger == nil {
		logger = slog.New(slog.NewTextHandler(io.Discard, nil))
	}
	return &CleanupWorker{
		repository: config.Repository,
		interval:   config.Interval,
		batchSize:  config.BatchSize,
		logger:     logger,
	}, nil
}

// Run performs one cleanup immediately, then continues on the configured
// interval until ctx is cancelled. A failed sweep is logged and retried on the
// next tick instead of taking down the HTTP server.
func (worker *CleanupWorker) Run(ctx context.Context) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	worker.sweep(ctx)
	ticker := time.NewTicker(worker.interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-ticker.C:
			worker.sweep(ctx)
		}
	}
}

func (worker *CleanupWorker) sweep(ctx context.Context) {
	expired, err := worker.repository.ExpireBattleSessions(ctx, worker.batchSize)
	if err != nil {
		if ctx.Err() == nil {
			worker.logger.Error("battle cleanup sweep failed", "error", err)
		}
		return
	}
	if expired > 0 {
		worker.logger.Info("expired abandoned battle sessions", "count", expired)
	}
}
