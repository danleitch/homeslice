import { describe, expect, it } from 'vitest';
import { dayKey, lastDay } from './agenda-days';
import type { AgendaData } from './agenda';
import { WIDGET_TYPES } from './model';
import { createSampleSource, sampleReading, sampleWidget } from './sample-data';
import type { Quote } from './markets';
import type { Story } from './hackernews';
import type { Trending } from './github';
import type { Title } from './tmdb';
import type { WeatherReport } from './weather';

const EVENING = new Date(2026, 9, 6, 18, 0);
const LATE = new Date(2026, 9, 6, 23, 30);

describe('sampleWidget', () => {
  it.each(WIDGET_TYPES)('is a %s widget, with the settings a new one starts with', (type) => {
    const widget = sampleWidget(type);

    expect(widget.type).toBe(type);
    expect(widget.width).toBeGreaterThan(0);
  });

  it('has a place for the weather, so it shows rather than asks', () => {
    expect(sampleWidget('weather')).toMatchObject({ location: 'Cape Town' });
  });

  it('has calendars for the agenda, and a token for My PRs, so neither asks for one', () => {
    expect(sampleWidget('agenda')).toMatchObject({
      calendars: [{ name: 'Personal' }, { name: 'Work' }]
    });
    expect((sampleWidget('prs') as { token: string }).token).not.toBe('');
  });

  it('is a fresh widget each time, so one is never shared', () => {
    expect(sampleWidget('clock').id).not.toBe(sampleWidget('clock').id);
  });
});

describe('sampleReading', () => {
  it('knows nothing of a key that is not a widget’s', () => {
    expect(sampleReading('status:github', EVENING)).toBeUndefined();
    expect(sampleReading('', EVENING)).toBeUndefined();
  });

  describe('the weather', () => {
    const report = sampleReading('weather:cape town:metric', EVENING) as WeatherReport;

    it('has twelve columns across the day, with the current one at the hour', () => {
      expect(report.columns).toHaveLength(12);
      expect(report.currentColumn).toBe(9);
      expect(report.temperature).toBe(report.columns[9]!.temperature);
    });

    it('is in the range it says, with the bars scaled to it', () => {
      const temperatures = report.columns.map((column) => column.temperature);

      expect(report.high).toBe(Math.max(...temperatures));
      expect(report.low).toBe(Math.min(...temperatures));
      expect(Math.max(...report.columns.map((column) => column.scale))).toBe(1);
      expect(Math.min(...report.columns.map((column) => column.scale))).toBe(0);
    });

    it('has five days to come, each a date', () => {
      expect(report.days).toHaveLength(5);
      expect(report.days[0]!.date).toBe('2026-10-07');
    });

    it('is day at midday and night at midnight', () => {
      expect(
        (sampleReading('weather:x:metric', new Date(2026, 9, 6, 12)) as WeatherReport).isDay
      ).toBe(true);
      expect(
        (sampleReading('weather:x:metric', new Date(2026, 9, 6, 0)) as WeatherReport).isDay
      ).toBe(false);
    });
  });

  it('has a month of closes for each market', () => {
    const quotes = sampleReading('markets:SPY=S&P 500', EVENING) as Quote[];

    expect(quotes.length).toBeGreaterThan(2);

    for (const quote of quotes) {
      expect(quote.closes).toHaveLength(22);
      expect(quote.closes.every((close) => close > 0)).toBe(true);
    }

    expect(quotes.some((quote) => quote.change > 0)).toBe(true);
    expect(quotes.some((quote) => quote.change < 0)).toBe(true);
  });

  it('has as many stories as the key asks for, and no more than there are', () => {
    expect(sampleReading('hackernews:3', EVENING) as Story[]).toHaveLength(3);
    expect(sampleReading('hackernews:15', EVENING) as Story[]).toHaveLength(15);
  });

  it('dates each story from the moment given, newest first', () => {
    const stories = sampleReading('hackernews:6', EVENING) as Story[];
    const times = stories.map((story) => story.time);

    expect(times).toEqual([...times].sort((a, b) => b - a));
    expect(times[0]).toBeLessThanOrEqual(EVENING.getTime() / 1000);
  });

  it('has as many repositories as the key asks for', () => {
    const trending = sampleReading('github:daily:all:4', EVENING) as Trending;

    expect(trending.repos).toHaveLength(4);
    expect(trending.repos.every((repo) => repo.url.startsWith('https://github.com/'))).toBe(true);
    expect(trending.publishedAt).toBe(EVENING.getTime());
  });

  it('has pull requests to review and of its own, with every kind of check', () => {
    const data = sampleReading('pulls:abc', EVENING) as import('./pulls').PullsData;
    const all = [...data.review, ...data.mine];

    expect(data.review.length).toBeGreaterThan(0);
    expect(data.mine.length).toBeGreaterThan(0);
    expect(new Set(all.map((pull) => pull.checks))).toEqual(
      new Set(['passing', 'failing', 'pending', 'none'])
    );
  });

  it('has ranked models, best first, for any ranking', () => {
    const rankings = sampleReading('benchlm:coding', EVENING) as import('./benchlm').Rankings;
    const scores = rankings.models.map((model) => model.score);

    expect(scores).toEqual([...scores].sort((a, b) => b - a));
    expect(rankings.asOf).toBe('2026-10-06');
  });

  it('has a poster for every title, which asks the network for nothing', () => {
    for (const kind of ['tv', 'movie']) {
      const titles = sampleReading(`tmdb:${kind}:week`, EVENING) as Title[];

      expect(titles.length).toBeGreaterThanOrEqual(5);
      expect(titles.every((title) => title.poster.startsWith('data:image/svg+xml,'))).toBe(true);
    }
  });

  it('has different shows from films', () => {
    const shows = sampleReading('tmdb:tv:week', EVENING) as Title[];
    const films = sampleReading('tmdb:movie:week', EVENING) as Title[];

    expect(shows[0]!.name).not.toBe(films[0]!.name);
  });

  describe('the agenda', () => {
    const agendaAt = (now: Date): AgendaData => sampleReading('agenda:abc', now) as AgendaData;

    it('has two calendars, both answering', () => {
      expect(agendaAt(EVENING).calendars).toEqual([
        { slot: 1, name: 'Personal', ok: true, locked: false },
        { slot: 2, name: 'Work', ok: true, locked: false }
      ]);
    });

    it('has something under way, which started before now and ends after it', () => {
      const underway = agendaAt(EVENING).events.filter(
        (event) =>
          !event.allDay && event.start <= EVENING.getTime() && event.end > EVENING.getTime()
      );

      expect(underway).toHaveLength(1);
    });

    it('has events on either side of today, and an all-day one', () => {
      const { events } = agendaAt(EVENING);

      expect(events.some((event) => event.start < EVENING.getTime() - 86_400_000)).toBe(true);
      expect(events.some((event) => event.start > EVENING.getTime() + 7 * 86_400_000)).toBe(true);
      expect(events.some((event) => event.allDay)).toBe(true);
    });

    it('gives each event its own id, and only the two calendars’ colours', () => {
      const { events } = agendaAt(EVENING);

      expect(new Set(events.map((event) => event.id)).size).toBe(events.length);
      expect(new Set(events.map((event) => event.calendar))).toEqual(new Set([0, 1]));
    });

    it.each([
      ['in the evening', EVENING],
      ['late at night', LATE]
    ])('keeps what is later today inside today, %s', (_when, now) => {
      const later = agendaAt(now).events.filter((event) =>
        ['Planning', 'Dinner with Ana'].includes(event.title)
      );

      expect(later).toHaveLength(2);

      for (const event of later) {
        expect(dayKey(event.start)).toBe(lastDay(event));
        expect(event.start).toBeGreaterThan(now.getTime() - 1);
      }
    });
  });
});

describe('createSampleSource', () => {
  it('answers a key with the same reading every time', () => {
    const source = createSampleSource(EVENING);

    expect(source('weather:x:metric')).toBe(source('weather:x:metric'));
    expect(source('markets:a')).toBe(source('markets:a'));
  });

  it('answers different keys with their own readings', () => {
    const source = createSampleSource(EVENING);

    expect(source('hackernews:3') as Story[]).toHaveLength(3);
    expect(source('hackernews:5') as Story[]).toHaveLength(5);
  });

  it('works out each reading at the moment it was made for', () => {
    const source = createSampleSource(EVENING);

    expect((source('github:daily:all:3') as Trending).publishedAt).toBe(EVENING.getTime());
  });

  it('answers undefined for a key that is not a widget’s, again and again', () => {
    const source = createSampleSource(EVENING);

    expect(source('nope')).toBeUndefined();
    expect(source('nope')).toBeUndefined();
  });
});
