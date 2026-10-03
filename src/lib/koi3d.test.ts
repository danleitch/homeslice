import { describe, expect, it } from 'vitest';
import { ARRIVED_REACH, CURIOUS_GAIN, distance, insidePond } from './koi-attention';
import { DEFAULT_MOTION_TRIM } from '../vendor/koi-pond/motion/koi-motion';
import {
  createKoiBrain,
  createRest,
  exitHeading,
  hasLeftPond,
  inOpenWater,
  motionFor,
  outsideBody,
  pondFor,
  profileFor,
  restingPace,
  type KoiEntry,
  type KoiFocus,
  type PondIsland
} from './koi3d';
import { hashString } from './koi-roster';

const POND = pondFor(1400, 900, false);
const ISLAND: PondIsland = { x: 340, y: 120, width: 720, height: 660 };

const entry = (branch: string, accent = '#42b883'): KoiEntry => ({
  key: branch,
  seed: hashString(branch),
  accent
});

/** Swims one koi and reports where it went. */
const swim = (
  koi: KoiEntry,
  seconds: number,
  island: PondIsland | null = null
): { path: { x: number; y: number }[]; distance: number } => {
  const { motion } = createKoiBrain(koi, POND, () => island);
  const path: { x: number; y: number }[] = [];
  let distance = 0;
  let previous = { ...motion.state.position };

  for (let frame = 0; frame < seconds * 60; frame += 1) {
    motion.advance(1 / 60);
    const here = { ...motion.state.position };
    distance += Math.hypot(here.x - previous.x, here.y - previous.y);
    previous = here;

    if (frame % 30 === 0) {
      path.push(here);
    }
  }

  return { path, distance };
};

const spread = (path: { x: number; y: number }[]): { width: number; height: number } => {
  const xs = path.map((point) => point.x);
  const ys = path.map((point) => point.y);

  return {
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys)
  };
};

describe('profileFor', () => {
  it('wears the branch colour as its marking, over natural koi tones', () => {
    const profile = profileFor(entry('feat/green', '#42b883'));

    expect(profile.palette.marking).toBe('#42b883');
    expect(profile.palette.accent).toBe('#42b883');
    // The ground and second marking stay the variety's own, not the branch's.
    expect(profile.palette.body).not.toBe('#42b883');
    expect(profile.palette.shade).not.toBe('#42b883');
  });

  it('gives the same branch the same fish every time', () => {
    expect(profileFor(entry('feat/stable'))).toEqual(profileFor(entry('feat/stable')));
  });

  it('gives different branches different builds and varieties', () => {
    const profiles = ['a', 'b', 'c', 'd', 'e', 'f'].map((name) => profileFor(entry(name)));

    expect(new Set(profiles.map((profile) => profile.framework)).size).toBeGreaterThan(1);
    expect(new Set(profiles.map((profile) => profile.palette.pattern)).size).toBeGreaterThan(1);
  });
});

describe('a koi swimming', () => {
  it('roams the pond rather than circling', () => {
    // The whole point of vendoring the library's brain: the first attempt
    // steered by nudging the current heading, which turns at a constant rate
    // and draws a circle. A roaming koi covers real ground on both axes.
    const { path, distance } = swim(entry('feat/roam'), 120);
    const covered = spread(path);

    expect(distance).toBeGreaterThan(1000);
    expect(covered.width).toBeGreaterThan(POND.width * 0.25);
    expect(covered.height).toBeGreaterThan(POND.height * 0.25);
  });

  it('does not retrace the same loop', () => {
    // A circling koi returns to where it was a lap ago; a roaming one does not.
    const { path } = swim(entry('fix/loop'), 120);
    const half = Math.floor(path.length / 2);
    const early = path.slice(0, half);
    const late = path.slice(half);
    const revisits = late.filter((point) =>
      early.some((seen) => Math.hypot(point.x - seen.x, point.y - seen.y) < 20)
    );

    expect(revisits.length).toBeLessThan(late.length * 0.5);
  });

  it('stays in the pond', () => {
    const { path } = swim(entry('chore/bounds'), 120);

    for (const point of path) {
      expect(point.x).toBeGreaterThan(-POND.margin);
      expect(point.x).toBeLessThan(POND.width + POND.margin);
      expect(point.y).toBeGreaterThan(-POND.margin);
      expect(point.y).toBeLessThan(POND.height + POND.margin);
    }
  });

  it('keeps clear of the panel', () => {
    const { path } = swim(entry('docs/panel'), 120, ISLAND);
    const under = path.filter(
      (point) =>
        point.x > ISLAND.x &&
        point.x < ISLAND.x + ISLAND.width &&
        point.y > ISLAND.y &&
        point.y < ISLAND.y + ISLAND.height
    );

    // Brushing the edge while turning off it is fine; living under it is not.
    expect(under.length).toBeLessThan(path.length * 0.1);
  });

  it('still swims freely when there is no panel', () => {
    const { distance } = swim(entry('docs/panel'), 120);

    expect(distance).toBeGreaterThan(1000);
  });
});

describe('market koi in the pond', () => {
  const marketEntry = (variety: 'chagoi' | 'tancho', seed: number): KoiEntry => ({
    key: `market:${seed}`,
    seed,
    accent: '#ffffff',
    genome: { variety, modifiers: [], seed }
  });

  it('builds a market koi on its variety’s body, not the branch archetype', () => {
    expect(profileFor(marketEntry('chagoi', 3)).framework).toBe('react');
    expect(profileFor(marketEntry('chagoi', 4)).framework).toBe('react');
  });
});

describe('pace by size', () => {
  const goldfish = (lengthCm: number): KoiEntry => ({
    key: `goldfish:${lengthCm}`,
    seed: 11,
    accent: '#ffffff',
    genome: { species: 'goldfish', variety: 'comet', seed: 11 },
    lengthCm
  });

  /** The fastest a fish goes over two minutes, in its own drawn lengths per second. */
  const fastest = (fish: KoiEntry): number => {
    const { profile, motion } = createKoiBrain(fish, POND, () => null);
    const drawn = POND.fishLength * (profile.phenotype.length ?? profile.build.lengthScale);
    let top = 0;

    for (let frame = 0; frame < 120 * 60; frame += 1) {
      motion.advance(1 / 60);
      top = Math.max(top, motion.state.speed / drawn);
    }

    return top;
  };

  it('keeps a small goldfish to a fish’s pace, not a dash across the pond', () => {
    // Paced by the pond's nominal koi, a 9 cm comet averaged three of its own
    // lengths a second and peaked near six.
    expect(fastest(goldfish(9))).toBeLessThan(3);
  });

  it('lets a grown goldfish swim further each second than a fry, but fewer of its own lengths', () => {
    const small = createKoiBrain(goldfish(9), POND, () => null).profile;
    const grown = createKoiBrain(goldfish(30), POND, () => null).profile;

    expect(motionFor(goldfish(30), grown).limits!.maxSpeedBlS!).toBeGreaterThan(
      motionFor(goldfish(9), small).limits!.maxSpeedBlS!
    );
    expect(fastest(goldfish(30))).toBeLessThan(fastest(goldfish(9)));
  });

  it('leaves a branch koi on the library’s own pace', () => {
    const koi = entry('feat/pace');
    const { trim } = motionFor(koi, profileFor(koi));

    expect(trim!.cruiseBlS).toEqual(DEFAULT_MOTION_TRIM.cruiseBlS);
  });
});

describe('resting', () => {
  /** Steps a rest for a while, reporting the deepest it went. */
  const deepest = (seconds: number, free: (clockS: number) => boolean): number => {
    const rest = createRest(7, 0, () => 0.5);
    let deepest = 0;

    for (let frame = 0; frame < seconds * 60; frame += 1) {
      const clock = frame / 60;
      deepest = Math.max(deepest, rest.step(clock, 1 / 60, free(clock)));
    }

    return deepest;
  };

  it('settles into a rest now and then', () => {
    expect(deepest(180, () => true)).toBeGreaterThan(0.95);
  });

  it('does not rest while it has something on its mind', () => {
    expect(deepest(180, () => false)).toBe(0);
  });

  it('wakes promptly when something comes up, and settles again after', () => {
    const rest = createRest(7, 0, () => 0.5);
    let clock = 0;
    const run = (seconds: number, free: boolean): number => {
      let at = 0;

      for (let frame = 0; frame < seconds * 60; frame += 1) {
        clock += 1 / 60;
        at = rest.step(clock, 1 / 60, free);
      }

      return at;
    };

    // Swim until it is well into a rest.
    let settled = 0;

    while (settled < 0.95 && clock < 300) {
      settled = run(1, true);
    }

    expect(settled).toBeGreaterThan(0.95);
    expect(run(1.5, false)).toBeLessThan(0.1);
    expect(run(4, true)).toBeGreaterThan(0.8);
  });

  it('keeps some pace while resting, so the fins still scull', () => {
    expect(restingPace(0)).toBe(1);
    expect(restingPace(1)).toBeGreaterThan(0);
    expect(restingPace(1)).toBeLessThan(0.2);
  });

  it('only rests in open water, not under the panel or off the edge', () => {
    expect(inOpenWater({ x: 150, y: 450 }, POND, ISLAND)).toBe(true);
    expect(inOpenWater({ x: 700, y: 450 }, POND, ISLAND)).toBe(false);
    expect(inOpenWater({ x: 10, y: 450 }, POND, ISLAND)).toBe(false);
    expect(inOpenWater({ x: 700, y: 450 }, POND, null)).toBe(true);
  });
});

describe('arrivals and departures', () => {
  it('starts an arriving koi just out of sight, and swims it into view', () => {
    const { motion } = createKoiBrain(entry('feat/new'), POND, () => null, { arriving: true });
    const start = motion.state.position;

    expect(start.x < 0 || start.x > POND.width).toBe(true);

    for (let frame = 0; frame < 6 * 60; frame += 1) {
      motion.advance(1 / 60);
    }

    const { x, y } = motion.state.position;
    expect(x).toBeGreaterThan(0);
    expect(x).toBeLessThan(POND.width);
    expect(y).toBeGreaterThan(0);
    expect(y).toBeLessThan(POND.height);
  });

  it('swims a departing koi out through the nearer side until it has left the pond', () => {
    let exit: { heading: number; secondsLeft: number } | null = null;
    const { motion } = createKoiBrain(entry('feat/old'), POND, () => ISLAND, {
      readExit: () => exit
    });

    for (let frame = 0; frame < 60; frame += 1) {
      motion.advance(1 / 60);
    }

    exit = { heading: exitHeading(motion.state.position, POND.width), secondsLeft: 9 };
    let seconds = 0;

    while (!hasLeftPond(motion.state.position, motion.state.length, POND) && seconds < 20) {
      motion.advance(1 / 60);
      seconds += 1 / 60;
    }

    expect(hasLeftPond(motion.state.position, motion.state.length, POND)).toBe(true);
    expect(seconds).toBeLessThan(15);
  });

  it('heads for whichever side is nearer', () => {
    expect(exitHeading({ x: 100 }, 1000)).toBe(Math.PI);
    expect(exitHeading({ x: 900 }, 1000)).toBe(0);
  });

  it('only counts a koi as gone once it is clear of every edge', () => {
    expect(hasLeftPond({ x: 500, y: 400 }, 100, POND)).toBe(false);
    expect(hasLeftPond({ x: -10, y: 400 }, 100, POND)).toBe(false);
    expect(hasLeftPond({ x: -130, y: 400 }, 100, POND)).toBe(true);
    expect(hasLeftPond({ x: 500, y: POND.height + 130 }, 100, POND)).toBe(true);
  });
});

describe('curiosity', () => {
  /** Swims a koi with a point of interest behind it, reporting how close it got and how fast it went. */
  const investigate = (branch: string): { closest: number; fastest: number } => {
    let focus: KoiFocus | null = null;
    const { motion } = createKoiBrain(entry(branch), POND, () => null, {
      readFocus: () => focus
    });

    for (let frame = 0; frame < 120; frame += 1) {
      motion.advance(1 / 60);
    }

    const { position, heading } = motion.state;
    const point = insidePond(
      { x: position.x - Math.cos(heading) * 420, y: position.y - Math.sin(heading) * 420 },
      POND,
      POND.fishLength
    );
    focus = { point, gain: CURIOUS_GAIN };
    let closest = Infinity;
    let fastest = 0;

    for (let frame = 0; frame < 20 * 60; frame += 1) {
      motion.advance(1 / 60);
      closest = Math.min(closest, distance(motion.state.position, point));
      fastest = Math.max(fastest, motion.state.speed);
    }

    return { closest, fastest };
  };

  it('turns around and swims over to see a touch on the water behind it', () => {
    for (const branch of ['feat/look', 'fix/peek', 'chore/nose']) {
      expect(investigate(branch).closest, branch).toBeLessThan(ARRIVED_REACH * POND.fishLength);
    }
  });

  it('comes over at its own easy pace, never at a dash', () => {
    // A bolting koi reaches nearly two body lengths a second; a curious one cruises.
    expect(investigate('feat/calm').fastest).toBeLessThan(1.2 * POND.fishLength);
  });
});

describe('outsideBody', () => {
  // A straight fish lying along the x axis, nose at the origin.
  const outline = {
    spine: [
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 100, y: 0 }
    ],
    girth: [4, 12, 2]
  };

  it('counts a point on the body as on it', () => {
    expect(outsideBody({ x: 40, y: 5 }, outline, 1)).toBeLessThanOrEqual(0);
  });

  it('counts every point as far off the body of a fish that has none yet', () => {
    expect(outsideBody({ x: 0, y: 0 }, { spine: [], girth: [] }, 1)).toBe(Infinity);
  });

  it('measures how far off the body a point lies', () => {
    expect(outsideBody({ x: 50, y: 32 }, outline, 1)).toBeCloseTo(20);
    expect(outsideBody({ x: -30, y: 0 }, outline, 1)).toBeCloseTo(18);
  });

  it('shrinks the outline toward the nose for a fish drawn smaller than it swims', () => {
    // The tail end is off a half-size fish, though it would be on a full one.
    expect(outsideBody({ x: 90, y: 0 }, outline, 1)).toBeLessThanOrEqual(0);
    expect(outsideBody({ x: 90, y: 0 }, outline, 0.5)).toBeGreaterThan(30);
  });

  it('finds a swimming koi where its brain says it is', () => {
    const { motion } = createKoiBrain(entry('feat/BRF-1-add-auth'), POND, () => null);
    const nose = motion.state.position;

    expect(outsideBody(nose, motion.outline(), 1)).toBeLessThanOrEqual(0);
    expect(outsideBody({ x: nose.x + 400, y: nose.y + 400 }, motion.outline(), 1)).toBeGreaterThan(
      100
    );
  });
});
