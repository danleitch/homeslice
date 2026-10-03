import { useCallback, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
import { GRID_COLUMNS, MIN_SPAN } from '../lib/model';

/**
 * Dragging a group's or widget's right edge to a new width. The width snaps
 * to the board's columns as the pointer passes each one, and the grid reflows
 * live, so what the visitor sees while dragging is exactly what they get.
 */
export const useSpanResize = (
  gridRef: RefObject<HTMLElement | null>,
  span: number,
  onSpan: (span: number) => void,
  onResizing: (resizing: boolean) => void
): ((event: ReactPointerEvent<HTMLElement>) => void) =>
  useCallback(
    (event) => {
      const grid = gridRef.current;

      if (!grid || event.button !== 0) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const gap = parseFloat(getComputedStyle(grid).columnGap) || 0;
      const column = (grid.clientWidth - gap * (GRID_COLUMNS - 1)) / GRID_COLUMNS;
      const startX = event.clientX;
      const startWidth = span * column + (span - 1) * gap;
      const handle = event.currentTarget;
      let current = span;

      handle.setPointerCapture(event.pointerId);
      onResizing(true);

      const move = (moveEvent: PointerEvent): void => {
        const width = startWidth + (moveEvent.clientX - startX);
        const next = Math.min(
          GRID_COLUMNS,
          Math.max(MIN_SPAN, Math.round((width + gap) / (column + gap)))
        );

        if (next !== current) {
          current = next;
          onSpan(next);
        }
      };

      const end = (): void => {
        handle.removeEventListener('pointermove', move);
        handle.removeEventListener('pointerup', end);
        handle.removeEventListener('pointercancel', end);
        onResizing(false);
      };

      handle.addEventListener('pointermove', move);
      handle.addEventListener('pointerup', end);
      handle.addEventListener('pointercancel', end);
    },
    [gridRef, span, onSpan, onResizing]
  );
