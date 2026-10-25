import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SampleReadings } from '../hooks/use-remote';
import { MAIN_IDLE_MS, MAIN_POLL_MS, fetchMainBuild, type MainBuild } from '../lib/main-build';
import { createWidget, type PullsWidget } from '../lib/model';
import { WidgetLight } from './main-status';

vi.mock('../lib/main-build', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/main-build')>()),
  fetchMainBuild: vi.fn()
}));

const TOKEN = 'github_pat_11ABCDEFG0abcdefghijklmnopqrstuvwxyz';

const build = (rest: Partial<MainBuild> = {}): MainBuild => ({
  repo: 'danleitch/homeslice',
  branch: 'main',
  checks: 'passing',
  headline: 'Add a widget gallery (#2)',
  url: 'https://github.com/danleitch/homeslice/commit/89ebe48',
  committed: Date.now() / 1000 - 5 * 60,
  ...rest
});

const widgetOf = (patch: Partial<PullsWidget> = {}): PullsWidget => ({
  ...(createWidget('prs') as PullsWidget),
  token: TOKEN,
  repo: 'danleitch/homeslice',
  ...patch
});

const show = (patch: Partial<PullsWidget> = {}, newTab = false) =>
  render(<WidgetLight widget={widgetOf(patch)} newTab={newTab} />);

beforeEach(() => {
  window.localStorage.clear();
  vi.mocked(fetchMainBuild).mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('WidgetLight', () => {
  it('is nothing for a widget with no repository to watch, and asks GitHub nothing', () => {
    const { container } = show({ repo: '' });

    expect(container).toBeEmptyDOMElement();
    expect(fetchMainBuild).not.toHaveBeenCalled();
  });

  it('is nothing until there is a token, and nothing for another kind of widget', () => {
    const noToken = show({ token: '' });
    expect(noToken.container).toBeEmptyDOMElement();

    const other = render(<WidgetLight widget={createWidget('github')} newTab={false} />);
    expect(other.container).toBeEmptyDOMElement();
    expect(fetchMainBuild).not.toHaveBeenCalled();
  });

  it('is grey while it looks', () => {
    vi.mocked(fetchMainBuild).mockReturnValue(new Promise(() => undefined));
    show();

    const light = screen.getByRole('img', { name: 'Checking danleitch/homeslice' });
    expect(light).toHaveAttribute('data-state', 'unknown');
  });

  it('looks at the repository with the widget’s token', async () => {
    vi.mocked(fetchMainBuild).mockResolvedValue(build());
    show();

    await screen.findByRole('link');
    expect(fetchMainBuild).toHaveBeenCalledWith(
      'danleitch/homeslice',
      TOKEN,
      expect.any(AbortSignal)
    );
  });

  it('is green with a link to the commit once its checks have passed', async () => {
    vi.mocked(fetchMainBuild).mockResolvedValue(build());
    show();

    const light = await screen.findByRole('link', {
      name: 'danleitch/homeslice main: checks passing'
    });
    expect(light).toHaveAttribute('data-state', 'passing');
    expect(light).toHaveAttribute('href', 'https://github.com/danleitch/homeslice/commit/89ebe48');
    expect(light).toHaveAttribute('title', expect.stringContaining('Add a widget gallery (#2)'));
    expect(light).toHaveAttribute('title', expect.stringContaining('Pushed 5m ago'));
    expect(light).not.toHaveAttribute('target');
  });

  it('is red when they failed, and amber while they run', async () => {
    vi.mocked(fetchMainBuild).mockResolvedValue(build({ checks: 'failing' }));
    const failed = show();
    expect(await failed.findByRole('link', { name: /checks failing/ })).toHaveAttribute(
      'data-state',
      'failing'
    );
    failed.unmount();

    window.localStorage.clear();
    vi.mocked(fetchMainBuild).mockResolvedValue(build({ checks: 'pending' }));
    show();
    expect(await screen.findByRole('link', { name: /checks running/ })).toHaveAttribute(
      'data-state',
      'pending'
    );
  });

  it('is hollow for a repository with no checks, and leaves out a push time it does not have', async () => {
    vi.mocked(fetchMainBuild).mockResolvedValue(build({ checks: 'none', committed: 0 }));
    show();

    const light = await screen.findByRole('link', { name: /no checks/ });
    expect(light).toHaveAttribute('data-state', 'none');
    expect(light.getAttribute('title')).not.toContain('Pushed');
  });

  it('opens the commit in a new tab when links do', async () => {
    vi.mocked(fetchMainBuild).mockResolvedValue(build());
    show({}, true);

    expect(await screen.findByRole('link')).toHaveAttribute('target', '_blank');
  });

  it('says what went wrong, and tries again when it is pressed', async () => {
    vi.mocked(fetchMainBuild).mockRejectedValueOnce(new Error('GitHub didn’t answer.'));
    vi.mocked(fetchMainBuild).mockResolvedValue(build());
    show();

    const retry = await screen.findByRole('button', {
      name: 'Couldn’t check danleitch/homeslice: GitHub didn’t answer.'
    });
    expect(retry).toHaveAttribute('data-state', 'unknown');
    expect(retry).toHaveAttribute('title', 'GitHub didn’t answer. Click to try again.');

    await userEvent.click(retry);

    expect(await screen.findByRole('link', { name: /checks passing/ })).toBeInTheDocument();
    expect(fetchMainBuild).toHaveBeenCalledTimes(2);
  });

  it('keeps the last reading when a later look fails', async () => {
    vi.useFakeTimers();
    vi.mocked(fetchMainBuild).mockResolvedValueOnce(build({ checks: 'pending' }));
    vi.mocked(fetchMainBuild).mockRejectedValue(new Error('GitHub didn’t answer.'));
    show();
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(screen.getByRole('link', { name: /checks running/ })).toBeInTheDocument();

    await act(() => vi.advanceTimersByTimeAsync(MAIN_POLL_MS + 1000));

    expect(fetchMainBuild).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('link', { name: /checks running/ })).toBeInTheDocument();
  });

  describe('as time goes by', () => {
    it('looks again every few seconds while the checks run, and turns green when they are done', async () => {
      vi.useFakeTimers();
      vi.mocked(fetchMainBuild)
        .mockResolvedValueOnce(build({ checks: 'pending' }))
        .mockResolvedValueOnce(build({ checks: 'pending' }))
        .mockResolvedValue(build({ checks: 'passing' }));
      show();

      await act(() => vi.advanceTimersByTimeAsync(0));
      expect(fetchMainBuild).toHaveBeenCalledTimes(1);
      expect(screen.getByRole('link')).toHaveAttribute('data-state', 'pending');

      await act(() => vi.advanceTimersByTimeAsync(MAIN_POLL_MS + 1000));
      expect(fetchMainBuild).toHaveBeenCalledTimes(2);
      expect(screen.getByRole('link')).toHaveAttribute('data-state', 'pending');

      await act(() => vi.advanceTimersByTimeAsync(MAIN_POLL_MS + 1000));
      expect(fetchMainBuild).toHaveBeenCalledTimes(3);
      expect(screen.getByRole('link')).toHaveAttribute('data-state', 'passing');
    });

    it('stops looking every few seconds once they are done, and looks now and then for a newer push', async () => {
      vi.useFakeTimers();
      vi.mocked(fetchMainBuild)
        .mockResolvedValueOnce(build({ checks: 'pending' }))
        .mockResolvedValue(build({ checks: 'failing' }));
      show();
      await act(() => vi.advanceTimersByTimeAsync(0));

      await act(() => vi.advanceTimersByTimeAsync(MAIN_POLL_MS + 1000));
      expect(fetchMainBuild).toHaveBeenCalledTimes(2);
      expect(screen.getByRole('link')).toHaveAttribute('data-state', 'failing');

      // A minute on, at the old pace there would have been three more looks.
      await act(() => vi.advanceTimersByTimeAsync(60 * 1000));
      expect(fetchMainBuild).toHaveBeenCalledTimes(2);

      await act(() => vi.advanceTimersByTimeAsync(MAIN_IDLE_MS));
      expect(fetchMainBuild).toHaveBeenCalledTimes(3);
    });

    it('picks up a newer push, and pulses again while it is built', async () => {
      vi.useFakeTimers();
      vi.mocked(fetchMainBuild)
        .mockResolvedValueOnce(build({ checks: 'passing' }))
        .mockResolvedValueOnce(build({ checks: 'pending', headline: 'The next change' }))
        .mockResolvedValue(build({ checks: 'pending', headline: 'The next change' }));
      show();
      await act(() => vi.advanceTimersByTimeAsync(0));
      expect(screen.getByRole('link')).toHaveAttribute('data-state', 'passing');

      await act(() => vi.advanceTimersByTimeAsync(MAIN_IDLE_MS + 1000));
      expect(screen.getByRole('link')).toHaveAttribute('data-state', 'pending');
      expect(fetchMainBuild).toHaveBeenCalledTimes(2);

      await act(() => vi.advanceTimersByTimeAsync(MAIN_POLL_MS + 1000));
      expect(fetchMainBuild).toHaveBeenCalledTimes(3);
    });
  });

  it('shows the sample reading, and asks GitHub nothing, in the gallery', () => {
    render(
      <SampleReadings.Provider value={() => build({ checks: 'pending' })}>
        <WidgetLight widget={widgetOf({ token: 'sample', repo: 'acme/web' })} newTab={false} />
      </SampleReadings.Provider>
    );

    expect(screen.getByRole('link', { name: /checks running/ })).toBeInTheDocument();
    expect(fetchMainBuild).not.toHaveBeenCalled();
  });
});
