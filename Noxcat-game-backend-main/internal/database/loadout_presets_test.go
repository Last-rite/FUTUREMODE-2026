package database_test

import (
	"context"
	"errors"
	"testing"

	"github.com/Ian747-tw/noxcat_game_backend/internal/domain"
)

func TestCreatePlayerInitializesFiveLoadouts(t *testing.T) {
	store := newStoreTest(t)
	player := createPlayer(t, store, "five-loadouts", 6)
	loadouts, err := store.ListPlayerLoadouts(context.Background(), player.ID)
	if err != nil {
		t.Fatalf("ListPlayerLoadouts() error = %v", err)
	}
	if len(loadouts) != 5 {
		t.Fatalf("loadout count = %d, want 5", len(loadouts))
	}
	for index, loadout := range loadouts {
		if loadout.Slot != index+1 || loadout.PlayerID != player.ID {
			t.Fatalf("loadout %d = %+v", index, loadout)
		}
		wantUnits := 0
		if loadout.Slot == 1 {
			wantUnits = 3
		}
		if len(loadout.UnitIDs) != wantUnits {
			t.Fatalf("slot %d unit count = %d, want %d", loadout.Slot, len(loadout.UnitIDs), wantUnits)
		}
	}
	loaded, err := store.PlayerByID(context.Background(), player.ID)
	if err != nil {
		t.Fatal(err)
	}
	if loaded.ActiveLoadoutSlot != 1 {
		t.Fatalf("active slot = %d, want 1", loaded.ActiveLoadoutSlot)
	}
}

func TestPersistedLoadoutActivationUpdatesCompatibilityFlags(t *testing.T) {
	store := newStoreTest(t)
	player := createPlayer(t, store, "activate-loadout", 6)
	units, err := store.ListPlayerUnits(context.Background(), player.ID)
	if err != nil {
		t.Fatal(err)
	}
	selected := make([]string, 0, 2)
	for _, unit := range units {
		if !unit.IsEquipped && len(selected) < 2 {
			selected = append(selected, unit.ID)
		}
	}
	if len(selected) != 2 {
		t.Fatalf("unequipped unit count = %d, want at least 2", len(selected))
	}
	if err := store.SetPlayerLoadout(context.Background(), player.ID, 2, selected); err != nil {
		t.Fatalf("SetPlayerLoadout() error = %v", err)
	}
	before, err := store.ListPlayerUnits(context.Background(), player.ID)
	if err != nil {
		t.Fatal(err)
	}
	for _, unit := range before {
		if (unit.ID == selected[0] || unit.ID == selected[1]) && unit.IsEquipped {
			t.Fatal("editing inactive loadout changed active flags")
		}
	}
	if err := store.SetActivePlayerLoadout(context.Background(), player.ID, 2); err != nil {
		t.Fatalf("SetActivePlayerLoadout() error = %v", err)
	}
	after, err := store.ListPlayerUnits(context.Background(), player.ID)
	if err != nil {
		t.Fatal(err)
	}
	for _, unit := range after {
		want := unit.ID == selected[0] || unit.ID == selected[1]
		if unit.IsEquipped != want {
			t.Fatalf("unit %s equipped = %v, want %v", unit.ID, unit.IsEquipped, want)
		}
	}
	loaded, err := store.PlayerByID(context.Background(), player.ID)
	if err != nil {
		t.Fatal(err)
	}
	if loaded.ActiveLoadoutSlot != 2 {
		t.Fatalf("active slot = %d, want 2", loaded.ActiveLoadoutSlot)
	}
}

func TestLoadoutPresetRejectsCombatAndRollsBack(t *testing.T) {
	store := newStoreTest(t)
	player := createPlayer(t, store, "busy-loadout", 4)
	dungeon := createDungeon(t, store)
	if _, err := startBattleSession(store, context.Background(), player.ID, dungeon.ID); err != nil {
		t.Fatal(err)
	}
	units, err := store.ListPlayerUnits(context.Background(), player.ID)
	if err != nil {
		t.Fatal(err)
	}
	if err := store.SetPlayerLoadout(context.Background(), player.ID, 2, []string{units[3].ID}); !errors.Is(err, domain.ErrPlayerBusy) {
		t.Fatalf("SetPlayerLoadout() error = %v, want ErrPlayerBusy", err)
	}
	if err := store.SetActivePlayerLoadout(context.Background(), player.ID, 2); !errors.Is(err, domain.ErrPlayerBusy) {
		t.Fatalf("SetActivePlayerLoadout() error = %v, want ErrPlayerBusy", err)
	}
	loadouts, err := store.ListPlayerLoadouts(context.Background(), player.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(loadouts[1].UnitIDs) != 0 {
		t.Fatal("failed combat mutation changed loadout")
	}
}

func TestLoadoutPresetValidatesOwnershipDeadUnitsAndSlot(t *testing.T) {
	store := newStoreTest(t)
	player := createPlayer(t, store, "validate-loadout", 4)
	other := createPlayer(t, store, "validate-other", 1)
	units, _ := store.ListPlayerUnits(context.Background(), player.ID)
	otherUnits, _ := store.ListPlayerUnits(context.Background(), other.ID)
	if err := store.SetPlayerLoadout(context.Background(), player.ID, 0, nil); !errors.Is(err, domain.ErrInvalidUnitSelection) {
		t.Errorf("slot zero error = %v", err)
	}
	if err := store.SetPlayerLoadout(context.Background(), player.ID, 2, []string{otherUnits[0].ID}); !errors.Is(err, domain.ErrAssetNotOwned) {
		t.Errorf("foreign unit error = %v", err)
	}
	if _, err := testPool.Exec(context.Background(), `UPDATE units SET is_alive = false WHERE id = $1`, units[3].ID); err != nil {
		t.Fatal(err)
	}
	if err := store.SetPlayerLoadout(context.Background(), player.ID, 2, []string{units[3].ID}); !errors.Is(err, domain.ErrUnitUnavailable) {
		t.Errorf("dead unit error = %v", err)
	}
}

func TestTransferredUnitIsRemovedFromInactiveLoadouts(t *testing.T) {
	store := newStoreTest(t)
	sender := createPlayer(t, store, "loadout-trade-sender", 4)
	recipient := createPlayer(t, store, "loadout-trade-recipient", 0)
	units, err := store.ListPlayerUnits(context.Background(), sender.ID)
	if err != nil {
		t.Fatal(err)
	}
	var offeredID string
	for _, unit := range units {
		if !unit.IsEquipped {
			offeredID = unit.ID
			break
		}
	}
	if offeredID == "" {
		t.Fatal("missing unequipped unit")
	}
	makeUnitNonPermanent(t, offeredID)
	if err := store.SetPlayerLoadout(context.Background(), sender.ID, 2, []string{offeredID}); err != nil {
		t.Fatal(err)
	}
	trade, err := store.CreateTrade(context.Background(), domain.NewTrade{
		FromPlayerID: sender.ID,
		ToPlayerID:   recipient.ID,
		UnitID:       stringPointer(offeredID),
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := store.AcceptTrade(context.Background(), trade.ID, recipient.ID); err != nil {
		t.Fatal(err)
	}
	loadouts, err := store.ListPlayerLoadouts(context.Background(), sender.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(loadouts[1].UnitIDs) != 0 {
		t.Fatalf("transferred unit remains in inactive loadout: %v", loadouts[1].UnitIDs)
	}
}
