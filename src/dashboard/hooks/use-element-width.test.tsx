import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useElementWidth } from './use-element-width';

const elementOf = (width: number): { element: HTMLElement; set: (width: number) => void } => {
  const element = document.createElement('div');
  let current = width;
  Object.defineProperty(element, 'clientWidth', { get: () => current });
  return {
    element,
    set: (next) => {
      current = next;
    }
  };
};

/** The hook as the board uses it: one ref that lasts as long as the board does. */
const mount = (element: HTMLElement | null) => {
  const ref = { current: element };
  return renderHook(() => useElementWidth(ref));
};

describe('useElementWidth', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('is how wide the element is as soon as it has been measured', () => {
    const { element } = elementOf(840);

    const { result } = mount(element);

    expect(result.current).toBe(840);
  });

  it('is zero when there is no element to measure', () => {
    const { result } = mount(null);

    expect(result.current).toBe(0);
  });

  describe('where there is a ResizeObserver', () => {
    const observer = () => {
      const callbacks: (() => void)[] = [];
      const observe = vi.fn();
      const disconnect = vi.fn();
      vi.stubGlobal(
        'ResizeObserver',
        class {
          observe = observe;
          disconnect = disconnect;

          constructor(callback: () => void) {
            callbacks.push(callback);
          }
        }
      );
      return { callbacks, observe, disconnect };
    };

    it('follows the element as it grows and shrinks', () => {
      const { callbacks, observe } = observer();
      const { element, set } = elementOf(1000);
      const { result } = mount(element);
      expect(observe).toHaveBeenCalledWith(element);

      set(640);
      act(() => callbacks[0]!());
      expect(result.current).toBe(640);

      set(1280);
      act(() => callbacks[0]!());
      expect(result.current).toBe(1280);
    });

    it('stops watching when it goes', () => {
      const { disconnect } = observer();
      const { element } = elementOf(500);
      const { unmount } = mount(element);

      unmount();

      expect(disconnect).toHaveBeenCalledTimes(1);
    });
  });

  describe('where there is not', () => {
    it('follows the window instead', () => {
      vi.stubGlobal('ResizeObserver', undefined);
      const { element, set } = elementOf(900);
      const { result } = mount(element);
      expect(result.current).toBe(900);

      set(700);
      act(() => {
        window.dispatchEvent(new Event('resize'));
      });

      expect(result.current).toBe(700);
    });

    it('stops listening to the window when it goes', () => {
      vi.stubGlobal('ResizeObserver', undefined);
      const remove = vi.spyOn(window, 'removeEventListener');
      const { element } = elementOf(900);
      const { unmount } = mount(element);

      unmount();

      expect(remove).toHaveBeenCalledWith('resize', expect.any(Function));
      remove.mockRestore();
    });
  });
});
