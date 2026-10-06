/**
 * The TV shows and the films everyone is watching, from TMDB's trending lists.
 * As with BenchLM, the key stays on the server: the page asks this site's
 * /api/tmdb relay, which adds it and keeps each list for half a week.
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

export type PopularMoviesWidget = {
  id: string;
  type: 'movies';
  width: number;
  window: TrendingWindow;
  count: number;
};

/** Which of TMDB's two lists a widget reads. */
export type TitleKind = 'tv' | 'movie';

export type Title = {
  id: number;
  name: string;
  /** The year it first aired or came out, or empty. */
  year: string;
  /** Out of ten; 0 before anyone has voted. */
  rating: number;
  votes: number;
  overview: string;
  /** A small poster, or empty when TMDB has none. */
  poster: string;
  url: string;
};

/** A TV show and a film are read the same way. */
export type Show = Title;
export type Movie = Title;

const RELAYS: Readonly<Record<TitleKind, string>> = {
  tv: '/api/tmdb/trending-tv',
  movie: '/api/tmdb/trending-movie'
};

const NOUNS: Readonly<Record<TitleKind, string>> = { tv: 'Popular TV', movie: 'Popular Movies' };

const POSTERS = 'https://image.tmdb.org/t/p/w92';

type RawTitle = {
  id?: unknown;
  /** A show's name. */
  name?: unknown;
  /** A film's title. */
  title?: unknown;
  /** When a show first aired. */
  first_air_date?: unknown;
  /** When a film came out. */
  release_date?: unknown;
  vote_average?: unknown;
  vote_count?: unknown;
  overview?: unknown;
  poster_path?: unknown;
};

const number = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0;

export const readTitles = (body: unknown, count: number, kind: TitleKind): Title[] =>
  (Array.isArray((body as { results?: unknown } | null)?.results)
    ? ((body as { results: RawTitle[] }).results ?? [])
    : []
  )
    .map((item) => ({ item, name: kind === 'tv' ? item?.name : item?.title }))
    .filter(({ item, name }) => item && typeof item.id === 'number' && typeof name === 'string')
    .slice(0, count)
    .map(({ item, name }) => {
      const poster = typeof item.poster_path === 'string' ? item.poster_path : '';
      const date = kind === 'tv' ? item.first_air_date : item.release_date;

      return {
        id: item.id as number,
        name: name as string,
        year: typeof date === 'string' ? date.slice(0, 4) : '',
        rating: Math.round(number(item.vote_average) * 10) / 10,
        votes: number(item.vote_count),
        overview: typeof item.overview === 'string' ? item.overview.trim() : '',
        poster: /^\/[\w.-]+$/.test(poster) ? `${POSTERS}${poster}` : '',
        url: `https://www.themoviedb.org/${kind}/${item.id as number}`
      };
    });

export const fetchTitles = async (
  kind: TitleKind,
  window: TrendingWindow,
  count: number,
  signal: AbortSignal
): Promise<Title[]> => {
  const response = await fetch(`${RELAYS[kind]}?window=${window}`, { signal });

  if (response.status === 401 || response.status === 403) {
    throw new Error('TMDB isn’t set up on this server yet: it needs a TMDB_TOKEN.');
  }

  if (!(response.headers.get('content-type') ?? '').includes('json')) {
    throw new Error(
      `${NOUNS[kind]} goes through this dashboard’s server, which this host doesn’t provide.`
    );
  }

  if (!response.ok) {
    throw new Error('TMDB didn’t answer.');
  }

  return readTitles(await response.json(), count, kind);
};

export const readShows = (body: unknown, count: number): Show[] => readTitles(body, count, 'tv');

export const readMovies = (body: unknown, count: number): Movie[] =>
  readTitles(body, count, 'movie');

export const fetchShows = (
  window: TrendingWindow,
  count: number,
  signal: AbortSignal
): Promise<Show[]> => fetchTitles('tv', window, count, signal);

export const fetchMovies = (
  window: TrendingWindow,
  count: number,
  signal: AbortSignal
): Promise<Movie[]> => fetchTitles('movie', window, count, signal);
