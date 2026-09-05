/**
 * Game constants for Peg Marble Battle (Mobile Portrait 550x800)
 */

// ── BACKDOOR VARIABLE: Change team size here without affecting UI ──
// Easily change to 1, 2, 3, 4, 5, etc. to test different team sizes
export const TEAM_SIZE = 3;

// ── BACKDOOR VARIABLES: Top Health Bar Settings ──
export const SHOW_TOP_BAR = true;       // Show or hide top health bar
export const SHOW_BOSS_BAR = true;      // Backward compatible alias
export const TOP_BAR_MODE = 'fleet';    // 'boss' | 'fleet'
export const BOSS_TARGET_ID = '2a';     // Target unit in 'boss' mode (e.g. '2a', '2b', '2c')
export const BOSS_DISPLAY_NAME = 'VOID GOLIATH'; // Custom boss title text
export const FLEET_DISPLAY_NAME = 'ENEMY FLEET'; // Custom fleet title text

// ── BACKDOOR VARIABLE: Enemy Agent Inaccuracy ──
// Default 10: rolls ±deg on aim direction, and (100% - inacc% + rand(-inacc, inacc)%) of max power
export const ENEMY_AGENT_INACCURACY = 10;

// ── Arena Dimensions (Portrait 90° CCW rotated) ──
export const W = 550;
export const H = 800;

// ── Ball & Stat Settings (5 combat attributes: hp/maxHp, atk, def, spd) ──
export const INNER_R = 34;         // Radius of inner dark core (original ball size)
export const RING_THICKNESS = 8;   // Edge thickness (x0.8)
export const BALL_R = INNER_R + RING_THICKNESS; // 42 total outer collision radius
export const BALL_MAX_HP = 100;
export const DEFAULT_HP = 100;
export const DEFAULT_ATK = 10;
export const DEFAULT_DEF = 2;
export const DEFAULT_SPD = 1.0;    // Speed multiplier on ball release

// ── Spawn Y Coordinates (both exactly 140px indent from their edges) ──
export const ENEMY_START_Y = 140;  // 140px from top edge (0 + 140)
export const PLAYER_START_Y = 660; // 140px from bottom edge (800 - 140)

// ── Slingshot & Physics (from game_v2.py) ──
export const DRAG_MAX = 160;       // Max pull distance
export const SPEED_SCALE = 0.22;   // Speed multiplier from pull
export const DAMP = 0.988;         // Friction damping per physics step
export const BOUNCE_DAMP = 0.82;   // Velocity restitution on walls/collisions
export const MIN_SPD = 0.6;        // Stop threshold
export const PHYSICS_HERTZ = 120;  // Substep physics loop (120Hz for zero tunneling)
export const MAX_SIM_STEPS = 3000; // Cap for AI evaluation

// ── NOXCAT Color Palette (Black + Neon Green + Crisp White) ──
export const COLORS = {
  BG1: '#05070a',         // Deep obsidian black
  BG2: '#0b1118',         // Cyber tech charcoal
  P_COL: '#00ff66',       // NOXCAT Electric Neon Green (Player)
  P_COL_GLOW: 'rgba(0, 255, 102, 0.5)',
  P_COL_DARK: '#008f39',  // Dark green shade for liquid depth
  A_COL: '#ff2a55',       // Cyber Crimson (AI)
  A_COL_GLOW: 'rgba(255, 42, 85, 0.5)',
  A_COL_DARK: '#99112e',  // Dark crimson shade
  WHITE: '#ffffff',       // Pure crisp white
  GREY: '#8a9ba8',        // Metallic cool silver
  GOLD: '#ffd000',        // Cyber gold
  DARK: '#0d151f',        // Dark card background
  DIVIDER: '#172331',     // Subtle grid/divider lines
  BORDER: '#1f3144',      // Container rim
};

