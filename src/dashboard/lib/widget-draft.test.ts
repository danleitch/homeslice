import { describe, expect, it } from 'vitest';
import { createWidget, type Widget, type WidgetType } from './model';
import { draftProblem, forBoard, tidyWidget } from './widget-draft';

type Of<T extends WidgetType> = Extract<Widget, { type: T }>;

const widgetOf = <T extends WidgetType>(type: T, overrides: Partial<Of<T>> = {}): Of<T> =>
  ({ ...createWidget(type), ...overrides }) as Of<T>;

const sealedOf = (address: string): string =>
  `enc1.${'S'.repeat(16)}.${btoa(address).replace(/[+/=]/g, 'x')}`;
const ADDRESS =
  'https://calendar.google.com/calendar/ical/sam%40example.com/private-aaa111/basic.ics';

describe('draftProblem', () => {
  it.each([
    'weather',
    'markets',
    'clock',
    'focus',
    'calendar',
    'agenda',
    'hackernews',
    'github',
    'prs',
    'benchlm',
    'tv',
    'movies'
  ] as const)('finds nothing wrong with a new %s widget', (type) => {
    expect(draftProblem(createWidget(type))).toBe('');
  });

  it('asks for a place for the weather, and counts spaces as none', () => {
    expect(draftProblem(widgetOf('weather', { location: '' }))).toBe('Choose a place.');
    expect(draftProblem(widgetOf('weather', { location: '   ' }))).toBe('Choose a place.');
  });

  it('refuses a zone that does not exist, naming it', () => {
    expect(
      draftProblem(widgetOf('clock', { zones: [{ zone: 'Mars/Olympus_Mons', label: '' }] }))
    ).toBe(
      '“Mars/Olympus_Mons” isn’t a place or a time zone. Try a city, or a name like Europe/Paris.'
    );
  });

  it('lets a clock have blank rows, and a place’s name stand for its zone', () => {
    expect(
      draftProblem(
        widgetOf('clock', {
          zones: [
            { zone: '', label: '' },
            { zone: 'Boston', label: '' }
          ]
        })
      )
    ).toBe('');
  });

  it('turns away something that is not a token, without repeating it', () => {
    const problem = draftProblem(widgetOf('prs', { token: 'my password hunter2' }));

    expect(problem).toContain('That doesn’t look like a GitHub token.');
    expect(problem).not.toContain('hunter2');
  });

  it('lets My PRs have no token at all', () => {
    expect(draftProblem(widgetOf('prs', { token: '' }))).toBe('');
  });

  it('turns away a calendar address that is not Google’s, and leaves saved ones and blanks', () => {
    const calendar = (url: string) => ({ name: '', description: '', url });

    expect(
      draftProblem(widgetOf('agenda', { calendars: [calendar('https://example.com/x.ics')] }))
    ).toContain('That isn’t a Google Calendar secret address');
    expect(
      draftProblem(
        widgetOf('agenda', {
          calendars: [calendar(sealedOf(ADDRESS)), calendar(''), calendar(ADDRESS)]
        })
      )
    ).toBe('');
  });
});

describe('tidyWidget', () => {
  it('upper-cases and trims market symbols and names, and drops blank rows', () => {
    const tidy = tidyWidget(
      widgetOf('markets', {
        symbols: [
          { symbol: ' aapl ', name: '  Apple ' },
          { symbol: '  ', name: 'Nameless' }
        ]
      })
    ) as Of<'markets'>;

    expect(tidy.symbols).toEqual([{ symbol: 'AAPL', name: 'Apple' }]);
  });

  it('keeps a token’s contract address as typed, whatever its case', () => {
    const mint = 'DemoMint1111111111111111111111111111111pump';
    const tidy = tidyWidget(
      widgetOf('markets', { symbols: [{ symbol: `  ${mint} `, name: ' My coin ' }] })
    ) as Of<'markets'>;

    expect(tidy.symbols).toEqual([{ symbol: mint, name: 'My coin' }]);
  });

  it('gives a clock the zones places stand for, and drops blank rows', () => {
    const tidy = tidyWidget(
      widgetOf('clock', {
        zones: [
          { zone: 'Boston', label: '' },
          { zone: '', label: 'Blank' }
        ]
      })
    ) as Of<'clock'>;

    expect(tidy.zones).toEqual([{ zone: 'America/New_York', label: 'Boston' }]);
  });

  it('trims the weather’s place', () => {
    expect(
      (tidyWidget(widgetOf('weather', { location: '  Oslo ' })) as Of<'weather'>).location
    ).toBe('Oslo');
  });

  it('puts GitHub’s language in its own form, and “all” for none', () => {
    expect(
      (tidyWidget(widgetOf('github', { language: ' Jupyter Notebook ' })) as Of<'github'>).language
    ).toBe('jupyter-notebook');
    expect((tidyWidget(widgetOf('github', { language: '' })) as Of<'github'>).language).toBe('all');
  });

  it('trims a token', () => {
    const token = 'github_pat_11ABCDEFG0abcdefghijklmnopqrstuvwxyz';

    expect((tidyWidget(widgetOf('prs', { token: `  ${token} ` })) as Of<'prs'>).token).toBe(token);
  });

  it('puts calendar addresses in the form they are kept in, once each, leaving blanks out', () => {
    const calendar = (url: string) => ({ name: '', description: '', url });
    const tidy = tidyWidget(
      widgetOf('agenda', {
        calendars: [
          calendar(`  ${ADDRESS.replace('https:', 'webcal:')}  `),
          calendar(ADDRESS),
          calendar('')
        ]
      })
    ) as Of<'agenda'>;

    expect(tidy.calendars).toEqual([{ name: '', description: '', url: ADDRESS }]);
  });

  it('leaves the other widgets as they were', () => {
    const widget = widgetOf('hackernews', { count: 9 });

    expect(tidyWidget(widget)).toBe(widget);
  });
});

describe('forBoard', () => {
  it('leaves the example’s tasks and note behind, and keeps how Notes is set', () => {
    const notes = widgetOf('notes', {
      mode: 'text',
      width: 6,
      items: [{ text: 'sample', done: true }],
      text: 'sample note'
    });

    expect(forBoard(notes)).toMatchObject({
      type: 'notes',
      mode: 'text',
      width: 6,
      items: [],
      text: ''
    });
  });

  it('leaves the example’s calendars behind', () => {
    const agenda = widgetOf('agenda', {
      count: 9,
      calendars: [{ name: 'Personal', description: '', url: 'sample:personal' }]
    });

    expect(forBoard(agenda)).toMatchObject({ type: 'agenda', count: 9, calendars: [] });
  });

  it('leaves the example’s token behind', () => {
    expect(forBoard(widgetOf('prs', { token: 'sample', count: 7 }))).toMatchObject({
      type: 'prs',
      token: '',
      count: 7
    });
  });

  it.each([
    'weather',
    'markets',
    'clock',
    'focus',
    'calendar',
    'hackernews',
    'github',
    'benchlm',
    'tv',
    'movies',
    'news'
  ] as const)('hands a %s widget over as it is', (type) => {
    const widget = createWidget(type);

    expect(forBoard(widget)).toBe(widget);
  });

  it('does not change the widget it was given', () => {
    const notes = widgetOf('notes', { items: [{ text: 'a', done: false }] });
    forBoard(notes);

    expect(notes.items).toHaveLength(1);
  });
});
