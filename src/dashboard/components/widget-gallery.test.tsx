import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FOCUS_KEY } from '../lib/focus';
import { WIDGET_BLURBS, WIDGET_LABELS, WIDGET_TYPES, type WidgetType } from '../lib/model';
import { WidgetPicker } from './widget-gallery';

const open = (props: Partial<Parameters<typeof WidgetPicker>[0]> = {}) => {
  const onPick = vi.fn();
  const onClose = vi.fn();
  render(<WidgetPicker onPick={onPick} onClose={onClose} {...props} />);
  return { onPick, onClose };
};

/** The cards' own names, in order; the examples draw headings of their own too. */
const names = (): (string | null)[] =>
  Array.from(document.querySelectorAll('.gallery-name'), (name) => name.textContent);

const card = (type: WidgetType): HTMLElement =>
  screen.getByRole('heading', { name: WIDGET_LABELS[type], level: 3 }).closest('li')!;

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn(() => Promise.reject(new Error('The gallery went to the network.')));
  vi.stubGlobal('fetch', fetchMock);
  window.localStorage.clear();
  document.title = 'Home';
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('WidgetPicker', () => {
  describe('the gallery', () => {
    it('is a dialog titled Add a widget, saying the examples run on sample data', () => {
      open();

      const dialog = screen.getByRole('dialog', { name: 'Add a widget' });
      expect(within(dialog).getByText(/sample data/)).toBeInTheDocument();
    });

    it('has a card for every kind of widget, with its name, what it does and an Add button', () => {
      open();

      expect(names()).toEqual(WIDGET_TYPES.map((type) => WIDGET_LABELS[type]));

      for (const type of WIDGET_TYPES) {
        const item = card(type);

        expect(within(item).getByText(WIDGET_BLURBS[type])).toBeInTheDocument();
        expect(
          within(item).getByRole('button', { name: `Add ${WIDGET_LABELS[type]}` })
        ).toBeVisible();
      }
    });

    it('shows each widget working, in a group named for it', () => {
      open();

      for (const type of WIDGET_TYPES) {
        expect(
          within(card(type)).getByRole('group', { name: `${WIDGET_LABELS[type]}, an example` })
        ).toBeInTheDocument();
      }
    });

    it('closes from its close button', async () => {
      const { onClose } = open();

      await userEvent.click(screen.getByRole('button', { name: 'Close' }));

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('closes on Escape', async () => {
      const { onClose } = open();

      await userEvent.keyboard('{Escape}');

      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('adding', () => {
    it.each(WIDGET_TYPES)(
      'hands over a %s widget from its Add button, and nothing else',
      async (type) => {
        const { onPick, onClose } = open();

        await userEvent.click(
          within(card(type)).getByRole('button', { name: `Add ${WIDGET_LABELS[type]}` })
        );

        expect(onPick).toHaveBeenCalledExactlyOnceWith(type);
        expect(onClose).not.toHaveBeenCalled();
      }
    );

    it('does not add by clicking the example itself', async () => {
      const { onPick } = open();

      await userEvent.click(within(card('markets')).getByText('SPY'));
      await userEvent.click(within(card('clock')).getByText('New York'));

      expect(onPick).not.toHaveBeenCalled();
    });
  });

  describe('which widgets', () => {
    it('offers only the widgets whose extensions are on', () => {
      open({ types: ['weather', 'tv'] });

      expect(names()).toEqual([WIDGET_LABELS.weather, WIDGET_LABELS.tv]);
      expect(screen.queryByRole('button', { name: `Add ${WIDGET_LABELS.clock}` })).toBeNull();
    });

    it('keeps the order it was given', () => {
      open({ types: ['tv', 'weather', 'clock'] });

      expect(names()).toEqual([WIDGET_LABELS.tv, WIDGET_LABELS.weather, WIDGET_LABELS.clock]);
    });

    it('says where to turn widgets back on when none are', () => {
      open({ types: [] });

      expect(screen.getByText(/Every widget is turned off/)).toBeInTheDocument();
      expect(screen.getByText(/Extensions, in the side bar/)).toBeInTheDocument();
      expect(screen.queryByRole('list')).toBeNull();
    });
  });

  describe('the examples', () => {
    it('are the real widgets on their data: no loading, no complaint, in any card', async () => {
      open();

      await waitFor(() => expect(screen.getByText('Harbour Lights')).toBeInTheDocument());
      expect(screen.queryByRole('status', { name: 'Loading' })).toBeNull();
      expect(screen.queryByRole('alert')).toBeNull();
    });

    it('show their data, from weather to leaderboards', () => {
      open();

      expect(within(card('weather')).getByText('Cape Town, South Africa')).toBeInTheDocument();
      expect(within(card('markets')).getByText('S&P 500')).toBeInTheDocument();
      expect(within(card('clock')).getByText('Tokyo')).toBeInTheDocument();
      expect(within(card('focus')).getByRole('timer')).toHaveTextContent('25:00');
      expect(within(card('calendar')).getByRole('grid', { name: 'This month' })).toBeVisible();
      expect(within(card('agenda')).getByText('Design review')).toBeInTheDocument();
      expect(within(card('hackernews')).getByText(/A tiny database/)).toBeInTheDocument();
      expect(within(card('github')).getByText('tidepool')).toBeInTheDocument();
      expect(
        within(card('prs')).getByText('Cache the search index between visits')
      ).toBeInTheDocument();
      expect(within(card('benchlm')).getByText('Aurora 4 Ultra')).toBeInTheDocument();
      expect(within(card('tv')).getByText('Harbour Lights')).toBeInTheDocument();
      expect(within(card('movies')).getByText('Afterglow')).toBeInTheDocument();
    });

    it('show the agenda with something happening now', () => {
      open();

      expect(within(card('agenda')).getByText('Now')).toBeInTheDocument();
    });

    it('keep to the hours the visitor reads the board in', () => {
      const { unmount } = render(<WidgetPicker clock="12h" onPick={vi.fn()} onClose={vi.fn()} />);
      expect(within(card('clock')).getAllByText(/\d:\d\d\s?[AP]M/i).length).toBeGreaterThan(0);
      unmount();

      open({ clock: '24h' });
      expect(within(card('clock')).queryAllByText(/[AP]M/i)).toHaveLength(0);
    });

    it('can be used: the agenda turns its month', async () => {
      open();
      const agenda = within(card('agenda'));
      const month = (): string => card('agenda').querySelector('.agenda-name')!.textContent!;
      const before = month();

      await userEvent.click(agenda.getByRole('button', { name: 'Next month' }));

      expect(month()).not.toBe(before);
    });

    it('can be used: the focus timer starts and pauses', async () => {
      open();
      const focus = within(card('focus'));

      await userEvent.click(focus.getByRole('button', { name: /Start/ }));
      expect(focus.getByRole('button', { name: /Pause/ })).toBeInTheDocument();

      await userEvent.click(focus.getByRole('button', { name: /Pause/ }));
      expect(focus.getByRole('button', { name: /Resume/ })).toBeInTheDocument();
    });
  });

  describe('running them costs nothing', () => {
    it('asks the network for nothing, all of them at once', async () => {
      open();
      await waitFor(() => expect(screen.getByText('Harbour Lights')).toBeInTheDocument());
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('asks again for nothing when a reading would have gone stale, a long day on', async () => {
      // The widgets that tick by the minute would make this a thousand renders; they read no data.
      vi.useFakeTimers({ toFake: ['setTimeout', 'setInterval', 'Date'] });
      open({
        types: ['weather', 'markets', 'hackernews', 'github', 'prs', 'benchlm', 'tv', 'movies']
      });
      await vi.advanceTimersByTimeAsync(13 * 60 * 60 * 1000);
      vi.useRealTimers();

      expect(fetchMock).not.toHaveBeenCalled();
      expect(screen.getByText('Cape Town, South Africa')).toBeInTheDocument();
    });

    it('keeps nothing in the page’s storage, where the real widgets keep their readings', () => {
      open();

      expect(
        Object.keys(window.localStorage).filter((key) => key.startsWith('dashboard-cache:'))
      ).toEqual([]);
    });

    it('leaves a real reading in the cache as it was, and shows the example instead', () => {
      window.localStorage.setItem(
        'dashboard-cache:hackernews:6',
        JSON.stringify({ at: Date.now(), data: [] })
      );
      open();

      expect(within(card('hackernews')).getByText(/A tiny database/)).toBeInTheDocument();
      expect(JSON.parse(window.localStorage.getItem('dashboard-cache:hackernews:6')!).data).toEqual(
        []
      );
    });

    it('leaves the page’s focus timer, and its title, alone when the example is used', async () => {
      open();

      await userEvent.click(within(card('focus')).getByRole('button', { name: /Start/ }));

      expect(window.localStorage.getItem(FOCUS_KEY)).toBeNull();
      expect(document.title).toBe('Home');
    });
  });

  describe('the links in an example', () => {
    it('go nowhere: none has an address to follow', async () => {
      open();

      await waitFor(() => expect(screen.getByText('Harbour Lights')).toBeInTheDocument());
      const dialog = screen.getByRole('dialog');

      expect(dialog.querySelectorAll('a').length).toBeGreaterThan(20);
      expect(dialog.querySelectorAll('a[href]')).toHaveLength(0);
    });

    it('stay that way when a widget draws more of them, or changes where they point', async () => {
      open();
      const agenda = within(card('agenda'));

      // The agenda's "Open Google Calendar" points at the day chosen; choosing another moves it.
      await userEvent.click(agenda.getAllByRole('gridcell')[10]!.querySelector('button')!);

      await waitFor(() =>
        expect(screen.getByRole('dialog').querySelectorAll('a[href]')).toHaveLength(0)
      );
    });

    it('do not take the page anywhere when clicked', async () => {
      open();
      const before = window.location.href;

      await userEvent.click(within(card('hackernews')).getByText(/A tiny database/));
      await userEvent.click(within(card('markets')).getByText('SPY'));

      expect(window.location.href).toBe(before);
    });
  });
});
