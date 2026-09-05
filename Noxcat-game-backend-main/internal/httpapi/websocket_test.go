package httpapi

import (
	"context"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/Ian747-tw/noxcat_game_backend/internal/domain"
	"github.com/gorilla/websocket"
)

func newWebSocketTestServer(t *testing.T, auth AuthService) (*TradeHub, *httptest.Server) {
	t.Helper()
	hub := NewTradeHub(slog.New(slog.NewTextHandler(io.Discard, nil)))
	server := NewServer(Config{
		Store:         &fakeStore{},
		Auth:          auth,
		Battles:       &fakeBattles{},
		TradeNotifier: hub,
		WebSockets:    hub,
	})
	httpServer := httptest.NewServer(server.Handler())
	t.Cleanup(func() {
		_ = hub.Close()
		httpServer.Close()
	})
	return hub, httpServer
}

func dialWebSocket(t *testing.T, serverURL, query string, header http.Header) (*websocket.Conn, *http.Response, error) {
	t.Helper()
	url := "ws" + strings.TrimPrefix(serverURL, "http") + "/ws" + query
	return websocket.DefaultDialer.Dial(url, header)
}

func waitForWebSocketClients(t *testing.T, hub *TradeHub, player string, count int) {
	t.Helper()
	deadline := time.Now().Add(time.Second)
	for time.Now().Before(deadline) {
		hub.mu.RLock()
		got := len(hub.clients[player])
		hub.mu.RUnlock()
		if got == count {
			return
		}
		time.Sleep(time.Millisecond)
	}
	t.Fatalf("WebSocket clients for %s did not reach %d", player, count)
}

func readTradeNotification(t *testing.T, connection *websocket.Conn) tradeNotificationEnvelope {
	t.Helper()
	if err := connection.SetReadDeadline(time.Now().Add(time.Second)); err != nil {
		t.Fatal(err)
	}
	var notification tradeNotificationEnvelope
	if err := connection.ReadJSON(&notification); err != nil {
		t.Fatalf("read WebSocket notification: %v", err)
	}
	return notification
}

func TestTradeHubDeliversNotificationsToEveryPlayerConnection(t *testing.T) {
	hub, server := newWebSocketTestServer(t, &fakeAuth{principal: domain.PlayerRolePlayer})
	first, response, err := dialWebSocket(t, server.URL, "?token=test-token", nil)
	if err != nil {
		t.Fatalf("dial first WebSocket (status %v): %v", responseStatus(response), err)
	}
	defer first.Close()
	second, response, err := dialWebSocket(t, server.URL, "?token=test-token", nil)
	if err != nil {
		t.Fatalf("dial second WebSocket (status %v): %v", responseStatus(response), err)
	}
	defer second.Close()
	waitForWebSocketClients(t, hub, playerID, 2)

	unit := unitID
	trade := domain.Trade{
		ID: tradeID, FromPlayerID: otherID, ToPlayerID: playerID,
		UnitID: &unit, Status: domain.TradeStatusPending,
	}
	hub.NotifyTrade(playerID, TradeNotification{Type: TradeCreated, Trade: trade})

	for index, connection := range []*websocket.Conn{first, second} {
		notification := readTradeNotification(t, connection)
		if notification.Type != TradeCreated || notification.Trade.ID != tradeID || notification.Trade.FromPlayerID != otherID {
			t.Fatalf("connection %d received %#v", index, notification)
		}
		if notification.Trade.UnitID == nil || *notification.Trade.UnitID != unitID {
			t.Fatalf("connection %d received wrong unit: %#v", index, notification.Trade.UnitID)
		}
	}
}

func TestWebSocketAuthenticationAndConfigurationErrors(t *testing.T) {
	t.Run("missing token", func(t *testing.T) {
		_, server := newWebSocketTestServer(t, &fakeAuth{principal: domain.PlayerRolePlayer})
		connection, response, err := dialWebSocket(t, server.URL, "", nil)
		if connection != nil {
			connection.Close()
		}
		if err == nil || responseStatus(response) != http.StatusUnauthorized {
			t.Fatalf("Dial() error = %v, status = %v; want 401", err, responseStatus(response))
		}
	})

	t.Run("duplicate token", func(t *testing.T) {
		_, server := newWebSocketTestServer(t, &fakeAuth{principal: domain.PlayerRolePlayer})
		connection, response, err := dialWebSocket(t, server.URL, "?token=one&token=two", nil)
		if connection != nil {
			connection.Close()
		}
		if err == nil || responseStatus(response) != http.StatusUnauthorized {
			t.Fatalf("Dial() error = %v, status = %v; want 401", err, responseStatus(response))
		}
	})

	t.Run("invalid token", func(t *testing.T) {
		_, server := newWebSocketTestServer(t, &fakeAuth{principal: domain.PlayerRolePlayer, authErr: domain.ErrUnauthorized})
		connection, response, err := dialWebSocket(t, server.URL, "?token=bad", nil)
		if connection != nil {
			connection.Close()
		}
		if err == nil || responseStatus(response) != http.StatusUnauthorized {
			t.Fatalf("Dial() error = %v, status = %v; want 401", err, responseStatus(response))
		}
	})

	t.Run("missing WebSocket service", func(t *testing.T) {
		server := httptest.NewServer(testServer(&fakeStore{}).Handler())
		defer server.Close()
		connection, response, err := dialWebSocket(t, server.URL, "?token=test-token", nil)
		if connection != nil {
			connection.Close()
		}
		if err == nil || responseStatus(response) != http.StatusInternalServerError {
			t.Fatalf("Dial() error = %v, status = %v; want 500", err, responseStatus(response))
		}
	})
}

func TestTradeHubRejectsCrossOriginUpgrade(t *testing.T) {
	_, server := newWebSocketTestServer(t, &fakeAuth{principal: domain.PlayerRolePlayer})
	header := http.Header{"Origin": []string{"https://untrusted.example"}}
	connection, response, err := dialWebSocket(t, server.URL, "?token=test-token", header)
	if connection != nil {
		connection.Close()
	}
	if err == nil || responseStatus(response) != http.StatusForbidden {
		t.Fatalf("Dial() error = %v, status = %v; want 403", err, responseStatus(response))
	}
}

func TestTradeHubCloseDisconnectsClientsAndIsIdempotent(t *testing.T) {
	hub, server := newWebSocketTestServer(t, &fakeAuth{principal: domain.PlayerRolePlayer})
	connection, response, err := dialWebSocket(t, server.URL, "?token=test-token", nil)
	if err != nil {
		t.Fatalf("Dial() status = %v, error = %v", responseStatus(response), err)
	}
	waitForWebSocketClients(t, hub, playerID, 1)
	if err := hub.Close(); err != nil {
		t.Fatal(err)
	}
	if err := hub.Close(); err != nil {
		t.Fatalf("second Close() error = %v", err)
	}
	if err := connection.SetReadDeadline(time.Now().Add(time.Second)); err != nil {
		t.Fatal(err)
	}
	if _, _, err := connection.ReadMessage(); err == nil {
		t.Fatal("ReadMessage() error = nil after hub closed")
	}
	waitForWebSocketClients(t, hub, playerID, 0)
	connection.Close()
}

func TestTradeHubConcurrentNotifyAndDisconnect(t *testing.T) {
	hub, server := newWebSocketTestServer(t, &fakeAuth{principal: domain.PlayerRolePlayer})
	const connections = 8
	clients := make([]*websocket.Conn, 0, connections)
	for range connections {
		connection, response, err := dialWebSocket(t, server.URL, "?token=test-token", nil)
		if err != nil {
			t.Fatalf("Dial() status = %v, error = %v", responseStatus(response), err)
		}
		clients = append(clients, connection)
	}
	waitForWebSocketClients(t, hub, playerID, connections)

	var workers sync.WaitGroup
	for worker := 0; worker < 8; worker++ {
		workers.Add(1)
		go func() {
			defer workers.Done()
			for index := 0; index < 100; index++ {
				hub.NotifyTrade(playerID, TradeNotification{Type: TradeCreated, Trade: domain.Trade{ID: tradeID}})
			}
		}()
	}
	for _, connection := range clients {
		workers.Add(1)
		go func(connection *websocket.Conn) {
			defer workers.Done()
			_ = connection.Close()
		}(connection)
	}
	workers.Wait()
	waitForWebSocketClients(t, hub, playerID, 0)
}

func responseStatus(response *http.Response) any {
	if response == nil {
		return nil
	}
	defer response.Body.Close()
	return response.StatusCode
}

type recordingTradeNotifier struct {
	mu       sync.Mutex
	calls    []tradeNotificationCall
	panicErr bool
}

type tradeNotificationCall struct {
	playerID     string
	notification TradeNotification
}

func (notifier *recordingTradeNotifier) NotifyTrade(player string, notification TradeNotification) {
	if notifier.panicErr {
		panic("notification failed")
	}
	notifier.mu.Lock()
	notifier.calls = append(notifier.calls, tradeNotificationCall{playerID: player, notification: notification})
	notifier.mu.Unlock()
}

func (notifier *recordingTradeNotifier) oneCall(t *testing.T) tradeNotificationCall {
	t.Helper()
	notifier.mu.Lock()
	defer notifier.mu.Unlock()
	if len(notifier.calls) != 1 {
		t.Fatalf("notification calls = %d, want 1", len(notifier.calls))
	}
	return notifier.calls[0]
}

func TestTradeHandlersNotifyOnlyAfterSuccessfulStoreChange(t *testing.T) {
	tests := []struct {
		name       string
		method     string
		path       string
		body       string
		store      *fakeStore
		wantStatus int
		wantPlayer string
		wantEvent  string
	}{
		{
			name: "create notifies recipient", method: http.MethodPost, path: "/trades",
			body: `{"to_player_id":"` + otherID + `","unit_id":"` + unitID + `"}`,
			store: &fakeStore{createTrade: func(_ context.Context, trade domain.NewTrade) (domain.Trade, error) {
				return domain.Trade{ID: tradeID, FromPlayerID: trade.FromPlayerID, ToPlayerID: trade.ToPlayerID, UnitID: trade.UnitID, Status: domain.TradeStatusPending}, nil
			}},
			wantStatus: http.StatusCreated, wantPlayer: otherID, wantEvent: TradeCreated,
		},
		{
			name: "accept notifies sender", method: http.MethodPost, path: "/trades/" + tradeID + "/accept",
			store: &fakeStore{acceptTrade: func(context.Context, string, string) (domain.Trade, error) {
				return domain.Trade{ID: tradeID, FromPlayerID: otherID, ToPlayerID: playerID, Status: domain.TradeStatusAccepted}, nil
			}},
			wantStatus: http.StatusOK, wantPlayer: otherID, wantEvent: TradeAccepted,
		},
		{
			name: "reject notifies sender", method: http.MethodPost, path: "/trades/" + tradeID + "/reject",
			store: &fakeStore{rejectTrade: func(context.Context, string, string) (domain.Trade, error) {
				return domain.Trade{ID: tradeID, FromPlayerID: otherID, ToPlayerID: playerID, Status: domain.TradeStatusRejected}, nil
			}},
			wantStatus: http.StatusOK, wantPlayer: otherID, wantEvent: TradeRejected,
		},
		{
			name: "cancel notifies recipient", method: http.MethodPost, path: "/trades/" + tradeID + "/cancel",
			store: &fakeStore{cancelTrade: func(context.Context, string, string) (domain.Trade, error) {
				return domain.Trade{ID: tradeID, FromPlayerID: playerID, ToPlayerID: otherID, Status: domain.TradeStatusCancelled}, nil
			}},
			wantStatus: http.StatusOK, wantPlayer: otherID, wantEvent: TradeCancelled,
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			notifier := &recordingTradeNotifier{}
			server := testServer(test.store)
			server.tradeNotifier = notifier
			response := request(t, server, test.method, test.path, test.body, true)
			assertResponse(t, response, test.wantStatus, "")
			call := notifier.oneCall(t)
			if call.playerID != test.wantPlayer || call.notification.Type != test.wantEvent || call.notification.Trade.ID != tradeID {
				t.Fatalf("notification = %#v", call)
			}
		})
	}

	t.Run("store failure sends nothing", func(t *testing.T) {
		notifier := &recordingTradeNotifier{}
		server := testServer(&fakeStore{acceptTrade: func(context.Context, string, string) (domain.Trade, error) {
			return domain.Trade{}, domain.ErrTradeNotPending
		}})
		server.tradeNotifier = notifier
		assertResponse(t, request(t, server, http.MethodPost, "/trades/"+tradeID+"/accept", "", true), http.StatusConflict, "trade_not_pending")
		notifier.mu.Lock()
		defer notifier.mu.Unlock()
		if len(notifier.calls) != 0 {
			t.Fatalf("notification calls = %d, want 0", len(notifier.calls))
		}
	})
}

func TestTradeNotifierPanicDoesNotChangeCommittedHTTPResult(t *testing.T) {
	server := testServer(&fakeStore{acceptTrade: func(context.Context, string, string) (domain.Trade, error) {
		return domain.Trade{ID: tradeID, FromPlayerID: otherID, ToPlayerID: playerID, Status: domain.TradeStatusAccepted}, nil
	}})
	server.tradeNotifier = &recordingTradeNotifier{panicErr: true}
	response := request(t, server, http.MethodPost, "/trades/"+tradeID+"/accept", "", true)
	assertResponse(t, response, http.StatusOK, "")
}

var _ TradeNotifier = (*recordingTradeNotifier)(nil)
