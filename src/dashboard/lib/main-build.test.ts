import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchMainBuild, readMainBuild, watchesMain } from './main-build';
import { createWidget, type PullsWidget } from './model';

const signal = new AbortController().signal;
const TOKEN = 'github_pat_11ABCDEFG0abcdefghijklmnopqrstuvwxyz';
const NOW = Date.parse('2026-10-08T12:00:00Z');

const answer = (commit: Record<string, unknown> = {}, branch: Record<string, unknown> = {}) => ({
  repository: {
    nameWithOwner: 'danleitch/homeslice',
    defaultBranchRef: {
      name: 'main',
      target: {
        messageHeadline: 'Add a widget gallery (#2)',
        url: 'https://github.com/danleitch/homeslice/commit/89ebe48',
        committedDate: '2026-10-08T10:00:00Z',
        statusCheckRollup: { state: 'SUCCESS' },
        ...commit
      },
      ...branch
    }
  }
});

const json = (body: unknown, init: ResponseInit = {}): Response =>
  new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' }, ...init });

describe('readMainBuild', () => {
  it('reads the latest commit on the main branch and how its checks are going', () => {
    expect(readMainBuild(answer(), NOW)).toEqual({
      repo: 'danleitch/homeslice',
      branch: 'main',
      checks: 'passing',
      headline: 'Add a widget gallery (#2)',
      url: 'https://github.com/danleitch/homeslice/commit/89ebe48',
      committed: Date.parse('2026-10-08T10:00:00Z') / 1000
    });
  });

  it.each([
    ['SUCCESS', 'passing'],
    ['FAILURE', 'failing'],
    ['ERROR', 'failing'],
    ['PENDING', 'pending'],
    ['EXPECTED', 'pending']
  ])('calls a roll-up of %s %s', (state, checks) => {
    expect(readMainBuild(answer({ statusCheckRollup: { state } }), NOW)?.checks).toBe(checks);
  });

  it('has no checks to report on an old commit that has none', () => {
    expect(readMainBuild(answer({ statusCheckRollup: null }), NOW)?.checks).toBe('none');
  });

  it('takes a commit with no checks yet, just pushed, as running, since they start a moment later', () => {
    const just = (seconds: number) =>
      answer({
        statusCheckRollup: null,
        committedDate: new Date(NOW - seconds * 1000).toISOString()
      });

    expect(readMainBuild(just(30), NOW)?.checks).toBe('pending');
    expect(readMainBuild(just(119), NOW)?.checks).toBe('pending');
    expect(readMainBuild(just(121), NOW)?.checks).toBe('none');
  });

  it('trusts the checks it is given over how young the commit is', () => {
    const recent = new Date(NOW - 10_000).toISOString();

    expect(
      readMainBuild(answer({ committedDate: recent, statusCheckRollup: { state: 'FAILURE' } }), NOW)
        ?.checks
    ).toBe('failing');
  });

  it('copes with a date it cannot read', () => {
    const build = readMainBuild(
      answer({ committedDate: 'yesterday', statusCheckRollup: null }),
      NOW
    );

    expect(build).toMatchObject({ checks: 'none', committed: 0 });
  });

  it('shortens what is long', () => {
    const build = readMainBuild(answer({ messageHeadline: 'x'.repeat(500) }), NOW);

    expect(build?.headline).toHaveLength(200);
  });

  it('links only to github.com, whatever the answer says', () => {
    expect(readMainBuild(answer({ url: 'https://evil.example/commit/1' }), NOW)).toBeNull();
    expect(readMainBuild(answer({ url: 'javascript:alert(1)' }), NOW)).toBeNull();
    expect(readMainBuild(answer({ url: undefined }), NOW)).toBeNull();
  });

  it.each([
    ['nothing', null],
    ['no repository', { repository: null }],
    ['a repository with no commits', { repository: { defaultBranchRef: null } }],
    ['text', 'main'],
    ['a list', [1]]
  ])('reads nothing from %s', (_name, value) => {
    expect(readMainBuild(value, NOW)).toBeNull();
  });

  it('uses the clock when it is not given one', () => {
    const fresh = answer({
      statusCheckRollup: null,
      committedDate: new Date().toISOString()
    });

    expect(readMainBuild(fresh)?.checks).toBe('pending');
  });
});

describe('watchesMain', () => {
  it('is a My PRs widget with a repository and a token', () => {
    const prs = createWidget('prs') as PullsWidget;

    expect(watchesMain({ ...prs, repo: 'acme/web', token: TOKEN })).toBe(true);
    expect(watchesMain({ ...prs, repo: '', token: TOKEN })).toBe(false);
    expect(watchesMain({ ...prs, repo: 'acme/web', token: '' })).toBe(false);
    expect(watchesMain(createWidget('github'))).toBe(false);
  });
});

describe('fetchMainBuild', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const serve = (response: Response) => {
    const fetchMock = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(
      async () => response
    );
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  };

  it('asks GitHub for the repository’s default branch, with the token', async () => {
    const fetchMock = serve(json({ data: answer() }));

    const build = await fetchMainBuild(' danleitch/homeslice ', TOKEN, signal);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.github.com/graphql');
    expect(init).toMatchObject({ method: 'POST', signal });
    expect(init.headers).toEqual({
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json'
    });
    expect(JSON.parse(String(init.body)).variables).toEqual({
      owner: 'danleitch',
      name: 'homeslice'
    });
    expect(build).toMatchObject({ repo: 'danleitch/homeslice', branch: 'main' });
  });

  it('asks for a pasted address as the repository it is', async () => {
    const fetchMock = serve(json({ data: answer() }));

    await fetchMainBuild('https://github.com/acme/web.git', TOKEN, signal);

    expect(JSON.parse(String(fetchMock.mock.calls[0]![1].body)).variables).toEqual({
      owner: 'acme',
      name: 'web'
    });
  });

  it('asks nothing of GitHub for something that is not a repository', async () => {
    const fetchMock = serve(json({ data: answer() }));

    await expect(fetchMainBuild('homeslice', TOKEN, signal)).rejects.toThrow(
      'That isn’t a repository. Write it as owner/name.'
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('says so when the repository is not there, or the token cannot see it', async () => {
    serve(
      json({
        data: { repository: null },
        errors: [{ type: 'NOT_FOUND', message: 'Could not resolve to a Repository' }]
      })
    );

    await expect(fetchMainBuild('acme/web', TOKEN, signal)).rejects.toThrow(
      'GitHub shows no commits on acme/web, or this token can’t see it.'
    );
  });

  it('says so when the token is not accepted', async () => {
    serve(json({ message: 'Bad credentials' }, { status: 401 }));

    await expect(fetchMainBuild('acme/web', TOKEN, signal)).rejects.toThrow(
      'GitHub didn’t accept the token.'
    );
  });
});
