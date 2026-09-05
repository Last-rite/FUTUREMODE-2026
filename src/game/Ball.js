import {
  BALL_R, INNER_R, DEFAULT_HP, DEFAULT_ATK, DEFAULT_DEF, DEFAULT_SPD,
  DAMP, BOUNCE_DAMP, MIN_SPD, W, H, COLORS
} from './constants.js';
import { dist, lerpColor } from './physics.js';

export class Ball {
  constructor(label, owner, x, y, atk = DEFAULT_ATK, def = DEFAULT_DEF, maxHp = DEFAULT_HP, spd = DEFAULT_SPD) {
    this.label = label;
    this.owner = owner; // 1 = player, 2 = AI
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    
    // 5 Combat Attributes (hidden from direct board display): hp/maxHp, atk, def, spd
    this.maxHp = Number(maxHp) || DEFAULT_HP;
    this.hp = this.maxHp;
    this.atk = Number(atk) || DEFAULT_ATK;
    this.def = Number(def) || DEFAULT_DEF;
    this.spd = Number(spd) || DEFAULT_SPD;

    this.moving = false;
    this.alive = true;
    this.trail = [];

    // Liquid ring wave dynamics (stasis when 0, waves upon impact, stacks if hit while shaking)
    this.waveAmp = 0;
    this.wavePhase = 0;
  }

  get color() {
    return this.owner === 1 ? COLORS.P_COL : COLORS.A_COL;
  }

  get darkColor() {
    return this.owner === 1 ? COLORS.P_COL_DARK : COLORS.A_COL_DARK;
  }

  get glowColor() {
    return this.owner === 1 ? COLORS.P_COL_GLOW : COLORS.A_COL_GLOW;
  }

  triggerWave(amount) {
    // Getting hit while shaking stacks the wave amplitude
    this.waveAmp = Math.min(8.5, this.waveAmp + amount);
  }

  updateWave() {
    // Wave amplitude decreases smoothly with time until stasis
    if (this.waveAmp > 0) {
      this.wavePhase += 0.22;
      this.waveAmp *= 0.972;
      if (this.waveAmp < 0.04) {
        this.waveAmp = 0; // Complete stasis
      }
    }
  }

  launch(vx, vy) {
    this.vx = vx * this.spd;
    this.vy = vy * this.spd;
    this.moving = true;
    this.trail = [];
    this.triggerWave(3.5); // Initial jolt on launch
  }

  updatePhysics(allBalls) {
    if (!this.moving || !this.alive) {
      return [];
    }

    // Record trail
    this.trail.push({ x: this.x, y: this.y });
    if (this.trail.length > 20) {
      this.trail.shift();
    }

    this.x += this.vx;
    this.y += this.vy;
    this.vx *= DAMP;
    this.vy *= DAMP;

    const events = [];

    // Wall bounces
    if (this.x - BALL_R < 0) {
      this.x = BALL_R;
      this.vx = Math.abs(this.vx) * BOUNCE_DAMP;
      this.triggerWave(2.5);
      events.push({ type: 'wall', speed: Math.abs(this.vx), x: this.x, y: this.y });
    } else if (this.x + BALL_R > W) {
      this.x = W - BALL_R;
      this.vx = -Math.abs(this.vx) * BOUNCE_DAMP;
      this.triggerWave(2.5);
      events.push({ type: 'wall', speed: Math.abs(this.vx), x: this.x, y: this.y });
    }

    if (this.y - BALL_R < 0) {
      this.y = BALL_R;
      this.vy = Math.abs(this.vy) * BOUNCE_DAMP;
      this.triggerWave(2.5);
      events.push({ type: 'wall', speed: Math.abs(this.vy), x: this.x, y: this.y });
    } else if (this.y + BALL_R > H) {
      this.y = H - BALL_R;
      this.vy = -Math.abs(this.vy) * BOUNCE_DAMP;
      this.triggerWave(2.5);
      events.push({ type: 'wall', speed: Math.abs(this.vy), x: this.x, y: this.y });
    }

    // Ball-to-ball collisions
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

        // Prevent clipping out of bounds
        this.x = Math.max(BALL_R, Math.min(W - BALL_R, this.x));
        this.y = Math.max(BALL_R, Math.min(H - BALL_R, this.y));
        other.x = Math.max(BALL_R, Math.min(W - BALL_R, other.x));
        other.y = Math.max(BALL_R, Math.min(H - BALL_R, other.y));

        // Elastic momentum reflection
        const dot = this.vx * nx + this.vy * ny;
        this.vx = (this.vx - 2 * dot * nx) * BOUNCE_DAMP;
        this.vy = (this.vy - 2 * dot * ny) * BOUNCE_DAMP;

        const impactSpd = Math.hypot(this.vx, this.vy);
        const contactX = (this.x + other.x) * 0.5;
        const contactY = (this.y + other.y) * 0.5;

        // Wave jolts on both colliding balls
        const impactWave = Math.min(4.5, impactSpd * 0.35 + 1.5);
        this.triggerWave(impactWave);
        other.triggerWave(impactWave);

        events.push({
          type: 'bounce',
          speed: impactSpd,
          x: contactX,
          y: contactY,
        });

        // Damage calculation: Attacker ATK - Defender DEF
        if (other.owner !== this.owner) {
          const rawDmg = Math.max(1, this.atk - other.def);
          const effectiveDmg = Math.min(rawDmg, other.hp);
          other.hp = Math.max(0, other.hp - rawDmg);

          // Heavy wave jolt on damaged ball (stacks if already shaking!)
          other.triggerWave(4.0 + rawDmg * 0.4);

          events.push({
            type: 'damage',
            attacker: this,
            defender: other,
            damage: rawDmg,
            effectiveDmg,
            x: contactX,
            y: contactY,
          });

          if (other.hp <= 0) {
            other.alive = false;
            events.push({ type: 'defeat', ball: other, x: other.x, y: other.y });
          }
        }
      }
    }

    if (Math.hypot(this.vx, this.vy) < MIN_SPD) {
      this.moving = false;
      this.vx = 0;
      this.vy = 0;
      this.trail = [];
    }

    return events;
  }

  draw(ctx, isActive = false) {
    if (!this.alive) return;

    // Draw motion trail only while actively moving
    if (this.moving && this.trail.length > 0) {
      const n = this.trail.length;
      for (let i = 0; i < n; i++) {
        const pt = this.trail[i];
        const progress = i / n;
        const alpha = 0.28 * progress;
        const r = Math.max(3, BALL_R * 0.65 * progress);

        ctx.save();
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, r, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.globalAlpha = alpha;
        ctx.fill();
        ctx.restore();
      }
    } else if (this.trail.length > 0) {
      this.trail = [];
    }

    // Active peg neon aura
    if (isActive) {
      ctx.save();
      const pulse = 1.0 + Math.sin(Date.now() * 0.009) * 0.14;
      const glowR = BALL_R * 1.85 * pulse;
      const glowGrad = ctx.createRadialGradient(
        this.x, this.y, BALL_R * 0.7,
        this.x, this.y, glowR
      );
      glowGrad.addColorStop(0, this.glowColor);
      glowGrad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = glowGrad;
      ctx.beginPath();
      ctx.arc(this.x, this.y, glowR, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // ── Outer Ring Liquid Health Gauge (User Sketch: inner core 34px, ring 8px) ──
    const R = BALL_R;      // 42px outer collision radius
    const innerR = INNER_R; // 34px inner core (exact size of original ball)
    const hpRatio = Math.max(0, Math.min(1, this.hp / this.maxHp));

    ctx.save();

    // 1. Dark empty glass ring track
    ctx.beginPath();
    ctx.arc(this.x, this.y, R, 0, Math.PI * 2, false);
    ctx.arc(this.x, this.y, innerR, 0, Math.PI * 2, true);
    ctx.closePath();
    ctx.fillStyle = '#060a0f';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // 2. Fill the outer ring with liquid (with dynamic wave upon hit decaying to stasis)
    if (hpRatio > 0) {
      const surfaceY = (this.y + R) - (R * 2) * hpRatio;
      const waveAmp = this.waveAmp;

      ctx.save();
      // Clip strictly to the ring (donut shape)
      ctx.beginPath();
      ctx.arc(this.x, this.y, R - 0.5, 0, Math.PI * 2, false);
      ctx.arc(this.x, this.y, innerR + 0.5, 0, Math.PI * 2, true);
      ctx.closePath();
      ctx.clip();

      // Liquid gradient
      const liqGrad = ctx.createLinearGradient(0, surfaceY, 0, this.y + R);
      liqGrad.addColorStop(0, this.color);
      liqGrad.addColorStop(1, this.darkColor);

      // Wavy surface polygon
      ctx.beginPath();
      ctx.moveTo(this.x - R - 4, this.y + R + 4);
      ctx.lineTo(this.x - R - 4, surfaceY);

      const step = 2.5;
      for (let qx = this.x - R - 4; qx <= this.x + R + 4; qx += step) {
        const rx = qx - this.x;
        const qy = surfaceY + (waveAmp > 0.04 ? Math.sin(rx * 0.25 + this.wavePhase) * waveAmp : 0);
        ctx.lineTo(qx, qy);
      }
      ctx.lineTo(this.x + R + 4, this.y + R + 4);
      ctx.closePath();

      ctx.fillStyle = liqGrad;
      ctx.fill();

      // Bright white meniscus line across the liquid surface
      if (hpRatio < 0.99) {
        ctx.strokeStyle = COLORS.WHITE;
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let qx = this.x - R; qx <= this.x + R; qx += step) {
          const rx = qx - this.x;
          const qy = surfaceY + (waveAmp > 0.04 ? Math.sin(rx * 0.25 + this.wavePhase) * waveAmp : 0);
          if (qx === this.x - R) ctx.moveTo(qx, qy);
          else ctx.lineTo(qx, qy);
        }
        ctx.stroke();
      }

      ctx.restore();
    }

    // 3. Ring Outer & Inner Borders
    ctx.beginPath();
    ctx.arc(this.x, this.y, R, 0, Math.PI * 2);
    ctx.strokeStyle = isActive ? COLORS.WHITE : this.color;
    ctx.lineWidth = isActive ? 4.0 : 3.0;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(this.x, this.y, innerR, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // 4. Center Inner Core
    ctx.beginPath();
    ctx.arc(this.x, this.y, innerR - 0.5, 0, Math.PI * 2);
    ctx.fillStyle = '#080d14';
    ctx.fill();

    // Specular shine on top-left of core
    const spec = ctx.createRadialGradient(
      this.x - innerR * 0.3, this.y - innerR * 0.35, 1,
      this.x - innerR * 0.3, this.y - innerR * 0.35, innerR * 0.7
    );
    spec.addColorStop(0, 'rgba(255, 255, 255, 0.35)');
    spec.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = spec;
    ctx.beginPath();
    ctx.arc(this.x, this.y, innerR - 0.5, 0, Math.PI * 2);
    ctx.fill();

    // 5. Centered Label inside Core
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Label ("1b", "2c", etc.) centered inside the dark core
    ctx.font = 'italic 900 16px "Chakra Petch", "Oxanium", Arial, sans-serif';
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 4.5;
    ctx.strokeText(this.label, this.x, this.y - 2);
    ctx.fillStyle = COLORS.WHITE;
    ctx.fillText(this.label, this.x, this.y - 2);

    // 6. HP Text positioned exactly on the lower part of the HP ring
    // Minimalist solid color: pure white when healthy, solid crimson when in critical danger
    const hpColor = (hpRatio <= 0.25) ? '#ff2a55' : '#ffffff';

    const hpRingY = this.y + 36.5; // Optical center on lower ring band (between 34px and 44px)
    ctx.save();
    ctx.translate(this.x, hpRingY);
    ctx.font = 'italic 900 23px "Chakra Petch", "Oxanium", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 4.5;

    // Optical centering to compensate for digit shape asymmetry and canvas baseline droop
    const metrics = ctx.measureText(`${this.hp}`);
    const ox = (metrics.actualBoundingBoxLeft !== undefined && metrics.actualBoundingBoxRight !== undefined)
      ? (metrics.actualBoundingBoxLeft - metrics.actualBoundingBoxRight) * 0.5
      : 0;
    const oy = -1.5;

    ctx.strokeText(`${this.hp}`, ox, oy);
    ctx.fillStyle = hpColor;
    ctx.fillText(`${this.hp}`, ox, oy);
    ctx.restore();

    ctx.restore();
  }
}
