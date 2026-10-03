import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sanitizeConfig, type DashboardConfig } from '../lib/model';
import { DASHBOARD_STORAGE_KEY } from '../lib/storage';
import { configToYaml } from '../lib/yaml';
import { useDashboard } from './use-dashboard';

const board = (name: string): DashboardConfig => sanitizeConfig({ name, groups: [] });
const withName =
  (name: string) =>
  (config: DashboardConfig): DashboardConfig => ({ ...config, pages: config.pages, name });

const stored = (): string => window.localStorage.getItem(DASHBOARD_STORAGE_KEY) ?? '';

describe('useDashboard', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.localStorage.setItem(DASHBOARD_STORAGE_KEY, configToYaml(board('Sam')));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('the board', () => {
    it('starts from what was saved', () => {
      const { result } = renderHook(() => useDashboard());

      expect(result.current.config.name).toBe('Sam');
    });

    it('applies a change to the latest board, so quick edits do not trample each other', () => {
      const { result } = renderHook(() => useDashboard());

      act(() => {
        result.current.apply(withName('One'));
        result.current.apply((current) => ({ ...current, title: `${current.name} board` }));
      });

      expect(result.current.config).toMatchObject({ name: 'One', title: 'One board' });
    });

    it('does nothing for a change that changes nothing', () => {
      const { result } = renderHook(() => useDashboard());
      const before = result.current.config;

      act(() => result.current.apply((current) => current, 'Nothing happened'));

      expect(result.current.config).toBe(before);
      expect(result.current.toasts).toEqual([]);
    });
  });

  describe('saving', () => {
    it('writes the board a moment after the last change, as YAML', () => {
      const { result } = renderHook(() => useDashboard());

      act(() => result.current.apply(withName('Riley')));
      expect(stored()).toContain('name: Sam');

      act(() => {
        vi.advanceTimersByTime(149);
      });
      expect(stored()).toContain('name: Sam');

      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(stored()).toContain('name: Riley');
    });

    it('writes a burst of changes once, when it settles', () => {
      const setItem = vi.spyOn(Storage.prototype, 'setItem');
      const { result } = renderHook(() => useDashboard());
      act(() => {
        vi.advanceTimersByTime(200);
      });
      setItem.mockClear();

      for (const name of ['A', 'B', 'C', 'D']) {
        act(() => result.current.apply(withName(name)));
        act(() => {
          vi.advanceTimersByTime(50);
        });
      }
      act(() => {
        vi.advanceTimersByTime(200);
      });

      expect(setItem).toHaveBeenCalledTimes(1);
      expect(stored()).toContain('name: D');
      setItem.mockRestore();
    });

    it('does not lose the last change when the page is left inside the delay', () => {
      const { result } = renderHook(() => useDashboard());

      act(() => result.current.apply(withName('Quick')));
      window.dispatchEvent(new Event('pagehide'));

      expect(stored()).toContain('name: Quick');
    });

    it('stops listening for the page being left once unmounted', () => {
      const { result, unmount } = renderHook(() => useDashboard());
      act(() => result.current.apply(withName('Quick')));
      unmount();

      window.dispatchEvent(new Event('pagehide'));

      expect(stored()).toContain('name: Sam');
    });
  });

  describe('the same board open in another tab', () => {
    const edited = (name: string): string => configToYaml(board(name));

    const fromOtherTab = (value: string | null, key = DASHBOARD_STORAGE_KEY): void => {
      act(() => {
        window.dispatchEvent(new StorageEvent('storage', { key, newValue: value }));
      });
    };

    it('takes up its edits', () => {
      const { result } = renderHook(() => useDashboard());

      fromOtherTab(edited('From elsewhere'));

      expect(result.current.config.name).toBe('From elsewhere');
    });

    it('ignores other keys', () => {
      const { result } = renderHook(() => useDashboard());

      fromOtherTab(edited('Intruder'), 'something-else');

      expect(result.current.config.name).toBe('Sam');
    });

    it('ignores the board being cleared', () => {
      const { result } = renderHook(() => useDashboard());

      fromOtherTab(null);

      expect(result.current.config.name).toBe('Sam');
    });

    it('ignores YAML that cannot be read', () => {
      const { result } = renderHook(() => useDashboard());

      fromOtherTab('title: [unclosed');

      expect(result.current.config.name).toBe('Sam');
    });

    it('ignores the echo of its own write', () => {
      const { result } = renderHook(() => useDashboard());
      act(() => result.current.apply(withName('Mine')));
      act(() => {
        vi.advanceTimersByTime(200);
      });
      const written = stored();
      act(() => result.current.apply(withName('Newer')));

      fromOtherTab(written);

      expect(result.current.config.name).toBe('Newer');
    });

    it('does not write back what it was just given, which would start a loop', () => {
      const { result } = renderHook(() => useDashboard());
      const incoming = edited('From elsewhere');

      fromOtherTab(incoming);
      act(() => {
        vi.advanceTimersByTime(300);
      });
      const setItem = vi.spyOn(Storage.prototype, 'setItem');
      fromOtherTab(incoming);
      act(() => {
        vi.advanceTimersByTime(300);
      });

      expect(result.current.config.name).toBe('From elsewhere');
      expect(setItem).not.toHaveBeenCalledWith(
        DASHBOARD_STORAGE_KEY,
        expect.stringContaining('Sam')
      );
      setItem.mockRestore();
    });

    it('stops listening once unmounted', () => {
      const { result, unmount } = renderHook(() => useDashboard());
      unmount();

      fromOtherTab(edited('Too late'));

      expect(result.current.config.name).toBe('Sam');
    });
  });

  describe('toasts', () => {
    it('says what happened, in the tone chosen', () => {
      const { result } = renderHook(() => useDashboard());

      act(() => result.current.notify('Saved', 'success'));
      act(() => result.current.notify('Heads up'));

      expect(result.current.toasts).toMatchObject([
        { message: 'Saved', tone: 'success' },
        { message: 'Heads up', tone: 'info' }
      ]);
      expect(new Set(result.current.toasts.map((toast) => toast.id)).size).toBe(2);
    });

    it('goes away by itself after a few seconds', () => {
      const { result } = renderHook(() => useDashboard());
      act(() => result.current.notify('Saved'));

      act(() => {
        vi.advanceTimersByTime(3499);
      });
      expect(result.current.toasts).toHaveLength(1);

      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(result.current.toasts).toHaveLength(0);
    });

    it('can be dismissed sooner, without leaving its timer behind', () => {
      const { result } = renderHook(() => useDashboard());
      act(() => result.current.notify('Saved'));
      const [{ id }] = result.current.toasts;

      act(() => result.current.dismiss(id!));

      expect(result.current.toasts).toHaveLength(0);
      expect(vi.getTimerCount()).toBeLessThanOrEqual(1);
    });

    it('shows no more than three at once, dropping the oldest', () => {
      const { result } = renderHook(() => useDashboard());

      for (const message of ['One', 'Two', 'Three', 'Four']) {
        act(() => result.current.notify(message));
      }

      expect(result.current.toasts.map((toast) => toast.message)).toEqual(['Two', 'Three', 'Four']);
    });

    it('stops its timers when unmounted', () => {
      const { result, unmount } = renderHook(() => useDashboard());
      act(() => result.current.notify('Saved'));

      unmount();

      expect(vi.getTimerCount()).toBe(0);
    });
  });

  describe('undo', () => {
    it('offers to take back a change that came with a message, and takes it back', () => {
      const { result } = renderHook(() => useDashboard());
      act(() => result.current.apply(withName('Changed'), 'Renamed the board'));
      expect(result.current.toasts[0]).toMatchObject({
        message: 'Renamed the board',
        tone: 'info'
      });
      expect(result.current.toasts[0]!.undo).toBeDefined();

      let undone = false;
      act(() => {
        undone = result.current.undo();
      });

      expect(undone).toBe(true);
      expect(result.current.config.name).toBe('Sam');
      expect(result.current.toasts).toHaveLength(0);
    });

    it('keeps an undoable toast longer than an ordinary one', () => {
      const { result } = renderHook(() => useDashboard());
      act(() => result.current.apply(withName('Changed'), 'Renamed'));

      act(() => {
        vi.advanceTimersByTime(6999);
      });
      expect(result.current.toasts).toHaveLength(1);

      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(result.current.toasts).toHaveLength(0);
    });

    it('takes back the latest undoable change first', () => {
      const { result } = renderHook(() => useDashboard());
      act(() => result.current.apply(withName('First'), 'First change'));
      act(() => result.current.apply(withName('Second'), 'Second change'));

      act(() => {
        result.current.undo();
      });

      expect(result.current.config.name).toBe('First');
    });

    it('takes back a particular change by its toast', () => {
      const { result } = renderHook(() => useDashboard());
      act(() => result.current.apply(withName('First'), 'First change'));
      act(() => result.current.apply(withName('Second'), 'Second change'));
      const [first] = result.current.toasts;

      act(() => {
        result.current.undo(first!.id);
      });

      expect(result.current.config.name).toBe('Sam');
      expect(result.current.toasts.map((toast) => toast.message)).toEqual(['Second change']);
    });

    it('says there was nothing to undo', () => {
      const { result } = renderHook(() => useDashboard());
      act(() => result.current.notify('Just a message'));

      let undone = true;
      act(() => {
        undone = result.current.undo();
      });
      let undoneById = true;
      act(() => {
        undoneById = result.current.undo(result.current.toasts[0]!.id);
      });
      let undoneUnknown = true;
      act(() => {
        undoneUnknown = result.current.undo(99999);
      });

      expect(undone).toBe(false);
      expect(undoneById).toBe(false);
      expect(undoneUnknown).toBe(false);
    });

    it('writes the board it went back to', () => {
      const { result } = renderHook(() => useDashboard());
      act(() => result.current.apply(withName('Changed'), 'Renamed'));
      act(() => {
        result.current.undo();
      });

      act(() => {
        vi.advanceTimersByTime(200);
      });

      expect(stored()).toContain('name: Sam');
    });
  });
});
