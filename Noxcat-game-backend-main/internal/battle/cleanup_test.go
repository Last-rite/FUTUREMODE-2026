package battle

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"
)

type fakeCleanupRepository struct {
	mu        sync.Mutex
	calls     int
	failCalls int
	batches   []int
	called    chan int
}

func (repository *fakeCleanupRepository) ExpireBattleSessions(_ context.Context, batchSize int) (int64, error) {
	repository.mu.Lock()
	repository.calls++
	call := repository.calls
	repository.batches = append(repository.batches, batchSize)
	shouldFail := call <= repository.failCalls
	repository.mu.Unlock()
	select {
	case repository.called <- call:
	default:
	}
	if shouldFail {
		return 0, errors.New("temporary database failure")
	}
	return 2, nil
}

func TestCleanupWorkerRunsImmediatelyAndStopsOnCancellation(t *testing.T) {
	repository := &fakeCleanupRepository{called: make(chan int, 4)}
	worker, err := NewCleanupWorker(CleanupConfig{
		Repository: repository, Interval: time.Hour, BatchSize: 25,
	})
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() { done <- worker.Run(ctx) }()
	select {
	case <-repository.called:
	case <-time.After(time.Second):
		t.Fatal("initial cleanup sweep did not run")
	}
	cancel()
	if err := <-done; !errors.Is(err, context.Canceled) {
		t.Fatalf("Run() error = %v, want context cancellation", err)
	}
	repository.mu.Lock()
	defer repository.mu.Unlock()
	if len(repository.batches) != 1 || repository.batches[0] != 25 {
		t.Fatalf("cleanup batches = %v, want [25]", repository.batches)
	}
}

func TestCleanupWorkerRetriesFailedSweep(t *testing.T) {
	repository := &fakeCleanupRepository{failCalls: 1, called: make(chan int, 8)}
	worker, err := NewCleanupWorker(CleanupConfig{
		Repository: repository, Interval: 5 * time.Millisecond, BatchSize: 10,
	})
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() { done <- worker.Run(ctx) }()
	for {
		select {
		case call := <-repository.called:
			if call >= 2 {
				cancel()
				if err := <-done; !errors.Is(err, context.Canceled) {
					t.Fatalf("Run() error = %v, want context cancellation", err)
				}
				return
			}
		case <-time.After(time.Second):
			cancel()
			t.Fatal("cleanup worker did not retry the failed sweep")
		}
	}
}

func TestNewCleanupWorkerRejectsInvalidConfiguration(t *testing.T) {
	repository := &fakeCleanupRepository{called: make(chan int, 1)}
	tests := []CleanupConfig{
		{Interval: time.Second, BatchSize: 1},
		{Repository: repository, BatchSize: 1},
		{Repository: repository, Interval: time.Second},
	}
	for index, config := range tests {
		if _, err := NewCleanupWorker(config); err == nil {
			t.Errorf("case %d: NewCleanupWorker() error = nil", index)
		}
	}
}

func TestCleanupWorkerRejectsAlreadyCancelledContext(t *testing.T) {
	repository := &fakeCleanupRepository{called: make(chan int, 1)}
	worker, err := NewCleanupWorker(CleanupConfig{
		Repository: repository, Interval: time.Second, BatchSize: 1,
	})
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if err := worker.Run(ctx); !errors.Is(err, context.Canceled) {
		t.Fatalf("Run() error = %v, want context cancellation", err)
	}
	select {
	case <-repository.called:
		t.Fatal("cleanup ran with an already cancelled context")
	default:
	}
}

var _ CleanupRepository = (*fakeCleanupRepository)(nil)
