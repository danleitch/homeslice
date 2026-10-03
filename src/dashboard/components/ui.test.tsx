import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState, type JSX } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Toast } from '../hooks/use-dashboard';
import { ContextMenu, Drawer, Field, Modal, Segmented, Switch, Toasts, type MenuItem } from './ui';

/** jsdom lays nothing out, so every element reports no offset parent, which hides it from tab order. */
const layOutAsVisible = (): (() => void) => {
  const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetParent');
  Object.defineProperty(HTMLElement.prototype, 'offsetParent', {
    configurable: true,
    get() {
      return this.parentNode;
    }
  });

  return () => {
    if (original) {
      Object.defineProperty(HTMLElement.prototype, 'offsetParent', original);
    } else {
      delete (HTMLElement.prototype as { offsetParent?: unknown }).offsetParent;
    }
  };
};

describe.each([
  ['Modal', Modal],
  ['Drawer', Drawer]
] as const)('%s', (name, Dialog) => {
  const closeLabel = name === 'Modal' ? 'Close' : 'Close settings';

  it('is a modal dialog named by its title', () => {
    render(
      <Dialog title="Edit things" onClose={vi.fn()}>
        <p>Body</p>
      </Dialog>
    );

    const dialog = screen.getByRole('dialog', { name: 'Edit things' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(within(dialog).getByText('Body')).toBeInTheDocument();
  });

  it('renders outside the page’s own tree, so nothing clips it', () => {
    const { container } = render(
      <Dialog title="Edit things" onClose={vi.fn()}>
        <p>Body</p>
      </Dialog>
    );

    expect(container).toBeEmptyDOMElement();
    expect(document.body).toContainElement(screen.getByRole('dialog'));
  });

  it('closes from its close button', async () => {
    const onClose = vi.fn();
    render(
      <Dialog title="Edit things" onClose={onClose}>
        <p>Body</p>
      </Dialog>
    );

    await userEvent.click(screen.getByRole('button', { name: closeLabel }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on Escape, without letting it reach anything underneath', () => {
    const onClose = vi.fn();
    const underneath = vi.fn();
    document.addEventListener('keydown', underneath);
    render(
      <Dialog title="Edit things" onClose={onClose}>
        <button type="button">Inside</button>
      </Dialog>
    );

    fireEvent.keyDown(screen.getByRole('button', { name: 'Inside' }), { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(underneath).not.toHaveBeenCalled();
    document.removeEventListener('keydown', underneath);
  });

  it('closes when the backdrop is pressed, but not when the dialog is', () => {
    const onClose = vi.fn();
    render(
      <Dialog title="Edit things" onClose={onClose}>
        <p>Body</p>
      </Dialog>
    );
    const dialog = screen.getByRole('dialog');

    fireEvent.mouseDown(dialog);
    fireEvent.mouseDown(screen.getByText('Body'));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.mouseDown(dialog.parentElement!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('marks itself as part of the dashboard, so the pond ignores presses on it', () => {
    render(
      <Dialog title="Edit things" onClose={vi.fn()}>
        <p>Body</p>
      </Dialog>
    );

    expect(screen.getByRole('dialog').parentElement).toHaveAttribute('data-dash');
  });

  describe('focus', () => {
    it('lands on the control marked to start on', () => {
      render(
        <Dialog title="Edit things" onClose={vi.fn()}>
          <input aria-label="First" />
          <input aria-label="Wanted" data-autofocus="" />
        </Dialog>
      );

      expect(screen.getByLabelText('Wanted')).toHaveFocus();
    });

    it('otherwise lands on the first control it can', () => {
      render(
        <Dialog title="Edit things" onClose={vi.fn()}>
          <input aria-label="First" />
          <input aria-label="Second" />
        </Dialog>
      );

      // The close button leads the dialog, ahead of its body.
      expect(screen.getByRole('button', { name: closeLabel })).toHaveFocus();
    });

    it('goes back to what had focus before, once it closes', () => {
      const opener = document.createElement('button');
      document.body.append(opener);
      opener.focus();
      const { unmount } = render(
        <Dialog title="Edit things" onClose={vi.fn()}>
          <input aria-label="First" />
        </Dialog>
      );
      expect(opener).not.toHaveFocus();

      unmount();

      expect(opener).toHaveFocus();
      opener.remove();
    });

    it('does not reach for a control that has left the page', () => {
      const opener = document.createElement('button');
      document.body.append(opener);
      opener.focus();
      const { unmount } = render(
        <Dialog title="Edit things" onClose={vi.fn()}>
          <input aria-label="First" />
        </Dialog>
      );
      opener.remove();

      expect(() => unmount()).not.toThrow();
    });
  });

  describe('Tab', () => {
    let restore: () => void;

    beforeEach(() => {
      restore = layOutAsVisible();
    });

    afterEach(() => {
      restore();
    });

    const open = (): { first: HTMLElement; last: HTMLElement } => {
      render(
        <Dialog title="Edit things" onClose={vi.fn()}>
          <input aria-label="Middle" />
          <button type="button">Last</button>
        </Dialog>
      );

      return {
        first: screen.getByRole('button', { name: closeLabel }),
        last: screen.getByRole('button', { name: 'Last' })
      };
    };

    it('wraps from the last control to the first', () => {
      const { first, last } = open();
      last.focus();

      const proceeded = fireEvent.keyDown(last, { key: 'Tab' });

      expect(proceeded).toBe(false);
      expect(first).toHaveFocus();
    });

    it('wraps from the first control back to the last on Shift+Tab', () => {
      const { first, last } = open();
      first.focus();

      const proceeded = fireEvent.keyDown(first, { key: 'Tab', shiftKey: true });

      expect(proceeded).toBe(false);
      expect(last).toHaveFocus();
    });

    it('lets Tab move on as usual from the middle', () => {
      open();
      const middle = screen.getByLabelText('Middle');
      middle.focus();

      expect(fireEvent.keyDown(middle, { key: 'Tab' })).toBe(true);
      expect(fireEvent.keyDown(middle, { key: 'Tab', shiftKey: true })).toBe(true);
    });

    it('ignores other keys', () => {
      const { last } = open();
      last.focus();

      expect(fireEvent.keyDown(last, { key: 'a' })).toBe(true);
      expect(last).toHaveFocus();
    });

    it('has nothing to wrap to when no control can be focused', () => {
      render(
        <Dialog title="Edit things" onClose={vi.fn()}>
          <p>Nothing to press</p>
        </Dialog>
      );
      const dialog = screen.getByRole('dialog');
      const close = within(dialog).getByRole('button', { name: closeLabel });
      close.setAttribute('disabled', '');

      expect(fireEvent.keyDown(dialog, { key: 'Tab' })).toBe(true);
    });
  });
});

describe('Modal only', () => {
  it('shows a subtitle and a footer when given them', () => {
    render(
      <Modal
        title="Edit"
        subtitle="Careful now"
        footer={<button type="button">Save</button>}
        onClose={vi.fn()}
      >
        <p>Body</p>
      </Modal>
    );

    expect(screen.getByText('Careful now')).toHaveClass('modal-subtitle');
    expect(screen.getByRole('button', { name: 'Save' }).closest('footer')).toHaveClass(
      'modal-foot'
    );
  });

  it('shows neither when they are not given', () => {
    render(
      <Modal title="Edit" onClose={vi.fn()}>
        <p>Body</p>
      </Modal>
    );

    expect(document.querySelector('.modal-subtitle')).toBeNull();
    expect(document.querySelector('footer')).toBeNull();
  });

  it.each(['sm', 'md', 'lg'] as const)('is sized %s', (size) => {
    render(
      <Modal title="Edit" size={size} className="extra" onClose={vi.fn()}>
        <p>Body</p>
      </Modal>
    );

    expect(screen.getByRole('dialog')).toHaveClass(`modal--${size}`, 'extra');
  });

  it('is medium unless told otherwise', () => {
    render(
      <Modal title="Edit" onClose={vi.fn()}>
        <p>Body</p>
      </Modal>
    );

    expect(screen.getByRole('dialog')).toHaveClass('modal--md');
  });
});

describe('Drawer only', () => {
  it('slides in from the right unless told otherwise', () => {
    render(
      <Drawer title="Settings" onClose={vi.fn()}>
        <p>Body</p>
      </Drawer>
    );

    expect(screen.getByRole('dialog').parentElement).toHaveClass('drawer-backdrop--right');
  });

  it('can open beside the side bar instead, with its own close label', () => {
    render(
      <Drawer title="Extensions" side="left" closeLabel="Close extensions" onClose={vi.fn()}>
        <p>Body</p>
      </Drawer>
    );

    expect(screen.getByRole('dialog').parentElement).toHaveClass('drawer-backdrop--left');
    expect(screen.getByRole('button', { name: 'Close extensions' })).toBeInTheDocument();
  });
});

describe('ContextMenu', () => {
  const menu = (
    items: MenuItem[],
    at = { x: 40, y: 50 }
  ): { onClose: ReturnType<typeof vi.fn> } => {
    const onClose = vi.fn();
    render(<ContextMenu {...at} items={items} onClose={onClose} label="Bookmark menu" />);
    return { onClose };
  };

  it('is a menu with a named list of items', () => {
    menu([{ label: 'Open' }, { label: 'Delete' }]);

    expect(screen.getByRole('menu', { name: 'Bookmark menu' })).toBeInTheDocument();
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      'Open',
      'Delete'
    ]);
  });

  it('focuses its first enabled item', () => {
    menu([{ label: 'Open', disabled: true }, { label: 'Edit' }]);

    expect(screen.getByRole('menuitem', { name: 'Edit' })).toHaveFocus();
  });

  describe('where it opens', () => {
    const sized = (width: number, height: number): void => {
      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
        width,
        height
      } as DOMRect);
    };

    afterEach(() => {
      vi.restoreAllMocks();
    });

    const anchor = (): HTMLElement => document.querySelector<HTMLElement>('.menu-anchor')!;

    it('opens at the pointer', () => {
      sized(160, 120);
      menu([{ label: 'Open' }], { x: 100, y: 120 });

      expect(anchor()).toHaveStyle({ left: '100px', top: '120px' });
    });

    it('is pulled back inside the window’s right and bottom edges', () => {
      sized(160, 120);
      menu([{ label: 'Open' }], { x: window.innerWidth - 10, y: window.innerHeight - 10 });

      expect(anchor()).toHaveStyle({
        left: `${window.innerWidth - 160 - 8}px`,
        top: `${window.innerHeight - 120 - 8}px`
      });
    });

    it('keeps a margin from the top and left edges', () => {
      sized(160, 120);
      menu([{ label: 'Open' }], { x: -30, y: 2 });

      expect(anchor()).toHaveStyle({ left: '8px', top: '8px' });
    });
  });

  describe('items', () => {
    it('shows separators between groups', () => {
      menu([{ label: 'Open' }, 'separator', { label: 'Delete' }]);

      expect(screen.getByRole('separator')).toBeInTheDocument();
    });

    it('runs an item’s action and closes', async () => {
      const onSelect = vi.fn();
      const { onClose } = menu([{ label: 'Open', onSelect }]);

      await userEvent.click(screen.getByRole('menuitem', { name: 'Open' }));

      expect(onSelect).toHaveBeenCalledTimes(1);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('closes after an item that has no action of its own', async () => {
      const { onClose } = menu([{ label: 'Nothing' }]);

      await userEvent.click(screen.getByRole('menuitem', { name: 'Nothing' }));

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('does nothing for a disabled item', async () => {
      const onSelect = vi.fn();
      const { onClose } = menu([{ label: 'Open', onSelect, disabled: true }, { label: 'Other' }]);

      await userEvent.click(screen.getByRole('menuitem', { name: 'Open' }));

      expect(onSelect).not.toHaveBeenCalled();
      expect(onClose).not.toHaveBeenCalled();
    });

    it('marks a dangerous item, a checked item, and shows a shortcut hint', () => {
      menu([
        { label: 'Delete', danger: true },
        { label: 'Wide', checked: true },
        { label: 'Edit', hint: 'E' }
      ]);

      expect(screen.getByRole('menuitem', { name: 'Delete' })).toHaveClass('menu-item--danger');
      expect(screen.getByRole('menuitem', { name: /Wide/ })).toHaveAttribute(
        'aria-checked',
        'true'
      );
      expect(screen.getByText('✓')).toBeInTheDocument();
      expect(screen.getByText('E').tagName).toBe('KBD');
    });

    it('shows an icon beside an item', () => {
      menu([{ label: 'Open', icon: <svg data-testid="icon" /> }]);

      expect(within(screen.getByRole('menuitem')).getByTestId('icon')).toBeInTheDocument();
    });
  });

  describe('keyboard', () => {
    it('moves down and up through the items, wrapping at either end', async () => {
      menu([{ label: 'One' }, { label: 'Two' }, { label: 'Three' }]);
      const user = userEvent.setup();

      await user.keyboard('{ArrowDown}');
      expect(screen.getByRole('menuitem', { name: 'Two' })).toHaveFocus();

      await user.keyboard('{ArrowDown}{ArrowDown}');
      expect(screen.getByRole('menuitem', { name: 'One' })).toHaveFocus();

      await user.keyboard('{ArrowUp}');
      expect(screen.getByRole('menuitem', { name: 'Three' })).toHaveFocus();
    });

    it('skips items that are turned off', async () => {
      menu([{ label: 'One' }, { label: 'Two', disabled: true }, { label: 'Three' }]);

      await userEvent.keyboard('{ArrowDown}');

      expect(screen.getByRole('menuitem', { name: 'Three' })).toHaveFocus();
    });

    it('closes on Escape, ahead of anything else listening', async () => {
      const { onClose } = menu([{ label: 'One' }]);
      const elsewhere = vi.fn();
      document.addEventListener('keydown', elsewhere);

      await userEvent.keyboard('{Escape}');

      expect(onClose).toHaveBeenCalledTimes(1);
      expect(elsewhere).not.toHaveBeenCalled();
      document.removeEventListener('keydown', elsewhere);
    });
  });

  describe('submenus', () => {
    const items: MenuItem[] = [
      { label: 'Move to', items: [{ label: 'Code' }, { label: 'Read' }] },
      { label: 'Delete' }
    ];

    it('opens when its item is hovered, showing a menu of its own', async () => {
      menu(items);
      expect(screen.queryByRole('menu', { name: 'Move to' })).not.toBeInTheDocument();

      await userEvent.hover(screen.getByRole('menuitem', { name: /Move to/ }));

      expect(screen.getByRole('menu', { name: 'Move to' })).toBeInTheDocument();
      expect(screen.getByRole('menuitem', { name: /Move to/ })).toHaveAttribute(
        'aria-haspopup',
        'menu'
      );
      expect(screen.getByRole('menuitem', { name: /Move to/ })).toHaveAttribute(
        'aria-expanded',
        'true'
      );
    });

    it('closes again when the pointer moves to an item with no submenu', async () => {
      menu(items);

      await userEvent.hover(screen.getByRole('menuitem', { name: /Move to/ }));
      await userEvent.hover(screen.getByRole('menuitem', { name: 'Delete' }));

      expect(screen.queryByRole('menu', { name: 'Move to' })).not.toBeInTheDocument();
    });

    it('opens on click, without closing the menu', async () => {
      const { onClose } = menu(items);

      await userEvent.click(screen.getByRole('menuitem', { name: /Move to/ }));

      expect(screen.getByRole('menu', { name: 'Move to' })).toBeInTheDocument();
      expect(onClose).not.toHaveBeenCalled();
    });

    it.each(['{ArrowRight}', '{Enter}'])('opens on %s and moves focus into it', async (key) => {
      menu(items);

      await userEvent.keyboard(key);

      expect(screen.getByRole('menuitem', { name: 'Code' })).toHaveFocus();
    });

    it('goes back to its item on ArrowLeft', async () => {
      menu(items);
      await userEvent.keyboard('{ArrowRight}');

      await userEvent.keyboard('{ArrowLeft}');

      expect(screen.queryByRole('menu', { name: 'Move to' })).not.toBeInTheDocument();
      expect(screen.getByRole('menuitem', { name: /Move to/ })).toHaveFocus();
    });

    it('runs a submenu item’s action and closes the whole menu', async () => {
      const onSelect = vi.fn();
      const { onClose } = menu([
        { label: 'Move to', items: [{ label: 'Code', onSelect }] },
        { label: 'Delete' }
      ]);

      await userEvent.click(screen.getByRole('menuitem', { name: /Move to/ }));
      await userEvent.click(screen.getByRole('menuitem', { name: 'Code' }));

      expect(onSelect).toHaveBeenCalledTimes(1);
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('closing', () => {
    it.each(['mousedown', 'contextmenu'])('closes on a %s outside it', (type) => {
      const { onClose } = menu([{ label: 'One' }]);

      fireEvent(document.body, new MouseEvent(type, { bubbles: true }));

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('stays open for a press inside it', () => {
      const { onClose } = menu([{ label: 'One' }]);

      fireEvent.mouseDown(screen.getByRole('menuitem'));

      expect(onClose).not.toHaveBeenCalled();
    });

    it.each(['resize', 'blur'])('closes when the window is %sd or loses focus', (type) => {
      const { onClose } = menu([{ label: 'One' }]);

      fireEvent(window, new Event(type));

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('leaves the browser’s own menu out of it', () => {
      menu([{ label: 'One' }]);
      const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });

      screen.getByRole('menu').dispatchEvent(event);

      expect(event.defaultPrevented).toBe(true);
    });

    it('stops listening once it has closed', () => {
      const onClose = vi.fn();
      const { unmount } = render(
        <ContextMenu x={0} y={0} items={[{ label: 'One' }]} onClose={onClose} label="Menu" />
      );

      unmount();
      fireEvent.mouseDown(document.body);
      fireEvent(window, new Event('resize'));

      expect(onClose).not.toHaveBeenCalled();
    });
  });
});

describe('Toasts', () => {
  const toast = (overrides: Partial<Toast> = {}): Toast => ({
    id: 1,
    message: 'Saved',
    tone: 'success',
    ...overrides
  });

  it('is a polite live region, so a screen reader announces each message', () => {
    render(<Toasts toasts={[toast()]} onUndo={vi.fn()} onDismiss={vi.fn()} />);

    const region = screen.getByRole('status');
    expect(region).toHaveAttribute('aria-live', 'polite');
    expect(within(region).getByText('Saved')).toBeInTheDocument();
  });

  it('is empty when there is nothing to say', () => {
    render(<Toasts toasts={[]} onUndo={vi.fn()} onDismiss={vi.fn()} />);

    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it.each(['info', 'success', 'error'] as const)('styles a %s toast', (tone) => {
    render(<Toasts toasts={[toast({ tone })]} onUndo={vi.fn()} onDismiss={vi.fn()} />);

    expect(screen.getByText('Saved').parentElement).toHaveClass(`toast--${tone}`);
  });

  it('offers Undo only for a change that can be taken back', () => {
    render(
      <Toasts
        toasts={[
          toast({ id: 1, message: 'Kept' }),
          toast({ id: 2, message: 'Deleted', undo: {} as never })
        ]}
        onUndo={vi.fn()}
        onDismiss={vi.fn()}
      />
    );

    expect(
      within(screen.getByText('Kept').parentElement!).queryByRole('button', { name: /Undo/ })
    ).toBeNull();
    expect(
      within(screen.getByText('Deleted').parentElement!).getByRole('button', { name: /Undo/ })
    ).toBeInTheDocument();
  });

  it('undoes and dismisses the toast it was pressed on', async () => {
    const onUndo = vi.fn();
    const onDismiss = vi.fn();
    render(
      <Toasts
        toasts={[
          toast({ id: 7, message: 'Deleted', undo: {} as never }),
          toast({ id: 8, message: 'Other' })
        ]}
        onUndo={onUndo}
        onDismiss={onDismiss}
      />
    );
    const row = screen.getByText('Deleted').parentElement!;

    await userEvent.click(within(row).getByRole('button', { name: /Undo/ }));
    await userEvent.click(within(row).getByRole('button', { name: 'Dismiss' }));

    expect(onUndo).toHaveBeenCalledExactlyOnceWith(7);
    expect(onDismiss).toHaveBeenCalledExactlyOnceWith(7);
  });
});

describe('Segmented', () => {
  const Harness = ({ onChange }: { onChange?: (value: string) => void }): JSX.Element => {
    const [value, setValue] = useState('b');

    return (
      <Segmented
        label="Letters"
        value={value}
        options={[
          { value: 'a', label: 'A', title: 'The first' },
          { value: 'b', label: 'B' },
          { value: 'c', label: 'C' }
        ]}
        onChange={(next) => {
          setValue(next);
          onChange?.(next);
        }}
      />
    );
  };

  it('is a labelled group of radios, with the current one checked', () => {
    render(<Harness />);

    const group = screen.getByRole('radiogroup', { name: 'Letters' });
    const radios = within(group).getAllByRole('radio');
    expect(radios.map((radio) => radio.getAttribute('aria-checked'))).toEqual([
      'false',
      'true',
      'false'
    ]);
    expect(radios[0]).toHaveAttribute('title', 'The first');
  });

  it('moves the choice, and reports it', async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    await userEvent.click(screen.getByRole('radio', { name: 'C' }));

    expect(onChange).toHaveBeenCalledWith('c');
    expect(screen.getByRole('radio', { name: 'C' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'B' })).not.toBeChecked();
  });
});

describe('Field', () => {
  it('labels its control', () => {
    render(
      <Field label="Name">
        <input />
      </Field>
    );

    expect(screen.getByLabelText('Name')).toBeInTheDocument();
  });

  it('shows a hint beneath it', () => {
    render(
      <Field label="Name" hint="As you like">
        <input />
      </Field>
    );

    expect(screen.getByText('As you like')).toHaveClass('field-hint');
  });

  it('shows an error as an alert, instead of the hint', () => {
    render(
      <Field label="Name" hint="As you like" error="Needed">
        <input />
      </Field>
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Needed');
    expect(screen.queryByText('As you like')).not.toBeInTheDocument();
  });

  it('shows nothing extra when it has neither', () => {
    const { container } = render(
      <Field label="Name">
        <input />
      </Field>
    );

    expect(container.querySelector('.field-hint, .field-error')).toBeNull();
  });
});

describe('Switch', () => {
  it('is a switch with its label and an optional hint', () => {
    render(<Switch checked={false} onChange={vi.fn()} label="Open in new tab" hint="Always" />);

    expect(screen.getByRole('switch', { name: /Open in new tab/ })).not.toBeChecked();
    expect(screen.getByText('Always')).toBeInTheDocument();
  });

  it('reports the new state when flipped', async () => {
    const onChange = vi.fn();
    const { rerender } = render(<Switch checked={false} onChange={onChange} label="Open" />);

    await userEvent.click(screen.getByRole('switch'));
    expect(onChange).toHaveBeenLastCalledWith(true);

    rerender(<Switch checked onChange={onChange} label="Open" />);
    await userEvent.click(screen.getByRole('switch'));
    expect(onChange).toHaveBeenLastCalledWith(false);
  });

  it('reflects whether it is on', () => {
    render(<Switch checked onChange={vi.fn()} label="Open" />);

    expect(screen.getByRole('switch')).toBeChecked();
  });
});
