import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MASONRY_ROW_PX, useJoinedRef, useMasonryRef } from './use-masonry';

type Observation = {
  callback: () => void;
  observe: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
};

describe('useMasonryRef', () => {
  let observers: Observation[];
  let grid: HTMLElement;
  let item: HTMLElement;
  let height: number;

  const measuredAs = (pixels: number): void => {
    height = pixels;
  };

  const attach = (): ((element: HTMLElement | null) => void) =>
    renderHook(() => useMasonryRef()).result.current;

  beforeEach(() => {
    observers = [];
    height = 100;
    vi.stubGlobal(
      'ResizeObserver',
      class {
        callback: () => void;
        observe = vi.fn();
        disconnect = vi.fn();

        constructor(callback: () => void) {
          this.callback = callback;
          observers.push(this);
        }
      }
    );
    vi.spyOn(window, 'getComputedStyle').mockReturnValue({
      columnGap: '16px'
    } as CSSStyleDeclaration);

    grid = document.createElement('div');
    item = document.createElement('div');
    Object.defineProperty(item, 'offsetHeight', { get: () => height });
    grid.append(item);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('spans as many rows as the item’s height and the gap need', () => {
    attach()(item);

    expect(item.style.getPropertyValue('--rows')).toBe(
      String(Math.ceil((100 + 16) / MASONRY_ROW_PX))
    );
  });

  it('is two pixels to a row', () => {
    expect(MASONRY_ROW_PX).toBe(2);
  });

  it('rounds up, so the item never overlaps what is below it', () => {
    measuredAs(101);

    attach()(item);

    expect(item.style.getPropertyValue('--rows')).toBe('59');
  });

  it('never spans less than one row, even for an item with no height', () => {
    vi.mocked(window.getComputedStyle).mockReturnValue({ columnGap: '0px' } as CSSStyleDeclaration);
    measuredAs(0);

    attach()(item);

    expect(item.style.getPropertyValue('--rows')).toBe('1');
  });

  it('allows for no gap when the grid does not say what it is', () => {
    vi.mocked(window.getComputedStyle).mockReturnValue({
      columnGap: 'normal'
    } as CSSStyleDeclaration);

    attach()(item);

    expect(item.style.getPropertyValue('--rows')).toBe('50');
  });

  it('allows for no gap when the item is not in a grid at all', () => {
    const loose = document.createElement('div');
    Object.defineProperty(loose, 'offsetHeight', { get: () => 100 });

    attach()(loose);

    expect(loose.style.getPropertyValue('--rows')).toBe('50');
  });

  it('measures the item again as it grows and shrinks', () => {
    attach()(item);
    expect(observers[0]!.observe).toHaveBeenCalledWith(item);

    measuredAs(300);
    observers[0]!.callback();
    expect(item.style.getPropertyValue('--rows')).toBe('158');

    measuredAs(40);
    observers[0]!.callback();
    expect(item.style.getPropertyValue('--rows')).toBe('28');
  });

  it('leaves the style alone when the span has not changed', () => {
    const setProperty = vi.spyOn(item.style, 'setProperty');
    attach()(item);
    setProperty.mockClear();

    observers[0]!.callback();

    expect(setProperty).not.toHaveBeenCalled();
  });

  it('stops watching an item that has gone', () => {
    const ref = attach();
    ref(item);

    ref(null);

    expect(observers[0]!.disconnect).toHaveBeenCalledTimes(1);
    expect(observers).toHaveLength(1);
  });

  it('watches one item at a time, handing over from the old to the new', () => {
    const ref = attach();
    const other = document.createElement('div');
    grid.append(other);
    ref(item);

    ref(other);

    expect(observers[0]!.disconnect).toHaveBeenCalledTimes(1);
    expect(observers[1]!.observe).toHaveBeenCalledWith(other);
  });

  it('does nothing in a browser without ResizeObserver', () => {
    vi.stubGlobal('ResizeObserver', undefined);

    expect(() => attach()(item)).not.toThrow();
    expect(item.style.getPropertyValue('--rows')).toBe('');
  });

  it('keeps the same ref across renders, so React does not detach and reattach it', () => {
    const { result, rerender } = renderHook(() => useMasonryRef());
    const first = result.current;

    rerender();

    expect(result.current).toBe(first);
  });
});

describe('useJoinedRef', () => {
  it('hands the element to every ref it was given, in order', () => {
    const calls: string[] = [];
    const first = vi.fn(() => calls.push('first'));
    const second = vi.fn(() => calls.push('second'));
    const { result } = renderHook(() => useJoinedRef<HTMLElement>(first, second));
    const element = document.createElement('div');

    result.current(element);

    expect(first).toHaveBeenCalledWith(element);
    expect(second).toHaveBeenCalledWith(element);
    expect(calls).toEqual(['first', 'second']);
  });

  it('lets go of them all when the element goes', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { result } = renderHook(() => useJoinedRef<HTMLElement>(first, second));

    result.current(null);

    expect(first).toHaveBeenCalledWith(null);
    expect(second).toHaveBeenCalledWith(null);
  });

  it('keeps one stable ref but calls whichever refs it was last given', () => {
    const old = vi.fn();
    const latest = vi.fn();
    const { result, rerender } = renderHook(({ ref }) => useJoinedRef<HTMLElement>(ref), {
      initialProps: { ref: old }
    });
    const stable = result.current;

    rerender({ ref: latest });
    result.current(document.createElement('div'));

    expect(result.current).toBe(stable);
    expect(old).not.toHaveBeenCalled();
    expect(latest).toHaveBeenCalledTimes(1);
  });

  it('is happy with no refs at all', () => {
    const { result } = renderHook(() => useJoinedRef<HTMLElement>());

    expect(() => result.current(document.createElement('div'))).not.toThrow();
  });
});
