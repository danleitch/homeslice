import { useCallback, useEffect, useRef } from 'react';

/** How close to the top or bottom of the window the pointer has to be, in pixels, to scroll. */
export const EDGE_PX = 90;
/** The most the page scrolls in a frame, which it does with the pointer right at the edge. */
export const MAX_SCROLL_PX = 24;

/** How far to scroll for a pointer this far down the window: none in the middle, more nearer an edge. */
export const scrollFor = (pointerY: number, windowHeight: number): number => {
  const fromBottom = windowHeight - pointerY;

  if (pointerY < EDGE_PX) {
    return -Math.round(MAX_SCROLL_PX * Math.min(1, (EDGE_PX - pointerY) / EDGE_PX));
  }

  if (fromBottom < EDGE_PX) {
    return Math.round(MAX_SCROLL_PX * Math.min(1, (EDGE_PX - fromBottom) / EDGE_PX));
  }

  return 0;
};

/**
 * Scrolls the page while a card is being carried or resized and the pointer is
 * held near the top or bottom of the window, which the grid does not do for
 * itself. The grid places a card by where the pointer is, so each time the page
 * moves the pointer is reported again, in the same place, for the card to
 * follow. Mouse only: a finger scrolls the page itself.
 */
export const useEdgeScroll = (): { start: () => void; stop: () => void } => {
  const cancel = useRef<(() => void) | null>(null);

  const stop = useCallback((): void => {
    cancel.current?.();
    cancel.current = null;
  }, []);

  const start = useCallback((): void => {
    stop();

    let pointer: { x: number; y: number } | null = null;
    let frame = 0;

    // Heard on the way down, since the grid's own listeners do not pass it on.
    const track = (event: MouseEvent): void => {
      pointer = { x: event.clientX, y: event.clientY };
    };

    const step = (): void => {
      const by = pointer ? scrollFor(pointer.y, window.innerHeight) : 0;

      if (pointer && by !== 0) {
        const before = window.scrollY;
        window.scrollBy(0, by);

        if (window.scrollY !== before) {
          document.dispatchEvent(
            new MouseEvent('mousemove', { clientX: pointer.x, clientY: pointer.y, bubbles: true })
          );
        }
      }

      frame = window.requestAnimationFrame(step);
    };

    window.addEventListener('mousemove', track, true);
    frame = window.requestAnimationFrame(step);

    cancel.current = () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('mousemove', track, true);
    };
  }, [stop]);

  useEffect(() => stop, [stop]);

  return { start, stop };
};
