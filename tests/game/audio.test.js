import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MUSIC_TRACKS, sound } from '../../src/game/audio.js';

describe('music playback', () => {
  let audioInstances;

  beforeEach(() => {
    audioInstances = [];
    sound.stopMusic();
    sound.muted = false;

    vi.stubGlobal('Audio', class MockAudio {
      constructor(src) {
        this.src = src;
        this.loop = false;
        this.currentTime = 0;
        this.pause = vi.fn();
        this.play = vi.fn(() => Promise.resolve());
        this.load = vi.fn();
        this.removeAttribute = vi.fn();
        audioInstances.push(this);
      }
    });
  });

  afterEach(() => {
    sound.stopMusic();
    sound.muted = false;
    vi.unstubAllGlobals();
  });

  it.each([
    ['base', true],
    ['battle', true],
    ['victory', true],
    ['defeat', false],
  ])('configures %s music with loop=%s', (key, shouldLoop) => {
    sound.playMusic(key);

    const music = audioInstances.at(-1);
    expect(music.src).toBe(MUSIC_TRACKS[key].src);
    expect(music.loop).toBe(shouldLoop);
    expect(music.play).toHaveBeenCalledOnce();
  });

  it('pauses the previous track when the scene changes', () => {
    sound.playMusic('base');
    const base = audioInstances.at(-1);

    sound.playMusic('battle');

    expect(base.pause).toHaveBeenCalledOnce();
    expect(base.currentTime).toBe(0);
    expect(base.removeAttribute).toHaveBeenCalledWith('src');
    expect(base.load).toHaveBeenCalledOnce();
    expect(audioInstances.at(-1).src).toBe(MUSIC_TRACKS.battle.src);
  });

  it('uses the shared mute state for music and sound effects', () => {
    sound.playMusic('battle');
    const battle = audioInstances.at(-1);

    expect(sound.toggleMute()).toBe(true);
    expect(battle.pause).toHaveBeenCalledOnce();

    expect(sound.toggleMute()).toBe(false);
    expect(battle.play).toHaveBeenCalledTimes(2);
  });
});
