import { useCallback, useId, type JSX } from 'react';
import { useRemote } from '../hooks/use-remote';
import type { MarketsWidget as MarketsWidgetConfig } from '../lib/model';
import { fetchQuotes, formatPrice, sparkline, type Quote } from '../lib/markets';
import { THIN_LIQUIDITY, compactUsd } from '../lib/tokens';
import { WidgetSkeleton, WidgetState } from './widget-frame';

const MARKETS_TTL_MS = 15 * 60 * 1000;
const CHART_WIDTH = 96;
const CHART_HEIGHT = 32;

const Sparkline = ({ quote }: { quote: Quote }): JSX.Element => {
  const gradient = useId();
  const { line, area } = sparkline(quote.closes, CHART_WIDTH, CHART_HEIGHT);
  const tone = quote.change > 0 ? 'up' : quote.change < 0 ? 'down' : 'flat';

  return (
    <svg
      className={`mkt-chart mkt-chart--${tone}`}
      viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradient} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.28" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradient})`} />
      <path
        d={line}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
};

export const MarketsWidget = ({ widget }: { widget: MarketsWidgetConfig }): JSX.Element => {
  const key = widget.symbols.map((item) => `${item.symbol}=${item.name}`).join(',');
  const load = useCallback(
    (signal: AbortSignal) => fetchQuotes(widget.symbols, signal),
    // The key spells out every symbol and name, so it stands in for the array.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key]
  );
  const { data, error, refresh } = useRemote(`markets:${key}`, MARKETS_TTL_MS, load);

  if (widget.symbols.length === 0) {
    return <WidgetState>Add a symbol or two in this widget’s settings.</WidgetState>;
  }

  if (!data) {
    return error ? (
      <WidgetState
        tone="error"
        action={
          <button type="button" className="link-btn" onClick={refresh}>
            Try again
          </button>
        }
      >
        {error}
      </WidgetState>
    ) : (
      <WidgetSkeleton rows={widget.symbols.length} />
    );
  }

  return (
    <ul className="mkt-list">
      {data.map((quote, index) => (
        <li key={`${quote.symbol}:${index}`} className="mkt-row">
          <a
            className="mkt-link"
            href={
              quote.url ?? `https://finance.yahoo.com/quote/${encodeURIComponent(quote.symbol)}`
            }
            target="_blank"
            rel="noreferrer noopener"
          >
            <span className="mkt-id">
              <span className="mkt-symbol">{quote.symbol}</span>
              <span className="mkt-name">{quote.name}</span>
              {quote.liquidity !== undefined && (
                <span
                  className="mkt-liq"
                  data-thin={quote.liquidity < THIN_LIQUIDITY ? '' : undefined}
                  title="The money in the pool this price comes from. In a small pool, a few trades move the price a long way."
                >
                  {compactUsd(quote.liquidity)} liquidity
                </span>
              )}
            </span>
            <Sparkline quote={quote} />
            <span className="mkt-values">
              <span className="mkt-price">{formatPrice(quote)}</span>
              <span
                className={`mkt-change mkt-change--${quote.change > 0 ? 'up' : quote.change < 0 ? 'down' : 'flat'}`}
              >
                {quote.change > 0 ? '+' : ''}
                {quote.change.toFixed(2)}%
              </span>
            </span>
          </a>
        </li>
      ))}
    </ul>
  );
};
