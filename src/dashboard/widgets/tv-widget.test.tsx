import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createWidget, type Widget, type WidgetType } from '../lib/model';
import { fetchMovies, fetchShows, type Title } from '../lib/tmdb';
import { WidgetView } from './widget-view';

vi.mock('../lib/tmdb', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/tmdb')>()),
  fetchShows: vi.fn(),
  fetchMovies: vi.fn()
}));

const title = (id: number, name: string, extra: Partial<Title> = {}): Title => ({
  id,
  name,
  year: '2026',
  rating: 7.9,
  votes: 12,
  overview: '',
  poster: `https://image.tmdb.org/t/p/w92/${id}.jpg`,
  url: `https://www.themoviedb.org/tv/${id}`,
  ...extra
});

const widgetOf = <T extends WidgetType>(
  type: T,
  patch: Partial<Extract<Widget, { type: T }>> = {}
): Extract<Widget, { type: T }> =>
  ({ ...createWidget(type), ...patch }) as Extract<Widget, { type: T }>;

const show = (widget: Widget, newTab = false) =>
  render(<WidgetView widget={widget} clock="24h" newTab={newTab} />);

beforeEach(() => {
  vi.mocked(fetchShows).mockReset();
  vi.mocked(fetchMovies).mockReset();
});

describe('Popular TV', () => {
  it('lists the shows with their year and rating, linked to TMDB, as many as it is set to', async () => {
    vi.mocked(fetchShows).mockResolvedValue([
      title(1, 'East of Eden'),
      title(2, 'Lanterns', { year: '2025', rating: 8.4 }),
      title(3, 'Third Show')
    ]);
    show(widgetOf('tv', { count: 2 }));

    const link = await screen.findByRole('link', { name: /East of Eden/ });
    expect(link).toHaveAttribute('href', 'https://www.themoviedb.org/tv/1');
    expect(within(link).getByText('2026')).toBeInTheDocument();
    expect(within(link).getByText('7.9')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Lanterns/ })).toHaveTextContent('8.4');
    expect(screen.queryByText('Third Show')).not.toBeInTheDocument();
    expect(fetchShows).toHaveBeenCalledWith('week', 20, expect.any(AbortSignal));
    expect(fetchMovies).not.toHaveBeenCalled();
  });

  it('asks for the window it is set to', async () => {
    vi.mocked(fetchShows).mockResolvedValue([title(1, 'East of Eden')]);
    show(widgetOf('tv', { window: 'day' }));

    await screen.findByText('East of Eden');

    expect(fetchShows).toHaveBeenCalledWith('day', 20, expect.any(AbortSignal));
  });

  it('shows a poster where there is one, and a symbol where there is not', async () => {
    vi.mocked(fetchShows).mockResolvedValue([
      title(1, 'With Poster'),
      title(2, 'No Poster', { poster: '' })
    ]);
    const { container } = show(createWidget('tv'));

    await screen.findByText('With Poster');

    expect(container.querySelectorAll('img.tv-poster')).toHaveLength(1);
    expect(container.querySelectorAll('.tv-poster--none')).toHaveLength(1);
  });

  it('leaves out a rating nobody has voted for yet, and a year it does not have', async () => {
    vi.mocked(fetchShows).mockResolvedValue([
      title(1, 'Brand New', { votes: 0, rating: 0, year: '' })
    ]);
    show(createWidget('tv'));

    const link = await screen.findByRole('link', { name: /Brand New/ });

    expect(link).not.toHaveTextContent('0.0');
    expect(link.querySelector('.tv-meta')).toBeEmptyDOMElement();
  });

  it('opens links in a new tab when the board does, and credits TMDB', async () => {
    vi.mocked(fetchShows).mockResolvedValue([title(1, 'East of Eden')]);
    show(createWidget('tv'), true);

    expect(await screen.findByRole('link', { name: /East of Eden/ })).toHaveAttribute(
      'target',
      '_blank'
    );
    expect(screen.getByRole('link', { name: 'TMDB' })).toHaveAttribute('target', '_blank');
    expect(screen.getByText(/not endorsed or certified by TMDB/)).toBeInTheDocument();
  });

  it('says nothing is trending, when nothing is', async () => {
    vi.mocked(fetchShows).mockResolvedValue([]);
    show(createWidget('tv'));

    expect(await screen.findByText('Nothing is trending right now.')).toBeInTheDocument();
  });

  it('says what went wrong, and tries again on request', async () => {
    vi.mocked(fetchShows).mockRejectedValueOnce(new Error('TMDB didn’t answer.'));
    vi.mocked(fetchShows).mockResolvedValueOnce([title(1, 'East of Eden')]);
    show(createWidget('tv'));

    expect(await screen.findByRole('alert')).toHaveTextContent('TMDB didn’t answer.');

    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('link', { name: /East of Eden/ })).toBeInTheDocument();
  });

  it('gives a narrow card room for a long name, and a wide one its single line', async () => {
    vi.mocked(fetchShows).mockResolvedValue([title(1, 'East of Eden')]);
    const narrow = show(widgetOf('tv', { width: 2 }));

    await screen.findByText('East of Eden');
    expect(narrow.container.querySelector('.tv')).toHaveAttribute('data-narrow');
    narrow.unmount();

    const third = show(widgetOf('tv', { width: 3 }));
    await screen.findByText('East of Eden');
    expect(third.container.querySelector('.tv')).toHaveAttribute('data-narrow');
    third.unmount();

    const wide = show(widgetOf('tv', { width: 4 }));
    await screen.findByText('East of Eden');
    expect(wide.container.querySelector('.tv')).not.toHaveAttribute('data-narrow');
  });
});

describe('Popular Movies', () => {
  it('lists the films with their year and rating, linked to TMDB as films', async () => {
    vi.mocked(fetchMovies).mockResolvedValue([
      title(7, 'The Long Drive', { url: 'https://www.themoviedb.org/movie/7', rating: 6.5 }),
      title(8, 'Second Film', { url: 'https://www.themoviedb.org/movie/8' })
    ]);
    show(widgetOf('movies', { count: 5 }));

    const link = await screen.findByRole('link', { name: /The Long Drive/ });
    expect(link).toHaveAttribute('href', 'https://www.themoviedb.org/movie/7');
    expect(link).toHaveTextContent('6.5');
    expect(screen.getByRole('link', { name: /Second Film/ })).toBeInTheDocument();
    expect(fetchMovies).toHaveBeenCalledWith('week', 20, expect.any(AbortSignal));
    expect(fetchShows).not.toHaveBeenCalled();
  });

  it('asks for the window it is set to, as many as it is set to show', async () => {
    vi.mocked(fetchMovies).mockResolvedValue([title(1, 'One'), title(2, 'Two'), title(3, 'Three')]);
    show(widgetOf('movies', { window: 'day', count: 2 }));

    await screen.findByText('Two');

    expect(fetchMovies).toHaveBeenCalledWith('day', 20, expect.any(AbortSignal));
    expect(screen.queryByText('Three')).not.toBeInTheDocument();
  });

  it('shows a film symbol where a poster is missing', async () => {
    vi.mocked(fetchMovies).mockResolvedValue([title(1, 'No Poster', { poster: '' })]);
    const { container } = show(createWidget('movies'));

    await screen.findByText('No Poster');

    expect(container.querySelector('.tv-poster--none svg.lucide-film')).toBeInTheDocument();
  });

  it('says no film is trending, when none is', async () => {
    vi.mocked(fetchMovies).mockResolvedValue([]);
    show(createWidget('movies'));

    expect(await screen.findByText('No film is trending right now.')).toBeInTheDocument();
  });

  it('says what went wrong, and tries again on request', async () => {
    vi.mocked(fetchMovies).mockRejectedValueOnce(
      new Error('TMDB isn’t set up on this server yet: it needs a TMDB_TOKEN.')
    );
    vi.mocked(fetchMovies).mockResolvedValueOnce([title(1, 'The Long Drive')]);
    show(createWidget('movies'));

    expect(await screen.findByRole('alert')).toHaveTextContent(/TMDB_TOKEN/);

    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('The Long Drive')).toBeInTheDocument();
  });

  it('keeps what it fetched apart from the TV widget’s, even in the same window', async () => {
    vi.mocked(fetchShows).mockResolvedValue([title(1, 'A Show')]);
    vi.mocked(fetchMovies).mockResolvedValue([title(2, 'A Film')]);

    const tv = show(createWidget('tv'));
    await screen.findByText('A Show');
    tv.unmount();

    show(createWidget('movies'));
    expect(await screen.findByText('A Film')).toBeInTheDocument();
    expect(screen.queryByText('A Show')).not.toBeInTheDocument();
  });
});
