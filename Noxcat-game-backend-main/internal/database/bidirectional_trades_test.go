package database_test

import (
	"context"
	"errors"
	"sync"
	"testing"

	"github.com/Ian747-tw/noxcat_game_backend/internal/domain"
)

func TestBidirectionalTradeSwapsUnitForMultipleTreasuresAtomically(t *testing.T) {
	store := newStoreTest(t)
	sender := createPlayer(t, store, "barter-unit-sender", 1)
	recipient := createPlayer(t, store, "barter-treasure-recipient", 0)
	units, _ := store.ListPlayerUnits(context.Background(), sender.ID)
	makeUnitTradeable(t, units[0].ID)
	firstTreasure := createTreasure(t, recipient.ID, 2)
	secondTreasure := createTreasure(t, recipient.ID, 4)

	trade, err := store.CreateTrade(context.Background(), domain.NewTrade{
		FromPlayerID: sender.ID,
		ToPlayerID:   recipient.ID,
		UnitID:       stringPointer(units[0].ID),
		RequestedAssets: []domain.TradeAsset{
			{TreasureID: stringPointer(firstTreasure.ID)},
			{TreasureID: stringPointer(secondTreasure.ID)},
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(trade.RequestedAssets) != 2 {
		t.Fatalf("created requested assets = %#v", trade.RequestedAssets)
	}
	var offeredReserved, firstRequestedReserved, secondRequestedReserved bool
	if err := testPool.QueryRow(context.Background(), `
		SELECT
			bool_or(reserved) FILTER (WHERE side = 'offered'),
			COALESCE(bool_or(reserved) FILTER (WHERE treasure_id = $2), false),
			COALESCE(bool_or(reserved) FILTER (WHERE treasure_id = $3), false)
		FROM trade_assets WHERE trade_id = $1`, trade.ID, firstTreasure.ID, secondTreasure.ID,
	).Scan(&offeredReserved, &firstRequestedReserved, &secondRequestedReserved); err != nil {
		t.Fatal(err)
	}
	if !offeredReserved || firstRequestedReserved || secondRequestedReserved {
		t.Fatalf("reservation flags offered/requests = %t/%t/%t", offeredReserved, firstRequestedReserved, secondRequestedReserved)
	}
	inventory, err := store.ListTradeAssets(context.Background(), recipient.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(inventory.Treasures) != 2 {
		t.Fatalf("recipient tradeable treasures while request pending = %d, want 2", len(inventory.Treasures))
	}

	accepted, err := store.AcceptTrade(context.Background(), trade.ID, recipient.ID)
	if err != nil {
		t.Fatal(err)
	}
	if accepted.Status != domain.TradeStatusAccepted || len(accepted.RequestedAssets) != 2 {
		t.Fatalf("accepted trade = %#v", accepted)
	}
	assertAssetOwner(t, "units", units[0].ID, recipient.ID)
	assertAssetOwner(t, "treasures", firstTreasure.ID, sender.ID)
	assertAssetOwner(t, "treasures", secondTreasure.ID, sender.ID)
	var reservedCount int
	if err := testPool.QueryRow(context.Background(), `SELECT count(*) FROM trade_assets WHERE trade_id = $1 AND reserved = true`, trade.ID).Scan(&reservedCount); err != nil {
		t.Fatal(err)
	}
	if reservedCount != 0 {
		t.Fatalf("accepted reserved asset count = %d, want 0", reservedCount)
	}

	listed, err := store.ListPlayerTrades(context.Background(), sender.ID, nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(listed) != 1 || len(listed[0].RequestedAssets) != 2 || *listed[0].RequestedAssets[1].TreasureID != secondTreasure.ID {
		t.Fatalf("listed bidirectional trade = %#v", listed)
	}
}

func TestBidirectionalUnitSwapRemovesBothLoadoutMemberships(t *testing.T) {
	store := newStoreTest(t)
	first := createPlayer(t, store, "unit-swap-first", 4)
	second := createPlayer(t, store, "unit-swap-second", 4)
	firstUnits, _ := store.ListPlayerUnits(context.Background(), first.ID)
	secondUnits, _ := store.ListPlayerUnits(context.Background(), second.ID)
	firstUnitID := firstUnequippedUnitID(t, firstUnits)
	secondUnitID := firstUnequippedUnitID(t, secondUnits)
	makeUnitNonPermanent(t, firstUnitID)
	makeUnitNonPermanent(t, secondUnitID)
	if err := store.SetPlayerLoadout(context.Background(), first.ID, 2, []string{firstUnitID}); err != nil {
		t.Fatal(err)
	}
	if err := store.SetPlayerLoadout(context.Background(), second.ID, 2, []string{secondUnitID}); err != nil {
		t.Fatal(err)
	}

	trade, err := store.CreateTrade(context.Background(), domain.NewTrade{
		FromPlayerID: first.ID, ToPlayerID: second.ID, UnitID: stringPointer(firstUnitID),
		RequestedAssets: []domain.TradeAsset{{UnitID: stringPointer(secondUnitID)}},
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := store.AcceptTrade(context.Background(), trade.ID, second.ID); err != nil {
		t.Fatal(err)
	}
	assertAssetOwner(t, "units", firstUnitID, second.ID)
	assertAssetOwner(t, "units", secondUnitID, first.ID)
	for _, playerID := range []string{first.ID, second.ID} {
		loadouts, err := store.ListPlayerLoadouts(context.Background(), playerID)
		if err != nil {
			t.Fatal(err)
		}
		for _, loadout := range loadouts {
			if len(loadout.UnitIDs) != 0 && (containsString(loadout.UnitIDs, firstUnitID) || containsString(loadout.UnitIDs, secondUnitID)) {
				t.Fatalf("transferred unit remains in player %s loadout %d: %v", playerID, loadout.Slot, loadout.UnitIDs)
			}
		}
	}
}

func TestRequestedAssetCanChangeBeforeAcceptAndRollsBackOffer(t *testing.T) {
	store := newStoreTest(t)
	sender := createPlayer(t, store, "changing-request-sender", 0)
	recipient := createPlayer(t, store, "changing-request-recipient", 0)
	third := createPlayer(t, store, "changing-request-third", 0)
	offered := createTreasure(t, sender.ID, 1)
	requested := createTreasure(t, recipient.ID, 2)
	first, err := store.CreateTrade(context.Background(), domain.NewTrade{
		FromPlayerID: sender.ID, ToPlayerID: recipient.ID, TreasureID: stringPointer(offered.ID),
		RequestedAssets: []domain.TradeAsset{{TreasureID: stringPointer(requested.ID)}},
	})
	if err != nil {
		t.Fatal(err)
	}
	forward, err := store.CreateTrade(context.Background(), domain.NewTrade{
		FromPlayerID: recipient.ID, ToPlayerID: third.ID, TreasureID: stringPointer(requested.ID),
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := store.AcceptTrade(context.Background(), first.ID, recipient.ID); !errors.Is(err, domain.ErrAssetReserved) {
		t.Fatalf("reserved requested asset accept error = %v, want ErrAssetReserved", err)
	}
	assertAssetOwner(t, "treasures", offered.ID, sender.ID)
	if _, err := store.AcceptTrade(context.Background(), forward.ID, third.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := store.AcceptTrade(context.Background(), first.ID, recipient.ID); !errors.Is(err, domain.ErrAssetNotOwned) {
		t.Fatalf("stale requested asset accept error = %v, want ErrAssetNotOwned", err)
	}
	assertAssetOwner(t, "treasures", offered.ID, sender.ID)
	var status domain.TradeStatus
	var reserved bool
	if err := testPool.QueryRow(context.Background(), `
		SELECT t.status, a.reserved FROM trades t
		JOIN trade_assets a ON a.trade_id = t.id AND a.side = 'offered'
		WHERE t.id = $1`, first.ID).Scan(&status, &reserved); err != nil {
		t.Fatal(err)
	}
	if status != domain.TradeStatusPending || !reserved {
		t.Fatalf("failed accept status/reservation = %q/%t, want pending/true", status, reserved)
	}
}

func TestCancelAndRejectReleaseOfferedReservation(t *testing.T) {
	store := newStoreTest(t)
	sender := createPlayer(t, store, "close-trade-sender", 0)
	recipient := createPlayer(t, store, "close-trade-recipient", 0)
	third := createPlayer(t, store, "close-trade-third", 0)
	treasure := createTreasure(t, sender.ID, 1)

	trade, err := store.CreateTrade(context.Background(), domain.NewTrade{
		FromPlayerID: sender.ID, ToPlayerID: recipient.ID, TreasureID: stringPointer(treasure.ID),
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := store.CancelTrade(context.Background(), trade.ID, recipient.ID); !errors.Is(err, domain.ErrTradeSender) {
		t.Fatalf("recipient CancelTrade() error = %v, want ErrTradeSender", err)
	}
	cancelled, err := store.CancelTrade(context.Background(), trade.ID, sender.ID)
	if err != nil || cancelled.Status != domain.TradeStatusCancelled {
		t.Fatalf("CancelTrade() = %#v, %v", cancelled, err)
	}

	reoffered, err := store.CreateTrade(context.Background(), domain.NewTrade{
		FromPlayerID: sender.ID, ToPlayerID: third.ID, TreasureID: stringPointer(treasure.ID),
	})
	if err != nil {
		t.Fatalf("reoffer after cancel: %v", err)
	}
	if _, err := store.RejectTrade(context.Background(), reoffered.ID, third.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := store.CreateTrade(context.Background(), domain.NewTrade{
		FromPlayerID: sender.ID, ToPlayerID: recipient.ID, TreasureID: stringPointer(treasure.ID),
	}); err != nil {
		t.Fatalf("reoffer after reject: %v", err)
	}
}

func TestAcceptAndCancelRaceHasSingleTerminalState(t *testing.T) {
	store := newStoreTest(t)
	sender := createPlayer(t, store, "accept-cancel-sender", 0)
	recipient := createPlayer(t, store, "accept-cancel-recipient", 0)
	treasure := createTreasure(t, sender.ID, 1)
	trade, err := store.CreateTrade(context.Background(), domain.NewTrade{
		FromPlayerID: sender.ID, ToPlayerID: recipient.ID, TreasureID: stringPointer(treasure.ID),
	})
	if err != nil {
		t.Fatal(err)
	}
	start := make(chan struct{})
	results := make(chan error, 2)
	var waitGroup sync.WaitGroup
	waitGroup.Add(2)
	go func() {
		defer waitGroup.Done()
		<-start
		_, err := store.AcceptTrade(context.Background(), trade.ID, recipient.ID)
		results <- err
	}()
	go func() {
		defer waitGroup.Done()
		<-start
		_, err := store.CancelTrade(context.Background(), trade.ID, sender.ID)
		results <- err
	}()
	close(start)
	waitGroup.Wait()
	close(results)
	successes := 0
	for err := range results {
		if err == nil {
			successes++
		} else if !errors.Is(err, domain.ErrTradeNotPending) {
			t.Fatalf("race error = %v, want ErrTradeNotPending", err)
		}
	}
	if successes != 1 {
		t.Fatalf("terminal transition successes = %d, want 1", successes)
	}
	var status domain.TradeStatus
	var reserved bool
	if err := testPool.QueryRow(context.Background(), `
		SELECT t.status, a.reserved FROM trades t
		JOIN trade_assets a ON a.trade_id = t.id AND a.side = 'offered'
		WHERE t.id = $1`, trade.ID).Scan(&status, &reserved); err != nil {
		t.Fatal(err)
	}
	if (status != domain.TradeStatusAccepted && status != domain.TradeStatusCancelled) || reserved {
		t.Fatalf("terminal status/reservation = %q/%t", status, reserved)
	}
}

func TestReservedAssetsCannotBeEquippedOrAddedToLoadout(t *testing.T) {
	store := newStoreTest(t)
	sender := createPlayer(t, store, "reserved-mutation-sender", 1)
	recipient := createPlayer(t, store, "reserved-mutation-recipient", 0)
	units, _ := store.ListPlayerUnits(context.Background(), sender.ID)
	makeUnitTradeable(t, units[0].ID)
	treasure := createTreasure(t, sender.ID, 1)
	trade, err := store.CreateTrade(context.Background(), domain.NewTrade{
		FromPlayerID: sender.ID, ToPlayerID: recipient.ID, UnitID: stringPointer(units[0].ID),
	})
	if err != nil {
		t.Fatal(err)
	}
	if err := store.SetPlayerLoadout(context.Background(), sender.ID, 1, []string{units[0].ID}); !errors.Is(err, domain.ErrAssetReserved) {
		t.Fatalf("reserved unit loadout error = %v, want ErrAssetReserved", err)
	}
	if err := store.EquipTreasure(context.Background(), sender.ID, treasure.ID, units[0].ID); !errors.Is(err, domain.ErrAssetReserved) {
		t.Fatalf("reserved unit equip error = %v, want ErrAssetReserved", err)
	}
	if _, err := store.CancelTrade(context.Background(), trade.ID, sender.ID); err != nil {
		t.Fatal(err)
	}
	if err := store.SetPlayerLoadout(context.Background(), sender.ID, 1, []string{units[0].ID}); err != nil {
		t.Fatalf("loadout after cancellation: %v", err)
	}
	if err := store.SetPlayerLoadout(context.Background(), sender.ID, 1, nil); err != nil {
		t.Fatal(err)
	}
	treasureTrade, err := store.CreateTrade(context.Background(), domain.NewTrade{
		FromPlayerID: sender.ID, ToPlayerID: recipient.ID, TreasureID: stringPointer(treasure.ID),
	})
	if err != nil {
		t.Fatal(err)
	}
	if err := store.EquipTreasure(context.Background(), sender.ID, treasure.ID, units[0].ID); !errors.Is(err, domain.ErrAssetReserved) {
		t.Fatalf("reserved treasure equip error = %v, want ErrAssetReserved", err)
	}
	if _, err := store.CancelTrade(context.Background(), treasureTrade.ID, sender.ID); err != nil {
		t.Fatal(err)
	}
}

func TestPermanentActiveAndDeadUnitsCannotBeOffered(t *testing.T) {
	store := newStoreTest(t)
	sender := createPlayer(t, store, "protected-trade-sender", 2)
	recipient := createPlayer(t, store, "protected-trade-recipient", 0)
	units, _ := store.ListPlayerUnits(context.Background(), sender.ID)
	for _, unit := range units {
		if _, err := store.CreateTrade(context.Background(), domain.NewTrade{
			FromPlayerID: sender.ID, ToPlayerID: recipient.ID, UnitID: stringPointer(unit.ID),
		}); !errors.Is(err, domain.ErrUnitUnavailable) {
			t.Fatalf("protected unit CreateTrade() error = %v, want ErrUnitUnavailable", err)
		}
	}
	makeUnitTradeable(t, units[0].ID)
	if _, err := testPool.Exec(context.Background(), `UPDATE units SET is_alive = false WHERE id = $1`, units[0].ID); err != nil {
		t.Fatal(err)
	}
	if _, err := store.CreateTrade(context.Background(), domain.NewTrade{
		FromPlayerID: sender.ID, ToPlayerID: recipient.ID, UnitID: stringPointer(units[0].ID),
	}); !errors.Is(err, domain.ErrUnitUnavailable) {
		t.Fatalf("dead unit CreateTrade() error = %v, want ErrUnitUnavailable", err)
	}
}

func assertAssetOwner(t *testing.T, table, assetID, wantOwnerID string) {
	t.Helper()
	var ownerID string
	if err := testPool.QueryRow(context.Background(), `SELECT owner_id FROM `+table+` WHERE id = $1`, assetID).Scan(&ownerID); err != nil {
		t.Fatal(err)
	}
	if ownerID != wantOwnerID {
		t.Fatalf("%s %s owner = %s, want %s", table, assetID, ownerID, wantOwnerID)
	}
}

func containsString(values []string, target string) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}

func firstUnequippedUnitID(t *testing.T, units []domain.Unit) string {
	t.Helper()
	for _, unit := range units {
		if !unit.IsEquipped {
			return unit.ID
		}
	}
	t.Fatal("missing unequipped unit")
	return ""
}
