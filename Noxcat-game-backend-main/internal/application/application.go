// Package application coordinates the long-running HTTP server and background
// workers, including graceful process shutdown.
package application

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"time"
)

const defaultShutdownTimeout = 10 * time.Second

type CleanupRunner interface {
	Run(context.Context) error
}

type Config struct {
	Server          *http.Server
	Listener        net.Listener
	Cleanup         CleanupRunner
	ShutdownClosers []io.Closer
	ShutdownTimeout time.Duration
}

type Application struct {
	server          *http.Server
	listener        net.Listener
	cleanup         CleanupRunner
	shutdownClosers []io.Closer
	shutdownTimeout time.Duration
}

func New(config Config) (*Application, error) {
	if config.Server == nil {
		return nil, errors.New("HTTP server is required")
	}
	if config.Listener == nil {
		return nil, errors.New("HTTP listener is required")
	}
	if config.Cleanup == nil {
		return nil, errors.New("battle cleanup runner is required")
	}
	for _, closer := range config.ShutdownClosers {
		if closer == nil {
			return nil, errors.New("shutdown closer must not be nil")
		}
	}
	shutdownTimeout := config.ShutdownTimeout
	if shutdownTimeout == 0 {
		shutdownTimeout = defaultShutdownTimeout
	}
	if shutdownTimeout < 0 {
		return nil, errors.New("shutdown timeout must be positive")
	}
	return &Application{
		server:          config.Server,
		listener:        config.Listener,
		cleanup:         config.Cleanup,
		shutdownClosers: append([]io.Closer(nil), config.ShutdownClosers...),
		shutdownTimeout: shutdownTimeout,
	}, nil
}

// Run serves HTTP and runs battle-session cleanup until the parent context is
// cancelled or either long-running component fails. Shutdown stops background
// work first, then gives active HTTP requests a bounded window to complete.
func (a *Application) Run(ctx context.Context) error {
	workerCtx, cancelWorkers := context.WithCancel(ctx)
	defer cancelWorkers()

	// Serve must run until application shutdown. Any earlier return, including
	// http.ErrServerClosed, means something outside this lifecycle stopped it.
	serveErrors := runComponent("HTTP server", func() error {
		return a.server.Serve(a.listener)
	})
	// Cleanup must run until workerCtx is done. Individual sweep errors are
	// retried inside CleanupWorker; any earlier return is therefore fatal.
	cleanupErrors := runComponent("battle cleanup", func() error {
		return a.cleanup.Run(workerCtx)
	})

	var runErr error
	serverStopped := false
	cleanupStopped := false
	select {
	case <-ctx.Done():
	case err := <-serveErrors:
		serverStopped = true
		runErr = errors.Join(runErr, serverResultError(err, ctx.Err() != nil))
	case err := <-cleanupErrors:
		cleanupStopped = true
		runErr = errors.Join(runErr, cleanupResultError(err, ctx.Err(), ctx.Err() != nil))
	}

	cancelWorkers()
	expectedCleanupError := workerCtx.Err()
	for index := len(a.shutdownClosers) - 1; index >= 0; index-- {
		if err := a.shutdownClosers[index].Close(); err != nil {
			runErr = errors.Join(runErr, fmt.Errorf("close application resource: %w", err))
		}
	}
	// Stop accepting new connections even if Serve has not yet registered the
	// listener with http.Server. Shutdown then drains connections already active.
	if err := a.listener.Close(); err != nil && !errors.Is(err, net.ErrClosed) {
		runErr = errors.Join(runErr, fmt.Errorf("close HTTP listener: %w", err))
	}
	shutdownCtx, cancelShutdown := context.WithTimeout(context.Background(), a.shutdownTimeout)
	defer cancelShutdown()
	if err := a.server.Shutdown(shutdownCtx); err != nil {
		runErr = errors.Join(runErr, fmt.Errorf("shutdown HTTP server: %w", err))
		// Graceful time is exhausted. Force connections closed before callers
		// release resources such as the PostgreSQL pool.
		if closeErr := a.server.Close(); closeErr != nil && !errors.Is(closeErr, http.ErrServerClosed) && !errors.Is(closeErr, net.ErrClosed) {
			runErr = errors.Join(runErr, fmt.Errorf("force close HTTP server: %w", closeErr))
		}
	}

	if !serverStopped {
		if err, stopped := waitForComponent(serveErrors, shutdownCtx); stopped {
			runErr = errors.Join(runErr, serverResultError(err, true))
		} else {
			runErr = errors.Join(runErr, fmt.Errorf("wait for HTTP server: %w", shutdownCtx.Err()))
		}
	}
	if !cleanupStopped {
		if err, stopped := waitForComponent(cleanupErrors, shutdownCtx); stopped {
			runErr = errors.Join(runErr, cleanupResultError(err, expectedCleanupError, true))
		} else {
			runErr = errors.Join(runErr, fmt.Errorf("wait for battle cleanup: %w", shutdownCtx.Err()))
		}
	}
	return runErr
}

func runComponent(name string, run func() error) <-chan error {
	result := make(chan error, 1)
	go func() {
		defer func() {
			if recovered := recover(); recovered != nil {
				result <- fmt.Errorf("%s goroutine panicked: %v", name, recovered)
			}
		}()
		result <- run()
	}()
	return result
}

// waitForComponent checks the result before the deadline channel. This avoids
// reporting a timeout when both become ready at the shutdown boundary.
func waitForComponent(result <-chan error, ctx context.Context) (error, bool) {
	select {
	case err := <-result:
		return err, true
	default:
	}
	select {
	case err := <-result:
		return err, true
	case <-ctx.Done():
		return nil, false
	}
}

func serverResultError(err error, shuttingDown bool) error {
	if shuttingDown && (errors.Is(err, http.ErrServerClosed) || errors.Is(err, net.ErrClosed)) {
		return nil
	}
	if err == nil {
		return errors.New("HTTP server stopped without returning an error")
	}
	if shuttingDown {
		return fmt.Errorf("HTTP server returned an unexpected shutdown error: %w", err)
	}
	return fmt.Errorf("serve HTTP: %w", err)
}

func cleanupResultError(err, expected error, shuttingDown bool) error {
	if shuttingDown && expected != nil && errors.Is(err, expected) {
		return nil
	}
	if err == nil {
		return errors.New("battle cleanup stopped without returning an error")
	}
	if shuttingDown {
		return fmt.Errorf("battle cleanup returned an unexpected shutdown error: %w", err)
	}
	return fmt.Errorf("run battle cleanup: %w", err)
}
