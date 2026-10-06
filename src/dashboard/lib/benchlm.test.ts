import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BENCH_PRESETS,
  blendedPrice,
  fetchPrices,
  fetchRankings,
  pickModels,
  presetOf,
  presetTitle,
  priceKey,
  priceOf,
  readRankings,
  RELAY_LIMITS,
  resetReach,
  type BenchmarkWidget
} from './benchlm';

const body = {
  dataAsOf: '2026-10-02',
  items: [
    {
      rank: 1,
      name: 'GPT-6 Astra',
      creator: 'OpenAI',
      score: 88.75,
      scoreInterval90Lower: 84.17,
      scoreInterval90Upper: 93.33
    },
    { rank: 2, name: 'Claude Opus 5.5', creator: 'Anthropic', score: 87.78 },
    { rank: 3, name: 'Claude Sonnet 5.5', creator: 'Anthropic', score: 83.42 },
    { rank: 4, name: 'No score', creator: 'Nobody' },
    'nonsense'
  ]
};

describe('BenchLM', () => {
  beforeEach(resetReach);
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reads the rankings, keeping only models with a score', () => {
    const rankings = readRankings(body);

    expect(rankings.asOf).toBe('2026-10-02');
    expect(rankings.models).toHaveLength(3);
    expect(rankings.models[0]).toEqual({
      rank: 1,
      name: 'GPT-6 Astra',
      creator: 'OpenAI',
      score: 88.75,
      low: 84.17,
      high: 93.33
    });
    expect(rankings.models[1].low).toBeNull();
    expect(readRankings(null)).toEqual({ asOf: '', models: [] });
  });

  it('picks one lab’s models, as many as asked for', () => {
    const rankings = readRankings(body);

    expect(pickModels(rankings, 'anthropic', 5).map((model) => model.name)).toEqual([
      'Claude Opus 5.5',
      'Claude Sonnet 5.5'
    ]);
    expect(pickModels(rankings, '', 2)).toHaveLength(2);
  });

  it('asks the server’s relay, and says when it has no key', async () => {
    const fetchMock = vi.fn<(url: string) => Promise<Response>>(
      async () =>
        new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } })
    );
    vi.stubGlobal('fetch', fetchMock);
    await fetchRankings('coding', new AbortController().signal);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/benchlm/rankings?surface=coding&limit=200');

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 401 }))
    );
    await expect(fetchRankings('overall', new AbortController().signal)).rejects.toThrow(
      /BENCHLM_TOKEN/
    );

    // A static host answers with its index page.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('<html>', { headers: { 'content-type': 'text/html' } }))
    );
    await expect(fetchRankings('overall', new AbortController().signal)).rejects.toThrow(/server/);
  });

  describe('asking for a wide pool of models', () => {
    const json = (status = 200): Response =>
      new Response(status === 200 ? JSON.stringify(body) : '{}', {
        status,
        headers: { 'content-type': 'application/json' }
      });
    const asked = (fetchMock: { mock: { calls: unknown[][] } }): string[] =>
      fetchMock.mock.calls.map((call) => String(call[0]).replace('/api/benchlm/rankings', ''));

    it('asks for the widest pool first, so a price limit has models to choose from', () => {
      expect(RELAY_LIMITS).toEqual([200, 100, 50]);
    });

    it('steps down to a smaller pool when the API refuses the size, and says nothing', async () => {
      const fetchMock = vi
        .fn<(url: string) => Promise<Response>>()
        .mockResolvedValueOnce(json(400))
        .mockResolvedValueOnce(json(422))
        .mockResolvedValueOnce(json());
      vi.stubGlobal('fetch', fetchMock);

      const rankings = await fetchRankings('coding', new AbortController().signal);

      expect(rankings.models).toHaveLength(3);
      expect(asked(fetchMock)).toEqual([
        '?surface=coding&limit=200',
        '?surface=coding&limit=100',
        '?surface=coding&limit=50'
      ]);
    });

    it('does not ask for a size again that it has been refused this visit', async () => {
      const fetchMock = vi
        .fn<(url: string) => Promise<Response>>()
        .mockResolvedValueOnce(json(400))
        .mockImplementation(async () => json());
      vi.stubGlobal('fetch', fetchMock);

      await fetchRankings('coding', new AbortController().signal);
      await fetchRankings('overall', new AbortController().signal);

      expect(asked(fetchMock)).toEqual([
        '?surface=coding&limit=200',
        '?surface=coding&limit=100',
        '?surface=overall&limit=100'
      ]);
    });

    it('gives up with the usual message when even the smallest pool is refused', async () => {
      const fetchMock = vi.fn(async () => json(400));
      vi.stubGlobal('fetch', fetchMock);

      await expect(fetchRankings('coding', new AbortController().signal)).rejects.toThrow(
        'BenchLM didn’t answer.'
      );
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it('does not step down for any other failure, which a smaller pool would not cure', async () => {
      for (const status of [401, 403, 429, 500, 502]) {
        resetReach();
        const fetchMock = vi.fn(async () => json(status));
        vi.stubGlobal('fetch', fetchMock);

        await fetchRankings('coding', new AbortController().signal).catch(() => undefined);

        expect(fetchMock, String(status)).toHaveBeenCalledTimes(1);
      }
    });
  });

  it('matches a model to its price whatever the punctuation or case', () => {
    expect(priceKey('Claude Sonnet 5.5')).toBe(priceKey('claude-sonnet-5.5'));

    const prices = { [priceKey('Claude Sonnet 5.5')]: { input: 2, output: 10 } };

    expect(priceOf(prices, 'CLAUDE SONNET 5.5')).toEqual({ input: 2, output: 10 });
    expect(priceOf(prices, 'Claude Opus 5.5')).toBeNull();
    // A name that is also a property of every object is still just a name.
    expect(priceOf(prices, 'constructor')).toBeNull();
  });

  it('counts three parts of input to one of output', () => {
    expect(blendedPrice({ input: 2, output: 10 })).toBe(4);
    expect(blendedPrice({ input: 0.5, output: 2.5 })).toBe(1);
  });

  describe('with a price limit', () => {
    const rankings = readRankings({
      items: [
        { rank: 1, name: 'Big One', creator: 'Acme', score: 90 },
        { rank: 2, name: 'Mid Model', creator: 'Acme', score: 80 },
        { rank: 3, name: 'Small Fry', creator: 'Beta', score: 70 },
        { rank: 4, name: 'Open Weights', creator: 'Beta', score: 60 },
        { rank: 5, name: 'Cheap Chips', creator: 'Beta', score: 50 }
      ]
    });
    const prices = {
      [priceKey('Big One')]: { input: 10, output: 50 },
      [priceKey('Mid Model')]: { input: 0.5, output: 2.5 },
      [priceKey('Small Fry')]: { input: 0.1, output: 0.4 },
      [priceKey('Cheap Chips')]: { input: 0.2, output: 1.2 }
    };

    it('keeps the models at or under it, best first, with their prices', () => {
      const picked = pickModels(rankings, '', 5, 1, prices);

      expect(picked.map((model) => model.name)).toEqual(['Mid Model', 'Small Fry', 'Cheap Chips']);
      expect(picked[0]?.price).toEqual({ input: 0.5, output: 2.5 });
    });

    it('leaves out a model with no listed price, rather than calling it free', () => {
      expect(pickModels(rankings, '', 5, 1, prices).map((model) => model.name)).not.toContain(
        'Open Weights'
      );
    });

    it('works with a lab and a count, and with none of the models fitting', () => {
      expect(pickModels(rankings, 'beta', 1, 1, prices).map((model) => model.name)).toEqual([
        'Small Fry'
      ]);
      expect(pickModels(rankings, '', 5, 0.01, prices)).toEqual([]);
    });

    it('shows every model, priced or not, when there is no limit', () => {
      expect(pickModels(rankings, '', 5).map((model) => model.price)).toEqual([
        null,
        null,
        null,
        null,
        null
      ]);
      expect(pickModels(rankings, '', 5, 0, prices)).toHaveLength(5);
    });
  });

  it('knows which preset the settings amount to, whatever the count', () => {
    const widget = {
      id: 'w',
      type: 'benchlm',
      width: 4,
      surface: 'overall',
      creator: '',
      count: 11,
      maxPrice: 0
    } satisfies BenchmarkWidget;

    expect(presetOf(widget)).toBe('top');
    expect(presetOf({ ...widget, creator: '  ' })).toBe('top');
    expect(presetOf({ ...widget, ...BENCH_PRESETS.budget })).toBe('budget');
    expect(presetOf({ ...widget, surface: 'coding' })).toBe('custom');
    expect(presetOf({ ...widget, creator: 'Google' })).toBe('custom');
    expect(presetOf({ ...widget, maxPrice: 2 })).toBe('custom');
  });

  it('names the preset for the card’s title, and has no name for settings that match neither', () => {
    const widget = {
      id: 'w',
      type: 'benchlm',
      width: 4,
      surface: 'overall',
      creator: '',
      count: 5,
      maxPrice: 0
    } satisfies BenchmarkWidget;

    expect(presetTitle(widget)).toBe('Frontier');
    expect(presetTitle({ ...widget, ...BENCH_PRESETS.budget })).toBe('Budget');
    expect(presetTitle({ ...widget, surface: 'agentic' })).toBeNull();
  });

  it('makes the budget preset five models at two dollars, the frontier five with no limit', () => {
    expect(BENCH_PRESETS.budget).toMatchObject({ surface: 'coding', count: 5, maxPrice: 2 });
    expect(BENCH_PRESETS.top).toMatchObject({ surface: 'overall', count: 5, maxPrice: 0 });
  });

  describe('the price list', () => {
    const json = (body: unknown): Response =>
      new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });

    const row = (model: string, inputPrice: number, outputPrice: number) => ({
      model,
      creator: 'Acme',
      inputPrice,
      outputPrice
    });

    const page = (count: number, from = 0) =>
      Array.from({ length: count }, (_, index) => row(`Model ${from + index}`, 1, 2));

    it('reads the prices, leaving out what has none or is not a price', async () => {
      const fetchMock = vi.fn<(url: string) => Promise<Response>>(async () =>
        json({
          models: [
            row('Claude Sonnet 5.5', 2, 10),
            row('Free Bonsai', 0, 0),
            row('Half Free', 0, 3),
            { model: 'No prices' },
            { model: 'Text prices', inputPrice: '1', outputPrice: '2' },
            null,
            'nonsense'
          ]
        })
      );
      vi.stubGlobal('fetch', fetchMock);

      const prices = await fetchPrices(new AbortController().signal);

      expect(prices).toEqual({
        [priceKey('Claude Sonnet 5.5')]: { input: 2, output: 10 },
        [priceKey('Half Free')]: { input: 0, output: 3 }
      });
      // A short page is the whole list.
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/benchlm/pricing?offset=0');
    });

    it('reads on, a page at a time, while the pages are full', async () => {
      const fetchMock = vi.fn<(url: string) => Promise<Response>>(async (url) => {
        const offset = Number(new URL(url, 'http://dash').searchParams.get('offset'));
        return json({ models: offset < 400 ? page(200, offset) : page(30, offset) });
      });
      vi.stubGlobal('fetch', fetchMock);

      const prices = await fetchPrices(new AbortController().signal);

      expect(Object.keys(prices)).toHaveLength(490);
      expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
        '/api/benchlm/pricing?offset=0',
        '/api/benchlm/pricing?offset=200',
        '/api/benchlm/pricing?offset=400',
        '/api/benchlm/pricing?offset=600',
        '/api/benchlm/pricing?offset=800'
      ]);
    });

    it('counts a model once when the list answers every page the same', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => json({ models: page(200) }))
      );

      expect(Object.keys(await fetchPrices(new AbortController().signal))).toHaveLength(200);
    });

    it('keeps what it has when a later page fails', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async (url: string) =>
          url.endsWith('offset=0') ? json({ models: page(200) }) : new Response('', { status: 500 })
        )
      );

      expect(Object.keys(await fetchPrices(new AbortController().signal))).toHaveLength(200);
    });

    it('does not hide that it was cancelled', async () => {
      const controller = new AbortController();
      vi.stubGlobal(
        'fetch',
        vi.fn(async (url: string) => {
          if (url.endsWith('offset=0')) {
            return json({ models: page(200) });
          }

          controller.abort();
          throw new DOMException('Aborted', 'AbortError');
        })
      );

      await expect(fetchPrices(controller.signal)).rejects.toThrow('Aborted');
    });

    it('says when the list has no prices at all', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => json({ models: [] }))
      );
      await expect(fetchPrices(new AbortController().signal)).rejects.toThrow(/any prices/);

      vi.stubGlobal(
        'fetch',
        vi.fn(async () => json(null))
      );
      await expect(fetchPrices(new AbortController().signal)).rejects.toThrow(/any prices/);
    });
  });
});
