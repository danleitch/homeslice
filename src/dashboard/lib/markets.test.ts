import { describe, expect, it, vi } from 'vitest';
import { ProxyUnavailableError, fetchQuotes, formatPrice, parseQuote, sparkline } from './markets';

const chart = (closes: (number | null)[], meta: Record<string, unknown> = {}) => ({
  chart: {
    result: [
      {
        meta: {
          symbol: 'AAPL',
          currency: 'USD',
          regularMarketPrice: 110,
          shortName: 'Apple Inc.',
          priceHint: 2,
          ...meta
        },
        indicators: { quote: [{ close: closes }] }
      }
    ]
  }
});

describe('parseQuote', () => {
  it('works out the day’s change from the last two closes', () => {
    const quote = parseQuote({ symbol: 'AAPL', name: '' }, chart([90, null, 100, 110]));

    expect(quote).toMatchObject({ name: 'Apple Inc.', price: 110, currency: 'USD' });
    expect(quote?.change).toBeCloseTo(10);
    expect(quote?.closes).toEqual([90, 100, 110]);
  });

  it('prefers the change Yahoo reports, and the visitor’s own name for the symbol', () => {
    const quote = parseQuote(
      { symbol: 'AAPL', name: 'Apple' },
      chart([100, 110], { regularMarketChangePercent: -1.5 })
    );

    expect(quote).toMatchObject({ name: 'Apple', change: -1.5 });
  });

  it('returns nothing for a symbol Yahoo does not know', () => {
    expect(parseQuote({ symbol: 'NOPE', name: '' }, { chart: { result: [] } })).toBeNull();
  });
});

describe('formatPrice', () => {
  it('uses the currency’s symbol and the precision Yahoo suggests', () => {
    const base = { symbol: 'X', name: 'X', change: 0, closes: [], precision: 2 };

    expect(formatPrice({ ...base, price: 1234.5, currency: 'USD' })).toBe('$1,234.50');
    expect(formatPrice({ ...base, price: 18.2, currency: 'ZAR' })).toBe('R18.20');
    expect(formatPrice({ ...base, price: 3, currency: 'XYZ' })).toBe('3.00 XYZ');
  });
});

describe('sparkline', () => {
  it('draws the closes across the box, highest at the top', () => {
    const { line, area } = sparkline([1, 3, 2], 100, 20);

    expect(line).toBe('M0.00 18.00 L50.00 2.00 L100.00 10.00');
    expect(area).toMatch(/Z$/);
  });

  it('draws nothing from a single point', () => {
    expect(sparkline([5], 100, 20)).toEqual({ line: '', area: '' });
  });
});

describe('fetchQuotes', () => {
  it('asks the same-origin proxy for each symbol', async () => {
    const fetch = vi.fn(
      async () =>
        new Response(JSON.stringify(chart([100, 110])), {
          headers: { 'content-type': 'application/json' }
        })
    );
    vi.stubGlobal('fetch', fetch);

    const quotes = await fetchQuotes([{ symbol: 'AAPL', name: '' }], new AbortController().signal);

    expect(fetch).toHaveBeenCalledWith(
      '/api/markets/AAPL?range=1mo&interval=1d',
      expect.anything()
    );
    expect(quotes[0].price).toBe(110);
  });

  it('knows a static host without the proxy when it answers with the app’s own page', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () => new Response('<!doctype html>', { headers: { 'content-type': 'text/html' } })
      )
    );

    await expect(
      fetchQuotes([{ symbol: 'AAPL', name: '' }], new AbortController().signal)
    ).rejects.toBeInstanceOf(ProxyUnavailableError);
  });
});

describe('fetchQuotes, with tokens', () => {
  const MINT = 'DemoMint1111111111111111111111111111111pump';
  const POOL = 'PoolAddress111111111111111111111111111111111';
  const signal = new AbortController().signal;
  const dex = {
    pairs: [
      {
        chainId: 'solana',
        url: `https://dexscreener.com/solana/${POOL}`,
        pairAddress: POOL,
        baseToken: { address: MINT, name: 'Demo Token', symbol: 'DEMO' },
        priceUsd: '0.00004213',
        priceChange: { h24: 18.4 },
        liquidity: { usd: 38_500 }
      }
    ]
  };

  /** Yahoo's proxy answers for symbols, DexScreener for the token, GeckoTerminal for nothing. */
  const answering = (token: () => Promise<Response>) =>
    vi.fn(async (url: string) => {
      if (url.startsWith('/api/markets/')) {
        return new Response(JSON.stringify(chart([100, 110])), {
          headers: { 'content-type': 'application/json' }
        });
      }

      return url.includes('dexscreener') ? token() : new Response('{}', { status: 404 });
    });
  const reply = async () => new Response(JSON.stringify(dex));

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reads a token from where it trades, and the rest from Yahoo, in the order they were asked', async () => {
    const fetch = answering(reply);
    vi.stubGlobal('fetch', fetch);

    const quotes = await fetchQuotes(
      [
        { symbol: 'BTC-USD', name: 'Bitcoin' },
        { symbol: MINT, name: '' },
        { symbol: 'AAPL', name: '' }
      ],
      signal
    );

    // The chart this test answers with calls every Yahoo symbol AAPL, so the first is told apart by name.
    expect([quotes[0]!.name, quotes[1]!.symbol, quotes[2]!.symbol]).toEqual([
      'Bitcoin',
      'DEMO',
      'AAPL'
    ]);
    expect(quotes[1]).toMatchObject({ price: 0.00004213, liquidity: 38_500 });
    const asked = fetch.mock.calls.map((call) => call[0] as string);
    expect(asked.filter((url) => url.startsWith('/api/markets/'))).toEqual([
      '/api/markets/BTC-USD?range=1mo&interval=1d',
      '/api/markets/AAPL?range=1mo&interval=1d'
    ]);
    expect(asked).toContain(`https://api.dexscreener.com/latest/dex/tokens/${MINT}`);
  });

  it('never sends a token’s address to the Yahoo proxy', async () => {
    const fetch = answering(reply);
    vi.stubGlobal('fetch', fetch);

    await fetchQuotes([{ symbol: MINT, name: '' }], signal);

    expect(fetch.mock.calls.some((call) => (call[0] as string).startsWith('/api/markets/'))).toBe(
      false
    );
  });

  it('follows a token on a host with no proxy, which only Yahoo’s symbols need', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url.includes('dexscreener')
          ? new Response(JSON.stringify(dex))
          : new Response('<!doctype html>', { headers: { 'content-type': 'text/html' } })
      )
    );

    const quotes = await fetchQuotes([{ symbol: MINT, name: '' }], signal);

    expect(quotes).toHaveLength(1);
  });

  it('leaves a token it cannot read out, and keeps the others', async () => {
    vi.stubGlobal(
      'fetch',
      answering(() => Promise.reject(new TypeError('Failed to fetch')))
    );

    const quotes = await fetchQuotes(
      [
        { symbol: MINT, name: '' },
        { symbol: 'AAPL', name: '' }
      ],
      signal
    );

    expect(quotes.map((quote) => quote.symbol)).toEqual(['AAPL']);
  });

  it('leaves a token DexScreener has never heard of out, and keeps the others', async () => {
    vi.stubGlobal(
      'fetch',
      answering(async () => new Response(JSON.stringify({ pairs: null })))
    );

    const quotes = await fetchQuotes(
      [
        { symbol: MINT, name: '' },
        { symbol: 'AAPL', name: '' }
      ],
      signal
    );

    expect(quotes.map((quote) => quote.symbol)).toEqual(['AAPL']);
  });

  it('says so when nothing came back, as it does for symbols Yahoo doesn’t know', async () => {
    vi.stubGlobal(
      'fetch',
      answering(() => Promise.reject(new TypeError('Failed to fetch')))
    );

    await expect(fetchQuotes([{ symbol: MINT, name: '' }], signal)).rejects.toThrow(
      'No prices came back for those symbols.'
    );
  });

  it('lets the widget leave it behind when the reading is abandoned', async () => {
    const controller = new AbortController();
    controller.abort();
    vi.stubGlobal(
      'fetch',
      answering(() => Promise.reject(new DOMException('Aborted', 'AbortError')))
    );

    await expect(fetchQuotes([{ symbol: MINT, name: '' }], controller.signal)).rejects.toThrow(
      'Aborted'
    );
  });
});
