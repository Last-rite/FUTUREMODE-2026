package database_test

import (
	"context"
	"errors"
	"testing"

	"github.com/Ian747-tw/noxcat_game_backend/internal/domain"
)

func TestCreatePlayerRollsBackWhenStartingUnitFails(t *testing.T) {
	store := newStoreTest(t)

	_, err := store.CreatePlayer(context.Background(), domain.NewPlayer{
		Username:     "rollback-player",
		PasswordHash: "hash",
		StartingUnits: []domain.NewUnit{{
			Species:   domain.UnitSpecies("invalid-species"),
			BaseStats: defaultStats,
		}},
	})
	if err == nil {
		t.Fatal("CreatePlayer() error = nil, want insertion error")
	}

	_, err = store.PlayerByUsername(context.Background(), "rollback-player")
	if !errors.Is(err, domain.ErrPlayerNotFound) {
		t.Fatalf("PlayerByUsername() error = %v, want ErrPlayerNotFound", err)
	}
}

func TestCreatePlayerAndReadEndpointData(t *testing.T) {
	store := newStoreTest(t)
	player := createPlayer(t, store, "endpoint-player", 6)

	loaded, err := store.PlayerByUsername(context.Background(), player.Username)
	if err != nil {
		t.Fatalf("PlayerByUsername() error = %v", err)
	}
	if loaded.ID != player.ID || loaded.PasswordHash != "bcrypt-hash" {
		t.Fatalf("loaded player = %#v, want id %q and password hash", loaded, player.ID)
	}

	status, err := store.PlayerStatus(context.Background(), player.ID)
	if err != nil || status != domain.PlayerStatusIdle {
		t.Fatalf("PlayerStatus() = %q, %v; want idle, nil", status, err)
	}
	units, err := store.ListPlayerUnits(context.Background(), player.ID)
	if err != nil {
		t.Fatalf("ListPlayerUnits() error = %v", err)
	}
	if len(units) != 6 {
		t.Fatalf("ListPlayerUnits() count = %d, want 6", len(units))
	}
}

func TestBattleLifecycleIsAtomic(t *testing.T) {
	store := newStoreTest(t)
	player := createPlayer(t, store, "battle-player", 3)
	dungeon := createDungeon(t, store)
	units, err := store.ListPlayerUnits(context.Background(), player.ID)
	if err != nil {
		t.Fatal(err)
	}
	snapshot, err := startBattleSession(store, context.Background(), player.ID, dungeon.ID)
	if err != nil {
		t.Fatalf("StartBattleSession() error = %v", err)
	}
	if len(snapshot.Units) != 3 || snapshot.Dungeon.ID != dungeon.ID {
		t.Fatalf("StartBattleSession() snapshot = %#v", snapshot)
	}

	settledStats := units[0].CurrentStats
	settledStats.Health = 8
	err = settleActiveBattleSession(store, context.Background(), domain.BattleResult{
		PlayerID:   player.ID,
		DungeonID:  dungeon.ID,
		Won:        true,
		MoneyAward: dungeon.RewardMoney,
		Units: []domain.UnitSettlement{{
			UnitID:       units[0].ID,
			CurrentStats: settledStats,
			IsAlive:      true,
		}},
		TreasureDrops: []domain.NewTreasure{{DamageBonus: 2}},
	})
	if err != nil {
		t.Fatalf("SettleBattleSession() error = %v", err)
	}

	loaded, err := store.PlayerByID(context.Background(), player.ID)
	if err != nil {
		t.Fatal(err)
	}
	if loaded.Status != domain.PlayerStatusIdle || loaded.Money != 125 {
		t.Fatalf("settled player status/money = %q/%d, want idle/125", loaded.Status, loaded.Money)
	}
	progress, err := store.ListSolvedDungeons(context.Background(), player.ID)
	if err != nil || len(progress) != 1 || progress[0].ID != dungeon.ID {
		t.Fatalf("ListSolvedDungeons() = %#v, %v", progress, err)
	}
}

func TestBattleUsesOnlyEquippedLivingUnits(t *testing.T) {
	store := newStoreTest(t)
	player := createPlayer(t, store, "loadout-player", 5)
	dungeon := createDungeon(t, store)
	units, err := store.ListPlayerUnits(context.Background(), player.ID)
	if err != nil {
		t.Fatal(err)
	}

	wantedUnitIDs := []string{units[3].ID, units[4].ID}
	if err := store.SetBattleLoadout(context.Background(), player.ID, wantedUnitIDs); err != nil {
		t.Fatalf("SetBattleLoadout() error = %v", err)
	}
	snapshot, err := startBattleSession(store, context.Background(), player.ID, dungeon.ID)
	if err != nil {
		t.Fatalf("StartBattleSession() error = %v", err)
	}
	if len(snapshot.Units) != 2 {
		t.Fatalf("battle unit count = %d, want 2", len(snapshot.Units))
	}
	gotIDs := map[string]bool{
		snapshot.Units[0].ID: true,
		snapshot.Units[1].ID: true,
	}
	for _, unitID := range wantedUnitIDs {
		if !gotIDs[unitID] {
			t.Errorf("battle snapshot missing equipped unit %q", unitID)
		}
	}
}

func TestSetUnitEquippedEnforcesMaximum(t *testing.T) {
	store := newStoreTest(t)
	player := createPlayer(t, store, "maximum-loadout-player", 4)
	units, err := store.ListPlayerUnits(context.Background(), player.ID)
	if err != nil {
		t.Fatal(err)
	}
	var equippedUnitID, unequippedUnitID string
	for _, unit := range units {
		if unit.IsEquipped {
			equippedUnitID = unit.ID
		} else {
			unequippedUnitID = unit.ID
		}
	}

	if err := store.SetUnitEquipped(context.Background(), player.ID, unequippedUnitID, true); !errors.Is(err, domain.ErrBattleLoadoutFull) {
		t.Fatalf("equip fourth unit error = %v, want ErrBattleLoadoutFull", err)
	}
	if err := store.SetUnitEquipped(context.Background(), player.ID, equippedUnitID, false); err != nil {
		t.Fatalf("unequip unit error = %v", err)
	}
	if err := store.SetUnitEquipped(context.Background(), player.ID, unequippedUnitID, true); err != nil {
		t.Fatalf("equip replacement unit error = %v", err)
	}
}

func TestEquipTreasureUpdatesBothSidesAndStats(t *testing.T) {
	store := newStoreTest(t)
	player := createPlayer(t, store, "equip-player", 1)
	units, _ := store.ListPlayerUnits(context.Background(), player.ID)
	treasure := createTreasure(t, player.ID, 3)

	if err := store.EquipTreasure(context.Background(), player.ID, treasure.ID, units[0].ID); err != nil {
		t.Fatalf("EquipTreasure() error = %v", err)
	}
	units, _ = store.ListPlayerUnits(context.Background(), player.ID)
	if units[0].EquippedTreasureID == nil || *units[0].EquippedTreasureID != treasure.ID {
		t.Fatalf("equipped treasure = %v, want %q", units[0].EquippedTreasureID, treasure.ID)
	}
	if units[0].CurrentStats.Attack != defaultStats.Attack+3 {
		t.Fatalf("current attack = %d, want %d", units[0].CurrentStats.Attack, defaultStats.Attack+3)
	}
}

func TestExpandedTreasureStatsAndUnequipRoundTrip(t *testing.T) {
	store := newStoreTest(t)
	player := createPlayer(t, store, "expanded-treasure-player", 1)
	units, _ := store.ListPlayerUnits(context.Background(), player.ID)
	var treasureID string
	if err := testPool.QueryRow(context.Background(), `
		INSERT INTO treasures (
			owner_id, code, name, treasure_type, rarity, damage_bonus,
			health_bonus, defense_bonus, speed_bonus, effect_code, charges
		) VALUES ($1, 'home-stone', '回家石', 'utility', 'epic', 2, 5, 3, 4, 'home_stone', 1)
		RETURNING id`, player.ID).Scan(&treasureID); err != nil {
		t.Fatal(err)
	}
	if err := store.EquipTreasure(context.Background(), player.ID, treasureID, units[0].ID); err != nil {
		t.Fatal(err)
	}
	loadedUnits, _ := store.ListPlayerUnits(context.Background(), player.ID)
	wantStats := domain.Stats{
		Attack: defaultStats.Attack + 2, Health: defaultStats.Health + 5,
		Defense: defaultStats.Defense + 3, Speed: defaultStats.Speed + 4,
	}
	if loadedUnits[0].CurrentStats != wantStats {
		t.Fatalf("equipped stats = %+v, want %+v", loadedUnits[0].CurrentStats, wantStats)
	}
	treasures, err := store.ListPlayerTreasures(context.Background(), player.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(treasures) != 1 || treasures[0].Code != "home-stone" || treasures[0].EffectCode == nil || *treasures[0].EffectCode != "home_stone" {
		t.Fatalf("expanded treasure = %+v", treasures)
	}
	if err := store.UnequipTreasure(context.Background(), player.ID, treasureID); err != nil {
		t.Fatal(err)
	}
	loadedUnits, _ = store.ListPlayerUnits(context.Background(), player.ID)
	if loadedUnits[0].EquippedTreasureID != nil || loadedUnits[0].CurrentStats != defaultStats {
		t.Fatalf("unequipped unit = %+v", loadedUnits[0])
	}
	if err := store.UnequipTreasure(context.Background(), player.ID, treasureID); err != nil {
		t.Fatalf("idempotent UnequipTreasure() error = %v", err)
	}
}

func TestTradeLifecycle(t *testing.T) {
	store := newStoreTest(t)
	sender := createPlayer(t, store, "trade-sender", 1)
	recipient := createPlayer(t, store, "trade-recipient", 0)
	units, _ := store.ListPlayerUnits(context.Background(), sender.ID)
	makeUnitTradeable(t, units[0].ID)

	trade, err := store.CreateTrade(context.Background(), domain.NewTrade{
		FromPlayerID: sender.ID,
		ToPlayerID:   recipient.ID,
		UnitID:       stringPointer(units[0].ID),
	})
	if err != nil {
		t.Fatalf("CreateTrade() error = %v", err)
	}
	accepted, err := store.AcceptTrade(context.Background(), trade.ID, recipient.ID)
	if err != nil {
		t.Fatalf("AcceptTrade() error = %v", err)
	}
	if accepted.Status != domain.TradeStatusAccepted {
		t.Fatalf("accepted status = %q", accepted.Status)
	}
	recipientUnits, _ := store.ListPlayerUnits(context.Background(), recipient.ID)
	if len(recipientUnits) != 1 || recipientUnits[0].ID != units[0].ID {
		t.Fatalf("recipient units = %#v", recipientUnits)
	}
	if recipientUnits[0].IsEquipped {
		t.Fatal("transferred unit remained equipped in recipient loadout")
	}
	status := domain.TradeStatusAccepted
	trades, err := store.ListPlayerTrades(context.Background(), recipient.ID, &status)
	if err != nil || len(trades) != 1 || trades[0].ID != trade.ID {
		t.Fatalf("ListPlayerTrades() = %#v, %v", trades, err)
	}
}

func TestRejectTrade(t *testing.T) {
	store := newStoreTest(t)
	sender := createPlayer(t, store, "reject-sender", 0)
	recipient := createPlayer(t, store, "reject-recipient", 0)
	treasure := createTreasure(t, sender.ID, 1)
	trade, err := store.CreateTrade(context.Background(), domain.NewTrade{
		FromPlayerID: sender.ID,
		ToPlayerID:   recipient.ID,
		TreasureID:   stringPointer(treasure.ID),
	})
	if err != nil {
		t.Fatal(err)
	}
	rejected, err := store.RejectTrade(context.Background(), trade.ID, recipient.ID)
	if err != nil {
		t.Fatalf("RejectTrade() error = %v", err)
	}
	if rejected.Status != domain.TradeStatusRejected {
		t.Fatalf("rejected status = %q", rejected.Status)
	}
}

func TestAdminStoreMethods(t *testing.T) {
	store := newStoreTest(t)
	player := createPlayer(t, store, "admin-target", 0)
	dungeon := createDungeon(t, store)

	dungeon.Name = "Updated Dungeon"
	dungeon.RewardMoney = 40
	updated, err := store.UpdateDungeon(context.Background(), dungeon)
	if err != nil {
		t.Fatalf("UpdateDungeon() error = %v", err)
	}
	if updated.Name != dungeon.Name || updated.RewardMoney != 40 {
		t.Fatalf("updated dungeon = %#v", updated)
	}
	if err := store.BanPlayer(context.Background(), player.ID); err != nil {
		t.Fatalf("BanPlayer() error = %v", err)
	}
	if err := store.AdjustPlayerMoney(context.Background(), player.ID, 15); err != nil {
		t.Fatalf("AdjustPlayerMoney() error = %v", err)
	}
	loaded, err := store.PlayerByID(context.Background(), player.ID)
	if err != nil {
		t.Fatal(err)
	}
	if !loaded.IsBanned || loaded.Money != 115 {
		t.Fatalf("admin-updated player = %#v", loaded)
	}
}
