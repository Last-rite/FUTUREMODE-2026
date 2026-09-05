import nxc1 from '../assets/nxc_1.png';
import nxc2 from '../assets/nxc_2.png';
import nxc3 from '../assets/nxc_3.png';
import enemyDoggo from '../assets/enemy_doggo_64.png';
import enemyPig from '../assets/enemy_pig_64.png';

const imageCache = new Map();

function createImg(src) {
  if (typeof Image === 'undefined') return null;
  const img = new Image();
  img.src = src;
  return img;
}

const PRELOADED = {
  '01': createImg(nxc1),
  '1': createImg(nxc1),
  '02': createImg(nxc2),
  '2': createImg(nxc2),
  '03': createImg(nxc3),
  '3': createImg(nxc3),
  'doggo': createImg(enemyDoggo),
  'pig': createImg(enemyPig),
};

/**
 * Returns an HTMLImageElement for the given Ball, matching its code/name/label
 */
export function getBallImage(ball) {
  if (!ball) return null;

  // 1. Direct image property
  if (ball.image) {
    if (typeof ball.image !== 'string') return ball.image;
    if (!imageCache.has(ball.image)) {
      imageCache.set(ball.image, createImg(ball.image));
    }
    return imageCache.get(ball.image);
  }

  // 2. Player team (owner === 1)
  if (ball.owner === 1) {
    const code = String(ball.code || '').trim();
    if (PRELOADED[code]) return PRELOADED[code];

    if (ball.name?.includes('FUTURE') || ball.idString?.includes('tech')) return PRELOADED['02'];
    if (ball.name?.includes('COOL') || ball.idString?.includes('rush')) return PRELOADED['03'];
    if (ball.name?.includes('NOXCAT') || ball.idString?.includes('core')) return PRELOADED['01'];

    if (ball.label === '1a') return PRELOADED['01'];
    if (ball.label === '1b') return PRELOADED['02'];
    if (ball.label === '1c') return PRELOADED['03'];

    return PRELOADED['01'];
  }

  // 3. Enemy team (owner === 2)
  if (ball.owner === 2) {
    if (ball.label === '2a' || ball.idString?.includes('_a')) return PRELOADED['doggo'];
    if (ball.label === '2b' || ball.idString?.includes('_b')) return PRELOADED['pig'];
    if (ball.label === '2c' || ball.idString?.includes('_c')) return PRELOADED['doggo'];
    return PRELOADED['doggo'];
  }

  return null;
}
