import { afterEach, describe, expect, it, vi } from 'vitest';
import { discussionUrl, fetchTopStories, timeAgo } from './hackernews';

type Answer = { ok?: boolean; body: unknown };

/** Answers fetch by address: the top list, then each item by its id. */
const serve = (answers: Record<string, Answer>): ReturnType<typeof vi.fn> => {
  const fetchMock = vi.fn(async (input: string) => {
    const answer = answers[input.replace('https://hacker-news.firebaseio.com/v0', '')];
    return { ok: answer?.ok ?? true, json: async () => answer?.body } as Response;
  });

  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

const signal = new AbortController().signal;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('discussionUrl', () => {
  it('points at the item’s page on Hacker News', () => {
    expect(discussionUrl(42)).toBe('https://news.ycombinator.com/item?id=42');
  });
});

describe('fetchTopStories', () => {
  it('reads each top story, in the front page’s order', async () => {
    serve({
      '/topstories.json': { body: [11, 22] },
      '/item/11.json': {
        body: {
          id: 11,
          title: 'A linked story',
          url: 'https://www.example.com/post',
          score: 120,
          descendants: 45,
          time: 1_700_000_000,
          by: 'ada'
        }
      },
      '/item/22.json': {
        body: { id: 22, title: 'Ask HN: anything?', score: 7, descendants: 3, time: 5, by: 'bob' }
      }
    });

    expect(await fetchTopStories(2, signal)).toEqual([
      {
        id: 11,
        title: 'A linked story',
        url: 'https://www.example.com/post',
        host: 'example.com',
        score: 120,
        comments: 45,
        time: 1_700_000_000,
        by: 'ada'
      },
      {
        id: 22,
        title: 'Ask HN: anything?',
        url: 'https://news.ycombinator.com/item?id=22',
        host: 'news.ycombinator.com',
        score: 7,
        comments: 3,
        time: 5,
        by: 'bob'
      }
    ]);
  });

  it('asks for only as many items as wanted, passing the abort signal on', async () => {
    const fetchMock = serve({
      '/topstories.json': { body: [1, 2, 3, 4, 5] },
      '/item/1.json': { body: { id: 1, title: 'One' } },
      '/item/2.json': { body: { id: 2, title: 'Two' } }
    });

    const stories = await fetchTopStories(2, signal);

    expect(stories.map((story) => story.id)).toEqual([1, 2]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/topstories.json'), { signal });
  });

  it('fills in what an item leaves out', async () => {
    serve({
      '/topstories.json': { body: [9] },
      '/item/9.json': { body: { id: 9, title: 'Bare' } }
    });

    expect(await fetchTopStories(1, signal)).toEqual([
      {
        id: 9,
        title: 'Bare',
        url: 'https://news.ycombinator.com/item?id=9',
        host: 'news.ycombinator.com',
        score: 0,
        comments: 0,
        time: 0,
        by: ''
      }
    ]);
  });

  it('drops items that are dead, deleted, untitled, missing or unanswered', async () => {
    serve({
      '/topstories.json': { body: [1, 2, 3, 4, 5, 6] },
      '/item/1.json': { body: { id: 1, title: 'Kept' } },
      '/item/2.json': { body: { id: 2, title: 'Dead', dead: true } },
      '/item/3.json': { body: { id: 3, title: 'Deleted', deleted: true } },
      '/item/4.json': { body: { id: 4 } },
      '/item/5.json': { body: null },
      '/item/6.json': { ok: false, body: { id: 6, title: 'Server error' } }
    });

    expect((await fetchTopStories(6, signal)).map((story) => story.title)).toEqual(['Kept']);
  });

  it('says so when Hacker News does not answer for the list', async () => {
    serve({ '/topstories.json': { ok: false, body: null } });

    await expect(fetchTopStories(5, signal)).rejects.toThrow('Hacker News didn’t answer.');
  });
});

describe('timeAgo', () => {
  const now = 1_700_000_000_000;
  const ago = (seconds: number): string => timeAgo(now / 1000 - seconds, now);

  it('counts minutes inside the first hour', () => {
    expect(ago(0)).toBe('0m');
    expect(ago(35 * 60)).toBe('35m');
    expect(ago(59 * 60)).toBe('59m');
  });

  it('counts hours up to two days', () => {
    expect(ago(60 * 60)).toBe('1h');
    expect(ago(4 * 3600)).toBe('4h');
    expect(ago(47 * 3600)).toBe('47h');
  });

  it('counts days after that', () => {
    expect(ago(48 * 3600)).toBe('2d');
    expect(ago(10 * 86_400)).toBe('10d');
  });

  it('never reports a negative age for a clock that runs behind', () => {
    expect(ago(-300)).toBe('0m');
  });

  it('measures from the present when no moment is given', () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);

    try {
      expect(timeAgo(now / 1000 - 3 * 3600)).toBe('3h');
    } finally {
      vi.useRealTimers();
    }
  });
});
