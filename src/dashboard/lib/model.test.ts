import { describe, expect, it } from 'vitest';
import {
  GRID_COLUMNS,
  MAX_ROWS,
  MIN_ROWS,
  MIN_SPAN,
  NARROW_SPAN,
  PAGE_COUNT,
  WIDGET_BLURBS,
  WIDGET_LABELS,
  WIDGET_TYPES,
  countBookmarks,
  createStarterConfig,
  createWidget,
  emptyPage,
  minSpanOf,
  pageOf,
  sanitizeConfig,
  withPage
} from './model';

describe('sanitizeConfig', () => {
  it('turns anything that is not a board into an empty one', () => {
    for (const value of [null, 'nope', 42, ['a']]) {
      const config = sanitizeConfig(value);
      expect(config.pages[0].groups).toEqual([]);
      expect(config.pages[0].widgets).toEqual([]);
      expect(config.title).toBe('Home');
    }
  });

  it('accepts href for url, as other dashboards write it, and drops bookmarks with neither', () => {
    const config = sanitizeConfig({
      groups: [
        {
          name: 'Links',
          bookmarks: [{ name: 'A', href: 'https://a.example' }, { name: 'No address' }, 'junk']
        }
      ]
    });

    expect(config.pages[0].groups[0].bookmarks).toHaveLength(1);
    expect(config.pages[0].groups[0].bookmarks[0].url).toBe('https://a.example');
  });

  it('keeps widths on the board and styles it knows', () => {
    const config = sanitizeConfig({
      groups: [
        { name: 'Wide', width: 40, style: 'carousel' },
        { name: 'Narrow', width: 1 },
        { name: 'Text', width: '6', style: 'tiles' }
      ]
    });

    expect(config.pages[0].groups.map((group) => group.width)).toEqual([GRID_COLUMNS, MIN_SPAN, 6]);
    expect(config.pages[0].groups.map((group) => group.style)).toEqual(['cards', 'cards', 'tiles']);
  });

  it('reads each kind of widget, and glance’s word for markets', () => {
    const config = sanitizeConfig({
      widgets: [
        { type: 'weather', location: 'Cape Town', units: 'imperial' },
        { type: 'stocks', symbols: ['aapl', { symbol: 'btc-usd', name: 'Bitcoin' }] },
        { type: 'clock', zones: ['Europe/Paris', { timezone: 'Asia/Tokyo', name: 'Tokyo' }] },
        { type: 'hackernews', count: 99 },
        { type: 'calendar', weekStart: 'sunday' },
        { type: 'rss' }
      ]
    });

    expect(config.pages[0].widgets.map((widget) => widget.type)).toEqual([
      'weather',
      'markets',
      'clock',
      'hackernews',
      'calendar'
    ]);
    expect(config.pages[0].widgets[1]).toMatchObject({
      symbols: [
        { symbol: 'AAPL', name: '' },
        { symbol: 'BTC-USD', name: 'Bitcoin' }
      ]
    });
    expect(config.pages[0].widgets[2]).toMatchObject({
      zones: [
        { zone: 'Europe/Paris', label: '' },
        { zone: 'Asia/Tokyo', label: 'Tokyo' }
      ]
    });
    expect(config.pages[0].widgets[3]).toMatchObject({ count: 15 });
    expect(config.pages[0].widgets[4]).toMatchObject({ weekStart: 0 });
  });

  it('reads the Agenda, keeping its settings within range', () => {
    const [plain, tuned, sunday, bounded] = sanitizeConfig({
      widgets: [
        { type: 'agenda' },
        { type: 'agenda', width: 8, weekStart: 'sunday', count: '9', month: false },
        { type: 'agenda', weekStart: 0 },
        { type: 'agenda', count: 99, month: 'no' }
      ]
    }).pages[0].widgets;

    expect(plain).toMatchObject({ type: 'agenda', width: 4, weekStart: 1, count: 5, month: true });
    expect(tuned).toMatchObject({ width: 8, weekStart: 0, count: 9, month: false });
    expect(sunday).toMatchObject({ weekStart: 0 });
    expect(bounded).toMatchObject({ count: 12, month: true });
    expect(
      sanitizeConfig({ widgets: [{ type: 'agenda', count: 1 }] }).pages[0].widgets[0]
    ).toMatchObject({
      count: 3
    });
  });

  it('reads the Agenda’s calendars, keeping only Google Calendar’s addresses, once each, up to eight', () => {
    const a = 'https://calendar.google.com/calendar/ical/a%40x.com/private-aaa/basic.ics';
    const b = 'https://calendar.google.com/calendar/ical/b%40x.com/private-bbb/basic.ics';
    const c = 'https://calendar.google.com/calendar/ical/c%40x.com/public/basic.ics';
    const source = (url: string, name = '', description = '') => ({ name, description, url });
    const [none, single, named, messy, odd, many] = sanitizeConfig({
      widgets: [
        { type: 'agenda' },
        { type: 'agenda', calendars: a.replace('https:', 'webcal:') },
        {
          type: 'agenda',
          calendars: [
            { name: ' Personal ', description: 'My own diary', url: a },
            { title: 'Club', href: b }
          ]
        },
        {
          type: 'agenda',
          calendars: ['nonsense', 'https://example.com/x.ics', 7, null, a, a, ' ' + b]
        },
        { type: 'agenda', calendars: { a } },
        {
          type: 'agenda',
          calendars: Array.from({ length: 12 }, (_unused, index) =>
            c.replace('c%40x.com', `c${index}%40x.com`)
          )
        }
      ]
    }).pages[0].widgets;

    expect(none).toMatchObject({ calendars: [] });
    expect(single).toMatchObject({ calendars: [source(a)] });
    expect(named).toMatchObject({
      calendars: [source(a, 'Personal', 'My own diary'), source(b, 'Club')]
    });
    // Saved before calendars had names, an address stood on its own.
    expect(messy).toMatchObject({ calendars: [source(a), source(b)] });
    expect(odd).toMatchObject({ calendars: [] });
    expect((many as { calendars: unknown[] }).calendars).toHaveLength(8);
    expect(createWidget('agenda')).toMatchObject({ calendars: [] });
  });

  it('reads the AI Leaderboard’s price limit, keeping it to a sensible range', () => {
    const [given, huge, negative, missing, text] = sanitizeConfig({
      widgets: [
        { type: 'benchlm', maxPrice: 0.5 },
        { type: 'benchlm', maxPrice: 5000 },
        { type: 'benchlm', maxPrice: -3 },
        { type: 'benchlm' },
        { type: 'benchlm', maxPrice: 'cheap' }
      ]
    }).pages[0].widgets;

    expect(given).toMatchObject({ maxPrice: 0.5 });
    expect(huge).toMatchObject({ maxPrice: 100 });
    expect(negative).toMatchObject({ maxPrice: 0 });
    expect(missing).toMatchObject({ maxPrice: 0 });
    expect(text).toMatchObject({ maxPrice: 0 });
    expect(createWidget('benchlm')).toMatchObject({ maxPrice: 0 });
  });

  it('reads which services the status bar watches, and whether it tells of slow service', () => {
    const watched = sanitizeConfig({
      status: ['npm', 'nonsense', 'github', 'npm', 5],
      statusDegraded: true
    });

    expect(watched.status).toEqual(['github', 'npm']);
    expect(watched.statusDegraded).toBe(true);
    expect(sanitizeConfig({ status: 'vercel' }).status).toEqual(['vercel']);
    expect(sanitizeConfig({ statusDegraded: 'yes' }).statusDegraded).toBe(false);

    const none = sanitizeConfig({});
    expect(none.status).toEqual([]);
    expect(none.statusDegraded).toBe(false);
  });

  it('reads My PRs, keeping its settings within range and anything but a token out', () => {
    const token = 'github_pat_11ABCDEFG0abcdefghijklmnopqrstuvwxyz';
    const [plain, tuned, junk, bounded, low] = sanitizeConfig({
      widgets: [
        { type: 'prs' },
        { type: 'prs', token: `  ${token} `, show: 'review', count: '8', width: 6 },
        { type: 'prs', token: 'not a token at all', show: 'everything' },
        { type: 'prs', count: 99 },
        { type: 'prs', count: 1 }
      ]
    }).pages[0].widgets;

    expect(plain).toMatchObject({ type: 'prs', width: 4, token: '', show: 'both', count: 5 });
    expect(tuned).toMatchObject({ token, show: 'review', count: 8, width: 6 });
    expect(junk).toMatchObject({ token: '', show: 'both' });
    expect(bounded).toMatchObject({ count: 10 });
    expect(low).toMatchObject({ count: 3 });
    expect(createWidget('prs')).toMatchObject({ type: 'prs', token: '', show: 'both', count: 5 });
  });

  it('reads the Focus timer, keeping its lengths in range and its chime on unless turned off', () => {
    const [plain, tuned, long, short, text, quiet] = sanitizeConfig({
      widgets: [
        { type: 'focus' },
        { type: 'focus', focus: 50, rest: 10, sound: false, width: 6 },
        { type: 'focus', focus: 500, rest: 500 },
        { type: 'focus', focus: 1, rest: 0 },
        { type: 'focus', focus: '40', rest: 'long' },
        { type: 'focus', sound: 'no' }
      ]
    }).pages[0].widgets;

    expect(plain).toMatchObject({ type: 'focus', width: 4, focus: 25, rest: 5, sound: true });
    expect(tuned).toMatchObject({ focus: 50, rest: 10, sound: false, width: 6 });
    expect(long).toMatchObject({ focus: 90, rest: 30 });
    expect(short).toMatchObject({ focus: 5, rest: 1 });
    expect(text).toMatchObject({ focus: 40, rest: 5 });
    expect(quiet).toMatchObject({ sound: true });
    expect(createWidget('focus')).toMatchObject({ type: 'focus', focus: 25, rest: 5, sound: true });
  });

  describe('a News widget', () => {
    const newsOf = (widget: unknown) =>
      sanitizeConfig({ widgets: [{ type: 'news', ...(widget as object) }] }).pages[0]
        .widgets[0] as { feed: string; count: number; width: number };

    it('starts on the default feed, with five headlines', () => {
      expect(createWidget('news')).toMatchObject({ type: 'news', feed: 'bbc', count: 5 });
    });

    it('is read from what was saved', () => {
      expect(newsOf({ feed: 'ars', count: 8, width: 6 })).toMatchObject({
        feed: 'ars',
        count: 8,
        width: 6
      });
    });

    it('falls back to the default feed for one that is not offered, so no address can be asked for', () => {
      expect(newsOf({ feed: 'https://evil.example/feed' }).feed).toBe('bbc');
      expect(newsOf({ feed: '../../x' }).feed).toBe('bbc');
    });

    it('keeps the number of headlines to what the widget can show', () => {
      expect(newsOf({ count: 99 }).count).toBe(12);
      expect(newsOf({ count: 0 }).count).toBe(3);
      expect(newsOf({ count: 'many' }).count).toBe(5);
    });
  });

  describe('a Notes widget', () => {
    const notesOf = (widget: unknown) =>
      sanitizeConfig({ widgets: [{ type: 'notes', ...(widget as object) }] }).pages[0]
        .widgets[0] as {
        mode: string;
        items: { text: string; done: boolean }[];
        text: string;
        width: number;
      };

    it('starts as an empty list', () => {
      expect(createWidget('notes')).toMatchObject({
        type: 'notes',
        mode: 'list',
        items: [],
        text: ''
      });
    });

    it('is read from what was saved, tasks and note both', () => {
      expect(
        notesOf({ mode: 'text', items: [{ text: 'a', done: true }, 'b'], text: 'jot', width: 6 })
      ).toMatchObject({
        mode: 'text',
        items: [
          { text: 'a', done: true },
          { text: 'b', done: false }
        ],
        text: 'jot',
        width: 6
      });
    });

    it('is a list, with nothing in it, when nothing was said', () => {
      expect(notesOf({})).toMatchObject({ mode: 'list', items: [], text: '' });
    });

    it('is a list for a style it has never heard of', () => {
      expect(notesOf({ mode: 'diary' }).mode).toBe('list');
    });
  });

  describe('a token’s contract address among the market symbols', () => {
    const MINT = 'DemoMint1111111111111111111111111111111pump';
    const EVM = '0xAbAbAbAbAbAbAbAbAbAbAbAbAbAbAbAbAbAbAbAb';
    const symbolsOf = (symbols: unknown) =>
      (
        sanitizeConfig({ widgets: [{ type: 'markets', symbols }] }).pages[0].widgets[0] as {
          symbols: { symbol: string; name: string }[];
        }
      ).symbols;

    it('keeps its case, which a Solana address depends on, while symbols are upper-cased', () => {
      expect(symbolsOf([{ symbol: MINT, name: 'Mine' }, 'btc-usd', EVM])).toEqual([
        { symbol: MINT, name: 'Mine' },
        { symbol: 'BTC-USD', name: '' },
        { symbol: EVM, name: '' }
      ]);
    });

    it('keeps all of it, though a symbol is held to twenty-four characters', () => {
      expect(symbolsOf([MINT])[0]!.symbol).toHaveLength(MINT.length);
      expect(symbolsOf(['a-'.repeat(20)])[0]!.symbol).toHaveLength(24);
    });

    it('does not count a long run of nothing as a symbol', () => {
      expect(symbolsOf(['   ', { symbol: '' }])).toEqual([]);
    });
  });

  it('keeps a weather widget saved before the sun, UV and air were added as it was', () => {
    const [weather] = sanitizeConfig({ widgets: [{ type: 'weather', location: 'Oslo' }] }).pages[0]
      .widgets;

    expect(weather).toMatchObject({ sun: false, uv: false, air: false });
  });

  it('reads what a weather widget shows, and takes only a plain yes for it', () => {
    const [weather] = sanitizeConfig({
      widgets: [{ type: 'weather', location: 'Oslo', sun: true, uv: 'yes', air: true }]
    }).pages[0].widgets;

    expect(weather).toMatchObject({ sun: true, uv: false, air: true });
  });

  it('starts a new weather widget showing the sun, the UV and the air', () => {
    expect(createWidget('weather')).toMatchObject({ sun: true, uv: true, air: true });
  });

  it('starts the example board’s weather the same way', () => {
    const [weather] = createStarterConfig().pages[0].widgets;

    expect(weather).toMatchObject({ type: 'weather', sun: true, uv: true, air: true });
  });

  it('keeps the glass within its range', () => {
    expect(sanitizeConfig({ glass: { blur: 400, tint: -1 } }).glass).toEqual({ blur: 32, tint: 0 });
  });

  it('gives every new widget something sensible to show', () => {
    expect(createWidget('weather')).toMatchObject({ location: 'London' });
    expect(createWidget('markets')).toMatchObject({ type: 'markets' });
    expect(createWidget('agenda')).toMatchObject({
      type: 'agenda',
      width: 4,
      weekStart: 1,
      count: 5,
      month: true
    });
  });

  it('counts bookmarks across groups', () => {
    const config = sanitizeConfig({
      groups: [
        { name: 'A', bookmarks: [{ url: 'https://a.example' }] },
        { name: 'B', bookmarks: [{ url: 'https://b.example' }, { url: 'https://c.example' }] }
      ]
    });

    expect(countBookmarks(config)).toBe(3);
  });
});

describe('pages', () => {
  it('turns a board saved before pages into the first of three', () => {
    const config = sanitizeConfig({
      widgets: [{ type: 'calendar' }],
      groups: [{ name: 'Code', bookmarks: [{ url: 'https://a.example' }] }]
    });

    expect(config.pages).toHaveLength(PAGE_COUNT);
    expect(config.pages[0].groups.map((group) => group.name)).toEqual(['Code']);
    expect(config.pages[0].widgets).toHaveLength(1);
    expect(config.pages.slice(1)).toEqual([emptyPage(), emptyPage()]);
  });

  it('always keeps exactly three pages', () => {
    const many = sanitizeConfig({
      pages: [1, 2, 3, 4].map((n) => ({ groups: [{ name: `P${n}` }] }))
    });
    const few = sanitizeConfig({ pages: [{ groups: [{ name: 'Only' }] }] });

    expect(many.pages.map((page) => page.groups[0].name)).toEqual(['P1', 'P2', 'P3']);
    expect(few.pages).toHaveLength(PAGE_COUNT);
    expect(countBookmarks(few)).toBe(0);
  });

  it('edits one page through its view, and shares settings across all of them', () => {
    const config = sanitizeConfig({
      pages: [{ groups: [{ name: 'One' }] }, { groups: [{ name: 'Two' }] }]
    });
    const view = pageOf(config, 1);

    expect(view.groups.map((group) => group.name)).toEqual(['Two']);

    const next = withPage(config, 1, { ...view, name: 'Sam', groups: [] });
    expect(next.name).toBe('Sam');
    expect(next.pages[0]).toBe(config.pages[0]);
    expect(next.pages[1].groups).toEqual([]);
  });
});

describe('where a card sits, and how tall it is', () => {
  const groupOf = (extra: Record<string, unknown> = {}) =>
    sanitizeConfig({ groups: [{ name: 'A', bookmarks: [], ...extra }] }).pages[0].groups[0];
  const widgetOf = (extra: Record<string, unknown> = {}) =>
    sanitizeConfig({ widgets: [{ type: 'calendar', ...extra }] }).pages[0].widgets[0];

  it('leaves a card with none of it exactly as it was, so it fits its contents and takes the next place', () => {
    for (const card of [groupOf(), widgetOf()]) {
      expect(card).not.toHaveProperty('height');
      expect(card).not.toHaveProperty('column');
      expect(card).not.toHaveProperty('row');
    }
  });

  it('keeps a height and a place, in groups and in widgets', () => {
    for (const card of [
      groupOf({ height: 60, column: 4, row: 12 }),
      widgetOf({ height: 60, column: 4, row: 12 })
    ]) {
      expect(card).toMatchObject({ height: 60, column: 4, row: 12 });
    }
  });

  it('reads numbers written as text, and rounds them', () => {
    expect(groupOf({ height: '72', column: '3', row: '8.4' })).toMatchObject({
      height: 72,
      column: 3,
      row: 8
    });
  });

  it('keeps a height within what a card can be, and a place within the board', () => {
    expect(groupOf({ height: 7, column: 0, row: 0 }).height).toBe(MIN_ROWS);
    expect(groupOf({ height: 99999 }).height).toBe(MAX_ROWS);
    // A card at least three columns wide has to start no later than the ninth.
    expect(groupOf({ column: 99, row: 2 }).column).toBe(GRID_COLUMNS - MIN_SPAN);
    expect(groupOf({ column: -4, row: -1 })).toMatchObject({ column: 0, row: 0 });
    expect(groupOf({ column: 1, row: 1e9 }).row).toBe(10_000);
  });

  it('drops what makes no sense, so the card goes back to the defaults', () => {
    for (const height of [0, -5, 'tall', 'auto', null, NaN, true, [], {}]) {
      expect(groupOf({ height })).not.toHaveProperty('height');
    }

    expect(groupOf({ column: 'left', row: 'top' })).not.toHaveProperty('column');
  });

  it('does not take half a place: a column needs a row, and a row a column', () => {
    expect(groupOf({ column: 4 })).not.toHaveProperty('column');
    expect(widgetOf({ row: 4 })).not.toHaveProperty('row');
    expect(widgetOf({ column: 4 })).not.toHaveProperty('row');
  });

  it('does not let one field disturb another', () => {
    const card = groupOf({ height: 60, width: 6, column: 'nope', row: 3 });

    expect(card).toMatchObject({ height: 60, width: 6 });
    expect(card).not.toHaveProperty('column');
  });
});

describe('how narrow a card may be', () => {
  const widgetsOf = (widgets: unknown[]) => sanitizeConfig({ widgets }).pages[0].widgets;
  const groupsOf = (groups: unknown[]) => sanitizeConfig({ groups }).pages[0].groups;

  it('is two columns for Popular TV and Popular Movies, and three for everything else', () => {
    expect(NARROW_SPAN).toBe(2);
    expect(minSpanOf('tv')).toBe(2);
    expect(minSpanOf('movies')).toBe(2);

    for (const type of WIDGET_TYPES.filter((type) => type !== 'tv' && type !== 'movies')) {
      expect(minSpanOf(type), type).toBe(MIN_SPAN);
    }

    expect(minSpanOf()).toBe(MIN_SPAN);
    expect(minSpanOf('nonsense')).toBe(MIN_SPAN);
  });

  it('keeps a Popular TV or Popular Movies card two columns wide, but no narrower', () => {
    expect(
      widgetsOf([
        { type: 'tv', width: 2 },
        { type: 'tv', width: 1 }
      ]).map((w) => w.width)
    ).toEqual([2, 2]);
    expect(
      widgetsOf([
        { type: 'movies', width: 2 },
        { type: 'movies', width: 0 }
      ]).map((w) => w.width)
    ).toEqual([2, 2]);
  });

  it('still holds every other widget and every group to three columns', () => {
    expect(
      widgetsOf([
        { type: 'weather', width: 2 },
        { type: 'benchlm', width: 1 }
      ]).map((w) => w.width)
    ).toEqual([MIN_SPAN, MIN_SPAN]);
    expect(groupsOf([{ name: 'A', width: 2, bookmarks: [] }])[0]!.width).toBe(MIN_SPAN);
  });

  it('lets a two-column card start in the last two columns of the board', () => {
    const [tv, weather] = widgetsOf([
      { type: 'tv', width: 2, column: 99, row: 0 },
      { type: 'weather', width: 3, column: 99, row: 0 }
    ]);

    expect(tv!.column).toBe(GRID_COLUMNS - NARROW_SPAN);
    expect(weather!.column).toBe(GRID_COLUMNS - MIN_SPAN);
  });

  it('keeps a width written as text, as the YAML may', () => {
    expect(widgetsOf([{ type: 'tv', width: '2' }])[0]!.width).toBe(2);
  });
});

describe('Popular Movies', () => {
  it('is a widget of its own, listed after Popular TV', () => {
    expect(WIDGET_TYPES.indexOf('movies')).toBe(WIDGET_TYPES.indexOf('tv') + 1);
    expect(WIDGET_LABELS.movies).toBe('Popular Movies');
    expect(WIDGET_BLURBS.movies).toMatch(/TMDB/);
  });

  it('starts as this week’s top five, a third of the board wide', () => {
    expect(createWidget('movies')).toMatchObject({
      type: 'movies',
      width: 4,
      window: 'week',
      count: 5
    });
  });

  it('keeps its settings, and falls back on a window or number that makes no sense', () => {
    const [good, bad, low, high] = sanitizeConfig({
      widgets: [
        { type: 'movies', window: 'day', count: 8 },
        { type: 'movies', window: 'year', count: 'lots' },
        { type: 'movies', count: 1 },
        { type: 'movies', count: 99 }
      ]
    }).pages[0].widgets;

    expect(good).toMatchObject({ type: 'movies', window: 'day', count: 8 });
    expect(bad).toMatchObject({ window: 'week', count: 5 });
    expect(low).toMatchObject({ count: 3 });
    expect(high).toMatchObject({ count: 12 });
  });
});
