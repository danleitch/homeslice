import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fetchRankings } from '../lib/benchlm';
import { fetchTrending } from '../lib/github';
import { fetchTopStories, type Story } from '../lib/hackernews';
import { createWidget, type HourFormat, type Widget, type WidgetType } from '../lib/model';
import { fetchShows } from '../lib/tmdb';
import { fetchWeather, type WeatherReport } from '../lib/weather';
import { WidgetView } from './widget-view';

vi.mock('../lib/weather', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/weather')>()),
  fetchWeather: vi.fn()
}));
vi.mock('../lib/hackernews', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/hackernews')>()),
  fetchTopStories: vi.fn()
}));
vi.mock('../lib/benchlm', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/benchlm')>()),
  fetchRankings: vi.fn()
}));
vi.mock('../lib/github', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/github')>()),
  fetchTrending: vi.fn()
}));
vi.mock('../lib/tmdb', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/tmdb')>()),
  fetchShows: vi.fn()
}));

const widgetOf = <T extends WidgetType>(
  type: T,
  patch: Partial<Extract<Widget, { type: T }>> = {}
): Extract<Widget, { type: T }> =>
  ({ ...createWidget(type), ...patch }) as Extract<Widget, { type: T }>;

const show = (widget: Widget, clock: HourFormat = '24h', newTab = false) =>
  render(<WidgetView widget={widget} clock={clock} newTab={newTab} />);

const report: WeatherReport = {
  place: {
    name: 'Cape Town',
    area: 'Western Cape',
    country: 'South Africa',
    latitude: -33.92,
    longitude: 18.42,
    timezone: 'Africa/Johannesburg'
  },
  temperature: 21,
  apparent: 19,
  code: 2,
  isDay: true,
  wind: 14,
  humidity: 63,
  high: 24,
  low: 15,
  currentColumn: 2,
  columns: [
    { hour: 0, temperature: 15, scale: 0, rain: false, daylight: false },
    { hour: 6, temperature: 16, scale: 0.1, rain: false, daylight: true },
    { hour: 12, temperature: 24, scale: 1, rain: true, daylight: true },
    { hour: 15, temperature: 23, scale: 0.9, rain: false, daylight: true },
    { hour: 18, temperature: 20, scale: 0.5, rain: false, daylight: false },
    { hour: 21, temperature: 17, scale: 0.2, rain: false, daylight: false }
  ],
  days: [
    { date: '2026-03-10', code: 0, high: 25, low: 14 },
    { date: '2026-03-11', code: 61, high: 22, low: 13 }
  ]
};

describe('the widgets that fetch', () => {
  beforeEach(() => {
    vi.mocked(fetchWeather).mockReset().mockResolvedValue(report);
    vi.mocked(fetchTopStories).mockReset().mockResolvedValue([]);
    vi.mocked(fetchRankings).mockReset();
    vi.mocked(fetchTrending).mockReset();
    vi.mocked(fetchShows).mockReset();
  });

  describe('weather', () => {
    it('asks for a place to be chosen when there is none', () => {
      show(widgetOf('weather', { location: '  ' }));

      expect(screen.getByText('Choose a place in this widget’s settings.')).toBeInTheDocument();
    });

    it('shimmers while it waits', () => {
      vi.mocked(fetchWeather).mockReturnValue(new Promise(() => undefined));
      show(widgetOf('weather', { location: 'Waiting' }));

      expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
    });

    it('shows the weather now, for the place it was asked about, in the units it was asked for', async () => {
      show(widgetOf('weather', { location: 'Cape Town', units: 'metric' }));

      expect(await screen.findByText('Cape Town, South Africa')).toBeInTheDocument();
      expect(screen.getByText('Partly cloudy')).toBeInTheDocument();
      expect(screen.getByText('°C')).toBeInTheDocument();
      expect(screen.getByText('Feels 19° · H 24° L 15°')).toBeInTheDocument();
      expect(screen.getByTitle('Humidity')).toHaveTextContent('63%');
      expect(screen.getByTitle('Wind')).toHaveTextContent('14 km/h');
      expect(fetchWeather).toHaveBeenCalledWith('Cape Town', 'metric', expect.any(AbortSignal));
    });

    it('speaks in miles and degrees Fahrenheit for those who ask', async () => {
      show(widgetOf('weather', { location: 'Portland', units: 'imperial' }));

      expect(await screen.findByText('°F')).toBeInTheDocument();
      expect(screen.getByTitle('Wind')).toHaveTextContent('14 mph');
    });

    it('labels the hours on a 24-hour clock', async () => {
      show(widgetOf('weather', { location: 'Cape Town' }), '24h');

      await screen.findByText('Cape Town, South Africa');

      expect(
        [...document.querySelectorAll('.wx-col-time')].map((node) => node.textContent)
      ).toEqual(['00:00', '06:00', '12:00', '15:00', '18:00', '21:00']);
    });

    it('labels the hours on a 12-hour clock, midnight and noon as 12', async () => {
      show(widgetOf('weather', { location: 'Cape Town' }), '12h');

      await screen.findByText('Cape Town, South Africa');

      expect(
        [...document.querySelectorAll('.wx-col-time')].map((node) => node.textContent)
      ).toEqual(['12am', '6am', '12pm', '3pm', '6pm', '9pm']);
    });

    it('marks the hour it is, the hours of daylight, and the hours of rain', async () => {
      show(widgetOf('weather', { location: 'Cape Town' }));
      await screen.findByText('Cape Town, South Africa');

      const columns = [...document.querySelectorAll('.wx-col')];

      expect(columns.map((column) => column.classList.contains('wx-col--now'))).toEqual([
        false,
        false,
        true,
        false,
        false,
        false
      ]);
      expect(columns.map((column) => column.classList.contains('wx-col--day'))).toEqual([
        false,
        true,
        true,
        true,
        false,
        false
      ]);
      expect(columns[1]).toHaveClass('wx-col--dawn');
      expect(columns[3]).toHaveClass('wx-col--dusk');
      expect(columns[2]).toHaveClass('wx-col--rain');
    });

    it('shows the days ahead only when the widget is wide enough to hold them', async () => {
      const { unmount } = show(widgetOf('weather', { location: 'Narrow', width: 4 }));
      await screen.findByText('Cape Town, South Africa');

      expect(document.querySelector('.wx-days')).toBeNull();

      unmount();
      show(widgetOf('weather', { location: 'Wide', width: 6 }));
      await screen.findByText('Cape Town, South Africa');

      const days = within(document.querySelector<HTMLElement>('.wx-days')!).getAllByRole(
        'listitem'
      );

      expect(days).toHaveLength(2);
      expect(days[0]).toHaveTextContent('Tue');
      expect(days[0]).toHaveTextContent('25° 14°');
      expect(days[1]).toHaveTextContent('Wed');
    });

    it('shows no days when there are none to show, however wide', async () => {
      vi.mocked(fetchWeather).mockResolvedValue({ ...report, days: [] });
      show(widgetOf('weather', { location: 'Wide', width: 12 }));
      await screen.findByText('Cape Town, South Africa');

      expect(document.querySelector('.wx-days')).toBeNull();
    });

    it('names a place by its name alone when the country is not known', async () => {
      vi.mocked(fetchWeather).mockResolvedValue({
        ...report,
        place: { ...report.place, name: 'Atlantis', country: '' }
      });
      show(widgetOf('weather', { location: 'Atlantis' }));

      expect(await screen.findByText('Atlantis')).toBeInTheDocument();
    });

    it('says what went wrong, and tries again on request', async () => {
      vi.mocked(fetchWeather).mockRejectedValueOnce(new Error('Weather didn’t answer.'));
      show(widgetOf('weather', { location: 'Cape Town' }));

      expect(await screen.findByRole('alert')).toHaveTextContent('Weather didn’t answer.');

      await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

      expect(await screen.findByText('Cape Town, South Africa')).toBeInTheDocument();
      expect(fetchWeather).toHaveBeenCalledTimes(2);
    });
  });

  describe('Hacker News', () => {
    const stories: Story[] = [
      {
        id: 101,
        title: 'A fast new compiler',
        url: 'https://example.com/compiler',
        host: 'example.com',
        score: 412,
        comments: 88,
        time: Math.floor(Date.now() / 1000) - 3 * 3600,
        by: 'ada'
      },
      {
        id: 102,
        title: 'Why we left the cloud',
        url: 'https://blog.example.org/cloud',
        host: 'blog.example.org',
        score: 230,
        comments: 340,
        time: Math.floor(Date.now() / 1000) - 20 * 60,
        by: 'grace'
      }
    ];

    it('shimmers while it waits', () => {
      vi.mocked(fetchTopStories).mockReturnValue(new Promise(() => undefined));
      show(widgetOf('hackernews', { count: 8 }));

      expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
    });

    it('lists the stories in order, with their score, discussion and age', async () => {
      vi.mocked(fetchTopStories).mockResolvedValue(stories);
      show(widgetOf('hackernews', { count: 2 }));

      const items = await screen.findAllByRole('listitem');

      expect(items).toHaveLength(2);
      expect(items[0]).toHaveTextContent('1');
      expect(within(items[0]!).getByRole('link', { name: 'A fast new compiler' })).toHaveAttribute(
        'href',
        'https://example.com/compiler'
      );
      expect(items[0]).toHaveTextContent('example.com');
      expect(items[0]).toHaveTextContent('412');
      expect(items[0]).toHaveTextContent('3h');
      expect(within(items[0]!).getByRole('link', { name: /88/ })).toHaveAttribute(
        'href',
        'https://news.ycombinator.com/item?id=101'
      );
      expect(items[1]).toHaveTextContent('2');
      expect(items[1]).toHaveTextContent('20m');
      expect(fetchTopStories).toHaveBeenCalledWith(2, expect.any(AbortSignal));
    });

    it('opens stories in the same tab, or in a new one if the board does', async () => {
      vi.mocked(fetchTopStories).mockResolvedValue(stories);
      const { unmount } = show(widgetOf('hackernews', { count: 2 }), '24h', false);

      const link = await screen.findByRole('link', { name: 'A fast new compiler' });
      expect(link).not.toHaveAttribute('target');
      expect(link).toHaveAttribute('rel', 'noreferrer noopener');

      unmount();
      window.localStorage.clear();
      show(widgetOf('hackernews', { count: 2 }), '24h', true);

      expect(await screen.findByRole('link', { name: 'A fast new compiler' })).toHaveAttribute(
        'target',
        '_blank'
      );
    });

    it('says what went wrong, and tries again on request', async () => {
      vi.mocked(fetchTopStories).mockRejectedValueOnce(new Error('Hacker News didn’t answer.'));
      vi.mocked(fetchTopStories).mockResolvedValueOnce(stories);
      show(widgetOf('hackernews', { count: 2 }));

      expect(await screen.findByRole('alert')).toHaveTextContent('Hacker News didn’t answer.');

      await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

      expect(
        await screen.findByRole('link', { name: 'Why we left the cloud' })
      ).toBeInTheDocument();
    });
  });

  describe('when there is nothing to show', () => {
    it('says nothing is ranked when BenchLM has no models', async () => {
      vi.mocked(fetchRankings).mockResolvedValue({ models: [] } as never);
      show(widgetOf('benchlm', { creator: '' }));

      expect(await screen.findByText('Nothing is ranked.')).toBeInTheDocument();
    });

    it('says which lab has no ranked models, when one was asked for', async () => {
      vi.mocked(fetchRankings).mockResolvedValue({ models: [] } as never);
      show(widgetOf('benchlm', { creator: '  Acme  ' }));

      expect(await screen.findByText('No models from “Acme” are ranked.')).toBeInTheDocument();
    });

    it('says nothing is trending on GitHub, when nothing is', async () => {
      vi.mocked(fetchTrending).mockResolvedValue({ repos: [], publishedAt: 0 } as never);
      show(widgetOf('github'));

      expect(await screen.findByText('Nothing is trending here right now.')).toBeInTheDocument();
    });

    it('says nothing is trending in TV, when nothing is', async () => {
      vi.mocked(fetchShows).mockResolvedValue([]);
      show(widgetOf('tv'));

      expect(await screen.findByText('Nothing is trending right now.')).toBeInTheDocument();
    });

    it('asks for a symbol or two when the markets widget has none', () => {
      show(widgetOf('markets', { symbols: [] }));

      expect(
        screen.getByText('Add a symbol or two in this widget’s settings.')
      ).toBeInTheDocument();
    });
  });

  it('shows a clock, in the format the board uses', () => {
    show(widgetOf('clock', { zones: [{ zone: 'UTC', label: 'Home' }] }), '24h');

    expect(screen.getByText('Home')).toBeInTheDocument();
  });
});
