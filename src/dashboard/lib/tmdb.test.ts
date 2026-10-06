import { describe, expect, it, vi } from 'vitest';
import { fetchMovies, fetchShows, readMovies, readShows } from './tmdb';

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

  describe('films', () => {
    it('reads trending films by their title and release date, linked as films', () => {
      const films = readMovies(
        {
          results: [
            {
              id: 7,
              title: 'The Long Drive',
              release_date: '2026-09-12',
              vote_average: 6.46,
              vote_count: 80,
              overview: ' Two friends. ',
              poster_path: '/abc123.jpg'
            },
            // A show's fields on a film's list are no film.
            { id: 8, name: 'A show', first_air_date: '2026-01-01' },
            { id: 9, title: 'No date or poster' },
            { title: 'No id' }
          ]
        },
        10
      );

      expect(films).toEqual([
        {
          id: 7,
          name: 'The Long Drive',
          year: '2026',
          rating: 6.5,
          votes: 80,
          overview: 'Two friends.',
          poster: 'https://image.tmdb.org/t/p/w92/abc123.jpg',
          url: 'https://www.themoviedb.org/movie/7'
        },
        {
          id: 9,
          name: 'No date or poster',
          year: '',
          rating: 0,
          votes: 0,
          overview: '',
          poster: '',
          url: 'https://www.themoviedb.org/movie/9'
        }
      ]);
      expect(
        readMovies(
          {
            results: [
              { id: 1, title: 'a' },
              { id: 2, title: 'b' }
            ]
          },
          1
        )
      ).toHaveLength(1);
      expect(readMovies(undefined, 5)).toEqual([]);
    });

    it('does not take a film’s fields for a show’s', () => {
      expect(readShows({ results: [{ id: 1, title: 'A film' }] }, 5)).toEqual([]);
    });

    it('asks the server’s relay for films, in the window asked for', async () => {
      const fetchMock = vi.fn<(url: string) => Promise<Response>>(
        async () =>
          new Response('{"results":[]}', { headers: { 'content-type': 'application/json' } })
      );
      vi.stubGlobal('fetch', fetchMock);

      await fetchMovies('week', 5, new AbortController().signal);

      expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/tmdb/trending-movie?window=week');
    });

    it('names the films widget, not the TV one, when the host has no relay', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => new Response('<html>', { headers: { 'content-type': 'text/html' } }))
      );

      await expect(fetchMovies('week', 5, new AbortController().signal)).rejects.toThrow(
        'Popular Movies goes through this dashboard’s server, which this host doesn’t provide.'
      );
    });

    it('says the server has no key, as it does for shows', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => new Response('{}', { status: 401 }))
      );

      await expect(fetchMovies('week', 5, new AbortController().signal)).rejects.toThrow(
        /TMDB_TOKEN/
      );
    });
  });
});
