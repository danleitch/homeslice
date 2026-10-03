import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const KEY = 'dashboard-icon-hits';

/** The memory lives in the module, so each test starts from a fresh one. */
const freshModule = async (): Promise<typeof import('./icons')> => {
  vi.resetModules();
  return import('./icons');
};

const stored = (): Record<string, number> | null => {
  const raw = window.localStorage.getItem(KEY);
  return raw ? (JSON.parse(raw) as Record<string, number>) : null;
};

describe('the icons the dashboard remembers', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it('starts from the first source for an icon it has never seen', async () => {
    const { rememberedIcon } = await freshModule();

    expect(rememberedIcon('@example.com')).toBe(0);
  });

  it('remembers which source worked', async () => {
    const { rememberIcon, rememberedIcon } = await freshModule();

    rememberIcon('@example.com', 2);

    expect(rememberedIcon('@example.com')).toBe(2);
    expect(rememberedIcon('@other.org')).toBe(0);
  });

  it('can change its mind', async () => {
    const { rememberIcon, rememberedIcon } = await freshModule();

    rememberIcon('@example.com', 2);
    rememberIcon('@example.com', 1);

    expect(rememberedIcon('@example.com')).toBe(1);
  });

  describe('saving', () => {
    it('keeps it for the next visit, a moment after the last change', async () => {
      const { rememberIcon } = await freshModule();

      rememberIcon('@example.com', 2);
      expect(stored()).toBeNull();

      vi.advanceTimersByTime(499);
      expect(stored()).toBeNull();

      vi.advanceTimersByTime(1);
      expect(stored()).toEqual({ '@example.com': 2 });
    });

    it('writes a burst of changes once, not each one', async () => {
      const setItem = vi.spyOn(Storage.prototype, 'setItem');
      const { rememberIcon } = await freshModule();

      for (let host = 0; host < 30; host += 1) {
        rememberIcon(`@site-${host}.test`, 1);
        vi.advanceTimersByTime(100);
      }
      vi.advanceTimersByTime(500);

      expect(setItem).toHaveBeenCalledTimes(1);
      expect(Object.keys(stored()!)).toHaveLength(30);
    });

    it('does not save again for what it already knows', async () => {
      const { rememberIcon } = await freshModule();
      rememberIcon('@example.com', 2);
      vi.advanceTimersByTime(500);
      window.localStorage.clear();

      rememberIcon('@example.com', 2);
      vi.advanceTimersByTime(1000);

      expect(stored()).toBeNull();
    });

    it('carries on when storage is full', async () => {
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('full');
      });
      const { rememberIcon, rememberedIcon } = await freshModule();

      rememberIcon('@example.com', 2);

      expect(() => vi.advanceTimersByTime(500)).not.toThrow();
      expect(rememberedIcon('@example.com')).toBe(2);
    });
  });

  describe('loading', () => {
    it('picks up what an earlier visit saved', async () => {
      window.localStorage.setItem(KEY, JSON.stringify({ '@example.com': 3 }));
      const { rememberedIcon } = await freshModule();

      expect(rememberedIcon('@example.com')).toBe(3);
    });

    it('adds to what an earlier visit saved, rather than replacing it', async () => {
      window.localStorage.setItem(KEY, JSON.stringify({ '@old.org': 1 }));
      const { rememberIcon } = await freshModule();

      rememberIcon('@new.org', 2);
      vi.advanceTimersByTime(500);

      expect(stored()).toEqual({ '@old.org': 1, '@new.org': 2 });
    });

    it.each([
      ['text that is not JSON', '{nope'],
      ['JSON that is null', 'null'],
      ['JSON that is a number', '7']
    ])('starts afresh from %s', async (_name, raw) => {
      window.localStorage.setItem(KEY, raw);
      const { rememberIcon, rememberedIcon } = await freshModule();

      expect(rememberedIcon('@example.com')).toBe(0);
      rememberIcon('@example.com', 1);
      expect(rememberedIcon('@example.com')).toBe(1);
    });

    it('starts afresh when storage cannot be read', async () => {
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('blocked');
      });
      const { rememberedIcon } = await freshModule();

      expect(rememberedIcon('@example.com')).toBe(0);
    });
  });

  describe('its size', () => {
    it('keeps the newest four hundred and lets the oldest go', async () => {
      const { rememberIcon, rememberedIcon } = await freshModule();

      for (let host = 0; host < 405; host += 1) {
        rememberIcon(`@site-${host}.test`, 1);
      }
      vi.advanceTimersByTime(500);

      expect(Object.keys(stored()!)).toHaveLength(400);
      expect(rememberedIcon('@site-0.test')).toBe(0);
      expect(rememberedIcon('@site-4.test')).toBe(0);
      expect(rememberedIcon('@site-5.test')).toBe(1);
      expect(rememberedIcon('@site-404.test')).toBe(1);
    });

    it('counts an icon it has just used as new, so a favourite is not the first to go', async () => {
      const { rememberIcon, rememberedIcon } = await freshModule();
      rememberIcon('@favourite.org', 1);

      for (let host = 0; host < 399; host += 1) {
        rememberIcon(`@site-${host}.test`, 1);
      }
      rememberIcon('@favourite.org', 2);
      rememberIcon('@one-more.test', 1);

      expect(rememberedIcon('@favourite.org')).toBe(2);
      expect(rememberedIcon('@site-0.test')).toBe(0);
    });
  });
});
