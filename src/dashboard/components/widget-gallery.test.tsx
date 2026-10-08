import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FOCUS_KEY } from '../lib/focus';
import { GALLERY_GROUPS, PACKS } from '../lib/gallery';
import { WIDGET_BLURBS, WIDGET_LABELS, WIDGET_TYPES, type WidgetType } from '../lib/model';
import { WidgetPicker, type WidgetPick } from './widget-gallery';

const open = (props: Partial<Parameters<typeof WidgetPicker>[0]> = {}) => {
  const onPick = vi.fn();
  const onClose = vi.fn();
  render(<WidgetPicker onPick={onPick} onClose={onClose} {...props} />);
  return { onPick, onClose };
};

/** The gallery with starter packs on offer, and something to hand them to. */
const openWithPacks = (props: Partial<Parameters<typeof WidgetPicker>[0]> = {}) => {
  const onPickPack = vi.fn();
  return { onPickPack, ...open({ onPickPack, ...props }) };
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

        expect(onPick).toHaveBeenCalledExactlyOnceWith({ type, stay: false });
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

  describe('starter packs', () => {
    const packCard = (name: string): HTMLElement =>
      screen.getByRole('heading', { name, level: 4 }).closest('li')!;

    it('are offered, each with what it says, what is in it, and one button to add it all', () => {
      openWithPacks();

      expect(screen.getByRole('region', { name: 'Starter packs' })).toBeInTheDocument();

      for (const pack of PACKS) {
        const item = packCard(pack.name);

        expect(within(item).getByText(pack.blurb)).toBeInTheDocument();
        expect(within(item).getByRole('list', { name: `In ${pack.name}` })).toBeInTheDocument();
        expect(
          within(item).getByRole('button', { name: `Add the ${pack.name} pack` })
        ).toBeVisible();
      }
    });

    it('name each widget in them, by its own name', () => {
      openWithPacks();

      const parts = within(packCard('Dev morning')).getAllByRole('listitem');

      expect(parts.map((part) => part.textContent)).toEqual([
        'My PRs',
        'GitHub Trending',
        'Hacker News'
      ]);
    });

    it('say “Add all” with how many, and just “Add” for a pack of one', () => {
      openWithPacks();

      expect(within(packCard('Dev morning')).getByRole('button')).toHaveTextContent('Add all 3');
      expect(within(packCard('Crypto watch')).getByRole('button')).toHaveTextContent(/^Add$/);
    });

    it('are handed over whole when added, and the gallery is not closed by it', async () => {
      const { onPickPack, onClose } = openWithPacks();

      await userEvent.click(
        within(packCard('Planner')).getByRole('button', { name: 'Add the Planner pack' })
      );

      expect(onPickPack).toHaveBeenCalledExactlyOnceWith({
        pack: PACKS.find((pack) => pack.id === 'planner'),
        stay: false
      });
      expect(onClose).not.toHaveBeenCalled();
    });

    it('are left out when something in them is turned off', () => {
      openWithPacks({ types: WIDGET_TYPES.filter((type) => type !== 'prs') });

      expect(screen.queryByRole('heading', { name: 'Dev morning', level: 4 })).toBeNull();
      expect(screen.getByRole('heading', { name: 'Planner', level: 4 })).toBeInTheDocument();
    });

    it('are left out altogether when the gallery has nothing to hand them to', () => {
      open();

      expect(screen.queryByRole('region', { name: 'Starter packs' })).toBeNull();
    });

    it('are left out when no widget is turned on, and the gallery says so instead', () => {
      openWithPacks({ types: [] });

      expect(screen.queryByRole('region', { name: 'Starter packs' })).toBeNull();
      expect(screen.getByText(/Every widget is turned off/)).toBeInTheDocument();
    });
  });

  describe('narrowing', () => {
    const chips = (): string[] =>
      within(screen.getByRole('group', { name: 'Show' }))
        .getAllByRole('button')
        .map((chip) => chip.textContent!);
    const chip = (name: string): HTMLElement =>
      within(screen.getByRole('group', { name: 'Show' })).getByRole('button', { name });
    const visibleCards = (): string[] =>
      [...document.querySelectorAll<HTMLElement>('.gallery-card')]
        .filter((item) => !item.hidden)
        .map((item) => item.querySelector('.gallery-name')!.textContent!);

    it('offers all, the packs and each kind of widget, starting with all', () => {
      openWithPacks();

      expect(chips()).toEqual([
        'All',
        'Starter packs',
        ...GALLERY_GROUPS.map((group) => group.label)
      ]);
      expect(chip('All')).toHaveAttribute('aria-pressed', 'true');
      expect(chip('Developer')).toHaveAttribute('aria-pressed', 'false');
    });

    it('shows every widget, and the packs above them, for all', () => {
      openWithPacks();

      expect(visibleCards()).toEqual(WIDGET_TYPES.map((type) => WIDGET_LABELS[type]));
      expect(screen.getByText('Widgets', { selector: 'h3' })).toBeInTheDocument();
    });

    it('shows only the widgets of the kind that was chosen', async () => {
      open();

      await userEvent.click(chip('Developer'));

      expect(visibleCards()).toEqual([
        'Hacker News',
        'GitHub Trending',
        'My PRs',
        'AI Leaderboard'
      ]);
      expect(chip('Developer')).toHaveAttribute('aria-pressed', 'true');
      expect(chip('All')).toHaveAttribute('aria-pressed', 'false');
    });

    it('puts the kinds in the order the widgets are, and gives each widget one kind', async () => {
      open();
      const seen: string[] = [];

      for (const group of GALLERY_GROUPS) {
        await userEvent.click(chip(group.label));
        seen.push(...visibleCards());
      }

      expect(seen.sort()).toEqual(WIDGET_TYPES.map((type) => WIDGET_LABELS[type]).sort());
    });

    it('shows only the packs for the packs, with no widgets under them', async () => {
      openWithPacks();

      await userEvent.click(chip('Starter packs'));

      expect(screen.getByRole('region', { name: 'Starter packs' })).toBeInTheDocument();
      expect(document.querySelector('.gallery')).toBeNull();
      expect(screen.queryByText('Widgets', { selector: 'h3' })).toBeNull();
    });

    it('shows no packs when a kind of widget is chosen', async () => {
      openWithPacks();

      await userEvent.click(chip('Watch'));

      expect(screen.queryByRole('region', { name: 'Starter packs' })).toBeNull();
    });

    it('brings everything back for all', async () => {
      openWithPacks();
      await userEvent.click(chip('Watch'));

      await userEvent.click(chip('All'));

      expect(visibleCards()).toHaveLength(WIDGET_TYPES.length);
      expect(screen.getByRole('region', { name: 'Starter packs' })).toBeInTheDocument();
    });

    it('offers only the kinds that have a widget turned on, and no packs chip without packs', () => {
      open({ types: ['weather', 'clock'] });

      expect(chips()).toEqual(['All', 'Time and notes', 'Everyday']);
    });

    it('keeps what was tried in an example while it is narrowed away', async () => {
      open();
      await userEvent.click(
        within(await customiseWeather()).getByRole('radio', { name: '°F, mph' })
      );
      expect(within(card('weather')).getByText('°F')).toBeInTheDocument();

      await userEvent.click(chip('Watch'));
      await userEvent.click(chip('All'));

      expect(within(card('weather')).getByText('°F')).toBeInTheDocument();
    });

    const customiseWeather = async (): Promise<HTMLElement> => {
      await userEvent.click(
        within(card('weather')).getByRole('button', { name: 'Customise Weather' })
      );
      return screen.getByRole('form', { name: 'Weather options' });
    };

    it('does not offer to add what is narrowed away', async () => {
      open();

      await userEvent.click(chip('Watch'));

      expect(screen.queryByRole('button', { name: 'Add Weather' })).toBeNull();
      expect(screen.getByRole('button', { name: 'Add Popular TV' })).toBeVisible();
    });
  });

  describe('what is on the page', () => {
    it('is marked on the example, once or with how many', () => {
      open({ onBoard: { weather: 1, clock: 3 } });

      expect(within(card('weather')).getByText('On this page')).toBeInTheDocument();
      expect(within(card('clock')).getByText('3 on this page')).toBeInTheDocument();
      expect(within(card('markets')).queryByText(/on this page/i)).toBeNull();
    });

    it('is not marked for none', () => {
      open({ onBoard: { weather: 0 } });

      expect(screen.queryByText(/on this page/i)).toBeNull();
    });

    it('is not part of a widget’s name', () => {
      open({ onBoard: { weather: 1 } });

      expect(screen.getByRole('heading', { name: 'Weather', level: 3 })).toBeInTheDocument();
    });
  });

  describe('keeping the gallery open', () => {
    const toggle = (): HTMLElement =>
      screen.getByRole('switch', { name: 'Keep open after adding' });

    it('is off until it is asked for', () => {
      open();

      expect(toggle()).not.toBeChecked();
    });

    it('hands over that the gallery stays, for a widget and for a pack, once it is on', async () => {
      const { onPick, onPickPack } = openWithPacks();
      await userEvent.click(toggle());

      await userEvent.click(within(card('weather')).getByRole('button', { name: 'Add Weather' }));
      await userEvent.click(screen.getByRole('button', { name: 'Add the Planner pack' }));

      expect(onPick).toHaveBeenCalledExactlyOnceWith({ type: 'weather', stay: true });
      expect(onPickPack).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ stay: true }));
    });

    it('can be turned off again', async () => {
      const { onPick } = open();
      await userEvent.click(toggle());
      await userEvent.click(toggle());

      await userEvent.click(within(card('weather')).getByRole('button', { name: 'Add Weather' }));

      expect(onPick).toHaveBeenCalledExactlyOnceWith({ type: 'weather', stay: false });
    });

    it('can add again and again, each time as it was set then', async () => {
      const { onPick } = open();
      await userEvent.click(toggle());

      await userEvent.click(within(card('tv')).getByRole('button', { name: 'Add Popular TV' }));
      await userEvent.click(within(card('tv')).getByRole('button', { name: 'Add Popular TV' }));

      expect(onPick).toHaveBeenCalledTimes(2);
    });

    it('says aloud what was added, since nothing else changes', async () => {
      openWithPacks();
      const status = (): string => screen.getByRole('status').textContent!;
      expect(status()).toBe('');

      await userEvent.click(within(card('weather')).getByRole('button', { name: 'Add Weather' }));
      expect(status()).toBe('Added Weather');

      await userEvent.click(screen.getByRole('button', { name: 'Add the Dev morning pack' }));
      expect(status()).toBe('Added Dev morning');
    });
  });

  describe('customising an example', () => {
    const customise = async (type: WidgetType): Promise<HTMLElement> => {
      await userEvent.click(
        within(card(type)).getByRole('button', { name: `Customise ${WIDGET_LABELS[type]}` })
      );
      return screen.getByRole('form', { name: `${WIDGET_LABELS[type]} options` });
    };
    const pickOf = (onPick: ReturnType<typeof vi.fn>): WidgetPick =>
      onPick.mock.lastCall![0] as WidgetPick;
    const add = (type: WidgetType) =>
      userEvent.click(
        within(card(type)).getByRole('button', { name: `Add ${WIDGET_LABELS[type]}` })
      );

    it('keeps the options closed until they are asked for, and says whether they are open', async () => {
      open();
      const button = within(card('weather')).getByRole('button', { name: 'Customise Weather' });

      expect(button).toHaveAttribute('aria-expanded', 'false');
      expect(screen.queryByRole('form', { name: 'Weather options' })).toBeNull();

      await userEvent.click(button);
      expect(button).toHaveAttribute('aria-expanded', 'true');
      expect(screen.getByRole('form', { name: 'Weather options' })).toBeInTheDocument();

      await userEvent.click(button);
      expect(screen.queryByRole('form', { name: 'Weather options' })).toBeNull();
    });

    it('has the same settings a widget has in its own dialog, for every kind but the private', async () => {
      open();
      const form = await customise('weather');

      expect(within(form).getByLabelText(/^Place/)).toHaveValue('Cape Town, South Africa');
      expect(within(form).getByRole('radiogroup', { name: 'Units' })).toBeInTheDocument();
      expect(within(form).getByRole('radiogroup', { name: 'Width' })).toBeInTheDocument();
      expect(within(form).queryByRole('radiogroup', { name: 'Height' })).toBeNull();
    });

    it('does not ask for a calendar’s address or a token, which the examples have no use for', async () => {
      open();
      const agenda = await customise('agenda');
      const prs = await customise('prs');

      expect(within(agenda).queryByRole('button', { name: /Add calendar/ })).toBeNull();
      expect(within(prs).queryByLabelText(/GitHub token/)).toBeNull();
      expect(within(prs).queryByLabelText(/Watch main on/)).toBeNull();
    });

    it('does not submit anything, or leave the page, on Enter', async () => {
      const { onPick } = open();
      const form = await customise('weather');

      await userEvent.type(within(form).getByLabelText(/^Place/), '{Enter}');

      expect(onPick).not.toHaveBeenCalled();
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    describe('the example follows the options', () => {
      it('shows the units that were chosen', async () => {
        open();
        const form = await customise('weather');
        expect(within(card('weather')).getByText('°C')).toBeInTheDocument();

        await userEvent.click(within(form).getByRole('radio', { name: '°F, mph' }));

        expect(within(card('weather')).getByText('°F')).toBeInTheDocument();
        expect(within(card('weather')).getByTitle('Wind')).toHaveTextContent('mph');
      });

      it('is of the place that was typed', async () => {
        open();
        const form = await customise('weather');

        await userEvent.clear(within(form).getByLabelText(/^Place/));
        await userEvent.type(within(form).getByLabelText(/^Place/), 'Oslo');

        expect(within(card('weather')).getByText('Oslo')).toBeInTheDocument();
      });

      it('shows as many headlines as it is set to', async () => {
        open();
        const form = await customise('hackernews');
        expect(card('hackernews').querySelectorAll('.hn-item')).toHaveLength(6);

        fireEvent.change(within(form).getByLabelText(/Stories/), { target: { value: '3' } });

        expect(card('hackernews').querySelectorAll('.hn-item')).toHaveLength(3);
      });

      it('shows a token typed by its contract address, among the markets', async () => {
        open();
        const form = await customise('markets');
        await userEvent.click(within(form).getByRole('button', { name: /Add symbol/ }));
        const symbols = within(form).getAllByLabelText('Symbol');

        await userEvent.type(
          symbols[symbols.length - 1]!,
          'DemoMint1111111111111111111111111111111pump'
        );

        expect(within(card('markets')).getByText('DEMO')).toBeInTheDocument();
        expect(within(card('markets')).getByText(/liquidity/)).toBeInTheDocument();
      });

      it('reads the Budget preset, whose price limit needs the price list', async () => {
        open();
        const form = await customise('benchlm');

        await userEvent.click(within(form).getByRole('radio', { name: 'Budget' }));

        await waitFor(() =>
          expect(card('benchlm').querySelectorAll('.bench-item')).toHaveLength(5)
        );
        expect(within(card('benchlm')).queryByText(/No ranked models cost/)).toBeNull();
      });

      it('narrows to what a language has, and says so when it has nothing', async () => {
        open();
        const form = await customise('github');

        await userEvent.clear(within(form).getByLabelText(/Language/));
        await userEvent.type(within(form).getByLabelText(/Language/), 'cobol');

        expect(
          await within(card('github')).findByText('Nothing is trending here right now.')
        ).toBeInTheDocument();
      });
    });

    describe('the width', () => {
      const share = (type: WidgetType): string => card(type).style.getPropertyValue('--share');
      const widen = async (type: WidgetType, name: string) =>
        userEvent.click(within(await customise(type)).getByRole('radio', { name }));

      it('starts at what a new widget is: a column of the gallery, whole', () => {
        open();

        expect(share('weather')).toBe('1');
        expect(card('weather')).not.toHaveAttribute('data-wide');
      });

      it('makes a narrow widget a narrower example', async () => {
        open();
        await widen('hackernews', '¼');

        expect(share('hackernews')).toBe('0.75');
        expect(card('hackernews')).not.toHaveAttribute('data-wide');
      });

      it('gives a widget of half the board or more the whole gallery, at its share of it', async () => {
        open();
        await widen('weather', '½');
        expect(card('weather')).toHaveAttribute('data-wide');
        expect(share('weather')).toBe('0.5');

        await userEvent.click(
          within(screen.getByRole('form', { name: 'Weather options' })).getByRole('radio', {
            name: 'Full'
          })
        );
        expect(share('weather')).toBe('1');
      });

      it('shows what the width does: the weather’s days to come appear from half the board', async () => {
        open();
        expect(card('weather').querySelector('.wx-days')).toBeNull();

        await widen('weather', '½');

        expect(card('weather').querySelector('.wx-days')).not.toBeNull();
      });

      it('does not widen the other cards', async () => {
        open();
        await widen('weather', '½');

        expect(card('hackernews')).not.toHaveAttribute('data-wide');
        expect(share('hackernews')).toBe('1');
      });
    });

    describe('what Add hands over', () => {
      it('is just the kind, for an example whose options were never used', async () => {
        const { onPick } = open();

        await add('weather');

        expect(pickOf(onPick)).toEqual({ type: 'weather', stay: false });
      });

      it('is just the kind, though the options were opened and closed again', async () => {
        const { onPick } = open();
        await customise('weather');
        await userEvent.click(
          within(card('weather')).getByRole('button', { name: 'Customise Weather' })
        );

        await add('weather');

        expect(pickOf(onPick)).toEqual({ type: 'weather', stay: false });
      });

      it('is the widget as it was set, once the options are used', async () => {
        const { onPick } = open();
        const form = await customise('weather');

        await userEvent.click(within(form).getByRole('radio', { name: '°F, mph' }));
        await userEvent.click(within(form).getByRole('radio', { name: '½' }));
        await add('weather');

        expect(pickOf(onPick)).toMatchObject({
          type: 'weather',
          settings: {
            type: 'weather',
            units: 'imperial',
            width: 6,
            location: 'Cape Town, South Africa'
          }
        });
      });

      it('has the settings tidied, as a dialog’s are when it saves', async () => {
        const { onPick } = open();
        const form = await customise('weather');

        await userEvent.clear(within(form).getByLabelText(/^Place/));
        await userEvent.type(within(form).getByLabelText(/^Place/), '  Oslo  ');
        await add('weather');

        expect(pickOf(onPick).settings).toMatchObject({ location: 'Oslo' });
      });

      it('leaves behind the example’s own tasks, note, calendars and token', async () => {
        const { onPick } = open();

        await userEvent.click(
          within(await customise('notes')).getByRole('radio', { name: 'Note' })
        );
        await add('notes');
        expect(pickOf(onPick).settings).toMatchObject({
          type: 'notes',
          mode: 'text',
          items: [],
          text: ''
        });

        await userEvent.click(
          within(await customise('agenda')).getByRole('radio', { name: 'List only' })
        );
        await add('agenda');
        expect(pickOf(onPick).settings).toMatchObject({
          type: 'agenda',
          month: false,
          calendars: []
        });

        await userEvent.click(within(await customise('prs')).getByRole('radio', { name: 'Mine' }));
        await add('prs');
        expect(pickOf(onPick).settings).toMatchObject({
          type: 'prs',
          show: 'mine',
          token: '',
          repo: ''
        });
      });

      it('is one card’s own, not another’s', async () => {
        const { onPick } = open();
        fireEvent.change(within(await customise('hackernews')).getByLabelText(/Stories/), {
          target: { value: '11' }
        });

        await add('github');
        expect(pickOf(onPick)).toEqual({ type: 'github', stay: false });

        await add('hackernews');
        expect(pickOf(onPick).settings).toMatchObject({ type: 'hackernews', count: 11 });
      });

      it('can be handed over again, each time as it was set then', async () => {
        const { onPick } = open();
        const form = await customise('tv');

        await add('tv');
        await userEvent.click(within(form).getByRole('radio', { name: 'Today' }));
        await add('tv');

        expect(onPick.mock.calls.map((call) => (call[0] as WidgetPick).settings)).toEqual([
          undefined,
          expect.objectContaining({ window: 'day' })
        ]);
      });

      it('is not touched by using the example itself: a task added to the Notes example stays there', async () => {
        const { onPick } = open();

        await userEvent.type(
          within(card('notes')).getByLabelText('Add a task'),
          'My own task{Enter}'
        );
        expect(within(card('notes')).getByText('My own task')).toBeInTheDocument();
        await add('notes');

        expect(pickOf(onPick)).toEqual({ type: 'notes', stay: false });
      });
    });

    describe('what cannot be added', () => {
      it('is a weather widget with no place, which says so and cannot be added', async () => {
        const { onPick } = open();
        const form = await customise('weather');

        await userEvent.clear(within(form).getByLabelText(/^Place/));

        expect(within(form).getByRole('alert')).toHaveTextContent('Choose a place.');
        const button = within(card('weather')).getByRole('button', { name: 'Add Weather' });
        expect(button).toBeDisabled();
        await userEvent.click(button);
        expect(onPick).not.toHaveBeenCalled();
      });

      it('can be added again once it is mended', async () => {
        const { onPick } = open();
        const form = await customise('weather');
        await userEvent.clear(within(form).getByLabelText(/^Place/));

        await userEvent.type(within(form).getByLabelText(/^Place/), 'Oslo');

        expect(within(form).queryByRole('alert')).toBeNull();
        await add('weather');
        expect(pickOf(onPick).settings).toMatchObject({ location: 'Oslo' });
      });

      it('is a clock with a zone that does not exist, which names it', async () => {
        open();
        const form = await customise('clock');

        await userEvent.clear(within(form).getAllByLabelText('Time zone')[0]!);
        await userEvent.type(within(form).getAllByLabelText('Time zone')[0]!, 'Mars/Olympus');

        expect(within(form).getByRole('alert')).toHaveTextContent('“Mars/Olympus” isn’t a place');
        expect(
          within(card('clock')).getByRole('button', { name: 'Add World clock' })
        ).toBeDisabled();
      });

      it.each([
        ['agenda', 'List only', 'Add Agenda'],
        ['prs', 'Mine', 'Add My PRs']
      ] as const)(
        'is not stopped by the %s example’s own calendars or token, which are never added',
        async (type, option, button) => {
          open();
          const form = await customise(type);

          await userEvent.click(within(form).getByRole('radio', { name: option }));

          expect(within(form).queryByRole('alert')).toBeNull();
          expect(within(card(type)).getByRole('button', { name: button })).toBeEnabled();
        }
      );

      it('says nothing of a problem before the options are used', async () => {
        open();
        await customise('weather');

        expect(screen.queryByRole('alert')).toBeNull();
      });
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

    it('show My PRs with a light for the build on main, in the corner, with nowhere to go', () => {
      open();

      // Without its address it is no longer a link, only a light.
      const light = within(card('prs')).getByLabelText('acme/web main: checks passing');
      expect(light).toHaveAttribute('data-state', 'passing');
      expect(light.closest('.gallery-light')).not.toBeNull();
      // Its link goes nowhere, like the rest of an example's.
      expect(light).not.toHaveAttribute('href');
      expect(within(card('weather')).queryByLabelText(/checks/)).toBeNull();
      expect(document.querySelectorAll('.gallery-light')).toHaveLength(1);
      expect(fetchMock).not.toHaveBeenCalled();
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
