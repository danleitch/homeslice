import { useState, type JSX } from 'react';
import {
  COINS_PER_BRANCH,
  DAILY_BRANCH_REWARDS,
  RESTOCK_PRICE,
  WELCOME_COINS,
  type KoiAccount
} from '../lib/koi-account';
import { MAX_GOLDFISH, MAX_KOI } from '../lib/koi';
import { CoinAmount } from './coin-icon';

type KoiMarketExplainerProps = {
  welcome: KoiAccount['welcome'];
  onDismissWelcome: () => void;
  onOpenGuide: () => void;
};

/**
 * How the market works, at the top of it.
 *
 * A new visitor finds it open, with their starting coins; after that it folds
 * away to one line, so a returning visitor goes straight to the fish.
 */
export const KoiMarketExplainer = ({
  welcome,
  onDismissWelcome,
  onOpenGuide
}: KoiMarketExplainerProps): JSX.Element => {
  const [open, setOpen] = useState(welcome !== null);

  return (
    <details
      className="market-explainer"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>How the market works</summary>

      {welcome && (
        <p className="market-explainer-welcome">
          <strong>Welcome to the market.</strong> You start with{' '}
          <CoinAmount coins={welcome.coins} />
          {welcome.branches > 0
            ? `: ${WELCOME_COINS} to start, plus ${COINS_PER_BRANCH} ${welcome.branches === 1 ? 'for your recent branch' : `for each of your ${welcome.branches} recent branches`}.`
            : '.'}
        </p>
      )}

      <ul>
        <li>
          <strong>Six koi a day, the same for everyone.</strong> The tank restocks at midnight, your
          time.
        </li>
        <li>
          <strong>Buy one and another takes its place,</strong> so the tank never runs dry.
        </li>
        <li>
          <strong>Can&apos;t wait for midnight?</strong> Restock now for{' '}
          <CoinAmount coins={RESTOCK_PRICE} /> and six fresh koi swim in.
        </li>
        <li>
          <strong>Koi grow.</strong> A day for you is a week in the pond. A young koi grows about a
          centimetre every two or three days, slowing as it nears its adult size, and the bigger it
          gets, the more it&apos;s worth. Tosai, koi in their first year, are the cheapest way in.
        </li>
        <li>
          <strong>Release a koi and it&apos;s gone for good.</strong> It swims off rather than back
          to the market, and you get half of what it&apos;s worth back.
        </li>
        <li>
          <strong>Your pond.</strong> Once you own a market koi, market koi replace all your branch
          and base koi. New fish swim in from the edge and leavers swim off. Release them all and
          the branch koi come back. The pond holds {MAX_KOI} koi.
        </li>
        <li>
          <strong>Goldfish.</strong> Cheap, cheerful and always in stock. They swim with whatever
          koi are in the pond, branch koi included, and never replace them. There&apos;s room for{' '}
          {MAX_GOLDFISH}.
        </li>
        <li>
          <strong>Say hello.</strong> Click the water and your koi come over to see what&apos;s
          going on, rising to gulp at the surface. Right-click to scatter a few pellets for them.
        </li>
        <li>
          <strong>Coins come from branching:</strong> <CoinAmount coins={COINS_PER_BRANCH} /> the
          first time you copy or save a new branch, up to {DAILY_BRANCH_REWARDS} a day.
        </li>
        <li>
          <strong>Real koi, with a little flair.</strong> Every variety is a real nishikigoi breed,
          named the way breeders name them. None of these colours is found in the wild, though: wild
          carp are olive-bronze, and every koi here, gold and platinum included, was bred by people.
          Rarities, prices and butterfly fins on any variety are our own flair.{' '}
          <button type="button" className="link-button" onClick={onOpenGuide}>
            Read the koi guide
          </button>
        </li>
      </ul>

      {welcome && (
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => {
            onDismissWelcome();
            setOpen(false);
          }}
        >
          Got it
        </button>
      )}
    </details>
  );
};
