import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearRemoteCache, dropRemoteCache, fetchJson, useRemote } from './use-remote';

const TTL = 60_000;
const CACHE = 'dashboard-cache:';
const START = new Date('2026-03-15T12:00:00Z').getTime();

const cacheOf = (key: string): { at: number; data: unknown } | null => {
  const raw = window.localStorage.getItem(CACHE + key);
  return raw ? JSON.parse(raw) : null;
};

const seedCache = (key: string, data: unknown, ageMs: number): void => {
  window.localStorage.setItem(CACHE + key, JSON.stringify({ at: START - ageMs, data }));
};

/** Lets pending promises and timers settle. */
const settle = async (ms = 0): Promise<void> => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};

let hidden = false;

describe('useRemote', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: START });
    hidden = false;
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
  });

  afterEach(() => {
    vi.useRealTimers();
    delete (document as { hidden?: boolean }).hidden;
  });

  const mount = (
    load: (signal: AbortSignal) => Promise<unknown>,
    key = 'weather:london'
  ): ReturnType<typeof renderHook<ReturnType<typeof useRemote<unknown>>, { key: string }>> =>
    renderHook(({ key: current }) => useRemote<unknown>(current, TTL, load), {
      initialProps: { key }
    });

  describe('loading', () => {
    it('fetches, then holds the answer and when it arrived', async () => {
      const load = vi.fn().mockResolvedValue({ temp: 14 });
      const { result } = mount(load);

      expect(result.current).toMatchObject({ data: null, loading: true });
      await settle();

      expect(result.current).toMatchObject({
        data: { temp: 14 },
        error: null,
        loading: false,
        fetchedAt: START
      });
    });

    it('gives the fetch a signal it can be abandoned with', async () => {
      const load = vi.fn().mockResolvedValue(1);
      mount(load);
      await settle();

      expect(load).toHaveBeenCalledWith(expect.any(AbortSignal));
    });

    it('keeps the answer in local storage, so a reload paints at once', async () => {
      mount(vi.fn().mockResolvedValue({ temp: 14 }));
      await settle();

      expect(cacheOf('weather:london')).toEqual({ at: START, data: { temp: 14 } });
    });

    it('asks again each time the answer goes stale', async () => {
      const load = vi.fn().mockResolvedValueOnce('first').mockResolvedValueOnce('second');
      const { result } = mount(load);
      await settle();
      expect(result.current.data).toBe('first');

      await settle(TTL + 1);

      expect(load).toHaveBeenCalledTimes(2);
      expect(result.current.data).toBe('second');
    });

    it('does not fetch twice for one answer', async () => {
      const load = vi.fn().mockResolvedValue(1);
      mount(load);

      await settle(TTL - 1);

      expect(load).toHaveBeenCalledTimes(1);
    });
  });

  describe('the cache', () => {
    it('paints a fresh cached reading at once and does not fetch', async () => {
      seedCache('weather:london', { temp: 9 }, 10_000);
      const load = vi.fn().mockResolvedValue({ temp: 14 });

      const { result } = mount(load);

      expect(result.current).toMatchObject({ data: { temp: 9 }, fetchedAt: START - 10_000 });
      await settle(100);
      expect(load).not.toHaveBeenCalled();
      expect(result.current.loading).toBe(false);
    });

    it('fetches again once a fresh cached reading has aged out', async () => {
      seedCache('weather:london', { temp: 9 }, 10_000);
      const load = vi.fn().mockResolvedValue({ temp: 14 });
      const { result } = mount(load);

      await settle(TTL - 10_000 + 500 + 1);

      expect(load).toHaveBeenCalledTimes(1);
      expect(result.current.data).toEqual({ temp: 14 });
    });

    it('shows a stale reading while fetching a new one', async () => {
      seedCache('weather:london', { temp: 9 }, TTL * 2);
      let answer: (value: unknown) => void = () => {};
      const load = vi.fn(() => new Promise((resolve) => (answer = resolve)));

      const { result } = mount(load);
      await settle();

      expect(result.current).toMatchObject({ data: { temp: 9 }, loading: true });

      answer({ temp: 14 });
      await settle();
      expect(result.current).toMatchObject({ data: { temp: 14 }, loading: false });
    });

    it('survives a cache that cannot be read', async () => {
      window.localStorage.setItem(CACHE + 'weather:london', '{not json');
      const load = vi.fn().mockResolvedValue('fresh');

      const { result } = mount(load);
      await settle();

      expect(result.current.data).toBe('fresh');
    });

    it('survives a cache that cannot be written', async () => {
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('full');
      });
      const { result } = mount(vi.fn().mockResolvedValue('fresh'));
      await settle();

      expect(result.current.data).toBe('fresh');
      vi.restoreAllMocks();
    });
  });

  describe('failing', () => {
    it('says what went wrong', async () => {
      const { result } = mount(vi.fn().mockRejectedValue(new Error('The service answered 503.')));
      await settle();

      expect(result.current).toMatchObject({
        data: null,
        error: 'The service answered 503.',
        loading: false
      });
    });

    it('has something to say even when the failure was not an Error', async () => {
      const { result } = mount(vi.fn().mockRejectedValue('nope'));
      await settle();

      expect(result.current.error).toBe('Something went wrong.');
    });

    it('keeps showing the last good reading beside the error', async () => {
      const load = vi
        .fn()
        .mockResolvedValueOnce('good')
        .mockRejectedValueOnce(new Error('Offline'));
      const { result } = mount(load);
      await settle();

      await settle(TTL + 1);

      expect(result.current).toMatchObject({ data: 'good', error: 'Offline' });
    });

    it('clears the error once a fetch works again', async () => {
      const load = vi
        .fn()
        .mockRejectedValueOnce(new Error('Offline'))
        .mockResolvedValueOnce('back');
      const { result } = mount(load);
      await settle();
      expect(result.current.error).toBe('Offline');

      await settle(TTL + 1);

      expect(result.current).toMatchObject({ data: 'back', error: null });
    });

    it('tries again after a failure, on the usual schedule', async () => {
      const load = vi.fn().mockRejectedValue(new Error('Offline'));
      mount(load);
      await settle();

      await settle(TTL + 1);

      expect(load).toHaveBeenCalledTimes(2);
    });
  });

  describe('refresh', () => {
    it('fetches again at once, even though the reading is fresh', async () => {
      const load = vi.fn().mockResolvedValueOnce('first').mockResolvedValueOnce('second');
      const { result } = mount(load);
      await settle();

      act(() => result.current.refresh());
      await settle();

      expect(load).toHaveBeenCalledTimes(2);
      expect(result.current.data).toBe('second');
    });

    it('is the same function between renders', async () => {
      const { result, rerender } = mount(vi.fn().mockResolvedValue(1));
      const first = result.current.refresh;

      rerender({ key: 'weather:london' });

      expect(result.current.refresh).toBe(first);
    });
  });

  describe('a new key', () => {
    it('shows the new reading’s cache, never the old one’s', async () => {
      seedCache('weather:paris', { temp: 5 }, 1000);
      const { result, rerender } = mount(vi.fn().mockResolvedValue({ temp: 14 }));
      await settle();
      expect(result.current.data).toEqual({ temp: 14 });

      rerender({ key: 'weather:paris' });

      expect(result.current.data).toEqual({ temp: 5 });
    });

    it('shows nothing, and fetches, for a key with no cache', async () => {
      const load = vi.fn().mockResolvedValueOnce('london').mockResolvedValueOnce('oslo');
      const { result, rerender } = mount(load);
      await settle();

      rerender({ key: 'weather:oslo' });
      expect(result.current.data).toBeNull();
      expect(result.current.error).toBeNull();

      await settle();
      expect(result.current.data).toBe('oslo');
      expect(cacheOf('weather:oslo')?.data).toBe('oslo');
    });
  });

  describe('while the tab is hidden', () => {
    it('does not fetch', async () => {
      hidden = true;
      const load = vi.fn().mockResolvedValue(1);

      mount(load);
      await settle(TTL * 3);

      expect(load).not.toHaveBeenCalled();
    });

    it('fetches when the tab comes back', async () => {
      hidden = true;
      const load = vi.fn().mockResolvedValue('welcome back');
      const { result } = mount(load);
      await settle();

      hidden = false;
      document.dispatchEvent(new Event('visibilitychange'));
      await settle();

      expect(load).toHaveBeenCalledTimes(1);
      expect(result.current.data).toBe('welcome back');
    });

    it('does nothing when the tab is hidden again', async () => {
      const load = vi.fn().mockResolvedValue(1);
      mount(load);
      await settle();
      hidden = true;

      document.dispatchEvent(new Event('visibilitychange'));
      await settle();

      expect(load).toHaveBeenCalledTimes(1);
    });
  });

  describe('unmounting', () => {
    it('abandons a fetch that is still out', async () => {
      let signal: AbortSignal | undefined;
      const load = vi.fn((given: AbortSignal) => {
        signal = given;
        return new Promise(() => {});
      });
      const { unmount } = mount(load);
      await settle();

      unmount();

      expect(signal!.aborted).toBe(true);
    });

    it('ignores the answer to an abandoned fetch', async () => {
      let answer: (value: unknown) => void = () => {};
      const load = vi.fn(() => new Promise((resolve) => (answer = resolve)));
      const { result, unmount } = mount(load);
      await settle();
      unmount();

      answer('too late');
      await settle();

      expect(result.current.data).toBeNull();
    });

    it('ignores a failure from an abandoned fetch', async () => {
      let fail: (reason: unknown) => void = () => {};
      const load = vi.fn(() => new Promise((_resolve, reject) => (fail = reject)));
      const { result, unmount } = mount(load);
      await settle();
      unmount();

      fail(new Error('aborted'));
      await settle();

      expect(result.current.error).toBeNull();
    });

    it('stops the schedule', async () => {
      const load = vi.fn().mockResolvedValue(1);
      const { unmount } = mount(load);
      await settle();
      unmount();

      await settle(TTL * 3);

      expect(load).toHaveBeenCalledTimes(1);
    });

    it('stops listening for the tab’s return', async () => {
      hidden = true;
      const load = vi.fn().mockResolvedValue(1);
      const { unmount } = mount(load);
      unmount();

      hidden = false;
      document.dispatchEvent(new Event('visibilitychange'));
      await settle();

      expect(load).not.toHaveBeenCalled();
    });
  });
});

describe('clearRemoteCache', () => {
  it('drops every cached reading, and nothing else', () => {
    window.localStorage.setItem(CACHE + 'a', '1');
    window.localStorage.setItem(CACHE + 'b', '2');
    window.localStorage.setItem('dashboard-config', 'keep me');

    clearRemoteCache();

    expect(window.localStorage.getItem(CACHE + 'a')).toBeNull();
    expect(window.localStorage.getItem(CACHE + 'b')).toBeNull();
    expect(window.localStorage.getItem('dashboard-config')).toBe('keep me');
  });

  it('is harmless when storage cannot be reached', () => {
    vi.spyOn(Object, 'keys').mockImplementationOnce(() => {
      throw new Error('blocked');
    });

    expect(() => clearRemoteCache()).not.toThrow();
    vi.restoreAllMocks();
  });
});

describe('fetchJson', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns what the service said', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ answer: 42 }) });
    vi.stubGlobal('fetch', fetchMock);
    const signal = new AbortController().signal;

    expect(await fetchJson('https://example.com/data', signal)).toEqual({ answer: 42 });
    expect(fetchMock).toHaveBeenCalledWith('https://example.com/data', { signal });
  });

  it('says which status a failed answer had', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));

    await expect(
      fetchJson('https://example.com/data', new AbortController().signal)
    ).rejects.toThrow('The service answered 503.');
  });
});

describe('dropRemoteCache', () => {
  it('forgets the one reading, and nothing else', () => {
    window.localStorage.setItem(CACHE + 'a', '1');
    window.localStorage.setItem(CACHE + 'b', '2');

    dropRemoteCache('a');

    expect(window.localStorage.getItem(CACHE + 'a')).toBeNull();
    expect(window.localStorage.getItem(CACHE + 'b')).toBe('2');
  });

  it('is harmless for a reading that is not there', () => {
    expect(() => dropRemoteCache('missing')).not.toThrow();
  });

  it('is harmless when storage cannot be reached', () => {
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementationOnce(() => {
      throw new Error('blocked');
    });

    expect(() => dropRemoteCache('a')).not.toThrow();
    vi.restoreAllMocks();
  });
});
