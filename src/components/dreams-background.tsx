import { memo, useMemo } from 'react';
import type { DreamsMode } from '../lib/storage';
import './dreams-background.css';

/**
 * A calm landscape behind the glass, after the Simple Dreams dashboard theme:
 * hills in layers, a lake, pines, a low sun. It is drawn rather than painted,
 * so it is crisp at any size and its colours change with day and night.
 */

const WIDTH = 1600;
const HEIGHT = 900;
const LAKE = 640;

/** The same scene on every visit: a small seeded generator for tree placement. */
const seeded = (seed: number): (() => number) => {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const farRidge = (x: number): number => 468 + 30 * Math.sin(x / 210 + 1) + 14 * Math.sin(x / 77);
const midRidge = (x: number): number =>
  588 + 24 * Math.sin(x / 260 + 2.2) + 9 * Math.sin(x / 95 + 0.5);
const leftHill = (x: number): number => 628 + 290 * Math.pow(Math.max(0, x) / 720, 2.1);
const rightHill = (x: number): number => 590 + 310 * Math.pow(Math.max(0, WIDTH - x) / 640, 2.1);
const meadow = (x: number): number => 836 + 18 * Math.sin(x / 240 + 0.7);

/** A filled shape under a ridge line, from `from` to `to`, down to `bottom`. */
const ridgePath = (
  ridge: (x: number) => number,
  from = 0,
  to = WIDTH,
  step = 16,
  bottom = HEIGHT
): string => {
  const points: string[] = [];

  for (let x = from; x <= to; x += step) {
    points.push(`${x} ${ridge(x).toFixed(1)}`);
  }

  points.push(`${to} ${ridge(to).toFixed(1)}`);
  return `M${points.join(' L')} L${to} ${bottom} L${from} ${bottom}Z`;
};

/** A pine: three tiers of boughs on a short trunk, standing on (x, y). */
const pine = (x: number, y: number, h: number): string => {
  const w = h * 0.42;
  const p = (dx: number, dy: number): string => `${(x + dx).toFixed(1)} ${(y - dy).toFixed(1)}`;

  return (
    `M${p(0, h)} L${p(w * 0.28, h * 0.66)} L${p(w * 0.15, h * 0.66)} ` +
    `L${p(w * 0.4, h * 0.36)} L${p(w * 0.24, h * 0.36)} L${p(w * 0.5, h * 0.08)} ` +
    `L${p(w * 0.06, h * 0.08)} L${p(w * 0.06, 0)} L${p(-w * 0.06, 0)} L${p(-w * 0.06, h * 0.08)} ` +
    `L${p(-w * 0.5, h * 0.08)} L${p(-w * 0.24, h * 0.36)} L${p(-w * 0.4, h * 0.36)} ` +
    `L${p(-w * 0.15, h * 0.66)} L${p(-w * 0.28, h * 0.66)}Z`
  );
};

/** Trees along a ridge in patches, as forests grow, rather than in a row. */
const forest = (
  random: () => number,
  ridge: (x: number) => number,
  from: number,
  to: number,
  spacing: number,
  [min, max]: [number, number],
  density = 0.6
): string => {
  const trees: string[] = [];

  for (let x = from; x < to; x += spacing * (0.6 + random() * 0.8)) {
    const patch = Math.sin(x / 140) * 0.5 + 0.5;

    if (random() < density * (0.4 + patch)) {
      trees.push(pine(x, ridge(x) + 3, min + random() * (max - min)));
    }
  }

  return trees.join(' ');
};

const useScene = () =>
  useMemo(() => {
    const random = seeded(19);
    const island = (x: number): number => LAKE + 6 - 16 * Math.max(0, 1 - ((x - 1010) / 130) ** 2);

    return {
      far: ridgePath(farRidge),
      farTrees: forest(random, farRidge, 0, WIDTH, 13, [12, 22], 0.55),
      mid: ridgePath(midRidge),
      midTrees: forest(random, midRidge, 0, WIDTH, 17, [24, 44], 0.6),
      // An island sits on the water, so its shape ends at the waterline.
      islandLand: ridgePath(island, 880, 1140, 10, LAKE + 8),
      islandTrees: forest(random, island, 930, 1100, 16, [26, 62], 1),
      left: ridgePath(leftHill, 0, 720),
      leftTrees: forest(random, leftHill, 10, 400, 26, [90, 190], 0.9),
      right: ridgePath(rightHill, 960, WIDTH),
      rightTrees: forest(random, rightHill, 1190, WIDTH, 30, [110, 230], 0.95),
      meadow: ridgePath(meadow),
      stars: Array.from({ length: 70 }, () => ({
        x: random() * WIDTH,
        y: random() * 380,
        r: 0.6 + random() * 1.3,
        delay: random() * 6
      })),
      glints: Array.from({ length: 22 }, () => ({
        x: 380 + random() * 760,
        y: LAKE + 14 + random() * 150,
        w: 14 + random() * 46,
        delay: random() * 5
      }))
    };
  }, []);

const Bird = ({ x, y, s }: { x: number; y: number; s: number }): JSX.Element => (
  <path
    d={`M${x} ${y} q ${6 * s} ${-6 * s} ${12 * s} 0 q ${6 * s} ${-6 * s} ${12 * s} 0`}
    className="dreams-bird"
  />
);

export const DreamsBackground = memo(({ mode }: { mode: DreamsMode }): JSX.Element => {
  const scene = useScene();

  return (
    <div className="dreams" data-mode={mode} aria-hidden="true">
      <svg
        className="dreams-svg"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        preserveAspectRatio="xMidYMax slice"
        focusable="false"
      >
        <defs>
          <linearGradient id="dreams-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" className="dreams-sky-1" />
            <stop offset="0.55" className="dreams-sky-2" />
            <stop offset="1" className="dreams-sky-3" />
          </linearGradient>
          <linearGradient id="dreams-lake" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" className="dreams-lake-1" />
            <stop offset="1" className="dreams-lake-2" />
          </linearGradient>
          <radialGradient id="dreams-glow">
            <stop offset="0" className="dreams-glow-1" />
            <stop offset="1" className="dreams-glow-2" />
          </radialGradient>
          <filter id="dreams-soft" x="-20%" y="-50%" width="140%" height="200%">
            <feGaussianBlur stdDeviation="18" />
          </filter>
        </defs>

        <rect width={WIDTH} height={HEIGHT} fill="url(#dreams-sky)" />

        <g className="dreams-stars">
          {scene.stars.map((star, index) => (
            <circle
              key={index}
              cx={star.x}
              cy={star.y}
              r={star.r}
              style={{ animationDelay: `${star.delay}s` }}
            />
          ))}
        </g>

        <circle cx="1170" cy="300" r="260" fill="url(#dreams-glow)" />
        <circle cx="1170" cy="300" r="64" className="dreams-sun" />

        <g className="dreams-clouds" filter="url(#dreams-soft)">
          <ellipse cx="300" cy="190" rx="220" ry="34" />
          <ellipse cx="420" cy="170" rx="140" ry="28" />
          <ellipse cx="900" cy="250" rx="260" ry="30" />
          <ellipse cx="1420" cy="160" rx="200" ry="26" />
        </g>

        <path d={scene.far} className="dreams-far" />
        <path d={scene.farTrees} className="dreams-far-trees" />

        <g className="dreams-birds">
          <Bird x={980} y={210} s={1.3} />
          <Bird x={1030} y={236} s={1} />
          <Bird x={940} y={250} s={0.8} />
        </g>

        <path d={scene.mid} className="dreams-mid" />
        <path d={scene.midTrees} className="dreams-mid-trees" />

        <rect y={LAKE} width={WIDTH} height={HEIGHT - LAKE} fill="url(#dreams-lake)" />
        <ellipse cx="1170" cy={LAKE + 70} rx="70" ry="80" className="dreams-reflection" />
        <g className="dreams-glints">
          {scene.glints.map((glint, index) => (
            <rect
              key={index}
              x={glint.x}
              y={glint.y}
              width={glint.w}
              height="2"
              rx="1"
              style={{ animationDelay: `${glint.delay}s` }}
            />
          ))}
        </g>

        <path d={scene.islandLand} className="dreams-island" />
        <path d={scene.islandTrees} className="dreams-island" />

        <ellipse
          cx="800"
          cy={LAKE - 8}
          rx="900"
          ry="34"
          className="dreams-mist"
          filter="url(#dreams-soft)"
        />

        <path d={scene.right} className="dreams-near-2" />
        <path d={scene.rightTrees} className="dreams-near-trees" />
        <path d={scene.left} className="dreams-near" />
        <path d={scene.leftTrees} className="dreams-near-trees" />
        <path d={scene.meadow} className="dreams-meadow" />
      </svg>
      <div className="dreams-shade" />
    </div>
  );
});

DreamsBackground.displayName = 'DreamsBackground';
