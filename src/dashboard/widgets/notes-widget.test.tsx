import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MAX_ITEMS, type NotesWidget as NotesConfig } from '../lib/notes';
import { createWidget } from '../lib/model';
import { NotesWidget } from './notes-widget';

const widgetOf = (patch: Partial<NotesConfig> = {}): NotesConfig => ({
  ...(createWidget('notes') as NotesConfig),
  ...patch
});

const tasks = (...texts: string[]) => texts.map((text) => ({ text, done: false }));

const user = () => userEvent.setup();

/** A real pause: Testing Library does its own waiting on timers, so they are not faked here. */
const pause = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** The widget with something to keep what it is told, and to be shown again when it changes. */
const show = (widget: NotesConfig) => {
  const onChange = vi.fn();
  const view = render(<NotesWidget widget={widget} onChange={onChange} />);
  const again = (next: NotesConfig) =>
    view.rerender(<NotesWidget widget={next} onChange={onChange} />);
  return { onChange, again, ...view };
};

const last = (onChange: ReturnType<typeof vi.fn>): NotesConfig =>
  onChange.mock.lastCall![0] as NotesConfig;

describe('NotesWidget, as a to-do list', () => {
  it('says so when there is nothing to do, and invites a task', () => {
    show(widgetOf());

    expect(screen.getByText('Nothing to do. Add a task below.')).toBeInTheDocument();
    expect(screen.getByLabelText('Add a task')).toBeInTheDocument();
    expect(screen.queryByText(/left/)).toBeNull();
  });

  it('lists the tasks, ticked as they are', () => {
    show(
      widgetOf({
        items: [
          { text: 'Milk', done: true },
          { text: 'Eggs', done: false }
        ]
      })
    );

    expect(screen.getByRole('checkbox', { name: 'Milk' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Eggs' })).not.toBeChecked();
  });

  it('counts what is left', () => {
    const { again } = show(widgetOf({ items: tasks('a', 'b', 'c') }));
    expect(screen.getByText('3 left')).toBeInTheDocument();

    again(
      widgetOf({
        items: [
          { text: 'a', done: true },
          { text: 'b', done: true },
          { text: 'c', done: false }
        ]
      })
    );
    expect(screen.getByText('1 left')).toBeInTheDocument();

    again(widgetOf({ items: [{ text: 'a', done: true }] }));
    expect(screen.getByText('All done')).toBeInTheDocument();
  });

  describe('adding', () => {
    it('adds a task on Enter, and clears the box for the next', async () => {
      const { onChange } = show(widgetOf({ items: tasks('a') }));

      await user().type(screen.getByLabelText('Add a task'), 'Buy milk{Enter}');

      expect(last(onChange).items).toEqual([
        { text: 'a', done: false },
        { text: 'Buy milk', done: false }
      ]);
      expect(screen.getByLabelText('Add a task')).toHaveValue('');
    });

    it('adds a task from its button, which waits for something to add', async () => {
      const { onChange } = show(widgetOf());
      const button = screen.getByRole('button', { name: 'Add' });
      expect(button).toBeDisabled();

      await user().type(screen.getByLabelText('Add a task'), 'Buy milk');
      expect(button).toBeEnabled();
      await user().click(button);

      expect(last(onChange).items).toEqual([{ text: 'Buy milk', done: false }]);
    });

    it('keeps the widget’s other settings when it adds', async () => {
      const { onChange } = show(widgetOf({ width: 6, text: 'kept' }));

      await user().type(screen.getByLabelText('Add a task'), 'x{Enter}');

      expect(last(onChange)).toMatchObject({ type: 'notes', width: 6, text: 'kept' });
    });

    it('adds nothing for spaces, which the form will not even submit', async () => {
      const { onChange } = show(widgetOf());

      await user().type(screen.getByLabelText('Add a task'), '   {Enter}');

      expect(onChange).not.toHaveBeenCalled();
    });

    it('says the list is full, and stops taking tasks, at a hundred', () => {
      show(widgetOf({ items: tasks(...Array.from({ length: MAX_ITEMS }, (_u, n) => `t${n}`)) }));

      expect(screen.getByLabelText('Add a task')).toBeDisabled();
      expect(screen.getByPlaceholderText('The list is full')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();
    });
  });

  describe('ticking', () => {
    it('ticks a task from its box', async () => {
      const { onChange } = show(widgetOf({ items: tasks('a', 'b') }));

      await user().click(screen.getByRole('checkbox', { name: 'b' }));

      expect(last(onChange).items).toEqual([
        { text: 'a', done: false },
        { text: 'b', done: true }
      ]);
    });

    it('ticks a task from its words, which are its label', async () => {
      const { onChange } = show(widgetOf({ items: tasks('a') }));

      await user().click(screen.getByText('a'));

      expect(last(onChange).items[0]!.done).toBe(true);
    });

    it('strikes a done task through, and leaves the others', () => {
      show(
        widgetOf({
          items: [
            { text: 'a', done: true },
            { text: 'b', done: false }
          ]
        })
      );

      expect(screen.getByText('a').closest('li')).toHaveClass('nt-item--done');
      expect(screen.getByText('b').closest('li')).not.toHaveClass('nt-item--done');
    });
  });

  describe('rewording', () => {
    const edit = async (name: string) =>
      user().click(screen.getByRole('button', { name: `Reword “${name}”` }));

    it('turns the words into a box to change them in, with the cursor in it', async () => {
      show(widgetOf({ items: tasks('Milk') }));

      await edit('Milk');

      const box = screen.getByRole('textbox', { name: 'Reword “Milk”' }) as HTMLInputElement;
      expect(box).toHaveValue('Milk');
      expect(box).toHaveFocus();
      // Selected, so that typing replaces the words.
      expect([box.selectionStart, box.selectionEnd]).toEqual([0, 4]);
    });

    it('keeps the new words on Enter', async () => {
      const { onChange } = show(widgetOf({ items: [{ text: 'Milk', done: true }] }));

      await edit('Milk');
      await user().clear(screen.getByRole('textbox', { name: /Reword/ }));
      await user().type(screen.getByRole('textbox', { name: /Reword/ }), 'Oat milk{Enter}');

      expect(last(onChange).items).toEqual([{ text: 'Oat milk', done: true }]);
      expect(screen.queryByRole('textbox', { name: /Reword/ })).toBeNull();
    });

    it('keeps them when the box is left', async () => {
      const { onChange } = show(widgetOf({ items: tasks('Milk') }));

      await edit('Milk');
      await user().type(screen.getByRole('textbox', { name: /Reword/ }), ' (oat)');
      await user().tab();

      expect(last(onChange).items[0]!.text).toBe('Milk (oat)');
    });

    it('goes back to the words it had on Escape, without keeping the change', async () => {
      const { onChange } = show(widgetOf({ items: tasks('Milk') }));

      await edit('Milk');
      await user().type(screen.getByRole('textbox', { name: /Reword/ }), ' (oat){Escape}');

      expect(screen.getByText('Milk')).toBeInTheDocument();
      expect(onChange).not.toHaveBeenCalled();
    });

    it('does not let Escape close what the widget sits in', async () => {
      const outside = vi.fn();
      render(
        <div onKeyDown={outside}>
          <NotesWidget widget={widgetOf({ items: tasks('Milk') })} onChange={vi.fn()} />
        </div>
      );

      await edit('Milk');
      await user().keyboard('{Escape}');

      expect(outside).not.toHaveBeenCalled();
    });

    it('takes the task off when it is reworded to nothing', async () => {
      const { onChange } = show(widgetOf({ items: tasks('Milk', 'Eggs') }));

      await edit('Milk');
      await user().clear(screen.getByRole('textbox', { name: /Reword/ }));
      await user().keyboard('{Enter}');

      expect(last(onChange).items).toEqual([{ text: 'Eggs', done: false }]);
    });

    it('starts from the words the task has now each time', async () => {
      const { again } = show(widgetOf({ items: tasks('Milk') }));

      await edit('Milk');
      await user().type(screen.getByRole('textbox', { name: /Reword/ }), ' half-typed{Escape}');
      await edit('Milk');

      expect(screen.getByRole('textbox', { name: /Reword/ })).toHaveValue('Milk');
      again(widgetOf({ items: tasks('Milk') }));
    });
  });

  it('removes a task, and no other', async () => {
    const { onChange } = show(widgetOf({ items: tasks('a', 'b', 'c') }));

    await user().click(screen.getByRole('button', { name: 'Remove “b”' }));

    expect(last(onChange).items.map((item) => item.text)).toEqual(['a', 'c']);
  });

  it('clears what is done, and offers to only when something is', async () => {
    const { onChange, again } = show(widgetOf({ items: tasks('a', 'b') }));
    expect(screen.queryByRole('button', { name: 'Clear done' })).toBeNull();

    again(
      widgetOf({
        items: [
          { text: 'a', done: true },
          { text: 'b', done: false }
        ]
      })
    );
    await user().click(screen.getByRole('button', { name: 'Clear done' }));

    expect(last(onChange).items).toEqual([{ text: 'b', done: false }]);
  });

  it('can be read, though not changed, with nothing to keep what is written', async () => {
    render(<NotesWidget widget={widgetOf({ items: tasks('a') })} />);

    await user().click(screen.getByRole('checkbox', { name: 'a' }));

    expect(screen.getByRole('checkbox', { name: 'a' })).not.toBeChecked();
  });

  it('tells two tasks that say the same apart', async () => {
    const { onChange } = show(widgetOf({ items: tasks('Same', 'Same') }));

    await user().click(screen.getAllByRole('checkbox', { name: 'Same' })[1]!);

    expect(last(onChange).items.map((item) => item.done)).toEqual([false, true]);
  });
});

describe('NotesWidget, as a note', () => {
  const note = (patch: Partial<NotesConfig> = {}) => widgetOf({ mode: 'text', ...patch });
  const box = (): HTMLTextAreaElement => screen.getByRole('textbox', { name: 'Note' });

  it('shows the note, or invites one', () => {
    const { again } = show(note());
    expect(box()).toHaveValue('');
    expect(box()).toHaveAttribute('placeholder', 'Jot something down');

    again(note({ text: 'Remember\nthe milk' }));
    expect(box()).toHaveValue('Remember\nthe milk');
  });

  it('keeps what is typed a moment after the typing stops, not on every key', async () => {
    const { onChange } = show(note());

    await user().type(box(), 'Milk');
    expect(onChange).not.toHaveBeenCalled();

    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1), { timeout: 2_000 });
    expect(last(onChange)).toMatchObject({ mode: 'text', text: 'Milk' });
  });

  it('waits longer while the typing goes on', async () => {
    const { onChange } = show(note());
    const typist = user();

    await typist.type(box(), 'a');
    await pause(350);
    await typist.type(box(), 'b');
    await pause(350);
    // More than half a second since the first key, but not since the last.
    expect(onChange).not.toHaveBeenCalled();

    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1), { timeout: 2_000 });
    expect(last(onChange).text).toBe('ab');
  });

  it('keeps it at once when the note is left', async () => {
    const { onChange } = show(note());

    await user().type(box(), 'Milk');
    await user().tab();

    expect(last(onChange).text).toBe('Milk');
  });

  it('keeps it when the widget goes, whether it was removed or the page closed', async () => {
    const { onChange, unmount } = show(note());

    await user().type(box(), 'Milk');
    unmount();

    expect(last(onChange).text).toBe('Milk');
  });

  it('keeps nothing when nothing changed', async () => {
    const { onChange, unmount } = show(note({ text: 'Same' }));

    await user().click(box());
    await user().tab();
    await pause(700);
    unmount();

    expect(onChange).not.toHaveBeenCalled();
  });

  it('shows what another tab wrote, when this one is not being typed in', () => {
    const { again } = show(note({ text: 'Mine' }));

    again(note({ text: 'Theirs' }));

    expect(box()).toHaveValue('Theirs');
  });

  it('leaves what is being typed alone when another tab writes', async () => {
    const { again } = show(note({ text: 'Mine' }));

    await user().click(box());
    await user().type(box(), ' and more');
    again(note({ text: 'Theirs' }));

    expect(box()).toHaveValue('Mine and more');
  });

  it('leaves the note on Escape, without closing what it sits in', async () => {
    const outside = vi.fn();
    render(
      <div onKeyDown={outside}>
        <NotesWidget widget={note()} onChange={vi.fn()} />
      </div>
    );

    await user().click(box());
    await user().keyboard('{Escape}');

    expect(box()).not.toHaveFocus();
    expect(outside).not.toHaveBeenCalled();
  });

  it('can be read, though not changed, with nothing to keep what is written', async () => {
    const { unmount } = render(<NotesWidget widget={note({ text: 'Read me' })} />);

    await user().type(box(), '!');
    unmount();

    expect(within(document.body).queryByRole('textbox')).toBeNull();
  });
});
