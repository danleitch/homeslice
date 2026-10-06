import { useLayoutEffect, useState, type RefObject } from 'react';

/**
 * How wide an element is, kept up to date as it changes. Zero until it has
 * been measured, which is also all a browser without layout (a test) ever says.
 */
export const useElementWidth = (ref: RefObject<HTMLElement | null>): number => {
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const element = ref.current;

    if (!element) {
      return;
    }

    const measure = (): void => setWidth(element.clientWidth);
    measure();

    if (typeof ResizeObserver !== 'function') {
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }

    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);

  return width;
};
