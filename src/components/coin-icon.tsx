import type { JSX } from 'react';

type CoinIconProps = {
  size?: number;
};

/**
 * The market's coin: a gold disc with a square hole, after the old mon coins
 * that were strung through the middle.
 */
export const CoinIcon = ({ size = 16 }: CoinIconProps): JSX.Element => (
  <svg
    className="coin-icon"
    viewBox="0 0 16 16"
    width={size}
    height={size}
    aria-hidden="true"
    focusable="false"
  >
    <circle cx="8" cy="8" r="7.25" fill="#f2b632" stroke="#b9831b" strokeWidth="1.1" />
    <circle cx="8" cy="8" r="5" fill="none" stroke="#fbd978" strokeWidth="0.9" />
    <rect x="6.3" y="6.3" width="3.4" height="3.4" rx="0.4" fill="#7a5410" />
  </svg>
);

type CoinAmountProps = {
  coins: number;
  className?: string;
};

/** A coin amount as it reads everywhere in the market: icon, then number. */
export const CoinAmount = ({ coins, className }: CoinAmountProps): JSX.Element => (
  <span className={['coin-amount', className].filter(Boolean).join(' ')}>
    <CoinIcon />
    {coins.toLocaleString()}
  </span>
);
