import { createRef } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { createBookmark, createGroup, type Group } from '../lib/model';
import { GroupPanel } from './group-panel';

const groupOf = (overrides: Partial<Group> = {}, bookmarks = 3): Group => ({
  ...createGroup('Code'),
  bookmarks: Array.from({ length: bookmarks }, (_unused, index) =>
    createBookmark({
      name: `Link ${index}`,
      url: `https://example.com/${index}`,
      description: '',
      icon: ''
    })
  ),
  ...overrides
});

const panel = (): HTMLElement => screen.getByRole('region', { name: 'Code' });

describe('GroupPanel', () => {
  describe('the group', () => {
    it('is a region named for the group, headed by its name', () => {
      render(<GroupPanel group={groupOf()} />);

      expect(within(panel()).getByRole('heading', { name: 'Code' })).toBeInTheDocument();
      expect(panel()).toHaveAttribute('data-dash');
    });

    it('counts its bookmarks', () => {
      render(<GroupPanel group={groupOf({}, 7)} />);

      expect(screen.getByLabelText('7 bookmarks')).toHaveTextContent('7');
    });

    it('takes on the classes for what is happening to it', () => {
      const { rerender } = render(<GroupPanel group={groupOf()} />);
      expect(panel()).toHaveClass('grp', 'glass');
      expect(panel()).not.toHaveClass('grp--link-over', 'grp--collapsed');

      rerender(<GroupPanel group={groupOf({ collapsed: true })} linkOver />);
      expect(panel()).toHaveClass('grp--link-over', 'grp--collapsed');
    });

    it('keeps the class and style it is given, and passes other attributes on', () => {
      render(
        <GroupPanel
          group={groupOf()}
          className="extra"
          style={{ transform: 'translate(3px, 4px)' }}
          data-testid="mine"
        />
      );

      expect(panel()).toHaveClass('grp', 'extra');
      expect(panel().style.transform).toBe('translate(3px, 4px)');
      expect(screen.getByTestId('mine')).toBe(panel());
    });

    it('hands its element to a ref', () => {
      const ref = createRef<HTMLElement>();

      render(<GroupPanel ref={ref} group={groupOf()} />);

      expect(ref.current).toBe(panel());
    });

    it('shows its icon beside its name only when it has one', () => {
      const { rerender } = render(<GroupPanel group={groupOf({ icon: '🚀' })} />);
      expect(panel().querySelector('.grp-icon')).toHaveTextContent('🚀');

      rerender(<GroupPanel group={groupOf({ icon: '' })} />);
      expect(panel().querySelector('.grp-icon')).toBeNull();
    });
  });

  describe('its body', () => {
    it('lays its bookmarks out in the style the group chose', () => {
      render(
        <GroupPanel group={groupOf({ style: 'tiles' })}>
          <li>one</li>
          <li>two</li>
        </GroupPanel>
      );

      const list = within(panel()).getByRole('list');
      expect(list).toHaveClass('grp-items', 'grp-items--tiles');
      expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    });

    it('is hidden altogether while the group is collapsed', () => {
      render(
        <GroupPanel group={groupOf({ collapsed: true })}>
          <li>one</li>
        </GroupPanel>
      );

      expect(screen.queryByRole('list')).not.toBeInTheDocument();
      expect(screen.queryByText('Drop bookmarks here')).not.toBeInTheDocument();
    });

    it('invites a drop when the group is empty', () => {
      render(<GroupPanel group={groupOf({}, 0)} />);

      expect(screen.getByText('Drop bookmarks here')).toBeInTheDocument();
      expect(screen.queryByRole('list')).not.toBeInTheDocument();
    });

    it('offers to add one to an empty group, if it can', async () => {
      const onAdd = vi.fn();
      const group = groupOf({}, 0);
      render(<GroupPanel group={group} onAdd={onAdd} />);

      await userEvent.click(screen.getByRole('button', { name: 'or add one' }));

      expect(onAdd).toHaveBeenCalledExactlyOnceWith(group);
    });

    it('does not offer to add when it cannot', () => {
      render(<GroupPanel group={groupOf({}, 0)} />);

      expect(screen.queryByRole('button', { name: 'or add one' })).not.toBeInTheDocument();
    });
  });

  describe('its buttons', () => {
    it('has none when it has nothing to do with them', () => {
      render(<GroupPanel group={groupOf()} />);

      expect(screen.queryAllByRole('button')).toHaveLength(0);
    });

    it('adds a bookmark to this group', async () => {
      const onAdd = vi.fn();
      const group = groupOf();
      render(<GroupPanel group={group} onAdd={onAdd} />);

      await userEvent.click(screen.getByRole('button', { name: 'Add a bookmark to Code' }));

      expect(onAdd).toHaveBeenCalledExactlyOnceWith(group);
    });

    it('opens its options from the button, handing over the click', async () => {
      const onMenu = vi.fn();
      const group = groupOf();
      render(<GroupPanel group={group} onMenu={onMenu} />);

      await userEvent.click(screen.getByRole('button', { name: 'Code options' }));

      expect(onMenu).toHaveBeenCalledWith(group, expect.objectContaining({ type: 'click' }));
    });

    it('collapses, saying what it will do', async () => {
      const onToggle = vi.fn();
      const group = groupOf();
      render(<GroupPanel group={group} onToggle={onToggle} />);
      const toggle = screen.getByRole('button', { name: 'Collapse Code' });
      expect(toggle).toHaveAttribute('aria-expanded', 'true');

      await userEvent.click(toggle);

      expect(onToggle).toHaveBeenCalledExactlyOnceWith(group);
    });

    it('expands when it is collapsed', () => {
      render(<GroupPanel group={groupOf({ collapsed: true })} onToggle={vi.fn()} />);

      expect(screen.getByRole('button', { name: 'Expand Code' })).toHaveAttribute(
        'aria-expanded',
        'false'
      );
    });

    it('keeps a press on a button from carrying the whole group off', () => {
      const onMouseDown = vi.fn();
      const onTouchStart = vi.fn();
      render(
        <div onMouseDown={onMouseDown} onTouchStart={onTouchStart}>
          <GroupPanel
            group={groupOf()}

            onAdd={vi.fn()}
            onMenu={vi.fn()}
            onToggle={vi.fn()}
          />
        </div>
      );

      for (const button of screen.getAllByRole('button')) {
        fireEvent.mouseDown(button);
        fireEvent.touchStart(button);
      }

      expect(onMouseDown).not.toHaveBeenCalled();
      expect(onTouchStart).not.toHaveBeenCalled();
    });
  });

  describe('the context menu', () => {
    it('opens the group’s menu on a right-click on the header, and not the browser’s', () => {
      const onMenu = vi.fn();
      const group = groupOf();
      render(<GroupPanel group={group} onMenu={onMenu} />);

      const proceeded = fireEvent.contextMenu(panel().querySelector('header')!);

      expect(proceeded).toBe(false);
      expect(onMenu).toHaveBeenCalledWith(group, expect.objectContaining({ type: 'contextmenu' }));
    });

    it('leaves the browser’s menu alone when there is none of its own', () => {
      render(<GroupPanel group={groupOf()} />);

      expect(fireEvent.contextMenu(panel().querySelector('header')!)).toBe(true);
    });
  });

  describe('links dragged in from another tab', () => {
    it('hands the drag events on to be handled', () => {
      const onLinkDragOver = vi.fn();
      const onLinkDragLeave = vi.fn();
      const onLinkDrop = vi.fn();
      render(
        <GroupPanel
          group={groupOf()}

          onLinkDragOver={onLinkDragOver}
          onLinkDragLeave={onLinkDragLeave}
          onLinkDrop={onLinkDrop}
        />
      );

      fireEvent.dragOver(panel());
      fireEvent.dragLeave(panel());
      fireEvent.drop(panel());

      expect(onLinkDragOver).toHaveBeenCalledTimes(1);
      expect(onLinkDragLeave).toHaveBeenCalledTimes(1);
      expect(onLinkDrop).toHaveBeenCalledTimes(1);
    });
  });
});
