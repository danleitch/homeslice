import { afterEach, describe, expect, it, vi } from 'vitest';
import { NEWS_KEPT, PROXY_MESSAGE, fetchNews, parseFeed } from './rss';

const rss = (items: string, extra = ''): string =>
  `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>News</title>${extra}${items}</channel></rss>`;

const item = (title: string, link: string, date = '', extra = ''): string =>
  `<item><title>${title}</title><link>${link}</link>${date ? `<pubDate>${date}</pubDate>` : ''}${extra}</item>`;

describe('parseFeed', () => {
  describe('an RSS feed', () => {
    it('reads each headline, with where it goes and when it was published', () => {
      const items = parseFeed(
        rss(
          item('First', 'https://example.com/1', 'Tue, 06 Oct 2026 17:00:00 GMT') +
            item('Second', 'https://example.com/2', 'Tue, 06 Oct 2026 16:00:00 GMT')
        )
      );

      expect(items).toEqual([
        { title: 'First', url: 'https://example.com/1', time: Date.UTC(2026, 9, 6, 17) / 1000 },
        { title: 'Second', url: 'https://example.com/2', time: Date.UTC(2026, 9, 6, 16) / 1000 }
      ]);
    });

    it('keeps the order the feed gives', () => {
      const items = parseFeed(rss(item('B', 'https://x.test/b') + item('A', 'https://x.test/a')));

      expect(items!.map((entry) => entry.title)).toEqual(['B', 'A']);
    });

    it('has no time for an item with no date, or one that is not a date', () => {
      const items = parseFeed(
        rss(item('No date', 'https://x.test/1') + item('Bad', 'https://x.test/2', 'sometime'))
      );

      expect(items!.map((entry) => entry.time)).toEqual([0, 0]);
    });

    it('reads a title in CDATA, and takes the tags a publisher left in it out', () => {
      const items = parseFeed(
        rss(item('<![CDATA[Bold <b>move</b> by the <i>council</i>]]>', 'https://x.test/1'))
      );

      expect(items![0]!.title).toBe('Bold move by the council');
    });

    it('runs the lines of a title together', () => {
      expect(parseFeed(rss(item('A\n   long\ttitle', 'https://x.test/1')))![0]!.title).toBe(
        'A long title'
      );
    });

    it('reads the entities XML has, and numbers', () => {
      expect(
        parseFeed(
          rss(item('Q&amp;A: it&apos;s &quot;fine&quot; &#8217; &#x2014;', 'https://x.test/1'))
        )![0]!.title
      ).toBe('Q&A: it\'s "fine" ’ —');
    });

    it('takes out markup a publisher escaped into a title, which is never shown as markup', () => {
      expect(
        parseFeed(rss(item('Big &lt;b&gt;news&lt;/b&gt; today', 'https://x.test/1')))![0]!.title
      ).toBe('Big news today');
    });

    it('does not lose the whole feed to an HTML entity that XML does not have', () => {
      const items = parseFeed(rss(item('Fish&nbsp;and chips & mushy peas', 'https://x.test/1')));

      expect(items).toHaveLength(1);
      expect(items![0]!.title).toBe('Fish&nbsp;and chips & mushy peas');
    });

    it('takes an item’s permalink when it has no link', () => {
      const items = parseFeed(
        rss(
          '<item><title>No link</title><guid isPermaLink="true">https://x.test/guid</guid></item>'
        )
      );

      expect(items![0]!.url).toBe('https://x.test/guid');
    });

    it('leaves out an item with no title or nowhere to go', () => {
      const items = parseFeed(
        rss(
          item('', 'https://x.test/1') +
            item('No place', '') +
            '<item><title>No link at all</title></item>' +
            item('Kept', 'https://x.test/kept')
        )
      );

      expect(items!.map((entry) => entry.title)).toEqual(['Kept']);
    });

    it('is empty for a feed with nothing in it', () => {
      expect(parseFeed(rss(''))).toEqual([]);
    });

    it('keeps the top twenty', () => {
      const many = Array.from({ length: 30 }, (_unused, n) =>
        item(`Story ${n}`, `https://x.test/${n}`)
      );

      expect(parseFeed(rss(many.join('')))).toHaveLength(NEWS_KEPT);
      expect(NEWS_KEPT).toBe(20);
    });
  });

  describe('links, which a feed does not get to choose', () => {
    it.each([
      ['a script', 'javascript:alert(1)'],
      ['data', 'data:text/html,<script>alert(1)</script>'],
      ['a file', 'file:///etc/passwd'],
      ['a relative address', '/story/1'],
      ['nothing like an address', 'not a link']
    ])('does not keep %s as a link', (_what, link) => {
      expect(parseFeed(rss(item('Hostile', link)))).toEqual([]);
    });

    it('keeps http and https, and writes them out in full', () => {
      const items = parseFeed(
        rss(item('A', 'http://x.test/a b') + item('B', '  https://x.test/b  '))
      );

      expect(items!.map((entry) => entry.url)).toEqual(['http://x.test/a%20b', 'https://x.test/b']);
    });

    it('does not take a hostile permalink for a link', () => {
      const items = parseFeed(rss('<item><title>T</title><guid>javascript:alert(1)</guid></item>'));

      expect(items).toEqual([]);
    });
  });

  describe('an Atom feed', () => {
    const atom = (entries: string): string =>
      `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><title>News</title>${entries}</feed>`;

    it('reads each entry: its title, the link that is the story, and when it was last changed', () => {
      const items = parseFeed(
        atom(
          `<entry><title>Atom story</title>
             <link rel="replies" href="https://x.test/replies"/>
             <link rel="alternate" href="https://x.test/story"/>
             <updated>2026-10-06T17:00:00Z</updated></entry>`
        )
      );

      expect(items).toEqual([
        { title: 'Atom story', url: 'https://x.test/story', time: Date.UTC(2026, 9, 6, 17) / 1000 }
      ]);
    });

    it('takes a link with no rel, which is the story', () => {
      const items = parseFeed(
        atom('<entry><title>T</title><link href="https://x.test/1"/></entry>')
      );

      expect(items![0]!.url).toBe('https://x.test/1');
    });

    it('prefers when it was published to when it was updated', () => {
      const items = parseFeed(
        atom(
          `<entry><title>T</title><link href="https://x.test/1"/>
             <published>2026-10-06T10:00:00Z</published><updated>2026-10-06T17:00:00Z</updated></entry>`
        )
      );

      expect(items![0]!.time).toBe(Date.UTC(2026, 9, 6, 10) / 1000);
    });

    it('leaves out an entry whose only link is not the story', () => {
      expect(
        parseFeed(
          atom('<entry><title>T</title><link rel="replies" href="https://x.test/r"/></entry>')
        )
      ).toEqual([]);
    });
  });

  describe('an RSS 1.0 feed', () => {
    it('reads its items, which sit beside the channel rather than in it, and Dublin Core dates', () => {
      const items = parseFeed(
        `<?xml version="1.0"?>
         <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="http://purl.org/rss/1.0/" xmlns:dc="http://purl.org/dc/elements/1.1/">
           <channel><title>N</title></channel>
           <item><title>Old style</title><link>https://x.test/old</link><dc:date>2026-10-06T17:00:00Z</dc:date></item>
         </rdf:RDF>`
      );

      expect(items).toEqual([
        { title: 'Old style', url: 'https://x.test/old', time: Date.UTC(2026, 9, 6, 17) / 1000 }
      ]);
    });
  });

  describe('what is not a feed', () => {
    it.each([
      ['a web page', '<!doctype html><html><body><h1>Hello</h1></body></html>'],
      ['XML that is not a feed', '<?xml version="1.0"?><note><to>you</to></note>'],
      ['text', 'Not Found'],
      ['nothing', ''],
      ['XML that is broken', '<rss><channel><item></channel>'],
      ['JSON', '{"items": []}']
    ])('is null for %s', (_what, body) => {
      expect(parseFeed(body)).toBeNull();
    });
  });
});

describe('fetchNews', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const signal = new AbortController().signal;
  const answer = (body: string, init: ResponseInit & { type?: string } = {}) =>
    new Response(body, {
      headers: { 'content-type': init.type ?? 'application/rss+xml' },
      ...init
    });

  it('asks the relay for the feed by its id, and gives the headlines', async () => {
    const fetchMock = vi.fn(async () => answer(rss(item('Hello', 'https://x.test/1'))));
    vi.stubGlobal('fetch', fetchMock);

    const items = await fetchNews('bbc', signal);

    expect(fetchMock).toHaveBeenCalledWith('/api/news/bbc', { signal });
    expect(items.map((entry) => entry.title)).toEqual(['Hello']);
  });

  it('never puts anything but the id in the address', async () => {
    const fetchMock = vi.fn<(url: string) => Promise<Response>>(async () => answer(rss('')));
    vi.stubGlobal('fetch', fetchMock);

    await fetchNews('../../etc/passwd', signal);

    expect(fetchMock.mock.calls[0]![0]).toBe('/api/news/..%2F..%2Fetc%2Fpasswd');
  });

  it('is an empty list for a feed with no headlines, which is not an error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => answer(rss('')))
    );

    expect(await fetchNews('bbc', signal)).toEqual([]);
  });

  it('says a feed is not offered when the relay does not know it', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => answer('', { status: 404 }))
    );

    await expect(fetchNews('nope', signal)).rejects.toThrow('That feed isn’t offered.');
  });

  it('says what the publisher answered when it is not all right', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => answer('', { status: 502 }))
    );

    await expect(fetchNews('bbc', signal)).rejects.toThrow('The feed answered 502.');
  });

  it('knows a static host without the relay when it answers with the app’s own page', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => answer('<!doctype html><html></html>', { type: 'text/html' }))
    );

    await expect(fetchNews('bbc', signal)).rejects.toThrow(PROXY_MESSAGE);
  });

  it('says a feed could not be read when it is not one and does not say it is a page', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => answer('plainly nothing', { type: 'text/plain' }))
    );

    await expect(fetchNews('bbc', signal)).rejects.toThrow('That feed couldn’t be read.');
  });

  it('says a feed could not be read when the answer says nothing of its kind', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('plainly nothing', { headers: {} }))
    );

    await expect(fetchNews('bbc', signal)).rejects.toThrow('That feed couldn’t be read.');
  });

  it('lets the widget leave it behind when the reading is abandoned', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new DOMException('Aborted', 'AbortError')))
    );

    await expect(fetchNews('bbc', signal)).rejects.toThrow('Aborted');
  });
});
