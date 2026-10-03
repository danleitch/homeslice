import { useEffect, useRef, useState, type JSX } from 'react';
import { ExternalLink, RotateCw, X } from 'lucide-react';
import type { AppExtension } from '../dashboard/lib/extensions-config';
import { iconForApp, isFramelessApp } from './registry';
import '../dashboard/shell.css';

/** Long enough for a slow app to paint; after it, the frame offers a way out in case it never will. */
const SLOW_LOAD_MS = 6000;

/**
 * An app extension, framed over the board. It runs at its own address, in its
 * own sandbox: it shares nothing with the dashboard but the screen.
 */
export const AppSheet = ({
  app,
  onClose
}: {
  app: AppExtension;
  onClose: () => void;
}): JSX.Element => {
  const [loaded, setLoaded] = useState(false);
  const [slow, setSlow] = useState(false);
  const [nonce, setNonce] = useState(0);
  const closeRef = useRef<HTMLButtonElement>(null);
  const Icon = iconForApp(app);
  const frameless = isFramelessApp(app);
  const sheetRef = useRef<HTMLElement>(null);

  useEffect(() => {
    setLoaded(false);
    setSlow(false);
    const timer = window.setTimeout(() => setSlow(true), SLOW_LOAD_MS);
    return () => window.clearTimeout(timer);
  }, [app.url, nonce]);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    // With no close button to land on, the sheet itself takes focus so Esc still works.
    (closeRef.current ?? sheetRef.current)?.focus({ preventScroll: true });

    return () => {
      if (previous && document.contains(previous)) {
        previous.focus({ preventScroll: true });
      }
    };
  }, []);

  return (
    <div
      className="tool-backdrop app-backdrop"
      data-dash=""
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <section
        ref={sheetRef}
        tabIndex={-1}
        className={frameless ? 'app-sheet app-sheet--bare' : 'app-sheet glass'}
        data-frameless={frameless ? '' : undefined}
        role="dialog"
        aria-modal="true"
        aria-label={app.name}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.stopPropagation();
            onClose();
          }
        }}
      >
        {!frameless && (
          <header className="app-head">
            <span className="app-title">
              <Icon size={17} aria-hidden="true" />
              {app.name}
            </span>
            <span className="app-url">{app.url.replace(/^https?:\/\//, '')}</span>
            <div className="app-actions">
              <button
                type="button"
                className="icon-btn"
                aria-label={`Reload ${app.name}`}
                title="Reload"
                onClick={() => setNonce((value) => value + 1)}
              >
                <RotateCw size={15} />
              </button>
              <a
                className="icon-btn"
                href={app.url}
                target="_blank"
                rel="noreferrer noopener"
                aria-label={`Open ${app.name} in a new tab`}
                title="Open in a new tab"
              >
                <ExternalLink size={15} />
              </a>
              <button
                ref={closeRef}
                type="button"
                className="icon-btn"
                aria-label={`Close ${app.name}`}
                title="Close (Esc)"
                onClick={onClose}
              >
                <X size={16} />
              </button>
            </div>
          </header>
        )}
        <div className="app-frame-wrap">
          <iframe
            key={nonce}
            className="app-frame"
            src={app.url}
            title={app.name}
            data-loaded={loaded ? '' : undefined}
            // Scripts and its own storage, so a game keeps its scores; no reaching into the board.
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads"
            allow="clipboard-write; fullscreen"
            referrerPolicy="no-referrer"
            onLoad={() => setLoaded(true)}
          />
          {!loaded && (
            <div className="app-loading" role="status">
              <span className="app-spinner" aria-hidden="true" />
              {slow ? (
                <p>
                  Still waiting on {app.name}. If it never appears, the site may not allow being
                  framed, or it isn’t running.{' '}
                  <a href={app.url} target="_blank" rel="noreferrer noopener">
                    Open it in a tab
                  </a>
                </p>
              ) : (
                <p>Opening {app.name}…</p>
              )}
            </div>
          )}
        </div>
      </section>
    </div>
  );
};
