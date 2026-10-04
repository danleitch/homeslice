import { describe, expect, it } from 'vitest';
import {
  GRID_COLUMNS,
  MIN_SPAN,
  PAGE_COUNT,
  countBookmarks,
  createWidget,
  emptyPage,
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

    expect(plain).toMatchObject({
      type: 'agenda',
      width: 4,
      weekStart: 1,
      count: 5,
      month: true,
      calendars: []
    });
    expect(tuned).toMatchObject({ width: 8, weekStart: 0, count: 9, month: false });
    expect(sunday).toMatchObject({ weekStart: 0 });
    expect(bounded).toMatchObject({ count: 12, month: true });
    expect(
      sanitizeConfig({ widgets: [{ type: 'agenda', count: 1 }] }).pages[0].widgets[0]
    ).toMatchObject({
      count: 3
    });
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

  describe('the calendars an Agenda lists', () => {
    const PRIVATE =
      'https://calendar.google.com/calendar/ical/dan%40example.com/private-4f9a8c1d/basic.ics';
    const PUBLIC = 'https://calendar.google.com/calendar/ical/dan%40example.com/public/basic.ics';
    const calendarsOf = (calendars: unknown) =>
      (
        sanitizeConfig({ widgets: [{ type: 'agenda', calendars }] }).pages[0].widgets[0] as {
          calendars: unknown;
        }
      ).calendars;

    it('reads each one’s name, description and address', () => {
      expect(
        calendarsOf([
          { name: '  Personal ', description: ' My own diary ', url: PRIVATE },
          { title: 'Holidays', url: PUBLIC },
          { href: PRIVATE }
        ])
      ).toEqual([
        { name: 'Personal', description: 'My own diary', url: PRIVATE },
        { name: 'Holidays', description: '', url: PUBLIC },
        { name: '', description: '', url: PRIVATE }
      ]);
    });

    it('reads the webcal form as the https address it stands for', () => {
      expect(calendarsOf([{ url: PRIVATE.replace('https://', 'webcal://') }])).toEqual([
        { name: '', description: '', url: PRIVATE }
      ]);
    });

    it('drops what is not a Google Calendar address, rather than breaking the page', () => {
      expect(
        calendarsOf([
          { name: 'Other site', url: 'https://example.com/calendar.ics' },
          { name: 'No address' },
          { name: 'A number', url: 42 },
          'a string',
          null,
          ['a list'],
          { name: 'Kept', url: PUBLIC }
        ])
      ).toEqual([{ name: 'Kept', description: '', url: PUBLIC }]);
    });

    it('has none when there is no list', () => {
      expect(calendarsOf(undefined)).toEqual([]);
      expect(calendarsOf('everything')).toEqual([]);
      expect(calendarsOf({ url: PRIVATE })).toEqual([]);
    });

    it('keeps names and descriptions to a sensible length, and eight calendars', () => {
      const many = Array.from({ length: 12 }, (_unused, index) => ({
        name: 'N'.repeat(100),
        description: 'D'.repeat(500),
        url: PRIVATE.replace('4f9a8c1d', `token${index}`)
      }));
      const kept = calendarsOf(many) as { name: string; description: string; url: string }[];

      expect(kept).toHaveLength(8);
      expect(kept[0].name).toHaveLength(60);
      expect(kept[0].description).toHaveLength(200);
      expect(kept[7].url).toContain('token7');
    });
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
      month: true,
      calendars: []
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
