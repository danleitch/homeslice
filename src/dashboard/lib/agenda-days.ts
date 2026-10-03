/**
 * The Agenda widget's arithmetic: which events fall on which day, what the
 * month grid holds, what is happening now, and how to word all of it. Days are
 * "YYYY-MM-DD" strings in the visitor's own time zone, which sort and compare
 * as text.
 */
import { MONTHS_AHEAD, MONTHS_BACK, type AgendaEvent } from './agenda';
import { formatTime } from './time';
import type { HourFormat } from './model';

const pad = (value: number): string => String(value).padStart(2, '0');

export const dayKey = (value: Date | number): string => {
  const date = new Date(value);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

export const dayFromKey = (key: string): Date => {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day);
};

export const addDays = (key: string, days: number): string => {
  const date = dayFromKey(key);
  date.setDate(date.getDate() + days);
  return dayKey(date);
};

/** Whole days from one day to another, negative when it is earlier. */
export const daysBetween = (from: string, to: string): number => {
  const a = dayFromKey(from);
  const b = dayFromKey(to);
  return Math.round(
    (Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) -
      Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) /
      86_400_000
  );
};

/** The same day in another month, or that month's last day when it is shorter. */
export const addMonths = (key: string, months: number): string => {
  const date = dayFromKey(key);
  const target = new Date(date.getFullYear(), date.getMonth() + months, 1);
  const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  return dayKey(new Date(target.getFullYear(), target.getMonth(), Math.min(date.getDate(), last)));
};

export const monthStart = (key: string): string => `${key.slice(0, 7)}-01`;

/** The days the widget can browse, as first and last: a month back to four ahead. */
export const browseRange = (today: string): { min: string; max: string } => {
  const first = dayFromKey(monthStart(today));
  return {
    min: dayKey(new Date(first.getFullYear(), first.getMonth() - MONTHS_BACK, 1)),
    max: dayKey(new Date(first.getFullYear(), first.getMonth() + MONTHS_AHEAD + 1, 0))
  };
};

export const clampDay = (key: string, range: { min: string; max: string }): string =>
  key < range.min ? range.min : key > range.max ? range.max : key;

/** Six weeks of days, the month's own and a little of each neighbour, so the grid never changes height. */
export const monthGrid = (key: string, weekStart: 0 | 1): string[][] => {
  const first = dayFromKey(monthStart(key));
  const lead = (first.getDay() - weekStart + 7) % 7;

  return Array.from({ length: 6 }, (_unused, week) =>
    Array.from({ length: 7 }, (_other, day) =>
      dayKey(new Date(first.getFullYear(), first.getMonth(), 1 - lead + week * 7 + day))
    )
  );
};

/** Where an arrow, Home, End or Page key takes the selection, or null for any other key. */
export const moveDay = (key: string, pressed: string, weekStart: 0 | 1): string | null => {
  const column = (dayFromKey(key).getDay() - weekStart + 7) % 7;

  switch (pressed) {
    case 'ArrowLeft':
      return addDays(key, -1);
    case 'ArrowRight':
      return addDays(key, 1);
    case 'ArrowUp':
      return addDays(key, -7);
    case 'ArrowDown':
      return addDays(key, 7);
    case 'Home':
      return addDays(key, -column);
    case 'End':
      return addDays(key, 6 - column);
    case 'PageUp':
      return addMonths(key, -1);
    case 'PageDown':
      return addMonths(key, 1);
    default:
      return null;
  }
};

/* -------------------------------------------------------------------------- */
/* Events by day                                                              */
/* -------------------------------------------------------------------------- */

export type DayMap = ReadonlyMap<string, readonly AgendaEvent[]>;

/** The last day an event touches: an event that ends at midnight does not touch the next. */
export const lastDay = (event: AgendaEvent): string => dayKey(Math.max(event.start, event.end - 1));

/** An event on every day it spans, all-day events first, then by start. */
export const groupByDay = (events: readonly AgendaEvent[]): DayMap => {
  const days = new Map<string, AgendaEvent[]>();

  for (const event of events) {
    const last = lastDay(event);
    let key = dayKey(event.start);

    // A guard against an event that spans years; the widget only browses a few months.
    for (let step = 0; step < 62; step += 1) {
      const list = days.get(key) ?? [];
      list.push(event);
      days.set(key, list);

      if (key >= last) {
        break;
      }

      key = addDays(key, 1);
    }
  }

  for (const list of days.values()) {
    list.sort(
      (a, b) =>
        Number(b.allDay) - Number(a.allDay) || a.start - b.start || a.title.localeCompare(b.title)
    );
  }

  return days;
};

export type DayGroup = {
  key: string;
  events: readonly AgendaEvent[];
  /** Events on the last day that did not fit under the count. */
  more: number;
};

/**
 * The agenda: the chosen day, empty or not, then each day after it that has
 * something on, until `count` events are listed.
 */
export const upcoming = (days: DayMap, from: string, count: number): DayGroup[] => {
  const keys = [from, ...[...days.keys()].filter((key) => key > from).sort()];
  const groups: DayGroup[] = [];
  let room = count;

  for (const key of keys) {
    const events = days.get(key) ?? [];

    if (room <= 0 || (events.length === 0 && key !== from)) {
      break;
    }

    groups.push({ key, events: events.slice(0, room), more: Math.max(0, events.length - room) });
    room -= events.length;
  }

  return groups;
};

/* -------------------------------------------------------------------------- */
/* Now                                                                        */
/* -------------------------------------------------------------------------- */

export type Phase = 'past' | 'live' | 'next' | 'later';

/** Where each of a day's events stands at a moment: over, on, up next, or still to come. */
export const phasesOf = (events: readonly AgendaEvent[], now: number): Phase[] => {
  let nextFound = false;

  return events.map((event) => {
    if (event.allDay) {
      return 'later';
    }

    if (event.end > event.start ? event.end <= now : event.start < now) {
      return 'past';
    }

    if (event.start <= now) {
      return 'live';
    }

    if (!nextFound) {
      nextFound = true;
      return 'next';
    }

    return 'later';
  });
};

const hoursAndMinutes = (minutes: number): string => {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
};

/** "in 25 min" or "in 2 h 5 min", and nothing for an event that is further off. */
export const untilLabel = (start: number, now: number): string => {
  const minutes = Math.ceil((start - now) / 60_000);

  if (minutes < 1 || minutes >= 12 * 60) {
    return '';
  }

  return `in ${minutes < 60 ? `${minutes} min` : hoursAndMinutes(minutes)}`;
};

/** "45 min" or "1 h 30 min"; empty for an event with no length. */
export const durationLabel = (milliseconds: number): string => {
  const minutes = Math.round(milliseconds / 60_000);

  if (minutes < 1) {
    return '';
  }

  return minutes < 60 ? `${minutes} min` : hoursAndMinutes(minutes);
};

/** How far through a live event it is, from 0 to 1. */
export const progressOf = (event: AgendaEvent, now: number): number =>
  event.end > event.start
    ? Math.min(1, Math.max(0, (now - event.start) / (event.end - event.start)))
    : 0;

/* -------------------------------------------------------------------------- */
/* Wording                                                                    */
/* -------------------------------------------------------------------------- */

const short = (date: Date, options: Intl.DateTimeFormatOptions): string =>
  date.toLocaleDateString(undefined, options);

/** A day's heading: "Today" and "3 Oct", or "Monday" and "5 Oct" (with the year when it isn't this one). */
export const dayHeading = (key: string, today: string): { lead: string; date: string } => {
  const date = dayFromKey(key);
  const gap = daysBetween(today, key);
  const lead =
    gap === 0
      ? 'Today'
      : gap === 1
        ? 'Tomorrow'
        : gap === -1
          ? 'Yesterday'
          : short(date, { weekday: 'long' });

  return {
    lead,
    date: short(date, {
      day: 'numeric',
      month: 'short',
      ...(key.slice(0, 4) === today.slice(0, 4) ? {} : { year: 'numeric' })
    })
  };
};

/** "Saturday 3 October", for a screen reader. */
export const longDay = (key: string): string =>
  short(dayFromKey(key), { weekday: 'long', day: 'numeric', month: 'long' });

/** What the time column says for an event on a day: a start and an end, or what kind of day it is. */
export const rowTimes = (
  event: AgendaEvent,
  key: string,
  clock: HourFormat
): { primary: string; secondary: string } => {
  const first = dayKey(event.start);
  const last = lastDay(event);

  if (event.allDay) {
    const total = daysBetween(first, last) + 1;
    return {
      primary: 'All day',
      secondary: total > 1 ? `Day ${daysBetween(first, key) + 1}/${total}` : ''
    };
  }

  const ends = new Date(event.end);

  if (first !== key) {
    return { primary: 'Cont.', secondary: last === key ? `until ${formatTime(ends, clock)}` : '' };
  }

  const starts = formatTime(new Date(event.start), clock);

  if (event.end <= event.start) {
    return { primary: starts, secondary: '' };
  }

  return {
    primary: starts,
    secondary: last === key ? formatTime(ends, clock) : `→ ${short(ends, { weekday: 'short' })}`
  };
};

/** An event's whole span, for its details: "Sat, Oct 3 · 09:00 – 10:30", or "Mon, Oct 5 – Wed, Oct 7". */
export const spanLabel = (event: AgendaEvent, clock: HourFormat): string => {
  const first = new Date(event.start);
  const last = dayFromKey(lastDay(event));
  const day = (date: Date): string =>
    short(date, { weekday: 'short', day: 'numeric', month: 'short' });
  const sameDay = dayKey(first) === dayKey(last);

  if (event.allDay) {
    return sameDay ? day(first) : `${day(first)} – ${day(last)}`;
  }

  const starts = formatTime(first, clock);

  if (event.end <= event.start) {
    return `${day(first)} · ${starts}`;
  }

  const ends = formatTime(new Date(event.end), clock);

  return sameDay
    ? `${day(first)} · ${starts} – ${ends}`
    : `${day(first)}, ${starts} – ${day(last)}, ${ends}`;
};

/** Google Calendar's own page for a day, to open the event there. */
export const calendarDayUrl = (key: string): string => {
  const [year, month, day] = key.split('-').map(Number);
  return `https://calendar.google.com/calendar/r/day/${year}/${month}/${day}`;
};

export const mapsUrl = (place: string): string =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place)}`;
