import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EDGE_PX, MAX_SCROLL_PX, scrollFor, useEdgeScroll } from './use-edge-scroll';

describe('how far to scroll', () => {
  const height = 800;

  it('is not at all while the pointer is away from the edges', () => {
    expect(scrollFor(EDGE_PX, height)).toBe(0);
    expect(scrollFor(400, height)).toBe(0);
    expect(scrollFor(height - EDGE_PX, height)).toBe(0);
  });

  it('is up near the top, and down near the bottom', () => {
    expect(scrollFor(EDGE_PX - 10, height)).toBeLessThan(0);
    expect(scrollFor(height - EDGE_PX + 10, height)).toBeGreaterThan(0);
  });

  it('is faster the nearer the edge', () => {
    expect(scrollFor(10, height)).toBeLessThan(scrollFor(60, height));
    expect(scrollFor(height - 10, height)).toBeGreaterThan(scrollFor(height - 60, height));
  });

  it('is the most at the edge itself, and no more past it', () => {
    expect(scrollFor(0, height)).toBe(-MAX_SCROLL_PX);
    expect(scrollFor(-300, height)).toBe(-MAX_SCROLL_PX);
    expect(scrollFor(height, height)).toBe(MAX_SCROLL_PX);
    expect(scrollFor(height + 300, height)).toBe(MAX_SCROLL_PX);
  });
});

describe('useEdgeScroll', () => {
  let frames: Map<number, FrameRequestCallback>;
  let scrollY: number;
  let scrollBy: ReturnType<typeof vi.fn>;
  let cancel: ReturnType<typeof vi.spyOn>;

  /** Runs the frames asked for so far, as the browser would on its next. */
  const tick = (): void => {
    const due = [...frames.values()];
    frames.clear();
    act(() => {
      due.forEach((frame) => frame(0));
    });
  };

  const pointerAt = (x: number, y: number): void => {
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: x, clientY: y }));
  };

  beforeEach(() => {
    frames = new Map();
    let last = 0;
    scrollY = 500;
    scrollBy = vi.fn((_x: number, y: number) => {
      scrollY = Math.max(0, scrollY + y);
    });
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      last += 1;
      frames.set(last, callback);
      return last;
    });
    // A frame that has been cancelled does not run.
    cancel = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
      frames.delete(id);
    });
    Object.defineProperty(window, 'scrollY', { configurable: true, get: () => scrollY });
    window.scrollBy = scrollBy as never;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete (window as { scrollY?: number }).scrollY;
  });

  it('does nothing until the pointer has been seen', () => {
    const { result } = renderHook(() => useEdgeScroll());

    result.current.start();
    tick();

    expect(scrollBy).not.toHaveBeenCalled();
  });

  it('scrolls up while the pointer is held near the top', () => {
    const { result } = renderHook(() => useEdgeScroll());
    result.current.start();

    pointerAt(300, 10);
    tick();

    expect(scrollBy).toHaveBeenCalledWith(0, expect.any(Number));
    expect(scrollBy.mock.calls[0]![1]).toBeLessThan(0);
  });

  it('scrolls down while it is held near the bottom', () => {
    const { result } = renderHook(() => useEdgeScroll());
    result.current.start();

    pointerAt(300, window.innerHeight - 5);
    tick();

    expect(scrollBy.mock.calls[0]![1]).toBeGreaterThan(0);
  });

  it('leaves the page alone while the pointer is in the middle', () => {
    const { result } = renderHook(() => useEdgeScroll());
    result.current.start();

    pointerAt(300, window.innerHeight / 2);
    tick();

    expect(scrollBy).not.toHaveBeenCalled();
  });

  it('keeps going, a frame at a time, as long as the pointer stays there', () => {
    const { result } = renderHook(() => useEdgeScroll());
    result.current.start();
    pointerAt(300, 10);

    tick();
    tick();
    tick();

    expect(scrollBy).toHaveBeenCalledTimes(3);
    expect(scrollY).toBeLessThan(500);
  });

  it('tells the grid the pointer is where it was, so the card follows the page', () => {
    const heard: MouseEvent[] = [];
    const listener = (event: Event): void => {
      heard.push(event as MouseEvent);
    };
    document.addEventListener('mousemove', listener);
    const { result } = renderHook(() => useEdgeScroll());
    result.current.start();
    pointerAt(300, 10);
    heard.length = 0;

    tick();

    expect(heard).toHaveLength(1);
    expect(heard[0]).toMatchObject({ clientX: 300, clientY: 10 });
    document.removeEventListener('mousemove', listener);
  });

  it('does not tell it anything when the page cannot scroll any further', () => {
    scrollY = 0;
    const heard = vi.fn();
    document.addEventListener('mousemove', heard);
    const { result } = renderHook(() => useEdgeScroll());
    result.current.start();
    pointerAt(300, 10);
    heard.mockClear();

    tick();

    expect(scrollBy).toHaveBeenCalled();
    expect(heard).not.toHaveBeenCalled();
    document.removeEventListener('mousemove', heard);
  });

  it('stops when told to, and no longer follows the pointer', () => {
    const { result } = renderHook(() => useEdgeScroll());
    result.current.start();
    pointerAt(300, 10);
    tick();
    scrollBy.mockClear();

    result.current.stop();
    pointerAt(300, 5);
    tick();

    expect(cancel).toHaveBeenCalled();
    expect(scrollBy).not.toHaveBeenCalled();
  });

  it('has nothing to stop before it has started, or after it has stopped', () => {
    const { result } = renderHook(() => useEdgeScroll());

    expect(() => {
      result.current.stop();
      result.current.start();
      result.current.stop();
      result.current.stop();
    }).not.toThrow();
  });

  it('starts afresh when started again, rather than running twice', () => {
    const { result } = renderHook(() => useEdgeScroll());
    result.current.start();
    result.current.start();
    pointerAt(300, 10);

    tick();

    // The first start's frame was cancelled by the second, so only one loop runs.
    expect(scrollBy).toHaveBeenCalledTimes(1);
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('stops when the board goes', () => {
    const { result, unmount } = renderHook(() => useEdgeScroll());
    result.current.start();
    pointerAt(300, 10);

    unmount();
    tick();

    expect(cancel).toHaveBeenCalled();
    expect(scrollBy).not.toHaveBeenCalled();
  });
});
