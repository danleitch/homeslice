/**
 * The TV shows everyone is watching, from TMDB's trending list. As with
 * BenchLM, the key stays on the server: the page asks this site's /api/tmdb
 * relay, which adds it and keeps the list for half a week.
 */
export type TrendingWindow = 'day' | 'week';

export const TRENDING_WINDOWS: readonly TrendingWindow[] = ['day', 'week'];

export type PopularTvWidget = {
  id: string;
  type: 'tv';
  width: number;
  window: TrendingWindow;
  count: number;
};

export type Show = {
  id: number;
  name: string;
  /** The year it first aired, or empty. */
  year: string;
  /** Out of ten; 0 before anyone has voted. */
  rating: number;
  votes: number;
  overview: string;
  /** A small poster, or empty when TMDB has none. */
  poster: string;
  url: string;
};

const RELAY = '/api/tmdb/trending-tv';
const POSTERS = 'https://image.tmdb.org/t/p/w92';

type RawShow = {
  id?: unknown;
  name?: unknown;
  first_air_date?: unknown;
  vote_average?: unknown;
  vote_count?: unknown;
  overview?: unknown;
  poster_path?: unknown;
};

const number = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0;

export const readShows = (body: unknown, count: number): Show[] =>
  (Array.isArray((body as { results?: unknown } | null)?.results)
    ? ((body as { results: RawShow[] }).results ?? [])
    : []
  )
    .filter((show) => show && typeof show.id === 'number' && typeof show.name === 'string')
    .slice(0, count)
    .map((show) => {
      const poster = typeof show.poster_path === 'string' ? show.poster_path : '';

      return {
        id: show.id as number,
        name: show.name as string,
        year: typeof show.first_air_date === 'string' ? show.first_air_date.slice(0, 4) : '',
        rating: Math.round(number(show.vote_average) * 10) / 10,
        votes: number(show.vote_count),
        overview: typeof show.overview === 'string' ? show.overview.trim() : '',
        poster: /^\/[\w.-]+$/.test(poster) ? `${POSTERS}${poster}` : '',
        url: `https://www.themoviedb.org/tv/${show.id as number}`
      };
    });

export const fetchShows = async (
  window: TrendingWindow,
  count: number,
  signal: AbortSignal
): Promise<Show[]> => {
  const response = await fetch(`${RELAY}?window=${window}`, { signal });

  if (response.status === 401 || response.status === 403) {
    throw new Error('TMDB isn’t set up on this server yet: it needs a TMDB_TOKEN.');
  }

  if (!(response.headers.get('content-type') ?? '').includes('json')) {
    throw new Error(
      'Popular TV goes through this dashboard’s server, which this host doesn’t provide.'
    );
  }

  if (!response.ok) {
    throw new Error('TMDB didn’t answer.');
  }

  return readShows(await response.json(), count);
};
