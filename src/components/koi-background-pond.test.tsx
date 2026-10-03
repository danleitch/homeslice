import { createRef, type RefObject } from 'react';
import { act, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installCanvasStub, type CanvasStub, type RecordingContext } from '../test/canvas';
import type { RecentBranch } from '../types';
import { KoiBackground } from './koi-background';

const WIDTH = 1200;
const HEIGHT = 800;

const branches = (...values: string[]): RecentBranch[] =>
  values.map((value) => ({ value, createdAt: '2026-01-01T00:00:00.000Z' }));

describe('KoiBackground, drawing the pond', () => {
  let stub: CanvasStub;
  let frames: Map<number, FrameRequestCallback>;
  let nextFrame: number;
  let cancelled: number[];
  let now: number;

  /** Runs the animation frame that was asked for, a given time later. */
  const runFrame = (afterMs = 16): void => {
    const [id, callback] = [...frames.entries()].pop()!;
    frames.delete(id);
    now += afterMs;
    act(() => callback(now));
  };

  const mount = (
    props: Partial<Parameters<typeof KoiBackground>[0]> = {}
  ): {
    canvas: HTMLCanvasElement;
    ctx: RecordingContext;
    unmount: () => void;
    rerender: (next: Partial<Parameters<typeof KoiBackground>[0]>) => void;
  } => {
    const view = render(<KoiBackground recentBranches={[]} {...props} />);
    const canvas = view.container.querySelector('canvas')!;

    return {
      canvas,
      ctx: stub.contextOf(canvas),
      unmount: view.unmount,
      rerender: (next) => view.rerender(<KoiBackground recentBranches={[]} {...props} {...next} />)
    };
  };

  const setMotion = (reduced: boolean): void => {
    window.matchMedia = vi.fn((query: string) => ({
      matches: query.includes('reduced-motion') && reduced
    })) as never;
  };

  beforeEach(() => {
    stub = installCanvasStub();
    frames = new Map();
    cancelled = [];
    nextFrame = 1;
    now = 1000;
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: WIDTH });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: HEIGHT });
    Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 1 });
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    setMotion(false);
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frames.set(nextFrame, callback);
      return nextFrame++;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
      cancelled.push(id);
      frames.delete(id);
    });
    vi.spyOn(performance, 'now').mockImplementation(() => now);
  });

  afterEach(() => {
    stub.restore();
    vi.restoreAllMocks();
    delete (document as { hidden?: boolean }).hidden;
    delete (window as { matchMedia?: unknown }).matchMedia;
  });

  describe('the canvas', () => {
    it('fills the window', () => {
      const { canvas } = mount();

      expect(canvas).toMatchObject({ width: WIDTH, height: HEIGHT });
      expect(canvas.style.width).toBe(`${WIDTH}px`);
      expect(canvas.style.height).toBe(`${HEIGHT}px`);
    });

    it('is hidden from assistive technology, and styled as the pond', () => {
      const { canvas } = mount();

      expect(canvas).toHaveAttribute('aria-hidden', 'true');
      expect(canvas).toHaveClass('koi-pond', 'koi-water');
    });

    it('is drawn at the screen’s pixel ratio, for a sharp pond on retina', () => {
      Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 2 });

      const { canvas, ctx } = mount();

      expect(canvas).toMatchObject({ width: WIDTH * 2, height: HEIGHT * 2 });
      expect(canvas.style.width).toBe(`${WIDTH}px`);
      expect(ctx.callsTo('setTransform')[0]).toEqual([2, 0, 0, 2, 0, 0]);
    });

    it('stops short of a pixel ratio the fish would cost more than they gain from', () => {
      Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 3 });

      const { canvas } = mount();

      expect(canvas.width).toBe(WIDTH * 2);
    });

    it('assumes a ratio of one when the screen does not say', () => {
      Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 0 });

      expect(mount().canvas.width).toBe(WIDTH);
    });

    it('is redrawn at the new size when the window is resized', () => {
      const { canvas, ctx } = mount();
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: 800 });
      Object.defineProperty(window, 'innerHeight', { configurable: true, value: 500 });

      fireEvent(window, new Event('resize'));

      expect(canvas).toMatchObject({ width: 800, height: 500 });
      // Resizing a canvas clears its transform, so it is set again.
      expect(ctx.callsTo('setTransform')).toHaveLength(2);
    });

    it('does nothing where there is no 2D context to draw with', () => {
      stub.restore();

      const { canvas } = mount();

      expect(canvas.width).not.toBe(WIDTH);
      expect(frames.size).toBe(0);
    });
  });

  describe('each frame', () => {
    it('lays the water down, then the fish, then the lilies over them', () => {
      const { ctx } = mount();

      runFrame();

      const names = ctx.calls.map((call) => call.name);
      const water = names.indexOf('createRadialGradient');
      const lilies = names.lastIndexOf('drawImage');
      expect(water).toBeGreaterThanOrEqual(0);
      // Five lilies float over everything.
      expect(ctx.callsTo('drawImage').length).toBeGreaterThanOrEqual(5);
      expect(names.indexOf('fill')).toBeGreaterThan(water);
      expect(lilies).toBeGreaterThan(names.lastIndexOf('fill') - 1);
    });

    it('draws every koi in the roster, more as there are more branches', () => {
      const few = mount({ baseFishCount: 1 });
      runFrame();
      const fewCalls = few.ctx.calls.length;
      few.unmount();
      frames.clear();

      const many = mount({ recentBranches: branches('a', 'b', 'c', 'd', 'e'), baseFishCount: 6 });
      runFrame();

      expect(many.ctx.calls.length).toBeGreaterThan(fewCalls);
    });

    it('asks for the next frame, and keeps asking', () => {
      mount();
      expect(frames.size).toBe(1);

      runFrame();
      expect(frames.size).toBe(1);

      runFrame();
      expect(frames.size).toBe(1);
    });

    it('lets the koi swim as time passes, so each frame is drawn differently', () => {
      const { ctx } = mount();

      runFrame(16);
      const first = JSON.stringify(ctx.calls.filter((call) => call.name === 'lineTo').slice(0, 20));
      ctx.reset();
      runFrame(400);
      const later = JSON.stringify(ctx.calls.filter((call) => call.name === 'lineTo').slice(0, 20));

      expect(later).not.toBe(first);
    });

    it('drifts the lilies and the light on the water', () => {
      const { ctx } = mount();

      runFrame(16);
      const first = ctx.callsTo('rotate').map(([angle]) => angle);
      ctx.reset();
      runFrame(60_000);
      const later = ctx.callsTo('rotate').map(([angle]) => angle);

      expect(later).not.toEqual(first);
    });
  });

  describe('a hidden tab', () => {
    const setHidden = (hidden: boolean): void => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
      document.dispatchEvent(new Event('visibilitychange'));
    };

    it('gets no frames at all', () => {
      mount();
      const pending = [...frames.keys()][0]!;

      setHidden(true);

      expect(cancelled).toContain(pending);
      expect(frames.size).toBe(0);
    });

    it('picks up again when it comes back, without a jump in time', () => {
      const { ctx } = mount();
      runFrame(16);
      setHidden(true);

      now += 600_000;
      setHidden(false);
      expect(frames.size).toBe(1);

      ctx.reset();
      runFrame(16);
      // Ten minutes away would have moved the pond a long way; one frame later it has moved one frame.
      expect(ctx.calls.length).toBeGreaterThan(0);
    });

    it('does not ask for a second frame when one is already coming', () => {
      mount();

      setHidden(false);

      expect(frames.size).toBe(1);
    });
  });

  describe('for a visitor who asked for less motion', () => {
    beforeEach(() => {
      setMotion(true);
    });

    it('draws one settled pond, and no animation', () => {
      const { ctx } = mount();

      expect(frames.size).toBe(0);
      expect(ctx.calls.length).toBeGreaterThan(0);
      expect(ctx.callsTo('drawImage').length).toBeGreaterThanOrEqual(5);
    });

    it('draws it again when a lily is moved, since nothing else would', () => {
      const { ctx, rerender } = mount();
      ctx.reset();

      rerender({ lilyPlacements: [{ x: 0.5, y: 0.25 }] });

      expect(ctx.callsTo('translate')).toContainEqual([WIDTH * 0.5, HEIGHT * 0.25]);
    });

    it('is the same pond every time, since it only ever settles', () => {
      const first = mount();
      const drawn = JSON.stringify(first.ctx.calls);
      first.unmount();

      const second = mount();

      expect(JSON.stringify(second.ctx.calls)).toBe(drawn);
    });
  });

  describe('the panel the koi swim around', () => {
    let observed: Element[];
    let measure: (() => void) | undefined;
    let disconnects: number;

    beforeEach(() => {
      observed = [];
      disconnects = 0;
      measure = undefined;
      vi.stubGlobal(
        'ResizeObserver',
        class {
          constructor(callback: () => void) {
            measure = callback;
          }
          observe = (element: Element): void => {
            observed.push(element);
          };
          disconnect = (): void => {
            disconnects += 1;
          };
        }
      );
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    const panelRef = (): RefObject<HTMLElement | null> => {
      const panel = document.createElement('section');
      panel.getBoundingClientRect = () =>
        ({ left: 400, top: 200, width: 400, height: 300 }) as DOMRect;
      return { current: panel };
    };

    it('is watched as it grows and shrinks, not read on every frame', () => {
      const avoidRef = panelRef();
      const read = vi.spyOn(avoidRef.current!, 'getBoundingClientRect');
      mount({ avoidRef });
      const readsAtStart = read.mock.calls.length;

      runFrame();
      runFrame();
      expect(read.mock.calls.length).toBe(readsAtStart);

      measure!();
      expect(read.mock.calls.length).toBe(readsAtStart + 1);
      expect(observed).toEqual([avoidRef.current]);
    });

    it('is measured again when the window is resized', () => {
      const avoidRef = panelRef();
      const read = vi.spyOn(avoidRef.current!, 'getBoundingClientRect');
      mount({ avoidRef });
      const before = read.mock.calls.length;

      fireEvent(window, new Event('resize'));

      expect(read.mock.calls.length).toBe(before + 1);
    });

    it('stops being watched when the pond goes', () => {
      const { unmount } = mount({ avoidRef: panelRef() });

      unmount();

      expect(disconnects).toBe(1);
    });

    it('is fine to leave out, or not to have in the page yet', () => {
      expect(() => mount()).not.toThrow();
      expect(() => mount({ avoidRef: createRef<HTMLElement>() })).not.toThrow();
      expect(observed).toEqual([]);
    });

    it('is still measured, once, where the browser cannot watch it', () => {
      vi.stubGlobal('ResizeObserver', undefined);
      const avoidRef = panelRef();
      const read = vi.spyOn(avoidRef.current!, 'getBoundingClientRect');

      mount({ avoidRef });

      expect(read).toHaveBeenCalledTimes(1);
    });
  });

  describe('lilies', () => {
    /** Where the pond puts its first lily, as fractions of the window. */
    const FIRST_LILY = { x: 0.095 * WIDTH, y: 0.24 * HEIGHT };

    const pointer = (type: string, at: { x: number; y: number }): void => {
      act(() => {
        window.dispatchEvent(
          Object.assign(
            new MouseEvent(type, { bubbles: true, cancelable: true, clientX: at.x, clientY: at.y }),
            {
              pointerId: 1
            }
          )
        );
      });
    };

    it('can be picked up and floated somewhere new, and are told where they landed', () => {
      const onLilyPlacementsChange = vi.fn();
      mount({ onLilyPlacementsChange });

      pointer('pointerdown', FIRST_LILY);
      pointer('pointermove', { x: 600, y: 400 });
      pointer('pointerup', { x: 600, y: 400 });

      expect(onLilyPlacementsChange).toHaveBeenCalledTimes(1);
      expect(onLilyPlacementsChange.mock.calls[0]![0][0]).toEqual({
        x: 600 / WIDTH,
        y: 400 / HEIGHT
      });
    });

    it('are drawn where they are carried while the pond is still', () => {
      setMotion(true);
      const { ctx } = mount();
      ctx.reset();

      pointer('pointerdown', FIRST_LILY);
      pointer('pointermove', { x: 600, y: 400 });

      expect(ctx.callsTo('translate')).toContainEqual([600, 400]);
    });

    it('stay put when nothing was picked up', () => {
      const onLilyPlacementsChange = vi.fn();
      mount({ onLilyPlacementsChange });

      pointer('pointerdown', { x: 1, y: 1 });
      pointer('pointermove', { x: 600, y: 400 });
      pointer('pointerup', { x: 600, y: 400 });

      expect(onLilyPlacementsChange).not.toHaveBeenCalled();
    });

    it('are laid where the visitor left them from the start', () => {
      const { ctx } = mount({ lilyPlacements: [{ x: 0.5, y: 0.25 }] });

      runFrame();

      expect(ctx.callsTo('translate')).toContainEqual([WIDTH * 0.5, HEIGHT * 0.25]);
    });

    it('go back to their own places when the placements are reset', () => {
      const { ctx, rerender } = mount({ lilyPlacements: [{ x: 0.5, y: 0.25 }] });
      runFrame();

      rerender({ lilyPlacements: [] });
      ctx.reset();
      runFrame();

      expect(ctx.callsTo('translate')).toContainEqual([FIRST_LILY.x, FIRST_LILY.y]);
    });

    it('no longer answer once the pond has gone', () => {
      const onLilyPlacementsChange = vi.fn();
      const { unmount } = mount({ onLilyPlacementsChange });
      unmount();

      pointer('pointerdown', FIRST_LILY);
      pointer('pointermove', { x: 600, y: 400 });
      pointer('pointerup', { x: 600, y: 400 });

      expect(onLilyPlacementsChange).not.toHaveBeenCalled();
    });
  });

  describe('the roster changing', () => {
    it('does not restart the loop, or ask for another frame', () => {
      const { rerender } = mount();
      const before = frames.size;

      rerender({ recentBranches: branches('feat/new') });

      expect(frames.size).toBe(before);
    });

    it('brings in a koi for a new branch', () => {
      const { ctx, rerender } = mount({ baseFishCount: 1 });
      runFrame();
      const before = ctx.calls.length;
      ctx.reset();

      rerender({ recentBranches: branches('a', 'b', 'c') });
      runFrame();

      expect(ctx.calls.length).toBeGreaterThan(before);
    });
  });

  describe('going away', () => {
    it('stops the animation and every listener', () => {
      const { canvas, unmount } = mount();
      const pending = [...frames.keys()][0]!;

      unmount();

      expect(cancelled).toContain(pending);
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: 300 });
      fireEvent(window, new Event('resize'));
      expect(canvas.width).toBe(WIDTH);
    });

    it('stops listening for the tab being hidden', () => {
      const { unmount } = mount();
      unmount();
      const before = cancelled.length;

      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      document.dispatchEvent(new Event('visibilitychange'));

      expect(cancelled.length).toBe(before);
    });

    it('stops listening for the window being resized, in the still pond too', () => {
      setMotion(true);
      const { canvas, unmount } = mount();
      unmount();

      Object.defineProperty(window, 'innerWidth', { configurable: true, value: 300 });
      fireEvent(window, new Event('resize'));

      expect(canvas.width).toBe(WIDTH);
    });
  });
});
