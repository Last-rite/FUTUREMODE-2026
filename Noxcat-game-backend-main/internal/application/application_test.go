package application

import (
	"context"
	"errors"
	"io"
	"net"
	"net/http"
	"sync"
	"testing"
	"time"
)

type cleanupRunner struct {
	started     chan struct{}
	stopped     chan struct{}
	once        sync.Once
	err         error
	shutdownErr error
}

type panicCleanupRunner struct{}

type recordingCloser struct {
	mu    sync.Mutex
	calls int
	err   error
}

func (closer *recordingCloser) Close() error {
	closer.mu.Lock()
	closer.calls++
	closer.mu.Unlock()
	return closer.err
}

func (closer *recordingCloser) callCount() int {
	closer.mu.Lock()
	defer closer.mu.Unlock()
	return closer.calls
}

func (*panicCleanupRunner) Run(context.Context) error {
	panic("cleanup panic")
}

type listenerAddress string

func (address listenerAddress) Network() string { return "test" }
func (address listenerAddress) String() string  { return string(address) }

type failingListener struct {
	err error
}

func (listener *failingListener) Accept() (net.Conn, error) { return nil, listener.err }
func (listener *failingListener) Close() error              { return nil }
func (listener *failingListener) Addr() net.Addr            { return listenerAddress("failing") }

func (runner *cleanupRunner) Run(ctx context.Context) error {
	runner.once.Do(func() { close(runner.started) })
	if runner.err != nil {
		return runner.err
	}
	<-ctx.Done()
	close(runner.stopped)
	if runner.shutdownErr != nil {
		return runner.shutdownErr
	}
	return ctx.Err()
}

func newListener(t *testing.T) net.Listener {
	t.Helper()
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	return listener
}

func TestRunGracefullyFinishesInflightRequestAndStopsCleanup(t *testing.T) {
	requestStarted := make(chan struct{})
	releaseRequest := make(chan struct{})
	cleanup := &cleanupRunner{started: make(chan struct{}), stopped: make(chan struct{})}
	server := &http.Server{Handler: http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		close(requestStarted)
		<-releaseRequest
		w.WriteHeader(http.StatusNoContent)
	})}
	listener := newListener(t)
	application, err := New(Config{
		Server: server, Listener: listener, Cleanup: cleanup,
		ShutdownTimeout: time.Second,
	})
	if err != nil {
		t.Fatal(err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	runErrors := make(chan error, 1)
	go func() { runErrors <- application.Run(ctx) }()
	select {
	case <-cleanup.started:
	case <-time.After(time.Second):
		t.Fatal("cleanup worker did not start")
	}

	responseErrors := make(chan error, 1)
	go func() {
		response, err := http.Get("http://" + listener.Addr().String())
		if err == nil {
			_, _ = io.Copy(io.Discard, response.Body)
			err = response.Body.Close()
		}
		responseErrors <- err
	}()
	select {
	case <-requestStarted:
	case <-time.After(time.Second):
		t.Fatal("HTTP request did not reach the server")
	}

	cancel()
	select {
	case <-cleanup.stopped:
	case <-time.After(time.Second):
		t.Fatal("cleanup worker was not cancelled")
	}
	select {
	case err := <-runErrors:
		t.Fatalf("Run returned before the active request completed: %v", err)
	case <-time.After(25 * time.Millisecond):
	}

	close(releaseRequest)
	if err := <-responseErrors; err != nil {
		t.Fatalf("in-flight request failed during shutdown: %v", err)
	}
	if err := <-runErrors; err != nil {
		t.Fatalf("Run() error = %v", err)
	}
}

func TestRunStopsHTTPServerWhenCleanupFails(t *testing.T) {
	cleanupFailure := errors.New("cleanup failed")
	cleanup := &cleanupRunner{started: make(chan struct{}), stopped: make(chan struct{}), err: cleanupFailure}
	listener := newListener(t)
	application, err := New(Config{
		Server: &http.Server{Handler: http.NewServeMux()}, Listener: listener, Cleanup: cleanup,
		ShutdownTimeout: time.Second,
	})
	if err != nil {
		t.Fatal(err)
	}

	err = application.Run(context.Background())
	if !errors.Is(err, cleanupFailure) {
		t.Fatalf("Run() error = %v, want cleanup failure", err)
	}
	if _, err := net.DialTimeout("tcp", listener.Addr().String(), 50*time.Millisecond); err == nil {
		t.Fatal("HTTP listener still accepts connections after cleanup failure")
	}
}

func TestRunStopsCleanupWhenHTTPServerFails(t *testing.T) {
	serveFailure := errors.New("listener failed")
	cleanup := &cleanupRunner{started: make(chan struct{}), stopped: make(chan struct{})}
	application, err := New(Config{
		Server:   &http.Server{Handler: http.NewServeMux()},
		Listener: &failingListener{err: serveFailure}, Cleanup: cleanup,
		ShutdownTimeout: time.Second,
	})
	if err != nil {
		t.Fatal(err)
	}
	if err := application.Run(context.Background()); !errors.Is(err, serveFailure) {
		t.Fatalf("Run() error = %v, want wrapped serve failure", err)
	}
	select {
	case <-cleanup.stopped:
	case <-time.After(time.Second):
		t.Fatal("cleanup did not stop after the HTTP server failed")
	}
}

func TestRunConvertsCleanupPanicAndStopsHTTPServer(t *testing.T) {
	listener := newListener(t)
	application, err := New(Config{
		Server: &http.Server{Handler: http.NewServeMux()}, Listener: listener,
		Cleanup: &panicCleanupRunner{}, ShutdownTimeout: time.Second,
	})
	if err != nil {
		t.Fatal(err)
	}
	if err := application.Run(context.Background()); err == nil {
		t.Fatal("Run() error = nil, want cleanup panic error")
	}
	if _, err := net.DialTimeout("tcp", listener.Addr().String(), 50*time.Millisecond); err == nil {
		t.Fatal("HTTP listener still accepts connections after cleanup panic")
	}
}

func TestRunReportsUnexpectedCleanupShutdownError(t *testing.T) {
	cleanupFailure := errors.New("cleanup failed while stopping")
	cleanup := &cleanupRunner{
		started: make(chan struct{}), stopped: make(chan struct{}), shutdownErr: cleanupFailure,
	}
	listener := newListener(t)
	application, err := New(Config{
		Server: &http.Server{Handler: http.NewServeMux()}, Listener: listener, Cleanup: cleanup,
		ShutdownTimeout: time.Second,
	})
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() { done <- application.Run(ctx) }()
	<-cleanup.started
	cancel()
	if err := <-done; !errors.Is(err, cleanupFailure) {
		t.Fatalf("Run() error = %v, want wrapped cleanup failure", err)
	}
}

func TestRunClosesApplicationResourcesOnShutdown(t *testing.T) {
	cleanup := &cleanupRunner{started: make(chan struct{}), stopped: make(chan struct{})}
	closer := &recordingCloser{}
	listener := newListener(t)
	application, err := New(Config{
		Server: &http.Server{Handler: http.NewServeMux()}, Listener: listener, Cleanup: cleanup,
		ShutdownClosers: []io.Closer{closer}, ShutdownTimeout: time.Second,
	})
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() { done <- application.Run(ctx) }()
	<-cleanup.started
	cancel()
	if err := <-done; err != nil {
		t.Fatalf("Run() error = %v", err)
	}
	if calls := closer.callCount(); calls != 1 {
		t.Fatalf("Close() calls = %d, want 1", calls)
	}
}

func TestRunReportsApplicationResourceCloseError(t *testing.T) {
	closeFailure := errors.New("WebSocket close failed")
	cleanup := &cleanupRunner{started: make(chan struct{}), stopped: make(chan struct{})}
	closer := &recordingCloser{err: closeFailure}
	listener := newListener(t)
	application, err := New(Config{
		Server: &http.Server{Handler: http.NewServeMux()}, Listener: listener, Cleanup: cleanup,
		ShutdownClosers: []io.Closer{closer}, ShutdownTimeout: time.Second,
	})
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() { done <- application.Run(ctx) }()
	<-cleanup.started
	cancel()
	if err := <-done; !errors.Is(err, closeFailure) {
		t.Fatalf("Run() error = %v, want wrapped close failure", err)
	}
}

func TestNewRejectsInvalidConfiguration(t *testing.T) {
	listener := newListener(t)
	defer listener.Close()
	cleanup := &cleanupRunner{started: make(chan struct{}), stopped: make(chan struct{})}
	tests := []Config{
		{Listener: listener, Cleanup: cleanup},
		{Server: &http.Server{}, Cleanup: cleanup},
		{Server: &http.Server{}, Listener: listener},
		{Server: &http.Server{}, Listener: listener, Cleanup: cleanup, ShutdownTimeout: -time.Second},
		{Server: &http.Server{}, Listener: listener, Cleanup: cleanup, ShutdownClosers: []io.Closer{nil}},
	}
	for index, config := range tests {
		if _, err := New(config); err == nil {
			t.Errorf("case %d: New() error = nil", index)
		}
	}
}

func TestServerResultErrorClassifiesShutdownResults(t *testing.T) {
	unexpected := errors.New("listener failure")
	tests := []struct {
		name    string
		err     error
		wantNil bool
		want    error
	}{
		{name: "http server closed", err: http.ErrServerClosed, wantNil: true},
		{name: "listener closed", err: net.ErrClosed, wantNil: true},
		{name: "nil is invalid", err: nil},
		{name: "other error is preserved", err: unexpected, want: unexpected},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			err := serverResultError(test.err, true)
			if test.wantNil && err != nil {
				t.Fatalf("serverResultError() = %v, want nil", err)
			}
			if !test.wantNil && err == nil {
				t.Fatal("serverResultError() = nil, want an error")
			}
			if test.want != nil && !errors.Is(err, test.want) {
				t.Fatalf("serverResultError() = %v, want wrapped %v", err, test.want)
			}
		})
	}
}

func TestCleanupResultErrorClassifiesShutdownResults(t *testing.T) {
	unexpected := errors.New("cleanup failure")
	tests := []struct {
		name     string
		err      error
		expected error
		wantNil  bool
		want     error
	}{
		{name: "cancelled", err: context.Canceled, expected: context.Canceled, wantNil: true},
		{name: "wrapped cancellation", err: errors.Join(context.Canceled, errors.New("worker stopped")), expected: context.Canceled, wantNil: true},
		{name: "parent deadline", err: context.DeadlineExceeded, expected: context.DeadlineExceeded, wantNil: true},
		{name: "nil is invalid", expected: context.Canceled},
		{name: "unrelated error is preserved", err: unexpected, expected: context.Canceled, want: unexpected},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			err := cleanupResultError(test.err, test.expected, true)
			if test.wantNil && err != nil {
				t.Fatalf("cleanupResultError() = %v, want nil", err)
			}
			if !test.wantNil && err == nil {
				t.Fatal("cleanupResultError() = nil, want an error")
			}
			if test.want != nil && !errors.Is(err, test.want) {
				t.Fatalf("cleanupResultError() = %v, want wrapped %v", err, test.want)
			}
		})
	}
}

func TestWaitForComponentPrefersReadyResultAtDeadline(t *testing.T) {
	result := make(chan error, 1)
	want := errors.New("component result")
	result <- want
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	got, ok := waitForComponent(result, ctx)
	if !ok || !errors.Is(got, want) {
		t.Fatalf("waitForComponent() = %v, %t; want ready component result", got, ok)
	}
}
