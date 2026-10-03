import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installCanvasStub, recordingContext, type CanvasStub } from '../test/canvas';
import { LILY_COUNT } from './pond-decor';
import { createPondScenery, type PondScenery } from './pond-scenery';

const WIDTH = 1400;
const HEIGHT = 900;
const FISH = 300;

describe('the pond’s scenery', () => {
  let stub: CanvasStub;
  let scenery: PondScenery;

  const laidOut = (): PondScenery => {
    const made = createPondScenery();
    made.layout(WIDTH, HEIGHT, 1, FISH);
    return made;
  };

  beforeEach(() => {
    stub = installCanvasStub();
    scenery = createPondScenery();
  });

  afterEach(() => {
    stub.restore();
  });

  describe('layout', () => {
    it('has no bed until it has been laid out', () => {
      expect(scenery.bed).toBeNull();
    });

    it('paints a bed the size of the viewport at the pixel ratio', () => {
      scenery.layout(WIDTH, HEIGHT, 2, FISH);

      expect(scenery.bed).toMatchObject({ width: WIDTH * 2, height: HEIGHT * 2 });
    });

    it('keeps the same bed canvas when laid out again, so the water’s copy stays current', () => {
      scenery.layout(WIDTH, HEIGHT, 1, FISH);
      const bed = scenery.bed;

      scenery.layout(800, 600, 1, FISH);

      expect(scenery.bed).toBe(bed);
      expect(scenery.bed).toMatchObject({ width: 800, height: 600 });
    });

    it('sizes the surface to the viewport, so pellets stay on the water', () => {
      scenery.layout(100, 100, 1, FISH);

      scenery.surface.scatter(500, 500, 50);

      for (const { x, y } of scenery.surface.food()) {
        expect(x).toBeLessThanOrEqual(96);
        expect(y).toBeLessThanOrEqual(96);
      }
    });

    it('has no bed to give where canvases cannot draw', () => {
      stub.restore();
      const bare = createPondScenery();

      bare.layout(WIDTH, HEIGHT, 1, FISH);

      expect(bare.bed).toBeNull();
      expect(bare.lilyAt(133, 216)).toBeNull();
    });
  });

  describe('lilyAt', () => {
    it('finds the lily under a point, with its centre', () => {
      const pond = laidOut();

      expect(pond.lilyAt(0.095 * WIDTH, 0.24 * HEIGHT)).toEqual({
        index: 0,
        x: 0.095 * WIDTH,
        y: 0.24 * HEIGHT
      });
    });

    it('finds the lily anywhere inside its pad, and not a pixel outside', () => {
      const pond = laidOut();
      const radius = 0.32 * FISH;
      const [x, y] = [0.095 * WIDTH, 0.24 * HEIGHT];

      expect(pond.lilyAt(x + radius - 0.5, y)).toMatchObject({ index: 0 });
      expect(pond.lilyAt(x + radius + 0.5, y)).toBeNull();
    });

    it('prefers the lily drawn on top where two pads overlap', () => {
      const pond = laidOut();

      // Inside both the first and second pads; the second is drawn later, so it is on top.
      expect(pond.lilyAt(190, 270)).toMatchObject({ index: 1 });
    });

    it('finds only water in open water', () => {
      expect(laidOut().lilyAt(700, 450)).toBeNull();
    });

    it('finds nothing before the pond has been laid out', () => {
      expect(scenery.lilyAt(133, 216)).toBeNull();
    });
  });

  describe('moveLily', () => {
    it('floats a lily to a new place, remembering where as a share of the viewport', () => {
      const pond = laidOut();

      const placements = pond.moveLily(2, 700, 225);

      expect(placements[2]).toEqual({ x: 0.5, y: 0.25 });
      expect(pond.lilyAt(700, 225)).toMatchObject({ index: 2, x: 700, y: 225 });
    });

    it('leaves every other lily where it was', () => {
      const pond = laidOut();
      const before = pond.lilyAt(0.095 * WIDTH, 0.24 * HEIGHT);

      const placements = pond.moveLily(2, 700, 225);

      expect(placements).toHaveLength(3);
      expect(placements[0]).toBeUndefined();
      expect(pond.lilyAt(0.095 * WIDTH, 0.24 * HEIGHT)).toEqual(before);
    });

    it('accumulates placements as lilies are moved one after another', () => {
      const pond = laidOut();

      pond.moveLily(0, 300, 300);
      const placements = pond.moveLily(1, 600, 600);

      expect(placements[0]).toEqual({ x: 300 / WIDTH, y: 300 / HEIGHT });
      expect(placements[1]).toEqual({ x: 600 / WIDTH, y: 600 / HEIGHT });
    });

    it('keeps a lily inside the pond however far it is dragged', () => {
      const pond = laidOut();

      expect(pond.moveLily(0, -500, 5000)[0]).toEqual({ x: 0, y: 1 });
      expect(pond.moveLily(0, 9000, -9000)[0]).toEqual({ x: 1, y: 0 });
    });

    it('moves the lily’s shadow on the bed too', () => {
      const pond = laidOut();
      const ctx = stub.contextOf(pond.bed!);
      ctx.reset();

      pond.moveLily(0, 300, 300);

      expect(pond.bed).toBe(stub.contextOf(pond.bed!).canvas);
      expect(ctx.callsTo('scale')).toHaveLength(1);
      expect(ctx.gradients.length).toBeGreaterThan(0);
    });

    it('changes nothing for a lily that is not there', () => {
      const pond = laidOut();
      const before = pond.moveLily(0, 300, 300);

      expect(pond.moveLily(LILY_COUNT + 4, 10, 10)).toBe(before);
      expect(pond.moveLily(-1, 10, 10)).toBe(before);
    });

    it('changes nothing before the pond has been laid out', () => {
      expect(scenery.moveLily(0, 10, 10)).toEqual([]);
    });

    it('changes nothing in a pond with no size', () => {
      scenery.layout(0, 0, 1, FISH);

      expect(scenery.moveLily(0, 10, 10)).toEqual([]);
    });
  });

  describe('placeLilies', () => {
    it('puts the lilies where the visitor left them', () => {
      const pond = laidOut();

      pond.placeLilies([null, null, { x: 0.5, y: 0.25 }]);

      expect(pond.lilyAt(700, 225)).toMatchObject({ index: 2 });
    });

    it('sends a lily that is no longer placed back to its own spot', () => {
      const pond = laidOut();
      const home = pond.lilyAt(0.095 * WIDTH, 0.24 * HEIGHT);

      pond.placeLilies([{ x: 0.5, y: 0.5 }]);
      expect(pond.lilyAt(0.095 * WIDTH, 0.24 * HEIGHT)).toBeNull();

      pond.placeLilies([]);
      expect(pond.lilyAt(0.095 * WIDTH, 0.24 * HEIGHT)).toEqual(home);
    });

    it('is remembered for when the pond is laid out', () => {
      scenery.placeLilies([{ x: 0.5, y: 0.25 }]);
      scenery.layout(WIDTH, HEIGHT, 1, FISH);

      expect(scenery.lilyAt(700, 225)).toMatchObject({ index: 0 });
    });

    it('is kept, as a share of the viewport, when the window is resized', () => {
      scenery.placeLilies([{ x: 0.5, y: 0.25 }]);
      scenery.layout(WIDTH, HEIGHT, 1, FISH);
      scenery.layout(700, 450, 1, FISH);

      expect(scenery.lilyAt(350, 112.5)).toMatchObject({ index: 0 });
    });
  });

  describe('drawSurface', () => {
    it('draws the ripples, then the lilies over them', () => {
      const pond = laidOut();
      pond.surface.ripple(700, 450);
      const ctx = recordingContext();

      pond.drawSurface(ctx, 0);

      const names = ctx.calls.map((call) => call.name);
      expect(ctx.callsTo('arc')).toHaveLength(2);
      expect(ctx.callsTo('drawImage')).toHaveLength(LILY_COUNT);
      expect(names.indexOf('stroke')).toBeLessThan(names.indexOf('drawImage'));
    });

    it('draws only the lilies on still water', () => {
      const ctx = recordingContext();

      laidOut().drawSurface(ctx, 4);

      expect(ctx.callsTo('arc')).toHaveLength(0);
      expect(ctx.callsTo('drawImage')).toHaveLength(LILY_COUNT);
    });

    it('draws no lilies before the pond has been laid out', () => {
      const ctx = recordingContext();

      scenery.drawSurface(ctx, 0);

      expect(ctx.calls).toEqual([]);
    });

    it('draws a lily where it has been moved to', () => {
      const pond = laidOut();
      pond.moveLily(0, 700, 225);
      const ctx = recordingContext();

      pond.drawSurface(ctx, 0);

      expect(ctx.callsTo('translate')).toContainEqual([700, 225]);
    });
  });
});
