/**
 * The Agenda widget's data: Google Calendars, read from the "secret address in
 * iCal format" each one offers. They come from two places. A server can hold up
 * to three in its .env, which, like the BenchLM and TMDB keys, never reach the
 * page: the page asks this site's /api/calendar relay, which fetches the feed.
 * And any number the widget's own settings list (up to eight): those addresses
 * are kept with the widget, and the page hands each to the server to fetch,
 * which fetches Google Calendar addresses and nothing else.
 *
 * A feed holds a calendar's whole history, so it is read once, expanded into
 * the months the widget can show, and only that is kept in the page's cache.
 * The iCal parser is a sizeable library and loads the first time it is needed.
 */
import type ICAL from 'ical.js';
import { ADDRESS_HEADER, FEED_RELAY } from './calendar-address';

/** A calendar added in the widget's settings: its address, and a name and note to tell it by. */
export type CalendarSource = {
  /** What the widget calls it; empty to use the name the calendar gives itself. */
  name: string;
  /** What it is for, to keep track of it. */
  description: string;
  /** Google Calendar's secret address in iCal format. */
  url: string;
};

export type AgendaWidget = {
  id: string;
  type: 'agenda';
  width: number;
  /** 0 for Sunday, 1 for Monday. */
  weekStart: 0 | 1;
  /** How many events the list shows. */
  count: number;
  /** Whether the month shows above the list. */
  month: boolean;
  /** The calendars added here, besides any the server has in its .env. */
  calendars: CalendarSource[];
};

/** The server's relay serves /api/calendar/1 to /api/calendar/3, one per address in its .env. */
export const CALENDAR_SLOTS = 3;

/** How many calendars one widget can add for itself. */
export const MAX_ADDED_CALENDARS = 8;

/** The widget browses from this many months back to this many ahead. */
export const MONTHS_BACK = 1;
export const MONTHS_AHEAD = 4;

export type AgendaEvent = {
  /** Unique to this occurrence, so a repeating event has one per day it happens. */
  id: string;
  /** Which calendar it came from, by its `index`; each has its own colour. */
  calendar: number;
  title: string;
  allDay: boolean;
  /** Milliseconds. An all-day event starts at local midnight. */
  start: number;
  /** Milliseconds, exclusive: an all-day event ends at the midnight after its last day. */
  end: number;
  location: string;
  /** Plain text; calendar descriptions often arrive as HTML. */
  description: string;
  /** A video call to join, or empty. */
  link: string;
};

export type AgendaCalendar = {
  /** Its place among the calendars shown, from 0: the server's first, then the widget's own. */
  index: number;
  /** Where it came from: an address in the server's .env, or this widget's own list by position. */
  origin: { kind: 'server'; slot: number } | { kind: 'added'; position: number };
  /** The name the calendar gives itself, or empty. */
  name: string;
  /** False when the calendar is set up but didn't answer this time. */
  ok: boolean;
};

export type AgendaData = {
  events: AgendaEvent[];
  calendars: AgendaCalendar[];
};

/**
 * What the page keeps a reading under: the same for the same addresses, so
 * editing a calendar's name or note doesn't fetch again, and a different set
 * of addresses never shows another's events. (A short hash; the addresses are
 * secrets and aren't left in the page's storage names.)
 */
export const agendaCacheKey = (sources: readonly CalendarSource[]): string => {
  let hash = 0x811c9dc5;

  for (const character of sources.map((source) => source.url).join('\n')) {
    hash = Math.imul(hash ^ character.charCodeAt(0), 0x01000193) >>> 0;
  }

  return sources.length ? `agenda:v2:${hash.toString(36)}` : 'agenda:v2';
};

const RELAY = '/api/calendar';
const MAX_EVENTS_PER_CALENDAR = 600;
/** Stops a rule that repeats every second, or never ends, from spinning forever. */
const MAX_OCCURRENCES = 4000;

/** The span the widget reads: from the first of last month to the end of the month four ahead. */
export const agendaWindow = (now: Date): { from: number; to: number } => ({
  from: new Date(now.getFullYear(), now.getMonth() - MONTHS_BACK, 1).getTime(),
  to: new Date(now.getFullYear(), now.getMonth() + MONTHS_AHEAD + 1, 1).getTime()
});

/* -------------------------------------------------------------------------- */
/* Text                                                                       */
/* -------------------------------------------------------------------------- */

const ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  '#39': "'"
};

/** A calendar description as plain text: Google writes them as HTML. */
export const plainText = (raw: string, max = 400): string => {
  const text = raw
    .replace(/<\s*br\s*\/?>|<\/?(?:p|div|li|ul|ol|h[1-6])\b[^>]*>/gi, '\n')
    .replace(/<\/?[a-z][^>]*>/gi, '')
    .replace(
      /&(amp|lt|gt|quot|apos|nbsp|#39);/gi,
      (_match, name: string) => ENTITIES[name.toLowerCase()]
    )
    .replace(/[ \t\f\v\u00a0]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
};

const MEETING_HOST =
  /^(?:meet\.google\.com|(?:[\w-]+\.)?zoom\.us|teams\.microsoft\.com|teams\.live\.com|(?:[\w-]+\.)?webex\.com|whereby\.com|meet\.jit\.si|gotomeet\.me)$/i;

/** The first video-call address among some text, or empty. */
export const findMeetingLink = (...sources: string[]): string => {
  for (const source of sources) {
    for (const found of source.match(/https?:\/\/[^\s"'<>\\]+/gi) ?? []) {
      const address = found.replace(/[.,;:!?)\]]+$/, '');

      try {
        if (MEETING_HOST.test(new URL(address).hostname)) {
          return address;
        }
      } catch {
        /* not an address after all */
      }
    }
  }

  return '';
};

/** Whether a location is really a web address, as it is for a call. */
export const isAddress = (text: string): boolean => /^https?:\/\/\S+$/i.test(text);

/* -------------------------------------------------------------------------- */
/* Reading a feed                                                             */
/* -------------------------------------------------------------------------- */

type Ical = typeof ICAL;
type IcalEvent = InstanceType<Ical['Event']>;
type IcalTime = InstanceType<Ical['Time']>;

const clip = (value: unknown, max: number): string =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';

/** One occurrence of an event, or null when it is cancelled, outside the window or has no usable time. */
const occurrence = (
  item: IcalEvent,
  start: IcalTime,
  end: IcalTime,
  key: string,
  from: number,
  to: number
): AgendaEvent | null => {
  if (String(item.component.getFirstPropertyValue('status')).toUpperCase() === 'CANCELLED') {
    return null;
  }

  const startsAt = start.toJSDate().getTime();
  const endsAt = Math.max(end.toJSDate().getTime(), startsAt);

  // An event with no length is on at its start; one that ends exactly at `from` is already over.
  if (Number.isNaN(startsAt) || Number.isNaN(endsAt) || startsAt >= to) {
    return null;
  }

  if (endsAt <= from && startsAt < from) {
    return null;
  }

  const location = clip(item.location, 200);
  const description = clip(item.description, 4000);
  const conference = clip(item.component.getFirstPropertyValue('x-google-conference'), 500);

  return {
    id: `${key}:${item.uid}:${startsAt}`,
    calendar: 0,
    title: clip(item.summary, 200) || '(No title)',
    allDay: start.isDate,
    start: startsAt,
    end: endsAt,
    location,
    description: plainText(description),
    link: /^https?:\/\//i.test(conference)
      ? conference
      : findMeetingLink(
          location,
          description,
          clip(item.component.getFirstPropertyValue('url'), 500)
        )
  };
};

/**
 * Expands a feed into the events that fall in a window, with repeats and changes applied.
 * `key` tells this feed's events from another's; their calendar is set once the feeds are put together.
 */
export const readCalendar = (
  library: Ical,
  text: string,
  key: string,
  from: number,
  to: number
): { name: string; events: AgendaEvent[] } => {
  const root = new library.Component(library.parse(text));

  for (const zone of root.getAllSubcomponents('vtimezone')) {
    library.TimezoneService.register(zone);
  }

  // An empty list of exceptions stops each event from searching the whole feed for its own.
  const events = root
    .getAllSubcomponents('vevent')
    .map((component) => new library.Event(component, { exceptions: [] }));
  const masters = new Map<string, IcalEvent>();

  for (const event of events) {
    if (!event.isRecurrenceException()) {
      masters.set(event.uid, event);
    }
  }

  const loose: IcalEvent[] = [];

  for (const event of events) {
    if (!event.isRecurrenceException()) {
      continue;
    }

    // A change to one day of a series; when the series isn't in this feed it stands alone.
    const master = masters.get(event.uid);

    if (master) {
      master.relateException(event);
    } else {
      loose.push(event);
    }
  }

  const found: AgendaEvent[] = [];
  const keep = (item: AgendaEvent | null): void => {
    if (item) {
      found.push(item);
    }
  };

  for (const event of [...masters.values(), ...loose]) {
    if (!event.isRecurring()) {
      keep(occurrence(event, event.startDate, event.endDate, key, from, to));
      continue;
    }

    const iterator = event.iterator();

    for (
      let step = 0, next = iterator.next();
      next && step < MAX_OCCURRENCES;
      next = iterator.next(), step += 1
    ) {
      if (next.toJSDate().getTime() >= to) {
        break;
      }

      const details = event.getOccurrenceDetails(next);
      keep(occurrence(details.item, details.startDate, details.endDate, key, from, to));
    }
  }

  found.sort((a, b) => a.start - b.start || a.title.localeCompare(b.title));

  return {
    name: clip(root.getFirstPropertyValue('x-wr-calname'), 80),
    events: found.slice(0, MAX_EVENTS_PER_CALENDAR)
  };
};

/* -------------------------------------------------------------------------- */
/* Fetching                                                                   */
/* -------------------------------------------------------------------------- */

type Origin = AgendaCalendar['origin'];

type FeedResult =
  | { kind: 'ok'; name: string; events: AgendaEvent[] }
  | { kind: 'unset' | 'no-relay' | 'rejected' | 'blocked' | 'failed' };

/** Reads one calendar: a numbered address the server holds, or one this widget added. */
const fetchFeed = async (
  library: Ical,
  origin: Origin,
  source: CalendarSource | undefined,
  window: { from: number; to: number },
  signal: AbortSignal
): Promise<FeedResult> => {
  const server = origin.kind === 'server';
  let response: Response;

  try {
    response = server
      ? await fetch(`${RELAY}/${origin.slot}`, { signal })
      : await fetch(FEED_RELAY, { signal, headers: { [ADDRESS_HEADER]: source?.url ?? '' } });
  } catch (error) {
    if (signal.aborted) {
      throw error;
    }

    return { kind: 'failed' };
  }

  // The relay answers 204 for a numbered address it doesn't have, which is the usual case for
  // the second and third. A calendar that was added is expected to answer.
  if (server && (response.status === 204 || response.status === 401 || response.status === 403)) {
    return { kind: 'unset' };
  }

  if (response.status === 400) {
    return { kind: 'blocked' };
  }

  if (response.status === 404) {
    return { kind: 'rejected' };
  }

  if (!response.ok) {
    return { kind: 'failed' };
  }

  const text = await response.text();

  // A host without the relay answers every address with the dashboard's own page.
  if (!/^\s*BEGIN:VCALENDAR/i.test(text)) {
    return {
      kind: (response.headers.get('content-type') ?? '').includes('html') ? 'no-relay' : 'failed'
    };
  }

  try {
    const key = server ? `s${origin.slot}` : `a${origin.position}`;
    return { kind: 'ok', ...readCalendar(library, text, key, window.from, window.to) };
  } catch {
    return { kind: 'failed' };
  }
};

export const fetchAgenda = async (
  now: Date,
  sources: readonly CalendarSource[],
  signal: AbortSignal
): Promise<AgendaData> => {
  const library = (await import('ical.js')).default;
  const window = agendaWindow(now);
  const origins: Origin[] = [
    ...Array.from({ length: CALENDAR_SLOTS }, (_unused, index): Origin => ({
      kind: 'server',
      slot: index + 1
    })),
    ...sources.map((_source, position): Origin => ({ kind: 'added', position }))
  ];
  const results = await Promise.all(
    origins.map((origin) =>
      fetchFeed(
        library,
        origin,
        origin.kind === 'added' ? sources[origin.position] : undefined,
        window,
        signal
      )
    )
  );

  if (!results.some((result) => result.kind === 'ok')) {
    const kinds = results.map((result) => result.kind);

    if (kinds.includes('no-relay')) {
      throw new Error(
        'The Agenda goes through this dashboard’s server, which this host doesn’t provide.'
      );
    }

    if (kinds.includes('blocked')) {
      throw new Error(
        'This server only fetches Google Calendar’s iCal addresses. Check the ones added here.'
      );
    }

    if (kinds.includes('rejected')) {
      throw new Error(
        'Google Calendar didn’t accept the address. If you reset the secret address, copy the new one.'
      );
    }

    if (kinds.includes('failed')) {
      throw new Error('Google Calendar didn’t answer.');
    }

    throw new Error(
      'No calendar yet. Add one in this widget’s settings, or set CALENDAR_ICAL_URL on the server.'
    );
  }

  const calendars: AgendaCalendar[] = [];
  const events: AgendaEvent[] = [];

  results.forEach((result, position) => {
    if (result.kind === 'unset') {
      return;
    }

    const index = calendars.length;
    calendars.push({
      index,
      origin: origins[position],
      name: result.kind === 'ok' ? result.name : '',
      ok: result.kind === 'ok'
    });

    if (result.kind === 'ok') {
      events.push(...result.events.map((event) => ({ ...event, calendar: index })));
    }
  });

  return { events, calendars };
};
