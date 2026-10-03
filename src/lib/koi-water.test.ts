import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createWater } from './koi-water';

/** Records what is drawn, and keeps the pixels the caustic sheet is rasterised into. */
const makeContext = (): {
  ctx: CanvasRenderingContext2D;
  calls: [string, ...unknown[]][];
  gradient: { addColorStop: ReturnType<typeof vi.fn> };
  alphaAtDraw: number[];
  compositeAtDraw: string[];
} => {
  const calls: [string, ...unknown[]][] = [];
  const alphaAtDraw: number[] = [];
  const compositeAtDraw: string[] = [];
  const gradient = { addColorStop: vi.fn() };
  const state = {
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    fillStyle: '' as unknown
  };

  const ctx = {
    get globalAlpha() {
      return state.globalAlpha;
    },
    set globalAlpha(value: number) {
      state.globalAlpha = value;
    },
    get globalCompositeOperation() {
      return state.globalCompositeOperation;
    },
    set globalCompositeOperation(value: string) {
      state.globalCompositeOperation = value;
    },
    get fillStyle() {
      return state.fillStyle;
    },
    set fillStyle(value: unknown) {
      state.fillStyle = value;
    },
    createRadialGradient: (...args: unknown[]) => {
      calls.push(['createRadialGradient', ...args]);
      return gradient;
    },
    fillRect: (...args: unknown[]) => calls.push(['fillRect', state.fillStyle, ...args]),
    drawImage: (...args: unknown[]) => {
      alphaAtDraw.push(state.globalAlpha);
      compositeAtDraw.push(state.globalCompositeOperation);
      calls.push(['drawImage', ...args]);
    },
    save: () => calls.push(['save']),
    restore: () => calls.push(['restore'])
  } as unknown as CanvasRenderingContext2D;

  return { ctx, calls, gradient, alphaAtDraw, compositeAtDraw };
};

/** A canvas whose 2D context can rasterise: it hands back real pixel storage. */
const stubSheetContext = (): { putImageData: ReturnType<typeof vi.fn> } => {
  const putImageData = vi.fn();

  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
    createImageData: (width: number, height: number) => ({
      width,
      height,
      data: new Uint8ClampedArray(width * height * 4)
    }),
    putImageData
  })) as never;

  return { putImageData };
};

const drawnSheets = (calls: [string, ...unknown[]][]): unknown[][] =>
  calls.filter(([name]) => name === 'drawImage').map(([, ...args]) => args);

describe('createWater', () => {
  const realGetContext = HTMLCanvasElement.prototype.getContext;

  beforeEach(() => {
    HTMLCanvasElement.prototype.getContext = vi.fn(() => null) as never;
  });

  afterEach(() => {
    HTMLCanvasElement.prototype.getContext = realGetContext;
  });

  describe('the water itself', () => {
    it('fills the whole pond with a gradient from shallow to deep', () => {
      const { ctx, calls, gradient } = makeContext();
      createWater().draw(ctx, 800, 600, 0);

      expect(calls[0]).toEqual(['createRadialGradient', 400, 252, 0, 400, 252, 600]);
      expect(gradient.addColorStop).toHaveBeenNthCalledWith(1, 0, '#31555b');
      expect(gradient.addColorStop).toHaveBeenNthCalledWith(2, 1, '#16302f');
      expect(calls).toContainEqual(['fillRect', gradient, 0, 0, 800, 600]);
    });

    it('sizes the gradient to the longer side of a tall pond', () => {
      const { ctx, calls } = makeContext();
      createWater().draw(ctx, 400, 1000, 0);

      expect(calls[0]).toEqual(['createRadialGradient', 200, 420, 0, 200, 420, 750]);
    });

    it('draws no caustics before it has been sized', () => {
      const { ctx, calls } = makeContext();
      createWater().draw(ctx, 800, 600, 0);

      expect(drawnSheets(calls)).toHaveLength(0);
    });
  });

  describe('the bed', () => {
    it('lays whatever was set on the bed over the water, stretched to the pond', () => {
      const { ctx, calls } = makeContext();
      const water = createWater();
      const bed = document.createElement('canvas');
      water.setBed(bed);

      water.draw(ctx, 800, 600, 0);

      const names = calls.map(([name]) => name);
      expect(drawnSheets(calls)).toEqual([[bed, 0, 0, 800, 600]]);
      expect(names.indexOf('fillRect')).toBeLessThan(names.indexOf('drawImage'));
    });

    it('draws nothing on the bed once it has been taken away', () => {
      const { ctx, calls } = makeContext();
      const water = createWater();
      water.setBed(document.createElement('canvas'));
      water.setBed(null);

      water.draw(ctx, 800, 600, 0);

      expect(drawnSheets(calls)).toHaveLength(0);
    });
  });

  describe('the caustics', () => {
    it('rasterises a soft sheet once, a third the size of the pond plus its margin', () => {
      const { putImageData } = stubSheetContext();
      const water = createWater();

      water.resize(900, 600);

      expect(putImageData).toHaveBeenCalledTimes(1);
      const [image] = putImageData.mock.calls[0]!;
      expect(image).toMatchObject({ width: 390, height: 260 });
    });

    it('paints white light that fades to nothing between the filaments', () => {
      const { putImageData } = stubSheetContext();
      createWater().resize(300, 200);

      const { data } = putImageData.mock.calls[0]![0] as { data: Uint8ClampedArray };
      const alphas = Array.from(
        { length: data.length / 4 },
        (_unused, index) => data[index * 4 + 3]!
      );

      expect(data[0]).toBe(210);
      expect(data[1]).toBe(245);
      expect(data[2]).toBe(235);
      expect(Math.max(...alphas)).toBeGreaterThan(100);
      expect(Math.min(...alphas)).toBeLessThan(20);
    });

    it('drifts two layers over the water with additive light', () => {
      stubSheetContext();
      const { ctx, calls, alphaAtDraw, compositeAtDraw } = makeContext();
      const water = createWater();
      water.resize(800, 600);

      water.draw(ctx, 800, 600, 0);

      expect(drawnSheets(calls)).toHaveLength(2);
      expect(compositeAtDraw).toEqual(['lighter', 'lighter']);
      expect(alphaAtDraw[0]).toBeCloseTo(0.11);
      expect(alphaAtDraw[1]).toBeCloseTo(0.077);
    });

    it('draws the sheet larger than the pond, so there is room to drift', () => {
      stubSheetContext();
      const { ctx, calls } = makeContext();
      const water = createWater();
      water.resize(800, 600);

      water.draw(ctx, 800, 600, 0);

      for (const [, , , width, height] of drawnSheets(calls)) {
        expect(width).toBeCloseTo(1040);
        expect(height).toBeCloseTo(780);
      }
    });

    it('moves the layers as time passes, at different speeds', () => {
      stubSheetContext();
      const water = createWater();
      water.resize(800, 600);

      const positions = (elapsed: number): number[][] => {
        const { ctx, calls } = makeContext();
        water.draw(ctx, 800, 600, elapsed);
        return drawnSheets(calls).map(([, x, y]) => [x as number, y as number]);
      };
      const start = positions(0);
      const later = positions(120);

      expect(later[0]).not.toEqual(start[0]);
      expect(later[1]).not.toEqual(start[1]);
      expect(later[0]![0]! - start[0]![0]!).not.toBeCloseTo(later[1]![0]! - start[1]![0]!);
    });

    it('keeps the drift inside the margin the sheet was given', () => {
      stubSheetContext();
      const water = createWater();
      water.resize(800, 600);

      for (let elapsed = 0; elapsed < 600; elapsed += 7) {
        const { ctx, calls } = makeContext();
        water.draw(ctx, 800, 600, elapsed);

        for (const [, x, y, width, height] of drawnSheets(calls)) {
          // The sheet must still cover the whole pond.
          expect(x as number).toBeLessThanOrEqual(0);
          expect(y as number).toBeLessThanOrEqual(0);
          expect((x as number) + (width as number)).toBeGreaterThanOrEqual(800);
          expect((y as number) + (height as number)).toBeGreaterThanOrEqual(600);
        }
      }
    });

    it('balances every save with a restore', () => {
      stubSheetContext();
      const { ctx, calls } = makeContext();
      const water = createWater();
      water.resize(800, 600);

      water.draw(ctx, 800, 600, 3);

      expect(calls.filter(([name]) => name === 'save')).toHaveLength(1);
      expect(calls.filter(([name]) => name === 'restore')).toHaveLength(1);
    });

    it('draws no caustics when the canvas cannot be rasterised', () => {
      const { ctx, calls } = makeContext();
      const water = createWater();
      water.resize(800, 600);

      water.draw(ctx, 800, 600, 0);

      expect(drawnSheets(calls)).toHaveLength(0);
    });

    it('drops the sheet when the pond has no size', () => {
      stubSheetContext();
      const { ctx, calls } = makeContext();
      const water = createWater();
      water.resize(800, 600);
      water.resize(0, 0);

      water.draw(ctx, 800, 600, 0);

      expect(drawnSheets(calls)).toHaveLength(0);
    });

    it('never makes a sheet smaller than a pixel', () => {
      const { putImageData } = stubSheetContext();
      createWater().resize(1, 1);

      expect(putImageData.mock.calls[0]![0]).toMatchObject({ width: 1, height: 1 });
    });
  });
});
