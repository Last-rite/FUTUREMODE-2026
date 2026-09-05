import { COLORS } from './constants.js';

export class DmgNum {
  constructor(x, y, amount, isCrit = false) {
    this.x = x;
    this.y = y;
    this.val = amount;
    this.isCrit = isCrit;
    this.life = 55;
    this.maxLife = 55;
    this.vy = -2.2;
    this.vx = (Math.random() - 0.5) * 1.0;
  }

  update() {
    this.x += this.vx;
    this.y += this.vy;
    this.vy *= 0.93;
    this.life--;
  }

  draw(ctx) {
    if (this.life <= 0) return;

    ctx.save();
    const alpha = Math.min(1.0, (this.life / this.maxLife) * 1.6);
    const scale = 1.0 + (1.0 - this.life / this.maxLife) * 0.35;

    ctx.globalAlpha = alpha;
    ctx.font = `italic 900 ${Math.round(22 * scale)}px "Chakra Petch", "Oxanium", Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    // Black heavy border
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 6;
    ctx.strokeText(`-${this.val}`, this.x, this.y);

    // Neon fill
    ctx.fillStyle = this.isCrit ? COLORS.GOLD : COLORS.A_COL;
    ctx.fillText(`-${this.val}`, this.x, this.y);

    ctx.restore();
  }
}

// Spark / Impact Particles
export class Particle {
  constructor(x, y, color, isPixel = false) {
    this.x = x;
    this.y = y;
    this.color = color;
    this.isPixel = isPixel;
    const angle = Math.random() * Math.PI * 2;
    const spd = 2.0 + Math.random() * 6.5;
    this.vx = Math.cos(angle) * spd;
    this.vy = Math.sin(angle) * spd;
    this.life = 20 + Math.random() * 20;
    this.maxLife = this.life;
    this.size = 3 + Math.random() * 4;
  }

  update() {
    this.x += this.vx;
    this.y += this.vy;
    this.vx *= 0.94;
    this.vy *= 0.94;
    this.life--;
  }

  draw(ctx) {
    if (this.life <= 0) return;
    ctx.save();
    const alpha = this.life / this.maxLife;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = this.color;

    if (this.isPixel) {
      // Crisp retro pixel block
      const s = Math.round(this.size * alpha);
      ctx.fillRect(Math.round(this.x - s / 2), Math.round(this.y - s / 2), s, s);
    } else {
      ctx.beginPath();
      ctx.arc(this.x, this.y, Math.max(1, this.size * alpha), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

// Glass Shards when the liquid container orb shatters
export class GlassShard {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    const angle = Math.random() * Math.PI * 2;
    const spd = 3.0 + Math.random() * 8.0;
    this.vx = Math.cos(angle) * spd;
    this.vy = Math.sin(angle) * spd;
    this.rot = Math.random() * Math.PI * 2;
    this.rotSpd = (Math.random() - 0.5) * 0.4;
    this.size = 4 + Math.random() * 7;
    this.life = 35 + Math.random() * 25;
    this.maxLife = this.life;
  }

  update() {
    this.x += this.vx;
    this.y += this.vy;
    this.vx *= 0.95;
    this.vy += 0.15; // Gravity
    this.rot += this.rotSpd;
    this.life--;
  }

  draw(ctx) {
    if (this.life <= 0) return;
    ctx.save();
    const alpha = this.life / this.maxLife;
    ctx.globalAlpha = alpha;
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rot);

    // Sharp glass shard polygon
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.strokeStyle = 'rgba(0, 255, 102, 0.6)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-this.size, -this.size * 0.5);
    ctx.lineTo(this.size * 0.8, -this.size * 0.2);
    ctx.lineTo(this.size * 0.2, this.size * 0.9);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.restore();
  }
}

// Splashing Liquid Drops when orb shatters
export class LiquidDrop {
  constructor(x, y, color) {
    this.x = x;
    this.y = y;
    this.color = color;
    const angle = Math.random() * Math.PI * 2;
    const spd = 2.0 + Math.random() * 7.0;
    this.vx = Math.cos(angle) * spd;
    this.vy = Math.sin(angle) * spd;
    this.r = 3 + Math.random() * 5;
    this.life = 30 + Math.random() * 25;
    this.maxLife = this.life;
  }

  update() {
    this.x += this.vx;
    this.y += this.vy;
    this.vx *= 0.95;
    this.vy += 0.2; // Gravity
    this.life--;
  }

  draw(ctx) {
    if (this.life <= 0) return;
    ctx.save();
    const alpha = this.life / this.maxLife;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, Math.max(1, this.r * alpha), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

// Expanding impact shockwave ring
export class ImpactRing {
  constructor(x, y, color = COLORS.WHITE) {
    this.x = x;
    this.y = y;
    this.color = color;
    this.radius = 8;
    this.maxRadius = 45;
    this.life = 18;
    this.maxLife = 18;
  }

  update() {
    this.radius += (this.maxRadius - this.radius) * 0.32;
    this.life--;
  }

  draw(ctx) {
    if (this.life <= 0) return;
    ctx.save();
    const progress = 1.0 - this.life / this.maxLife;
    ctx.globalAlpha = (1.0 - progress) * 0.8;
    ctx.strokeStyle = this.color;
    ctx.lineWidth = Math.max(1, 4 * (1.0 - progress));
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}
