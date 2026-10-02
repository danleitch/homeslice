import { describe, expect, it, vi } from 'vitest';
import { fetchShows, readShows } from './tmdb';

describe('TMDB', () => {
  it('reads trending shows with a poster, a year and a rating', () => {
    const shows = readShows(
      {
        results: [
          {
            id: 258165,
            name: 'East of Eden',
            first_air_date: '2026-10-01',
            vote_average: 7.94,
            vote_count: 12,
            overview: ' A saga. ',
            poster_path: '/axdUor6gLMTrrB1UF4Qfy0TTSyX.jpg'
          },
          { id: 2, name: 'No poster', poster_path: 'javascript:alert(1)' },
          { name: 'No id' }
        ]
      },
      10
    );

    expect(shows).toEqual([
      {
        id: 258165,
        name: 'East of Eden',
        year: '2026',
        rating: 7.9,
        votes: 12,
        overview: 'A saga.',
        poster: 'https://image.tmdb.org/t/p/w92/axdUor6gLMTrrB1UF4Qfy0TTSyX.jpg',
        url: 'https://www.themoviedb.org/tv/258165'
      },
      {
        id: 2,
        name: 'No poster',
        year: '',
        rating: 0,
        votes: 0,
        overview: '',
        poster: '',
        url: 'https://www.themoviedb.org/tv/2'
      }
    ]);
    expect(
      readShows(
        {
          results: [
            { id: 1, name: 'a' },
            { id: 2, name: 'b' }
          ]
        },
        1
      )
    ).toHaveLength(1);
    expect(readShows(null, 5)).toEqual([]);
  });

  it('asks the server’s relay, and says when it has no key', async () => {
    const fetchMock = vi.fn<(url: string) => Promise<Response>>(
      async () =>
        new Response('{"results":[]}', { headers: { 'content-type': 'application/json' } })
    );
    vi.stubGlobal('fetch', fetchMock);
    await fetchShows('day', 5, new AbortController().signal);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/tmdb/trending-tv?window=day');

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 401 }))
    );
    await expect(fetchShows('week', 5, new AbortController().signal)).rejects.toThrow(/TMDB_TOKEN/);
  });
});
