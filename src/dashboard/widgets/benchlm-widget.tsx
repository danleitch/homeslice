import { useCallback, type JSX } from 'react';
import { useRemote } from '../hooks/use-remote';
import {
  fetchPrices,
  fetchRankings,
  pickModels,
  priceOf,
  type BenchmarkWidget as BenchmarkWidgetConfig,
  type PricedModel,
  type Prices,
  type Rankings
} from '../lib/benchlm';
import { WidgetSkeleton, WidgetState } from './widget-frame';
import '../shell.css';

/**
 * The server keeps BenchLM's answer for half a week; the page looks twice a
 * day, which costs nothing past the server's copy.
 */
const RANKINGS_TTL_MS = 12 * 60 * 60 * 1000;

export const BenchmarkWidget = ({
  widget,
  newTab
}: {
  widget: BenchmarkWidgetConfig;
  newTab: boolean;
}): JSX.Element => {
  const { surface, creator, count, maxPrice } = widget;
  const load = useCallback((signal: AbortSignal) => fetchRankings(surface, signal), [surface]);
  // One reading per ranking; picking a lab or a count reuses it.
  const { data, error, refresh } = useRemote(`benchlm:${surface}`, RANKINGS_TTL_MS, load);

  if (!data) {
    return error ? (
      <RetryState error={error} onRetry={refresh} />
    ) : (
      <WidgetSkeleton rows={Math.min(count, 5)} />
    );
  }

  return maxPrice > 0 ? (
    <BudgetBoard widget={widget} rankings={data} newTab={newTab} />
  ) : (
    <Board
      models={pickModels(data, creator, count)}
      asOf={data.asOf}
      creator={creator}
      maxPrice={0}
      newTab={newTab}
    />
  );
};

/** The price list is only read, and only asked for, when the widget has a price limit. */
const BudgetBoard = ({
  widget,
  rankings,
  newTab
}: {
  widget: BenchmarkWidgetConfig;
  rankings: Rankings;
  newTab: boolean;
}): JSX.Element => {
  const { creator, count, maxPrice } = widget;
  const load = useCallback((signal: AbortSignal) => fetchPrices(signal), []);
  const { data: prices, error, refresh } = useRemote('benchlm:prices', RANKINGS_TTL_MS, load);

  if (!prices) {
    return error ? (
      <RetryState error={error} onRetry={refresh} />
    ) : (
      <WidgetSkeleton rows={Math.min(count, 5)} />
    );
  }

  return (
    <Board
      models={pickModels(rankings, creator, count, maxPrice, prices)}
      asOf={rankings.asOf}
      creator={creator}
      maxPrice={maxPrice}
      unpriced={unpricedCount(rankings, prices)}
      total={rankings.models.length}
      newTab={newTab}
    />
  );
};

const RetryState = ({ error, onRetry }: { error: string; onRetry: () => void }): JSX.Element => (
  <WidgetState
    tone="error"
    action={
      <button type="button" className="link-btn" onClick={onRetry}>
        Try again
      </button>
    }
  >
    {error}
  </WidgetState>
);

const Board = ({
  models,
  asOf,
  creator,
  maxPrice,
  unpriced = 0,
  total = 0,
  newTab
}: {
  models: PricedModel[];
  asOf: string;
  creator: string;
  maxPrice: number;
  /** How many of the `total` ranked models have no listed price, when prices are in play. */
  unpriced?: number;
  total?: number;
  newTab: boolean;
}): JSX.Element => {
  const target = newTab ? '_blank' : undefined;

  if (models.length === 0) {
    return <WidgetState>{emptyText(creator, maxPrice)}</WidgetState>;
  }

  const top = models[0].score;

  return (
    <div className="bench">
      <ol className="bench-list">
        {models.map((model) => (
          <li key={`${model.rank}-${model.name}`} className="bench-item">
            <span className="bench-rank">{model.rank}</span>
            <div className="bench-text">
              <span className="bench-name">{model.name}</span>
              <span className="bench-creator">
                {model.creator}
                {model.price &&
                  ` · ${formatPrice(model.price.input)} / ${formatPrice(model.price.output)}`}
              </span>
            </div>
            <span className="bench-score" title={rangeTitle(model.low, model.high)}>
              {model.score.toFixed(1)}
            </span>
            {/* Bars are measured against the leader, so close races look close. */}
            <span className="bench-bar" aria-hidden="true">
              <span style={{ width: `${Math.max(4, (model.score / top) * 100)}%` }} />
            </span>
          </li>
        ))}
      </ol>
      <p className="wdg-foot">
        Data from{' '}
        <a href="https://benchlm.ai" target={target} rel="noreferrer noopener">
          BenchLM.ai
        </a>
        {asOf && ` · scored ${formatDay(asOf)}`}
        {maxPrice > 0 && ' · $ per million tokens, in / out'}
        {unpriced > 0 && ` · ${unpriced} of ${total} have no listed price`}
      </p>
    </div>
  );
};

const unpricedCount = (rankings: Rankings, prices: Prices): number =>
  rankings.models.filter((model) => priceOf(prices, model.name) === null).length;

const emptyText = (creator: string, maxPrice: number): string => {
  const lab = creator.trim();

  if (maxPrice > 0) {
    const limit = `under ${formatPrice(maxPrice)} per million tokens`;
    return lab ? `No models from “${lab}” are ranked ${limit}.` : `No ranked models cost ${limit}.`;
  }

  return lab ? `No models from “${lab}” are ranked.` : 'Nothing is ranked.';
};

/** Cents, and a third decimal only where it matters: $0.075, but $0.40 and $10.00. */
const formatPrice = (dollars: number): string => {
  const fixed = dollars.toFixed(3);
  return `$${fixed.endsWith('0') ? fixed.slice(0, -1) : fixed}`;
};

const rangeTitle = (low: number | null, high: number | null): string | undefined =>
  low !== null && high !== null ? `90% range ${low.toFixed(1)}–${high.toFixed(1)}` : undefined;

const formatDay = (day: string): string => {
  const date = new Date(`${day}T12:00:00`);
  return Number.isNaN(date.getTime())
    ? day
    : date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
};
