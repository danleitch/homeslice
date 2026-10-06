import { useCallback, type JSX } from 'react';
import { Film, Star, Tv } from 'lucide-react';
import { useRemote } from '../hooks/use-remote';
import {
  fetchMovies,
  fetchShows,
  type PopularMoviesWidget as PopularMoviesWidgetConfig,
  type PopularTvWidget as PopularTvWidgetConfig,
  type Title
} from '../lib/tmdb';
import { WidgetSkeleton, WidgetState } from './widget-frame';
import '../shell.css';

/** As with BenchLM, the server's copy lasts half a week; the page looks twice a day. */
const TITLES_TTL_MS = 12 * 60 * 60 * 1000;

/** TMDB's list is twenty long; the widget shows the top of it. */
const LIST_LENGTH = 20;

/** Below this many columns the card is narrow: smaller gaps, and a name may take two lines. */
const NARROW_BELOW = 4;

type Kind = 'tv' | 'movie';

const KINDS = {
  tv: { fetch: fetchShows, Icon: Tv, nothing: 'Nothing is trending right now.' },
  movie: { fetch: fetchMovies, Icon: Film, nothing: 'No film is trending right now.' }
} as const;

const Trending = ({
  kind,
  width,
  period,
  count,
  newTab
}: {
  kind: Kind;
  width: number;
  period: PopularTvWidgetConfig['window'];
  count: number;
  newTab: boolean;
}): JSX.Element => {
  const { fetch: fetchTitles, Icon, nothing } = KINDS[kind];
  const load = useCallback(
    (signal: AbortSignal) => fetchTitles(period, LIST_LENGTH, signal),
    [fetchTitles, period]
  );
  const { data, error, refresh } = useRemote(`tmdb:${kind}:${period}`, TITLES_TTL_MS, load);
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
    return <WidgetState>{nothing}</WidgetState>;
  }

  return (
    <div className="tv" data-narrow={width < NARROW_BELOW ? '' : undefined}>
      <ol className="tv-list">
        {data.slice(0, count).map((title: Title) => (
          <li key={title.id}>
            <a
              className="tv-item"
              href={title.url}
              target={target}
              rel="noreferrer noopener"
              title={title.overview || undefined}
            >
              {title.poster ? (
                <img className="tv-poster" src={title.poster} alt="" loading="lazy" />
              ) : (
                <span className="tv-poster tv-poster--none" aria-hidden="true">
                  <Icon size={16} />
                </span>
              )}
              <span className="tv-text">
                <span className="tv-name">{title.name}</span>
                <span className="tv-meta">
                  {title.year && <span>{title.year}</span>}
                  {title.votes > 0 && (
                    <span>
                      <Star size={11} aria-hidden="true" /> {title.rating.toFixed(1)}
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

export const PopularTvWidget = ({
  widget,
  newTab
}: {
  widget: PopularTvWidgetConfig;
  newTab: boolean;
}): JSX.Element => (
  <Trending
    kind="tv"
    width={widget.width}
    period={widget.window}
    count={widget.count}
    newTab={newTab}
  />
);

export const PopularMoviesWidget = ({
  widget,
  newTab
}: {
  widget: PopularMoviesWidgetConfig;
  newTab: boolean;
}): JSX.Element => (
  <Trending
    kind="movie"
    width={widget.width}
    period={widget.window}
    count={widget.count}
    newTab={newTab}
  />
);
