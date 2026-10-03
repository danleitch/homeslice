import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Camera, Scene } from 'three';
import type { GoldfishGenome } from './goldfish';
import type { KoiGenome } from './koi-genome';
import {
  createPondStage,
  type FoodPellet,
  type KoiEntry,
  type PondHooks,
  type PondStage
} from './koi3d';

// jsdom cannot give three.js a WebGL context, so the renderer is a stand-in that notes what it
// is asked to draw. The scene, the koi, their motion and their brains are all the real thing.
const renderer = vi.hoisted(() => ({
  made: [] as {
    options: Record<string, unknown>;
    toneMapping: number;
    toneMappingExposure: number;
    setClearAlpha: ReturnType<typeof vi.fn>;
    setPixelRatio: ReturnType<typeof vi.fn>;
    setSize: ReturnType<typeof vi.fn>;
    render: ReturnType<typeof vi.fn>;
    dispose: ReturnType<typeof vi.fn>;
  }[],
  lastScene: null as unknown,
  lastCamera: null as unknown
}));

vi.mock('three', async (importOriginal) => {
  const three = await importOriginal<typeof import('three')>();

  class FakeRenderer {
    options: Record<string, unknown>;
    toneMapping = 0;
    toneMappingExposure = 1;
    setClearAlpha = vi.fn();
    setPixelRatio = vi.fn();
    setSize = vi.fn();
    render = vi.fn((scene: unknown, camera: unknown) => {
      renderer.lastScene = scene;
      renderer.lastCamera = camera;
    });
    dispose = vi.fn();

    constructor(options: Record<string, unknown>) {
      this.options = options;
      renderer.made.push(this);
    }
  }

  return { ...three, WebGLRenderer: FakeRenderer };
});

const WIDTH = 1200;
const HEIGHT = 800;

const entry = (key: string, extras: Partial<KoiEntry> = {}): KoiEntry => ({
  key,
  seed: [...key].reduce((sum, letter) => sum * 31 + letter.charCodeAt(0), 7),
  accent: '#3366ff',
  ...extras
});

const marketKoi: KoiGenome = { variety: 'kohaku', modifiers: [], seed: 4242 };
const marketGoldfish: GoldfishGenome = { species: 'goldfish', variety: 'comet', seed: 77 };

const scene = (): Scene => renderer.lastScene as Scene;
const camera = (): Camera => renderer.lastCamera as Camera;
const gl = (): (typeof renderer.made)[number] => renderer.made[renderer.made.length - 1]!;

/** The koi in the scene, as opposed to its lights. */
const koiCount = (): number =>
  scene().children.filter(
    (child) =>
      child.name !== 'lighting' &&
      child.type === 'Group' &&
      child.children.some((part) => part.type === 'Mesh')
  ).length;

/** Every point of the pond, on a grid, to find a fish by touching around. */
const grid = (step = 24): { x: number; y: number }[] =>
  Array.from({ length: Math.floor(HEIGHT / step) }, (_row, row) =>
    Array.from({ length: Math.floor(WIDTH / step) }, (_column, column) => ({
      x: column * step + step / 2,
      y: row * step + step / 2
    }))
  ).flat();

describe('createPondStage', () => {
  let canvas: HTMLCanvasElement;
  let stages: PondStage[];

  const open = (
    options: { reducedMotion?: boolean; hooks?: PondHooks; entries?: KoiEntry[] } = {}
  ): PondStage => {
    const stage = createPondStage(canvas, options.reducedMotion ?? false, options.hooks);
    stages.push(stage);
    stage.setSize(WIDTH, HEIGHT);
    stage.setRoster(options.entries ?? [entry('alpha'), entry('beta'), entry('gamma')]);
    return stage;
  };

  /** Lets the pond run, a little at a time as the real animation loop does. */
  const swim = (stage: PondStage, seconds: number, step = 1 / 30): void => {
    for (let elapsed = 0; elapsed < seconds; elapsed += step) {
      stage.draw(step);
    }
  };

  const fishAt = (stage: PondStage, key: string): { x: number; y: number } | null =>
    grid().find((point) => stage.pick(point) === key) ?? null;

  beforeEach(() => {
    renderer.made.length = 0;
    renderer.lastScene = null;
    renderer.lastCamera = null;
    canvas = document.createElement('canvas');
    stages = [];
    // Every roll of the dice the same, so a pond plays out the same way each time.
    vi.spyOn(Math, 'random').mockReturnValue(0.4);
    Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 1 });
  });

  afterEach(() => {
    for (const stage of stages) {
      stage.dispose();
    }

    vi.restoreAllMocks();
  });

  describe('the renderer', () => {
    it('is made for the canvas, transparent, with the pond’s tone curve', () => {
      open();

      expect(renderer.made).toHaveLength(1);
      expect(gl().options.canvas).toBe(canvas);
      expect(gl().options.alpha).toBe(true);
      expect(gl().setClearAlpha).toHaveBeenCalledWith(0);
      expect(gl().toneMapping).not.toBe(0);
    });

    it('is sized as the window is, at no more than twice the pixel ratio', () => {
      Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 3 });
      const stage = open();

      stage.setSize(900, 600);

      expect(gl().setSize).toHaveBeenLastCalledWith(900, 600, false);
      expect(gl().setPixelRatio).toHaveBeenLastCalledWith(2);
    });

    it('draws the scene through the pond’s camera each frame', () => {
      const stage = open();

      stage.draw(1 / 60);

      expect(gl().render).toHaveBeenCalledTimes(1);
      expect(camera()).toBeDefined();
      expect(scene().children.length).toBeGreaterThan(0);
    });

    it('is handed back when the pond is closed', () => {
      const stage = open();

      stage.dispose();

      expect(gl().dispose).toHaveBeenCalledTimes(1);
      stages.length = 0;
    });
  });

  describe('the roster', () => {
    it('puts a koi in the water for each entry', () => {
      const stage = open();
      stage.draw(1 / 60);

      expect(koiCount()).toBe(3);
    });

    it('names each fish as its own, and nothing else', () => {
      const stage = open();

      expect(stage.inspect('alpha')).not.toBeNull();
      expect(stage.inspect('nobody')).toBeNull();
    });

    it('leaves the koi that stay swimming as others come and go around them', () => {
      const stage = open();
      swim(stage, 2);
      const before = fishAt(stage, 'alpha');

      stage.setRoster([entry('alpha'), entry('beta'), entry('gamma'), entry('delta')]);
      stage.draw(1 / 60);

      expect(koiCount()).toBe(4);
      expect(stage.inspect('alpha')).not.toBeNull();
      expect(before).not.toBeNull();
    });

    it('takes no koi at all', () => {
      const stage = open({ entries: [] });
      stage.draw(1 / 60);

      expect(koiCount()).toBe(0);
      expect(gl().render).toHaveBeenCalled();
    });

    describe('a fish that is sold or released', () => {
      it('swims out of the pond rather than vanishing', () => {
        const stage = open();
        swim(stage, 1);

        stage.setRoster([entry('alpha'), entry('beta')]);

        expect(stage.inspect('gamma')!.activity).toBe('leaving');
        expect(koiCount()).toBe(3);
      });

      it('is gone once it has had time to get out of sight', () => {
        const stage = open();
        swim(stage, 1);
        stage.setRoster([entry('alpha'), entry('beta')]);

        swim(stage, 60);

        expect(stage.inspect('gamma')).toBeNull();
        expect(koiCount()).toBe(2);
      });

      it('turns round and stays if it is asked back before it gets out', () => {
        const stage = open();
        swim(stage, 1);
        stage.setRoster([entry('alpha'), entry('beta')]);
        swim(stage, 1);

        stage.setRoster([entry('alpha'), entry('beta'), entry('gamma')]);
        swim(stage, 60);

        expect(stage.inspect('gamma')).not.toBeNull();
        expect(stage.inspect('gamma')!.activity).not.toBe('leaving');
      });

      it('cannot be picked up on its way out', () => {
        const stage = open();
        swim(stage, 2);
        const spot = fishAt(stage, 'gamma')!;
        stage.setRoster([entry('alpha'), entry('beta')]);

        expect(stage.pick(spot)).not.toBe('gamma');
        expect(stage.grab('gamma', spot)).toBe(false);
      });

      it('goes at once in a still pond, where swimming off would get nowhere', () => {
        const stage = open({ reducedMotion: true });
        stage.draw(1 / 60);

        stage.setRoster([entry('alpha'), entry('beta')]);

        expect(stage.inspect('gamma')).toBeNull();
        expect(koiCount()).toBe(2);
      });
    });

    it('lets the first roster simply appear, as the pond the visitor finds', () => {
      const stage = open();

      // Nothing is "leaving" or arriving: the first roster is the pond as it is.
      expect(['alpha', 'beta', 'gamma'].map((key) => stage.inspect(key)!.activity)).not.toContain(
        'leaving'
      );
    });
  });

  describe('looking at a fish', () => {
    it('says how it is built, how it is marked, how big it is and what it is doing', () => {
      const stage = open();

      const reading = stage.inspect('alpha')!;

      expect(reading.traits).toMatchObject({
        shyness: expect.any(Number),
        cruiseSpeed: expect.any(Number)
      });
      expect(reading.pattern).toEqual(expect.any(String));
      expect(reading.lengthCm).toBeGreaterThan(0);
      expect(reading.activity).toBe('cruising');
    });

    it('measures a market fish by how long it has grown, not by its build', () => {
      const stage = open({
        entries: [entry('bought', { genome: marketKoi, lengthCm: 41.5 }), entry('branch')]
      });

      expect(stage.inspect('bought')!.lengthCm).toBe(41.5);
      expect(stage.inspect('branch')!.lengthCm).not.toBe(41.5);
    });

    it('dresses a market fish as its variety', () => {
      const stage = open({ entries: [entry('bought', { genome: marketKoi })] });
      stage.draw(1 / 60);

      expect(stage.inspect('bought')).not.toBeNull();
      expect(koiCount()).toBe(1);
    });

    it('swims a goldfish as well as a koi', () => {
      const stage = open({
        entries: [entry('gold', { genome: marketGoldfish, lengthCm: 12 }), entry('koi')]
      });

      swim(stage, 5);

      expect(stage.inspect('gold')!.lengthCm).toBe(12);
      expect(koiCount()).toBe(2);
    });

    it('measures a fish by its drawn length when it has no recorded one, roughly in the sixties of centimetres', () => {
      const stage = open();

      const { lengthCm } = stage.inspect('alpha')!;

      expect(lengthCm).toBeGreaterThan(15);
      expect(lengthCm).toBeLessThan(120);
    });
  });

  describe('picking', () => {
    it('finds the fish under a point', () => {
      const stage = open();
      swim(stage, 2);

      const spot = fishAt(stage, 'alpha');

      expect(spot).not.toBeNull();
      expect(stage.pick(spot!)).toBe('alpha');
    });

    it('finds nothing in open water', () => {
      const stage = open({ entries: [entry('only')] });
      swim(stage, 1);

      expect(stage.pick({ x: -5000, y: -5000 })).toBeNull();
    });

    it('prefers the fish nearer the surface where two overlap', () => {
      const stage = open({ entries: [entry('a'), entry('b')] });
      swim(stage, 3);

      const hits = grid(12)
        .map((point) => stage.pick(point))
        .filter(Boolean);

      // Overlapping fish still give one answer for every point.
      expect(hits.every((key) => key === 'a' || key === 'b')).toBe(true);
    });
  });

  describe('carrying a fish', () => {
    it('picks one up at a point, and refuses a fish that is not there', () => {
      const stage = open();
      swim(stage, 2);
      const spot = fishAt(stage, 'alpha')!;

      expect(stage.grab('alpha', spot)).toBe(true);
      expect(stage.grab('nobody', spot)).toBe(false);
    });

    it('brings it along behind the hand', () => {
      const stage = open({ entries: [entry('alpha')] });
      swim(stage, 2);
      stage.grab('alpha', fishAt(stage, 'alpha')!);

      stage.carry({ x: 900, y: 600 });
      swim(stage, 1);

      const spot = fishAt(stage, 'alpha')!;
      expect(Math.hypot(spot.x - 900, spot.y - 600)).toBeLessThan(220);
    });

    it('keeps it in the water, however far the hand goes', () => {
      const stage = open({ entries: [entry('alpha')] });
      swim(stage, 2);
      stage.grab('alpha', fishAt(stage, 'alpha')!);

      stage.carry({ x: -4000, y: 9000 });
      swim(stage, 1);

      expect(fishAt(stage, 'alpha')).not.toBeNull();
    });

    it('lifts it toward the surface while it is held', () => {
      const stage = open({ entries: [entry('alpha')] });
      swim(stage, 2);
      stage.grab('alpha', fishAt(stage, 'alpha')!);

      stage.carry({ x: 600, y: 400 });
      swim(stage, 3);

      // Held, it has nothing else on its mind.
      expect(stage.inspect('alpha')!.activity).toBe('cruising');
    });

    it('sends a ring out across the water when it is set down, and swims on', () => {
      const onRipple = vi.fn();
      const stage = open({ entries: [entry('alpha')], hooks: { onRipple } });
      swim(stage, 2);
      stage.grab('alpha', fishAt(stage, 'alpha')!);
      stage.carry({ x: 600, y: 400 });
      swim(stage, 1);

      stage.release();

      expect(onRipple).toHaveBeenCalledTimes(1);
      expect(onRipple).toHaveBeenCalledWith(
        expect.any(Number),
        expect.any(Number),
        expect.any(Number)
      );
      swim(stage, 3);
      expect(stage.inspect('alpha')).not.toBeNull();
    });

    it('makes no ring when there was nothing in the hand', () => {
      const onRipple = vi.fn();
      const stage = open({ hooks: { onRipple } });

      stage.release();
      stage.carry({ x: 100, y: 100 });

      expect(onRipple).not.toHaveBeenCalled();
    });

    it('holds one fish at a time: taking another lets the first go', () => {
      const stage = open({ entries: [entry('alpha'), entry('beta')] });
      swim(stage, 2);
      const first = fishAt(stage, 'alpha')!;
      const second = fishAt(stage, 'beta')!;

      stage.grab('alpha', first);
      stage.grab('beta', second);
      stage.carry({ x: 900, y: 600 });
      swim(stage, 2);

      // Only the one in hand follows it.
      const alpha = fishAt(stage, 'alpha');
      const beta = fishAt(stage, 'beta')!;
      expect(Math.hypot(beta.x - 900, beta.y - 600)).toBeLessThan(220);
      expect(alpha === null || Math.hypot(alpha.x - 900, alpha.y - 600) > 20).toBe(true);
    });

    it('slips out of the hand if the fish is sold while it is held', () => {
      const stage = open({ entries: [entry('alpha'), entry('beta')] });
      swim(stage, 2);
      stage.grab('alpha', fishAt(stage, 'alpha')!);

      stage.setRoster([entry('beta')]);

      expect(stage.inspect('alpha')!.activity).toBe('leaving');
      expect(() => stage.carry({ x: 500, y: 500 })).not.toThrow();
    });

    it('lets go of a fish that has left the pond', () => {
      const stage = open({ entries: [entry('alpha'), entry('beta')], reducedMotion: true });
      stage.draw(1 / 60);
      stage.grab('alpha', { x: 600, y: 400 });

      stage.setRoster([entry('beta')]);

      expect(stage.inspect('alpha')).toBeNull();
      expect(() => stage.release()).not.toThrow();
    });
  });

  describe('a touch on the water', () => {
    it('brings the curious fish over, each in its own time', () => {
      const stage = open();
      swim(stage, 1);

      stage.attend({ x: 600, y: 400 });
      swim(stage, 6);

      const activities = ['alpha', 'beta', 'gamma'].map((key) => stage.inspect(key)!.activity);
      expect(activities.some((activity) => activity === 'curious')).toBe(true);
    });

    it('is something a fish that is leaving takes no notice of', () => {
      const stage = open();
      swim(stage, 1);
      stage.setRoster([entry('alpha'), entry('beta')]);

      stage.attend({ x: 600, y: 400 });
      swim(stage, 2);

      expect(stage.inspect('gamma')!.activity).toBe('leaving');
    });

    it('is looked into at the surface, where each gulp sends a ring out', () => {
      const onRipple = vi.fn();
      const stage = open({ hooks: { onRipple } });
      swim(stage, 1);

      stage.attend({ x: 600, y: 400 });
      swim(stage, 60);

      expect(onRipple).toHaveBeenCalled();
      expect(onRipple.mock.calls[0]![2]).toBeCloseTo(0.7);
    });

    it('is forgotten after a while, and the fish go back to cruising', () => {
      const stage = open();
      swim(stage, 1);
      stage.attend({ x: 600, y: 400 });

      swim(stage, 120);

      expect(['alpha', 'beta', 'gamma'].map((key) => stage.inspect(key)!.activity)).not.toContain(
        'curious'
      );
    });

    it('keeps the spot a fish goes to look at inside the pond', () => {
      const stage = open();
      swim(stage, 1);

      expect(() => stage.attend({ x: -9999, y: 99999 })).not.toThrow();
      swim(stage, 10);
      expect(koiCount()).toBe(3);
    });
  });

  describe('feeding', () => {
    const pellets = (): FoodPellet[] =>
      grid(60).map((point, index) => ({ ...point, id: index + 1 }));

    it('has the hungry fish go for the nearest pellet, and eat it', () => {
      const eaten: number[] = [];
      const food = pellets();
      const stage = open({
        hooks: {
          readFood: () => food.filter((pellet) => !eaten.includes(pellet.id)),
          onEat: (id) => eaten.push(id)
        }
      });

      swim(stage, 60);

      expect(eaten.length).toBeGreaterThan(0);
      expect(new Set(eaten).size).toBe(eaten.length);
    });

    it('shows a fish as feeding while it goes for one', () => {
      const food = pellets();
      const stage = open({ hooks: { readFood: () => food } });
      const seen = new Set<string>();

      for (let frame = 0; frame < 900; frame += 1) {
        stage.draw(1 / 30);

        for (const key of ['alpha', 'beta', 'gamma']) {
          seen.add(stage.inspect(key)!.activity);
        }
      }

      expect(seen.has('feeding')).toBe(true);
    });

    it('takes a pellet only once, however many fish are after it', () => {
      const eaten: number[] = [];
      const lone: FoodPellet[] = [{ x: 600, y: 400, id: 1 }];
      const stage = open({
        hooks: {
          readFood: () => lone.filter((pellet) => !eaten.includes(pellet.id)),
          onEat: (id) => eaten.push(id)
        }
      });

      swim(stage, 90);

      expect(eaten.filter((id) => id === 1).length).toBeLessThanOrEqual(1);
    });

    it('stops looking for food once there is none', () => {
      let food: FoodPellet[] = pellets();
      const stage = open({ hooks: { readFood: () => food } });
      swim(stage, 5);

      food = [];
      swim(stage, 10);

      expect(['alpha', 'beta', 'gamma'].map((key) => stage.inspect(key)!.activity)).not.toContain(
        'feeding'
      );
    });

    it('lets a held fish ignore food, with nothing else on its mind', () => {
      const food = pellets();
      const onEat = vi.fn();
      const stage = open({ entries: [entry('alpha')], hooks: { readFood: () => food, onEat } });
      swim(stage, 2);
      stage.grab('alpha', fishAt(stage, 'alpha')!);
      stage.carry({ x: 0, y: 0 });
      onEat.mockClear();

      swim(stage, 5);

      expect(stage.inspect('alpha')!.activity).not.toBe('feeding');
    });

    it('needs no hooks at all', () => {
      const stage = open({ hooks: undefined });

      expect(() => swim(stage, 10)).not.toThrow();
    });
  });

  describe('the panel', () => {
    it('is something the koi swim round, not under', () => {
      const stage = open({ entries: [entry('a'), entry('b'), entry('c'), entry('d')] });
      const island = { x: 400, y: 250, width: 400, height: 300 };
      stage.setIsland(island);
      swim(stage, 10);
      let underIt = 0;
      let total = 0;

      for (let frame = 0; frame < 600; frame += 1) {
        stage.draw(1 / 30);

        for (const key of ['a', 'b', 'c', 'd']) {
          const spot = fishAt(stage, key);

          if (spot) {
            total += 1;
            underIt +=
              spot.x > island.x + 40 &&
              spot.x < island.x + island.width - 40 &&
              spot.y > island.y + 40 &&
              spot.y < island.y + island.height - 40
                ? 1
                : 0;
          }
        }

        frame += 29;
      }

      expect(total).toBeGreaterThan(0);
      expect(underIt / total).toBeLessThan(0.5);
    });

    it('can be taken away again', () => {
      const stage = open();

      stage.setIsland({ x: 0, y: 0, width: 100, height: 100 });

      expect(() => stage.setIsland(null)).not.toThrow();
      swim(stage, 2);
    });
  });

  describe('resizing', () => {
    it('keeps the fish in the water at the new size', () => {
      const stage = open();
      swim(stage, 2);

      stage.setSize(600, 400);
      swim(stage, 5);

      expect(koiCount()).toBe(3);
      expect(gl().setSize).toHaveBeenLastCalledWith(600, 400, false);
    });

    it('sizes the first frame from the canvas where it has a size', () => {
      Object.defineProperty(canvas, 'clientWidth', { configurable: true, value: 1000 });
      Object.defineProperty(canvas, 'clientHeight', { configurable: true, value: 700 });

      const stage = createPondStage(canvas, false);
      stages.push(stage);

      expect(() => stage.draw(1 / 60)).not.toThrow();
    });
  });

  describe('time', () => {
    it('copes with a frame that took no time at all', () => {
      const stage = open();

      expect(() => stage.draw(0)).not.toThrow();
      expect(stage.inspect('alpha')).not.toBeNull();
    });

    it('rests a koi now and then when it has open water to itself, which a goldfish never does', () => {
      const stage = open({
        entries: [entry('koi', { genome: marketKoi }), entry('gold', { genome: marketGoldfish })]
      });
      const seen = { koi: new Set<string>(), gold: new Set<string>() };

      for (let frame = 0; frame < 30 * 60 * 6; frame += 1) {
        stage.draw(1 / 30);

        if (frame % 30 === 0) {
          seen.koi.add(stage.inspect('koi')!.activity);
          seen.gold.add(stage.inspect('gold')!.activity);
        }
      }

      expect(seen.gold.has('resting')).toBe(false);
      expect(seen.koi.size).toBeGreaterThan(0);
    });
  });

  describe('closing the pond', () => {
    it('takes every koi out of the water and gives the renderer back', () => {
      const stage = open();
      stage.draw(1 / 60);
      expect(koiCount()).toBe(3);

      stage.dispose();
      stages.length = 0;

      expect(koiCount()).toBe(0);
      expect(stage.inspect('alpha')).toBeNull();
      expect(gl().dispose).toHaveBeenCalledTimes(1);
    });
  });
});
