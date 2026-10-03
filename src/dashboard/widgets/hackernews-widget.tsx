import { useCallback, type JSX } from 'react';
import { MessageSquare, TrendingUp } from 'lucide-react';
import { useRemote } from '../hooks/use-remote';
import type { HackerNewsWidget as HackerNewsWidgetConfig } from '../lib/model';
import { discussionUrl, fetchTopStories, timeAgo } from '../lib/hackernews';
import { WidgetSkeleton, WidgetState } from './widget-frame';

const NEWS_TTL_MS = 10 * 60 * 1000;

export const HackerNewsWidget = ({
  widget,
  newTab
}: {
  widget: HackerNewsWidgetConfig;
  newTab: boolean;
}): JSX.Element => {
  const load = useCallback(
    (signal: AbortSignal) => fetchTopStories(widget.count, signal),
    [widget.count]
  );
  const { data, error, refresh } = useRemote(`hackernews:${widget.count}`, NEWS_TTL_MS, load);
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
      <WidgetSkeleton rows={Math.min(widget.count, 5)} />
    );
  }

  return (
    <ol className="hn-list">
      {data.map((story, index) => (
        <li key={story.id} className="hn-item">
          <span className="hn-rank">{index + 1}</span>
          <div className="hn-text">
            <a className="hn-title" href={story.url} target={target} rel="noreferrer noopener">
              {story.title}
            </a>
            <span className="hn-meta">
              <span className="hn-host">{story.host}</span>
              <span>
                <TrendingUp size={11} aria-hidden="true" /> {story.score}
              </span>
              <a href={discussionUrl(story.id)} target={target} rel="noreferrer noopener">
                <MessageSquare size={11} aria-hidden="true" /> {story.comments}
              </a>
              <span>{timeAgo(story.time)}</span>
            </span>
          </div>
        </li>
      ))}
    </ol>
  );
};
