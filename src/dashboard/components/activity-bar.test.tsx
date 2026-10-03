import type { ComponentProps, JSX } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { ActivityBar, type ActivityItem } from './activity-bar';

const HIDE_DELAY_MS = 10_000;

const handlers = () => ({
  onOpenExtensions: vi.fn(),
  onAddBookmark: vi.fn(),
  onToggleEdit: vi.fn(),
  onOpenSettings: vi.fn(),
  onContextMenu: vi.fn()
});

const bar = (props: Partial<ComponentProps<typeof ActivityBar>> = {}): JSX.Element => (
  <ActivityBar
    pinned={false}
    items={[]}
    editing={false}
    extensionsOpen={false}
    {...handlers()}
    {...props}
  />
);

const nav = (): HTMLElement => screen.getByRole('navigation', { name: 'Dashboard' });
const tab = (container: HTMLElement): HTMLElement => container.querySelector('.activity-tab')!;
const state = (): string | null => nav().getAttribute('data-state');

describe('ActivityBar', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('when it is pinned', () => {
    it('is always out, with no tab to pull it out by', () => {
      const { container } = render(bar({ pinned: true }));

      expect(state()).toBe('shown');
      expect(nav()).toHaveAttribute('data-pinned');
      expect(tab(container)).toBeNull();
      expect(container.querySelector('.activity-edge')).toBeNull();
    });

    it('does not tuck itself away when the pointer leaves, or when focus does', () => {
      render(bar({ pinned: true }));

      fireEvent.mouseLeave(nav());
      fireEvent.blur(nav());
      act(() => {
        vi.advanceTimersByTime(HIDE_DELAY_MS * 2);
      });

      expect(state()).toBe('shown');
    });

    it('stays out after a button is pressed', () => {
      const props = handlers();
      render(bar({ pinned: true, ...props }));

      fireEvent.click(screen.getByRole('button', { name: 'Add bookmark' }));

      expect(props.onAddBookmark).toHaveBeenCalledTimes(1);
      expect(state()).toBe('shown');
    });

    it('does not take Escape from the page', () => {
      const onKeyDown = vi.fn();
      render(<div onKeyDown={onKeyDown}>{bar({ pinned: true })}</div>);

      fireEvent.keyDown(nav(), { key: 'Escape' });

      expect(state()).toBe('shown');
      expect(onKeyDown).toHaveBeenCalledTimes(1);
    });
  });

  describe('when it is tucked away', () => {
    it('waits behind its tab', () => {
      const { container } = render(bar());

      expect(state()).toBe('hidden');
      expect(tab(container)).not.toHaveAttribute('data-hidden');
    });

    it('comes out for the pointer at the edge, and for the pointer on the tab', () => {
      const { container } = render(bar());

      fireEvent.mouseEnter(container.querySelector('.activity-edge')!);
      expect(state()).toBe('shown');
      expect(tab(container)).toHaveAttribute('data-hidden');
    });

    it('comes out for the pointer on the tab itself', () => {
      const { container } = render(bar());

      fireEvent.mouseEnter(tab(container));

      expect(state()).toBe('shown');
    });

    it('comes out for the pointer on the bar, and for focus within it', () => {
      render(bar());

      fireEvent.mouseEnter(nav());
      expect(state()).toBe('shown');

      fireEvent.mouseLeave(nav());
      act(() => {
        vi.advanceTimersByTime(HIDE_DELAY_MS);
      });
      expect(state()).toBe('hidden');

      fireEvent.focus(screen.getByRole('button', { name: 'Add bookmark' }));
      expect(state()).toBe('shown');
    });

    it('comes out when its tab is pressed, and goes back when it is pressed again', () => {
      const { container } = render(bar());

      fireEvent.click(tab(container));
      expect(state()).toBe('shown');

      fireEvent.click(tab(container));
      expect(state()).toBe('hidden');
    });

    it('tucks itself away only after a long while without the pointer', () => {
      render(bar());
      fireEvent.mouseEnter(nav());

      fireEvent.mouseLeave(nav());
      act(() => {
        vi.advanceTimersByTime(HIDE_DELAY_MS - 1);
      });
      expect(state()).toBe('shown');

      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(state()).toBe('hidden');
    });

    it('stays out if the pointer comes back before the while is up', () => {
      render(bar());
      fireEvent.mouseEnter(nav());

      fireEvent.mouseLeave(nav());
      act(() => {
        vi.advanceTimersByTime(HIDE_DELAY_MS - 1000);
      });
      fireEvent.mouseEnter(nav());
      act(() => {
        vi.advanceTimersByTime(HIDE_DELAY_MS);
      });

      expect(state()).toBe('shown');
    });

    it('stays out while someone is still using it from the keyboard, though the pointer left', () => {
      render(bar());
      fireEvent.mouseEnter(nav());
      screen.getByRole('button', { name: 'Add bookmark' }).focus();

      fireEvent.mouseLeave(nav());
      act(() => {
        vi.advanceTimersByTime(HIDE_DELAY_MS);
      });

      expect(state()).toBe('shown');
    });

    it('tucks itself away once focus leaves it for somewhere else', () => {
      render(
        <>
          {bar()}
          <button type="button">Elsewhere</button>
        </>
      );
      fireEvent.mouseEnter(nav());
      const inside = screen.getByRole('button', { name: 'Add bookmark' });
      inside.focus();
      const outside = screen.getByRole('button', { name: 'Elsewhere' });

      outside.focus();
      act(() => {
        vi.advanceTimersByTime(HIDE_DELAY_MS);
      });

      expect(state()).toBe('hidden');
    });

    it('stays put while focus moves from one of its buttons to another', () => {
      render(bar());
      fireEvent.mouseEnter(nav());

      screen.getByRole('button', { name: 'Add bookmark' }).focus();
      screen.getByRole('button', { name: 'Dashboard settings' }).focus();
      act(() => {
        vi.advanceTimersByTime(HIDE_DELAY_MS * 2);
      });

      expect(state()).toBe('shown');
    });

    it('tucks itself away at a tap anywhere else, as a touch screen has no pointer to leave', () => {
      render(
        <>
          {bar()}
          <p>Page</p>
        </>
      );
      fireEvent.mouseEnter(nav());

      fireEvent.pointerDown(nav());
      expect(state()).toBe('shown');

      fireEvent.pointerDown(screen.getByText('Page'));
      expect(state()).toBe('hidden');
    });

    it('does not tuck itself away at a tap on its own tab, which toggles it instead', () => {
      const { container } = render(bar());
      fireEvent.mouseEnter(nav());

      fireEvent.pointerDown(tab(container));
      expect(state()).toBe('shown');

      fireEvent.click(tab(container));
      expect(state()).toBe('hidden');
    });

    it('stops listening for taps while it is away', () => {
      const add = vi.spyOn(document, 'addEventListener');
      const remove = vi.spyOn(document, 'removeEventListener');
      render(bar());

      expect(add).not.toHaveBeenCalledWith('pointerdown', expect.anything());

      fireEvent.mouseEnter(nav());
      expect(add).toHaveBeenCalledWith('pointerdown', expect.any(Function));

      fireEvent.pointerDown(document.body);
      expect(remove).toHaveBeenCalledWith('pointerdown', expect.any(Function));

      add.mockRestore();
      remove.mockRestore();
    });

    it('steps back after a button is pressed, so what it opened has the stage', () => {
      const props = handlers();
      render(bar({ ...props }));
      fireEvent.mouseEnter(nav());

      fireEvent.click(screen.getByRole('button', { name: 'Extensions' }));

      expect(props.onOpenExtensions).toHaveBeenCalledTimes(1);
      expect(state()).toBe('hidden');
    });

    it('stays out after the edit button is pressed, as the user is about to use the board', () => {
      const props = handlers();
      render(bar({ ...props }));
      fireEvent.mouseEnter(nav());

      fireEvent.click(screen.getByRole('button', { name: 'Edit the board' }));

      expect(props.onToggleEdit).toHaveBeenCalledTimes(1);
      expect(state()).toBe('shown');
    });

    describe('on Escape', () => {
      it('goes away, lets go of focus, and keeps Escape from the page', () => {
        const onKeyDown = vi.fn();
        render(<div onKeyDown={onKeyDown}>{bar()}</div>);
        fireEvent.mouseEnter(nav());
        const button = screen.getByRole('button', { name: 'Add bookmark' });
        button.focus();

        fireEvent.keyDown(button, { key: 'Escape' });

        expect(state()).toBe('hidden');
        expect(button).not.toHaveFocus();
        expect(onKeyDown).not.toHaveBeenCalled();
      });

      it('leaves other keys alone', () => {
        const onKeyDown = vi.fn();
        render(<div onKeyDown={onKeyDown}>{bar()}</div>);
        fireEvent.mouseEnter(nav());

        fireEvent.keyDown(nav(), { key: 'a' });

        expect(state()).toBe('shown');
        expect(onKeyDown).toHaveBeenCalledTimes(1);
      });

      it('leaves Escape to the page when there is nothing out to put away', () => {
        const onKeyDown = vi.fn();
        render(<div onKeyDown={onKeyDown}>{bar()}</div>);

        fireEvent.keyDown(nav(), { key: 'Escape' });

        expect(onKeyDown).toHaveBeenCalledTimes(1);
      });
    });

    it('does not tuck itself away after it has gone', () => {
      const { unmount } = render(bar());
      fireEvent.mouseEnter(nav());
      fireEvent.mouseLeave(nav());

      expect(() => {
        unmount();
        vi.advanceTimersByTime(HIDE_DELAY_MS);
      }).not.toThrow();
    });
  });

  describe('its buttons', () => {
    const items: ActivityItem[] = [
      { id: 'a', label: 'Tool A', icon: <i>a</i>, shortcut: 'A', onSelect: vi.fn() },
      { id: 'b', label: 'Tool B', icon: <i>b</i>, active: true, onSelect: vi.fn() }
    ];

    it('lists the tools of the extensions first, then the extensions, then the board’s own', () => {
      render(bar({ pinned: true, items }));

      expect(
        screen.getAllByRole('button').map((button) => button.getAttribute('aria-label'))
      ).toEqual([
        'Tool A',
        'Tool B',
        'Extensions',
        'Add bookmark',
        'Edit the board',
        'Dashboard settings'
      ]);
    });

    it('shows each tool’s shortcut in its tip, and which is open', () => {
      render(bar({ pinned: true, items }));

      expect(screen.getByRole('button', { name: 'Tool A' })).toHaveAttribute(
        'data-tip',
        'Tool A (A)'
      );
      expect(screen.getByRole('button', { name: 'Tool B' })).toHaveAttribute('data-tip', 'Tool B');
      expect(screen.getByRole('button', { name: 'Tool B' })).toHaveAttribute('data-active');
      expect(screen.getByRole('button', { name: 'Tool A' })).not.toHaveAttribute('data-active');
    });

    it('selects the tool that was pressed', () => {
      render(bar({ pinned: true, items }));

      fireEvent.click(screen.getByRole('button', { name: 'Tool A' }));

      expect(items[0]!.onSelect).toHaveBeenCalledTimes(1);
      expect(items[1]!.onSelect).not.toHaveBeenCalled();
    });

    it('gives the app a place for its own buttons, only when it has some', () => {
      const { container, rerender } = render(bar({ pinned: true }));

      expect(container.querySelector('.activity-extras')).toBeNull();

      rerender(bar({ pinned: true, extras: <button type="button">Coins</button> }));

      expect(container.querySelector('.activity-extras')).toContainElement(
        screen.getByRole('button', { name: 'Coins' })
      );
    });

    it('says whether the extensions and the editor are open', () => {
      render(bar({ pinned: true, extensionsOpen: true, editing: true }));

      expect(screen.getByRole('button', { name: 'Extensions' })).toHaveAttribute('data-active');
      expect(screen.getByRole('button', { name: 'Done editing' })).toHaveAttribute(
        'aria-pressed',
        'true'
      );
      expect(screen.getByRole('button', { name: 'Done editing' })).toHaveAttribute(
        'data-tip',
        'Done editing (E)'
      );
    });

    it('opens the settings', () => {
      const props = handlers();
      render(bar({ pinned: true, ...props }));

      fireEvent.click(screen.getByRole('button', { name: 'Dashboard settings' }));

      expect(props.onOpenSettings).toHaveBeenCalledTimes(1);
    });
  });

  it('opens its own menu in place of the browser’s', () => {
    const props = handlers();
    render(bar({ pinned: true, ...props }));

    const notPrevented = fireEvent.contextMenu(nav(), { clientX: 12, clientY: 34 });

    expect(notPrevented).toBe(false);
    expect(props.onContextMenu).toHaveBeenCalledTimes(1);
    expect(props.onContextMenu.mock.calls[0]![0]).toMatchObject({ clientX: 12, clientY: 34 });
  });
});
