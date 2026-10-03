import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './app';
import {
  COINS_PER_BRANCH,
  KOI_ACCOUNT_STORAGE_KEY,
  buyListing,
  createAccount
} from './lib/koi-account';
import { koiTank } from './lib/koi-market';
import {
  BACKGROUND_STORAGE_KEY,
  DREAMS_MODE_STORAGE_KEY,
  FISH_NAMES_STORAGE_KEY,
  LILY_PLACEMENTS_STORAGE_KEY,
  MAX_FISH_NAMES,
  RECENT_STORAGE_KEY
} from './lib/storage';

// The pond is drawn on a canvas this environment cannot show, so it is stood in for by
// something that keeps what the app hands it where a test can use it.
type PondProps = {
  recentBranches: unknown[];
  baseFishCount: number;
  ownedKoi: { id: string; name: string }[];
  ownedGoldfish: unknown[];
  lilyPlacements: unknown[];
  onLilyPlacementsChange: (placements: unknown[]) => void;
  fishNames: Record<string, string>;
  onRenameFish: (key: string, name: string) => void;
};

const pond = vi.hoisted(() => ({ props: null as unknown }));

vi.mock('./components/koi3d-background', () => ({
  Koi3dBackground: (props: unknown) => {
    pond.props = props;
    return <div data-testid="pond" />;
  }
}));

const pondProps = (): PondProps => pond.props as PondProps;
const DAY = new Date().toISOString().slice(0, 10);

/** Saves an account that has bought the first koi in today's tank, and says which one. */
const ownFirstKoi = (): { id: string; name: string } => {
  const listing = koiTank(DAY)[0]!;
  const { account } = buyListing({ ...createAccount([], DAY), coins: 10_000 }, listing, new Date());
  window.localStorage.setItem(KOI_ACCOUNT_STORAGE_KEY, JSON.stringify(account));
  return listing;
};

describe('App and the pond', () => {
  beforeEach(() => {
    pond.props = null;
  });

  afterEach(() => {
    window.history.replaceState(null, '', '/');
  });

  describe('what the pond is given', () => {
    it('is the koi pond by default', async () => {
      render(<App />);

      expect(await screen.findByTestId('pond')).toBeInTheDocument();
    });

    it('is not shown for another background', async () => {
      window.localStorage.setItem(BACKGROUND_STORAGE_KEY, 'plain');

      render(<App />);

      expect(screen.queryByTestId('pond')).not.toBeInTheDocument();
    });

    it('is given the recent branches, so each can swim as a koi', async () => {
      window.localStorage.setItem(
        RECENT_STORAGE_KEY,
        JSON.stringify([{ value: 'feat/one', createdAt: '2026-10-01T12:00:00.000Z' }])
      );
      render(<App />);
      await screen.findByTestId('pond');

      expect(pondProps().recentBranches).toHaveLength(1);
    });

    it('is given the koi and goldfish the visitor owns', async () => {
      const koi = ownFirstKoi();
      render(<App />);
      await screen.findByTestId('pond');

      expect(pondProps().ownedKoi.map((fish) => fish.id)).toEqual([koi.id]);
      expect(pondProps().ownedGoldfish).toEqual([]);
    });
  });

  describe('lilies', () => {
    it('are remembered where the visitor floated them', async () => {
      render(<App />);
      await screen.findByTestId('pond');

      act(() => pondProps().onLilyPlacementsChange([{ x: 0.5, y: 0.25 }]));

      await waitFor(() =>
        expect(JSON.parse(window.localStorage.getItem(LILY_PLACEMENTS_STORAGE_KEY)!)).toEqual([
          { x: 0.5, y: 0.25 }
        ])
      );
      expect(pondProps().lilyPlacements).toEqual([{ x: 0.5, y: 0.25 }]);
    });

    it('come back from where they were left', async () => {
      window.localStorage.setItem(
        LILY_PLACEMENTS_STORAGE_KEY,
        JSON.stringify([{ x: 0.3, y: 0.4 }])
      );
      render(<App />);
      await screen.findByTestId('pond');

      expect(pondProps().lilyPlacements).toEqual([{ x: 0.3, y: 0.4 }]);
    });
  });

  describe('naming fish', () => {
    it('keeps the name of a branch koi against its place in the pond', async () => {
      render(<App />);
      await screen.findByTestId('pond');

      act(() => pondProps().onRenameFish('branch:feat/one', 'Bubbles'));

      expect(pondProps().fishNames).toEqual({ 'branch:feat/one': 'Bubbles' });
      await waitFor(() =>
        expect(JSON.parse(window.localStorage.getItem(FISH_NAMES_STORAGE_KEY)!)).toEqual({
          'branch:feat/one': 'Bubbles'
        })
      );
    });

    it('renames a fish again without keeping the old name', async () => {
      render(<App />);
      await screen.findByTestId('pond');

      act(() => pondProps().onRenameFish('branch:feat/one', 'Bubbles'));
      act(() => pondProps().onRenameFish('branch:feat/one', 'Splash'));

      expect(pondProps().fishNames).toEqual({ 'branch:feat/one': 'Splash' });
    });

    it('keeps names apart for different fish', async () => {
      render(<App />);
      await screen.findByTestId('pond');

      act(() => pondProps().onRenameFish('branch:a', 'One'));
      act(() => pondProps().onRenameFish('resident:2', 'Two'));

      expect(pondProps().fishNames).toEqual({ 'branch:a': 'One', 'resident:2': 'Two' });
    });

    it('remembers only the most recent names, letting the longest untouched go first', async () => {
      render(<App />);
      await screen.findByTestId('pond');

      for (let fish = 0; fish < MAX_FISH_NAMES + 3; fish += 1) {
        act(() => pondProps().onRenameFish(`branch:${fish}`, `Fish ${fish}`));
      }

      const names = pondProps().fishNames;
      expect(Object.keys(names)).toHaveLength(MAX_FISH_NAMES);
      expect(names['branch:0']).toBeUndefined();
      expect(names['branch:2']).toBeUndefined();
      expect(names['branch:3']).toBe('Fish 3');
      expect(names[`branch:${MAX_FISH_NAMES + 2}`]).toBe(`Fish ${MAX_FISH_NAMES + 2}`);
    });

    it('counts a fish just renamed as the newest, so it is not the first to go', async () => {
      render(<App />);
      await screen.findByTestId('pond');

      act(() => pondProps().onRenameFish('branch:keep', 'Favourite'));
      for (let fish = 0; fish < MAX_FISH_NAMES - 1; fish += 1) {
        act(() => pondProps().onRenameFish(`branch:${fish}`, `Fish ${fish}`));
      }
      act(() => pondProps().onRenameFish('branch:keep', 'Favourite again'));
      act(() => pondProps().onRenameFish('branch:extra', 'Extra'));

      expect(pondProps().fishNames['branch:keep']).toBe('Favourite again');
      expect(pondProps().fishNames['branch:0']).toBeUndefined();
    });

    it('renames a fish bought from the market on the market’s books, not in the pond', async () => {
      const koi = ownFirstKoi();
      render(<App />);
      await screen.findByTestId('pond');

      act(() => pondProps().onRenameFish(`market:${koi.id}`, 'Goldie'));

      expect(pondProps().ownedKoi[0]!.name).toBe('Goldie');
      expect(pondProps().fishNames).toEqual({});
      await waitFor(() =>
        expect(
          JSON.parse(window.localStorage.getItem(KOI_ACCOUNT_STORAGE_KEY)!).owned[0].name
        ).toBe('Goldie')
      );
    });
  });

  describe('the Branchify address', () => {
    const goTo = (hash: string): void => {
      window.history.replaceState(null, '', `/${hash}`);
      fireEvent(window, new HashChangeEvent('hashchange'));
    };

    it('opens Branchify when the address says so, and closes it when it no longer does', async () => {
      render(<App />);
      expect(screen.queryByRole('dialog', { name: /Branchify/ })).not.toBeInTheDocument();

      act(() => goTo('#branchify'));
      expect(await screen.findByRole('dialog', { name: /Branchify/ })).toBeInTheDocument();

      act(() => goTo(''));
      await waitFor(() =>
        expect(screen.queryByRole('dialog', { name: /Branchify/ })).not.toBeInTheDocument()
      );
    });

    it('ignores other addresses', () => {
      render(<App />);

      act(() => goTo('#something-else'));

      expect(screen.queryByRole('dialog', { name: /Branchify/ })).not.toBeInTheDocument();
    });
  });

  describe('the particles', () => {
    beforeEach(() => {
      window.localStorage.setItem(BACKGROUND_STORAGE_KEY, 'particles');
    });

    it('open their controls, and close them again', async () => {
      render(<App />);

      await userEvent.click(screen.getByRole('button', { name: 'Particle settings' }));
      const panel = screen.getByRole('dialog', { name: /particle/i });
      expect(panel).toBeInTheDocument();

      await userEvent.click(within(panel).getByRole('button', { name: /close/i }));
      expect(screen.queryByRole('dialog', { name: /particle/i })).not.toBeInTheDocument();
    });
  });

  describe('the dreams background', () => {
    it('is loaded when chosen, in the mode the visitor left it in', async () => {
      window.localStorage.setItem(BACKGROUND_STORAGE_KEY, 'dreams');
      window.localStorage.setItem(DREAMS_MODE_STORAGE_KEY, 'night');

      const { container } = render(<App />);

      await waitFor(() => expect(container.ownerDocument.querySelector('.dreams')).not.toBeNull());
      expect(document.querySelector('.dreams')).toHaveAttribute('data-mode', 'night');
    });
  });

  describe('the market', () => {
    it('opens from its button, once the pond is the background', async () => {
      render(<App />);

      await userEvent.click(await screen.findByRole('button', { name: /koi market/i }));

      expect(await screen.findByRole('dialog', { name: /koi market/i })).toBeInTheDocument();
    });

    it('starts the visitor’s coins from the welcome and what they have already branched', async () => {
      window.localStorage.setItem(
        RECENT_STORAGE_KEY,
        JSON.stringify([{ value: 'feat/one', createdAt: '2026-10-01T12:00:00.000Z' }])
      );
      render(<App />);

      expect(
        await screen.findByRole('button', {
          name: new RegExp(`Koi market, ${100 + COINS_PER_BRANCH} coins`)
        })
      ).toBeInTheDocument();
    });
  });
});
