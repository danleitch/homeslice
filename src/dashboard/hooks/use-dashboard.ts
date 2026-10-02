import { useCallback, useEffect, useRef, useState } from 'react';
import type { DashboardConfig, PageConfig } from '../lib/model';
import { DASHBOARD_STORAGE_KEY, loadConfig, saveConfig } from '../lib/storage';
import { yamlToConfig } from '../lib/yaml';

export type ToastTone = 'info' | 'success' | 'error';

export type Toast = {
  id: number;
  message: string;
  tone: ToastTone;
  /** The board as it was before, when the change can be taken back. */
  undo?: DashboardConfig;
};

/** How long a toast stays; one that can be undone stays long enough to think about it. */
const TOAST_MS = 3500;
const UNDO_TOAST_MS = 7000;
const MAX_TOASTS = 3;
const SAVE_DELAY_MS = 150;

export type UseDashboard = {
  config: DashboardConfig;
  /**
   * Applies a change. With `undoMessage`, a toast offers to take it back.
   * The change function gets the latest board, so quick edits never trample
   * each other.
   */
  apply: (change: (config: DashboardConfig) => DashboardConfig, undoMessage?: string) => void;
  toasts: Toast[];
  notify: (message: string, tone?: ToastTone) => void;
  dismiss: (id: number) => void;
  undo: (id?: number) => boolean;
};

/** `apply` for the page in view: the change sees that page, with the shared settings. */
export type ApplyToPage = (change: (page: PageConfig) => PageConfig, undoMessage?: string) => void;

let toastCounter = 0;

export const useDashboard = (): UseDashboard => {
  const [config, setConfig] = useState<DashboardConfig>(loadConfig);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const configRef = useRef(config);
  const lastWritten = useRef<string | null>(null);
  const timers = useRef(new Map<number, number>());

  const commit = useCallback((next: DashboardConfig): void => {
    configRef.current = next;
    setConfig(next);
  }, []);

  const dismiss = useCallback((id: number): void => {
    window.clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback(
    (toast: Omit<Toast, 'id'>): void => {
      toastCounter += 1;
      const id = toastCounter;
      setToasts((current) => [...current, { ...toast, id }].slice(-MAX_TOASTS));
      timers.current.set(
        id,
        window.setTimeout(() => dismiss(id), toast.undo ? UNDO_TOAST_MS : TOAST_MS)
      );
    },
    [dismiss]
  );

  const apply = useCallback<UseDashboard['apply']>(
    (change, undoMessage) => {
      const previous = configRef.current;
      const next = change(previous);

      if (next === previous) {
        return;
      }

      commit(next);

      if (undoMessage) {
        push({ message: undoMessage, tone: 'info', undo: previous });
      }
    },
    [commit, push]
  );

  const notify = useCallback<UseDashboard['notify']>(
    (message, tone = 'info') => push({ message, tone }),
    [push]
  );

  const toastsRef = useRef(toasts);
  toastsRef.current = toasts;

  const undo = useCallback<UseDashboard['undo']>(
    (id) => {
      const target =
        id === undefined
          ? [...toastsRef.current].reverse().find((toast) => toast.undo)
          : toastsRef.current.find((toast) => toast.id === id);

      if (!target?.undo) {
        return false;
      }

      commit(target.undo);
      dismiss(target.id);
      return true;
    },
    [commit, dismiss]
  );

  // Saved a moment after the last change, so a drag that reorders as it goes
  // writes once when it settles rather than on every step.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      lastWritten.current = saveConfig(config);
    }, SAVE_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [config]);

  // Leaving inside the save delay must not lose the last change.
  useEffect(() => {
    const flush = (): void => {
      lastWritten.current = saveConfig(configRef.current);
    };

    window.addEventListener('pagehide', flush);
    return () => window.removeEventListener('pagehide', flush);
  }, []);

  // The same board open in another tab: its edits arrive here too.
  useEffect(() => {
    const handleStorage = (event: StorageEvent): void => {
      if (
        event.key !== DASHBOARD_STORAGE_KEY ||
        event.newValue === null ||
        event.newValue === lastWritten.current
      ) {
        return;
      }

      const parsed = yamlToConfig(event.newValue);

      if (parsed.ok) {
        lastWritten.current = event.newValue;
        commit(parsed.value);
      }
    };

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [commit]);

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach((timer) => window.clearTimeout(timer));
  }, []);

  return { config, apply, toasts, notify, dismiss, undo };
};
