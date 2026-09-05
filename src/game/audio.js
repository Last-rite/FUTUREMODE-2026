import baseMusicUrl from '../../assets/base.mp3';
import battleMusicUrl from '../../assets/battle.mp3';
import victoryMusicUrl from '../../assets/Victory.mp3';
import defeatMusicUrl from '../../assets/Dead.mp3';

export const MUSIC_TRACKS = Object.freeze({
  base: { src: baseMusicUrl, loop: true },
  battle: { src: battleMusicUrl, loop: true },
  victory: { src: victoryMusicUrl, loop: true },
  defeat: { src: defeatMusicUrl, loop: false },
});

/**
 * Shared audio engine for procedural sound effects and streamed music assets.
 */

class SoundEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.music = null;
    this.musicKey = null;
    this.desiredMusicKey = null;
    this.unlockHandler = null;
  }

  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.muted) {
      this.music?.pause();
    } else {
      this.resumeMusic();
    }
    return this.muted;
  }

  playMusic(key, { restart = false } = {}) {
    const track = MUSIC_TRACKS[key];
    if (!track) return;

    this.desiredMusicKey = key;
    if (this.muted || typeof Audio === 'undefined') return;

    if (this.musicKey === key && this.music) {
      if (restart) this.music.currentTime = 0;
      this.tryPlayMusic(this.music);
      return;
    }

    this.releaseMusicElement(this.music);

    const music = new Audio(track.src);
    music.loop = track.loop;
    music.preload = 'auto';
    music.volume = 0.34;

    this.music = music;
    this.musicKey = key;
    this.tryPlayMusic(music);
  }

  resumeMusic() {
    if (!this.desiredMusicKey) return;
    if (this.musicKey !== this.desiredMusicKey || !this.music) {
      this.playMusic(this.desiredMusicKey);
      return;
    }
    this.tryPlayMusic(this.music);
  }

  tryPlayMusic(music) {
    if (this.muted || !music || music !== this.music) return;

    try {
      const playResult = music.play();
      if (playResult?.catch) {
        playResult.catch(() => {
          if (music === this.music) this.waitForInteraction();
        });
      }
    } catch {
      if (music === this.music) this.waitForInteraction();
    }
  }

  releaseMusicElement(music) {
    if (!music) return;
    music.pause();
    music.currentTime = 0;

    // Fully release the previous media resource so a stale/HMR-created player
    // cannot continue a buffered looping track in the background.
    if (typeof music.removeAttribute === 'function') {
      music.removeAttribute('src');
      if (typeof music.load === 'function') music.load();
    }
  }

  waitForInteraction() {
    if (this.unlockHandler || typeof document === 'undefined') return;

    this.unlockHandler = () => {
      document.removeEventListener('pointerdown', this.unlockHandler, true);
      document.removeEventListener('keydown', this.unlockHandler, true);
      this.unlockHandler = null;
      this.init();
      this.resumeMusic();
    };

    document.addEventListener('pointerdown', this.unlockHandler, true);
    document.addEventListener('keydown', this.unlockHandler, true);
  }

  stopMusic() {
    this.releaseMusicElement(this.music);
    this.music = null;
    this.musicKey = null;
    this.desiredMusicKey = null;
    if (this.unlockHandler && typeof document !== 'undefined') {
      document.removeEventListener('pointerdown', this.unlockHandler, true);
      document.removeEventListener('keydown', this.unlockHandler, true);
      this.unlockHandler = null;
    }
  }

  // Slingshot launch whoosh
  playLaunch(powerPct = 1.0) {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    const now = this.ctx.currentTime;
    const startFreq = 180 + powerPct * 120;
    const endFreq = 480 + powerPct * 260;

    osc.frequency.setValueAtTime(startFreq, now);
    osc.frequency.exponentialRampToValueAtTime(endFreq, now + 0.12);

    gain.gain.setValueAtTime(0.3 * powerPct, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.16);
  }

  // Marble clack or wall bounce
  playBounce(spd = 5, isBall = false) {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    const intensity = Math.min(1.0, spd / 15);
    const duration = isBall ? 0.08 : 0.06;

    if (isBall) {
      // Marble ceramic clack
      osc.type = 'sine';
      osc.frequency.setValueAtTime(650 + Math.random() * 200, now);
      osc.frequency.exponentialRampToValueAtTime(320, now + duration);
      gain.gain.setValueAtTime(0.4 * intensity, now);
    } else {
      // Wall thud
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.exponentialRampToValueAtTime(80, now + duration);
      gain.gain.setValueAtTime(0.25 * intensity, now);
    }

    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + duration + 0.01);
  }

  // Damage impact
  playDamage() {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'square';
    osc.frequency.setValueAtTime(350, now);
    osc.frequency.exponentialRampToValueAtTime(120, now + 0.09);

    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.11);
  }

  // Glass orb shatter & liquid burst upon defeat
  playDefeat() {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;

    // 1. High glass break tinkles
    [1200, 1850, 2400].forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq + Math.random() * 200, now + i * 0.02);
      osc.frequency.exponentialRampToValueAtTime(300, now + 0.18 + i * 0.02);

      gain.gain.setValueAtTime(0.2, now + i * 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2 + i * 0.02);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now + i * 0.02);
      osc.stop(now + 0.25 + i * 0.02);
    });

    // 2. Heavy liquid crash rumble
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(260, now);
    osc.frequency.exponentialRampToValueAtTime(45, now + 0.38);

    gain.gain.setValueAtTime(0.4, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.42);
  }

  // Victory fanfare
  playVictory() {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;

    const notes = [440, 554.37, 659.25, 880]; // A major
    notes.forEach((freq, idx) => {
      const now = this.ctx.currentTime + idx * 0.12;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now);

      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.4);
    });
  }
}

export const sound = new SoundEngine();

if (import.meta.hot) {
  import.meta.hot.dispose(() => sound.stopMusic());
}
