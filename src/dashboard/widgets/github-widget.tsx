import { useCallback, type JSX } from 'react';
import { GitFork, Star } from 'lucide-react';
import { useRemote } from '../hooks/use-remote';
import {
  fetchTrending,
  shortCount,
  trendingPageUrl,
  type GithubTrendingWidget as GithubTrendingWidgetConfig
} from '../lib/github';
import { WidgetSkeleton, WidgetState } from './widget-frame';
import '../shell.css';

/** The scraper runs a few times a day; an hour between looks is plenty. */
const TRENDING_TTL_MS = 60 * 60 * 1000;

/** Older than this, the list says how old it is: the scraper has been known to stall. */
const STALE_AFTER_MS = 2 * 24 * 60 * 60 * 1000;

const PERIOD: Readonly<Record<GithubTrendingWidgetConfig['since'], string>> = {
  daily: 'today',
  weekly: 'this week',
  monthly: 'this month'
};

export const GithubTrendingWidget = ({
  widget,
  newTab
}: {
  widget: GithubTrendingWidgetConfig;
  newTab: boolean;
}): JSX.Element => {
  const { language, since, count } = widget;
  const load = useCallback(
    (signal: AbortSignal) => fetchTrending(language, since, count, signal),
    [language, since, count]
  );
  const { data, error, refresh } = useRemote(
    `github:${since}:${language}:${count}`,
    TRENDING_TTL_MS,
    load
  );
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

  if (data.repos.length === 0) {
    return <WidgetState>Nothing is trending here right now.</WidgetState>;
  }

  const stale = data.publishedAt > 0 && Date.now() - data.publishedAt > STALE_AFTER_MS;

  return (
    <div className="gh">
      <ol className="gh-list">
        {data.repos.map((repo, index) => {
          const [owner, name] = repo.name.includes('/') ? repo.name.split('/') : ['', repo.name];

          return (
            <li key={repo.url} className="gh-item">
              <span className="gh-rank">{index + 1}</span>
              <div className="gh-text">
                <a className="gh-title" href={repo.url} target={target} rel="noreferrer noopener">
                  {owner && <span className="gh-owner">{owner} / </span>}
                  {name}
                </a>
                {repo.description && <p className="gh-desc">{repo.description}</p>}
                <span className="gh-meta">
                  {repo.language && (
                    <span>
                      <span
                        className="gh-lang"
                        style={repo.languageColor ? { background: repo.languageColor } : undefined}
                        aria-hidden="true"
                      />
                      {repo.language}
                    </span>
                  )}
                  <span title={`${repo.stars.toLocaleString()} stars`}>
                    <Star size={11} aria-hidden="true" /> {shortCount(repo.stars)}
                  </span>
                  <span title={`${repo.forks.toLocaleString()} forks`}>
                    <GitFork size={11} aria-hidden="true" /> {shortCount(repo.forks)}
                  </span>
                  {repo.gained > 0 && (
                    <span className="gh-gained">
                      +{shortCount(repo.gained)} {PERIOD[since]}
                    </span>
                  )}
                </span>
              </div>
            </li>
          );
        })}
      </ol>
      <p className="gh-foot">
        {stale && (
          <span className="gh-stale">
            Last updated{' '}
            {new Date(data.publishedAt).toLocaleDateString(undefined, {
              day: 'numeric',
              month: 'short'
            })}
            {' · '}
          </span>
        )}
        <a href={trendingPageUrl(language, since)} target={target} rel="noreferrer noopener">
          See all on GitHub
        </a>
      </p>
    </div>
  );
};
