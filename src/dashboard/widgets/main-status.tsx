import { useCallback, useState, type JSX } from 'react';
import { noDrag } from '../components/no-drag';
import { useRemote } from '../hooks/use-remote';
import { fingerprint } from '../lib/fingerprint';
import { timeAgo } from '../lib/hackernews';
import { MAIN_IDLE_MS, MAIN_POLL_MS, fetchMainBuild, watchesMain } from '../lib/main-build';
import type { Widget } from '../lib/model';
import type { Checks } from '../lib/pulls';
import '../prs.css';

const LABELS: Readonly<Record<Checks, string>> = {
  pending: 'Checks running',
  passing: 'Checks passing',
  failing: 'Checks failing',
  none: 'No checks'
};

const MainLight = ({
  repo,
  token,
  newTab
}: {
  repo: string;
  token: string;
  newTab: boolean;
}): JSX.Element => {
  // Looked at every few seconds while the checks run, and only now and then once they are done.
  const [running, setRunning] = useState(false);
  const load = useCallback(
    (signal: AbortSignal) => fetchMainBuild(repo, token, signal),
    [repo, token]
  );
  // The token is part of the reading's identity, but isn't spelled out in the cache's key.
  const { data, error, refresh } = useRemote(
    `mainbuild:${repo}:${fingerprint(token)}`,
    running ? MAIN_POLL_MS : MAIN_IDLE_MS,
    load
  );
  const pending = data?.checks === 'pending';

  if (pending !== running) {
    setRunning(pending);
  }

  if (!data) {
    return error ? (
      <button
        type="button"
        className="wdg-light"
        data-state="unknown"
        aria-label={`Couldn’t check ${repo}: ${error}`}
        title={`${error} Click to try again.`}
        {...noDrag}
        onClick={refresh}
      />
    ) : (
      <span
        className="wdg-light"
        data-state="unknown"
        role="img"
        aria-label={`Checking ${repo}`}
        title={`Checking ${repo}…`}
      />
    );
  }

  const summary = `${data.repo || repo} ${data.branch}: ${LABELS[data.checks].toLowerCase()}`;

  return (
    <a
      className="wdg-light"
      data-state={data.checks}
      href={data.url}
      target={newTab ? '_blank' : undefined}
      rel="noreferrer noopener"
      aria-label={summary}
      title={[
        summary,
        data.headline,
        data.committed > 0 ? `Pushed ${timeAgo(data.committed)} ago` : ''
      ]
        .filter(Boolean)
        .join('\n')}
      {...noDrag}
    />
  );
};

/**
 * The light in the corner of a My PRs widget that has a repository to watch: the state of the
 * checks on the latest push to its main branch. Nothing for any other widget.
 */
export const WidgetLight = ({
  widget,
  newTab
}: {
  widget: Widget;
  newTab: boolean;
}): JSX.Element | null =>
  watchesMain(widget) ? (
    <MainLight repo={widget.repo} token={widget.token} newTab={newTab} />
  ) : null;
