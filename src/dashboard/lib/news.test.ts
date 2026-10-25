import { describe, expect, it } from 'vitest';
import nginx from '../../../nginx.conf?raw';
import { DEFAULT_FEED, NEWS_FEEDS, feedOf, readFeed } from './news';

describe('the feeds', () => {
  it('each has an id the relay’s address can carry, and no two share one', () => {
    for (const feed of NEWS_FEEDS) {
      expect(feed.id).toMatch(/^[a-z0-9-]+$/);
    }

    expect(new Set(NEWS_FEEDS.map((feed) => feed.id)).size).toBe(NEWS_FEEDS.length);
  });

  it('each is on a host and at a path the relay can fetch, and is shown with a web page of its own', () => {
    for (const feed of NEWS_FEEDS) {
      expect(feed.host).toMatch(/^[a-z0-9.-]+\.[a-z]+$/);
      expect(feed.path).toMatch(/^\/[A-Za-z0-9._/-]*$/);
      expect(feed.site).toMatch(/^https:\/\//);
      expect(feed.name.trim()).not.toBe('');
    }
  });

  it('includes the default one', () => {
    expect(NEWS_FEEDS.map((feed) => feed.id)).toContain(DEFAULT_FEED);
  });

  describe('the relay in nginx.conf', () => {
    // The host and path maps, in the order the list has them.
    const mapped = (kind: 'host' | 'path'): string[][] =>
      [
        ...nginx.matchAll(
          kind === 'host'
            ? /^\s*\/api\/news\/([a-z0-9-]+)\s+([a-z0-9.-]+);/gm
            : /^\s*\/api\/news\/([a-z0-9-]+)\s+(\/[^\s;]*);/gm
        )
      ].map((match) => [match[1]!, match[2]!]);

    it('knows exactly the same ids and hosts', () => {
      expect(mapped('host')).toEqual(NEWS_FEEDS.map((feed) => [feed.id, feed.host]));
    });

    it('knows exactly the same ids and paths', () => {
      expect(mapped('path')).toEqual(NEWS_FEEDS.map((feed) => [feed.id, feed.path]));
    });

    it('fetches only the host and path it has listed, and nothing the page asks for', () => {
      const block = nginx.slice(nginx.indexOf('location ~ ^/api/news/'));
      const location = block.slice(0, block.indexOf('\n  }'));

      expect(location).toContain('proxy_pass https://$news_host$news_path;');
      expect(location).toContain('limit_except GET');
      expect(location).toContain('if ($news_host = "")');
      expect(location).not.toMatch(/\$arg_|\$args|\$query_string|\$http_/);
    });
  });
});

describe('feedOf', () => {
  it('finds a feed by its id', () => {
    expect(feedOf('npr').name).toBe('NPR News');
  });

  it('is the first for an id it does not know, rather than nothing', () => {
    expect(feedOf('nope')).toBe(NEWS_FEEDS[0]);
  });
});

describe('readFeed', () => {
  it('keeps an id that is offered', () => {
    expect(readFeed('ars')).toBe('ars');
  });

  it.each([['nonsense'], [''], [undefined], [null], [7], [{ id: 'bbc' }]])(
    'falls back to the default for %j',
    (value) => {
      expect(readFeed(value)).toBe(DEFAULT_FEED);
    }
  );
});
