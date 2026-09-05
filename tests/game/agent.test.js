import { describe, it, expect } from 'vitest';
import { Agent2 } from '../../src/game/agent.js';
import { DRAG_MAX } from '../../src/game/constants.js';

describe('AI Agent2 Tactical Decision Engine', () => {
  it('returns default move if shooter is missing or dead', () => {
    const agent = new Agent2();
    const snapshot = {
      balls: [
        { label: '2a', owner: 2, x: 200, y: 200, hp: 0, alive: false },
      ],
    };

    const move = agent.chooseMove(snapshot, '2a');
    expect(move.power).toBe(DRAG_MAX);
    expect(move.theta).toBe(Math.PI / 2);
  });

  it('selects offensive move that damages the player when direct line is clear', () => {
    const agent = new Agent2(30); // Use 30deg bucket for fast test
    const snapshot = {
      balls: [
        { label: '2a', owner: 2, x: 275, y: 140, hp: 100, atk: 20, def: 2, maxHp: 100, spd: 100, alive: true },
        { label: '1a', owner: 1, x: 275, y: 400, hp: 100, atk: 10, def: 2, maxHp: 100, spd: 100, alive: true },
      ],
    };

    const move = agent.chooseMove(snapshot, '2a');
    expect(move.power).toBeGreaterThan(0);
    // Player is straight down from 2a (y: 140 -> 400), so angle should be downwards (~90 degrees = Math.PI / 2)
    const deg = (move.theta * 180) / Math.PI;
    expect(deg).toBeGreaterThan(70);
    expect(deg).toBeLessThan(110);
  });

  it('uses fallback aim towards closest enemy when simulations cannot find clear bank shot', () => {
    const agent = new Agent2(60);
    const snapshot = {
      balls: [
        { label: '2a', owner: 2, x: 100, y: 100, hp: 100, atk: 1, def: 100, maxHp: 100, spd: 10, alive: true }, // very weak / slow
        { label: '1a', owner: 1, x: 200, y: 100, hp: 100, atk: 10, def: 10, maxHp: 100, spd: 100, alive: true },
      ],
    };

    const move = agent.chooseMove(snapshot, '2a');
    expect(move).toBeDefined();
    expect(move.power).toBeGreaterThanOrEqual(70);
    expect(typeof move.theta).toBe('number');
  });
});
