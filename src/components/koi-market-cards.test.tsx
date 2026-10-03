import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MAX_GOLDFISH, MAX_KOI } from '../lib/koi';
import { goldfishCounter } from '../lib/goldfish-market';
import { koiTank } from '../lib/koi-market';
import { GoldfishCard, ListingCard } from './koi-market-cards';

const DAY = '2026-09-23';
const koi = koiTank(DAY)[0]!;
const goldfish = goldfishCounter(DAY)[0]!;

describe('the market’s buy buttons', () => {
  describe('on a koi', () => {
    const card = (blocker: Parameters<typeof ListingCard>[0]['blocker'], coins = 1000) => {
      const onBuy = vi.fn();
      render(
        <ListingCard listing={koi} blocker={blocker} coins={coins} fresh={false} onBuy={onBuy} />
      );
      return { onBuy, button: screen.getByRole('button') };
    };

    it('can be pressed, saying how much it costs, when nothing stands in the way', async () => {
      const { onBuy, button } = card(null);

      expect(button).toHaveAccessibleName(`Buy ${koi.name} for ${koi.price} coins`);
      expect(button).toBeEnabled();

      await userEvent.click(button);

      expect(onBuy).toHaveBeenCalledWith(koi);
    });

    it('says how many more coins are needed', () => {
      const { button } = card('short', koi.price - 7);

      expect(button).toBeDisabled();
      expect(button).toHaveTextContent('Need 7 more');
    });

    it('says the pond is full, and by how many koi it is', () => {
      const { button } = card('pond-full');

      expect(button).toBeDisabled();
      expect(button).toHaveTextContent(`Pond full (${MAX_KOI}/${MAX_KOI})`);
    });

    it('says the koi is in the pond already, and ticks it', () => {
      const { button } = card('owned');

      expect(button).toBeDisabled();
      expect(button).toHaveTextContent('In your pond ✓');
      expect(button).toHaveClass('btn-owned');
    });
  });

  describe('on a goldfish', () => {
    const card = (blocker: Parameters<typeof GoldfishCard>[0]['blocker'], coins = 1000) => {
      render(
        <GoldfishCard
          listing={goldfish}
          blocker={blocker}
          coins={coins}
          fresh={false}
          onBuy={vi.fn()}
        />
      );
      return screen.getByRole('button');
    };

    it('says the pond is full, by how many goldfish it is', () => {
      const button = card('pond-full');

      expect(button).toBeDisabled();
      expect(button).toHaveTextContent(`Pond full (${MAX_GOLDFISH}/${MAX_GOLDFISH})`);
    });

    it('says how many more coins are needed', () => {
      expect(card('short', goldfish.price - 3)).toHaveTextContent('Need 3 more');
    });
  });
});
