export const LOADOUTS_STORAGE_KEY = 'futuremode_party_loadouts_v4';
export const ACTIVE_LOADOUT_INDEX_KEY = 'futuremode_active_loadout_index';

export function getActiveLoadoutIndex() {
  try {
    const saved = localStorage.getItem(ACTIVE_LOADOUT_INDEX_KEY);
    if (saved) {
      const idx = parseInt(saved, 10);
      if (idx >= 1 && idx <= 5) return idx;
    }
  } catch (e) {}
  return 1;
}

export function setActiveLoadoutIndex(index) {
  try {
    localStorage.setItem(ACTIVE_LOADOUT_INDEX_KEY, String(index));
  } catch (e) {}
}

export function getStoredLoadouts(allPets = []) {
  try {
    const saved = localStorage.getItem(LOADOUTS_STORAGE_KEY);
    if (saved) return JSON.parse(saved);
  } catch (e) {}

  try {
    const savedV2 = localStorage.getItem('futuremode_party_loadouts_v2');
    if (savedV2) {
      const parsed = JSON.parse(savedV2);
      const normalized = {};
      for (const k of [1, 2, 3, 4, 5]) {
        const arr = parsed[k] || [];
        normalized[k] = [arr[0] || null, arr[1] || null, arr[2] || null];
      }
      return normalized;
    }
  } catch (e) {}

  const pIds = allPets.map((p) => p.id);
  const selectedIds = allPets.filter((p) => p.selected).map((p) => p.id);
  return {
    1: [selectedIds[0] || pIds[0] || null, selectedIds[1] || pIds[1] || null, selectedIds[2] || pIds[2] || null],
    2: [pIds[0] || null, pIds[1] || null, null],
    3: [pIds[0] || null, null, pIds[2] || null],
    4: [pIds[0] || null, pIds[3] || null, null],
    5: [pIds[0] || null, null, null],
  };
}

export function saveStoredLoadouts(loadouts) {
  try {
    localStorage.setItem(LOADOUTS_STORAGE_KEY, JSON.stringify(loadouts));
  } catch (e) {}
}

/**
 * Returns the currently active combat team from the last selected loadout.
 * Each pet is enriched with its resolved equipment item object.
 */
export function getActiveTeam(data) {
  if (!data?.pets) return [];
  const loadouts = getStoredLoadouts(data.pets);
  const activeIdx = getActiveLoadoutIndex();
  const slots = loadouts[activeIdx] || [];

  const team = [];
  for (let i = 0; i < 3; i++) {
    const petId = slots[i];
    if (petId) {
      const pet = data.pets.find((p) => p.id === petId);
      if (pet) {
        let equippedItem = null;
        if (pet.equipped && data.items) {
          equippedItem = data.items.find((item) => item.id === pet.equipped) || null;
        }
        team.push({
          ...pet,
          slotIndex: i,
          equippedItem,
        });
      }
    }
  }
  return team;
}
