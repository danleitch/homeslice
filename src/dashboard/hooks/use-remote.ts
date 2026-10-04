import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Widget data, cached in local storage so a reload paints the last reading at
 * once and only goes to the network once it has gone stale.
 */
const CACHE_PREFIX = 'dashboard-cache:';

type Cached<T> = { at: number; data: T };

const readCache = <T>(key: string): Cached<T> | null => {
  try {
    const raw = window.localStorage.getItem(CACHE_PREFIX + key);
    return raw ? (JSON.parse(raw) as Cached<T>) : null;
  } catch {
    return null;
  }
};

const writeCache = <T>(key: string, data: T): void => {
  try {
    window.localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ at: Date.now(), data }));
  } catch {
    /* a full cache only costs a refetch */
  }
};

/** Forgets one reading, for a widget whose settings have made it a different one. */
export const dropRemoteCache = (key: string): void => {
  try {
    window.localStorage.removeItem(CACHE_PREFIX + key);
  } catch {
    /* nothing to forget */
  }
};

/** Drops every cached widget reading; used when the visitor resets the dashboard. */
export const clearRemoteCache = (): void => {
  try {
    for (const key of Object.keys(window.localStorage)) {
      if (key.startsWith(CACHE_PREFIX)) {
        window.localStorage.removeItem(key);
      }
    }
  } catch {
    /* nothing to clear */
  }
};

export type Remote<T> = {
  data: T | null;
  error: string | null;
  loading: boolean;
  /** When the data on screen was fetched. */
  fetchedAt: number | null;
  refresh: () => void;
};

/**
 * Fetches `load` under `key`, at most every `ttlMs`, while the tab is visible.
 * A failed refresh keeps showing the last good reading alongside the error.
 */
export const useRemote = <T>(
  key: string,
  ttlMs: number,
  load: (signal: AbortSignal) => Promise<T>
): Remote<T> => {
  const [state, setState] = useState<{
    key: string;
    data: T | null;
    at: number | null;
    error: string | null;
  }>(() => {
    const cached = readCache<T>(key);
    return { key, data: cached?.data ?? null, at: cached?.at ?? null, error: null };
  });
  const [loading, setLoading] = useState(false);
  const [nonce, setNonce] = useState(0);
  const loadRef = useRef(load);
  loadRef.current = load;
  const forced = useRef(false);

  // A new key is a different reading altogether; show its cache, not the old one's.
  if (state.key !== key) {
    const cached = readCache<T>(key);
    setState({ key, data: cached?.data ?? null, at: cached?.at ?? null, error: null });
  }

  useEffect(() => {
    const controller = new AbortController();
    let timer: number | undefined;

    const run = async (): Promise<void> => {
      const cached = readCache<T>(key);
      const age = cached ? Date.now() - cached.at : Infinity;

      if (!forced.current && age < ttlMs) {
        timer = window.setTimeout(run, ttlMs - age + 500);
        return;
      }

      forced.current = false;

      if (document.hidden) {
        // Picked up again when the tab comes back.
        return;
      }

      setLoading(true);

      try {
        const data = await loadRef.current(controller.signal);
        writeCache(key, data);
        setState({ key, data, at: Date.now(), error: null });
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }

        setState((current) => ({
          ...current,
          error: error instanceof Error ? error.message : 'Something went wrong.'
        }));
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
          timer = window.setTimeout(run, ttlMs);
        }
      }
    };

    const handleVisibility = (): void => {
      if (!document.hidden) {
        window.clearTimeout(timer);
        void run();
      }
    };

    void run();
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [key, ttlMs, nonce]);

  const refresh = useCallback(() => {
    forced.current = true;
    setNonce((value) => value + 1);
  }, []);

  return { data: state.data, error: state.error, loading, fetchedAt: state.at, refresh };
};

/** fetch, but a non-2xx answer is an error with something readable to say. */
export const fetchJson = async <T>(url: string, signal: AbortSignal): Promise<T> => {
  const response = await fetch(url, { signal });

  if (!response.ok) {
    throw new Error(`The service answered ${response.status}.`);
  }

  return (await response.json()) as T;
};
