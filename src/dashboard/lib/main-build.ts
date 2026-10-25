import type { Widget } from './model';
import { ask, checksOf, readRepo, type Checks, type PullsWidget } from './pulls';

/**
 * How the latest push to a repository's main branch is doing: the same roll-up of checks and
 * statuses that GitHub puts beside a commit, read with the token the My PRs widget already has.
 */
export type MainBuild = {
  /** owner/name */
  repo: string;
  /** The branch it is about; the repository's default one, which is usually main. */
  branch: string;
  /** The state of the checks: running, passing, failing, or none to speak of. */
  checks: Checks;
  /** The first line of the commit's message. */
  headline: string;
  /** The commit's page on github.com, where its checks are listed. */
  url: string;
  /** Seconds since 1970, as the other widgets' time-ago takes. */
  committed: number;
};

/** Whether a widget has a light: a My PRs widget with a repository to watch and a token to watch it. */
export const watchesMain = (widget: Widget): widget is PullsWidget =>
  widget.type === 'prs' && Boolean(widget.repo && widget.token);

/** While the checks are running, how often they are looked at again. */
export const MAIN_POLL_MS = 20 * 1000;

/** Once they are done, how often to look for a newer push. */
export const MAIN_IDLE_MS = 2 * 60 * 1000;

/** A push has checks a moment after it lands; until then a commit this young is taken as running. */
const GRACE_SECONDS = 2 * 60;

const QUERY = `query($owner: String!, $name: String!) {
  repository(owner: $owner, name: $name) {
    nameWithOwner
    defaultBranchRef {
      name
      target {
        ... on Commit { messageHeadline url committedDate statusCheckRollup { state } }
      }
    }
  }
}`;

const object = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const text = (value: unknown, max: number): string =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';

/** The build of the latest commit on the repository's main branch, as GitHub answers it. */
export const readMainBuild = (answer: unknown, now = Date.now()): MainBuild | null => {
  const repository = object(object(answer).repository);
  const branch = object(repository.defaultBranchRef);
  const commit = object(branch.target);
  const url = text(commit.url, 300);

  // Only a github.com address is linked, whatever the answer says.
  if (!/^https:\/\/github\.com\//.test(url)) {
    return null;
  }

  const committed = Math.floor(Date.parse(text(commit.committedDate, 40)) / 1000);
  const checks = checksOf(object(commit.statusCheckRollup).state);

  return {
    repo: text(repository.nameWithOwner, 140),
    branch: text(branch.name, 100),
    checks:
      checks === 'none' && Number.isFinite(committed) && now / 1000 - committed < GRACE_SECONDS
        ? 'pending'
        : checks,
    headline: text(commit.messageHeadline, 200),
    url,
    committed: Number.isFinite(committed) ? committed : 0
  };
};

/** Looks at the latest push to the repository's main branch. */
export const fetchMainBuild = async (
  repo: string,
  token: string,
  signal: AbortSignal
): Promise<MainBuild> => {
  const named = readRepo(repo);

  if (!named) {
    throw new Error('That isn’t a repository. Write it as owner/name.');
  }

  const [owner = '', name = ''] = named.split('/');
  const found = await ask(token, QUERY, { owner, name }, signal);
  const build = readMainBuild(found);

  if (!build) {
    throw new Error(`GitHub shows no commits on ${named}, or this token can’t see it.`);
  }

  return build;
};
