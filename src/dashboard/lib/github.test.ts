import { describe, expect, it } from 'vitest';
import {
  languageSlug,
  parseCount,
  readTrending,
  shortCount,
  trendingPageUrl,
  trendingUrl
} from './github';

describe('GitHub Trending', () => {
  it('reads the feed into repositories, numbers and all', () => {
    const trending = readTrending(
      {
        pubDate: 'Wed, 26 Aug 2026 13:56:53 GMT',
        items: [
          {
            title: 'tt-a1i / archify',
            url: 'https://github.com/tt-a1i/archify',
            description: ' Diagrams for agents. ',
            language: 'HTML',
            languageColor: '#e34c26',
            stars: '17,010',
            forks: '1,184',
            addStars: '1,002'
          },
          { title: 'no-url' },
          { url: 'https://github.com/no/title' }
        ]
      },
      10
    );

    expect(trending.publishedAt).toBe(Date.parse('2026-08-26T13:56:53Z'));
    expect(trending.repos).toEqual([
      {
        name: 'tt-a1i/archify',
        url: 'https://github.com/tt-a1i/archify',
        description: 'Diagrams for agents.',
        language: 'HTML',
        languageColor: '#e34c26',
        stars: 17010,
        forks: 1184,
        gained: 1002
      }
    ]);
  });

  it('keeps only as many as asked for, and survives a feed that is nothing like one', () => {
    const items = Array.from({ length: 8 }, (_unused, index) => ({
      title: `owner/repo${index}`,
      url: `https://github.com/owner/repo${index}`
    }));

    expect(readTrending({ items }, 3).repos).toHaveLength(3);
    expect(readTrending(null, 3)).toEqual({ repos: [], publishedAt: 0 });
    expect(readTrending({ items: 'nope', pubDate: 'later' }, 3)).toEqual({
      repos: [],
      publishedAt: 0
    });
  });

  it('drops a language colour that is not a colour', () => {
    const [repo] = readTrending(
      { items: [{ title: 'a/b', url: 'https://github.com/a/b', languageColor: 'red;x:y' }] },
      1
    ).repos;
    expect(repo.languageColor).toBe('');
  });

  it('spells languages the way the files are named', () => {
    expect(languageSlug('Jupyter Notebook')).toBe('jupyter-notebook');
    expect(languageSlug(' TypeScript ')).toBe('typescript');
    expect(languageSlug('')).toBe('all');
    expect(trendingUrl('c++', 'weekly')).toMatch(/\/data\/weekly\/c%2B%2B\.json$/);
    expect(trendingPageUrl('all', 'daily')).toBe('https://github.com/trending?since=daily');
    expect(trendingPageUrl('rust', 'monthly')).toBe(
      'https://github.com/trending/rust?since=monthly'
    );
  });

  it('counts and shortens numbers', () => {
    expect(parseCount('1,184')).toBe(1184);
    expect(parseCount(undefined)).toBe(0);
    expect(shortCount(950)).toBe('950');
    expect(shortCount(1240)).toBe('1.2k');
    expect(shortCount(2000)).toBe('2k');
    expect(shortCount(17010)).toBe('17k');
  });
});
