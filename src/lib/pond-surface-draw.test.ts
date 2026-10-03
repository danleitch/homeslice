import { describe, expect, it } from 'vitest';
import { recordingContext } from '../test/canvas';
import { MAX_PELLETS, PELLET_FLOAT_S, createPondSurface } from './pond-surface';

const RIPPLE_S = 2.1;

const surfaceOf = (width = 800, height = 600): ReturnType<typeof createPondSurface> => {
  const surface = createPondSurface(7);
  surface.resize(width, height);
  return surface;
};

/** The two rings of one ripple, as `[radius, lineWidth, strokeStyle]`. */
const ringsDrawn = (
  surface: ReturnType<typeof createPondSurface>
): [number, unknown, unknown][] => {
  const ctx = recordingContext();
  surface.draw(ctx);

  return ctx
    .callsTo('arc')
    .map((arc, index) => [
      arc[2] as number,
      ctx.calls.filter((call) => call.name === 'set lineWidth')[index]!.args[0],
      ctx.calls.filter((call) => call.name === 'set strokeStyle')[index]!.args[0]
    ]);
};

describe('drawing the surface', () => {
  describe('ripples', () => {
    it('draws nothing on still water', () => {
      const ctx = recordingContext();

      surfaceOf().draw(ctx);

      expect(ctx.calls).toEqual([]);
    });

    it('draws a ring, and a fainter one trailing it', () => {
      const surface = surfaceOf();
      surface.ripple(120, 80);
      const ctx = recordingContext();

      surface.draw(ctx);

      expect(ctx.callsTo('arc')).toEqual([
        [120, 80, 3, 0, Math.PI * 2],
        [120, 80, 3, 0, Math.PI * 2]
      ]);
      expect(ctx.callsTo('stroke')).toHaveLength(2);
    });

    it('starts at full strength and lets it fade as the ring spreads', () => {
      const surface = surfaceOf();
      surface.ripple(100, 100);

      expect(ringsDrawn(surface).map(([, , style]) => style)).toEqual([
        'rgba(222, 244, 238, 0.55)',
        'rgba(222, 244, 238, 0.28)'
      ]);

      surface.step(RIPPLE_S / 2);

      // Halfway through, a quarter of the strength remains.
      expect(ringsDrawn(surface).map(([, , style]) => style)).toEqual([
        'rgba(222, 244, 238, 0.1375)',
        'rgba(222, 244, 238, 0.07)'
      ]);
    });

    it('spreads the first ring at the ripple speed, the second a beat behind', () => {
      const surface = surfaceOf();
      surface.ripple(100, 100);
      surface.step(1);

      const [[first], [second]] = ringsDrawn(surface);

      expect(first).toBeCloseTo(3 + 46);
      expect(second).toBeCloseTo(3 + (1 - 0.22 * RIPPLE_S) * 46);
      expect(second).toBeLessThan(first);
    });

    it('draws a gentle touch smaller, thinner and fainter than a fingertip', () => {
      const gentle = surfaceOf();
      gentle.ripple(100, 100, 0.32);
      const bold = surfaceOf();
      bold.ripple(100, 100, 1);
      gentle.step(1);
      bold.step(1);

      const [[gentleRadius, gentleWidth, gentleStyle]] = ringsDrawn(gentle);
      const [[boldRadius, boldWidth, boldStyle]] = ringsDrawn(bold);

      expect(gentleRadius).toBeLessThan(boldRadius);
      expect(gentleWidth as number).toBeLessThan(boldWidth as number);
      expect(boldWidth).toBeCloseTo(1.4 + 0.8);
      expect(gentleStyle).not.toBe(boldStyle);
    });

    it('stops drawing a ripple once it has finished', () => {
      const surface = surfaceOf();
      surface.ripple(100, 100);
      surface.step(RIPPLE_S + 0.1);
      const ctx = recordingContext();

      surface.draw(ctx);

      expect(ctx.calls).toEqual([]);
    });
  });

  describe('pellets', () => {
    const scattered = (): ReturnType<typeof createPondSurface> => {
      const surface = surfaceOf();
      surface.scatter(400, 300, 60);
      // Past the splashes, with the pellets still floating.
      surface.step(RIPPLE_S + 0.1);
      return surface;
    };

    it('draws each pellet as a shadow and a lit body', () => {
      const surface = scattered();
      const count = surface.food().length;
      const ctx = recordingContext();

      surface.draw(ctx);

      expect(ctx.callsTo('arc')).toHaveLength(count * 2);
      expect(ctx.callsTo('fill')).toHaveLength(count * 2);
      expect(ctx.gradients).toHaveLength(count);
      expect(ctx.gradients[0]!.stops.map(([, colour]) => colour)).toEqual(['#c9975a', '#7a5228']);
    });

    it('draws them solid while they float, with a faint shadow, then restores the alpha', () => {
      const surface = scattered();
      const ctx = recordingContext();

      surface.draw(ctx);

      const alphas = ctx.calls
        .filter((call) => call.name === 'set globalAlpha')
        .map((c) => c.args[0]);
      expect(alphas.slice(0, 3)).toEqual([0.35, 1, 1]);
      expect(ctx.globalAlpha).toBe(1);
    });

    it('fades and shrinks a pellet as it sinks', () => {
      const surface = scattered();
      // Halfway through the four seconds it takes to sink.
      surface.step(PELLET_FLOAT_S - RIPPLE_S - 0.1 + 2);
      const ctx = recordingContext();

      surface.draw(ctx);

      const alphas = ctx.calls
        .filter((call) => call.name === 'set globalAlpha')
        .map((c) => c.args[0]);
      expect(alphas[0]).toBeCloseTo(0.5 * 0.35);
      expect(alphas[1]).toBeCloseTo(0.5);
      expect(ctx.callsTo('arc')[0]![2]).toBeCloseTo(3.1 * (1 - 0.5 * 0.4));
    });

    it('casts the shadow down and to the right of the pellet, and bobs the pellet on the water', () => {
      const surface = scattered();
      const [pellet] = surface.food();
      const arcs = (): unknown[][] => {
        const ctx = recordingContext();
        surface.draw(ctx);
        return ctx.callsTo('arc');
      };

      const [shadow, body] = arcs();

      expect(body![0]).toBe(pellet!.x);
      expect(Math.abs((body![1] as number) - pellet!.y)).toBeLessThanOrEqual(0.5);
      expect((shadow![0] as number) - (body![0] as number)).toBe(1);
      expect((shadow![1] as number) - (body![1] as number)).toBeCloseTo(1.6);

      const heights = new Set<number>();

      for (let tick = 0; tick < 6; tick += 1) {
        surface.step(0.4);
        heights.add(Math.round(((arcs()[1]![1] as number) - pellet!.y) * 1000));
      }

      expect(heights.size).toBeGreaterThan(1);
    });
  });

  describe('the water’s edge', () => {
    it('keeps pellets a few pixels inside a small pond', () => {
      const surface = surfaceOf(50, 40);

      surface.scatter(0, 0, 100);
      surface.scatter(60, 50, 100);

      for (const { x, y } of surface.food()) {
        expect(x).toBeGreaterThanOrEqual(4);
        expect(x).toBeLessThanOrEqual(46);
        expect(y).toBeGreaterThanOrEqual(4);
        expect(y).toBeLessThanOrEqual(36);
      }
    });

    it('keeps pellets in a pond that has not been given a size yet', () => {
      const surface = createPondSurface(3);

      surface.scatter(500, 500, 100);

      for (const { x, y } of surface.food()) {
        expect(x).toBe(4);
        expect(y).toBe(4);
      }
    });
  });

  describe('the number of pellets', () => {
    it('scatters only what fits, and then nothing', () => {
      const surface = surfaceOf();
      let total = 0;

      for (let handful = 0; handful < 10; handful += 1) {
        total += surface.scatter(400, 300, 80);
      }

      expect(total).toBe(MAX_PELLETS);
      expect(surface.scatter(400, 300, 80)).toBe(0);
    });

    it('makes room again once a koi has eaten', () => {
      const surface = surfaceOf();

      while (surface.scatter(400, 300, 80) > 0) {
        // Fill the pond.
      }

      surface.eat(surface.food()[0]!.id);

      expect(surface.scatter(400, 300, 80)).toBe(1);
    });
  });

  describe('eating', () => {
    it('leaves a splash where the pellet was, which keeps the surface busy until it fades', () => {
      const surface = surfaceOf();
      surface.scatter(400, 300, 20);
      surface.step(RIPPLE_S + 0.1);
      const [last, ...others] = surface.food();

      for (const pellet of others) {
        surface.eat(pellet.id);
      }

      // The splashes of the others die away, leaving one floating pellet.
      surface.step(RIPPLE_S + 0.1);
      expect(surface.food()).toHaveLength(1);

      const { id, x, y } = last!;
      surface.eat(id);

      expect(surface.food()).toHaveLength(0);
      expect(surface.busy).toBe(true);

      const ctx = recordingContext();
      surface.draw(ctx);
      expect(ctx.callsTo('arc')[0]!.slice(0, 2)).toEqual([x, y]);

      surface.step(RIPPLE_S + 0.1);
      expect(surface.busy).toBe(false);
    });

    it('ignores a pellet that is already gone', () => {
      const surface = surfaceOf();

      surface.eat(12345);

      expect(surface.busy).toBe(false);
    });
  });

  describe('drift', () => {
    it('eases off as the pellets settle', () => {
      const surface = surfaceOf();
      surface.scatter(400, 300, 20);
      const speed = (): number =>
        surface.food().reduce((total, pellet) => total + Math.hypot(pellet.vx, pellet.vy), 0);

      const fresh = speed();
      surface.step(10);

      expect(speed()).toBeLessThan(fresh);
      expect(speed()).toBeGreaterThan(0);
    });
  });
});
