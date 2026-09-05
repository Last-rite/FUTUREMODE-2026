package database_test

import (
	"context"
	"errors"
	"testing"

	"github.com/Ian747-tw/noxcat_game_backend/internal/domain"
)

func TestCombatBlocksLoadoutMutationsWithoutChangingFlags(t *testing.T) {
	store := newStoreTest(t)
	player := createPlayer(t, store, "combat-loadout-player", 4)
	dungeon := createDungeon(t, store)
	before, err := store.ListPlayerUnits(context.Background(), player.ID)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := startBattleSession(store, context.Background(), player.ID, dungeon.ID); err != nil {
		t.Fatal(err)
	}
	if err := store.SetBattleLoadout(context.Background(), player.ID, []string{before[3].ID}); !errors.Is(err, domain.ErrPlayerBusy) {
		t.Fatalf("SetBattleLoadout() error = %v, want ErrPlayerBusy", err)
	}
	if err := store.SetUnitEquipped(context.Background(), player.ID, before[0].ID, false); !errors.Is(err, domain.ErrPlayerBusy) {
		t.Fatalf("SetUnitEquipped() error = %v, want ErrPlayerBusy", err)
	}
	after, err := store.ListPlayerUnits(context.Background(), player.ID)
	if err != nil {
		t.Fatal(err)
	}
	for index := range before {
		if before[index].ID != after[index].ID || before[index].IsEquipped != after[index].IsEquipped {
			t.Fatalf("unit flags changed during combat: before=%+v after=%+v", before, after)
		}
	}
}

func TestCombatBlocksTreasureEquipmentWithoutPartialChanges(t *testing.T) {
	store := newStoreTest(t)
	player := createPlayer(t, store, "combat-treasure-player", 1)
	dungeon := createDungeon(t, store)
	units, _ := store.ListPlayerUnits(context.Background(), player.ID)
	treasure := createTreasure(t, player.ID, 3)
	if _, err := startBattleSession(store, context.Background(), player.ID, dungeon.ID); err != nil {
		t.Fatal(err)
	}
	if err := store.EquipTreasure(context.Background(), player.ID, treasure.ID, units[0].ID); !errors.Is(err, domain.ErrPlayerBusy) {
		t.Fatalf("EquipTreasure() error = %v, want ErrPlayerBusy", err)
	}
	loaded, _ := store.ListPlayerUnits(context.Background(), player.ID)
	if loaded[0].EquippedTreasureID != nil || loaded[0].CurrentStats != units[0].CurrentStats {
		t.Fatalf("unit changed during combat: before=%+v after=%+v", units[0], loaded[0])
	}
	var equippedBy *string
	if err := testPool.QueryRow(context.Background(), `SELECT equipped_by_unit_id FROM treasures WHERE id = $1`, treasure.ID).Scan(&equippedBy); err != nil {
		t.Fatal(err)
	}
	if equippedBy != nil {
		t.Fatalf("treasure equipped during combat by %q", *equippedBy)
	}
}

func TestAcceptTradeBlocksEitherCombatParticipantAndRollsBack(t *testing.T) {
	for _, combatant := range []string{"sender", "recipient"} {
		t.Run(combatant, func(t *testing.T) {
			store := newStoreTest(t)
			sender := createPlayer(t, store, "combat-trade-sender-"+combatant, 2)
			recipient := createPlayer(t, store, "combat-trade-recipient-"+combatant, 1)
			dungeon := createDungeon(t, store)
			senderUnits, _ := store.ListPlayerUnits(context.Background(), sender.ID)
			makeUnitTradeable(t, senderUnits[1].ID)
			trade, err := store.CreateTrade(context.Background(), domain.NewTrade{
				FromPlayerID: sender.ID,
				ToPlayerID:   recipient.ID,
				UnitID:       stringPointer(senderUnits[1].ID),
			})
			if err != nil {
				t.Fatal(err)
			}
			combatantID := sender.ID
			if combatant == "recipient" {
				combatantID = recipient.ID
			}
			if _, err := startBattleSession(store, context.Background(), combatantID, dungeon.ID); err != nil {
				t.Fatal(err)
			}
			if _, err := store.AcceptTrade(context.Background(), trade.ID, recipient.ID); !errors.Is(err, domain.ErrPlayerBusy) {
				t.Fatalf("AcceptTrade() error = %v, want ErrPlayerBusy", err)
			}
			var ownerID string
			if err := testPool.QueryRow(context.Background(), `SELECT owner_id FROM units WHERE id = $1`, senderUnits[1].ID).Scan(&ownerID); err != nil {
				t.Fatal(err)
			}
			if ownerID != sender.ID {
				t.Fatalf("unit owner = %q, want sender %q", ownerID, sender.ID)
			}
			var status domain.TradeStatus
			if err := testPool.QueryRow(context.Background(), `SELECT status FROM trades WHERE id = $1`, trade.ID).Scan(&status); err != nil {
				t.Fatal(err)
			}
			if status != domain.TradeStatusPending {
				t.Fatalf("trade status = %q, want pending", status)
			}
		})
	}
}

func TestCombatAllowsCreatingAndRejectingPendingTrade(t *testing.T) {
	store := newStoreTest(t)
	sender := createPlayer(t, store, "combat-offer-sender", 2)
	recipient := createPlayer(t, store, "combat-offer-recipient", 0)
	dungeon := createDungeon(t, store)
	units, _ := store.ListPlayerUnits(context.Background(), sender.ID)
	makeUnitTradeable(t, units[1].ID)
	if _, err := startBattleSession(store, context.Background(), sender.ID, dungeon.ID); err != nil {
		t.Fatal(err)
	}
	trade, err := store.CreateTrade(context.Background(), domain.NewTrade{
		FromPlayerID: sender.ID,
		ToPlayerID:   recipient.ID,
		UnitID:       stringPointer(units[1].ID),
	})
	if err != nil {
		t.Fatalf("CreateTrade() during combat error = %v", err)
	}
	rejected, err := store.RejectTrade(context.Background(), trade.ID, recipient.ID)
	if err != nil {
		t.Fatalf("RejectTrade() during combat error = %v", err)
	}
	if rejected.Status != domain.TradeStatusRejected {
		t.Fatalf("rejected trade status = %q", rejected.Status)
	}
}
