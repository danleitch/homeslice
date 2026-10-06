import { describe, expect, it } from 'vitest';
import { dayKey, lastDay } from './agenda-days';
import type { AgendaData } from './agenda';
import { WIDGET_TYPES } from './model';
import { createSampleSource, sampleReading, sampleWidget } from './sample-data';
import type { Quote } from './markets';
import type { NewsItem } from './rss';
import type { Story } from './hackernews';
import type { Trending } from './github';
import type { Title } from './tmdb';
import type { WeatherReport } from './weather';
import { pickModels, priceKey, type Prices, type Rankings } from './benchlm';

const EVENING = new Date(2026, 9, 6, 18, 0);
const LATE = new Date(2026, 9, 6, 23, 30);

describe('sampleWidget', () => {
  it('has four markets to show, with their names', () => {
    expect(sampleWidget('markets')).toMatchObject({
      symbols: [
        { symbol: 'SPY', name: 'S&P 500' },
        { symbol: 'NVDA', name: 'Chipmaker' },
        { symbol: 'BTC-USD', name: 'Bitcoin' },
        { symbol: 'AAPL', name: 'Apple' }
      ]
    });
  });

  it.each(WIDGET_TYPES)('is a %s widget, with the settings a new one starts with', (type) => {
    const widget = sampleWidget(type);

    expect(widget.type).toBe(type);
    expect(widget.width).toBeGreaterThan(0);
  });

  it('has a place for the weather, so it shows rather than asks', () => {
    expect(sampleWidget('weather')).toMatchObject({ location: 'Cape Town, South Africa' });
  });

  it('has tasks, some done, and a note, for Notes to show', () => {
    const notes = sampleWidget('notes') as { items: { done: boolean }[]; text: string };

    expect(notes.items.length).toBeGreaterThan(3);
    expect(notes.items.some((item) => item.done)).toBe(true);
    expect(notes.items.some((item) => !item.done)).toBe(true);
    expect(notes.text).toContain('\n');
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

    it('has the sun’s times, the UV and the air, for the widget to show or leave out', () => {
      expect(report.uv).toBe(7);
      expect(report.air).toBe(38);
      // Sunrise at 06:12 where the place keeps time, which is UTC+2.
      expect(new Date(report.sun!.rise).getUTCHours()).toBe(4);
      expect(new Date(report.sun!.rise).getUTCMinutes()).toBe(12);
      expect(report.sun!.set).toBeGreaterThan(report.sun!.rise);
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

  describe('the markets', () => {
    const MINT = 'DemoMint1111111111111111111111111111111pump';
    const quotesOf = (key: string): Quote[] => sampleReading(key, EVENING) as Quote[];

    it('has a quote for each symbol asked for, in order, with a month of closes', () => {
      const quotes = quotesOf('markets:SPY=S&P 500,NVDA=,BTC-USD=Bitcoin,AAPL=Apple');

      expect(quotes.map((quote) => quote.symbol)).toEqual(['SPY', 'NVDA', 'BTC-USD', 'AAPL']);

      for (const quote of quotes) {
        expect(quote.closes).toHaveLength(22);
        expect(quote.closes.every((close) => close > 0)).toBe(true);
      }

      expect(quotes.some((quote) => quote.change > 0)).toBe(true);
      expect(quotes.some((quote) => quote.change < 0)).toBe(true);
    });

    it('calls a well-known symbol by its name unless it was given another', () => {
      const [spy, btc] = quotesOf('markets:SPY=,BTC-USD=My coin');

      expect(spy!.name).toBe('S&P 500');
      expect(btc!.name).toBe('My coin');
    });

    it('has the main coins, so a crypto list shows', () => {
      const quotes = quotesOf('markets:BTC-USD=,ETH-USD=,SOL-USD=');

      expect(quotes.map((quote) => quote.name)).toEqual(['Bitcoin', 'Ethereum', 'Solana']);
    });

    it('makes up a steady reading for a symbol it has never heard of, named for it', () => {
      const [first] = quotesOf('markets:ZZZZ=');
      const [again] = quotesOf('markets:ZZZZ=');

      expect(first).toEqual(again);
      expect(first!.name).toBe('ZZZZ');
      expect(first!.price).toBeGreaterThan(0);
    });

    it('keeps a name with a comma or an equals sign in it whole, to the extent the key allows', () => {
      const [quote] = quotesOf('markets:AAPL=a=b');

      expect(quote!.name).toBe('a=b');
    });

    it('reads a token typed by its address as one: a tiny price, a pool, and its own link', () => {
      const [token] = quotesOf(`markets:${MINT}=`);

      expect(token).toMatchObject({ symbol: 'DEMO', name: 'Sample token', currency: 'USD' });
      expect(token!.price).toBeLessThan(0.001);
      expect(token!.precision).toBeGreaterThan(5);
      expect(token!.liquidity).toBeGreaterThan(0);
      expect(token!.url).toBe('https://dexscreener.com/');
      expect(token!.closes).toHaveLength(22);
    });

    it('names a token the visitor named, and takes an 0x address’s ticker from after the 0x', () => {
      const [token] = quotesOf('markets:0xAbAbAbAbAbAbAbAbAbAbAbAbAbAbAbAbAbAbAbAb=My coin');

      expect(token).toMatchObject({ symbol: 'ABAB', name: 'My coin' });
    });

    it('shows a token among the others, which keep to Yahoo’s ways', () => {
      const quotes = quotesOf(`markets:BTC-USD=,${MINT}=`);

      expect(quotes[0]!.liquidity).toBeUndefined();
      expect(quotes[1]!.liquidity).toBeDefined();
    });

    it('has nothing for no symbols', () => {
      expect(quotesOf('markets:')).toEqual([]);
    });
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

  describe('following the settings in the key', () => {
    describe('the weather, by place and units', () => {
      const at = (key: string) => sampleReading(key, EVENING) as WeatherReport;

      it('is of the place it was asked about, and its country when the place says one', () => {
        expect(at('weather:oslo:metric').place).toMatchObject({ name: 'Oslo', country: '' });
        expect(at('weather:portland, oregon, us:metric').place).toMatchObject({
          name: 'Portland',
          country: 'Oregon, US'
        });
        expect(at('weather:cape town, south africa:metric').place).toMatchObject({
          name: 'Cape Town',
          country: 'South Africa'
        });
      });

      it('is of Cape Town for a place that is nothing', () => {
        expect(at('weather::metric').place.name).toBe('Cape Town');
        expect(at('weather').place.name).toBe('Cape Town');
      });

      it('is in degrees Celsius and kilometres an hour for metric, and for no units at all', () => {
        const metric = at('weather:oslo:metric');

        expect(at('weather:oslo')).toEqual(metric);
        expect(metric.wind).toBe(14);
      });

      it('is in degrees Fahrenheit and miles an hour for imperial, all through', () => {
        const metric = at('weather:oslo:metric');
        const imperial = at('weather:oslo:imperial');
        const f = (c: number) => Math.round((c * 9) / 5 + 32);

        expect(imperial.temperature).toBe(f(metric.temperature));
        expect(imperial.apparent).toBe(f(metric.apparent));
        expect(imperial.high).toBe(f(metric.high));
        expect(imperial.low).toBe(f(metric.low));
        expect(imperial.wind).toBe(9);
        expect(imperial.columns.map((column) => column.temperature)).toEqual(
          metric.columns.map((column) => f(column.temperature))
        );
        expect(imperial.days.map((day) => day.high)).toEqual(metric.days.map((day) => f(day.high)));
        expect(imperial.columns.map((column) => column.scale)).toEqual(
          metric.columns.map((column) => column.scale)
        );
      });
    });

    describe('GitHub, by period and language', () => {
      const repos = (key: string) => (sampleReading(key, EVENING) as Trending).repos;

      it('has every language for “all”, and only the one asked for otherwise', () => {
        expect(
          new Set(repos('github:daily:all:15').map((repo) => repo.language)).size
        ).toBeGreaterThan(5);
        expect(new Set(repos('github:daily:typescript:15').map((repo) => repo.language))).toEqual(
          new Set(['TypeScript'])
        );
      });

      it('takes a language by the slug GitHub gives it', () => {
        expect(repos('github:daily:c-sharp:15')).toEqual([]);
        expect(repos('github:daily:go:15').every((repo) => repo.language === 'Go')).toBe(true);
      });

      it('counts after the language, so it has as many of that language as there are, up to the count', () => {
        expect(repos('github:daily:typescript:2')).toHaveLength(2);
        expect(repos('github:daily:zig:6')).toHaveLength(1);
      });

      it('has nothing for a language nobody has written', () => {
        expect(repos('github:daily:cobol:6')).toEqual([]);
      });

      it('has more stars gained over a longer period', () => {
        const day = repos('github:daily:all:1')[0]!.gained;

        expect(repos('github:weekly:all:1')[0]!.gained).toBe(day * 4);
        expect(repos('github:monthly:all:1')[0]!.gained).toBe(day * 12);
        expect(repos('github:fortnightly:all:1')[0]!.gained).toBe(day);
      });
    });

    describe('the leaderboard, by ranking', () => {
      const ranked = (key: string) => sampleReading(key, EVENING) as Rankings;
      const names = (key: string) => ranked(key).models.map((model) => model.name);

      it('has the same models in every ranking', () => {
        expect([...names('benchlm:coding')].sort()).toEqual([...names('benchlm:overall')].sort());
      });

      it('puts them in a different order for a different ranking, the same way each time', () => {
        expect(names('benchlm:coding')).not.toEqual(names('benchlm:overall'));
        expect(names('benchlm:coding')).toEqual(names('benchlm:coding'));
        expect(names('benchlm:agentic')).not.toEqual(names('benchlm:coding'));
      });

      it('numbers them from one, best first, whatever the ranking', () => {
        for (const surface of ['overall', 'coding', 'agentic', 'knowledge']) {
          const { models } = ranked(`benchlm:${surface}`);

          expect(models.map((model) => model.rank)).toEqual(
            models.map((_model, index) => index + 1)
          );
          expect(models.map((model) => model.score)).toEqual(
            [...models.map((model) => model.score)].sort((a, b) => b - a)
          );
          expect(models.every((model) => model.score <= 99.9)).toBe(true);
        }
      });

      it('has a price for some of them, and not for the rest, as the real list has', () => {
        const priced = sampleReading('benchlm:prices', EVENING) as Prices;
        const { models } = ranked('benchlm:overall');
        const have = models.filter((model) => priced[priceKey(model.name)]);

        expect(have.length).toBeGreaterThan(5);
        expect(have.length).toBeLessThan(models.length);
      });

      it('has enough that are cheap for the Budget preset to fill its list', () => {
        const priced = sampleReading('benchlm:prices', EVENING) as Prices;

        expect(pickModels(ranked('benchlm:coding'), '', 5, 2, priced)).toHaveLength(5);
      });
    });

    describe('TV and films, by period', () => {
      const names = (key: string) =>
        (sampleReading(key, EVENING) as Title[]).map((title) => title.name);

      it('has the same titles today as this week, a few places along', () => {
        for (const kind of ['tv', 'movie']) {
          const week = names(`tmdb:${kind}:week`);
          const day = names(`tmdb:${kind}:day`);

          expect(day).not.toEqual(week);
          expect([...day].sort()).toEqual([...week].sort());
          expect(day[0]).toBe(week[3]);
        }
      });
    });
  });

  it('has headlines for any feed, newest first, each a link that goes nowhere real', () => {
    const items = sampleReading('news:ars', EVENING) as NewsItem[];
    const times = items.map((item) => item.time);

    expect(items.length).toBeGreaterThanOrEqual(12);
    expect(times).toEqual([...times].sort((a, b) => b - a));
    expect(items.every((item) => item.url.startsWith('https://news.example/ars/'))).toBe(true);
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
