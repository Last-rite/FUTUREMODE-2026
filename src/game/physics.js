import {
  W, H, BALL_R, SPEED_SCALE, DAMP, BOUNCE_DAMP, MIN_SPD,
  MAX_SIM_STEPS, DEFAULT_ATK, DEFAULT_DEF
} from './constants.js';

export function dist(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function lerpColor(c1, c2, t) {
  const r1 = parseInt(c1.slice(1, 3), 16);
  const g1 = parseInt(c1.slice(3, 5), 16);
  const b1 = parseInt(c1.slice(5, 7), 16);

  const r2 = parseInt(c2.slice(1, 3), 16);
  const g2 = parseInt(c2.slice(3, 5), 16);
  const b2 = parseInt(c2.slice(5, 7), 16);

  const r = Math.round(lerp(r1, r2, t));
  const g = Math.round(lerp(g1, g2, t));
  const b = Math.round(lerp(b1, b2, t));

  return `rgb(${r}, ${g}, ${b})`;
}

/**
 * Headless simulation ball for AI trajectory evaluation
 */
export class SimBall {
  constructor(label, owner, x, y, hp, atk = DEFAULT_ATK, def = DEFAULT_DEF) {
    this.label = label;
    this.owner = owner; // 1 = player, 2 = AI
    this.x = Number(x);
    this.y = Number(y);
    this.vx = 0;
    this.vy = 0;
    this.hp = Number(hp);
    this.atk = Number(atk);
    this.def = Number(def);
    this.moving = false;
    this.alive = this.hp > 0;
  }

  launch(vx, vy) {
    this.vx = vx;
    this.vy = vy;
    this.moving = true;
  }

  step(allBalls) {
    if (!this.moving || !this.alive) return [];

    this.x += this.vx;
    this.y += this.vy;
    this.vx *= DAMP;
    this.vy *= DAMP;

    // Wall bounce
    if (this.x - BALL_R < 0) {
      this.x = BALL_R;
      this.vx = Math.abs(this.vx) * BOUNCE_DAMP;
    } else if (this.x + BALL_R > W) {
      this.x = W - BALL_R;
      this.vx = -Math.abs(this.vx) * BOUNCE_DAMP;
    }

    if (this.y - BALL_R < 0) {
      this.y = BALL_R;
      this.vy = Math.abs(this.vy) * BOUNCE_DAMP;
    } else if (this.y + BALL_R > H) {
      this.y = H - BALL_R;
      this.vy = -Math.abs(this.vy) * BOUNCE_DAMP;
    }

    const events = [];
    const diameter = BALL_R * 2;

    for (const other of allBalls) {
      if (other === this || !other.alive) continue;

      const d = dist(this.x, this.y, other.x, other.y);
      if (d < diameter) {
        const nx = d > 0 ? (this.x - other.x) / d : 1.0;
        const ny = d > 0 ? (this.y - other.y) / d : 0.0;
        const overlap = diameter - d;

        // Position separation
        this.x += nx * overlap * 0.5;
        this.y += ny * overlap * 0.5;
        other.x -= nx * overlap * 0.5;
        other.y -= ny * overlap * 0.5;

        // Elastic momentum reflection
        const dot = this.vx * nx + this.vy * ny;
        this.vx = (this.vx - 2 * dot * nx) * BOUNCE_DAMP;
        this.vy = (this.vy - 2 * dot * ny) * BOUNCE_DAMP;

        // Damage calculation: Attacker ATK - Defender DEF
        if (other.owner !== this.owner) {
          const dmg = Math.max(1, this.atk - other.def);
          const effectiveDmg = Math.min(dmg, other.hp);
          other.hp = Math.max(0, other.hp - dmg);
          if (other.hp <= 0) {
            other.alive = false;
          }
          events.push({ hit: other, dmg: effectiveDmg });
        }
      }
    }

    if (Math.hypot(this.vx, this.vy) < MIN_SPD) {
      this.moving = false;
      this.vx = 0;
      this.vy = 0;
    }

    return events;
  }
}

/**
 * Headless simulation runner for AI evaluation
 */
export function simulateBoard(snapshot, shooterLabel, power, theta) {
  const simBalls = snapshot.balls.map(
    b => new SimBall(b.label, b.owner, b.x, b.y, b.hp, b.atk, b.def)
  );

  const shooter = simBalls.find(b => b.label === shooterLabel);
  if (!shooter || !shooter.alive) {
    return { score: 0, playerDmg: 0, aiDmg: 0 };
  }

  const vx = Math.cos(theta) * power * SPEED_SCALE;
  const vy = Math.sin(theta) * power * SPEED_SCALE;
  shooter.launch(vx, vy);

  let playerDmg = 0;
  let aiDmg = 0;

  for (let step = 0; step < MAX_SIM_STEPS; step++) {
    if (!shooter.moving) break;

    const events = shooter.step(simBalls);
    for (const ev of events) {
      if (ev.hit.owner === 1) {
        playerDmg += ev.dmg;
      } else {
        aiDmg += ev.dmg;
      }
    }
  }

  // If shooter is AI (owner 2), it wants to maximize playerDmg
  const score = shooter.owner === 2 ? playerDmg * 2 - aiDmg : aiDmg * 2 - playerDmg;
  return { score, playerDmg, aiDmg };
}
