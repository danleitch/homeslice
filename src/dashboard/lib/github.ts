/**
 * GitHub's trending page, from isboyjc/github-trending-api: a GitHub Action
 * scrapes it into static JSON, served with open CORS, so no relay is needed.
 */
export type TrendingSince = 'daily' | 'weekly' | 'monthly';

export const TRENDING_SINCE: readonly TrendingSince[] = ['daily', 'weekly', 'monthly'];

export type GithubTrendingWidget = {
  id: string;
  type: 'github';
  width: number;
  /** A language as GitHub spells it in its addresses, e.g. "typescript"; "all" for every one. */
  language: string;
  since: TrendingSince;
  count: number;
};

/** "C++" to "c++", "Jupyter Notebook" to "jupyter-notebook": how the trending files are named. */
export const languageSlug = (language: string): string =>
  language.trim().toLowerCase().replace(/\s+/g, '-') || 'all';

const DATA = 'https://raw.githubusercontent.com/isboyjc/github-trending-api/main/data';

export type TrendingRepo = {
  /** "owner/name". */
  name: string;
  url: string;
  description: string;
  language: string;
  languageColor: string;
  stars: number;
  forks: number;
  /** Stars gained over the period. */
  gained: number;
};

export type Trending = {
  repos: TrendingRepo[];
  /** When the scraper last ran, in ms; 0 when it didn't say. */
  publishedAt: number;
};

type RawItem = {
  title?: string;
  url?: string;
  description?: string;
  language?: string;
  languageColor?: string;
  stars?: string | number;
  forks?: string | number;
  addStars?: string | number;
};

type RawFeed = { pubDate?: string; items?: RawItem[] };

/** "17,010" to 17010. */
export const parseCount = (value: unknown): number => {
  const number = Number(String(value ?? '').replace(/[^\d.]/g, ''));
  return Number.isFinite(number) ? number : 0;
};

/** 17010 to "17k", 1240 to "1.2k". */
export const shortCount = (value: number): string =>
  value >= 10_000
    ? `${Math.round(value / 1000)}k`
    : value >= 1000
      ? `${(value / 1000).toFixed(1).replace(/\.0$/, '')}k`
      : String(value);

export const trendingUrl = (language: string, since: TrendingSince): string =>
  `${DATA}/${since}/${encodeURIComponent(language || 'all')}.json`;

/** The same list on github.com, for the widget's "more" link. */
export const trendingPageUrl = (language: string, since: TrendingSince): string =>
  `https://github.com/trending${language && language !== 'all' ? `/${encodeURIComponent(language)}` : ''}?since=${since}`;

export const readTrending = (feed: unknown, count: number): Trending => {
  const raw = (feed ?? {}) as RawFeed;
  const published = raw.pubDate ? Date.parse(raw.pubDate) : NaN;

  return {
    publishedAt: Number.isFinite(published) ? published : 0,
    repos: (Array.isArray(raw.items) ? raw.items : [])
      .filter((item) => item && typeof item.title === 'string' && typeof item.url === 'string')
      .slice(0, count)
      .map((item) => ({
        name: item.title!.replace(/\s+/g, ''),
        url: item.url!,
        description: (item.description ?? '').trim(),
        language: item.language ?? '',
        languageColor: /^#[0-9a-f]{3,8}$/i.test(item.languageColor ?? '')
          ? item.languageColor!
          : '',
        stars: parseCount(item.stars),
        forks: parseCount(item.forks),
        gained: parseCount(item.addStars)
      }))
  };
};

export const fetchTrending = async (
  language: string,
  since: TrendingSince,
  count: number,
  signal: AbortSignal
): Promise<Trending> => {
  const response = await fetch(trendingUrl(language, since), { signal });

  if (response.status === 404) {
    throw new Error(`GitHub Trending has no list for “${language}”.`);
  }

  if (!response.ok) {
    throw new Error('GitHub Trending didn’t answer.');
  }

  return readTrending(await response.json(), count);
};

/** Languages offered in the widget's settings; any other GitHub language works typed in. */
export const POPULAR_LANGUAGES: readonly string[] = [
  'all',
  'typescript',
  'javascript',
  'python',
  'rust',
  'go',
  'java',
  'kotlin',
  'swift',
  'c++',
  'c#',
  'c',
  'php',
  'ruby',
  'dart',
  'zig',
  'html',
  'css',
  'shell',
  'jupyter-notebook'
];
