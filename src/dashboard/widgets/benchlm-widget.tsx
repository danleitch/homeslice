import { useCallback } from 'react';
import { useRemote } from '../hooks/use-remote';
import {
  fetchRankings,
  pickModels,
  type BenchmarkWidget as BenchmarkWidgetConfig
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
  const { surface, creator, count } = widget;
  const load = useCallback((signal: AbortSignal) => fetchRankings(surface, signal), [surface]);
  // One reading per ranking; picking a lab or a count reuses it.
  const { data, error, refresh } = useRemote(`benchlm:${surface}`, RANKINGS_TTL_MS, load);
  const target = newTab ? '_blank' : undefined;

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
      <WidgetSkeleton rows={Math.min(count, 5)} />
    );
  }

  const models = pickModels(data, creator, count);

  if (models.length === 0) {
    return (
      <WidgetState>
        {creator.trim() ? `No models from “${creator.trim()}” are ranked.` : 'Nothing is ranked.'}
      </WidgetState>
    );
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
              <span className="bench-creator">{model.creator}</span>
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
        {data.asOf && ` · scored ${formatDay(data.asOf)}`}
      </p>
    </div>
  );
};

const rangeTitle = (low: number | null, high: number | null): string | undefined =>
  low !== null && high !== null ? `90% range ${low.toFixed(1)}–${high.toFixed(1)}` : undefined;

const formatDay = (day: string): string => {
  const date = new Date(`${day}T12:00:00`);
  return Number.isNaN(date.getTime())
    ? day
    : date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
};
