package database_test

import (
	"context"
	"errors"
	"testing"

	"github.com/Ian747-tw/noxcat_game_backend/internal/domain"
)

func TestCreatePlayerRejectsDuplicateUsername(t *testing.T) {
	store := newStoreTest(t)
	createPlayer(t, store, "duplicate-player", 0)

	_, err := store.CreatePlayer(context.Background(), domain.NewPlayer{
		Username:     "duplicate-player",
		PasswordHash: "another-hash",
	})
	if !errors.Is(err, domain.ErrUsernameTaken) {
		t.Fatalf("CreatePlayer() duplicate error = %v, want ErrUsernameTaken", err)
	}
}

func TestCreatePlayerRejectsMoreThanThreeEquippedUnits(t *testing.T) {
	store := newStoreTest(t)
	units := make([]domain.NewUnit, 4)
	for index := range units {
		units[index] = domain.NewUnit{
			Species:    domain.UnitSpeciesGeneric,
			BaseStats:  defaultStats,
			IsEquipped: true,
		}
	}
	_, err := store.CreatePlayer(context.Background(), domain.NewPlayer{
		Username:      "oversized-loadout",
		PasswordHash:  "hash",
		StartingUnits: units,
	})
	if !errors.Is(err, domain.ErrBattleLoadoutFull) {
		t.Fatalf("CreatePlayer() error = %v, want ErrBattleLoadoutFull", err)
	}
}

func TestPlayerQueriesReturnPreciseNotFoundErrors(t *testing.T) {
	store := newStoreTest(t)
	missingID := "00000000-0000-0000-0000-000000000001"

	if _, err := store.PlayerByID(context.Background(), missingID); !errors.Is(err, domain.ErrPlayerNotFound) {
		t.Errorf("PlayerByID() error = %v, want ErrPlayerNotFound", err)
	}
	if _, err := store.PlayerByUsername(context.Background(), "missing"); !errors.Is(err, domain.ErrPlayerNotFound) {
		t.Errorf("PlayerByUsername() error = %v, want ErrPlayerNotFound", err)
	}
	if _, err := store.PlayerStatus(context.Background(), missingID); !errors.Is(err, domain.ErrPlayerNotFound) {
		t.Errorf("PlayerStatus() error = %v, want ErrPlayerNotFound", err)
	}
	if _, err := store.ListPlayerUnits(context.Background(), missingID); !errors.Is(err, domain.ErrPlayerNotFound) {
		t.Errorf("ListPlayerUnits() error = %v, want ErrPlayerNotFound", err)
	}
	if _, err := store.ListSolvedDungeons(context.Background(), missingID); !errors.Is(err, domain.ErrPlayerNotFound) {
		t.Errorf("ListSolvedDungeons() error = %v, want ErrPlayerNotFound", err)
	}
	if _, err := store.ListPlayerDungeonProgress(context.Background(), missingID); !errors.Is(err, domain.ErrPlayerNotFound) {
		t.Errorf("ListPlayerDungeonProgress() error = %v, want ErrPlayerNotFound", err)
	}
}

func TestListPlayerDungeonProgress(t *testing.T) {
	store := newStoreTest(t)
	player := createPlayer(t, store, "progress-player", 0)
	dungeon := createDungeon(t, store)
	if _, err := testPool.Exec(context.Background(), `
		INSERT INTO player_dungeon_progress (player_id, dungeon_id, solved, solved_at)
		VALUES ($1, $2, true, now())`, player.ID, dungeon.ID); err != nil {
		t.Fatal(err)
	}

	progress, err := store.ListPlayerDungeonProgress(context.Background(), player.ID)
	if err != nil {
		t.Fatalf("ListPlayerDungeonProgress() error = %v", err)
	}
	if len(progress) != 1 || progress[0].PlayerID != player.ID || progress[0].DungeonID != dungeon.ID || !progress[0].Solved {
		t.Fatalf("progress = %#v", progress)
	}
}

func TestAdminMethodsHandleMissingAndInvalidPlayers(t *testing.T) {
	store := newStoreTest(t)
	missingID := "00000000-0000-0000-0000-000000000001"

	if err := store.BanPlayer(context.Background(), missingID); !errors.Is(err, domain.ErrPlayerNotFound) {
		t.Errorf("BanPlayer() error = %v, want ErrPlayerNotFound", err)
	}
	if err := store.AdjustPlayerMoney(context.Background(), missingID, 10); !errors.Is(err, domain.ErrPlayerNotFound) {
		t.Errorf("AdjustPlayerMoney() missing error = %v, want ErrPlayerNotFound", err)
	}
	player := createPlayer(t, store, "money-validation-player", 0)
	if err := store.AdjustPlayerMoney(context.Background(), player.ID, -101); !errors.Is(err, domain.ErrInvalidInput) {
		t.Errorf("AdjustPlayerMoney() overdraft error = %v, want ErrInvalidInput", err)
	}
	loaded, err := store.PlayerByID(context.Background(), player.ID)
	if err != nil {
		t.Fatal(err)
	}
	if loaded.Money != 100 {
		t.Fatalf("money after rejected adjustment = %d, want 100", loaded.Money)
	}
}

func TestDungeonValidationAndNotFound(t *testing.T) {
	store := newStoreTest(t)
	if _, err := store.CreateDungeon(context.Background(), domain.Dungeon{}); !errors.Is(err, domain.ErrInvalidInput) {
		t.Errorf("CreateDungeon() error = %v, want ErrInvalidInput", err)
	}
	_, err := store.UpdateDungeon(context.Background(), domain.Dungeon{
		ID:          "00000000-0000-0000-0000-000000000001",
		Name:        "Missing",
		EnemyConfig: []byte(`[]`),
	})
	if !errors.Is(err, domain.ErrDungeonNotFound) {
		t.Errorf("UpdateDungeon() error = %v, want ErrDungeonNotFound", err)
	}
}

func TestStartBattleSessionRejectsInvalidStateAndRollsBack(t *testing.T) {
	store := newStoreTest(t)
	player := createPlayer(t, store, "start-validation-player", 3)
	missingDungeonID := "00000000-0000-0000-0000-000000000001"

	if _, err := startBattleSession(store, context.Background(), player.ID, missingDungeonID); !errors.Is(err, domain.ErrDungeonNotFound) {
		t.Fatalf("StartBattleSession() error = %v, want ErrDungeonNotFound", err)
	}
	status, err := store.PlayerStatus(context.Background(), player.ID)
	if err != nil || status != domain.PlayerStatusIdle {
		t.Fatalf("status after rolled-back start = %q, %v; want idle", status, err)
	}

	if err := store.BanPlayer(context.Background(), player.ID); err != nil {
		t.Fatal(err)
	}
	dungeon := createDungeon(t, store)
	if _, err := startBattleSession(store, context.Background(), player.ID, dungeon.ID); !errors.Is(err, domain.ErrPlayerBanned) {
		t.Fatalf("banned StartBattleSession() error = %v, want ErrPlayerBanned", err)
	}
}

func TestStartBattleSessionRequiresActiveUnitsAndIdlePlayer(t *testing.T) {
	store := newStoreTest(t)
	player := createPlayer(t, store, "battle-state-player", 3)
	dungeon := createDungeon(t, store)
	if err := store.SetBattleLoadout(context.Background(), player.ID, nil); err != nil {
		t.Fatal(err)
	}
	if _, err := startBattleSession(store, context.Background(), player.ID, dungeon.ID); !errors.Is(err, domain.ErrInvalidUnitSelection) {
		t.Fatalf("empty-loadout StartBattleSession() error = %v, want ErrInvalidUnitSelection", err)
	}
	units, _ := store.ListPlayerUnits(context.Background(), player.ID)
	if err := store.SetBattleLoadout(context.Background(), player.ID, []string{units[0].ID}); err != nil {
		t.Fatal(err)
	}
	if _, err := startBattleSession(store, context.Background(), player.ID, dungeon.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := startBattleSession(store, context.Background(), player.ID, dungeon.ID); !errors.Is(err, domain.ErrPlayerBusy) {
		t.Fatalf("second StartBattleSession() error = %v, want ErrPlayerBusy", err)
	}
}

func TestSettleBattleSessionRejectsForeignUnitAndRollsBack(t *testing.T) {
	store := newStoreTest(t)
	player := createPlayer(t, store, "settle-validation-player", 1)
	dungeon := createDungeon(t, store)
	units, _ := store.ListPlayerUnits(context.Background(), player.ID)
	result := domain.BattleResult{
		PlayerID:  player.ID,
		DungeonID: dungeon.ID,
		Units: []domain.UnitSettlement{{
			UnitID:       units[0].ID,
			CurrentStats: units[0].CurrentStats,
			IsAlive:      true,
		}},
	}
	if _, err := startBattleSession(store, context.Background(), player.ID, dungeon.ID); err != nil {
		t.Fatal(err)
	}
	other := createPlayer(t, store, "other-settlement-owner", 1)
	otherUnits, _ := store.ListPlayerUnits(context.Background(), other.ID)
	result.Units = append(result.Units, domain.UnitSettlement{
		UnitID:       otherUnits[0].ID,
		CurrentStats: otherUnits[0].CurrentStats,
		IsAlive:      true,
	})
	if err := settleActiveBattleSession(store, context.Background(), result); !errors.Is(err, domain.ErrAssetNotOwned) {
		t.Fatalf("foreign-unit SettleBattleSession() error = %v, want ErrAssetNotOwned", err)
	}
	status, _ := store.PlayerStatus(context.Background(), player.ID)
	if status != domain.PlayerStatusCombat {
		t.Fatalf("status after rolled-back settlement = %q, want in_combat", status)
	}
}

func TestSettleBattleSessionUnequipsDeadUnit(t *testing.T) {
	store := newStoreTest(t)
	player := createPlayer(t, store, "fallen-unit-player", 1)
	dungeon := createDungeon(t, store)
	units, _ := store.ListPlayerUnits(context.Background(), player.ID)
	if _, err := startBattleSession(store, context.Background(), player.ID, dungeon.ID); err != nil {
		t.Fatal(err)
	}
	stats := units[0].CurrentStats
	stats.Health = 0
	if err := settleActiveBattleSession(store, context.Background(), domain.BattleResult{
		PlayerID:  player.ID,
		DungeonID: dungeon.ID,
		Units: []domain.UnitSettlement{{
			UnitID:       units[0].ID,
			CurrentStats: stats,
			IsAlive:      false,
		}},
	}); err != nil {
		t.Fatal(err)
	}
	loaded, _ := store.ListPlayerUnits(context.Background(), player.ID)
	if loaded[0].IsAlive || loaded[0].IsEquipped {
		t.Fatalf("fallen unit alive/equipped = %t/%t, want false/false", loaded[0].IsAlive, loaded[0].IsEquipped)
	}
}

func TestLostBattleDoesNotAwardMoneyOrProgress(t *testing.T) {
	store := newStoreTest(t)
	player := createPlayer(t, store, "lost-battle-player", 1)
	dungeon := createDungeon(t, store)
	units, _ := store.ListPlayerUnits(context.Background(), player.ID)
	if _, err := startBattleSession(store, context.Background(), player.ID, dungeon.ID); err != nil {
		t.Fatal(err)
	}
	if err := settleActiveBattleSession(store, context.Background(), domain.BattleResult{
		PlayerID:   player.ID,
		DungeonID:  dungeon.ID,
		Won:        false,
		MoneyAward: 999,
		Units: []domain.UnitSettlement{{
			UnitID:       units[0].ID,
			CurrentStats: units[0].CurrentStats,
			IsAlive:      true,
		}},
	}); err != nil {
		t.Fatal(err)
	}
	loaded, _ := store.PlayerByID(context.Background(), player.ID)
	if loaded.Money != 100 {
		t.Fatalf("money after loss = %d, want 100", loaded.Money)
	}
	progress, err := store.ListSolvedDungeons(context.Background(), player.ID)
	if err != nil || len(progress) != 0 {
		t.Fatalf("progress after loss = %#v, %v", progress, err)
	}
}

func TestSettleBattleSessionRejectsDuplicateUnits(t *testing.T) {
	store := newStoreTest(t)
	player := createPlayer(t, store, "settle-input-player", 1)
	dungeon := createDungeon(t, store)
	units, _ := store.ListPlayerUnits(context.Background(), player.ID)
	if _, err := startBattleSession(store, context.Background(), player.ID, dungeon.ID); err != nil {
		t.Fatal(err)
	}
	settlement := domain.UnitSettlement{
		UnitID:       units[0].ID,
		CurrentStats: units[0].CurrentStats,
		IsAlive:      true,
	}
	if err := settleActiveBattleSession(store, context.Background(), domain.BattleResult{
		PlayerID:  player.ID,
		DungeonID: dungeon.ID,
		Units:     []domain.UnitSettlement{settlement, settlement},
	}); !errors.Is(err, domain.ErrInvalidInput) {
		t.Fatalf("duplicate-unit settlement error = %v, want ErrInvalidInput", err)
	}
}

func TestLoadoutRejectsDuplicatesOwnershipAndDeadUnits(t *testing.T) {
	store := newStoreTest(t)
	player := createPlayer(t, store, "loadout-validation-player", 2)
	other := createPlayer(t, store, "loadout-other-player", 1)
	units, _ := store.ListPlayerUnits(context.Background(), player.ID)
	otherUnits, _ := store.ListPlayerUnits(context.Background(), other.ID)

	if err := store.SetBattleLoadout(context.Background(), player.ID, []string{units[0].ID, units[0].ID}); !errors.Is(err, domain.ErrInvalidUnitSelection) {
		t.Errorf("duplicate SetBattleLoadout() error = %v, want ErrInvalidUnitSelection", err)
	}
	if err := store.SetBattleLoadout(context.Background(), player.ID, []string{otherUnits[0].ID}); !errors.Is(err, domain.ErrAssetNotOwned) {
		t.Errorf("foreign SetBattleLoadout() error = %v, want ErrAssetNotOwned", err)
	}
	if _, err := testPool.Exec(context.Background(), `UPDATE units SET is_alive = false, is_equipped = false WHERE id = $1`, units[0].ID); err != nil {
		t.Fatal(err)
	}
	if err := store.SetUnitEquipped(context.Background(), player.ID, units[0].ID, true); !errors.Is(err, domain.ErrUnitUnavailable) {
		t.Errorf("dead SetUnitEquipped() error = %v, want ErrUnitUnavailable", err)
	}
}

func TestLoadoutRejectsOversizedAndMissingPlayer(t *testing.T) {
	store := newStoreTest(t)
	player := createPlayer(t, store, "oversized-set-loadout", 4)
	units, _ := store.ListPlayerUnits(context.Background(), player.ID)
	unitIDs := []string{units[0].ID, units[1].ID, units[2].ID, units[3].ID}
	if err := store.SetBattleLoadout(context.Background(), player.ID, unitIDs); !errors.Is(err, domain.ErrInvalidUnitSelection) {
		t.Errorf("oversized SetBattleLoadout() error = %v, want ErrInvalidUnitSelection", err)
	}
	missingID := "00000000-0000-0000-0000-000000000001"
	if err := store.SetUnitEquipped(context.Background(), missingID, units[0].ID, true); !errors.Is(err, domain.ErrPlayerNotFound) {
		t.Errorf("missing-player SetUnitEquipped() error = %v, want ErrPlayerNotFound", err)
	}
}

func TestEquipTreasureReplacesPreviousTreasure(t *testing.T) {
	store := newStoreTest(t)
	player := createPlayer(t, store, "replacement-treasure-player", 1)
	units, _ := store.ListPlayerUnits(context.Background(), player.ID)
	first := createTreasure(t, player.ID, 1)
	second := createTreasure(t, player.ID, 4)
	if err := store.EquipTreasure(context.Background(), player.ID, first.ID, units[0].ID); err != nil {
		t.Fatal(err)
	}
	if err := store.EquipTreasure(context.Background(), player.ID, second.ID, units[0].ID); err != nil {
		t.Fatal(err)
	}
	var firstEquippedBy *string
	if err := testPool.QueryRow(context.Background(), `SELECT equipped_by_unit_id FROM treasures WHERE id = $1`, first.ID).Scan(&firstEquippedBy); err != nil {
		t.Fatal(err)
	}
	if firstEquippedBy != nil {
		t.Fatalf("previous treasure still equipped by %q", *firstEquippedBy)
	}
	loaded, _ := store.ListPlayerUnits(context.Background(), player.ID)
	if loaded[0].EquippedTreasureID == nil || *loaded[0].EquippedTreasureID != second.ID || loaded[0].CurrentStats.Attack != defaultStats.Attack+4 {
		t.Fatalf("unit after replacement = %#v", loaded[0])
	}
}

func TestEquipTreasureRejectsOwnershipAndConflicts(t *testing.T) {
	store := newStoreTest(t)
	player := createPlayer(t, store, "equip-validation-player", 2)
	other := createPlayer(t, store, "equip-validation-other", 1)
	units, _ := store.ListPlayerUnits(context.Background(), player.ID)
	otherTreasure := createTreasure(t, other.ID, 2)
	if err := store.EquipTreasure(context.Background(), player.ID, otherTreasure.ID, units[0].ID); !errors.Is(err, domain.ErrAssetNotOwned) {
		t.Errorf("foreign treasure error = %v, want ErrAssetNotOwned", err)
	}

	treasure := createTreasure(t, player.ID, 2)
	if err := store.EquipTreasure(context.Background(), player.ID, treasure.ID, units[0].ID); err != nil {
		t.Fatal(err)
	}
	if err := store.EquipTreasure(context.Background(), player.ID, treasure.ID, units[1].ID); !errors.Is(err, domain.ErrAlreadyEquipped) {
		t.Errorf("multiply equipped treasure error = %v, want ErrAlreadyEquipped", err)
	}
}

func TestEquipTreasureReturnsPreciseMissingErrors(t *testing.T) {
	store := newStoreTest(t)
	player := createPlayer(t, store, "missing-equipment-player", 1)
	units, _ := store.ListPlayerUnits(context.Background(), player.ID)
	treasure := createTreasure(t, player.ID, 1)
	missingID := "00000000-0000-0000-0000-000000000001"

	if err := store.EquipTreasure(context.Background(), player.ID, treasure.ID, missingID); !errors.Is(err, domain.ErrUnitNotFound) {
		t.Errorf("missing unit error = %v, want ErrUnitNotFound", err)
	}
	if err := store.EquipTreasure(context.Background(), player.ID, missingID, units[0].ID); !errors.Is(err, domain.ErrTreasureNotFound) {
		t.Errorf("missing treasure error = %v, want ErrTreasureNotFound", err)
	}
}

func TestTradeValidationAndFailurePaths(t *testing.T) {
	store := newStoreTest(t)
	sender := createPlayer(t, store, "trade-validation-sender", 1)
	recipient := createPlayer(t, store, "trade-validation-recipient", 0)
	third := createPlayer(t, store, "trade-validation-third", 0)
	units, _ := store.ListPlayerUnits(context.Background(), sender.ID)

	if _, err := store.CreateTrade(context.Background(), domain.NewTrade{FromPlayerID: sender.ID, ToPlayerID: recipient.ID}); !errors.Is(err, domain.ErrInvalidTradeAsset) {
		t.Errorf("assetless CreateTrade() error = %v, want ErrInvalidTradeAsset", err)
	}
	trade, err := store.CreateTrade(context.Background(), domain.NewTrade{
		FromPlayerID: sender.ID,
		ToPlayerID:   recipient.ID,
		UnitID:       stringPointer(units[0].ID),
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := store.AcceptTrade(context.Background(), trade.ID, third.ID); !errors.Is(err, domain.ErrTradeRecipient) {
		t.Errorf("wrong-recipient AcceptTrade() error = %v, want ErrTradeRecipient", err)
	}
	if _, err := store.RejectTrade(context.Background(), trade.ID, third.ID); !errors.Is(err, domain.ErrTradeRecipient) {
		t.Errorf("wrong-recipient RejectTrade() error = %v, want ErrTradeRecipient", err)
	}
	if _, err := store.RejectTrade(context.Background(), trade.ID, recipient.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := store.AcceptTrade(context.Background(), trade.ID, recipient.ID); !errors.Is(err, domain.ErrTradeNotPending) {
		t.Errorf("accepted rejected trade error = %v, want ErrTradeNotPending", err)
	}
	missingID := "00000000-0000-0000-0000-000000000001"
	if _, err := store.AcceptTrade(context.Background(), missingID, recipient.ID); !errors.Is(err, domain.ErrTradeNotFound) {
		t.Errorf("missing AcceptTrade() error = %v, want ErrTradeNotFound", err)
	}
	if _, err := store.RejectTrade(context.Background(), missingID, recipient.ID); !errors.Is(err, domain.ErrTradeNotFound) {
		t.Errorf("missing RejectTrade() error = %v, want ErrTradeNotFound", err)
	}
}

func TestCreateTradeValidatesPlayersAndAssetOwnership(t *testing.T) {
	store := newStoreTest(t)
	sender := createPlayer(t, store, "ownership-trade-sender", 1)
	recipient := createPlayer(t, store, "ownership-trade-recipient", 1)
	recipientUnits, _ := store.ListPlayerUnits(context.Background(), recipient.ID)
	missingID := "00000000-0000-0000-0000-000000000001"

	if _, err := store.CreateTrade(context.Background(), domain.NewTrade{
		FromPlayerID: sender.ID,
		ToPlayerID:   missingID,
		UnitID:       stringPointer(recipientUnits[0].ID),
	}); !errors.Is(err, domain.ErrPlayerNotFound) {
		t.Errorf("missing-player CreateTrade() error = %v, want ErrPlayerNotFound", err)
	}
	if _, err := store.CreateTrade(context.Background(), domain.NewTrade{
		FromPlayerID: sender.ID,
		ToPlayerID:   recipient.ID,
		UnitID:       stringPointer(recipientUnits[0].ID),
	}); !errors.Is(err, domain.ErrAssetNotOwned) {
		t.Errorf("foreign-unit CreateTrade() error = %v, want ErrAssetNotOwned", err)
	}
	if _, err := store.CreateTrade(context.Background(), domain.NewTrade{
		FromPlayerID: sender.ID,
		ToPlayerID:   recipient.ID,
		UnitID:       stringPointer(missingID),
	}); !errors.Is(err, domain.ErrUnitNotFound) {
		t.Errorf("missing-unit CreateTrade() error = %v, want ErrUnitNotFound", err)
	}
}

func TestTreasureTradeLifecycle(t *testing.T) {
	store := newStoreTest(t)
	sender := createPlayer(t, store, "treasure-trade-sender", 0)
	recipient := createPlayer(t, store, "treasure-trade-recipient", 0)
	treasure := createTreasure(t, sender.ID, 5)
	trade, err := store.CreateTrade(context.Background(), domain.NewTrade{
		FromPlayerID: sender.ID,
		ToPlayerID:   recipient.ID,
		TreasureID:   stringPointer(treasure.ID),
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := store.AcceptTrade(context.Background(), trade.ID, recipient.ID); err != nil {
		t.Fatal(err)
	}
	var ownerID string
	if err := testPool.QueryRow(context.Background(), `SELECT owner_id FROM treasures WHERE id = $1`, treasure.ID).Scan(&ownerID); err != nil {
		t.Fatal(err)
	}
	if ownerID != recipient.ID {
		t.Fatalf("treasure owner = %q, want %q", ownerID, recipient.ID)
	}
}

func TestStaleTradeCannotTransferSameUnitTwice(t *testing.T) {
	store := newStoreTest(t)
	sender := createPlayer(t, store, "stale-trade-sender", 1)
	firstRecipient := createPlayer(t, store, "stale-trade-first", 0)
	secondRecipient := createPlayer(t, store, "stale-trade-second", 0)
	units, _ := store.ListPlayerUnits(context.Background(), sender.ID)
	first, err := store.CreateTrade(context.Background(), domain.NewTrade{
		FromPlayerID: sender.ID, ToPlayerID: firstRecipient.ID, UnitID: stringPointer(units[0].ID),
	})
	if err != nil {
		t.Fatal(err)
	}
	second, err := store.CreateTrade(context.Background(), domain.NewTrade{
		FromPlayerID: sender.ID, ToPlayerID: secondRecipient.ID, UnitID: stringPointer(units[0].ID),
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := store.AcceptTrade(context.Background(), first.ID, firstRecipient.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := store.AcceptTrade(context.Background(), second.ID, secondRecipient.ID); !errors.Is(err, domain.ErrAssetNotOwned) {
		t.Fatalf("stale AcceptTrade() error = %v, want ErrAssetNotOwned", err)
	}
}

func TestEquippedAssetsCannotBeOffered(t *testing.T) {
	store := newStoreTest(t)
	sender := createPlayer(t, store, "equipped-trade-sender", 1)
	recipient := createPlayer(t, store, "equipped-trade-recipient", 0)
	units, _ := store.ListPlayerUnits(context.Background(), sender.ID)
	treasure := createTreasure(t, sender.ID, 2)
	if err := store.EquipTreasure(context.Background(), sender.ID, treasure.ID, units[0].ID); err != nil {
		t.Fatal(err)
	}
	if _, err := store.CreateTrade(context.Background(), domain.NewTrade{
		FromPlayerID: sender.ID, ToPlayerID: recipient.ID, UnitID: stringPointer(units[0].ID),
	}); !errors.Is(err, domain.ErrAlreadyEquipped) {
		t.Errorf("equipped-unit trade error = %v, want ErrAlreadyEquipped", err)
	}
	if _, err := store.CreateTrade(context.Background(), domain.NewTrade{
		FromPlayerID: sender.ID, ToPlayerID: recipient.ID, TreasureID: stringPointer(treasure.ID),
	}); !errors.Is(err, domain.ErrAlreadyEquipped) {
		t.Errorf("equipped-treasure trade error = %v, want ErrAlreadyEquipped", err)
	}
}

func TestListPlayerTradesWithoutStatusFilter(t *testing.T) {
	store := newStoreTest(t)
	sender := createPlayer(t, store, "trade-list-sender", 1)
	recipient := createPlayer(t, store, "trade-list-recipient", 0)
	units, _ := store.ListPlayerUnits(context.Background(), sender.ID)
	if _, err := store.CreateTrade(context.Background(), domain.NewTrade{
		FromPlayerID: sender.ID,
		ToPlayerID:   recipient.ID,
		UnitID:       stringPointer(units[0].ID),
	}); err != nil {
		t.Fatal(err)
	}
	trades, err := store.ListPlayerTrades(context.Background(), sender.ID, nil)
	if err != nil || len(trades) != 1 {
		t.Fatalf("ListPlayerTrades() = %#v, %v", trades, err)
	}
	missingID := "00000000-0000-0000-0000-000000000001"
	if _, err := store.ListPlayerTrades(context.Background(), missingID, nil); !errors.Is(err, domain.ErrPlayerNotFound) {
		t.Fatalf("missing ListPlayerTrades() error = %v, want ErrPlayerNotFound", err)
	}
}
