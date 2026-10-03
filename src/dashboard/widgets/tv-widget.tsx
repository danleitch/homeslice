import { useCallback, type JSX } from 'react';
import { Star, Tv } from 'lucide-react';
import { useRemote } from '../hooks/use-remote';
import { fetchShows, type PopularTvWidget as PopularTvWidgetConfig } from '../lib/tmdb';
import { WidgetSkeleton, WidgetState } from './widget-frame';
import '../shell.css';

/** As with BenchLM, the server's copy lasts half a week; the page looks twice a day. */
const SHOWS_TTL_MS = 12 * 60 * 60 * 1000;

/** TMDB's list is twenty long; the widget shows the top of it. */
const LIST_LENGTH = 20;

export const PopularTvWidget = ({
  widget,
  newTab
}: {
  widget: PopularTvWidgetConfig;
  newTab: boolean;
}): JSX.Element => {
  const { window: period, count } = widget;
  const load = useCallback(
    (signal: AbortSignal) => fetchShows(period, LIST_LENGTH, signal),
    [period]
  );
  const { data, error, refresh } = useRemote(`tmdb:tv:${period}`, SHOWS_TTL_MS, load);
  const target = newTab ? '_blank' : undefined;

  if (!data) {
    return error ? (
      <WidgetState
        tone="error"
        action={
          <button type="button" className="link-btn" onClick={refresh}>
            Try again
          </button>
        }
      >
        {error}
      </WidgetState>
    ) : (
      <WidgetSkeleton rows={Math.min(count, 5)} />
    );
  }

  if (data.length === 0) {
    return <WidgetState>Nothing is trending right now.</WidgetState>;
  }

  return (
    <div className="tv">
      <ol className="tv-list">
        {data.slice(0, count).map((show) => (
          <li key={show.id}>
            <a
              className="tv-item"
              href={show.url}
              target={target}
              rel="noreferrer noopener"
              title={show.overview || undefined}
            >
              {show.poster ? (
                <img className="tv-poster" src={show.poster} alt="" loading="lazy" />
              ) : (
                <span className="tv-poster tv-poster--none" aria-hidden="true">
                  <Tv size={16} />
                </span>
              )}
              <span className="tv-text">
                <span className="tv-name">{show.name}</span>
                <span className="tv-meta">
                  {show.year && <span>{show.year}</span>}
                  {show.votes > 0 && (
                    <span>
                      <Star size={11} aria-hidden="true" /> {show.rating.toFixed(1)}
                    </span>
                  )}
                </span>
              </span>
            </a>
          </li>
        ))}
      </ol>
      <p className="wdg-foot">
        Data from{' '}
        <a href="https://www.themoviedb.org" target={target} rel="noreferrer noopener">
          TMDB
        </a>
        . This product uses the TMDB API but is not endorsed or certified by TMDB.
      </p>
    </div>
  );
};
