import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  COINS_PER_BRANCH,
  DAILY_BRANCH_REWARDS,
  KOI_ACCOUNT_STORAGE_KEY,
  RESTOCK_PRICE,
  WELCOME_COINS,
  createAccount,
  type KoiAccount
} from '../lib/koi-account';
import type { GoldfishListing } from '../lib/goldfish-market';
import { koiTank, type KoiListing } from '../lib/koi-market';
import type { RecentBranch } from '../types';
import { useKoiAccount, useMarketDay } from './use-koi-account';

const NOW = new Date(2026, 8, 23, 12);
const DAY = '2026-09-23';

const branch = (value: string): RecentBranch => ({ value }) as RecentBranch;

const stored = (): KoiAccount | null => {
  const raw = window.localStorage.getItem(KOI_ACCOUNT_STORAGE_KEY);
  return raw ? (JSON.parse(raw) as KoiAccount) : null;
};

const goldfish = (id = 'g1', price = 6): GoldfishListing => ({
  id: `${DAY}~${id}`,
  day: DAY,
  name: 'Goldie',
  genome: { species: 'goldfish', variety: 'comet', seed: 500 },
  lengthCm: 9,
  adultCm: 28,
  price
});

const cheapest = (): KoiListing => koiTank(DAY)[0]!;

const withCoins = (coins: number): void => {
  window.localStorage.setItem(
    KOI_ACCOUNT_STORAGE_KEY,
    JSON.stringify({ ...createAccount([], DAY), coins })
  );
};

describe('useKoiAccount', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: NOW });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('opening an account', () => {
    it('starts a new visitor with the welcome coins', () => {
      const { result } = renderHook(() => useKoiAccount([]));

      expect(result.current.account.coins).toBe(WELCOME_COINS);
      expect(result.current.account.welcome).toEqual({ coins: WELCOME_COINS, branches: 0 });
    });

    it('pays up front for the branches already in the recent list, once each', () => {
      const { result } = renderHook(() =>
        useKoiAccount([branch('feat/one'), branch('feat/two'), branch('feat/one')])
      );

      expect(result.current.account.coins).toBe(WELCOME_COINS + 2 * COINS_PER_BRANCH);
    });

    it('picks up an account saved earlier', () => {
      withCoins(777);

      const { result } = renderHook(() => useKoiAccount([branch('feat/one')]));

      expect(result.current.account.coins).toBe(777);
    });

    it('opens a new account when the saved one cannot be read', () => {
      window.localStorage.setItem(KOI_ACCOUNT_STORAGE_KEY, '{broken');

      const { result } = renderHook(() => useKoiAccount([]));

      expect(result.current.account.coins).toBe(WELCOME_COINS);
    });

    it('saves the account, and each change to it', () => {
      const { result } = renderHook(() => useKoiAccount([]));
      expect(stored()!.coins).toBe(WELCOME_COINS);

      act(() => result.current.rewardForBranch('feat/new'));

      expect(stored()!.coins).toBe(WELCOME_COINS + COINS_PER_BRANCH);
    });
  });

  describe('another tab', () => {
    const fromOtherTab = (value: string | null, key = KOI_ACCOUNT_STORAGE_KEY): void => {
      act(() => {
        window.dispatchEvent(new StorageEvent('storage', { key, newValue: value }));
      });
    };

    it('spending or earning there shows up here', () => {
      const { result } = renderHook(() => useKoiAccount([]));

      fromOtherTab(JSON.stringify({ ...createAccount([], DAY), coins: 5 }));

      expect(result.current.account.coins).toBe(5);
    });

    it('ignores other keys', () => {
      const { result } = renderHook(() => useKoiAccount([]));

      fromOtherTab(JSON.stringify({ ...createAccount([], DAY), coins: 5 }), 'something-else');

      expect(result.current.account.coins).toBe(WELCOME_COINS);
    });

    it('ignores an account that cannot be read, or none at all', () => {
      const { result } = renderHook(() => useKoiAccount([]));

      fromOtherTab('{broken');
      fromOtherTab(null);

      expect(result.current.account.coins).toBe(WELCOME_COINS);
    });

    it('is decided against the latest account, not the one from before the other tab spent', () => {
      const { result } = renderHook(() => useKoiAccount([]));
      fromOtherTab(JSON.stringify({ ...createAccount([], DAY), coins: 1 }));

      let outcome = '';
      act(() => {
        outcome = result.current.buy(cheapest());
      });

      expect(outcome).toBe('short');
    });

    it('stops listening once unmounted', () => {
      const { result, unmount } = renderHook(() => useKoiAccount([]));
      unmount();

      fromOtherTab(JSON.stringify({ ...createAccount([], DAY), coins: 5 }));

      expect(result.current.account.coins).toBe(WELCOME_COINS);
    });
  });

  describe('earning', () => {
    it('pays for a branch the first time, and celebrates it', () => {
      const { result } = renderHook(() => useKoiAccount([]));
      expect(result.current.lastReward).toBeNull();

      act(() => result.current.rewardForBranch('feat/new'));

      expect(result.current.account.coins).toBe(WELCOME_COINS + COINS_PER_BRANCH);
      expect(result.current.lastReward).toEqual({ id: 1, coins: COINS_PER_BRANCH });
    });

    it('does not pay for the same branch twice', () => {
      const { result } = renderHook(() => useKoiAccount([]));
      act(() => result.current.rewardForBranch('feat/new'));

      act(() => result.current.rewardForBranch('feat/new'));

      expect(result.current.account.coins).toBe(WELCOME_COINS + COINS_PER_BRANCH);
      expect(result.current.lastReward!.id).toBe(1);
    });

    it('gives each payout a new id, so repeats still animate', () => {
      const { result } = renderHook(() => useKoiAccount([]));

      act(() => result.current.rewardForBranch('feat/one'));
      act(() => result.current.rewardForBranch('feat/two'));

      expect(result.current.lastReward!.id).toBe(2);
    });

    it('does not pay for a branch that has no name', () => {
      const { result } = renderHook(() => useKoiAccount([]));

      act(() => result.current.rewardForBranch(''));

      expect(result.current.account.coins).toBe(WELCOME_COINS);
      expect(result.current.lastReward).toBeNull();
    });

    it('stops paying once the day’s limit is reached', () => {
      const { result } = renderHook(() => useKoiAccount([]));

      for (let index = 0; index < DAILY_BRANCH_REWARDS + 2; index += 1) {
        act(() => result.current.rewardForBranch(`feat/${index}`));
      }

      expect(result.current.account.coins).toBe(
        WELCOME_COINS + DAILY_BRANCH_REWARDS * COINS_PER_BRANCH
      );
    });

    it('does not let two payouts in one tick both read the balance from before the first', () => {
      const { result } = renderHook(() => useKoiAccount([]));

      act(() => {
        result.current.rewardForBranch('feat/one');
        result.current.rewardForBranch('feat/two');
      });

      expect(result.current.account.coins).toBe(WELCOME_COINS + 2 * COINS_PER_BRANCH);
    });
  });

  describe('buying', () => {
    it('buys a koi, taking the coins and putting it in the pond', () => {
      withCoins(1000);
      const { result } = renderHook(() => useKoiAccount([]));
      const listing = cheapest();

      let outcome = '';
      act(() => {
        outcome = result.current.buy(listing);
      });

      expect(outcome).toBe('bought');
      expect(result.current.account.coins).toBe(1000 - listing.price);
      expect(result.current.account.owned.map((koi) => koi.id)).toEqual([listing.id]);
    });

    it('says why when it cannot, and changes nothing', () => {
      withCoins(1);
      const { result } = renderHook(() => useKoiAccount([]));
      const before = result.current.account;

      let outcome = '';
      act(() => {
        outcome = result.current.buy(cheapest());
      });

      expect(outcome).toBe('short');
      expect(result.current.account).toBe(before);
    });

    it('buys a goldfish the same way', () => {
      withCoins(1000);
      const { result } = renderHook(() => useKoiAccount([]));

      let outcome = '';
      act(() => {
        outcome = result.current.buyGoldfish(goldfish());
      });

      expect(outcome).toBe('bought');
      expect(result.current.account.coins).toBe(994);
      expect(result.current.account.goldfish).toHaveLength(1);
    });

    it('says why a goldfish cannot be bought', () => {
      withCoins(1);
      const { result } = renderHook(() => useKoiAccount([]));

      let outcome = '';
      act(() => {
        outcome = result.current.buyGoldfish(goldfish('g1', 50));
      });

      expect(outcome).toBe('short');
      expect(result.current.account.goldfish).toHaveLength(0);
    });
  });

  describe('releasing', () => {
    it('pays back some of what a koi was worth, and it is gone', () => {
      withCoins(1000);
      const { result } = renderHook(() => useKoiAccount([]));
      const listing = cheapest();
      act(() => {
        result.current.buy(listing);
      });
      const coins = result.current.account.coins;

      let refund = 0;
      act(() => {
        refund = result.current.release(listing.id);
      });

      expect(refund).toBeGreaterThan(0);
      expect(result.current.account.owned).toHaveLength(0);
      expect(result.current.account.coins).toBe(coins + refund);
    });

    it('does the same for a goldfish', () => {
      withCoins(1000);
      const { result } = renderHook(() => useKoiAccount([]));
      const fish = goldfish();
      act(() => {
        result.current.buyGoldfish(fish);
      });

      let refund = 0;
      act(() => {
        refund = result.current.releaseGoldfish(fish.id);
      });

      expect(refund).toBeGreaterThanOrEqual(0);
      expect(result.current.account.goldfish).toHaveLength(0);
    });

    it('pays nothing for a fish that is not there', () => {
      const { result } = renderHook(() => useKoiAccount([]));

      let refund = -1;
      act(() => {
        refund = result.current.release('nope');
      });
      let goldfishRefund = -1;
      act(() => {
        goldfishRefund = result.current.releaseGoldfish('nope');
      });

      expect(refund).toBe(0);
      expect(goldfishRefund).toBe(0);
    });
  });

  describe('the market', () => {
    it('restocks the tank for a price', () => {
      withCoins(1000);
      const { result } = renderHook(() => useKoiAccount([]));

      let outcome = '';
      act(() => {
        outcome = result.current.restock(DAY);
      });

      expect(outcome).toBe('restocked');
      expect(result.current.account.coins).toBe(1000 - RESTOCK_PRICE);
      expect(result.current.account.tank.restocks).toBe(1);
    });

    it('will not restock without the coins', () => {
      withCoins(RESTOCK_PRICE - 1);
      const { result } = renderHook(() => useKoiAccount([]));
      const before = result.current.account;

      let outcome = '';
      act(() => {
        outcome = result.current.restock(DAY);
      });

      expect(outcome).toBe('short');
      expect(result.current.account).toBe(before);
    });

    it('renames a fish', () => {
      withCoins(1000);
      const { result } = renderHook(() => useKoiAccount([]));
      const listing = cheapest();
      act(() => {
        result.current.buy(listing);
      });

      act(() => result.current.rename('koi', listing.id, 'Bubbles'));

      expect(result.current.account.owned[0]!.name).toBe('Bubbles');
    });

    it('leaves a name alone when the new one is blank', () => {
      withCoins(1000);
      const { result } = renderHook(() => useKoiAccount([]));
      const listing = cheapest();
      act(() => {
        result.current.buy(listing);
      });

      act(() => result.current.rename('koi', listing.id, '   '));

      expect(result.current.account.owned[0]!.name).toBe(listing.name);
    });

    it('remembers the day the market was last opened', () => {
      const { result } = renderHook(() => useKoiAccount([]));

      act(() => result.current.markMarketSeen(DAY));

      expect(result.current.account.seenDay).toBe(DAY);
    });

    it('puts the welcome away once it has been read', () => {
      const { result } = renderHook(() => useKoiAccount([]));
      expect(result.current.account.welcome).not.toBeNull();

      act(() => result.current.dismissMarketWelcome());

      expect(result.current.account.welcome).toBeNull();
    });
  });

  it('keeps the same functions between renders, so effects that use them do not rerun', () => {
    const { result, rerender } = renderHook(() => useKoiAccount([]));
    const first = result.current;

    rerender();

    expect(result.current.buy).toBe(first.buy);
    expect(result.current.rewardForBranch).toBe(first.rewardForBranch);
    expect(result.current.restock).toBe(first.restock);
  });
});

describe('useMarketDay', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: NOW });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('is today’s date', () => {
    const { result } = renderHook(() => useMarketDay());

    expect(result.current).toBe(DAY);
  });

  it('rolls over to the next day just after midnight', () => {
    vi.setSystemTime(new Date(2026, 8, 23, 23, 59, 30));
    const { result } = renderHook(() => useMarketDay());
    expect(result.current).toBe(DAY);

    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(result.current).toBe(DAY);

    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(result.current).toBe('2026-09-24');
  });

  it('keeps rolling over, day after day', () => {
    vi.setSystemTime(new Date(2026, 8, 23, 23, 59, 30));
    const { result } = renderHook(() => useMarketDay());

    act(() => {
      vi.advanceTimersByTime(31_500);
    });
    act(() => {
      vi.advanceTimersByTime(86_400_000);
    });

    expect(result.current).toBe('2026-09-25');
  });

  it('checks the date again when a sleeping laptop wakes up', () => {
    const { result } = renderHook(() => useMarketDay());
    vi.setSystemTime(new Date(2026, 8, 25, 8));

    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    expect(result.current).toBe('2026-09-25');
  });

  it('stops watching once unmounted', () => {
    const { unmount } = renderHook(() => useMarketDay());

    unmount();

    expect(vi.getTimerCount()).toBe(0);
  });
});
