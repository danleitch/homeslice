import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppSheet } from './app-sheet';

const app = { id: 'gizmo', name: 'Gizmo', url: 'https://gizmo.example.com/play' };
const SLOW_LOAD_MS = 6000;

const frame = (): HTMLIFrameElement => screen.getByTitle('Gizmo') as HTMLIFrameElement;
const dialog = (): HTMLElement => screen.getByRole('dialog', { name: 'Gizmo' });

describe('AppSheet', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('frames the app at its own address, saying what it is and where it runs', () => {
    render(<AppSheet app={app} onClose={vi.fn()} />);

    expect(frame()).toHaveAttribute('src', 'https://gizmo.example.com/play');
    expect(screen.getByText('gizmo.example.com/play')).toBeInTheDocument();
    expect(dialog()).toHaveAttribute('aria-modal', 'true');
  });

  it('shows the address without its scheme, for http as well', () => {
    render(<AppSheet app={{ ...app, url: 'http://gizmo.lan:8080/' }} onClose={vi.fn()} />);

    expect(screen.getByText('gizmo.lan:8080/')).toBeInTheDocument();
  });

  it('lets the app do its work, but not reach into the board, or say where it came from', () => {
    render(<AppSheet app={app} onClose={vi.fn()} />);

    const sandbox = frame().getAttribute('sandbox')!.split(' ');

    expect(sandbox).toEqual(expect.arrayContaining(['allow-scripts', 'allow-same-origin']));
    expect(sandbox).not.toContain('allow-top-navigation');
    expect(frame()).toHaveAttribute('referrerpolicy', 'no-referrer');
  });

  it('says it is opening the app until the app has loaded', () => {
    render(<AppSheet app={app} onClose={vi.fn()} />);

    expect(screen.getByRole('status')).toHaveTextContent('Opening Gizmo…');
    expect(frame()).not.toHaveAttribute('data-loaded');

    fireEvent.load(frame());

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(frame()).toHaveAttribute('data-loaded');
  });

  it('offers a way out when the app is slow, in case it never shows', () => {
    render(<AppSheet app={app} onClose={vi.fn()} />);

    act(() => {
      vi.advanceTimersByTime(SLOW_LOAD_MS - 1);
    });
    expect(screen.getByRole('status')).toHaveTextContent('Opening Gizmo…');

    act(() => {
      vi.advanceTimersByTime(1);
    });

    expect(screen.getByRole('status')).toHaveTextContent('Still waiting on Gizmo');
    expect(screen.getByRole('link', { name: 'Open it in a tab' })).toHaveAttribute('href', app.url);
  });

  it('does not nag once the app has loaded', () => {
    render(<AppSheet app={app} onClose={vi.fn()} />);

    fireEvent.load(frame());
    act(() => {
      vi.advanceTimersByTime(SLOW_LOAD_MS * 2);
    });

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('starts again when reloaded: a new frame, and the opening message, and a fresh wait', () => {
    render(<AppSheet app={app} onClose={vi.fn()} />);
    const first = frame();

    fireEvent.load(first);
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Reload Gizmo' }));
    });

    expect(frame()).not.toBe(first);
    expect(screen.getByRole('status')).toHaveTextContent('Opening Gizmo…');

    act(() => {
      vi.advanceTimersByTime(SLOW_LOAD_MS);
    });

    expect(screen.getByRole('status')).toHaveTextContent('Still waiting');
  });

  it('opens the app in a tab of its own on request', () => {
    render(<AppSheet app={app} onClose={vi.fn()} />);

    const link = screen.getByRole('link', { name: 'Open Gizmo in a new tab' });

    expect(link).toHaveAttribute('href', app.url);
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noreferrer noopener');
  });

  it('gives focus to its close button, and gives it back to where it was when it goes', () => {
    const opener = document.createElement('button');
    document.body.append(opener);
    opener.focus();

    const { unmount } = render(<AppSheet app={app} onClose={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Close Gizmo' })).toHaveFocus();

    unmount();

    expect(opener).toHaveFocus();
    opener.remove();
  });

  it('does not try to focus what has left the page while it was open', () => {
    const opener = document.createElement('button');
    document.body.append(opener);
    opener.focus();
    const focus = vi.spyOn(opener, 'focus');

    const { unmount } = render(<AppSheet app={app} onClose={vi.fn()} />);
    opener.remove();
    unmount();

    expect(focus).not.toHaveBeenCalled();
  });

  describe('closing', () => {
    it('closes from its button', async () => {
      const onClose = vi.fn();
      render(<AppSheet app={app} onClose={onClose} />);

      await userEvent.click(screen.getByRole('button', { name: 'Close Gizmo' }));

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('closes on Escape, keeping the key from the page', () => {
      const onClose = vi.fn();
      const onKeyDown = vi.fn();
      render(
        <div onKeyDown={onKeyDown}>
          <AppSheet app={app} onClose={onClose} />
        </div>
      );

      fireEvent.keyDown(dialog(), { key: 'Escape' });

      expect(onClose).toHaveBeenCalledTimes(1);
      expect(onKeyDown).not.toHaveBeenCalled();
    });

    it('ignores other keys', () => {
      const onClose = vi.fn();
      render(<AppSheet app={app} onClose={onClose} />);

      fireEvent.keyDown(dialog(), { key: 'a' });

      expect(onClose).not.toHaveBeenCalled();
    });

    it('closes when the backdrop is pressed, but not when the app itself is', () => {
      const onClose = vi.fn();
      const { container } = render(<AppSheet app={app} onClose={onClose} />);

      fireEvent.mouseDown(dialog());
      fireEvent.mouseDown(frame());
      expect(onClose).not.toHaveBeenCalled();

      fireEvent.mouseDown(container.querySelector('.app-backdrop')!);
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('an app that opens frameless', () => {
    const doddle = { id: 'doddle', name: 'Doddle', url: 'https://doddle.example.com/' };

    it('has no title bar or buttons, just the app', () => {
      render(<AppSheet app={doddle} onClose={vi.fn()} />);

      expect(screen.queryByRole('button', { name: 'Close Doddle' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Reload Doddle' })).not.toBeInTheDocument();
      expect(screen.getByRole('dialog', { name: 'Doddle' })).toHaveAttribute('data-frameless');
      expect(screen.getByRole('dialog', { name: 'Doddle' })).not.toHaveClass('glass');
      expect(screen.getByTitle('Doddle')).toHaveAttribute('src', doddle.url);
    });

    it('takes focus itself, so Escape still closes it', () => {
      const onClose = vi.fn();
      render(<AppSheet app={doddle} onClose={onClose} />);

      expect(screen.getByRole('dialog', { name: 'Doddle' })).toHaveFocus();

      fireEvent.keyDown(screen.getByRole('dialog', { name: 'Doddle' }), { key: 'Escape' });

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('closes when the space outside it is clicked', () => {
      const onClose = vi.fn();
      const { container } = render(<AppSheet app={doddle} onClose={onClose} />);

      fireEvent.mouseDown(container.querySelector('.app-backdrop')!);

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('is the only kind that opens bare: other apps keep their title bar', () => {
      render(<AppSheet app={app} onClose={vi.fn()} />);

      expect(dialog()).not.toHaveAttribute('data-frameless');
      expect(screen.getByRole('button', { name: 'Close Gizmo' })).toBeInTheDocument();
    });
  });
});
