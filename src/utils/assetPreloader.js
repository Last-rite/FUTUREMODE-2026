/**
 * Background Asset Preloader
 * Preloads and decodes game images (character sprites, weapon icons, level backgrounds, SVGs)
 * during idle moments (e.g. login/auth screen) to eliminate stutters when opening detailed views.
 */

import nxc1_64 from '../assets/nxc_1.png';
import nxc1_128 from '../assets/nxc_1_128.png';
import nxc2_64 from '../assets/nxc_2.png';
import nxc2_128 from '../assets/nxc_2_128.png';
import nxc3_64 from '../assets/nxc_3.png';
import nxc3_128 from '../assets/nxc_3_128.png';
import nxc4_64 from '../assets/nxc_4.png';
import nxc4_128 from '../assets/nxc_4_128.png';

import sword128 from '../assets/sword_128.png';
import shield128 from '../assets/shield_128.png';
import noxgem128 from '../assets/noxgem_128.png';

import doggo64 from '../assets/enemy_doggo_64.png';
import doggo128 from '../assets/enemy_doggo_128.png';
import pig64 from '../assets/enemy_pig_64.png';
import pig128 from '../assets/enemy_pig_128.png';

import levelCity from '../assets/level_city.png';

// High-priority core assets needed immediately upon login
export const CORE_STATIC_ASSETS = [
  // Cats (64px & 128px for detail hero view)
  nxc1_128,
  nxc2_128,
  nxc3_128,
  nxc4_128,
  nxc1_64,
  nxc2_64,
  nxc3_64,
  nxc4_64,
  // Equipments (128px)
  sword128,
  shield128,
  noxgem128,
  // Large backgrounds
  levelCity,
  // Public icons
  '/noxpawble-logo.svg',
  '/noxpawble-mark.svg',
  // Enemies
  doggo64,
  doggo128,
  pig64,
  pig128,
];

const imageCache = new Map();
let hasStartedBackgroundPreload = false;

/**
 * Preload and decode a single image.
 * Uses Image.prototype.decode() for asynchronous off-thread decoding.
 */
export function preloadImage(src) {
  if (!src || typeof window === 'undefined') return Promise.resolve(null);
  if (imageCache.has(src)) return imageCache.get(src);

  const promise = new Promise((resolve) => {
    const img = new Image();
    img.src = src;

    if (typeof img.decode === 'function') {
      img.decode()
        .then(() => resolve(img))
        .catch(() => {
          // Fallback if decode fails (e.g. SVG or format issues)
          img.onload = () => resolve(img);
          img.onerror = () => resolve(null);
        });
    } else {
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
    }
  });

  imageCache.set(src, promise);
  return promise;
}

/**
 * Incrementally preloads a list of images during browser idle periods.
 * This ensures that preloading does not compete with user typing or animations.
 */
export function preloadImagesGradually(images, batchSize = 2, delayMs = 60) {
  if (!Array.isArray(images) || images.length === 0) return;

  const queue = [...images];

  function processNextBatch() {
    if (queue.length === 0) return;

    const batch = queue.splice(0, batchSize);
    batch.forEach((src) => {
      preloadImage(src);
    });

    if (queue.length > 0) {
      if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
        window.requestIdleCallback(
          () => {
            setTimeout(processNextBatch, delayMs);
          },
          { timeout: 500 }
        );
      } else {
        setTimeout(processNextBatch, delayMs);
      }
    }
  }

  if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
    window.requestIdleCallback(() => processNextBatch(), { timeout: 300 });
  } else {
    setTimeout(processNextBatch, 50);
  }
}

/**
 * Starts the global background preloader starting from the auth/boot screen.
 */
export function startBackgroundPreload() {
  if (hasStartedBackgroundPreload) return;
  hasStartedBackgroundPreload = true;

  preloadImagesGradually(CORE_STATIC_ASSETS, 2, 80);
}

/**
 * Preload any dynamic URLs found in player gameData (e.g. custom avatars or dungeon art)
 */
export function preloadGameDataAssets(gameData) {
  if (!gameData) return;
  const urls = [];

  if (Array.isArray(gameData.pets)) {
    gameData.pets.forEach((p) => {
      if (p.avatar) urls.push(p.avatar);
      if (p.image) urls.push(p.image);
    });
  }

  if (Array.isArray(gameData.items)) {
    gameData.items.forEach((i) => {
      if (i.image) urls.push(i.image);
    });
  }

  if (Array.isArray(gameData.dungeons)) {
    gameData.dungeons.forEach((d) => {
      if (d.image) urls.push(d.image);
    });
  }

  if (urls.length > 0) {
    preloadImagesGradually(urls, 2, 60);
  }
}
