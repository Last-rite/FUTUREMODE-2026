package httpapi

import (
	"log/slog"
	"net/http"
	"sync"
	"time"

	"github.com/Ian747-tw/noxcat_game_backend/internal/domain"
	"github.com/gorilla/websocket"
)

const (
	defaultWebSocketQueueSize = 32
	webSocketWriteTimeout     = 10 * time.Second
	webSocketPongTimeout      = 60 * time.Second
	webSocketPingInterval     = 45 * time.Second
	webSocketReadLimit        = 1024
)

const (
	TradeCreated   = "trade.created"
	TradeAccepted  = "trade.accepted"
	TradeRejected  = "trade.rejected"
	TradeCancelled = "trade.cancelled"
)

type TradeNotification struct {
	Type  string
	Trade domain.Trade
}

type TradeNotifier interface {
	NotifyTrade(string, TradeNotification)
}

type WebSocketServer interface {
	ServePlayer(http.ResponseWriter, *http.Request, string)
}

type tradeNotificationEnvelope struct {
	Type  string        `json:"type"`
	Trade tradeResponse `json:"trade"`
}

type webSocketClient struct {
	playerID string
	conn     *websocket.Conn
	send     chan tradeNotificationEnvelope
	done     chan struct{}
	stopOnce sync.Once
}

func (client *webSocketClient) stop() {
	client.stopOnce.Do(func() {
		close(client.done)
		_ = client.conn.Close()
	})
}

// TradeHub maintains all live tabs/devices for each player. Notifications are
// best-effort because the durable trade record remains available through REST.
type TradeHub struct {
	mu        sync.RWMutex
	clients   map[string]map[*webSocketClient]struct{}
	closed    bool
	queueSize int
	logger    *slog.Logger
	upgrader  websocket.Upgrader
}

func NewTradeHub(logger *slog.Logger) *TradeHub {
	if logger == nil {
		logger = slog.Default()
	}
	return &TradeHub{
		clients:   make(map[string]map[*webSocketClient]struct{}),
		queueSize: defaultWebSocketQueueSize,
		logger:    logger,
		upgrader: websocket.Upgrader{
			HandshakeTimeout: webSocketWriteTimeout,
		},
	}
}

func (hub *TradeHub) ServePlayer(w http.ResponseWriter, r *http.Request, playerID string) {
	conn, err := hub.upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	client := &webSocketClient{
		playerID: playerID,
		conn:     conn,
		send:     make(chan tradeNotificationEnvelope, hub.queueSize),
		done:     make(chan struct{}),
	}
	if !hub.register(client) {
		client.stop()
		return
	}
	go hub.writePump(client)
	defer hub.remove(client)

	conn.SetReadLimit(webSocketReadLimit)
	_ = conn.SetReadDeadline(time.Now().Add(webSocketPongTimeout))
	conn.SetPongHandler(func(string) error {
		return conn.SetReadDeadline(time.Now().Add(webSocketPongTimeout))
	})
	for {
		if _, _, err := conn.ReadMessage(); err != nil {
			return
		}
	}
}

func (hub *TradeHub) NotifyTrade(playerID string, notification TradeNotification) {
	envelope := tradeNotificationEnvelope{Type: notification.Type, Trade: toTradeResponse(notification.Trade)}
	hub.mu.RLock()
	defer hub.mu.RUnlock()
	for client := range hub.clients[playerID] {
		select {
		case client.send <- envelope:
		case <-client.done:
		default:
			hub.logger.Warn("dropping WebSocket trade notification for slow client", "player_id", playerID, "event", notification.Type)
		}
	}
}

func (hub *TradeHub) Close() error {
	hub.mu.Lock()
	if hub.closed {
		hub.mu.Unlock()
		return nil
	}
	hub.closed = true
	clients := make([]*webSocketClient, 0)
	for _, playerClients := range hub.clients {
		for client := range playerClients {
			clients = append(clients, client)
		}
	}
	hub.clients = make(map[string]map[*webSocketClient]struct{})
	hub.mu.Unlock()
	for _, client := range clients {
		client.stop()
	}
	return nil
}

func (hub *TradeHub) register(client *webSocketClient) bool {
	hub.mu.Lock()
	defer hub.mu.Unlock()
	if hub.closed {
		return false
	}
	if hub.clients[client.playerID] == nil {
		hub.clients[client.playerID] = make(map[*webSocketClient]struct{})
	}
	hub.clients[client.playerID][client] = struct{}{}
	return true
}

func (hub *TradeHub) remove(client *webSocketClient) {
	hub.mu.Lock()
	if playerClients := hub.clients[client.playerID]; playerClients != nil {
		delete(playerClients, client)
		if len(playerClients) == 0 {
			delete(hub.clients, client.playerID)
		}
	}
	hub.mu.Unlock()
	client.stop()
}

func (hub *TradeHub) writePump(client *webSocketClient) {
	ticker := time.NewTicker(webSocketPingInterval)
	defer ticker.Stop()
	defer hub.remove(client)
	for {
		select {
		case notification := <-client.send:
			_ = client.conn.SetWriteDeadline(time.Now().Add(webSocketWriteTimeout))
			if err := client.conn.WriteJSON(notification); err != nil {
				return
			}
		case <-ticker.C:
			deadline := time.Now().Add(webSocketWriteTimeout)
			if err := client.conn.WriteControl(websocket.PingMessage, nil, deadline); err != nil {
				return
			}
		case <-client.done:
			return
		}
	}
}

var _ TradeNotifier = (*TradeHub)(nil)
var _ WebSocketServer = (*TradeHub)(nil)
