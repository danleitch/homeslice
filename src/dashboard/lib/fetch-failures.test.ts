import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchRankings } from './benchlm';
import { fetchTrending } from './github';
import { ProxyUnavailableError, fetchQuotes } from './markets';
import { fetchShows } from './tmdb';

const signal = new AbortController().signal;

type Answer = { status?: number; ok?: boolean; type?: string | null; body?: unknown };

const answer = ({
  status = 200,
  ok = status >= 200 && status < 300,
  type = 'application/json',
  body = {}
}: Answer): Response =>
  ({
    status,
    ok,
    headers: { get: (name: string) => (name.toLowerCase() === 'content-type' ? type : null) },
    json: async () => body
  }) as unknown as Response;

const serve = (...answers: Answer[]): ReturnType<typeof vi.fn> => {
  const fetchMock = vi.fn();

  for (const next of answers) {
    fetchMock.mockResolvedValueOnce(answer(next));
  }

  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

describe('when a service does not answer well', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('the AI Leaderboard', () => {
    it.each([401, 403])('says the server is not set up, for a %i', async (status) => {
      serve({ status });

      await expect(fetchRankings('overall', signal)).rejects.toThrow(
        'BenchLM isn’t set up on this server yet: it needs a BENCHLM_TOKEN.'
      );
    });

    it('says the monthly reads have run out, and that it will try again', async () => {
      serve({ status: 429 });

      await expect(fetchRankings('overall', signal)).rejects.toThrow(
        'BenchLM’s monthly reads have run out; it will try again later.'
      );
    });

    it('says the host has no relay, when it answers with a page rather than JSON', async () => {
      serve({ type: 'text/html' });

      await expect(fetchRankings('overall', signal)).rejects.toThrow(
        'BenchLM goes through this dashboard’s server, which this host doesn’t provide.'
      );
    });

    it('says the same when the answer says nothing about what it is', async () => {
      serve({ type: null });

      await expect(fetchRankings('overall', signal)).rejects.toThrow(
        'which this host doesn’t provide'
      );
    });

    it('says it did not answer, for any other failure', async () => {
      serve({ status: 500 });

      await expect(fetchRankings('overall', signal)).rejects.toThrow('BenchLM didn’t answer.');
    });

    it('asks for the ranking it was asked for', async () => {
      const fetchMock = serve({ body: { data: [] } });

      await fetchRankings('coding', signal).catch(() => undefined);

      expect(fetchMock.mock.calls[0]![0]).toContain('surface=coding');
      expect(fetchMock.mock.calls[0]![1]).toEqual({ signal });
    });
  });

  describe('GitHub Trending', () => {
    it('says there is no list for a language GitHub does not have one for', async () => {
      serve({ status: 404 });

      await expect(fetchTrending('cobol-ish', 'daily', 5, signal)).rejects.toThrow(
        'GitHub Trending has no list for “cobol-ish”.'
      );
    });

    it('says it did not answer, for any other failure', async () => {
      serve({ status: 503 });

      await expect(fetchTrending('rust', 'weekly', 5, signal)).rejects.toThrow(
        'GitHub Trending didn’t answer.'
      );
    });

    it('asks for the language and the period', async () => {
      const fetchMock = serve({ body: { items: [] } });

      await fetchTrending('rust', 'weekly', 5, signal);

      expect(fetchMock.mock.calls[0]![0]).toContain('rust');
      expect(fetchMock.mock.calls[0]![0]).toContain('weekly');
    });
  });

  describe('Popular TV', () => {
    it.each([401, 403])('says the server is not set up, for a %i', async (status) => {
      serve({ status });

      await expect(fetchShows('week', 5, signal)).rejects.toThrow(
        'TMDB isn’t set up on this server yet: it needs a TMDB_TOKEN.'
      );
    });

    it('says the host has no relay, when it answers with a page rather than JSON', async () => {
      serve({ type: 'text/html' });

      await expect(fetchShows('week', 5, signal)).rejects.toThrow(
        'Popular TV goes through this dashboard’s server, which this host doesn’t provide.'
      );
    });

    it('says it did not answer, for any other failure', async () => {
      serve({ status: 500 });

      await expect(fetchShows('week', 5, signal)).rejects.toThrow('TMDB didn’t answer.');
    });

    it('asks for the window it was asked for', async () => {
      const fetchMock = serve({ body: { results: [] } });

      await fetchShows('day', 5, signal);

      expect(fetchMock.mock.calls[0]![0]).toContain('window=day');
    });
  });

  describe('market prices', () => {
    const symbols = [
      { symbol: 'AAPL', name: 'Apple' },
      { symbol: 'MSFT', name: 'Microsoft' }
    ];

    it('says the host has no proxy, when it answers with a page rather than JSON', async () => {
      serve({ type: 'text/html' }, { type: 'text/html' });

      await expect(fetchQuotes(symbols, signal)).rejects.toBeInstanceOf(ProxyUnavailableError);
    });

    it('says no prices came back when every symbol is turned away', async () => {
      serve({ status: 500 }, { status: 502 });

      await expect(fetchQuotes(symbols, signal)).rejects.toThrow(
        'No prices came back for those symbols.'
      );
    });

    it('gives the others when only one symbol is turned away', async () => {
      serve(
        { status: 500 },
        {
          body: {
            chart: {
              result: [
                {
                  meta: {
                    regularMarketPrice: 100,
                    chartPreviousClose: 90,
                    currency: 'USD',
                    priceHint: 2
                  },
                  indicators: { quote: [{ close: [90, 95, 100] }] }
                }
              ]
            }
          }
        }
      );

      const quotes = await fetchQuotes(symbols, signal);

      expect(quotes.map((quote) => quote.symbol)).toEqual(['MSFT']);
    });

    it('asks for each symbol separately, encoded, for a month of days', async () => {
      const fetchMock = serve({ status: 500 }, { status: 500 });

      await fetchQuotes(
        [
          { symbol: '^GSPC', name: '' },
          { symbol: 'EURUSD=X', name: '' }
        ],
        signal
      ).catch(() => undefined);

      expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
        expect.stringContaining(encodeURIComponent('^GSPC')),
        expect.stringContaining(encodeURIComponent('EURUSD=X'))
      ]);
      expect(fetchMock.mock.calls[0]![0]).toContain('range=1mo&interval=1d');
    });

    it('asks for nothing, and gives nothing, when there are no symbols', async () => {
      const fetchMock = serve();

      expect(await fetchQuotes([], signal)).toEqual([]);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
});
