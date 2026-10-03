import type { JSX } from 'react';
import type { KoiReward } from '../hooks/use-koi-account';
import { CoinIcon } from './coin-icon';

type KoiMarketButtonProps = {
  coins: number;
  /** Whether today's tank has fish the visitor hasn't looked at yet. */
  hasNewStock: boolean;
  /** The latest payout, which floats up off the button as it lands. */
  reward: KoiReward | null;
  expanded: boolean;
  onClick: () => void;
};

export const KoiMarketButton = ({
  coins,
  hasNewStock,
  reward,
  expanded,
  onClick
}: KoiMarketButtonProps): JSX.Element => {
  const label = `Koi market, ${coins} coins${hasNewStock ? ', new koi today' : ''}`;

  return (
    <span className="market-action">
      <button
        type="button"
        className="header-action"
        onClick={onClick}
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={expanded}
        title="Koi market"
      >
        {/* A tancho: a white koi wearing one red crown, facing into the header. */}
        <svg
          className="market-icon"
          viewBox="0 0 24 24"
          width="24"
          height="24"
          aria-hidden="true"
          focusable="false"
        >
          <path
            d="M1.8 12c2.9-4.3 7.3-6.1 11.6-5.3 1.8.3 3.3 1.1 4.5 2.1l4.3-3v12.4l-4.3-3c-1.2 1-2.7 1.8-4.5 2.1-4.3.8-8.7-1-11.6-5.3Z"
            fill="currentColor"
            fillOpacity="0.16"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
          <circle cx="9" cy="10.3" r="2.4" fill="#e5484d" />
          <circle cx="5.1" cy="11.4" r="1" fill="currentColor" />
        </svg>
        {hasNewStock && <span className="market-dot" aria-hidden="true" />}
      </button>
      {reward && (
        <span key={reward.id} className="coin-pop" aria-hidden="true">
          +{reward.coins}
          <CoinIcon size={14} />
        </span>
      )}
      <span className="visually-hidden" role="status">
        {reward ? `Earned ${reward.coins} coins for a new branch.` : ''}
      </span>
    </span>
  );
};
