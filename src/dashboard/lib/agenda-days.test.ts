import { describe, expect, it } from 'vitest';
import type { AgendaEvent } from './agenda';
import {
  addDays,
  addMonths,
  browseRange,
  calendarDayUrl,
  clampDay,
  dayFromKey,
  dayHeading,
  dayKey,
  daysBetween,
  durationLabel,
  groupByDay,
  lastDay,
  longDay,
  mapsUrl,
  monthGrid,
  monthStart,
  moveDay,
  phasesOf,
  progressOf,
  rowTimes,
  spanLabel,
  untilLabel,
  upcoming
} from './agenda-days';

const at = (month: number, day: number, hour = 0, minute = 0): number =>
  new Date(2026, month - 1, day, hour, minute).getTime();

let counter = 0;

const timed = (title: string, start: number, end: number, calendar = 0): AgendaEvent => ({
  id: `e${(counter += 1)}`,
  calendar,
  title,
  allDay: false,
  start,
  end,
  location: '',
  description: '',
  link: ''
});

/** An all-day event on the days from `first` to `last`, inclusive. */
const allDay = (title: string, first: [number, number], last = first): AgendaEvent => ({
  ...timed(title, at(...first), at(last[0], last[1] + 1)),
  allDay: true
});

describe('days', () => {
  it('keys a day by its local date, and reads it back', () => {
    expect(dayKey(new Date(2026, 2, 5, 23, 59))).toBe('2026-03-05');
    expect(dayKey(at(12, 31, 12))).toBe('2026-12-31');
    expect(dayFromKey('2026-03-05')).toEqual(new Date(2026, 2, 5));
  });

  it('adds days across month and year ends and a leap day', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-10-03', 0)).toBe('2026-10-03');
  });

  it('counts the days between two, either way round', () => {
    expect(daysBetween('2026-10-03', '2026-10-03')).toBe(0);
    expect(daysBetween('2026-10-03', '2026-10-06')).toBe(3);
    expect(daysBetween('2026-10-03', '2026-09-30')).toBe(-3);
    expect(daysBetween('2025-12-30', '2026-01-02')).toBe(3);
  });

  it('moves by months, landing on the last day of one that is shorter', () => {
    expect(addMonths('2026-10-17', 1)).toBe('2026-11-17');
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2026-03-31', -1)).toBe('2026-02-28');
    expect(addMonths('2026-12-15', 1)).toBe('2027-01-15');
    expect(addMonths('2026-01-15', -1)).toBe('2025-12-15');
  });

  it('finds the first of the month', () => {
    expect(monthStart('2026-10-17')).toBe('2026-10-01');
  });

  it('browses from last month to four months ahead, and stays within', () => {
    const range = browseRange('2026-10-17');

    expect(range).toEqual({ min: '2026-09-01', max: '2027-02-28' });
    expect(browseRange('2026-01-05')).toEqual({ min: '2025-12-01', max: '2026-05-31' });
    expect(clampDay('2026-08-31', range)).toBe('2026-09-01');
    expect(clampDay('2027-03-01', range)).toBe('2027-02-28');
    expect(clampDay('2026-10-17', range)).toBe('2026-10-17');
  });
});

describe('monthGrid', () => {
  it('lays out six weeks, with the neighbouring months filling in', () => {
    const grid = monthGrid('2026-10-17', 1);

    expect(grid).toHaveLength(6);
    expect(grid.every((week) => week.length === 7)).toBe(true);
    // 1 October 2026 is a Thursday.
    expect(grid[0][0]).toBe('2026-09-28');
    expect(grid[0][3]).toBe('2026-10-01');
    expect(grid[5][6]).toBe('2026-11-08');
  });

  it('starts the week on Sunday when asked', () => {
    expect(monthGrid('2026-10-17', 0)[0][0]).toBe('2026-09-27');
  });

  it('starts on the first when the month does', () => {
    // 1 June 2026 is a Monday.
    expect(monthGrid('2026-06-10', 1)[0][0]).toBe('2026-06-01');
    expect(monthGrid('2026-06-10', 0)[0][0]).toBe('2026-05-31');
  });
});

describe('moveDay', () => {
  // Wednesday 14 October 2026.
  const from = '2026-10-14';

  it.each([
    ['ArrowLeft', '2026-10-13'],
    ['ArrowRight', '2026-10-15'],
    ['ArrowUp', '2026-10-07'],
    ['ArrowDown', '2026-10-21'],
    ['Home', '2026-10-12'],
    ['End', '2026-10-18'],
    ['PageUp', '2026-09-14'],
    ['PageDown', '2026-11-14']
  ])('takes %s to %s with weeks that start on Monday', (key, to) => {
    expect(moveDay(from, key, 1)).toBe(to);
  });

  it('takes Home and End to the ends of a week that starts on Sunday', () => {
    expect(moveDay(from, 'Home', 0)).toBe('2026-10-11');
    expect(moveDay(from, 'End', 0)).toBe('2026-10-17');
    expect(moveDay('2026-10-11', 'Home', 0)).toBe('2026-10-11');
    expect(moveDay('2026-10-18', 'End', 1)).toBe('2026-10-18');
  });

  it('leaves other keys alone', () => {
    expect(moveDay(from, 'a', 1)).toBeNull();
    expect(moveDay(from, 'Enter', 1)).toBeNull();
  });
});

describe('lastDay', () => {
  it('is the day an event ends on, but not the one it ends at midnight into', () => {
    expect(lastDay(timed('Lunch', at(10, 3, 12), at(10, 3, 13)))).toBe('2026-10-03');
    expect(lastDay(timed('Late', at(10, 3, 22), at(10, 4, 0)))).toBe('2026-10-03');
    expect(lastDay(timed('Overnight', at(10, 3, 22), at(10, 4, 7)))).toBe('2026-10-04');
    expect(lastDay(allDay('Trip', [10, 5], [10, 7]))).toBe('2026-10-07');
  });

  it('is the start for an event with no length', () => {
    expect(lastDay(timed('Ping', at(10, 3, 9), at(10, 3, 9)))).toBe('2026-10-03');
  });
});

describe('groupByDay', () => {
  it('puts an event on every day it spans', () => {
    const days = groupByDay([
      allDay('Trip', [10, 5], [10, 7]),
      timed('Call', at(10, 6, 9), at(10, 6, 10))
    ]);

    expect([...days.keys()].sort()).toEqual(['2026-10-05', '2026-10-06', '2026-10-07']);
    expect(days.get('2026-10-06')?.map((event) => event.title)).toEqual(['Trip', 'Call']);
  });

  it('lists all-day events first, then by start and by title', () => {
    const days = groupByDay([
      timed('Beta', at(10, 3, 9), at(10, 3, 10)),
      timed('Alpha', at(10, 3, 9), at(10, 3, 10)),
      timed('Early', at(10, 3, 7), at(10, 3, 8)),
      allDay('Holiday', [10, 3])
    ]);

    expect(days.get('2026-10-03')?.map((event) => event.title)).toEqual([
      'Holiday',
      'Early',
      'Alpha',
      'Beta'
    ]);
  });

  it('stops at two months for an event that spans years', () => {
    const days = groupByDay([allDay('Sabbatical', [1, 1], [12, 31])]);

    expect(days.size).toBe(62);
    expect(days.has('2026-03-03')).toBe(true);
    expect(days.has('2026-03-04')).toBe(false);
  });

  it('has no days for no events', () => {
    expect(groupByDay([]).size).toBe(0);
  });
});

describe('upcoming', () => {
  const events = [
    timed('Today 1', at(10, 3, 9), at(10, 3, 10)),
    timed('Today 2', at(10, 3, 11), at(10, 3, 12)),
    timed('Later', at(10, 7, 9), at(10, 7, 10)),
    timed('Much later', at(10, 20, 9), at(10, 20, 10)),
    timed('Earlier', at(10, 1, 9), at(10, 1, 10))
  ];
  const days = groupByDay(events);
  const titles = (groups: ReturnType<typeof upcoming>): string[][] =>
    groups.map((group) => group.events.map((event) => event.title));

  it('lists the chosen day, then each later day that has something on', () => {
    const groups = upcoming(days, '2026-10-03', 10);

    expect(groups.map((group) => group.key)).toEqual(['2026-10-03', '2026-10-07', '2026-10-20']);
    expect(titles(groups)).toEqual([['Today 1', 'Today 2'], ['Later'], ['Much later']]);
    expect(groups.every((group) => group.more === 0)).toBe(true);
  });

  it('shows an empty chosen day, as an empty group first', () => {
    expect(titles(upcoming(days, '2026-10-05', 10))).toEqual([[], ['Later'], ['Much later']]);
  });

  it('is one empty day when nothing is on from then', () => {
    expect(titles(upcoming(days, '2026-11-01', 10))).toEqual([[]]);
  });

  it('stops at the count, and says how many were left out of the last day', () => {
    const groups = upcoming(days, '2026-10-03', 1);

    expect(titles(groups)).toEqual([['Today 1']]);
    expect(groups[0].more).toBe(1);
  });

  it('stops when the count is met exactly, with nothing left out', () => {
    const groups = upcoming(days, '2026-10-03', 2);

    expect(titles(groups)).toEqual([['Today 1', 'Today 2']]);
    expect(groups[0].more).toBe(0);
  });

  it('carries on into later days with the room that is left', () => {
    const groups = upcoming(days, '2026-10-03', 3);

    expect(titles(groups)).toEqual([['Today 1', 'Today 2'], ['Later']]);
  });
});

describe('phasesOf', () => {
  const now = at(10, 3, 12, 0);

  it('tells over from on from next from still to come', () => {
    const phases = phasesOf(
      [
        allDay('Holiday', [10, 3]),
        timed('Done', at(10, 3, 9), at(10, 3, 10)),
        timed('Just ended', at(10, 3, 11), at(10, 3, 12)),
        timed('On', at(10, 3, 11, 30), at(10, 3, 12, 30)),
        timed('Starting', at(10, 3, 12), at(10, 3, 13)),
        timed('Up next', at(10, 3, 14), at(10, 3, 15)),
        timed('Evening', at(10, 3, 19), at(10, 3, 20))
      ],
      now
    );

    expect(phases).toEqual(['later', 'past', 'past', 'live', 'live', 'next', 'later']);
  });

  it('makes the first event still to come the next, when none is on', () => {
    expect(
      phasesOf(
        [timed('A', at(10, 3, 13), at(10, 3, 14)), timed('B', at(10, 3, 15), at(10, 3, 16))],
        now
      )
    ).toEqual(['next', 'later']);
  });

  it('treats an event with no length as over once its minute has passed', () => {
    expect(
      phasesOf(
        [timed('Ping', at(10, 3, 11), at(10, 3, 11)), timed('Ping', at(10, 3, 13), at(10, 3, 13))],
        now
      )
    ).toEqual(['past', 'next']);
  });

  it('is empty for no events', () => {
    expect(phasesOf([], now)).toEqual([]);
  });
});

describe('untilLabel', () => {
  const now = at(10, 3, 12, 0);

  it.each([
    [at(10, 3, 12, 25), 'in 25 min'],
    [at(10, 3, 12, 0) + 30_000, 'in 1 min'],
    [at(10, 3, 12, 59), 'in 59 min'],
    [at(10, 3, 13, 0), 'in 1 h'],
    [at(10, 3, 13, 30), 'in 1 h 30 min'],
    [at(10, 3, 14, 5), 'in 2 h 5 min'],
    [at(10, 3, 23, 59), 'in 11 h 59 min'],
    [at(10, 4, 0, 0), ''],
    [at(10, 3, 12, 0), ''],
    [at(10, 3, 11, 0), '']
  ])('says %#: %s', (start, label) => {
    expect(untilLabel(start, now)).toBe(label);
  });
});

describe('durationLabel', () => {
  it.each([
    [0, ''],
    [20_000, ''],
    [45 * 60_000, '45 min'],
    [60 * 60_000, '1 h'],
    [90 * 60_000, '1 h 30 min'],
    [2 * 60 * 60_000, '2 h']
  ])('words %i ms as %j', (milliseconds, label) => {
    expect(durationLabel(milliseconds)).toBe(label);
  });
});

describe('progressOf', () => {
  const event = timed('Review', at(10, 3, 17), at(10, 3, 18));

  it('is how far through the event the moment is, from nothing to all', () => {
    expect(progressOf(event, at(10, 3, 17, 15))).toBe(0.25);
    expect(progressOf(event, at(10, 3, 16))).toBe(0);
    expect(progressOf(event, at(10, 3, 19))).toBe(1);
  });

  it('is nothing for an event with no length', () => {
    expect(progressOf(timed('Ping', at(10, 3, 17), at(10, 3, 17)), at(10, 3, 17, 30))).toBe(0);
  });
});

describe('wording', () => {
  it('heads today, tomorrow and yesterday by name, and other days by weekday', () => {
    expect(dayHeading('2026-10-03', '2026-10-03')).toEqual({ lead: 'Today', date: 'Oct 3' });
    expect(dayHeading('2026-10-04', '2026-10-03').lead).toBe('Tomorrow');
    expect(dayHeading('2026-10-02', '2026-10-03').lead).toBe('Yesterday');
    expect(dayHeading('2026-10-05', '2026-10-03')).toEqual({ lead: 'Monday', date: 'Oct 5' });
  });

  it('adds the year to a day in another one', () => {
    expect(dayHeading('2027-01-04', '2026-10-03').date).toBe('Jan 4, 2027');
  });

  it('reads a day out in full', () => {
    expect(longDay('2026-10-03')).toBe('Saturday, October 3');
  });

  it('builds the links to Google Calendar and to a map', () => {
    expect(calendarDayUrl('2026-10-03')).toBe(
      'https://calendar.google.com/calendar/r/day/2026/10/3'
    );
    expect(mapsUrl('Kloof St & 5th')).toBe(
      'https://www.google.com/maps/search/?api=1&query=Kloof%20St%20%26%205th'
    );
  });

  describe('rowTimes', () => {
    it('says an all-day event is, and which day of a run it is on', () => {
      expect(rowTimes(allDay('Holiday', [10, 3]), '2026-10-03', '24h')).toEqual({
        primary: 'All day',
        secondary: ''
      });

      const trip = allDay('Trip', [10, 5], [10, 7]);
      expect(rowTimes(trip, '2026-10-05', '24h').secondary).toBe('Day 1/3');
      expect(rowTimes(trip, '2026-10-07', '24h').secondary).toBe('Day 3/3');
    });

    it('gives a timed event its start and end', () => {
      const lunch = timed('Lunch', at(10, 3, 12, 30), at(10, 3, 13, 45));

      expect(rowTimes(lunch, '2026-10-03', '24h')).toEqual({
        primary: '12:30',
        secondary: '13:45'
      });
      expect(rowTimes(lunch, '2026-10-03', '12h').primary).toMatch(/12:30\s?PM/i);
    });

    it('gives an event with no length its start alone', () => {
      expect(rowTimes(timed('Ping', at(10, 3, 9), at(10, 3, 9)), '2026-10-03', '24h')).toEqual({
        primary: '09:00',
        secondary: ''
      });
    });

    it('points an overnight event on to the day it ends, and says it continues there', () => {
      const flight = timed('Flight', at(10, 3, 22), at(10, 4, 7, 30));

      expect(rowTimes(flight, '2026-10-03', '24h')).toEqual({
        primary: '22:00',
        secondary: '→ Sun'
      });
      expect(rowTimes(flight, '2026-10-04', '24h')).toEqual({
        primary: 'Cont.',
        secondary: 'until 07:30'
      });
    });

    it('says nothing more for a middle day of a long event', () => {
      const away = timed('Away', at(10, 3, 22), at(10, 6, 7));

      expect(rowTimes(away, '2026-10-04', '24h')).toEqual({ primary: 'Cont.', secondary: '' });
    });
  });

  describe('spanLabel', () => {
    it('words an all-day event, single or across days', () => {
      expect(spanLabel(allDay('Holiday', [10, 3]), '24h')).toBe('Sat, Oct 3');
      expect(spanLabel(allDay('Trip', [10, 5], [10, 7]), '24h')).toBe('Mon, Oct 5 – Wed, Oct 7');
    });

    it('words a timed event, with no length, within a day or across days', () => {
      expect(spanLabel(timed('Lunch', at(10, 3, 12), at(10, 3, 13)), '24h')).toBe(
        'Sat, Oct 3 · 12:00 – 13:00'
      );
      expect(spanLabel(timed('Ping', at(10, 3, 12), at(10, 3, 12)), '24h')).toBe(
        'Sat, Oct 3 · 12:00'
      );
      expect(spanLabel(timed('Flight', at(10, 3, 22), at(10, 4, 7)), '24h')).toBe(
        'Sat, Oct 3, 22:00 – Sun, Oct 4, 07:00'
      );
    });
  });
});
