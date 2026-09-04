import { DRAG_MAX } from './constants.js';
import { simulateBoard } from './physics.js';

export class Agent2 {
  constructor(bucketDeg = 15) {
    this.bucketDeg = bucketDeg;
  }

  chooseMove(snapshot, aiLabel) {
    const activeAi = snapshot.balls.find(b => b.label === aiLabel);
    if (!activeAi || !activeAi.alive) {
      return { power: DRAG_MAX, theta: Math.PI / 2 }; // Default downwards
    }

    // Coarse 15° scan
    let bestDeg = 90; // Default down
    let bestScore = -Infinity;
    const scores = new Map();

    for (let deg = 0; deg < 360; deg += this.bucketDeg) {
      const rad = (deg * Math.PI) / 180;
      const res = simulateBoard(snapshot, aiLabel, DRAG_MAX, rad);
      scores.set(deg, res.score);

      if (res.score > bestScore) {
        bestScore = res.score;
        bestDeg = deg;
      }
    }

    // If all simulations scored 0, aim towards the closest enemy peg!
    if (bestScore <= 0) {
      const enemies = snapshot.balls.filter(b => b.owner === 1 && b.alive);
      if (enemies.length > 0) {
        let minDist = Infinity;
        let targetAngle = Math.PI / 2;
        for (const enemy of enemies) {
          const dx = enemy.x - activeAi.x;
          const dy = enemy.y - activeAi.y;
          const d = Math.hypot(dx, dy);
          if (d < minDist) {
            minDist = d;
            targetAngle = Math.atan2(dy, dx);
          }
        }
        return { power: DRAG_MAX, theta: targetAngle };
      }
    }

    // Phase 2: 1° refinement between best bucket and its higher neighbor
    const leftDeg = (bestDeg - this.bucketDeg + 360) % 360;
    const rightDeg = (bestDeg + this.bucketDeg) % 360;

    const leftScore = scores.get(leftDeg) ?? -Infinity;
    const rightScore = scores.get(rightDeg) ?? -Infinity;
    const neighborDeg = leftScore >= rightScore ? leftDeg : rightDeg;

    let lo = Math.min(bestDeg, neighborDeg);
    let hi = Math.max(bestDeg, neighborDeg);

    if (hi - lo > this.bucketDeg) {
      lo = hi;
      hi = lo + 360;
    }

    let refinedDeg = bestDeg;
    let refinedScore = bestScore;

    for (let deg = lo; deg <= hi; deg++) {
      const d = (deg + 360) % 360;
      const rad = (d * Math.PI) / 180;
      const res = simulateBoard(snapshot, aiLabel, DRAG_MAX, rad);
      if (res.score > refinedScore) {
        refinedScore = res.score;
        refinedDeg = d;
      }
    }

    return {
      power: DRAG_MAX,
      theta: (refinedDeg * Math.PI) / 180,
    };
  }
}
