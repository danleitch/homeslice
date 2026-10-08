import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createWidget, type NewsWidget as NewsConfig, type Widget } from '../lib/model';
import { fetchNews, type NewsItem } from '../lib/rss';
import { WidgetView } from './widget-view';

vi.mock('../lib/rss', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/rss')>()),
  fetchNews: vi.fn()
}));

const NOW = Date.now() / 1000;
const stories: NewsItem[] = [
  { title: 'First headline', url: 'https://x.test/1', time: NOW - 5 * 60 },
  { title: 'Second headline', url: 'https://x.test/2', time: NOW - 3 * 3600 },
  { title: 'Undated headline', url: 'https://x.test/3', time: 0 },
  { title: 'Fourth headline', url: 'https://x.test/4', time: NOW - 2 * 86400 },
  { title: 'Fifth headline', url: 'https://x.test/5', time: NOW - 3600 },
  { title: 'Sixth headline', url: 'https://x.test/6', time: NOW - 7200 }
];

const widgetOf = (patch: Partial<NewsConfig> = {}): Widget =>
  ({ ...createWidget('news'), ...patch }) as Widget;

const show = (widget: Widget, newTab = false) =>
  render(<WidgetView widget={widget} clock="24h" newTab={newTab} />);

beforeEach(() => {
  vi.mocked(fetchNews).mockReset().mockResolvedValue(stories);
});

describe('the News widget', () => {
  it('shimmers while it waits', () => {
    vi.mocked(fetchNews).mockReturnValue(new Promise(() => undefined));
    show(widgetOf());

    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
  });

  it('asks for the feed it is set to', async () => {
    show(widgetOf({ feed: 'ars' }));
    await screen.findByText('First headline');

    expect(fetchNews).toHaveBeenCalledWith('ars', expect.any(AbortSignal));
  });

  it('asks for the default feed when it was saved with one that is not offered', async () => {
    show(widgetOf({ feed: 'gone' }));
    await screen.findByText('First headline');

    expect(fetchNews).toHaveBeenCalledWith('bbc', expect.any(AbortSignal));
  });

  it('lists the headlines as links, with how long ago each was published', async () => {
    show(widgetOf({ count: 5 }));

    const first = await screen.findByRole('link', { name: 'First headline' });

    expect(first).toHaveAttribute('href', 'https://x.test/1');
    expect(first.closest('li')).toHaveTextContent('5m');
    expect(screen.getByRole('link', { name: 'Second headline' }).closest('li')).toHaveTextContent(
      '3h'
    );
    expect(screen.getByRole('link', { name: 'Fourth headline' }).closest('li')).toHaveTextContent(
      '2d'
    );
  });

  it('shows no time for a headline that has none, rather than “0m”', async () => {
    show(widgetOf());

    const row = (await screen.findByRole('link', { name: 'Undated headline' })).closest('li')!;

    expect(row.querySelector('.nw-time')).toBeNull();
  });

  it('shows as many headlines as it is set to', async () => {
    show(widgetOf({ count: 3 }));
    await screen.findByText('First headline');

    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(screen.queryByText('Fourth headline')).toBeNull();
  });

  it('opens a headline in the same tab, or a new one when the board says', async () => {
    const { unmount } = show(widgetOf(), false);
    expect(await screen.findByRole('link', { name: 'First headline' })).not.toHaveAttribute(
      'target'
    );
    unmount();

    show(widgetOf(), true);
    const link = await screen.findByRole('link', { name: 'First headline' });
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
  });

  it('says whose feed it is, with a link to their page', async () => {
    show(widgetOf({ feed: 'npr' }));

    const link = await screen.findByRole('link', { name: 'NPR News' });

    expect(link).toHaveAttribute('href', 'https://www.npr.org/sections/news/');
    expect(link.closest('p')).toHaveTextContent('From NPR News');
  });

  it('says so when the feed has nothing in it', async () => {
    vi.mocked(fetchNews).mockResolvedValue([]);
    show(widgetOf());

    expect(await screen.findByText('Nothing new in this feed.')).toBeInTheDocument();
  });

  it('says what went wrong, and tries again when asked', async () => {
    vi.mocked(fetchNews).mockRejectedValueOnce(new Error('The feed answered 502.'));
    show(widgetOf({ feed: 'verge' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('The feed answered 502.');
    await userEvent.click(
      within(screen.getByRole('alert')).getByRole('button', { name: 'Try again' })
    );

    await waitFor(() => expect(screen.getByText('First headline')).toBeInTheDocument());
  });

  it('keeps each feed’s headlines apart from another’s', async () => {
    vi.mocked(fetchNews).mockImplementation(async (feed) => [
      { title: `Story from ${feed}`, url: 'https://x.test/1', time: 0 }
    ]);
    const { unmount } = show(widgetOf({ feed: 'wired' }));
    expect(await screen.findByText('Story from wired')).toBeInTheDocument();
    unmount();

    show(widgetOf({ feed: 'lobsters' }));
    expect(await screen.findByText('Story from lobsters')).toBeInTheDocument();
  });
});
