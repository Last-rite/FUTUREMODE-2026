import {
  BALL_R, INNER_R, DEFAULT_HP, DEFAULT_ATK, DEFAULT_DEF, DEFAULT_SPD,
  DAMP, BOUNCE_DAMP, MIN_SPD, W, H, COLORS,
  FUTURE_TEAMMATE_HEAL, COOL_KNOCKBACK_MULTIPLIER,
  COOL_MIN_KNOCKBACK_SPEED, HARD_EXTRA_SLOW_MULTIPLIER
} from './constants.js';
import { dist, lerpColor, hexToRgba } from './physics.js';
import { getBallImage } from './sprites.js';

function getSkillType({ code, name, idString }) {
  if (code === '02' || name?.includes('FUTURE') || idString?.includes('tech')) return 'future';
  if (code === '03' || name?.includes('COOL') || idString?.includes('rush')) return 'cool';
  if (code === '04' || name?.includes('HARD') || idString?.includes('tank')) return 'hard';
  return 'none';
}

export class Ball {
  constructor(label, owner, x, y, atk = DEFAULT_ATK, def = DEFAULT_DEF, maxHp = DEFAULT_HP, spd = DEFAULT_SPD, options = {}) {
    this.label = label;
    this.owner = owner; // 1 = player, 2 = AI
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    
    // Identification & Equipment
    this.petId = options.petId || null;
    this.idString = options.idString || (owner === 1 ? 'peg_player' : 'peg_enemy');
    this.name = options.name || label;
    this.code = options.code || '';
    this.image = options.image || null;
    this.skillType = options.skillType || getSkillType(this);

    // Accent color:
    // Enemies (owner === 2) have uniform red '#ff2a55'
    // Players (owner === 1) have uniform green '#00ff66'
    this.accent = this.owner === 2 ? '#ff2a55' : '#00ff66';
    this.equipment = options.equipment ? { ...options.equipment, isBroken: false } : null;

    // Base Combat Attributes
    this.baseMaxHp = Number(maxHp) || DEFAULT_HP;
    this.baseAtk = Number(atk) || DEFAULT_ATK;
    this.baseDef = Number(def) || DEFAULT_DEF;
    this.baseSpd = Number(spd) || DEFAULT_SPD;

    // Equipment that grants max HP is calculated at combat start (and again if equipment breaks)
    const initialHpBonus = (this.equipment && !this.equipment.isBroken) ? (Number(this.equipment.hpBonus) || 0) : 0;
    this.maxHp = this.baseMaxHp + initialHpBonus;
    this.hp = this.maxHp;

    this.moving = false;
    this.alive = true;
    this.trail = [];

    // Liquid ring wave dynamics (stasis when 0, waves upon impact, stacks if hit while shaking)
    this.waveAmp = 0;
    this.wavePhase = 0;
  }

  // Dynamic getters: Calculate buffs from equipment on access for future support of weapon breaking
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

  // Recalculates maxHp when equipment breaks or changes, clamping hp to the new max
  recalculateMaxHp() {
    const hpBonus = (this.equipment && !this.equipment.isBroken) ? (Number(this.equipment.hpBonus) || 0) : 0;
    this.maxHp = this.baseMaxHp + hpBonus;
    if (this.hp > this.maxHp) {
      this.hp = this.maxHp;
    }
  }

  // In-combat equipment break trigger
  breakEquipment() {
    if (this.equipment && !this.equipment.isBroken) {
      this.equipment.isBroken = true;
      this.recalculateMaxHp();
    }
  }

  get color() {
    return this.accent || (this.owner === 1 ? COLORS.P_COL : COLORS.A_COL);
  }

  get darkColor() {
    if (this.owner === 2) return COLORS.A_COL_DARK;
    return lerpColor(this.color, '#000000', 0.55);
  }

  get glowColor() {
    return hexToRgba(this.color, 0.45);
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
    const spdMultiplier = this.spd > 10 ? (this.spd / 100) : this.spd;
    this.vx = vx * spdMultiplier;
    this.vy = vy * spdMultiplier;
    this.moving = true;
    this.trail = [];
    this.triggerWave(3.5); // Initial jolt on launch
  }

  updatePhysics(allBalls, activeOwner = null) {
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

        const isThisFriendly = activeOwner != null ? this.owner === activeOwner : true;
        const isOtherFriendly = activeOwner != null ? other.owner === activeOwner : other.owner === this.owner;
        const isEnemyHittingStationaryFriendly = !isThisFriendly && isOtherFriendly && !other.moving;

        // Position separation: stationary friendly units act as solid walls
        if (isEnemyHittingStationaryFriendly) {
          this.x += nx * overlap;
          this.y += ny * overlap;
        } else {
          this.x += nx * overlap * 0.5;
          this.y += ny * overlap * 0.5;
          other.x -= nx * overlap * 0.5;
          other.y -= ny * overlap * 0.5;
        }

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

        // Teammate interaction: FUTURE CAT heals teammate +5 HP during its active turn
        if (other.owner === this.owner) {
          const isThisActiveTurn = activeOwner != null ? this.owner === activeOwner : true;
          if (this.skillType === 'future' && isThisActiveTurn) {
            const maxHp = other.maxHp || 100;
            const healAmount = FUTURE_TEAMMATE_HEAL;
            other.hp = Math.min(maxHp, other.hp + healAmount);
            other.triggerWave(3.5);

            events.push({
              type: 'heal',
              healer: this,
              target: other,
              amount: healAmount,
              x: contactX,
              y: contactY,
            });
          }
        }

        // Damage calculation:
        // 1) Normal Attack: Moving friendly unit attacks enemy
        // 2) Stationary Counter: Knocked enemy hitting stationary friendly unit is attacked by the stationary friendly unit
        if (other.owner !== this.owner) {
          if (isThisFriendly && !isOtherFriendly) {
            const rawDmg = Math.max(1, this.atk - other.def);
            const hpLost = Math.min(rawDmg, Math.max(0, other.hp));
            other.hp = Math.max(0, other.hp - rawDmg);

            let knockback = false;
            if (this.skillType === 'cool' && other.hp > 0) {
              const knockbackSpeed = Math.max(
                COOL_MIN_KNOCKBACK_SPEED,
                impactSpd * COOL_KNOCKBACK_MULTIPLIER
              );
              other.vx = -nx * knockbackSpeed;
              other.vy = -ny * knockbackSpeed;
              other.moving = true;
              other.triggerWave(5.5);
              knockback = true;
            }

            const slowedByHard = other.skillType === 'hard';
            if (slowedByHard) {
              this.vx *= HARD_EXTRA_SLOW_MULTIPLIER;
              this.vy *= HARD_EXTRA_SLOW_MULTIPLIER;
            }

            // Heavy wave jolt on damaged ball (stacks if already shaking!)
            other.triggerWave(4.0 + rawDmg * 0.4);

            events.push({
              type: 'damage',
              attacker: this,
              defender: other,
              damage: rawDmg,
              effectiveDmg: hpLost,
              hpLost,
              bonusDamage: 0,
              knockback,
              slowedByHard,
              x: contactX,
              y: contactY,
            });

            if (other.hp <= 0) {
              other.alive = false;
              events.push({ type: 'defeat', ball: other, x: other.x, y: other.y });
            }
          } else if (isEnemyHittingStationaryFriendly) {
            // Knocked enemy hits stationary friendly unit: stationary friendly unit attacks the enemy!
            const rawDmg = Math.max(1, other.atk - this.def);
            const hpLost = Math.min(rawDmg, Math.max(0, this.hp));
            this.hp = Math.max(0, this.hp - rawDmg);

            let knockback = false;
            if (other.skillType === 'cool' && this.hp > 0) {
              const knockbackSpeed = Math.max(
                COOL_MIN_KNOCKBACK_SPEED,
                impactSpd * COOL_KNOCKBACK_MULTIPLIER
              );
              this.vx = nx * knockbackSpeed;
              this.vy = ny * knockbackSpeed;
              this.triggerWave(5.5);
              knockback = true;
            }

            const slowedByHard = other.skillType === 'hard';
            if (slowedByHard) {
              this.vx *= HARD_EXTRA_SLOW_MULTIPLIER;
              this.vy *= HARD_EXTRA_SLOW_MULTIPLIER;
            }

            // Heavy wave jolt on damaged enemy
            this.triggerWave(4.0 + rawDmg * 0.4);

            events.push({
              type: 'damage',
              attacker: other,
              defender: this,
              damage: rawDmg,
              effectiveDmg: hpLost,
              hpLost,
              bonusDamage: 0,
              knockback,
              slowedByHard,
              isCounter: true,
              x: contactX,
              y: contactY,
            });

            if (this.hp <= 0) {
              this.alive = false;
              this.moving = false;
              this.vx = 0;
              this.vy = 0;
              events.push({ type: 'defeat', ball: this, x: this.x, y: this.y });
              break;
            }
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

    // 0. Ambient bottom ground glow (底光) under the peg matching pet accent
    ctx.save();
    const ambientR = BALL_R * 1.32;
    const ambGrad = ctx.createRadialGradient(
      this.x, this.y + 3, BALL_R * 0.4,
      this.x, this.y + 3, ambientR
    );
    ambGrad.addColorStop(0, hexToRgba(this.accent, 0.28));
    ambGrad.addColorStop(0.65, hexToRgba(this.accent, 0.09));
    ambGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = ambGrad;
    ctx.beginPath();
    ctx.arc(this.x, this.y + 3, ambientR, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

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

    // 4. Center Inner Core & Character Sprite Image
    ctx.save();
    ctx.beginPath();
    ctx.arc(this.x, this.y, innerR - 0.5, 0, Math.PI * 2);
    ctx.clip();

    // Dark cyber background inside the core
    ctx.fillStyle = '#080d14';
    ctx.fill();

    // Distinctive radial background glow (底色/底光) matching exhibition area
    const coreGlow = ctx.createRadialGradient(
      this.x, this.y - 2, 2,
      this.x, this.y, innerR - 0.5
    );
    coreGlow.addColorStop(0, hexToRgba(this.accent, 0.45));
    coreGlow.addColorStop(0.55, hexToRgba(this.accent, 0.18));
    coreGlow.addColorStop(0.9, hexToRgba(this.accent, 0.04));
    coreGlow.addColorStop(1, 'rgba(8, 13, 20, 0)');
    ctx.fillStyle = coreGlow;
    ctx.fill();

    const img = getBallImage(this);
    if (img && img.complete && img.naturalWidth > 0) {
      // Draw pixel art crisply (imageSmoothingEnabled = false)
      const prevSmoothing = ctx.imageSmoothingEnabled;
      ctx.imageSmoothingEnabled = false;

      // Inner core diameter is (innerR * 2) = 68px. Image fills ~90% (approx 61px)
      const imgSize = Math.round((innerR - 2.5) * 2);

      // Sprite drop-shadow glow matching the accent color
      ctx.save();
      ctx.shadowColor = hexToRgba(this.accent, 0.55);
      ctx.shadowBlur = 10;
      ctx.drawImage(
        img,
        Math.round(this.x - imgSize / 2),
        Math.round(this.y - imgSize / 2),
        imgSize,
        imgSize
      );
      ctx.restore();

      ctx.imageSmoothingEnabled = prevSmoothing;
    } else {
      // Fallback: Label ("1b", "2c", etc.) centered inside the dark core
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = 'italic 900 16px "Chakra Petch", "Oxanium", Arial, sans-serif';
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 2.2;
      const labelX = Math.round(this.x);
      const labelY = Math.round(this.y - 2);
      ctx.strokeText(this.label, labelX, labelY);
      ctx.fillStyle = COLORS.WHITE;
      ctx.fillText(this.label, labelX, labelY);
    }

    // Specular shine on top-left of core (glass orb reflection over the sprite)
    const spec = ctx.createRadialGradient(
      this.x - innerR * 0.3, this.y - innerR * 0.35, 1,
      this.x - innerR * 0.3, this.y - innerR * 0.35, innerR * 0.7
    );
    spec.addColorStop(0, 'rgba(255, 255, 255, 0.28)');
    spec.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = spec;
    ctx.beginPath();
    ctx.arc(this.x, this.y, innerR - 0.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    // 6. HP Text positioned exactly on the lower part of the HP ring
    // Minimalist solid color: pure white when healthy, solid crimson when in critical danger
    const hpColor = (hpRatio <= 0.25) ? '#ff2a55' : '#ffffff';

    const hpRingX = Math.round(this.x);
    const hpRingY = Math.round(this.y + 36.5); // Optical center on lower ring band (between 34px and 44px)
    ctx.save();
    ctx.translate(hpRingX, hpRingY);
    ctx.font = 'italic 900 24px "Chakra Petch", "Oxanium", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2.2;

    // Optical centering to compensate for digit shape asymmetry and canvas baseline droop
    const metrics = ctx.measureText(`${this.hp}`);
    const ox = (metrics.actualBoundingBoxLeft !== undefined && metrics.actualBoundingBoxRight !== undefined)
      ? Math.round((metrics.actualBoundingBoxLeft - metrics.actualBoundingBoxRight) * 0.5)
      : 0;
    const oy = -1;

    ctx.strokeText(`${this.hp}`, ox, oy);
    ctx.fillStyle = hpColor;
    ctx.fillText(`${this.hp}`, ox, oy);
    ctx.restore();

    ctx.restore();
  }
}
