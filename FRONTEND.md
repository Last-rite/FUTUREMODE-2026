# Frontend Architecture & System Documentation

## Overview

This project is a mobile-first, single-screen slingshot peg battle game inspired by **Monster Strike** and styled with the **NOXCAT Wallet** cyber aesthetic (Obsidian Black, Neon Lime Green, Cyber Crimson, and Crisp White).

It adapts the original turn-based marble battle physics into a responsive web application running on **React + HTML5 Canvas**, maintaining strict state decoupling between React UI and the high-performance physics loop.

---

## Architecture: React vs. Canvas Engine

A core design principle is the strict separation between high-frequency physics execution and low-frequency UI rendering:

```text
React App (UI Layer & Low-Frequency State)
├── Main Phone Container (Aspect Ratio Guard)
├── Floating Collapsible Boss HP Bar (Top)
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

### Communication Flow
- **React → Engine (Commands)**: `resetGame()`, audio controls (`sound.toggleMute()`).
- **Engine → React (Snapshots & Events)**: Dispatched at turn transitions and damage events (`onSnapshot`, `onGameOver`). React never polls or calculates 60 FPS physics updates.

---

## Screen Layout & UI Components

### 1. Main Playfield & Canvas Calibration
- **Container**: Phone viewport shell constrained to `max-w-[480px]` with aspect ratio `550 / 800`.
- **Canvas Resolution**: Fixed logical resolution of `550 × 800 px` (`W = 550, H = 800`).
- **Coordinate Mapping**: Drag inputs are dynamically scaled via `canvas.getBoundingClientRect()` so that pointer positions map 1:1 with canvas units regardless of device DPI or screen scaling.

### 2. Floating Boss HP Bar (Top)
- **Position**: Anchored to the top of the canvas playfield.
- **Features**:
  - Displays the combined health pool of the entire enemy fleet (`boss.totalHp / boss.maxTotalHp`).
  - Animated skull badge with gradient health bar (`#ffd000` → `#ff5533` → `#ff2a55`).
  - Eye toggle button allowing the player to collapse/expand the bar to prevent obscuring the top playfield.

### 3. Monster Strike Initiative Rack (Bottom)
Located at the bottom of the screen, mirroring the initiative queue design:
- **Left-to-Right Execution**: Pegs take turns sequentially. The **leftmost card is always the currently active mover**.
- **"GO!" Banner**: The active card features an elevated, pulsating `GO!` badge above the card.
- **Card Elements**:
  - **Circular Avatar**: Shows the peg label with outer liquid ring fill percentage.
  - **Mini HP Bar**: Horizontal segmented bar indicating remaining life.
  - **Numeric HP**: Explicit text reading (e.g., `100`, `92`, `0`).
- **Queue Rotation**: Once a peg finishes its move and settles, it shifts to the back of the alive queue. Eliminated pegs (`HP <= 0`) are removed.

### 4. Utility Toolbar
Directly beneath the character cards:
- **Round Indicator**: Current battle round (e.g., `BATTLE R1`).
- **Rules / Info Modal Toggle**: Explains turn sequencing and damage formulas.
- **Audio Mute/Unmute**: Controls the procedural Web Audio synthesizer.
- **Instant Restart**: Resets board positions, regenerates full health, and re-initializes `PLAYER_AIM`.

---

## In-Game Peg & Liquid Health System

### Concentric Ring Design
Each peg is rendered with an inner core and an outer liquid health ring:
- **Outer Ring Radius (`BALL_R`)**: `42px` (total hitbox radius).
- **Inner Core Radius (`INNER_R`)**: `34px` (obsidian dark center).
- **Ring Thickness**: `8px` (`BALL_R - INNER_R`).
- **Center Label & HP**: Monospace, high-contrast labels (`1a`, `2b`) and large font for mobile readability.

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

- **Drag Direction**: Reverse pull (pull backward to launch forward, matching standard slingshot mechanics).
- **Aim Visualizer**:
  - **Monster Strike Phantom Chevrons**: Successive ghosted arrowheads aligned along the trajectory vector.
  - Spacing, scale, and opacity fade create an intuitive path forecast.
  - Clamped to maximum launch velocity (`MAX_DRAG = 140px`, max speed = 25).
  - No circular charge rings cluttering the view.

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
export const DEFAULT_HP = 100;     // Starting health per peg
export const DEFAULT_ATK = 10;     // Attack power
export const DEFAULT_DEF = 2;      // Defense stat (Damage = max(1, ATK - DEF) = 8)
export const BALL_R = 42;          // Outer ball hitbox radius
export const INNER_R = 34;         // Inner core radius
export const RING_THICKNESS = 8;   // Outer liquid ring thickness
```

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
