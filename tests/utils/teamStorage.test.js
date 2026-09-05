import { describe, it, expect, beforeEach } from 'vitest';
import {
  getActiveLoadoutIndex,
  setActiveLoadoutIndex,
  getStoredLoadouts,
  saveStoredLoadouts,
  getActiveTeam,
} from '../../src/utils/teamStorage.js';

describe('teamStorage Loadouts & Team Resolution', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('manages active loadout index (defaults to 1 and validates range 1-5)', () => {
    expect(getActiveLoadoutIndex()).toBe(1);

    setActiveLoadoutIndex(3);
    expect(getActiveLoadoutIndex()).toBe(3);

    // If out of range, falls back to 1
    localStorage.setItem('futuremode_active_loadout_index', '99');
    expect(getActiveLoadoutIndex()).toBe(1);
  });

  it('saves and restores loadout presets', () => {
    const mockPets = [{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }];
    const loadouts = getStoredLoadouts(mockPets);

    expect(loadouts[1]).toBeDefined();
    expect(loadouts[1].length).toBe(3);

    loadouts[2] = ['p3', 'p2', 'p1'];
    saveStoredLoadouts(loadouts);

    const reloaded = getStoredLoadouts(mockPets);
    expect(reloaded[2]).toEqual(['p3', 'p2', 'p1']);
  });

  it('getActiveTeam: enriches active team pets with their equipped items', () => {
    const data = {
      pets: [
        { id: 'pet-1', name: 'NOXCAT A', hp: 100, equipped: 'item-blade' },
        { id: 'pet-2', name: 'NOXCAT B', hp: 100, equipped: null },
      ],
      items: [
        { id: 'item-blade', name: '像素光劍', atkBonus: 5 },
      ],
    };

    saveStoredLoadouts({
      1: ['pet-1', 'pet-2', null],
    });
    setActiveLoadoutIndex(1);

    const activeTeam = getActiveTeam(data);
    expect(activeTeam.length).toBe(2);

    expect(activeTeam[0].id).toBe('pet-1');
    expect(activeTeam[0].slotIndex).toBe(0);
    expect(activeTeam[0].equippedItem).toBeDefined();
    expect(activeTeam[0].equippedItem.name).toBe('像素光劍');

    expect(activeTeam[1].id).toBe('pet-2');
    expect(activeTeam[1].equippedItem).toBeNull();
  });

  it('getActiveTeam: returns empty array if data is missing or empty', () => {
    expect(getActiveTeam(null)).toEqual([]);
    expect(getActiveTeam({})).toEqual([]);
  });
});
