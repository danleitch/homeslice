import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { FishCard as FishCardData } from '../lib/koi-inspect';
import { FishCard } from './fish-card';

const NOW = new Date('2026-03-10T12:00:00.000Z');

const branchKoi: FishCardData = {
  key: 'feat/BRF-1-add-auth',
  kind: 'branch',
  name: 'Sora',
  nameMeaning: 'sky',
  species: 'Taisho Sanke',
  kanji: '大正三色',
  speciesMeaning: 'tricolour of the Taisho era',
  group: 'Gosanke',
  rarity: 'uncommon',
  traits: [],
  personality: ['Bold', 'Sociable'],
  blurb: 'Red and black on white.',
  ageClass: 'Nisai',
  lengthCm: 42,
  adultCm: null,
  worth: 180,
  appraised: true,
  paid: null,
  perDay: 0,
  acquiredAt: null,
  branch: 'feat/BRF-1-add-auth',
  activity: 'resting',
  genome: null
};

const marketKoi: FishCardData = {
  ...branchKoi,
  key: 'market:2026-03-01#0.0.0',
  kind: 'koi',
  name: 'Hana',
  nameMeaning: 'flower',
  species: 'Gin Rin Kohaku',
  traits: [{ label: 'Gin Rin', blurb: 'Sparkling scales.' }],
  rarity: 'rare',
  adultCm: 70,
  worth: 520,
  appraised: false,
  paid: 400,
  perDay: 6,
  acquiredAt: '2026-03-09T09:00:00.000Z',
  branch: null,
  activity: 'cruising'
};

const renderCard = (card: FishCardData, onClose = vi.fn()) =>
  render(<FishCard card={card} anchor={{ x: 100, y: 100 }} now={NOW} onClose={onClose} />);

describe('FishCard', () => {
  it('introduces a branch koi by name, variety, personality and the branch it swims for', () => {
    renderCard(branchKoi);
    const card = screen.getByRole('dialog', { name: /Sora/ });

    expect(within(card).getByText('Taisho Sanke')).toBeInTheDocument();
    expect(within(card).getByText('Branch koi')).toBeInTheDocument();
    expect(within(card).getByText('Resting in the water')).toBeInTheDocument();
    expect(within(card).getByRole('list', { name: 'Personality' })).toHaveTextContent(
      'BoldSociable'
    );
    expect(within(card).getByText('Appraised at')).toBeInTheDocument();
    expect(within(card).getByText(/not for sale/)).toBeInTheDocument();
    expect(within(card).getByText('feat/BRF-1-add-auth')).toBeInTheDocument();
    expect(within(card).queryByText('Paid')).not.toBeInTheDocument();
  });

  it('shows what a bought koi cost, what it is worth, and how long it has been in the pond', () => {
    renderCard(marketKoi);
    const card = screen.getByRole('dialog', { name: /Hana/ });

    expect(within(card).getByText('Rare')).toBeInTheDocument();
    expect(within(card).getByRole('list', { name: 'Traits' })).toHaveTextContent('Gin Rin');
    expect(within(card).getByText('Worth')).toBeInTheDocument();
    expect(within(card).getByText('520')).toBeInTheDocument();
    expect(within(card).getByText('400')).toBeInTheDocument();
    expect(within(card).getByText(/\+6 a day/)).toBeInTheDocument();
    expect(within(card).getByText('Joined yesterday')).toBeInTheDocument();
    expect(within(card).getByText('Nisai · 42 cm, could reach 70 cm')).toBeInTheDocument();
  });

  it.each([
    ['goldfish', 'Goldfish'],
    ['resident', 'Pond resident'],
    ['branch', 'Branch koi']
  ] as const)('calls a %s “%s”', (kind, label) => {
    renderCard({ ...branchKoi, kind });

    expect(
      within(screen.getByRole('dialog', { name: /Sora/ })).getByText(label)
    ).toBeInTheDocument();
  });

  it('calls a koi from the market by how rare it is, and a koi of no rarity just a koi', () => {
    const { rerender } = renderCard({ ...marketKoi, rarity: 'legendary' });
    const label = (): string => document.querySelector('.rarity-badge')?.textContent ?? '';

    expect(label()).toBe('Legendary');

    rerender(
      <FishCard
        card={{ ...marketKoi, rarity: null }}
        anchor={{ x: 100, y: 100 }}
        now={NOW}
        onClose={vi.fn()}
      />
    );

    expect(label()).toBe('Koi');
  });

  it('closes from its button and from Escape', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderCard(branchKoi, onClose);

    await user.click(screen.getByRole('button', { name: "Close Sora's card" }));
    await user.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('only suggests dragging where the pond allows it', () => {
    const { rerender } = renderCard(branchKoi);
    expect(screen.getByText(/Drag a fish/)).toBeInTheDocument();

    rerender(
      <FishCard
        card={branchKoi}
        anchor={{ x: 100, y: 100 }}
        now={NOW}
        canDrag={false}
        onClose={vi.fn()}
      />
    );
    expect(screen.queryByText(/Drag a fish/)).not.toBeInTheDocument();
  });

  describe('renaming', () => {
    const renderRenamable = (onRename = vi.fn(), onClose = vi.fn()) => {
      render(
        <FishCard
          card={branchKoi}
          anchor={{ x: 100, y: 100 }}
          now={NOW}
          onRename={onRename}
          onClose={onClose}
        />
      );
      return { onRename, onClose };
    };

    it('leaves the name as plain text where the fish cannot be renamed', () => {
      renderCard(branchKoi);

      expect(screen.queryByRole('button', { name: 'Rename Sora' })).not.toBeInTheDocument();
    });

    it('turns the name into a text box, and saves it on Enter', async () => {
      const user = userEvent.setup();
      const { onRename } = renderRenamable();

      await user.click(screen.getByRole('button', { name: 'Rename Sora' }));
      const box = screen.getByRole('textbox', { name: 'New name for Sora' });
      expect(box).toHaveValue('Sora');
      expect(box).toHaveFocus();

      await user.clear(box);
      await user.type(box, '  Sir   Splash {Enter}');

      expect(onRename).toHaveBeenCalledOnce();
      expect(onRename).toHaveBeenCalledWith('Sir Splash');
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    });

    it('saves when the box loses focus', async () => {
      const user = userEvent.setup();
      const { onRename } = renderRenamable();

      await user.click(screen.getByRole('button', { name: 'Rename Sora' }));
      await user.clear(screen.getByRole('textbox'));
      await user.type(screen.getByRole('textbox'), 'Momo');
      await user.click(screen.getByText('Taisho Sanke'));

      expect(onRename).toHaveBeenCalledExactlyOnceWith('Momo');
    });

    it('saves once when Enter and the blur that follows it arrive together', () => {
      const { onRename } = renderRenamable();

      fireEvent.click(screen.getByRole('button', { name: 'Rename Sora' }));
      const box = screen.getByRole('textbox');
      fireEvent.change(box, { target: { value: 'Momo' } });

      act(() => {
        fireEvent.keyDown(box, { key: 'Enter' });
        fireEvent.blur(box);
      });

      expect(onRename).toHaveBeenCalledExactlyOnceWith('Momo');
    });

    it('puts the edit away on Escape, and keeps the card open', async () => {
      const user = userEvent.setup();
      const { onRename, onClose } = renderRenamable();

      await user.click(screen.getByRole('button', { name: 'Rename Sora' }));
      await user.type(screen.getByRole('textbox'), 'zzz{Escape}');

      expect(onRename).not.toHaveBeenCalled();
      expect(onClose).not.toHaveBeenCalled();
      expect(screen.getByRole('button', { name: 'Rename Sora' })).toBeInTheDocument();

      // With no edit under way, Escape closes the card as before.
      await user.keyboard('{Escape}');
      expect(onClose).toHaveBeenCalledOnce();
    });

    it('keeps the name when it is blank or unchanged', async () => {
      const user = userEvent.setup();
      const { onRename } = renderRenamable();

      await user.click(screen.getByRole('button', { name: 'Rename Sora' }));
      await user.clear(screen.getByRole('textbox'));
      await user.type(screen.getByRole('textbox'), '   {Enter}');
      await user.click(screen.getByRole('button', { name: 'Rename Sora' }));
      await user.type(screen.getByRole('textbox'), '{Enter}');

      expect(onRename).not.toHaveBeenCalled();
    });
  });
});
