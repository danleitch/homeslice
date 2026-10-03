import { renderHook } from '@testing-library/react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GRID_COLUMNS, MIN_SPAN } from '../lib/model';
import { useSpanResize } from './use-span-resize';

// A 1,200px grid with 12px gaps: twelve columns of 89px, 101px from one to the next.
const GRID_WIDTH = 1200;
const GAP = 12;
const COLUMN_STEP = 89 + GAP;

const makeGrid = (): HTMLElement => {
  const grid = document.createElement('div');
  Object.defineProperty(grid, 'clientWidth', { value: GRID_WIDTH });
  return grid;
};

type Press = {
  event: ReactPointerEvent<HTMLElement>;
  handle: HTMLElement;
  preventDefault: ReturnType<typeof vi.fn>;
  stopPropagation: ReturnType<typeof vi.fn>;
};

const press = (overrides: { button?: number; clientX?: number } = {}): Press => {
  const handle = document.createElement('div');
  handle.setPointerCapture = vi.fn();
  const preventDefault = vi.fn();
  const stopPropagation = vi.fn();

  return {
    handle,
    preventDefault,
    stopPropagation,
    event: {
      button: overrides.button ?? 0,
      clientX: overrides.clientX ?? 500,
      pointerId: 7,
      currentTarget: handle,
      preventDefault,
      stopPropagation
    } as unknown as ReactPointerEvent<HTMLElement>
  };
};

const dragTo = (handle: HTMLElement, clientX: number): void => {
  handle.dispatchEvent(new MouseEvent('pointermove', { clientX }));
};

describe('useSpanResize', () => {
  beforeEach(() => {
    vi.spyOn(window, 'getComputedStyle').mockReturnValue({
      columnGap: `${GAP}px`
    } as CSSStyleDeclaration);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const setup = (
    span = 4,
    grid: HTMLElement | null = makeGrid()
  ): {
    start: (event: ReactPointerEvent<HTMLElement>) => void;
    onSpan: ReturnType<typeof vi.fn>;
    onResizing: ReturnType<typeof vi.fn>;
  } => {
    const onSpan = vi.fn();
    const onResizing = vi.fn();
    const { result } = renderHook(() => useSpanResize({ current: grid }, span, onSpan, onResizing));

    return { start: result.current, onSpan, onResizing };
  };

  it('captures the pointer and reports that a resize has begun', () => {
    const { start, onResizing } = setup();
    const { event, handle, preventDefault, stopPropagation } = press();

    start(event);

    expect(handle.setPointerCapture).toHaveBeenCalledWith(7);
    expect(onResizing).toHaveBeenCalledExactlyOnceWith(true);
    expect(preventDefault).toHaveBeenCalled();
    expect(stopPropagation).toHaveBeenCalled();
  });

  it('snaps to the column the pointer has reached, wider and narrower', () => {
    const { start, onSpan } = setup(4);
    const { event, handle } = press({ clientX: 500 });

    start(event);
    dragTo(handle, 500 + COLUMN_STEP);
    expect(onSpan).toHaveBeenLastCalledWith(5);

    dragTo(handle, 500 + 3 * COLUMN_STEP);
    expect(onSpan).toHaveBeenLastCalledWith(7);

    dragTo(handle, 500 - COLUMN_STEP);
    expect(onSpan).toHaveBeenLastCalledWith(3);
  });

  it('snaps only once the pointer is past the halfway point', () => {
    const { start, onSpan } = setup(4);
    const { event, handle } = press({ clientX: 500 });

    start(event);
    dragTo(handle, 500 + Math.floor(COLUMN_STEP / 2) - 1);
    expect(onSpan).not.toHaveBeenCalled();

    dragTo(handle, 500 + Math.ceil(COLUMN_STEP / 2));
    expect(onSpan).toHaveBeenCalledWith(5);
  });

  it('tells the board about a width only when it changes', () => {
    const { start, onSpan } = setup(4);
    const { event, handle } = press({ clientX: 500 });

    start(event);
    dragTo(handle, 500 + COLUMN_STEP);
    dragTo(handle, 500 + COLUMN_STEP + 5);
    dragTo(handle, 500 + COLUMN_STEP - 5);

    expect(onSpan).toHaveBeenCalledExactlyOnceWith(5);
  });

  it('never goes narrower than the minimum or wider than the board', () => {
    const { start, onSpan } = setup(6);
    const { event, handle } = press({ clientX: 500 });

    start(event);
    dragTo(handle, -5000);
    expect(onSpan).toHaveBeenLastCalledWith(MIN_SPAN);

    dragTo(handle, 9000);
    expect(onSpan).toHaveBeenLastCalledWith(GRID_COLUMNS);
  });

  it.each(['pointerup', 'pointercancel'])('stops listening at %s', (ending) => {
    const { start, onSpan, onResizing } = setup(4);
    const { event, handle } = press({ clientX: 500 });

    start(event);
    handle.dispatchEvent(new Event(ending));

    expect(onResizing).toHaveBeenLastCalledWith(false);

    dragTo(handle, 500 + 3 * COLUMN_STEP);
    expect(onSpan).not.toHaveBeenCalled();
  });

  it('ignores anything but the primary button', () => {
    const { start, onResizing } = setup();
    const { event, handle, preventDefault } = press({ button: 2 });

    start(event);

    expect(handle.setPointerCapture).not.toHaveBeenCalled();
    expect(onResizing).not.toHaveBeenCalled();
    expect(preventDefault).not.toHaveBeenCalled();
  });

  it('does nothing before the grid has mounted', () => {
    const { start, onResizing } = setup(4, null);
    const { event, handle } = press();

    start(event);

    expect(handle.setPointerCapture).not.toHaveBeenCalled();
    expect(onResizing).not.toHaveBeenCalled();
  });

  it('copes with a grid that reports no gap', () => {
    vi.mocked(window.getComputedStyle).mockReturnValue({
      columnGap: 'normal'
    } as CSSStyleDeclaration);
    const { start, onSpan } = setup(4);
    const { event, handle } = press({ clientX: 500 });

    start(event);
    // Without gaps a column is 100px wide.
    dragTo(handle, 600);

    expect(onSpan).toHaveBeenCalledWith(5);
  });
});
