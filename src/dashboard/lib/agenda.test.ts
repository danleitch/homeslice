import { describe, expect, it, vi } from 'vitest';
import {
  agendaCacheKey,
  agendaWindow,
  fetchAgenda,
  findMeetingLink,
  isAddress,
  plainText,
  readCalendar,
  type AgendaEvent,
  type CalendarSource
} from './agenda';

const signal = new AbortController().signal;

const ADDRESS_A =
  'https://calendar.google.com/calendar/ical/a%40example.com/private-aaaa1111/basic.ics';
const ADDRESS_B =
  'https://calendar.google.com/calendar/ical/b%40example.com/private-bbbb2222/basic.ics';

/** The suite runs in UTC, so 8:00 below is 8:00 on the clock too. */
const at = (day: number, hour = 0, minute = 0): number =>
  new Date(2026, 9, day, hour, minute).getTime();

const WINDOW = { from: new Date(2026, 8, 1).getTime(), to: new Date(2027, 2, 1).getTime() };

const ZONE = `BEGIN:VTIMEZONE
TZID:Africa/Johannesburg
BEGIN:STANDARD
TZOFFSETFROM:+0200
TZOFFSETTO:+0200
TZNAME:SAST
DTSTART:19700101T000000
END:STANDARD
END:VTIMEZONE`;

const event = (...lines: string[]): string => ['BEGIN:VEVENT', ...lines, 'END:VEVENT'].join('\n');

const feed = (name: string, ...events: string[]): string =>
  [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    ...(name ? [`X-WR-CALNAME:${name}`] : []),
    ZONE,
    ...events,
    'END:VCALENDAR'
  ]
    .join('\n')
    .replace(/\n/g, '\r\n');

const read = async (
  text: string,
  key = 's1',
  window = WINDOW
): Promise<{ name: string; events: AgendaEvent[] }> => {
  const library = (await import('ical.js')).default;
  return readCalendar(library, text, key, window.from, window.to);
};

const titles = (events: AgendaEvent[]): string[] => events.map((item) => item.title);

describe('plainText', () => {
  it('turns the HTML calendars send into plain lines', () => {
    expect(
      plainText(
        'Agenda:<br>1. Plan<br/>2. Ship &amp; celebrate<p>Bring <b>notes</b></p><p>Thanks</p>'
      )
    ).toBe('Agenda:\n1. Plan\n2. Ship & celebrate\nBring notes\n\nThanks');
  });

  it('decodes the usual entities once, and leaves a bare angle bracket alone', () => {
    expect(plainText('5 &lt; 6 &amp;lt; 7 &quot;ok&quot; it&#39;s&nbsp;fine, 1 < 2')).toBe(
      '5 < 6 &lt; 7 "ok" it\'s fine, 1 < 2'
    );
  });

  it('tidies runs of spaces and blank lines', () => {
    expect(plainText('  a   b \n\n\n\n c  ')).toBe('a b\n\nc');
  });

  it('shortens a long text with an ellipsis', () => {
    const shortened = plainText('word '.repeat(200), 20);
    expect(shortened).toHaveLength(20);
    expect(shortened.endsWith('…')).toBe(true);
  });
});

describe('findMeetingLink', () => {
  it('finds a video call among other links', () => {
    expect(
      findMeetingLink(
        'Notes: https://docs.google.com/document/d/1',
        'Join: <a href="https://meet.google.com/abc-defg-hij">here</a>'
      )
    ).toBe('https://meet.google.com/abc-defg-hij');
  });

  it.each([
    'https://acme.zoom.us/j/123?pwd=x',
    'https://teams.microsoft.com/l/meetup-join/abc',
    'https://whereby.com/room',
    'https://meet.jit.si/Standup',
    'https://acme.webex.com/meet/dan'
  ])('knows %s', (link) => {
    expect(findMeetingLink(`Call ${link}.`)).toBe(link);
  });

  it('drops the punctuation a sentence puts after an address', () => {
    expect(findMeetingLink('(https://meet.google.com/abc-defg-hij).')).toBe(
      'https://meet.google.com/abc-defg-hij'
    );
  });

  it('is empty when there is no call, or the address is not one', () => {
    expect(findMeetingLink('', 'https://example.com/zoom.us', 'https://[broken')).toBe('');
  });
});

describe('isAddress', () => {
  it('is true only for a whole web address', () => {
    expect(isAddress('https://zoom.us/j/1')).toBe(true);
    expect(isAddress('Room 4, https://zoom.us/j/1')).toBe(false);
    expect(isAddress('Cape Town')).toBe(false);
  });
});

describe('agendaWindow', () => {
  it('runs from the first of last month to the end of the month four ahead', () => {
    const { from, to } = agendaWindow(new Date(2026, 9, 17, 14, 30));
    expect(new Date(from)).toEqual(new Date(2026, 8, 1));
    expect(new Date(to)).toEqual(new Date(2027, 2, 1));
  });

  it('crosses the new year', () => {
    const { from, to } = agendaWindow(new Date(2026, 0, 5));
    expect(new Date(from)).toEqual(new Date(2025, 11, 1));
    expect(new Date(to)).toEqual(new Date(2026, 5, 1));
  });
});

describe('readCalendar', () => {
  it('names the calendar and reads a timed event with its details', async () => {
    const { name, events } = await read(
      feed(
        'Dan Leitch',
        event(
          'UID:one@google.com',
          'DTSTART:20261003T080000Z',
          'DTEND:20261003T093000Z',
          'SUMMARY:Planning',
          'LOCATION:Room 4\\, Cape Town',
          'DESCRIPTION:Bring notes<br>and &amp; coffee',
          'X-GOOGLE-CONFERENCE:https://meet.google.com/abc-defg-hij'
        )
      )
    );

    expect(name).toBe('Dan Leitch');
    expect(events).toEqual([
      {
        id: `s1:one@google.com:${at(3, 8)}`,
        calendar: 0,
        title: 'Planning',
        allDay: false,
        start: at(3, 8),
        end: at(3, 9, 30),
        location: 'Room 4, Cape Town',
        description: 'Bring notes\nand & coffee',
        link: 'https://meet.google.com/abc-defg-hij'
      }
    ]);
  });

  it('reads the zone an event names from the feed', async () => {
    const { events } = await read(
      feed(
        '',
        event(
          'UID:zoned@google.com',
          'DTSTART;TZID=Africa/Johannesburg:20261003T100000',
          'DTEND;TZID=Africa/Johannesburg:20261003T110000',
          'SUMMARY:Local'
        )
      )
    );

    expect(events[0].start).toBe(at(3, 8));
  });

  it('puts an all-day event on local midnights, the end being the day after its last', async () => {
    const { events } = await read(
      feed(
        '',
        event(
          'UID:trip@google.com',
          'DTSTART;VALUE=DATE:20261005',
          'DTEND;VALUE=DATE:20261008',
          'SUMMARY:Trip'
        ),
        event('UID:lone@google.com', 'DTSTART;VALUE=DATE:20261009', 'SUMMARY:Holiday')
      )
    );

    expect(events).toMatchObject([
      { title: 'Trip', allDay: true, start: at(5), end: at(8) },
      { title: 'Holiday', allDay: true, start: at(9), end: at(10) }
    ]);
  });

  it('gives an event with no end no length, and no title a placeholder', async () => {
    const { events } = await read(
      feed('', event('UID:bare@google.com', 'DTSTART:20261004T120000Z'))
    );

    expect(events).toMatchObject([{ title: '(No title)', start: at(4, 12), end: at(4, 12) }]);
  });

  it('repeats a series, skipping the dates taken out of it', async () => {
    const { events } = await read(
      feed(
        '',
        event(
          'UID:standup@google.com',
          'DTSTART;TZID=Africa/Johannesburg:20260921T093000',
          'DTEND;TZID=Africa/Johannesburg:20260921T100000',
          'RRULE:FREQ=WEEKLY;BYDAY=MO,WE;UNTIL=20261012T000000Z',
          'EXDATE;TZID=Africa/Johannesburg:20261005T093000',
          'SUMMARY:Standup'
        )
      )
    );

    expect(events.map((item) => item.start)).toEqual([
      new Date(2026, 8, 21, 7, 30).getTime(),
      new Date(2026, 8, 23, 7, 30).getTime(),
      new Date(2026, 8, 28, 7, 30).getTime(),
      new Date(2026, 8, 30, 7, 30).getTime(),
      at(7, 7, 30)
    ]);
  });

  it('applies a change to one day of a series, and keeps ids apart', async () => {
    const { events } = await read(
      feed(
        '',
        event(
          'UID:standup@google.com',
          'DTSTART:20261005T073000Z',
          'DTEND:20261005T080000Z',
          'RRULE:FREQ=WEEKLY;COUNT=3',
          'SUMMARY:Standup'
        ),
        event(
          'UID:standup@google.com',
          'RECURRENCE-ID:20261012T073000Z',
          'DTSTART:20261012T110000Z',
          'DTEND:20261012T113000Z',
          'SUMMARY:Standup (moved)'
        ),
        event(
          'UID:standup@google.com',
          'RECURRENCE-ID:20261019T073000Z',
          'DTSTART:20261019T073000Z',
          'DTEND:20261019T080000Z',
          'STATUS:CANCELLED',
          'SUMMARY:Standup'
        )
      )
    );

    expect(events.map((item) => [item.title, item.start])).toEqual([
      ['Standup', at(5, 7, 30)],
      ['Standup (moved)', at(12, 11)]
    ]);
    expect(new Set(events.map((item) => item.id)).size).toBe(2);
  });

  it('shows a change to a series that is not in the feed as an event of its own', async () => {
    const { events } = await read(
      feed(
        '',
        event(
          'UID:theirs@google.com',
          'RECURRENCE-ID:20261008T073000Z',
          'DTSTART:20261008T090000Z',
          'DTEND:20261008T100000Z',
          'SUMMARY:Their review'
        )
      )
    );

    expect(titles(events)).toEqual(['Their review']);
  });

  it('repeats a birthday every year', async () => {
    const { events } = await read(
      feed(
        '',
        event(
          'UID:bday@google.com',
          'DTSTART;VALUE=DATE:20151012',
          'DTEND;VALUE=DATE:20151013',
          'RRULE:FREQ=YEARLY',
          'SUMMARY:Sam’s birthday'
        )
      )
    );

    expect(events).toMatchObject([{ allDay: true, start: at(12) }]);
  });

  it('leaves out cancelled events and everything outside the window', async () => {
    const { events } = await read(
      feed(
        '',
        event('UID:a@x', 'DTSTART:20261004T100000Z', 'STATUS:CANCELLED', 'SUMMARY:Cancelled'),
        event('UID:b@x', 'DTSTART:20250101T100000Z', 'DTEND:20250101T110000Z', 'SUMMARY:Long ago'),
        event('UID:c@x', 'DTSTART:20290101T100000Z', 'DTEND:20290101T110000Z', 'SUMMARY:Far off'),
        event('UID:d@x', 'DTSTART:20260831T230000Z', 'DTEND:20260901T000000Z', 'SUMMARY:Just over'),
        event(
          'UID:e@x',
          'DTSTART:20260831T230000Z',
          'DTEND:20260901T010000Z',
          'SUMMARY:Runs into it'
        ),
        event('UID:f@x', 'DTSTART:20260901T000000Z', 'SUMMARY:On the dot'),
        event('UID:g@x', 'DTSTART:20261003T080000Z', 'DTEND:20261003T090000Z', 'SUMMARY:Kept')
      )
    );

    expect(titles(events)).toEqual(['Runs into it', 'On the dot', 'Kept']);
  });

  it('orders events by start, then by title, and ignores events with unreadable times', async () => {
    const { events } = await read(
      feed(
        '',
        event('UID:b@x', 'DTSTART:20261003T080000Z', 'SUMMARY:Beta'),
        event('UID:a@x', 'DTSTART:20261003T080000Z', 'SUMMARY:Alpha'),
        event('UID:c@x', 'DTSTART:20261002T080000Z', 'SUMMARY:Earlier')
      )
    );

    expect(titles(events)).toEqual(['Earlier', 'Alpha', 'Beta']);
  });

  it('finds a call in the description or location when the feed names none', async () => {
    const { events } = await read(
      feed(
        '',
        event(
          'UID:a@x',
          'DTSTART:20261003T080000Z',
          'SUMMARY:Zoom',
          'DESCRIPTION:Join <a href="https://acme.zoom.us/j/9">here</a>'
        ),
        event(
          'UID:b@x',
          'DTSTART:20261003T090000Z',
          'SUMMARY:Teams',
          'LOCATION:https://teams.microsoft.com/l/meetup-join/xyz'
        ),
        event(
          'UID:c@x',
          'DTSTART:20261003T100000Z',
          'SUMMARY:Linked',
          'URL:https://whereby.com/dan',
          'X-GOOGLE-CONFERENCE:not an address'
        ),
        event('UID:d@x', 'DTSTART:20261003T110000Z', 'SUMMARY:Plain')
      )
    );

    expect(events.map((item) => item.link)).toEqual([
      'https://acme.zoom.us/j/9',
      'https://teams.microsoft.com/l/meetup-join/xyz',
      'https://whereby.com/dan',
      ''
    ]);
  });

  it('stops a rule that never ends from running away', async () => {
    const started = Date.now();
    const { events } = await read(
      feed(
        '',
        event(
          'UID:busy@x',
          'DTSTART:20260101T000000Z',
          'DTEND:20260101T000100Z',
          'RRULE:FREQ=MINUTELY',
          'SUMMARY:Busy'
        )
      )
    );

    expect(events).toHaveLength(0);
    expect(Date.now() - started).toBeLessThan(5000);
  });

  it('keeps no more than six hundred events a calendar', async () => {
    const { events } = await read(
      feed(
        '',
        event(
          'UID:daily@x',
          'DTSTART:20260901T080000Z',
          'DTEND:20260901T090000Z',
          'RRULE:FREQ=HOURLY;COUNT=900',
          'SUMMARY:Hourly'
        )
      )
    );

    expect(events).toHaveLength(600);
  });

  it('tells one feed’s events from another’s by the key it was read under', async () => {
    const feedOf = feed('', event('UID:a@x', 'DTSTART:20261003T080000Z'));
    const [first, second] = await Promise.all([read(feedOf, 's3'), read(feedOf, 'a0')]);

    expect(first.events[0].id.startsWith('s3:')).toBe(true);
    expect(second.events[0].id.startsWith('a0:')).toBe(true);
    expect(first.events[0].calendar).toBe(0);
  });
});

describe('agendaCacheKey', () => {
  const source = (name: string, url: string, description = ''): CalendarSource => ({
    name,
    description,
    url
  });

  it('is one key when no calendar was added', () => {
    expect(agendaCacheKey([])).toBe('agenda:v2');
  });

  it('is the same for the same addresses, whatever the calendars are called', () => {
    const one = agendaCacheKey([source('Home', ADDRESS_A, 'Mine'), source('Work', ADDRESS_B)]);
    const other = agendaCacheKey([source('Renamed', ADDRESS_A), source('', ADDRESS_B, 'Shared')]);

    expect(one).toBe(other);
  });

  it('differs for other addresses, and for the same ones in another order', () => {
    const keys = [
      agendaCacheKey([source('', ADDRESS_A)]),
      agendaCacheKey([source('', ADDRESS_B)]),
      agendaCacheKey([source('', ADDRESS_A), source('', ADDRESS_B)]),
      agendaCacheKey([source('', ADDRESS_B), source('', ADDRESS_A)])
    ];

    expect(new Set(keys).size).toBe(4);
  });

  it('keeps the address out of the key', () => {
    const key = agendaCacheKey([source('', ADDRESS_A)]);

    expect(key).toMatch(/^agenda:v2:[0-9a-z]+$/);
    expect(key).not.toContain('private');
  });
});

describe('fetchAgenda', () => {
  const now = new Date(2026, 9, 3, 12);
  const source = (name: string, url: string, description = ''): CalendarSource => ({
    name,
    description,
    url
  });
  const none: CalendarSource[] = [];

  const reply = (body: string, init: ResponseInit = {}): Response =>
    new Response(body, {
      status: 200,
      headers: { 'content-type': 'text/calendar; charset=utf-8' },
      ...init
    });

  type Answer = Response | (() => Response);

  /**
   * Answers /api/calendar/1, /2 and /3 from `server`, in turn, and the feed relay from `added`,
   * by the address in the header; a function answer can throw.
   */
  const serve = (
    server: Answer[] = [],
    added: Record<string, Answer> = {}
  ): ReturnType<typeof vi.fn> => {
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      const address = (init?.headers as Record<string, string> | undefined)?.['X-Calendar-Url'];
      const answer =
        url === '/api/calendar/feed'
          ? (added[address ?? ''] ?? new Response(null, { status: 404 }))
          : (server[Number(url.split('/').pop()) - 1] ?? new Response(null, { status: 204 }));

      return typeof answer === 'function'
        ? Promise.resolve().then(answer)
        : Promise.resolve(answer.clone());
    });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  };

  const planning = feed(
    'Home',
    event('UID:a@x', 'DTSTART:20261003T150000Z', 'DTEND:20261003T160000Z', 'SUMMARY:Planning')
  );
  const review = feed(
    '',
    event('UID:b@x', 'DTSTART:20261004T150000Z', 'DTEND:20261004T160000Z', 'SUMMARY:Review')
  );
  const standup = feed(
    'Work',
    event('UID:c@x', 'DTSTART:20261005T073000Z', 'DTEND:20261005T080000Z', 'SUMMARY:Standup')
  );

  describe('the calendars the server holds', () => {
    it('asks the relay for each of the three, and nothing else when none was added', async () => {
      const fetchMock = serve([reply(planning)]);
      await fetchAgenda(now, none, signal);

      expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
        '/api/calendar/1',
        '/api/calendar/2',
        '/api/calendar/3'
      ]);
    });

    it.each([204, 401, 403])('leaves out a slot the relay answers %i for', async (status) => {
      serve([reply(planning), new Response(null, { status })]);
      const data = await fetchAgenda(now, none, signal);

      expect(data.calendars.map((calendar) => calendar.origin)).toEqual([
        { kind: 'server', slot: 1 }
      ]);
    });

    it('reads one calendar, leaving out the slots that are not set up', async () => {
      serve([reply(planning)]);

      await expect(fetchAgenda(now, none, signal)).resolves.toMatchObject({
        calendars: [{ index: 0, origin: { kind: 'server', slot: 1 }, name: 'Home', ok: true }],
        events: [{ title: 'Planning', calendar: 0 }]
      });
    });

    it('numbers the calendars that are there, whichever slots they have', async () => {
      serve([reply(planning), reply('', { status: 401 }), reply(review)]);
      const data = await fetchAgenda(now, none, signal);

      expect(data.calendars).toEqual([
        { index: 0, origin: { kind: 'server', slot: 1 }, name: 'Home', ok: true },
        { index: 1, origin: { kind: 'server', slot: 3 }, name: '', ok: true }
      ]);
      expect(data.events.map((item) => [item.title, item.calendar])).toEqual([
        ['Planning', 0],
        ['Review', 1]
      ]);
    });
  });

  describe('the calendars added in the widget', () => {
    it('asks the feed relay for each, with the address in a header and not the URL', async () => {
      const fetchMock = serve([], { [ADDRESS_A]: reply(planning), [ADDRESS_B]: reply(standup) });
      await fetchAgenda(now, [source('', ADDRESS_A), source('', ADDRESS_B)], signal);

      const feeds = fetchMock.mock.calls.filter(([url]) => url === '/api/calendar/feed');

      expect(feeds.map(([, init]) => init.headers)).toEqual([
        { 'X-Calendar-Url': ADDRESS_A },
        { 'X-Calendar-Url': ADDRESS_B }
      ]);
      expect(JSON.stringify(fetchMock.mock.calls.map(([url]) => url))).not.toContain('private');
    });

    it('reads them with no calendar on the server at all', async () => {
      serve([], { [ADDRESS_A]: reply(planning) });
      const data = await fetchAgenda(now, [source('Mine', ADDRESS_A)], signal);

      expect(data).toMatchObject({
        calendars: [{ index: 0, origin: { kind: 'added', position: 0 }, name: 'Home', ok: true }],
        events: [{ title: 'Planning', calendar: 0 }]
      });
    });

    it('puts them after the server’s, in the order they were added', async () => {
      serve([reply(planning)], { [ADDRESS_A]: reply(review), [ADDRESS_B]: reply(standup) });
      const data = await fetchAgenda(now, [source('', ADDRESS_A), source('', ADDRESS_B)], signal);

      expect(data.calendars.map((calendar) => [calendar.index, calendar.origin])).toEqual([
        [0, { kind: 'server', slot: 1 }],
        [1, { kind: 'added', position: 0 }],
        [2, { kind: 'added', position: 1 }]
      ]);
      expect(data.events.map((item) => [item.title, item.calendar])).toEqual([
        ['Planning', 0],
        ['Review', 1],
        ['Standup', 2]
      ]);
    });

    it('keeps events of different calendars apart even when their ids would match', async () => {
      serve([reply(planning)], { [ADDRESS_A]: reply(planning) });
      const data = await fetchAgenda(now, [source('', ADDRESS_A)], signal);

      expect(new Set(data.events.map((item) => item.id)).size).toBe(2);
    });

    it('does not take an answer of no content as a calendar that is not set up', async () => {
      serve([reply(planning)], { [ADDRESS_A]: new Response(null, { status: 204 }) });
      const data = await fetchAgenda(now, [source('Work', ADDRESS_A)], signal);

      expect(data.calendars.map((calendar) => [calendar.origin.kind, calendar.ok])).toEqual([
        ['server', true],
        ['added', false]
      ]);
    });

    it.each([401, 403, 500])(
      'counts a relay answer of %i as one that did not answer',
      async (status) => {
        serve([reply(planning)], { [ADDRESS_A]: new Response(null, { status }) });
        const data = await fetchAgenda(now, [source('', ADDRESS_A)], signal);

        expect(data.calendars[1]).toMatchObject({
          origin: { kind: 'added', position: 0 },
          ok: false
        });
      }
    );
  });

  describe('when some do not answer', () => {
    it('keeps the calendars that answered', async () => {
      serve([
        reply(planning),
        reply('', { status: 502 }),
        () => {
          throw new TypeError('Failed to fetch');
        }
      ]);
      const data = await fetchAgenda(now, none, signal);

      expect(data.calendars).toEqual([
        { index: 0, origin: { kind: 'server', slot: 1 }, name: 'Home', ok: true },
        { index: 1, origin: { kind: 'server', slot: 2 }, name: '', ok: false },
        { index: 2, origin: { kind: 'server', slot: 3 }, name: '', ok: false }
      ]);
      expect(titles(data.events)).toEqual(['Planning']);
    });

    it('keeps them when one that was added fails', async () => {
      serve([reply(planning)], {
        [ADDRESS_A]: () => {
          throw new TypeError('Failed to fetch');
        },
        [ADDRESS_B]: reply(standup)
      });
      const data = await fetchAgenda(now, [source('', ADDRESS_A), source('', ADDRESS_B)], signal);

      expect(data.calendars.map((calendar) => calendar.ok)).toEqual([true, false, true]);
      expect(titles(data.events)).toEqual(['Planning', 'Standup']);
    });

    it('counts a feed it cannot read as one that did not answer', async () => {
      serve([
        reply(planning),
        reply('BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nEND:VCALENDAR'),
        reply('<html>an error page</html>', { headers: { 'content-type': 'text/plain' } })
      ]);
      const data = await fetchAgenda(now, none, signal);

      expect(data.calendars.map((calendar) => calendar.ok)).toEqual([true, false, false]);
    });
  });

  describe('when none answers', () => {
    it('asks for a calendar to be added, or set up on the server', async () => {
      serve();

      await expect(fetchAgenda(now, none, signal)).rejects.toThrow(
        'No calendar yet. Add one in this widget’s settings, or set CALENDAR_ICAL_URL on the server.'
      );
    });

    it('says the host has no relay when it answers with its own page', async () => {
      serve([reply('<!doctype html>', { headers: { 'content-type': 'text/html' } })]);

      await expect(fetchAgenda(now, none, signal)).rejects.toThrow(
        'The Agenda goes through this dashboard’s server, which this host doesn’t provide.'
      );
    });

    it('says so when the server will not fetch an address that was added', async () => {
      serve([], { [ADDRESS_A]: reply('', { status: 400 }) });

      await expect(fetchAgenda(now, [source('', ADDRESS_A)], signal)).rejects.toThrow(
        'This server only fetches Google Calendar’s iCal addresses. Check the ones added here.'
      );
    });

    it('says when Google does not know the address, as after a reset', async () => {
      serve([reply('', { status: 404 })]);

      await expect(fetchAgenda(now, none, signal)).rejects.toThrow(
        'Google Calendar didn’t accept the address. If you reset the secret address, copy the new one.'
      );
    });

    it('says when Google does not answer at all', async () => {
      serve([reply('', { status: 500 })]);

      await expect(fetchAgenda(now, none, signal)).rejects.toThrow(
        'Google Calendar didn’t answer.'
      );
    });

    it('passes an abort on rather than calling it a failure', async () => {
      const controller = new AbortController();
      controller.abort();
      serve([
        () => {
          throw new DOMException('Aborted', 'AbortError');
        }
      ]);

      await expect(fetchAgenda(now, none, controller.signal)).rejects.toThrow('Aborted');
    });
  });
});
