import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  closesFromChanges,
  compactUsd,
  fetchToken,
  isTokenAddress,
  normalizeSymbol,
  pickPair,
  priceDigits,
  quoteOf,
  readCloses
} from './tokens';

// A made-up Solana mint: base58, as long as the real ones are.
const MINT = 'DemoMint1111111111111111111111111111111pump';
const EVM = '0xAbAbAbAbAbAbAbAbAbAbAbAbAbAbAbAbAbAbAbAb';
const POOL = 'PoolAddress111111111111111111111111111111111';
const signal = new AbortController().signal;

describe('isTokenAddress', () => {
  it.each([
    ['a Solana mint', MINT],
    ['the shortest a Solana mint can be', '1'.repeat(32)],
    ['the longest a Solana mint can be', '1'.repeat(44)],
    ['an address on an Ethereum-style chain', EVM],
    ['one in lower case', EVM.toLowerCase()]
  ])('knows %s', (_what, text) => {
    expect(isTokenAddress(text)).toBe(true);
  });

  it.each([
    ['a stock', 'AAPL'],
    ['a currency pair', 'EURUSD=X'],
    ['an index', '^GSPC'],
    ['a coin on Yahoo', 'BTC-USD'],
    ['nothing', ''],
    ['too few base58 characters', '1'.repeat(31)],
    ['too many base58 characters', '1'.repeat(45)],
    ['a zero, which base58 leaves out', `0${'1'.repeat(40)}`],
    ['a capital O, which base58 leaves out', `O${'1'.repeat(40)}`],
    ['a capital I, which base58 leaves out', `I${'1'.repeat(40)}`],
    ['a lower-case l, which base58 leaves out', `l${'1'.repeat(40)}`],
    ['a hex address a digit short', EVM.slice(0, -1)],
    ['a hex address a digit long', `${EVM}a`],
    ['hex with a letter that is not a digit', `0x${'g'.repeat(40)}`]
  ])('does not take %s for one', (_what, text) => {
    expect(isTokenAddress(text)).toBe(false);
  });
});

describe('normalizeSymbol', () => {
  it('upper-cases and trims a Yahoo symbol', () => {
    expect(normalizeSymbol('  btc-usd ')).toBe('BTC-USD');
    expect(normalizeSymbol('eurusd=x')).toBe('EURUSD=X');
  });

  it('keeps an address exactly as it was typed, which for a Solana mint is case-sensitive', () => {
    expect(normalizeSymbol(`  ${MINT} `)).toBe(MINT);
    expect(normalizeSymbol(EVM)).toBe(EVM);
  });

  it('keeps a Yahoo symbol to twenty-four characters, and an address to its own length', () => {
    expect(normalizeSymbol('a-'.repeat(20))).toBe('A-'.repeat(12));
    expect(normalizeSymbol(MINT)).toHaveLength(MINT.length);
  });

  it('is empty for nothing', () => {
    expect(normalizeSymbol('   ')).toBe('');
  });
});

describe('priceDigits', () => {
  it.each([
    [150, 2],
    [1, 2],
    [0.5, 4],
    [0.0123, 5],
    [0.00001234, 8],
    [1e-15, 12],
    [0, 2],
    [-1, 2],
    [Number.NaN, 2]
  ])('shows %d to %d places', (price, digits) => {
    expect(priceDigits(price)).toBe(digits);
  });

  it('shows four significant digits of a tiny price', () => {
    expect((0.00001234).toFixed(priceDigits(0.00001234))).toBe('0.00001234');
  });
});

describe('compactUsd', () => {
  it.each([
    [0, '$0'],
    [950, '$950'],
    [1_234, '$1.2K'],
    [38_500, '$38.5K'],
    [150_000, '$150K'],
    [1_200_000, '$1.2M'],
    [250_000_000, '$250M'],
    [3_400_000_000, '$3.4B']
  ])('writes %d as %s', (amount, text) => {
    expect(compactUsd(amount)).toBe(text);
  });
});

const pair = (overrides: Record<string, unknown> = {}) => ({
  chainId: 'solana',
  url: `https://dexscreener.com/solana/${POOL}`,
  pairAddress: POOL,
  baseToken: { address: MINT, name: 'Demo Token', symbol: 'DEMO' },
  priceUsd: '0.00004213',
  priceChange: { h1: 2, h6: -5, h24: 18.4 },
  liquidity: { usd: 38_500 },
  ...overrides
});

describe('pickPair', () => {
  it('takes the pool with the most money in it', () => {
    const small = pair({ pairAddress: 'small', liquidity: { usd: 1_000 } });
    const big = pair({ pairAddress: 'big', liquidity: { usd: 90_000 } });

    expect(pickPair(MINT, { pairs: [small, big, small] })).toBe(big);
  });

  it('ignores a pool where the token is the other side of the trade', () => {
    const other = pair({ baseToken: { address: 'SomethingElse', symbol: 'OTHER' } });
    const ours = pair({ liquidity: { usd: 5 } });

    expect(pickPair(MINT, { pairs: [other, ours] })).toBe(ours);
  });

  it('matches the address without minding the case, as an Ethereum address may be written either way', () => {
    const ours = pair({ baseToken: { address: EVM.toLowerCase(), symbol: 'EVM' } });

    expect(pickPair(EVM, { pairs: [ours] })).toBe(ours);
  });

  it('ignores a pool with no price, or one that is zero', () => {
    const none = pair({ priceUsd: undefined });
    const zero = pair({ priceUsd: '0' });
    const ours = pair({ liquidity: { usd: 1 } });

    expect(pickPair(MINT, { pairs: [none, zero, ours] })).toBe(ours);
  });

  it('takes a pool with no liquidity figure, when it is all there is', () => {
    const ours = pair({ liquidity: undefined });

    expect(pickPair(MINT, { pairs: [ours] })).toBe(ours);
  });

  it.each([
    ['no pools', { pairs: [] }],
    ['a null list, as DexScreener answers for an unknown token', { pairs: null }],
    ['no list', {}],
    ['nothing', null],
    ['something else altogether', 'oops'],
    ['pools that are not objects', { pairs: [null, 3] }]
  ])('finds none in %s', (_what, body) => {
    expect(pickPair(MINT, body)).toBeNull();
  });
});

describe('readCloses', () => {
  const candles = (rows: unknown[]) => ({ data: { attributes: { ohlcv_list: rows } } });

  it('takes the closes, which come newest first, and puts them oldest first', () => {
    expect(
      readCloses(
        candles([
          [3, 0, 0, 0, 0.003, 0],
          [2, 0, 0, 0, 0.002, 0],
          [1, 0, 0, 0, 0.001, 0]
        ])
      )
    ).toEqual([0.001, 0.002, 0.003]);
  });

  it('leaves out a candle that is broken or has no price', () => {
    expect(
      readCloses(candles([[3, 0, 0, 0, 0.003], 'junk', [2, 0, 0, 0, 0], [1, 0, 0, 0, null]]))
    ).toEqual([0.003]);
  });

  it.each([
    ['nothing', null],
    ['no list', {}],
    ['a list that is not one', candles([]).data]
  ])('is empty for %s', (_what, body) => {
    expect(readCloses(body)).toEqual([]);
  });
});

describe('closesFromChanges', () => {
  it('works back from the price by the changes over a day, six hours and an hour', () => {
    const closes = closesFromChanges(100, { h24: 100, h6: 25, h1: -50 });

    expect(closes).toEqual([50, 80, 200, 100]);
  });

  it('uses the changes it has', () => {
    expect(closesFromChanges(100, { h24: 100 })).toEqual([50, 100]);
  });

  it('is only the price when it has none', () => {
    expect(closesFromChanges(100, undefined)).toEqual([100]);
    expect(closesFromChanges(100, {})).toEqual([100]);
  });

  it('leaves out a change that would mean the price was nothing', () => {
    expect(closesFromChanges(100, { h24: -100, h6: -150 })).toEqual([100]);
  });
});

describe('quoteOf', () => {
  const request = { symbol: MINT, name: '' };

  it('makes a quote in dollars, with the pool’s own link and how much money is in it', () => {
    expect(quoteOf(request, pair(), [0.00003, 0.00004213])).toEqual({
      symbol: 'DEMO',
      name: 'Demo Token',
      price: 0.00004213,
      change: 18.4,
      currency: 'USD',
      precision: 8,
      closes: [0.00003, 0.00004213],
      url: `https://dexscreener.com/solana/${POOL}`,
      liquidity: 38_500
    });
  });

  it('prefers the name the visitor gave it', () => {
    expect(quoteOf({ symbol: MINT, name: 'My coin' }, pair(), []).name).toBe('My coin');
  });

  it('is called by the start of its address when it has no ticker', () => {
    const quote = quoteOf(request, pair({ baseToken: { address: MINT } }), []);

    expect(quote.symbol).toBe('Demo…');
    expect(quote.name).toBe('');
  });

  it('draws its trend from the changes when there are too few candles', () => {
    const quote = quoteOf(request, pair({ priceChange: { h24: 100 } }), [0.00004]);

    expect(quote.closes).toEqual([0.00004213 / 2, 0.00004213]);
  });

  it('has no change when none is reported, and no liquidity figure when it is not given', () => {
    const quote = quoteOf(request, pair({ priceChange: undefined, liquidity: undefined }), []);

    expect(quote.change).toBe(0);
    expect(quote).not.toHaveProperty('liquidity');
  });

  it('makes the pool’s address from its chain when it is not given one', () => {
    expect(quoteOf(request, pair({ url: undefined }), []).url).toBe(
      `https://dexscreener.com/solana/${POOL}`
    );
  });

  it('has no link when it can’t make one', () => {
    expect(
      quoteOf(request, pair({ url: undefined, pairAddress: undefined }), []).url
    ).toBeUndefined();
  });

  it('reads a price DexScreener gives as a number too', () => {
    expect(quoteOf(request, pair({ priceUsd: 2.5 }), []).price).toBe(2.5);
  });
});

describe('fetchToken', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  const json = (body: unknown, ok = true): Response => ({ ok, json: async () => body }) as Response;
  const candles = {
    data: {
      attributes: {
        ohlcv_list: [
          [3, 0, 0, 0, 0.00004213, 0],
          [2, 0, 0, 0, 0.00003, 0],
          [1, 0, 0, 0, 0.00002, 0]
        ]
      }
    }
  };

  /** DexScreener's answer for the dex address, and what the test says for GeckoTerminal's. */
  const answers = (gecko: () => Promise<Response>, dex: Response = json({ pairs: [pair()] })) =>
    vi.fn((url: string) => (url.includes('geckoterminal') ? gecko() : Promise.resolve(dex)));

  beforeEach(() => {
    fetchMock = answers(async () => json(candles));
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('asks DexScreener for the token by its address, then GeckoTerminal for the pool’s daily candles', async () => {
    await fetchToken({ symbol: MINT, name: '' }, signal);

    expect(fetchMock.mock.calls[0]).toEqual([
      `https://api.dexscreener.com/latest/dex/tokens/${MINT}`,
      { signal }
    ]);
    expect(fetchMock.mock.calls[1]![0]).toBe(
      `https://api.geckoterminal.com/api/v2/networks/solana/pools/${POOL}/ohlcv/day?aggregate=1&limit=22&currency=usd`
    );
    expect(fetchMock.mock.calls[1]![1]).toEqual({ signal });
  });

  it('gives the quote, with the trend from the candles, oldest first', async () => {
    const quote = await fetchToken({ symbol: MINT, name: '' }, signal);

    expect(quote).toMatchObject({
      symbol: 'DEMO',
      price: 0.00004213,
      change: 18.4,
      closes: [0.00002, 0.00003, 0.00004213],
      liquidity: 38_500
    });
  });

  it('names an Ethereum-style chain as GeckoTerminal does', async () => {
    fetchMock.mockImplementation(
      answers(
        async () => json(candles),
        json({ pairs: [pair({ chainId: 'ethereum', baseToken: { address: EVM, symbol: 'EVM' } })] })
      )
    );

    await fetchToken({ symbol: EVM, name: '' }, signal);

    expect(fetchMock.mock.calls[1]![0]).toContain('/networks/eth/pools/');
  });

  it('draws the trend from the changes when GeckoTerminal has no candles yet', async () => {
    fetchMock.mockImplementation(
      answers(async () => json({ data: { attributes: { ohlcv_list: [] } } }))
    );

    const quote = await fetchToken({ symbol: MINT, name: '' }, signal);

    expect(quote!.closes).toHaveLength(4);
    expect(quote!.closes[3]).toBe(0.00004213);
  });

  it.each([
    ['says no', async () => json({}, false)],
    ['cannot be reached', () => Promise.reject(new TypeError('Failed to fetch'))]
  ])('keeps the price when GeckoTerminal %s', async (_what, gecko) => {
    fetchMock.mockImplementation(answers(gecko));

    const quote = await fetchToken({ symbol: MINT, name: '' }, signal);

    expect(quote!.price).toBe(0.00004213);
    expect(quote!.closes.length).toBeGreaterThanOrEqual(2);
  });

  it('asks GeckoTerminal for nothing about a chain it doesn’t know', async () => {
    fetchMock.mockImplementation(
      answers(async () => json(candles), json({ pairs: [pair({ chainId: 'mars' })] }))
    );

    const quote = await fetchToken({ symbol: MINT, name: '' }, signal);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(quote!.price).toBe(0.00004213);
  });

  it('asks GeckoTerminal for nothing about a pool with no address', async () => {
    fetchMock.mockImplementation(
      answers(async () => json(candles), json({ pairs: [pair({ pairAddress: undefined })] }))
    );

    await fetchToken({ symbol: MINT, name: '' }, signal);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('is nothing when DexScreener has no pool for the token', async () => {
    fetchMock.mockImplementation(answers(async () => json(candles), json({ pairs: null })));

    expect(await fetchToken({ symbol: MINT, name: '' }, signal)).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('is nothing when DexScreener says no', async () => {
    fetchMock.mockImplementation(answers(async () => json(candles), json({}, false)));

    expect(await fetchToken({ symbol: MINT, name: '' }, signal)).toBeNull();
  });

  it('fails when DexScreener cannot be reached, for the caller to leave the row out', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(fetchToken({ symbol: MINT, name: '' }, signal)).rejects.toThrow('Failed to fetch');
  });

  it('lets the widget leave it behind when the reading is abandoned', async () => {
    const controller = new AbortController();
    controller.abort();
    fetchMock.mockImplementation(
      answers(() => Promise.reject(new DOMException('Aborted', 'AbortError')))
    );

    await expect(fetchToken({ symbol: MINT, name: '' }, controller.signal)).rejects.toThrow(
      'Aborted'
    );
  });
});
