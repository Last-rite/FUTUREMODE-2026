import { describe, it, expect } from 'vitest';
import { Ball } from '../../src/game/Ball.js';
import { BALL_R, W, H } from '../../src/game/constants.js';

describe('Ball Entity & Combat Attributes', () => {
  it('initializes basic combat stats without equipment', () => {
    const ball = new Ball('1a', 1, 200, 500, 15, 4, 120, 95);
    expect(ball.baseAtk).toBe(15);
    expect(ball.baseDef).toBe(4);
    expect(ball.baseMaxHp).toBe(120);
    expect(ball.baseSpd).toBe(95);

    expect(ball.atk).toBe(15);
    expect(ball.def).toBe(4);
    expect(ball.spd).toBe(95);
    expect(ball.maxHp).toBe(120);
    expect(ball.hp).toBe(120);
    expect(ball.alive).toBe(true);
    expect(ball.moving).toBe(false);
  });

  it('calculates equipment bonuses dynamically for stats and maxHp', () => {
    const equipment = {
      name: '傳奇鋒刃',
      atkBonus: 5,
      defBonus: 3,
      spdBonus: 15,
      hpBonus: 20,
    };
    const ball = new Ball('1a', 1, 200, 500, 10, 2, 100, 100, { equipment });

    expect(ball.atk).toBe(15); // 10 + 5
    expect(ball.def).toBe(5);  // 2 + 3
    expect(ball.spd).toBe(115); // 100 + 15
    expect(ball.maxHp).toBe(120); // 100 + 20
    expect(ball.hp).toBe(120);
  });

  it('breakEquipment: disables equipment bonuses and recalculates maxHp and current hp', () => {
    const equipment = {
      name: '回家石',
      atkBonus: 0,
      defBonus: 0,
      hpBonus: 30,
    };
    const ball = new Ball('1a', 1, 200, 500, 10, 2, 100, 100, { equipment });
    expect(ball.maxHp).toBe(130);
    expect(ball.hp).toBe(130);

    // Damage ball slightly down to 115
    ball.hp = 115;

    // Break equipment
    ball.breakEquipment();
    expect(ball.equipment.isBroken).toBe(true);
    // Base max hp was 100, so maxHp reverts to 100
    expect(ball.maxHp).toBe(100);
    // hp was 115, which exceeds new maxHp 100, so it clamps to 100
    expect(ball.hp).toBe(100);
  });

  it('wave dynamics: triggerWave increases amplitude and updateWave dampens it', () => {
    const ball = new Ball('1a', 1, 100, 100);
    expect(ball.waveAmp).toBe(0);

    ball.triggerWave(3.0);
    expect(ball.waveAmp).toBe(3.0);

    // Multiple hits stack up to 8.5 cap
    ball.triggerWave(7.0);
    expect(ball.waveAmp).toBe(8.5);

    // Calling updateWave reduces amplitude
    ball.updateWave();
    expect(ball.waveAmp).toBeLessThan(8.5);
  });

  it('updatePhysics: handles ball bounce and records events', () => {
    const ball1 = new Ball('1a', 1, 200, 200, 20, 2, 100, 100);
    const ball2 = new Ball('2a', 2, 200 + BALL_R, 200, 10, 5, 100, 100);

    ball1.moving = true;
    ball1.vx = 4;
    ball1.vy = 0;

    const events = ball1.updatePhysics([ball1, ball2]);
    const bounceEvent = events.find((e) => e.type === 'bounce');
    const damageEvent = events.find((e) => e.type === 'damage');

    expect(bounceEvent).toBeDefined();
    expect(damageEvent).toBeDefined();
    expect(damageEvent.damage).toBe(15); // 20 - 5
    expect(ball2.hp).toBe(85);
  });
});
