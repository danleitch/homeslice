import { describe, expect, it, vi } from 'vitest';
import { fetchRankings, pickModels, readRankings } from './benchlm';

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
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/benchlm/rankings?surface=coding');

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
});
