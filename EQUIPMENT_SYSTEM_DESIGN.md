# Combat & Equipment Architecture Design

## 1. Overview & System Integration

In FutureMode, pegs (pets) deployed into combat carry their base attributes as well as any equipment assigned to them in the collection setup menu (`CollectionView`).

The system bridges the home inventory and the combat arena (`GameEngine`) using a decoupled, dynamic resolution model.

---

## 2. Dynamic Attribute Resolution Architecture

### Why Dynamic Getters instead of Static Baking?
Rather than baking equipment stat modifiers permanently into a peg's attributes upon entering battle (e.g. `peg.atk += weapon.atkBonus`), attributes (`atk`, `def`, `spd`) are evaluated **dynamically on access** via getters on the `Ball` class:

```javascript
// src/game/Ball.js
get atk() {
  let bonus = 0;
  if (this.equipment && !this.equipment.isBroken) {
    bonus += (Number(this.equipment.atkBonus) || 0);
  }
  return this.baseAtk + bonus;
}

get def() {
  let bonus = 0;
  if (this.equipment && !this.equipment.isBroken) {
    bonus += (Number(this.equipment.defBonus) || 0);
  }
  return this.baseDef + bonus;
}

get spd() {
  let bonus = 0;
  if (this.equipment && !this.equipment.isBroken) {
    bonus += (Number(this.equipment.spdBonus) || 0);
  }
  return this.baseSpd + bonus;
}
```

This guarantees:
1. **Purity of Base Stats**: The underlying peg base statistics (`baseAtk`, `baseDef`, `baseSpd`, `baseMaxHp`) remain immutable and untouched.
2. **Instant State Transition**: Any change in equipment status (such as equipment breaking or de-buffing) takes effect immediately across all collision, damage, and momentum calculations without complex state resets or side-effects.

---

## 3. Max HP Handling Exception

Unlike `atk`, `def`, and `spd` which are stateless scalars used in formulas during collisions, `hp` is an active, depleting resource pool.

- **At Combat Start**:
  Equipment providing Max HP bonuses (`equipment.hpBonus`) is resolved once at the initialization of the battle:
  $$\text{maxHp} = \text{baseMaxHp} + \text{equipment.hpBonus}$$
  $$\text{hp} = \text{maxHp}$$

- **When Equipment Breaks**:
  If a piece of equipment providing Max HP breaks during combat, the peg calls `recalculateMaxHp()`:
  ```javascript
  recalculateMaxHp() {
    const hpBonus = (this.equipment && !this.equipment.isBroken) ? (Number(this.equipment.hpBonus) || 0) : 0;
    this.maxHp = this.baseMaxHp + hpBonus;
    if (this.hp > this.maxHp) {
      this.hp = this.maxHp;
    }
  }
  ```
  This cleanly shrinks the peg's maximum health ceiling and clamps current health to prevent floating or overflow HP.

---

## 4. Planned In-Combat Equipment Breaking & Durability

### Design Specification:
- Each weapon/gear has a `durability` / `condition` metric.
- Specific combat triggers (such as high-speed collisions, sustaining damage exceeding a threshold, or executing critical hits) degrade equipment condition.
- When durability reaches 0, the equipment triggers `breakEquipment()`:
  1. Sets `this.equipment.isBroken = true`.
  2. Emits an in-game auditory/visual shatter effect.
  3. `atk`, `def`, and `spd` immediately lose the item's bonuses on subsequent ticks.
  4. `maxHp` is recalculated and current `hp` clamped via `recalculateMaxHp()`.

### Current Implementation Status (Hackathon Scope):
> [!NOTE]
> Due to hackathon delivery time constraints, the active runtime degradation / breaking trigger during combat is temporarily skipped. 
> However, the entire data model, `isBroken` state flags, dynamic getters, and `recalculateMaxHp()` lifecycle hooks have been fully implemented in `Ball.js` and `Engine.js`, ensuring seamless turn-key enablement once durability mechanics are activated.

---

## 5. Enemy Equipment Architecture

The `Ball` entity represents both Player pegs (`owner === 1`) and Enemy pieces (`owner === 2`):
- Both sides share the identical dynamic equipment getter pipeline.
- Enemies are fully capable of equipping weapons and defensive gear.
- **Default Behavior**: In accordance with the current game balance, enemy units default to `equipment: null` (no natural equipment spawns).
- **Future Extensibility**: Elite enemy units, chapter bosses, or high-difficulty dungeons can pass custom equipment payloads into `GameEngine` without any engine modifications.

---

## 6. Identifier Convention (`idString`)

To ensure clean interoperability across the database fixtures, UI menus, and combat physics engine, all entities carry standardized string identifiers:
- **Peg Types**:
  - `peg_noxcat_core` (Core NOXCAT)
  - `peg_noxcat_tech` (Future NOXCAT)
  - `peg_noxcat_rush` (Cool NOXCAT)
  - `peg_noxcat_tank` (Hard NOXCAT)
  - `enemy_drone_a`, `enemy_drone_b`, `enemy_drone_c` (Enemy Drones)
- **Equipment Types**:
  - `wpn_pixel_blade` (Pixel Sword, ATK +3)
  - `gear_data_shield` (Data Shield, DEF +3)
  - `item_return_stone` (Home Stone, HP +20, DEF +1)
