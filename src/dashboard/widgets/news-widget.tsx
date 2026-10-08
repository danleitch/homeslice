import { useCallback, type JSX } from 'react';
import { useRemote } from '../hooks/use-remote';
import { timeAgo } from '../lib/hackernews';
import { feedOf, type NewsWidget as NewsWidgetConfig } from '../lib/news';
import { fetchNews } from '../lib/rss';
import { WidgetSkeleton, WidgetState } from './widget-frame';
import '../shell.css';

/** The relay keeps a feed for ten minutes; the page looks a little less often. */
const NEWS_TTL_MS = 15 * 60 * 1000;

export const NewsWidget = ({
  widget,
  newTab
}: {
  widget: NewsWidgetConfig;
  newTab: boolean;
}): JSX.Element => {
  const { feed: id, count } = widget;
  const feed = feedOf(id);
  const load = useCallback((signal: AbortSignal) => fetchNews(feed.id, signal), [feed.id]);
  // One reading per feed; the widget shows as many of its headlines as it is set to.
  const { data, error, refresh } = useRemote(`news:${feed.id}`, NEWS_TTL_MS, load);
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

  if (data.length === 0) {
    return <WidgetState>Nothing new in this feed.</WidgetState>;
  }

  return (
    <div className="nw">
      <ul className="nw-list">
        {data.slice(0, count).map((item, index) => (
          <li key={`${item.url}:${index}`} className="nw-item">
            <a className="nw-title" href={item.url} target={target} rel="noreferrer noopener">
              {item.title}
            </a>
            {item.time > 0 && <span className="nw-time">{timeAgo(item.time)}</span>}
          </li>
        ))}
      </ul>
      <p className="wdg-foot">
        From{' '}
        <a href={feed.site} target={target} rel="noreferrer noopener">
          {feed.name}
        </a>
      </p>
    </div>
  );
};
