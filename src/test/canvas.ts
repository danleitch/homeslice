/**
 * A 2D canvas for tests. jsdom has none, so anything that draws would otherwise
 * be untestable; this one writes down what it was asked to do instead.
 */
import { vi } from 'vitest';

export type CanvasCall = {
  name: string;
  args: unknown[];
  /** `globalAlpha` and `globalCompositeOperation` as they stood when the call was made. */
  alpha: number;
  composite: string;
};

export type RecordedGradient = {
  kind: 'linear' | 'radial' | 'conic';
  args: number[];
  stops: [number, string][];
  addColorStop: (offset: number, colour: string) => void;
};

export type RecordingContext = CanvasRenderingContext2D & {
  /** Every method called, in order. Properties being set are recorded as `set <name>`. */
  readonly calls: CanvasCall[];
  /** The gradients made, in order. */
  readonly gradients: RecordedGradient[];
  /** The arguments of every call to one method. */
  callsTo: (name: string) => unknown[][];
  /** Forgets everything recorded so far. */
  reset: () => void;
};

const gradientOf = (kind: RecordedGradient['kind'], args: number[]): RecordedGradient => {
  const gradient: RecordedGradient = {
    kind,
    args,
    stops: [],
    addColorStop: (offset, colour) => {
      gradient.stops.push([offset, colour]);
    }
  };

  return gradient;
};

export const recordingContext = (canvas?: HTMLCanvasElement): RecordingContext => {
  const calls: CanvasCall[] = [];
  const gradients: RecordedGradient[] = [];
  const state: Record<string, unknown> = {
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    fillStyle: '#000000',
    strokeStyle: '#000000',
    lineWidth: 1,
    font: '10px sans-serif'
  };

  const results: Record<string, (...args: unknown[]) => unknown> = {
    createLinearGradient: (...args) => {
      const gradient = gradientOf('linear', args as number[]);
      gradients.push(gradient);
      return gradient;
    },
    createRadialGradient: (...args) => {
      const gradient = gradientOf('radial', args as number[]);
      gradients.push(gradient);
      return gradient;
    },
    createConicGradient: (...args) => {
      const gradient = gradientOf('conic', args as number[]);
      gradients.push(gradient);
      return gradient;
    },
    createPattern: () => ({}),
    measureText: (text) => ({ width: String(text).length * 6 }),
    createImageData: (width, height) => ({
      width,
      height,
      data: new Uint8ClampedArray(Number(width) * Number(height) * 4)
    }),
    getImageData: (_x, _y, width, height) => ({
      width,
      height,
      data: new Uint8ClampedArray(Number(width) * Number(height) * 4)
    })
  };

  const own = {
    canvas,
    calls,
    gradients,
    callsTo: (name: string) => calls.filter((call) => call.name === name).map((call) => call.args),
    reset: () => {
      calls.length = 0;
      gradients.length = 0;
    }
  };

  return new Proxy(own, {
    get(target, property) {
      if (typeof property === 'symbol') {
        return undefined;
      }

      if (property in target) {
        return target[property as keyof typeof target];
      }

      if (property in state) {
        return state[property];
      }

      return (...args: unknown[]) => {
        calls.push({
          name: property,
          args,
          alpha: state.globalAlpha as number,
          composite: state.globalCompositeOperation as string
        });
        return results[property]?.(...args);
      };
    },

    set(_target, property, value) {
      if (typeof property === 'string') {
        state[property] = value;
        calls.push({
          name: `set ${property}`,
          args: [value],
          alpha: state.globalAlpha as number,
          composite: state.globalCompositeOperation as string
        });
      }

      return true;
    }
  }) as unknown as RecordingContext;
};

export type CanvasStub = {
  /** The recording context a canvas draws with, made on first use. */
  contextOf: (canvas: HTMLCanvasElement) => RecordingContext;
  /** Puts back the stub the whole suite starts with, which has no 2D context at all. */
  restore: () => void;
};

/**
 * Gives every canvas a recording 2D context, until restored. A canvas keeps
 * the same context however often it is asked, as a real one does.
 */
export const installCanvasStub = (): CanvasStub => {
  const original = HTMLCanvasElement.prototype.getContext;
  const contexts = new WeakMap<HTMLCanvasElement, RecordingContext>();

  const contextOf = (canvas: HTMLCanvasElement): RecordingContext => {
    let context = contexts.get(canvas);

    if (!context) {
      context = recordingContext(canvas);
      contexts.set(canvas, context);
    }

    return context;
  };

  HTMLCanvasElement.prototype.getContext = vi.fn(function (this: HTMLCanvasElement, kind: string) {
    return kind === '2d' ? contextOf(this) : null;
  }) as never;

  return {
    contextOf,
    restore: () => {
      HTMLCanvasElement.prototype.getContext = original;
    }
  };
};
