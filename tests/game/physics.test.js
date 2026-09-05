import { describe, it, expect } from 'vitest';
import { dist, lerp, lerpColor, hexToRgba, SimBall, simulateBoard } from '../../src/game/physics.js';
import { BALL_R, W, H, BOUNCE_DAMP, DAMP, SPEED_SCALE } from '../../src/game/constants.js';

describe('Physics Math Utilities', () => {
  it('dist: calculates Euclidean distance correctly', () => {
    expect(dist(0, 0, 3, 4)).toBe(5);
    expect(dist(10, 20, 10, 20)).toBe(0);
    expect(dist(-1, -1, 2, 3)).toBe(5);
  });

  it('lerp: interpolates between numbers correctly', () => {
    expect(lerp(0, 100, 0.5)).toBe(50);
    expect(lerp(10, 20, 0)).toBe(10);
    expect(lerp(10, 20, 1)).toBe(20);
    expect(lerp(50, 100, 0.25)).toBe(62.5);
  });

  it('lerpColor: correctly interpolates between hex colors', () => {
    const mid = lerpColor('#000000', '#ffffff', 0.5);
    expect(mid).toBe('rgb(128, 128, 128)');

    // 3-digit hex format
    const mid3 = lerpColor('#000', '#fff', 0.5);
    expect(mid3).toBe('rgb(128, 128, 128)');

    // Fallbacks for invalid inputs
    const fallback = lerpColor(null, null, 0);
    expect(fallback).toContain('rgb(');
  });

  it('hexToRgba: converts hex to rgba with alpha', () => {
    expect(hexToRgba('#ff0000', 0.5)).toBe('rgba(255, 0, 0, 0.5)');
    expect(hexToRgba('#00ff00', 1)).toBe('rgba(0, 255, 0, 1)');
    expect(hexToRgba('#fff', 0.8)).toBe('rgba(255, 255, 255, 0.8)');

    // Invalid hex fallback
    expect(hexToRgba('invalid', 0.5)).toBe('rgba(0, 255, 102, 0.5)');
  });
});

describe('SimBall headless simulation entity', () => {
  it('initializes with default values and custom parameters', () => {
    const ball = new SimBall('1a', 1, 100, 200, 80, 15, 5, 100, 120);
    expect(ball.label).toBe('1a');
    expect(ball.owner).toBe(1);
    expect(ball.x).toBe(100);
    expect(ball.y).toBe(200);
    expect(ball.hp).toBe(80);
    expect(ball.atk).toBe(15);
    expect(ball.def).toBe(5);
    expect(ball.maxHp).toBe(100);
    expect(ball.spd).toBe(120);
    expect(ball.alive).toBe(true);
    expect(ball.moving).toBe(false);
  });

  it('launch: calculates speed multiplier and sets moving flag', () => {
    const ball = new SimBall('1a', 1, 100, 100, 100, 10, 2, 100, 100);
    ball.launch(10, 20);
    // spd is 100, so spdMultiplier = 100/100 = 1
    expect(ball.vx).toBe(10);
    expect(ball.vy).toBe(20);
    expect(ball.moving).toBe(true);
  });

  it('step: bounces off left wall and dampens velocity', () => {
    // Place ball near left wall moving left
    const ball = new SimBall('1a', 1, BALL_R - 5, 300);
    ball.moving = true;
    ball.vx = -10;
    ball.vy = 0;

    const events = ball.step([ball]);
    expect(ball.x).toBe(BALL_R);
    expect(ball.vx).toBeGreaterThan(0); // Bounced to the right
    expect(ball.vx).toBeCloseTo(10 * DAMP * BOUNCE_DAMP, 2);
  });

  it('step: bounces off right wall and dampens velocity', () => {
    const ball = new SimBall('1a', 1, W - BALL_R + 5, 300);
    ball.moving = true;
    ball.vx = 10;
    ball.vy = 0;

    ball.step([ball]);
    expect(ball.x).toBe(W - BALL_R);
    expect(ball.vx).toBeLessThan(0); // Bounced to the left
  });

  it('step: handles ball-to-ball collision and inflicts damage between enemies', () => {
    const playerBall = new SimBall('1a', 1, 100, 100, 100, 20, 5); // ATK 20
    const enemyBall = new SimBall('2a', 2, 100 + BALL_R * 1.5, 100, 100, 10, 5); // DEF 5

    playerBall.moving = true;
    playerBall.vx = 5;
    playerBall.vy = 0;

    const events = playerBall.step([playerBall, enemyBall]);
    expect(events.length).toBe(1);
    expect(events[0].hit).toBe(enemyBall);
    // Damage = Math.max(1, 20 - 5) = 15
    expect(events[0].dmg).toBe(15);
    expect(enemyBall.hp).toBe(85);
  });

  it('step: does NOT inflict damage on teammates (friendly fire is safe)', () => {
    const player1 = new SimBall('1a', 1, 100, 100, 100, 20, 2);
    const player2 = new SimBall('1b', 1, 100 + BALL_R * 1.5, 100, 100, 10, 2);

    player1.moving = true;
    player1.vx = 5;
    player1.vy = 0;

    const events = player1.step([player1, player2]);
    expect(events.length).toBe(0);
    expect(player2.hp).toBe(100);
  });

  it('step: kills ball when HP reaches 0', () => {
    const attacker = new SimBall('1a', 1, 100, 100, 100, 50, 0);
    const target = new SimBall('2a', 2, 100 + BALL_R * 1.5, 100, 10, 10, 0);

    attacker.moving = true;
    attacker.vx = 5;

    attacker.step([attacker, target]);
    expect(target.hp).toBe(0);
    expect(target.alive).toBe(false);
  });
});

describe('simulateBoard AI trajectory simulation', () => {
  it('returns zero score if shooter not found or dead', () => {
    const snapshot = { balls: [{ label: '1a', owner: 1, x: 100, y: 100, hp: 0, alive: false }] };
    const res = simulateBoard(snapshot, '1a', 100, 0);
    expect(res.score).toBe(0);
  });

  it('simulates trajectory and calculates score when AI hits player', () => {
    const snapshot = {
      balls: [
        { label: '2a', owner: 2, x: 200, y: 200, hp: 100, atk: 25, def: 5, maxHp: 100, spd: 100, alive: true },
        { label: '1a', owner: 1, x: 200, y: 300, hp: 100, atk: 10, def: 5, maxHp: 100, spd: 100, alive: true },
      ],
    };

    // AI launches directly downwards (theta = Math.PI / 2) towards player
    const res = simulateBoard(snapshot, '2a', 120, Math.PI / 2);
    expect(res.playerDmg).toBeGreaterThan(0);
    expect(res.score).toBeGreaterThan(0);
  });
});
