import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchQuotes, type Quote } from '../lib/markets';
import { createWidget, type MarketsWidget, type Widget } from '../lib/model';
import { WidgetView } from './widget-view';

vi.mock('../lib/markets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/markets')>()),
  fetchQuotes: vi.fn()
}));

const MINT = 'DemoMint1111111111111111111111111111111pump';

const closes = [10, 11, 12, 11, 13];
const apple: Quote = {
  symbol: 'AAPL',
  name: 'Apple',
  price: 231.8,
  change: 0.18,
  currency: 'USD',
  precision: 2,
  closes
};
const token: Quote = {
  symbol: 'DEMO',
  name: 'Demo Token',
  price: 0.00004213,
  change: -12.5,
  currency: 'USD',
  precision: 8,
  closes: [0.00005, 0.00004213],
  url: 'https://dexscreener.com/solana/PoolAddress',
  liquidity: 38_500
};

const show = (quotes: Quote[], symbols = [{ symbol: 'AAPL', name: '' }]) => {
  vi.mocked(fetchQuotes).mockResolvedValue(quotes);
  return render(
    <WidgetView
      widget={{ ...createWidget('markets'), symbols } as Widget as MarketsWidget}
      clock="24h"
      newTab={false}
    />
  );
};

beforeEach(() => {
  vi.mocked(fetchQuotes).mockReset();
});

describe('the Markets widget', () => {
  it('links a symbol to Yahoo Finance, as it always has', async () => {
    show([apple]);

    expect(await screen.findByRole('link')).toHaveAttribute(
      'href',
      'https://finance.yahoo.com/quote/AAPL'
    );
  });

  it('shows no liquidity for a symbol on Yahoo', async () => {
    show([apple]);
    await screen.findByText('AAPL');

    expect(screen.queryByText(/liquidity/)).toBeNull();
  });

  describe('a token', () => {
    it('is shown by its ticker and name, with its tiny price in full', async () => {
      show([token], [{ symbol: MINT, name: '' }]);

      expect(await screen.findByText('DEMO')).toBeInTheDocument();
      expect(screen.getByText('$0.00004213')).toBeInTheDocument();
      expect(screen.getByText('-12.50%')).toBeInTheDocument();
    });

    it('links to the pool it is traded in, not to Yahoo', async () => {
      show([token], [{ symbol: MINT, name: '' }]);

      expect(await screen.findByRole('link')).toHaveAttribute(
        'href',
        'https://dexscreener.com/solana/PoolAddress'
      );
    });

    it('says how much money is in the pool', async () => {
      show([token], [{ symbol: MINT, name: '' }]);

      expect(await screen.findByText(/\$38\.5K liquidity/)).toBeInTheDocument();
    });

    it('marks a small pool, whose price a few trades can move a long way', async () => {
      show([token], [{ symbol: MINT, name: '' }]);

      const note = await screen.findByText(/liquidity/);

      expect(note).toHaveAttribute('data-thin');
      expect(note).toHaveAttribute('title', expect.stringContaining('a few trades move the price'));
    });

    it('does not mark a deep one', async () => {
      show([{ ...token, liquidity: 4_200_000 }], [{ symbol: MINT, name: '' }]);

      const note = await screen.findByText(/\$4\.2M liquidity/);

      expect(note).not.toHaveAttribute('data-thin');
    });

    it('shows the liquidity without a stray dot when it has no name', async () => {
      show([{ ...token, name: '' }], [{ symbol: MINT, name: '' }]);

      const note = await screen.findByText(/liquidity/);

      expect(note.textContent).toBe('$38.5K liquidity');
    });

    it('sits among the others in the order asked', async () => {
      show(
        [apple, token],
        [
          { symbol: 'AAPL', name: '' },
          { symbol: MINT, name: '' }
        ]
      );
      await screen.findByText('DEMO');

      const rows = screen.getAllByRole('listitem');

      expect(within(rows[0]!).getByText('AAPL')).toBeInTheDocument();
      expect(within(rows[1]!).getByText('DEMO')).toBeInTheDocument();
    });

    it('can be shown twice, or two tokens share a ticker, without confusing the rows', async () => {
      show(
        [token, { ...token, url: 'https://dexscreener.com/solana/Other' }],
        [
          { symbol: MINT, name: '' },
          { symbol: `${MINT.slice(0, -1)}q`, name: '' }
        ]
      );

      expect(await screen.findAllByText('DEMO')).toHaveLength(2);
    });
  });
});
