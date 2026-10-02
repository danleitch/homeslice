import { useCallback, useEffect, useState } from 'react';

const PREFIX = '#app/';

const current = (): string | null =>
  window.location.hash.startsWith(PREFIX)
    ? decodeURIComponent(window.location.hash.slice(PREFIX.length)) || null
    : null;

/**
 * Which app is open over the board, kept in the address as /#app/<id> so an
 * app can be bookmarked and Back closes it, as Branchify does at /#branchify.
 */
export const useAppRoute = (): [string | null, (id: string) => void, () => void] => {
  const [open, setOpen] = useState<string | null>(current);

  useEffect(() => {
    const sync = (): void => setOpen(current());
    window.addEventListener('hashchange', sync);
    window.addEventListener('popstate', sync);

    return () => {
      window.removeEventListener('hashchange', sync);
      window.removeEventListener('popstate', sync);
    };
  }, []);

  const show = useCallback((id: string): void => {
    const hash = PREFIX + encodeURIComponent(id);

    if (window.location.hash !== hash) {
      window.history.pushState(null, '', hash);
    }

    setOpen(id);
  }, []);

  const hide = useCallback((): void => {
    if (window.location.hash.startsWith(PREFIX)) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }

    setOpen(null);
  }, []);

  return [open, show, hide];
};
