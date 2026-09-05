import {
  W, H, BALL_R, DRAG_MAX, SPEED_SCALE, COLORS,
  TEAM_SIZE, DEFAULT_ATK, DEFAULT_DEF, DEFAULT_HP, DEFAULT_SPD,
  ENEMY_START_Y, PLAYER_START_Y,
  SHOW_TOP_BAR, TOP_BAR_MODE, BOSS_TARGET_ID, BOSS_DISPLAY_NAME, FLEET_DISPLAY_NAME,
  ENEMY_AGENT_INACCURACY
} from './constants.js';
import { Ball } from './Ball.js';
import { DmgNum, Particle, GlassShard, LiquidDrop, ImpactRing } from './DmgNum.js';
import { Agent2 } from './agent.js';
import { sound } from './audio.js';

export class GameEngine {
  constructor(canvas, callbacks = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.callbacks = callbacks; // onSnapshot, onGameOver, onLog
    this.playerTeam = callbacks.playerTeam || [];
    this.dungeon = callbacks.dungeon || null;

    this.dpr = Math.min(Math.max(window.devicePixelRatio || 1, 2), 3);
    this.agent = new Agent2();

    this.balls = [];
    this.dmgNums = [];
    this.particles = [];
    this.impactRings = [];
    this.turnQueue = []; // array of labels in order
    this.turnIndex = 0;
    this.round = 1;

    // Gold reward & Fleet tracking
    this.goldEarned = 0;
    this.initialEnemyFleetMaxHp = 0;
    this.initialPlayerFleetMaxHp = 0;

    // Hit counter & pulse effect for arena watermark / floating combo meter
    this.hitCount = 0;
    this.hitPulse = 0;
    this.hitTimer = 0;
    this.hitAlpha = 0;
    this.comboTeamColor = COLORS.P_COL;

    // Backdoor: Enemy agent inaccuracy (default 10 degrees and power variation)
    this.enemy_agent_inaccuracy = ENEMY_AGENT_INACCURACY;

    // Screen Shake punch
    this.shake = 0;

    // States: 'PLAYER_AIM', 'AI_AIM', 'ROLLING', 'GAME_OVER'
    this.state = 'PLAYER_AIM';

    // Drag input
    this.activePointerId = null;
    this.dragStart = null;
    this.aimPt = null;
    this.aimPulseProgress = 0; // Continuous aim glow cycle progress

    // AI timing
    this.aiTimer = null;
    this.aiAimPreview = null;

    // Loop & Timestep
    this.running = false;
    this.lastTime = performance.now();
    this.accumulator = 0;
    this.fixedDt = 1 / 120; // 120Hz physics substepping
    this.separationTicks = 0;

    // Bindings
    this.loop = this.loop.bind(this);
    this.onPointerDown = this.onPointerDown.bind(this);
    this.onPointerMove = this.onPointerMove.bind(this);
    this.onPointerUp = this.onPointerUp.bind(this);
    this.onPointerCancel = this.onPointerCancel.bind(this);
    this.onVisibilityChange = this.onVisibilityChange.bind(this);
    this.handleResize = this.handleResize.bind(this);

    this.init();
  }

  init() {
    this.handleResize();
    window.addEventListener('resize', this.handleResize);
    document.addEventListener('visibilitychange', this.onVisibilityChange);

    this.canvas.addEventListener('pointerdown', this.onPointerDown);
    this.canvas.addEventListener('pointermove', this.onPointerMove);
    this.canvas.addEventListener('pointerup', this.onPointerUp);
    this.canvas.addEventListener('pointercancel', this.onPointerCancel);

    this.resetGame();
    this.running = true;
    this.lastTime = performance.now();
    requestAnimationFrame(this.loop);
  }

  handleResize() {
    this.dpr = Math.min(Math.max(window.devicePixelRatio || 1, 2), 3);
    this.canvas.width = Math.round(W * this.dpr);
    this.canvas.height = Math.round(H * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.ctx.imageSmoothingEnabled = true;
    this.ctx.imageSmoothingQuality = 'high';
  }

  onVisibilityChange() {
    if (document.hidden) {
      this.accumulator = 0;
      this.lastTime = performance.now();
    }
  }

  resetGame() {
    if (this.aiTimer) {
      clearTimeout(this.aiTimer);
      this.aiTimer = null;
    }

    // Reset state cleanly so match starts immediately
    this.state = 'PLAYER_AIM';
    this.balls = [];
    this.dmgNums = [];
    this.particles = [];
    this.impactRings = [];
    this.round = 1;
    this.turnIndex = 0;
    this.hitCount = 0;
    this.hitPulse = 0;
    this.hitTimer = 0;
    this.hitAlpha = 0;
    this.comboTeamColor = COLORS.P_COL;
    this.aiAimPreview = null;
    this.dragStart = null;
    this.aimPt = null;
    this.activePointerId = null;
    this.shake = 0;
    this.separationTicks = 0;

    // Create teams based on playerTeam and TEAM_SIZE backdoor constant
    // Team 1: Player (Bottom, y ~ 660, NOXCAT Neon Green)
    // Team 2: AI (Top, y ~ 140, Cyber Crimson)
    const pLabels = [];
    const aLabels = [];

    const pCount = (this.playerTeam && this.playerTeam.length > 0) ? this.playerTeam.length : TEAM_SIZE;
    const pSpacing = W / (pCount + 1);

    for (let i = 0; i < pCount; i++) {
      const char = String.fromCharCode(97 + i);
      const pLabel = `1${char}`;
      const px = pSpacing * (i + 1);
      const py = PLAYER_START_Y;

      if (this.playerTeam && this.playerTeam[i]) {
        const pet = this.playerTeam[i];
        const atk = pet.atk ?? DEFAULT_ATK;
        const def = pet.def ?? DEFAULT_DEF;
        const hp = pet.hp ?? DEFAULT_HP;
        const spd = pet.spd ?? DEFAULT_SPD;

        const options = {
          petId: pet.id,
          idString: pet.idString || `peg_${pet.id || 'player'}`,
          name: pet.name || pLabel,
          code: pet.code || '',
          accent: pet.accent || null,
          image: pet.image || pet.avatar || null,
          equipment: pet.equippedItem ? {
            id: pet.equippedItem.id,
            idString: pet.equippedItem.idString || pet.equippedItem.id,
            name: pet.equippedItem.name,
            type: pet.equippedItem.type,
            hpBonus: pet.equippedItem.hpBonus || 0,
            atkBonus: pet.equippedItem.atkBonus || 0,
            defBonus: pet.equippedItem.defBonus || 0,
            spdBonus: pet.equippedItem.spdBonus || 0,
          } : null,
        };

        this.balls.push(new Ball(pLabel, 1, px, py, atk, def, hp, spd, options));
      } else {
        this.balls.push(new Ball(pLabel, 1, px, py, DEFAULT_ATK, DEFAULT_DEF, DEFAULT_HP, DEFAULT_SPD));
      }
      pLabels.push(pLabel);
    }

    // Team 2: Enemy pieces (Enemies can wear equipment, default to null / no natural spawn)
    const aCount = TEAM_SIZE;
    const aSpacing = W / (aCount + 1);
    for (let i = 0; i < aCount; i++) {
      const char = String.fromCharCode(97 + i);
      const aLabel = `2${char}`;
      const ax = aSpacing * (i + 1);
      const ay = ENEMY_START_Y;

      const enemyOptions = {
        idString: `enemy_drone_${char}`,
        name: `ENEMY ${char.toUpperCase()}`,
        code: char.toUpperCase(),
        accent: '#ff2a55',
        equipment: null, // Enemies can wear equipment, default to null (no natural equipment spawn)
      };

      this.balls.push(new Ball(aLabel, 2, ax, ay, DEFAULT_ATK, DEFAULT_DEF, DEFAULT_HP, DEFAULT_SPD, enemyOptions));
      aLabels.push(aLabel);
    }

    // Turn order: All Team 1 pegs, then All Team 2 pegs
    this.turnQueue = [...pLabels, ...aLabels];
    this.turnIndex = 0;

    // Record initial fleet total max HP (prevents HP bar magically increasing on kills)
    this.initialEnemyFleetMaxHp = this.balls
      .filter(b => b.owner === 2)
      .reduce((sum, b) => sum + b.maxHp, 0);
    this.initialPlayerFleetMaxHp = this.balls
      .filter(b => b.owner === 1)
      .reduce((sum, b) => sum + b.maxHp, 0);
    this.goldEarned = 0;
    this.enemy_agent_inaccuracy = ENEMY_AGENT_INACCURACY;

    this.emitLog(`🎮 Match Started! Round 1 (Team 1 Phase: ${pLabels.join(', ')})`);
    this.startTurn();
  }

  get activeBall() {
    const label = this.turnQueue[this.turnIndex];
    return this.balls.find(b => b.label === label);
  }

  startTurn() {
    this.checkWinCondition();
    if (this.state === 'GAME_OVER') return;

    const ball = this.activeBall;
    if (!ball || !ball.alive) {
      this.advanceTurn();
      return;
    }

    if (ball.owner === 1) {
      this.state = 'PLAYER_AIM';
      this.emitLog(`👉 Your turn: Drag and launch peg ${ball.label}!`);
    } else {
      this.state = 'AI_AIM';
      this.emitLog(`🤖 AI calculating trajectory for peg ${ball.label}...`);
      this.scheduleAiMove();
    }

    this.sendSnapshot();
  }

  scheduleAiMove() {
    const ball = this.activeBall;
    if (!ball || !ball.alive) {
      this.advanceTurn();
      return;
    }

    this.aiTimer = setTimeout(() => {
      if (this.state !== 'AI_AIM') return;

      const snapshot = this.getSnapshot();
      // Perfect AI agent calculates its best move based on simulations (unmodified)
      const move = this.agent.chooseMove(snapshot, ball.label);

      // Backdoor: Inaccuracy applied after the perfect agent calculated its best move
      const inacc = this.enemy_agent_inaccuracy ?? ENEMY_AGENT_INACCURACY;

      // 1. Aim direction: randomly roll +- of this degree
      const angleRollDeg = (Math.random() * 2 - 1) * inacc;
      const finalTheta = move.theta + (angleRollDeg * Math.PI) / 180;

      // 2. Power: use (100% - inacc% + rand(-inacc, +inacc)%) of max power (capped at 100%)
      const powerRollPct = (Math.random() * 2 - 1) * inacc;
      const powerFactor = Math.min(1.0, Math.max(0.05, (100 - inacc + powerRollPct) / 100));
      const finalPower = powerFactor * DRAG_MAX;

      // AI phantom aim preview with post-inaccuracy angle and power
      this.aiAimPreview = {
        ox: ball.x,
        oy: ball.y,
        theta: finalTheta,
        power: finalPower,
      };

      this.aiTimer = setTimeout(() => {
        if (this.state !== 'AI_AIM') return;
        this.aiAimPreview = null;

        const vx = Math.cos(finalTheta) * finalPower * SPEED_SCALE;
        const vy = Math.sin(finalTheta) * finalPower * SPEED_SCALE;

        sound.playLaunch(Math.min(1.0, finalPower / DRAG_MAX));
        this.hitCount = 0;
        this.hitPulse = 0.4;
        this.hitTimer = 1.0;
        this.hitAlpha = 1.0;
        this.comboTeamColor = ball.color || COLORS.A_COL;
        ball.launch(vx, vy);
        this.state = 'ROLLING';
        this.emitLog(`⚡ AI launches peg ${ball.label}!`);
      }, 700);
    }, 550);
  }

  advanceTurn() {
    for (const b of this.balls) {
      b.trail = [];
    }

    this.turnIndex++;
    if (this.turnIndex >= this.turnQueue.length) {
      this.turnIndex = 0;
      this.round++;
      this.emitLog(`─── Round ${this.round} begins ───`);
    }

    this.startTurn();
  }

  getSettlementResults(winner) {
    const isVictory = winner === 'PLAYER';
    const playerBalls = this.balls.filter(b => b.owner === 1);
    
    const gains = [];
    const losses = [];

    // 1. GAINS (獲得): order: pegs, equipments, gold
    // Pegs gains: (none for now)
    // Equipment gains: (none for now)
    // Gold gains:
    if (this.goldEarned > 0) {
      gains.push({
        id: 'gain-gold',
        category: 'gain',
        kind: 'gold',
        type: 'gold',
        variant: 'gain',
        label: `+${this.goldEarned} G`,
        amount: this.goldEarned,
      });
    }

    // 2. LOSSES (失去): order: pegs, equipments, gold
    const deadPlayerBalls = playerBalls.filter(b => !b.alive || b.hp <= 0);
    const lostPegs = [];
    const lostEquipments = [];

    for (const b of deadPlayerBalls) {
      const isNxc01 = b.code === '01' ||
                      b.idString?.includes('core') ||
                      b.idString?.includes('nxc_1') ||
                      (b.name?.includes('NOXCAT') && !b.name?.includes('FUTURE') && !b.name?.includes('COOL') && !b.name?.includes('HARD'));

      const hasHomeStone = Boolean(b.equipment && (
        b.equipment.name?.includes('回家') ||
        b.equipment.idString?.includes('return_stone') ||
        b.equipment.idString?.includes('home') ||
        b.equipment.type === 'TREASURE'
      ));

      const canReturnHome = isNxc01 || hasHomeStone;

      if (!canReturnHome) {
        // Peg gets lost (lose them even if we win the fight)
        lostPegs.push({
          id: `lost-peg-${b.petId || b.idString || b.label}`,
          category: 'lost',
          kind: 'peg',
          type: 'lost-cat',
          variant: 'lost',
          label: b.name || 'NOXCAT',
          petId: b.petId || b.idString,
          code: b.code,
          ball: b,
        });
      }

      if (b.equipment) {
        // Equipment is lost!
        const eq = b.equipment;
        const isBlade = eq.type === 'WEAPON' || eq.idString?.includes('blade') || eq.name?.includes('劍');
        const isShield = eq.type === 'GEAR' || eq.idString?.includes('shield') || eq.name?.includes('盾');
        const eqType = isBlade ? 'sword' : (isShield ? 'shield' : 'gem');

        lostEquipments.push({
          id: `lost-eq-${eq.id || eq.idString || b.label}`,
          category: 'lost',
          kind: 'equipment',
          type: eqType,
          variant: 'lost',
          label: eq.name,
          itemId: eq.id || eq.idString,
          equipment: eq,
        });
      }
    }

    // Both categories strictly ordered: pegs, equipments, gold
    losses.push(...lostPegs, ...lostEquipments);

    return {
      gains,
      losses,
      allResults: [...gains, ...losses],
      lostPegIds: lostPegs.map(p => p.petId).filter(Boolean),
      lostItemIds: lostEquipments.map(e => e.itemId).filter(Boolean),
      goldEarned: this.goldEarned,
    };
  }

  checkWinCondition() {
    const playerAlive = this.balls.some(b => b.owner === 1 && b.alive);
    const aiAlive = this.balls.some(b => b.owner === 2 && b.alive);

    if (!playerAlive || !aiAlive) {
      this.state = 'GAME_OVER';
      const winner = playerAlive ? 'PLAYER' : 'AI';
      if (winner === 'PLAYER') {
        sound.playVictory();
      } else {
        sound.playDefeat();
      }
      this.emitLog(`🏆 GAME OVER! ${winner} WINS!`);
      const settlement = this.getSettlementResults(winner);
      if (this.callbacks.onGameOver) {
        this.callbacks.onGameOver({
          winner,
          round: this.round,
          goldEarned: this.goldEarned,
          ...settlement,
        });
      }
      this.sendSnapshot();
    }
  }

  // ── DEBUG BACKDOORS: Instant kill methods for reward / settlement screen testing ──
  debugKillOpponents() {
    if (this.aiTimer) clearTimeout(this.aiTimer);
    for (const b of this.balls) {
      if (b.owner === 2) {
        b.hp = 0;
        b.alive = false;
        b.vx = 0;
        b.vy = 0;
      }
    }
    this.checkWinCondition();
    this.sendSnapshot();
  }

  debugKillPlayer() {
    if (this.aiTimer) clearTimeout(this.aiTimer);
    for (const b of this.balls) {
      if (b.owner === 1) {
        b.hp = 0;
        b.alive = false;
        b.vx = 0;
        b.vy = 0;
      }
    }
    this.checkWinCondition();
    this.sendSnapshot();
  }

  getSnapshot() {
    return {
      balls: this.balls.map(b => ({
        label: b.label,
        owner: b.owner,
        idString: b.idString,
        name: b.name,
        code: b.code,
        equipment: b.equipment,
        x: b.x,
        y: b.y,
        hp: b.hp,
        maxHp: b.maxHp,
        baseMaxHp: b.baseMaxHp,
        baseAtk: b.baseAtk,
        baseDef: b.baseDef,
        baseSpd: b.baseSpd,
        atk: b.atk,
        def: b.def,
        spd: b.spd,
        alive: b.alive,
      })),
      activeLabel: this.activeBall?.label,
      round: this.round,
    };
  }

  // ── Monster Strike Initiative Queue (Leftmost is ALWAYS the active mover) ──
  getInitiativeQueue() {
    const aliveQueue = this.turnQueue.filter(label => {
      const b = this.balls.find(ball => ball.label === label);
      return b && b.alive;
    });

    if (aliveQueue.length === 0) return [];

    const activeLabel = this.activeBall?.label;
    const activeIdx = aliveQueue.indexOf(activeLabel);
    const startIdx = activeIdx >= 0 ? activeIdx : 0;

    // Shift array circularly so active mover is at index 0 (leftmost)
    const reordered = [
      ...aliveQueue.slice(startIdx),
      ...aliveQueue.slice(0, startIdx)
    ];

    return reordered.map((label, idx) => {
      const b = this.balls.find(ball => ball.label === label);
      return {
        label,
        owner: b.owner,
        idString: b.idString,
        name: b.name,
        code: b.code,
        accent: b.accent || (b.owner === 2 ? '#ff2a55' : '#00ff66'),
        equipment: b.equipment,
        hp: b.hp,
        maxHp: b.maxHp,
        baseMaxHp: b.baseMaxHp,
        baseAtk: b.baseAtk,
        baseDef: b.baseDef,
        baseSpd: b.baseSpd,
        atk: b.atk,
        def: b.def,
        spd: b.spd,
        waveAmp: b.waveAmp,
        isCurrent: idx === 0,
        isBoss: b.owner === 2 && b.label === '2a',
      };
    });
  }

  // Top Health Bar info (supports 'boss' mode and 'fleet' mode)
  getTopBarInfo() {
    if (!SHOW_TOP_BAR) return null;
    const aiBalls = this.balls.filter(b => b.owner === 2);
    if (aiBalls.length === 0) return null;

    if (TOP_BAR_MODE === 'boss') {
      // Boss Mode: tracks specific designated enemy unit
      const boss = aiBalls.find(b => b.label === BOSS_TARGET_ID) || aiBalls[0];
      const hp = boss ? Math.max(0, boss.hp) : 0;
      const maxHp = boss ? boss.maxHp : DEFAULT_HP;
      return {
        mode: 'boss',
        name: BOSS_DISPLAY_NAME,
        targetId: boss ? boss.label : BOSS_TARGET_ID,
        hp,
        maxHp,
        ratio: maxHp > 0 ? Math.max(0, Math.min(1, hp / maxHp)) : 0,
        alive: boss ? boss.alive : false,
      };
    } else {
      // Fleet Mode: total current HP against initial fixed fleet max HP
      const currentFleetHp = aiBalls.reduce((sum, b) => sum + Math.max(0, b.hp), 0);
      const fleetMaxHp = this.initialEnemyFleetMaxHp || (aiBalls.length * DEFAULT_HP);
      return {
        mode: 'fleet',
        name: FLEET_DISPLAY_NAME,
        targetId: null,
        hp: currentFleetHp,
        maxHp: fleetMaxHp,
        ratio: fleetMaxHp > 0 ? Math.max(0, Math.min(1, currentFleetHp / fleetMaxHp)) : 0,
        alive: currentFleetHp > 0,
      };
    }
  }

  // Player Total Health Bar info
  getPlayerBarInfo() {
    const pBalls = this.balls.filter(b => b.owner === 1);
    if (pBalls.length === 0) return null;
    const currentHp = pBalls.reduce((sum, b) => sum + Math.max(0, b.hp), 0);
    const maxHp = this.initialPlayerFleetMaxHp || (pBalls.length * DEFAULT_HP);
    return {
      name: 'PLAYER SQUAD',
      hp: currentHp,
      maxHp,
      ratio: maxHp > 0 ? Math.max(0, Math.min(1, currentHp / maxHp)) : 0,
      alive: currentHp > 0,
    };
  }

  sendSnapshot() {
    if (!this.callbacks.onSnapshot) return;

    const topBar = this.getTopBarInfo();
    const playerBar = this.getPlayerBarInfo();

    this.callbacks.onSnapshot({
      round: this.round,
      activeLabel: this.activeBall?.label || null,
      activeOwner: this.activeBall?.owner || 1,
      turnPhase: this.state,
      initiativeQueue: this.getInitiativeQueue(),
      topBarInfo: topBar,
      playerBarInfo: playerBar,
      boss: topBar, // Backwards-compatible
      goldEarned: this.goldEarned,
    });
  }

  emitLog(msg) {
    if (this.callbacks.onLog) {
      this.callbacks.onLog(msg);
    }
  }

  // ── Input Handling (Pointer Events) ──
  getCanvasCoords(e) {
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return { x: 0, y: 0 };
    return {
      x: ((e.clientX - rect.left) / rect.width) * W,
      y: ((e.clientY - rect.top) / rect.height) * H,
    };
  }

  onPointerDown(e) {
    sound.init();
    if (this.state !== 'PLAYER_AIM') return;

    const ball = this.activeBall;
    if (!ball || !ball.alive || ball.owner !== 1) return;

    const pt = this.getCanvasCoords(e);
    const d = Math.hypot(pt.x - ball.x, pt.y - ball.y);
    const inPlayerTerritory = pt.y >= H / 2;

    if (d <= BALL_R * 2.2 || (inPlayerTerritory && d <= BALL_R * 4.0)) {
      this.activePointerId = e.pointerId;
      this.canvas.setPointerCapture(e.pointerId);
      this.dragStart = { x: ball.x, y: ball.y };
      this.aimPt = pt;
    }
  }

  onPointerMove(e) {
    if (this.state !== 'PLAYER_AIM' || this.activePointerId !== e.pointerId) return;
    this.aimPt = this.getCanvasCoords(e);
  }

  onPointerUp(e) {
    if (this.state !== 'PLAYER_AIM' || this.activePointerId !== e.pointerId) return;

    const ball = this.activeBall;
    if (this.dragStart && this.aimPt && ball) {
      const dx = this.aimPt.x - this.dragStart.x;
      const dy = this.aimPt.y - this.dragStart.y;
      const pull = Math.hypot(dx, dy);

      if (pull >= 8) {
        const clampedPull = Math.min(pull, DRAG_MAX);
        const pvx = -(dx / pull) * clampedPull * SPEED_SCALE;
        const pvy = -(dy / pull) * clampedPull * SPEED_SCALE;

        sound.playLaunch(clampedPull / DRAG_MAX);
        this.hitCount = 0;
        this.hitPulse = 0.4;
        this.hitTimer = 1.0;
        this.hitAlpha = 1.0;
        this.comboTeamColor = ball.color || COLORS.P_COL;
        ball.launch(pvx, pvy);
        this.shake = 4;
        this.state = 'ROLLING';
        this.emitLog(`🚀 Fired peg ${ball.label}!`);
      }
    }

    try {
      this.canvas.releasePointerCapture(e.pointerId);
    } catch {
      // Ignored if already released
    }

    this.activePointerId = null;
    this.dragStart = null;
    this.aimPt = null;
  }

  onPointerCancel(e) {
    this.activePointerId = null;
    this.dragStart = null;
    this.aimPt = null;
  }

  // ── Physics Substepping (120Hz) ──
  hasRestingOverlaps() {
    const diameter = BALL_R * 2;
    const alive = this.balls.filter(b => b.alive);
    for (let i = 0; i < alive.length; i++) {
      for (let j = i + 1; j < alive.length; j++) {
        if (Math.hypot(alive[i].x - alive[j].x, alive[i].y - alive[j].y) < diameter - 0.5) {
          return true;
        }
      }
    }
    return false;
  }

  gentlySeparateStep() {
    const diameter = BALL_R * 2;
    const alive = this.balls.filter(b => b.alive);
    let maxOverlap = 0;

    for (let i = 0; i < alive.length; i++) {
      for (let j = i + 1; j < alive.length; j++) {
        const b1 = alive[i];
        const b2 = alive[j];
        const dx = b1.x - b2.x;
        const dy = b1.y - b2.y;
        const d = Math.hypot(dx, dy);

        if (d < diameter) {
          const overlap = diameter - d;
          if (overlap > maxOverlap) maxOverlap = overlap;

          const nx = d > 0.001 ? dx / d : (i % 2 === 0 ? 1 : -1);
          const ny = d > 0.001 ? dy / d : 0;

          const push = Math.min(overlap * 0.5, 1.2);
          b1.x += nx * push;
          b1.y += ny * push;
          b2.x -= nx * push;
          b2.y -= ny * push;

          b1.x = Math.max(BALL_R, Math.min(W - BALL_R, b1.x));
          b1.y = Math.max(BALL_R, Math.min(H - BALL_R, b1.y));
          b2.x = Math.max(BALL_R, Math.min(W - BALL_R, b2.x));
          b2.y = Math.max(BALL_R, Math.min(H - BALL_R, b2.y));
        }
      }
    }

    return maxOverlap;
  }

  resolveRestingOverlapsFinal() {
    const diameter = BALL_R * 2;
    const alive = this.balls.filter(b => b.alive);

    for (let iter = 0; iter < 12; iter++) {
      let resolved = false;
      for (let i = 0; i < alive.length; i++) {
        for (let j = i + 1; j < alive.length; j++) {
          const b1 = alive[i];
          const b2 = alive[j];
          const dx = b1.x - b2.x;
          const dy = b1.y - b2.y;
          const d = Math.hypot(dx, dy);

          if (d < diameter) {
            resolved = true;
            const overlap = diameter - d;
            const nx = d > 0.001 ? dx / d : 1;
            const ny = d > 0.001 ? dy / d : 0;
            const nudge = overlap * 0.5;

            b1.x += nx * nudge;
            b1.y += ny * nudge;
            b2.x -= nx * nudge;
            b2.y -= ny * nudge;

            b1.x = Math.max(BALL_R, Math.min(W - BALL_R, b1.x));
            b1.y = Math.max(BALL_R, Math.min(H - BALL_R, b1.y));
            b2.x = Math.max(BALL_R, Math.min(W - BALL_R, b2.x));
            b2.y = Math.max(BALL_R, Math.min(H - BALL_R, b2.y));
          }
        }
      }
      if (!resolved) break;
    }

    for (const b of alive) {
      b.x = Math.max(BALL_R, Math.min(W - BALL_R, b.x));
      b.y = Math.max(BALL_R, Math.min(H - BALL_R, b.y));
    }
  }

  stepPhysics() {
    const movingBalls = this.balls.filter(b => b.moving && b.alive);
    if (movingBalls.length === 0) {
      if (this.state === 'ROLLING') {
        if (this.hasRestingOverlaps()) {
          this.separationTicks = (this.separationTicks || 0) + 1;
          const maxOverlap = this.gentlySeparateStep();

          if (maxOverlap > 0.5 && this.separationTicks < 25) {
            return;
          }
          this.resolveRestingOverlapsFinal();
        }

        this.separationTicks = 0;
        this.sendSnapshot();
        this.advanceTurn();
      }
      return;
    }

    for (const ball of movingBalls) {
      const events = ball.updatePhysics(this.balls);
      for (const ev of events) {
        if (ev.type === 'bounce') {
          sound.playBounce(ev.speed, true);
          this.shake = Math.max(this.shake, Math.min(9, ev.speed * 0.4));
          this.impactRings.push(new ImpactRing(ev.x, ev.y, COLORS.WHITE));
        } else if (ev.type === 'wall') {
          sound.playBounce(ev.speed, false);
          this.shake = Math.max(this.shake, Math.min(6, ev.speed * 0.35));
        } else if (ev.type === 'damage') {
          sound.playDamage();
          this.hitCount++;
          this.hitPulse = 1.0;
          this.hitTimer = 1.0;
          this.hitAlpha = 1.0;
          this.comboTeamColor = ev.attacker.color || this.comboTeamColor;
          this.shake = Math.max(this.shake, 11 + ev.damage * 0.65);
          if (navigator.vibrate) navigator.vibrate([25]);

          // Award 1 gold per point of actual HP lost by enemy pegs
          if (ev.attacker.owner === 1 && ev.defender.owner === 2) {
            const actualHpLoss = ev.hpLost !== undefined ? ev.hpLost : (ev.effectiveDmg !== undefined ? ev.effectiveDmg : Math.min(ev.damage, Math.max(0, ev.defender.hp + ev.damage)));
            this.goldEarned += actualHpLoss;
          }

          this.dmgNums.push(new DmgNum(
            ev.x,
            ev.y - BALL_R - 14,
            ev.damage,
            ev.bonusDamage > 0
          ));
          this.impactRings.push(new ImpactRing(ev.x, ev.y, ev.attacker.color));

          if (ev.bonusDamage > 0) {
            this.emitLog(`⏩ ${ev.attacker.label} consumed FUTURE charge for +${ev.bonusDamage} damage!`);
          }
          if (ev.knockback) {
            this.emitLog(`💨 ${ev.attacker.label} knocked ${ev.defender.label} back!`);
          }
          if (ev.slowedByHard) {
            this.emitLog(`🛡️ ${ev.defender.label} slowed ${ev.attacker.label}!`);
          }

          for (let p = 0; p < 7; p++) {
            this.particles.push(new Particle(ev.x, ev.y, ev.attacker.color));
          }
          for (let p = 0; p < 3; p++) {
            this.particles.push(new Particle(ev.x, ev.y, COLORS.WHITE));
          }

          this.emitLog(`💥 ${ev.attacker.label} hit ${ev.defender.label} for ${ev.damage} dmg!`);
          this.sendSnapshot();
        } else if (ev.type === 'defeat') {
          sound.playDefeat();
          this.shake = Math.max(this.shake, 20);
          if (navigator.vibrate) navigator.vibrate([40, 20, 60]);

          for (let s = 0; s < 22; s++) {
            this.particles.push(new GlassShard(ev.x, ev.y));
          }
          for (let d = 0; d < 25; d++) {
            this.particles.push(new LiquidDrop(ev.x, ev.y, ev.ball.color));
          }
          this.impactRings.push(new ImpactRing(ev.x, ev.y, COLORS.WHITE));

          this.emitLog(`💀 ${ev.ball.label} was shattered and eliminated!`);
          this.sendSnapshot();
        }
      }
    }
  }

  getActiveAimPowerPct() {
    if (this.state === 'PLAYER_AIM' && this.dragStart && this.aimPt) {
      const dx = this.aimPt.x - this.dragStart.x;
      const dy = this.aimPt.y - this.dragStart.y;
      return Math.max(0.08, Math.min(1.0, Math.hypot(dx, dy) / DRAG_MAX));
    }
    if (this.aiAimPreview && this.aiAimPreview.power) {
      return Math.max(0.08, Math.min(1.0, this.aiAimPreview.power / DRAG_MAX));
    }
    return 1.0;
  }

  // ── Render & Game Loop ──
  loop(now) {
    if (!this.running) return;

    const delta = Math.min((now - this.lastTime) / 1000, 0.1);
    this.lastTime = now;
    this.accumulator += delta;

    // Advance aiming arrow glow pulse:
    // Keeps current speed (8.0 cycles/sec) at 100% power, slows down proportionally at lower power
    const aimPowerPct = this.getActiveAimPowerPct();
    this.aimPulseProgress = (this.aimPulseProgress + delta * 8.0 * aimPowerPct) % 1000.0;

    while (this.accumulator >= this.fixedDt) {
      this.stepPhysics();
      this.accumulator -= this.fixedDt;
    }

    for (const d of this.dmgNums) d.update();
    this.dmgNums = this.dmgNums.filter(d => d.life > 0);

    for (const p of this.particles) p.update();
    this.particles = this.particles.filter(p => p.life > 0);

    for (const r of this.impactRings) r.update();
    this.impactRings = this.impactRings.filter(r => r.life > 0);

    for (const b of this.balls) {
      if (b.alive) b.updateWave();
    }

    if (this.hitPulse > 0) {
      this.hitPulse *= 0.91;
      if (this.hitPulse < 0.01) this.hitPulse = 0;
    }

    // Manage 1-second combo display timer and smooth fade-out
    if (this.hitTimer > 0) {
      this.hitTimer -= delta;
      if (this.hitTimer < 0) this.hitTimer = 0;
    } else if (this.hitAlpha > 0) {
      this.hitAlpha -= delta * 2.5; // Smoothly fades out over ~0.4s
      if (this.hitAlpha < 0) this.hitAlpha = 0;
    }

    this.render();
    requestAnimationFrame(this.loop);
  }

  render() {
    const ctx = this.ctx;
    ctx.save();
    ctx.clearRect(0, 0, W, H);

    // ── Screen Shake Transform ──
    if (this.shake > 0) {
      const sx = (Math.random() - 0.5) * this.shake;
      const sy = (Math.random() - 0.5) * this.shake;
      ctx.translate(sx, sy);
      this.shake *= 0.85;
      if (this.shake < 0.2) this.shake = 0;
    }

    // 1. Background Gradient (NOXCAT Deep Obsidian)
    const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
    bgGrad.addColorStop(0, COLORS.BG1);
    bgGrad.addColorStop(1, COLORS.BG2);
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);

    // 2. Subtle arena grid accents (without central dividing line)
    ctx.save();
    ctx.strokeStyle = 'rgba(23, 35, 49, 0.35)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 12]);
    for (let gy = 100; gy < H; gy += 100) {
      if (gy === H / 2) continue;
      ctx.beginPath();
      ctx.moveTo(0, gy);
      ctx.lineTo(W, gy);
      ctx.stroke();
    }
    ctx.restore();

    // ── Solid Dark Gray Arena Hit Counter (Floor layer for < 3 hits) ──
    if (this.hitAlpha > 0 && this.hitCount < 3) {
      const scale = 1.0 + (this.hitPulse || 0) * 0.10;
      this.drawComboMeter(ctx, this.hitCount, this.comboTeamColor, this.hitAlpha, scale);
    }

    // 3. Draw Balls (Circular Glass Capsules with Sloshing Liquid)
    const active = this.activeBall;
    for (const ball of this.balls) {
      if (ball.alive) {
        ball.draw(ctx, ball === active);
      }
    }

    // 4. Slingshot Aiming Visuals for Player (Monster Strike Phantom Arrow) - Layered on top of balls
    if (this.state === 'PLAYER_AIM' && this.dragStart && this.aimPt && this.activeBall) {
      this.drawSlingshot(ctx, this.dragStart, this.aimPt);
    }

    // 5. AI Aim Preview - Layered on top of balls
    if (this.aiAimPreview) {
      this.drawAiAimPreview(ctx, this.aiAimPreview);
    }

    // 6. Impact Rings (Shockwaves)
    for (const r of this.impactRings) r.draw(ctx);

    // 7. Particles & Shards
    for (const p of this.particles) p.draw(ctx);

    // 8. Floating Damage Numbers
    for (const d of this.dmgNums) d.draw(ctx);

    // 9. Floating Combo Meter (Floats on top of the entire battlefield when exceeding 3 hits)
    if (this.hitAlpha > 0 && this.hitCount >= 3) {
      const scale = 1.0 + (this.hitPulse || 0) * 0.10;
      this.drawComboMeter(ctx, this.hitCount, this.comboTeamColor, this.hitAlpha, scale);
    }

    ctx.restore();
  }

  // ── Unified Combo Meter Drawing (Used for both background floor & top-layer clone) ──
  drawComboMeter(ctx, count, teamColor, alpha, scale = 1.0) {
    if (alpha <= 0) return;

    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));

    const cx = W / 2;
    const cy = 385;

    ctx.translate(cx, cy);
    ctx.scale(scale, scale);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const currentTeamColor = teamColor || COLORS.P_COL;

    // Base interior fill: solid dark gray
    ctx.fillStyle = '#2d3947';

    const numFont = 'italic 900 200px "Chakra Petch", "Oxanium", Arial, sans-serif';
    const labelFont = 'italic 900 46px "Chakra Petch", "Oxanium", Arial, sans-serif';
    const word = count <= 1 ? 'HIT' : 'HITS';
    const labelText = ('letterSpacing' in ctx) ? word : word.split('').join(' ');

    // 1. Large Hit Number (Enlarged to 200px, matching HP font style)
    ctx.font = numFont;

    if (count >= 5) {
      // Brighter border for 5+ hits: adds +4 lineWidth per extra combo over 5
      const extraLineWidth = (count - 5) * 4;
      const strokeW = Math.min(60, 9 + extraLineWidth);
      const innerStrokeW = Math.min(26, 4 + Math.floor(extraLineWidth * 0.4));
      const glowBlur = Math.min(70, 32 + (count - 5) * 3);

      ctx.save();
      ctx.strokeStyle = currentTeamColor;
      ctx.lineWidth = strokeW;
      ctx.lineJoin = 'miter';
      ctx.miterLimit = 3;
      ctx.shadowColor = currentTeamColor;
      ctx.shadowBlur = glowBlur;
      ctx.strokeText(`${count}`, 0, -45);
      ctx.lineWidth = innerStrokeW;
      ctx.shadowBlur = Math.floor(glowBlur * 0.5);
      ctx.strokeText(`${count}`, 0, -45);
      ctx.restore();
      ctx.fillText(`${count}`, 0, -45);
    } else if (count === 4) {
      // Combo 4 gets 1 extra width (5 + 1 = 6)
      ctx.save();
      ctx.strokeStyle = currentTeamColor;
      ctx.lineWidth = 6;
      ctx.lineJoin = 'miter';
      ctx.miterLimit = 3;
      ctx.shadowColor = currentTeamColor;
      ctx.shadowBlur = 18;
      ctx.strokeText(`${count}`, 0, -45);
      ctx.restore();
      ctx.fillText(`${count}`, 0, -45);
    } else if (count >= 3) {
      // Soft glowing border of respective team color for 3 hits (lineWidth = 5)
      ctx.save();
      ctx.strokeStyle = currentTeamColor;
      ctx.lineWidth = 5;
      ctx.lineJoin = 'miter';
      ctx.miterLimit = 3;
      ctx.shadowColor = currentTeamColor;
      ctx.shadowBlur = 14;
      ctx.strokeText(`${count}`, 0, -45);
      ctx.restore();
      ctx.fillText(`${count}`, 0, -45);
    } else {
      // Pure solid dark gray (< 3 hits)
      ctx.fillText(`${count}`, 0, -45);
    }

    // 2. 'HITS' Sub-label
    ctx.font = labelFont;
    if ('letterSpacing' in ctx) {
      ctx.letterSpacing = '12px';
    }

    if (count >= 5) {
      const extraLabelW = (count - 5) * 1.5;
      ctx.save();
      ctx.strokeStyle = currentTeamColor;
      ctx.lineWidth = Math.min(18, 4 + extraLabelW);
      ctx.shadowColor = currentTeamColor;
      ctx.shadowBlur = Math.min(42, 24 + (count - 5) * 2);
      ctx.strokeText(labelText, 0, 75);
      ctx.restore();
      ctx.fillText(labelText, 0, 75);
    } else if (count === 4) {
      ctx.save();
      ctx.strokeStyle = currentTeamColor;
      ctx.lineWidth = 3.5;
      ctx.shadowColor = currentTeamColor;
      ctx.shadowBlur = 15;
      ctx.strokeText(labelText, 0, 75);
      ctx.restore();
      ctx.fillText(labelText, 0, 75);
    } else if (count >= 3) {
      ctx.save();
      ctx.strokeStyle = currentTeamColor;
      ctx.lineWidth = 2.5;
      ctx.shadowColor = currentTeamColor;
      ctx.shadowBlur = 12;
      ctx.strokeText(labelText, 0, 75);
      ctx.restore();
      ctx.fillText(labelText, 0, 75);
    } else {
      ctx.fillText(labelText, 0, 75);
    }

    ctx.restore();
  }

  // ── Monster Strike Style Ghosted Phantom Arrow (Unified for Player & AI) ──
  drawAimArrow(ctx, startX, startY, nx, ny, pull, color, glowColor, tetherPt = null) {
    const px = -ny;
    const py = nx;
    const pct = Math.max(0.08, Math.min(1.0, pull / DRAG_MAX));

    ctx.save();

    // 1. Subtle tether line to finger (player only)
    if (tetherPt) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.lineTo(tetherPt.x, tetherPt.y);
      ctx.stroke();
    }

    // 2. Trailing Ghosted Phantom Arrow Silhouettes along the trajectory
    const arrowLength = BALL_R + pull * 1.35;
    const numGhosts = Math.max(3, Math.min(7, Math.floor(pull / 22)));
    const animPulse = this.aimPulseProgress % 1.0;

    for (let i = 1; i <= numGhosts; i++) {
      const t = i / numGhosts;
      const gx = startX + nx * (BALL_R * 0.8 + t * (arrowLength - BALL_R * 0.8));
      const gy = startY + ny * (BALL_R * 0.8 + t * (arrowLength - BALL_R * 0.8));

      const wave = Math.sin((t - animPulse) * Math.PI * 2);
      const alpha = Math.max(0.15, Math.min(0.95, t * 0.7 + 0.3 * wave * pct));
      const chevronSize = (10 + t * 14) * (0.85 + 0.2 * pct);

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = color;
      ctx.strokeStyle = COLORS.WHITE;
      ctx.lineWidth = 2;

      // Forward-pointing chevron
      const cTipX = gx + nx * (chevronSize * 0.6);
      const cTipY = gy + ny * (chevronSize * 0.6);
      const cLeftX = gx - nx * (chevronSize * 0.4) + px * (chevronSize * 0.7);
      const cLeftY = gy - ny * (chevronSize * 0.4) + py * (chevronSize * 0.7);
      const cRightX = gx - nx * (chevronSize * 0.4) - px * (chevronSize * 0.7);
      const cRightY = gy - ny * (chevronSize * 0.4) - py * (chevronSize * 0.7);
      const cInnerX = gx;
      const cInnerY = gy;

      ctx.beginPath();
      ctx.moveTo(cTipX, cTipY);
      ctx.lineTo(cLeftX, cLeftY);
      ctx.lineTo(cInnerX, cInnerY);
      ctx.lineTo(cRightX, cRightY);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.restore();
    }

    // 3. Glowing Phantom Arrowhead at the tip
    const tipX = startX + nx * arrowLength;
    const tipY = startY + ny * arrowLength;
    const headSize = 18 + pct * 6;

    ctx.save();
    // Tip glow pulse (cycle speed scales with current power)
    const glowPulse = 1.0 + 0.25 * Math.sin(this.aimPulseProgress * Math.PI * 2);
    const tipGlow = ctx.createRadialGradient(tipX, tipY, 2, tipX, tipY, headSize * 1.5 * glowPulse);
    tipGlow.addColorStop(0, glowColor);
    tipGlow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = tipGlow;
    ctx.beginPath();
    ctx.arc(tipX, tipY, headSize * 1.5 * glowPulse, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = COLORS.WHITE;
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(tipX + nx * (headSize * 0.8), tipY + ny * (headSize * 0.8));
    ctx.lineTo(tipX - nx * (headSize * 0.6) + px * headSize, tipY - ny * (headSize * 0.6) + py * headSize);
    ctx.lineTo(tipX - nx * (headSize * 0.3), tipY - ny * (headSize * 0.3));
    ctx.lineTo(tipX - nx * (headSize * 0.6) - px * headSize, tipY - ny * (headSize * 0.6) - py * headSize);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    ctx.restore();
  }

  drawSlingshot(ctx, start, current) {
    const dx = current.x - start.x;
    const dy = current.y - start.y;
    const pull = Math.min(Math.hypot(dx, dy), DRAG_MAX);
    const n = Math.hypot(dx, dy) || 1;

    // Launch trajectory direction (forward, opposite of drag)
    const nx = -(dx / n);
    const ny = -(dy / n);

    this.drawAimArrow(
      ctx,
      start.x, start.y,
      nx, ny,
      pull,
      COLORS.P_COL,
      COLORS.P_COL_GLOW,
      current
    );
  }

  drawAiAimPreview(ctx, preview) {
    const nx = Math.cos(preview.theta);
    const ny = Math.sin(preview.theta);
    const pull = Math.min(preview.power || DRAG_MAX, DRAG_MAX);

    this.drawAimArrow(
      ctx,
      preview.ox, preview.oy,
      nx, ny,
      pull,
      COLORS.A_COL,
      COLORS.A_COL_GLOW,
      null
    );
  }

  destroy() {
    this.running = false;
    if (this.aiTimer) clearTimeout(this.aiTimer);

    window.removeEventListener('resize', this.handleResize);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);

    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerup', this.onPointerUp);
    this.canvas.removeEventListener('pointercancel', this.onPointerCancel);
  }
}
