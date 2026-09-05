# Frontend Architecture & System Documentation

## Overview

This project is a mobile-first, single-screen slingshot peg battle game inspired by **Monster Strike** and styled with the **NOXCAT Wallet** cyber aesthetic (Obsidian Black, Neon Lime Green, Cyber Crimson, and Crisp White).

It adapts the original turn-based marble battle physics into a responsive web application running on **React + HTML5 Canvas**, maintaining strict state decoupling between React UI and the high-performance physics loop.

---

## Architecture: React vs. Canvas Engine

A core design principle is the strict separation between high-frequency physics execution and low-frequency UI rendering:

```text
React App (App Shell & View Routing)
├── AuthModal (Google Identity Services + Game ID Setup)
├── LobbyView (Pilot Dashboard, Online Status, CallSign Editor, Start Game)
└── GameView (Battle Arena & HUD)
    ├── Main Phone Container (Aspect Ratio Guard)
    ├── Floating Boss HP Bar (Top, controlled via SHOW_BOSS_BAR)
    ├── Interactive Canvas Mount (<canvas>)
    ├── Bottom Initiative Console
    │   ├── Left-to-Right Character Queue (Leftmost = Active "GO!")
    │   │   ├── Liquid Fill Ring Avatar
    │   │   ├── Individual Mini HP Bar
    │   │   └── Numeric HP Indicator
    │   └── Utility Toolbar (Round, Info, Mute, Restart)
    └── Game Over & Rules Modals

Canvas Game Engine (High-Frequency 60/120 FPS Loop)
├── GameLoop (Fixed dt Accumulator & Substepping)
├── Physics & Overlap Separation (Wall & Ball-to-Ball Elastic Collisions)
├── Input Handler (Pointer Events, Reverse-Pull Slingshot)
├── Aim Visualizer (Monster Strike Ghosted Chevron Arrow)
├── Liquid Ring Dynamics (Impact Undulation & Exponential Stasis Decay)
├── Particle System (Sparks, Glass Shards, Liquid Droplets, Shockwaves)
└── Sound Synthesizer (Procedural Web Audio API)
```

### Communication & Auth Flow
- **Session Persistence**: 1-day browser cookie (`futuremode_auth`, `max-age=86400`) with localStorage mirror backup.
- **Routing**: `App.jsx` handles state transitions between `'loading'` → `'auth'` → `'lobby'` → `'game'`.
- **React → Engine (Commands)**: `resetGame()`, audio controls (`sound.toggleMute()`).
- **Engine → React (Snapshots & Events)**: Dispatched at turn transitions and damage events (`onSnapshot`, `onGameOver`). React never polls or calculates 60 FPS physics updates.

---

## Screen Layout & UI Components

### 1. Main Playfield & Canvas Calibration
- **Container**: Phone viewport shell constrained to `max-w-[480px]` with aspect ratio `550 / 800`.
- **Canvas Resolution**: Fixed logical resolution of `550 × 800 px` (`W = 550, H = 800`).
- **Coordinate Mapping**: Drag inputs are dynamically scaled via `canvas.getBoundingClientRect()` so that pointer positions map 1:1 with canvas units regardless of device DPI or screen scaling.

### 2. Boss HP Bar (Top Header)
- **Position**: Located in a dedicated top header outside the battle arena (preventing any canvas overlay).
- **Features**:
  - Displays the combined health pool of the entire enemy fleet (`boss.totalHp / boss.maxTotalHp`).
  - Animated skull badge with gradient health bar (`#ffd000` → `#ff5533` → `#ff2a55`).
  - Controlled by the `SHOW_BOSS_BAR` backdoor variable in `constants.js`.
  - Enemy pegs spawn lower (`y = 175`) to provide ample breathing room beneath the top header.

### 3. Monster Strike Initiative Rack (Bottom)
Located at the bottom of the screen:
- **Left-to-Right Execution**: Pegs take turns sequentially. The **leftmost card is always the currently active mover**.
- **"GO!" Banner**: The active card features an elevated, pulsating `GO!` badge above the card.
- **Centered Squarcle Liquid Cards**:
  - Mini HP bars and numeric text are removed from the queue cards (leaving numeric HP exclusively to the physical pegs on the board).
  - Each peg is represented by a **squarcle** (rounded-2xl frame).
  - An inner squarcle core (`rounded-xl`) is inset with a ~7px border matching the peg's 8px `RING_THICKNESS`.
  - The outer squarcle ring contains an animated liquid wave fill reflecting remaining HP (`hp / maxHp`).
  - Centered monospace character label (`1a`, `2b`) inside the inner core.
- **Queue Rotation**: Once a peg finishes its move and settles, it shifts to the back of the alive queue. Eliminated pegs (`HP <= 0`) are removed.

### 4. Utility Toolbar
Directly beneath the character cards:
- **Round Indicator**: Current battle round (e.g., `BATTLE R1`).
- **Rules / Info Modal Toggle**: Explains turn sequencing and damage formulas.
- **Audio Mute/Unmute**: Controls the procedural Web Audio synthesizer.
- **Instant Restart**: Resets board positions, regenerates full health, and re-initializes `PLAYER_AIM`.

---

## Combat Attributes & Liquid Health System

### 5 Combat Attributes
Each ball has 5 attributes managed internally (hidden from direct board display to preserve a clean visual aesthetic):
1. `hp`: Current health.
2. `maxHp`: Maximum health pool (default `100`).
3. `atk`: Attack rating (default `10`).
4. `def`: Defense rating (default `2`, Damage = $\max(1, \text{ATK} - \text{DEF})$).
5. `spd`: Velocity multiplier float (default `1.0`), multiplying initial release speed upon launch.

### Piecewise HP Text Color Gradient
The numeric HP on the outer ring dynamically shifts color for both player and enemy pegs based on $\text{hpRatio} = \text{hp} / \text{maxHp}$:
- **60% to 100% HP**: Retains a crisp white / metallic light grey gradient (mapped from the previous 90%–100% parameter range).
- **0% to 60% HP**: Smoothly transitions toward cyber crimson red at low health (mapped from the previous 0%–90% range).
- At 0% HP, the peg shatters into glass and liquid particles.

### Impact Wave Undulation
The outer liquid ring fills from the bottom up to reflect current HP:
1. **At Rest**: Liquid surface remains flat and horizontal.
2. **On Impact**: Wall collisions, peg-to-peg bounces, and taking damage trigger `triggerWave(amplitude)`.
3. **Stacking**: Taking damage or colliding while already vibrating stacks the wave amplitude.
4. **Stasis Decay**: In every frame, `updateWave()` advances the wave phase and decays amplitude (`waveAmp *= 0.972`). When `waveAmp < 0.04`, the liquid returns to complete stasis.

### Defeat & Shatter Effect
When a peg reaches 0 HP:
- Defeat sound effect plays (noise burst + downward FM pitch sweep).
- Heavy screen shake (`shake = 20`).
- Explodes into `GlassShard` debris and colored `LiquidDrop` particles that spray outwards and fade.

---

## Slingshot Mechanics & Visuals

- **Player Slingshot (Neon Green)**:
  - Reverse pull (drag backwards to launch forwards).
  - Trailing ghosted chevron arrowheads pointing forward with finger tether line.
  - Arrow length dynamically scales with pull distance (`BALL_R + pull * 1.35`).
- **Enemy AI Aiming (Cyber Crimson Red)**:
  - During AI turn planning, displays the same Monster Strike phantom chevron arrow in red (`#ff2a55`), pointing directly at the intended target.
  - Length scales dynamically with the enemy's calculated launch power.
- **Power-Modulated Glow Cycle Rate**:
  - The animated wave of light pulsing through the chevrons runs at full speed (8.0 cycles/sec) at **100% power**.
  - At lower power, the pulse speed decelerates proportionally ($\text{speed} = 8.0 \times \text{powerPct}$), giving an intuitive tactile sensation of low charge vs. full-power charge.

---

## Visual Design & Color Palette

Adheres to the **NOXCAT Wallet** dark tech theme:

| Element | Hex Color | Purpose |
|---|---|---|
| Background 1 | `#05070a` | Deep obsidian canvas background |
| Background 2 | `#090e15` | Playfield gradient baseline |
| Player Peg / Team 1 | `#00ff66` | Neon electric lime green |
| Player Glow | `rgba(0, 255, 102, 0.4)` | Active peg neon halo |
| AI / Team 2 | `#ff2a55` | Cyber crimson red |
| AI Glow | `rgba(255, 42, 85, 0.4)` | AI target aura |
| Borders & Dividers | `#172331` / `#1f3144` | High-tech panel framing |
| Neutral Text | `#ffffff` / `#94a3b8` | Crisp monospace labels & secondary stats |

---

## Audio Engine (`src/game/audio.js`)

Zero external audio assets required. Fully synthesized using the **Web Audio API**:
- **Wall Bounce**: High-frequency sine pip with fast exponential gain decay.
- **Ball Collision**: Dual-tone sine impact with pitch modulation based on collision speed.
- **Damage Hit**: Low-frequency triangle wave thud mixed with high-passed noise.
- **Defeat Shatter**: White noise burst with randomized decay + downward sweeping oscillator.

---

## Configuration & Backdoor Settings

All core game variables are centralized in [`src/game/constants.js`](file:///c:/Users/white/Desktop/hackathon/src/game/constants.js):

```javascript
export const TEAM_SIZE = 3;       // Change team size (e.g. 2, 3, 4) without altering UI
export const SHOW_BOSS_BAR = true; // Backdoor toggle for the floating boss HP bar
export const DEFAULT_HP = 100;     // Starting health per peg
export const DEFAULT_ATK = 10;     // Attack power
export const DEFAULT_DEF = 2;      // Defense stat (Damage = max(1, ATK - DEF) = 8)
export const BALL_R = 42;          // Outer ball hitbox radius
export const INNER_R = 34;         // Inner core radius
export const RING_THICKNESS = 8;   // Outer liquid ring thickness
```

---

## Deployment to Zeabur

Production deployment is targeted for **[Zeabur](https://zeabur.com)**. For build specs, environment variables (`VITE_GOOGLE_CLIENT_ID`), and OAuth domain whitelisting, refer to:
👉 **[`ZEABUR_DEPLOYMENT.md`](file:///c:/Users/white/Desktop/hackathon/ZEABUR_DEPLOYMENT.md)**

---

## Running and Building

### Development Server
```bash
npm run dev
```

### Production Build
```bash
npm run build
```
Verify output in `dist/` with zero bundle or linter errors.
