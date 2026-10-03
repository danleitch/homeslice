import { useCallback, useEffect, useRef, useState } from 'react';
import { readStorage, writeStorage } from '../../lib/storage';
import { clampPage } from '../lib/model';
import { PAGE_STORAGE_KEY } from '../lib/storage';

export type PageDirection = 'next' | 'prev';

type PageState = {
  page: number;
  /** The page sliding out, kept on screen until its animation ends. */
  leaving: number | null;
  /** Which way the last move went; none before the first, so a load doesn't slide in. */
  direction: PageDirection | null;
};

export type UsePage = PageState & {
  go: (page: number) => void;
  /** The leaving page has finished sliding out. */
  settle: (page: number) => void;
};

/** Longer than the slide itself, for when animationend never comes (a hidden tab, jsdom). */
const SETTLE_FALLBACK_MS = 900;

export const usePage = (): UsePage => {
  const [state, setState] = useState<PageState>(() => ({
    page: clampPage(Number(readStorage(PAGE_STORAGE_KEY))),
    leaving: null,
    direction: null
  }));
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    writeStorage(PAGE_STORAGE_KEY, String(state.page));
  }, [state.page]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const settle = useCallback((page: number): void => {
    setState((current) => (current.leaving === page ? { ...current, leaving: null } : current));
  }, []);

  const go = useCallback(
    (target: number): void => {
      const page = clampPage(target);

      setState((current) => {
        if (page === current.page) {
          return current;
        }

        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => settle(current.page), SETTLE_FALLBACK_MS);

        return {
          page,
          leaving: current.page,
          direction: page > current.page ? 'next' : 'prev'
        };
      });
    },
    [settle]
  );

  return { ...state, go, settle };
};
