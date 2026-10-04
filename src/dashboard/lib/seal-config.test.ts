import { describe, expect, it } from 'vitest';
import {
  createWidget,
  sanitizeConfig,
  type AgendaWidget,
  type DashboardConfig,
  type Widget
} from './model';
import { plainCalendarUrls, withSealedCalendars } from './seal-config';

const HOME = 'https://calendar.google.com/calendar/ical/sam%40example.com/private-aaa111/basic.ics';
const WORK =
  'https://calendar.google.com/calendar/ical/work%40example.com/private-bbb222/basic.ics';
const SEALED = `enc1.${'A'.repeat(16)}.${'B'.repeat(90)}`;

const agenda = (...urls: string[]): AgendaWidget => ({
  ...(createWidget('agenda') as AgendaWidget),
  calendars: urls.map((url, index) => ({ name: `Calendar ${index + 1}`, description: 'Note', url }))
});

/** A dashboard whose pages hold these widgets, and a bookmark widget's worth of other things. */
const boardOf = (...pages: Widget[][]): DashboardConfig => {
  const config = sanitizeConfig({});
  return {
    ...config,
    pages: config.pages.map((page, index) => ({ ...page, widgets: pages[index] ?? [] }))
  };
};

describe('plainCalendarUrls', () => {
  it('lists each address that is still as typed, once, across every page', () => {
    const board = boardOf([agenda(HOME, SEALED)], [agenda(WORK, HOME)], [createWidget('weather')]);

    expect(plainCalendarUrls(board)).toEqual([HOME, WORK]);
  });

  it('has none when every address is sealed, or there is no Agenda', () => {
    expect(plainCalendarUrls(boardOf([agenda(SEALED)], [createWidget('clock')]))).toEqual([]);
    expect(plainCalendarUrls(boardOf())).toEqual([]);
  });
});

describe('withSealedCalendars', () => {
  const sealed = new Map([[HOME, SEALED]]);

  it('swaps each address for its sealed form, keeping the rest of the calendar', () => {
    const board = boardOf([agenda(HOME, WORK)]);

    const next = withSealedCalendars(board, sealed);

    expect((next.pages[0].widgets[0] as AgendaWidget).calendars).toEqual([
      { name: 'Calendar 1', description: 'Note', url: SEALED },
      { name: 'Calendar 2', description: 'Note', url: WORK }
    ]);
  });

  it('swaps it wherever it is, on every page', () => {
    const next = withSealedCalendars(boardOf([agenda(HOME)], [agenda(HOME)]), sealed);

    expect(
      next.pages.slice(0, 2).map((page) => (page.widgets[0] as AgendaWidget).calendars[0].url)
    ).toEqual([SEALED, SEALED]);
  });

  it('leaves the other widgets, and the board’s other settings, as they were', () => {
    const weather = createWidget('weather');
    const board = boardOf([weather, agenda(HOME)]);

    const next = withSealedCalendars(board, sealed);

    expect(next.pages[0].widgets[0]).toBe(weather);
    expect(next.title).toBe(board.title);
    expect(next.pages[1]).toBe(board.pages[1]);
  });

  it('gives back the very same board when there is nothing to swap, so no change is made', () => {
    const board = boardOf([agenda(WORK, SEALED)], [createWidget('clock')]);

    expect(withSealedCalendars(board, sealed)).toBe(board);
    expect(withSealedCalendars(board, new Map())).toBe(board);
  });
});
