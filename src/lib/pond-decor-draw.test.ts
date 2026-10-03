import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installCanvasStub, recordingContext, type CanvasStub } from '../test/canvas';
import {
  LILY_COUNT,
  drawLilies,
  layoutDecor,
  renderBed,
  renderLilies,
  type LilySprites
} from './pond-decor';

const FISH = 100;
const decor = layoutDecor(1400, 900, FISH);

describe('drawing the pond’s furniture', () => {
  let stub: CanvasStub;

  beforeEach(() => {
    stub = installCanvasStub();
  });

  afterEach(() => {
    stub.restore();
  });

  describe('the bed', () => {
    it('sizes its canvas to the viewport at the display’s pixel ratio', () => {
      const bed = renderBed(decor, 1400, 900, 2)!;

      expect(bed.width).toBe(2800);
      expect(bed.height).toBe(1800);
      expect(stub.contextOf(bed).callsTo('scale')).toEqual([[2, 2]]);
    });

    it('never makes a canvas smaller than a pixel', () => {
      const bed = renderBed(decor, 0, 0, 1)!;

      expect(bed.width).toBe(1);
      expect(bed.height).toBe(1);
    });

    it('paints over a bed it was given, rather than making another', () => {
      const first = renderBed(decor, 1400, 900, 1)!;
      const second = renderBed(decor, 1400, 900, 1, first);

      expect(second).toBe(first);
    });

    it('shades the bed under each lily, and shades and paints each stone', () => {
      const ctx = stub.contextOf(renderBed(decor, 1400, 900, 1)!);

      // A shadow per lily; a cast shadow and a body gradient per stone.
      expect(ctx.gradients).toHaveLength(LILY_COUNT + decor.stones.length * 2);
      expect(ctx.callsTo('fillRect')).toHaveLength(LILY_COUNT + decor.stones.length);
      expect(ctx.gradients.every((gradient) => gradient.kind === 'radial')).toBe(true);
    });

    it('throws each lily’s shadow down and to the right of the pad', () => {
      const ctx = stub.contextOf(renderBed(decor, 1400, 900, 1)!);
      const [lily] = decor.lilies;
      const [x, y] = ctx.gradients[0]!.args;

      expect(x).toBeGreaterThan(lily!.x);
      expect(y).toBeGreaterThan(lily!.y);
    });

    it('flecks each stone with moss and grit, kept inside it', () => {
      const ctx = stub.contextOf(renderBed(decor, 1400, 900, 1)!);

      expect(ctx.callsTo('arc')).toHaveLength(decor.stones.length * 26);
      expect(ctx.callsTo('clip')).toHaveLength(decor.stones.length);
    });

    it('balances every save with a restore', () => {
      const ctx = stub.contextOf(renderBed(decor, 1400, 900, 1)!);

      expect(ctx.callsTo('save')).toHaveLength(ctx.callsTo('restore').length);
    });

    it('paints the same bed every time for the same pond', () => {
      const names = (): string[] =>
        stub
          .contextOf(renderBed(decor, 1400, 900, 1, document.createElement('canvas'))!)
          .calls.map((call) => `${call.name}:${JSON.stringify(call.args)}`);

      expect(names()).toEqual(names());
    });
  });

  describe('the lilies', () => {
    const sprites = (ratio = 1): LilySprites => renderLilies(decor, ratio);

    it('paints a sprite for every lily', () => {
      expect(sprites()).toHaveLength(LILY_COUNT);
      expect(sprites().map(({ lily }) => lily)).toEqual(decor.lilies);
    });

    it('sizes each sprite to its pad and a margin for the bloom, at the pixel ratio', () => {
      for (const { lily, sprite } of sprites()) {
        expect(sprite.width).toBe(Math.ceil(lily.radius * 2.5));
        expect(sprite.height).toBe(sprite.width);
      }

      for (const { lily, sprite } of sprites(2)) {
        expect(sprite.width).toBe(Math.ceil(lily.radius * 2.5 * 2));
      }
    });

    it('paints a veined green pad on each', () => {
      for (const { sprite } of sprites()) {
        const ctx = stub.contextOf(sprite);

        expect(ctx.gradients[0]!.kind).toBe('radial');
        expect(ctx.gradients[0]!.stops.map(([, colour]) => colour)).toEqual([
          '#6aa556',
          '#3f7d3c',
          '#2b5e30'
        ]);
        // Fifteen veins, a sheen, and a clip to keep them on the pad.
        expect(ctx.callsTo('stroke')).toHaveLength(1 + 15);
        expect(ctx.callsTo('ellipse')).toHaveLength(1);
        expect(ctx.callsTo('clip')).toHaveLength(1);
      }
    });

    it('opens a flower on the lily that has one: three rings of petals around a golden heart', () => {
      const flowering = sprites().find(({ lily }) => lily.bloom === 'flower')!;
      const ctx = stub.contextOf(flowering.sprite);

      const petals = ctx.gradients.filter((gradient) => gradient.kind === 'linear');
      expect(petals).toHaveLength(8 + 8 + 6);
      // The pad's own arc, the heart, and ten stamens.
      expect(ctx.callsTo('arc')).toHaveLength(1 + 1 + 10);
    });

    it('closes a bud on the lily that has one', () => {
      const budding = sprites().find(({ lily }) => lily.bloom === 'bud')!;
      const ctx = stub.contextOf(budding.sprite);

      expect(ctx.gradients.filter((gradient) => gradient.kind === 'linear')).toHaveLength(1);
      expect(ctx.callsTo('arc')).toHaveLength(1);
    });

    it('leaves the other pads bare', () => {
      const bare = sprites().filter(({ lily }) => lily.bloom === null);

      expect(bare.length).toBeGreaterThan(0);

      for (const { sprite } of bare) {
        expect(
          stub.contextOf(sprite).gradients.every((gradient) => gradient.kind === 'radial')
        ).toBe(true);
      }
    });

    it('draws none when there is no canvas to draw on', () => {
      stub.restore();

      expect(renderLilies(decor, 1)).toEqual([]);
    });
  });

  describe('drawLilies', () => {
    const lilies = (): LilySprites => renderLilies(decor, 1);

    it('lays each lily on the surface at its own place, turned and sized', () => {
      const ctx = recordingContext();
      const sprites = lilies();

      drawLilies(ctx, sprites, 0);

      expect(ctx.callsTo('translate')).toEqual(sprites.map(({ lily }) => [lily.x, lily.y]));

      sprites.forEach(({ lily, sprite }, index) => {
        const size = lily.radius * 2.5;
        expect(ctx.callsTo('drawImage')[index]).toEqual([sprite, -size / 2, -size / 2, size, size]);
      });
    });

    it('draws each lily in its own saved state', () => {
      const ctx = recordingContext();

      drawLilies(ctx, lilies(), 0);

      expect(ctx.callsTo('save')).toHaveLength(LILY_COUNT);
      expect(ctx.callsTo('restore')).toHaveLength(LILY_COUNT);
    });

    it('sways and bobs each pad only very slightly', () => {
      const sprites = lilies();

      for (const elapsed of [0, 5, 31, 120, 999]) {
        const ctx = recordingContext();
        drawLilies(ctx, sprites, elapsed);

        sprites.forEach(({ lily }, index) => {
          const [turn] = ctx.callsTo('rotate')[index] as [number];
          const [bob] = ctx.callsTo('scale')[index] as [number, number];

          expect(Math.abs(turn - lily.rotation)).toBeLessThanOrEqual(0.05 + 1e-9);
          expect(Math.abs(bob - 1)).toBeLessThanOrEqual(0.012 + 1e-9);
        });
      }
    });

    it('lets the pads drift as time passes', () => {
      const sprites = lilies();
      const turns = (elapsed: number): unknown[][] => {
        const ctx = recordingContext();
        drawLilies(ctx, sprites, elapsed);
        return ctx.callsTo('rotate');
      };

      expect(turns(0)).not.toEqual(turns(10));
      expect(turns(10)).toEqual(turns(10));
    });

    it('draws nothing when there are no lilies', () => {
      const ctx = recordingContext();

      drawLilies(ctx, [], 3);

      expect(ctx.calls).toEqual([]);
    });
  });
});
