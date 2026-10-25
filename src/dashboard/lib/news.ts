/**
 * The News widget's sources. A feed can't be read by a browser straight from its publisher, and a
 * relay that fetched any address it was given would be an open door into the network it runs on.
 * So the page never names an address: it asks this site's /api/news/<id>, which fetches the one
 * host and path listed here for that id. nginx.conf holds the same list, vite.config.ts builds
 * the dev server's relays from it, and a test keeps the three together.
 *
 * Nothing here is imported: the dev server reads this file before the app is built.
 */
export type NewsFeed = {
  id: string;
  name: string;
  /** The publisher's own page, for the link under the headlines. */
  site: string;
  /** Where its feed is, which the relay fetches. */
  host: string;
  path: string;
};

export const NEWS_FEEDS: readonly NewsFeed[] = [
  {
    id: 'bbc',
    name: 'BBC News',
    site: 'https://www.bbc.co.uk/news',
    host: 'feeds.bbci.co.uk',
    path: '/news/rss.xml'
  },
  {
    id: 'npr',
    name: 'NPR News',
    site: 'https://www.npr.org/sections/news/',
    host: 'feeds.npr.org',
    path: '/1001/rss.xml'
  },
  {
    id: 'guardian',
    name: 'The Guardian, world',
    site: 'https://www.theguardian.com/world',
    host: 'www.theguardian.com',
    path: '/world/rss'
  },
  {
    id: 'bbc-tech',
    name: 'BBC Technology',
    site: 'https://www.bbc.co.uk/news/technology',
    host: 'feeds.bbci.co.uk',
    path: '/news/technology/rss.xml'
  },
  {
    id: 'ars',
    name: 'Ars Technica',
    site: 'https://arstechnica.com',
    host: 'feeds.arstechnica.com',
    path: '/arstechnica/index'
  },
  {
    id: 'verge',
    name: 'The Verge',
    site: 'https://www.theverge.com',
    host: 'www.theverge.com',
    path: '/rss/index.xml'
  },
  {
    id: 'wired',
    name: 'WIRED',
    site: 'https://www.wired.com',
    host: 'www.wired.com',
    path: '/feed/rss'
  },
  {
    id: 'techcrunch',
    name: 'TechCrunch',
    site: 'https://techcrunch.com',
    host: 'techcrunch.com',
    path: '/feed/'
  },
  { id: 'lobsters', name: 'Lobsters', site: 'https://lobste.rs', host: 'lobste.rs', path: '/rss' },
  {
    id: 'github',
    name: 'The GitHub Blog',
    site: 'https://github.blog',
    host: 'github.blog',
    path: '/feed/'
  },
  {
    id: 'nasa',
    name: 'NASA',
    site: 'https://www.nasa.gov/news/',
    host: 'www.nasa.gov',
    path: '/feed/'
  },
  {
    id: 'quanta',
    name: 'Quanta Magazine',
    site: 'https://www.quantamagazine.org',
    host: 'www.quantamagazine.org',
    path: '/feed/'
  }
];

export const DEFAULT_FEED = 'bbc';

export type NewsWidget = {
  id: string;
  type: 'news';
  width: number;
  /** One of NEWS_FEEDS' ids. */
  feed: string;
  count: number;
};

export const feedOf = (id: string): NewsFeed =>
  NEWS_FEEDS.find((feed) => feed.id === id) ?? NEWS_FEEDS[0]!;

/** The id of a feed that is offered, or the default for anything else a hand-edited file says. */
export const readFeed = (value: unknown): string =>
  typeof value === 'string' && NEWS_FEEDS.some((feed) => feed.id === value) ? value : DEFAULT_FEED;
