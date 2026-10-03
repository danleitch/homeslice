import { useState, type JSX } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { goldfishOf } from '../lib/goldfish';
import { goldfishCounter } from '../lib/goldfish-market';
import {
  RESTOCK_PRICE,
  buyGoldfish,
  buyListing,
  createAccount,
  dismissWelcome,
  releaseGoldfish,
  releaseKoi,
  restockTank,
  type KoiAccount
} from '../lib/koi-account';
import { koiTank } from '../lib/koi-market';
import { VARIETIES } from '../lib/koi-varieties';
import { KoiMarket } from './koi-market';

const DAY = '2026-09-23';

/** The market over a real account, so buying, releasing and restocking actually move coins. */
const Harness = ({
  initial,
  onClose = vi.fn()
}: {
  initial: KoiAccount;
  onClose?: () => void;
}): JSX.Element => {
  const [account, setAccount] = useState(initial);

  return (
    <KoiMarket
      account={account}
      day={DAY}
      onBuy={(listing) => {
        const result = buyListing(account, listing, new Date());
        setAccount(result.account);
        return result.outcome;
      }}
      onBuyGoldfish={(listing) => {
        const result = buyGoldfish(account, listing, new Date());
        setAccount(result.account);
        return result.outcome;
      }}
      onRelease={(id) => {
        const result = releaseKoi(account, id, new Date());
        setAccount(result.account);
        return result.refund;
      }}
      onReleaseGoldfish={(id) => {
        const result = releaseGoldfish(account, id, new Date());
        setAccount(result.account);
        return result.refund;
      }}
      onRestock={() => {
        const result = restockTank(account, DAY);
        setAccount(result.account);
        return result.outcome;
      }}
      onDismissWelcome={() => setAccount(dismissWelcome(account))}
      onClose={onClose}
    />
  );
};

const accountWith = (coins: number): KoiAccount => ({
  ...createAccount([], DAY),
  coins,
  welcome: null
});

/** Portraits resolve asynchronously; tests wait for them so nothing updates after they end. */
const settled = async (): Promise<void> =>
  waitFor(() => expect(document.querySelector('.koi-photo[data-state="loading"]')).toBeNull());

const cardFor = (name: string): HTMLElement | null =>
  screen.queryByRole('article', { name: new RegExp(`^${name}\\b`) });

describe('KoiMarket', () => {
  it('shows the day’s six koi with their names, varieties and prices', async () => {
    render(<Harness initial={accountWith(50)} />);
    await settled();

    const dialog = screen.getByRole('dialog', { name: 'Koi Market' });
    const cards = within(dialog).getAllByRole('article');
    const tank = koiTank(DAY);

    expect(cards).toHaveLength(6);
    expect(within(cards[0]!).getByRole('heading', { level: 3 })).toHaveTextContent(tank[0]!.name);
    expect(within(dialog).getByText(/restocks in/)).toBeInTheDocument();
    expect(within(dialog).getByLabelText('50 coins')).toBeInTheDocument();
  });

  it('says how much more a visitor needs for a fish they can’t afford', async () => {
    render(<Harness initial={accountWith(0)} />);
    await settled();

    const cheapest = [...koiTank(DAY)].sort((a, b) => a.price - b.price)[0]!;

    // Two fish can share a price, so every one of them has to say so.
    const buttons = screen.getAllByRole('button', { name: `Need ${cheapest.price} more` });
    expect(buttons.length).toBeGreaterThan(0);
    buttons.forEach((button) => expect(button).toBeDisabled());
  });

  it('buys a koi into the pond, and a new koi swims into its place', async () => {
    const user = userEvent.setup();
    const listing = koiTank(DAY)[0]!;
    const newcomer = koiTank(DAY, 0, [listing.id])[0]!;
    render(<Harness initial={accountWith(5000)} />);
    await settled();

    await user.click(
      screen.getByRole('button', { name: `Buy ${listing.name} for ${listing.price} coins` })
    );

    expect(screen.getByLabelText(`${5000 - listing.price} coins`)).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Your pond/ })).toHaveTextContent('Your pond 1');
    expect(screen.getByRole('status')).toHaveTextContent(
      `${listing.name} is swimming in your pond, and your branch koi are resting. ${newcomer.name} has joined the tank.`
    );

    // The tank is still six strong, with the newcomer where the bought fish swam.
    const cards = screen.getAllByRole('article');
    expect(cards).toHaveLength(6);
    expect(within(cards[0]!).getByRole('heading', { level: 3 })).toHaveTextContent(newcomer.name);
    expect(within(cards[0]!).getByText('Just in')).toBeInTheDocument();
    expect(cardFor(listing.name)).toBeNull();
    await settled();
  });

  it('restocks the whole tank for a price, after asking first', async () => {
    const user = userEvent.setup();
    const before = koiTank(DAY);
    const after = koiTank(DAY, 1);
    render(<Harness initial={accountWith(250)} />);
    await settled();

    await user.click(screen.getByRole('button', { name: /Restock now/ }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(cardFor(before[0]!.name)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Restock now/ }));
    await user.click(screen.getByRole('button', { name: `Restock for ${RESTOCK_PRICE}` }));

    expect(screen.getByLabelText(`${250 - RESTOCK_PRICE} coins`)).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Six fresh koi have swum into the tank.');
    expect(screen.getByText('Restocked once today')).toBeInTheDocument();

    const names = screen
      .getAllByRole('article')
      .map((card) => within(card).getByRole('heading', { level: 3 }).textContent ?? '');
    expect(names.map((name) => name.split(' · ')[0])).toEqual(after.map((listing) => listing.name));
    expect(screen.getAllByText('Just in')).toHaveLength(6);
    await settled();
  });

  it('won’t restock without the coins for it', async () => {
    render(<Harness initial={accountWith(RESTOCK_PRICE - 30)} />);
    await settled();

    expect(screen.getByRole('button', { name: 'Restock · need 30 more' })).toBeDisabled();
  });

  it('releases a koi only after asking, and sends it off for good', async () => {
    const user = userEvent.setup();
    const listing = koiTank(DAY)[0]!;
    const owned = buyListing(accountWith(listing.price), listing, new Date()).account;
    render(<Harness initial={owned} />);

    await user.click(screen.getByRole('tab', { name: /Your pond/ }));
    await settled();
    expect(screen.getByRole('heading', { name: listing.name })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: `Release ${listing.name}` }));
    expect(screen.getByText(/won't return to the market/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Keep' }));
    expect(screen.getByRole('heading', { name: listing.name })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: `Release ${listing.name}` }));
    await user.click(screen.getByRole('button', { name: 'Release' }));

    // Just bought, so worth what was paid: half of that comes back.
    const refund = Math.floor(listing.price / 2);
    expect(screen.queryByRole('heading', { name: listing.name })).not.toBeInTheDocument();
    expect(screen.getByLabelText(`${refund} coins`)).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('branch koi are back in the pond');

    // Released, not returned: the tank still has the newcomer in its place.
    await user.click(screen.getByRole('tab', { name: "Today's koi" }));
    await settled();
    expect(cardFor(listing.name)).toBeNull();
  });

  it('explains an empty pond and leads back to the tank', async () => {
    const user = userEvent.setup();
    render(<Harness initial={accountWith(0)} />);
    await settled();

    await user.click(screen.getByRole('tab', { name: /Your pond/ }));
    expect(screen.getByText(/No market fish yet/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: "See today's koi" }));
    expect(screen.getByRole('tab', { name: "Today's koi" })).toHaveAttribute(
      'aria-selected',
      'true'
    );
  });

  it('tags each koi with its age and size, and how big it could grow', async () => {
    render(<Harness initial={accountWith(0)} />);
    await settled();

    const listing = koiTank(DAY)[0]!;
    const card = cardFor(listing.name)!;

    expect(within(card).getByText(new RegExp(`· ${Math.round(listing.lengthCm)} cm$`))).toHaveClass(
      'koi-size'
    );
    expect(card).toHaveTextContent(`Could grow to about ${Math.round(listing.adultCm)} cm`);
  });

  it('sells goldfish from their own tab, to swim alongside the koi', async () => {
    const user = userEvent.setup();
    const counter = goldfishCounter(DAY);
    const cheapest = counter[0]!;
    render(<Harness initial={accountWith(100)} />);
    await settled();

    await user.click(screen.getByRole('tab', { name: 'Goldfish' }));
    await settled();

    expect(screen.getAllByRole('article')).toHaveLength(counter.length);
    expect(screen.getByRole('tabpanel', { name: 'Goldfish' })).toHaveTextContent(
      'Pond goldfish, always in stock.'
    );

    await user.click(
      screen.getByRole('button', { name: `Buy ${cheapest.name} for ${cheapest.price} coins` })
    );

    const next = goldfishCounter(DAY, [cheapest.id], [cheapest.name])[0]!;
    expect(screen.getByLabelText(`${100 - cheapest.price} coins`)).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(
      `${cheapest.name} is swimming in your pond. ${next.name}, another ${goldfishOf(next.genome).name}, has come up to the glass.`
    );
    expect(cardFor(next.name)).toBeInTheDocument();
    await settled();

    await user.click(screen.getByRole('tab', { name: /Your pond/ }));
    await settled();

    expect(screen.getByRole('list', { name: 'Your goldfish' })).toHaveTextContent(cheapest.name);
    expect(screen.getByText(/branch koi still have the pond/)).toBeInTheDocument();
  });

  it('adds up what the pond is worth', async () => {
    const user = userEvent.setup();
    const [koi] = koiTank(DAY);
    const [goldfish] = goldfishCounter(DAY);
    let account = buyListing(accountWith(5000), koi!, new Date()).account;
    account = buyGoldfish(account, goldfish!, new Date()).account;
    render(<Harness initial={account} />);

    await user.click(screen.getByRole('tab', { name: /Your pond/ }));
    await settled();

    const summary = screen.getByRole('region', { name: 'Pond value' });
    expect(summary).toHaveTextContent((koi!.price + goldfish!.price).toLocaleString());
    expect(summary).toHaveTextContent('1 of 10 koi · 1 of 6 goldfish');
    expect(summary).toHaveTextContent(/growing about \d+ a day/);
  });

  it('releases a goldfish for half what it is worth', async () => {
    const user = userEvent.setup();
    const [goldfish] = goldfishCounter(DAY);
    render(
      <Harness initial={buyGoldfish(accountWith(goldfish!.price), goldfish!, new Date()).account} />
    );

    await user.click(screen.getByRole('tab', { name: /Your pond/ }));
    await settled();
    await user.click(screen.getByRole('button', { name: `Release ${goldfish!.name}` }));
    expect(screen.getByText(/won't come back/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Release' }));

    expect(screen.getByLabelText(`${Math.floor(goldfish!.price / 2)} coins`)).toBeInTheDocument();
    expect(screen.getByText(/No market fish yet/)).toBeInTheDocument();
  });

  it('explains how the market works, open for a new visitor with their welcome', async () => {
    const user = userEvent.setup();
    render(<Harness initial={createAccount(['feat/a', 'fix/b'], DAY)} />);
    await settled();

    const explainer = screen.getByText('How the market works').closest('details')!;
    expect(explainer).toHaveAttribute('open');
    expect(
      within(explainer)
        .getByText(/Welcome to the market/)
        .closest('p')
    ).toHaveTextContent('plus 25 for each of your 2 recent branches');
    expect(explainer).toHaveTextContent('Six koi a day, the same for everyone.');
    expect(explainer).toHaveTextContent('Buy one and another takes its place');
    expect(explainer).toHaveTextContent(`Restock now for ${RESTOCK_PRICE}`);
    expect(explainer).toHaveTextContent("Release a koi and it's gone for good.");
    expect(explainer).toHaveTextContent("you get half of what it's worth back");
    expect(explainer).toHaveTextContent('A day for you is a week in the pond.');
    expect(explainer).toHaveTextContent('The pond holds 10 koi.');
    expect(explainer).toHaveTextContent("There's room for 6.");
    expect(explainer).toHaveTextContent('gold and platinum included, was bred by people');

    await user.click(within(explainer).getByRole('button', { name: 'Got it' }));
    expect(screen.queryByText(/Welcome to the market/)).not.toBeInTheDocument();
    expect(explainer).not.toHaveAttribute('open');
  });

  it('keeps the explainer folded away for a returning visitor', async () => {
    render(<Harness initial={accountWith(10)} />);
    await settled();

    expect(screen.getByText('How the market works').closest('details')).not.toHaveAttribute('open');
  });

  it('opens the koi guide from the book icon, and comes back to the tank', async () => {
    const user = userEvent.setup();
    render(<Harness initial={accountWith(10)} />);
    await settled();

    await user.click(screen.getByRole('button', { name: 'Koi guide' }));

    const guide = screen.getByRole('article', { name: 'Nishikigoi, the brocaded carp' });
    expect(screen.getByRole('button', { name: 'Koi guide' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(
      within(guide).getByRole('heading', { name: 'Reading a koi’s name' })
    ).toBeInTheDocument();
    expect(within(guide).getByText(/S Legend/)).toBeInTheDocument();
    expect(within(guide).getAllByRole('heading', { level: 5 }).length).toBeGreaterThanOrEqual(
      VARIETIES.length
    );
    expect(within(guide).getByText('“red crown”')).toBeInTheDocument();
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    await settled();

    await user.click(within(guide).getAllByRole('button', { name: '← Back to the market' })[0]!);

    expect(screen.getByRole('tablist')).toBeInTheDocument();
    expect(screen.getAllByRole('article')).toHaveLength(6);
  });

  it('opens the guide from the explainer, too', async () => {
    const user = userEvent.setup();
    render(<Harness initial={createAccount([], DAY)} />);
    await settled();

    await user.click(screen.getByRole('button', { name: 'Read the koi guide' }));

    expect(
      screen.getByRole('article', { name: 'Nishikigoi, the brocaded carp' })
    ).toBeInTheDocument();
    await settled();
  });

  it('closes on Escape', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Harness initial={accountWith(0)} onClose={onClose} />);
    await settled();

    await user.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalled();
  });
});
