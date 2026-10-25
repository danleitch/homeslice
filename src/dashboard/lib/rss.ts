/**
 * Reading a news feed: RSS 2.0 or 1.0, or Atom, through this site's own relay (see news.ts).
 * A feed is somebody else's text. Titles are only ever shown as text, and a link is kept only if
 * it is an ordinary web address, so a feed can't put a script in a link.
 */

export type NewsItem = {
  title: string;
  url: string;
  /** Seconds since 1970, as the other widgets' time-ago takes; 0 when the feed gave no date. */
  time: number;
};

/** Headlines kept from a feed; the widget shows the top of them. */
export const NEWS_KEPT = 20;

export const PROXY_MESSAGE =
  'News feeds need the dashboard’s proxy, which this host doesn’t provide.';

/** Text of the first of these elements that has any. */
const textOf = (parent: Element, ...names: string[]): string => {
  for (const name of names) {
    const text = parent.getElementsByTagName(name)[0]?.textContent?.trim();

    if (text) {
      return text;
    }
  }

  return '';
};

/** An ordinary web address, or nothing: a feed can't put "javascript:" in a link. */
const webAddress = (candidate: string): string => {
  try {
    const url = new URL(candidate.trim());
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : '';
  } catch {
    return '';
  }
};

/** An item's link: Atom's is an attribute, RSS's is the element's text, or else its permalink. */
const linkOf = (item: Element): string => {
  for (const link of Array.from(item.getElementsByTagName('link'))) {
    const rel = link.getAttribute('rel');
    const address = webAddress(link.getAttribute('href') ?? link.textContent ?? '');

    if (address && (!rel || rel === 'alternate')) {
      return address;
    }
  }

  return webAddress(textOf(item, 'guid'));
};

/** A title as plain text: tags a publisher left in it are taken out, and the lines run together. */
const plain = (title: string): string =>
  title
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Feeds are XML, which has no `&nbsp;`; publishers use it all the same, and one such entity would
 * fail the whole feed. An ampersand that isn't the start of an XML entity is made plain.
 */
const mendAmpersands = (xml: string): string =>
  xml.replace(/&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/g, '&amp;');

/**
 * The headlines in a feed, newest as the feed gives them, or null when the text isn't a feed
 * at all (a page, an error, nothing).
 */
export const parseFeed = (body: string): NewsItem[] | null => {
  const feed = new DOMParser().parseFromString(mendAmpersands(body), 'application/xml');
  const root = feed.documentElement?.nodeName.toLowerCase();

  if (!root || feed.getElementsByTagName('parsererror').length > 0) {
    return null;
  }

  if (root !== 'rss' && root !== 'feed' && root !== 'rdf:rdf') {
    return null;
  }

  return Array.from(feed.querySelectorAll('item, entry'))
    .map((item): NewsItem | null => {
      const title = plain(textOf(item, 'title'));
      const url = linkOf(item);

      if (!title || !url) {
        return null;
      }

      const time = Date.parse(textOf(item, 'pubDate', 'dc:date', 'published', 'updated'));
      return { title, url, time: Number.isNaN(time) ? 0 : Math.round(time / 1000) };
    })
    .filter((item): item is NewsItem => item !== null)
    .slice(0, NEWS_KEPT);
};

/** A feed's headlines, through the relay. */
export const fetchNews = async (feed: string, signal: AbortSignal): Promise<NewsItem[]> => {
  const response = await fetch(`/api/news/${encodeURIComponent(feed)}`, { signal });

  if (!response.ok) {
    throw new Error(
      response.status === 404 ? 'That feed isn’t offered.' : `The feed answered ${response.status}.`
    );
  }

  const items = parseFeed(await response.text());

  if (items === null) {
    // A static host answers with the app's own page, which is not a feed.
    throw new Error(
      (response.headers.get('content-type') ?? '').includes('html')
        ? PROXY_MESSAGE
        : 'That feed couldn’t be read.'
    );
  }

  return items;
};
