import { createRef, type JSX } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createBookmark, createGroup, type Group, type SearchEngine } from '../lib/model';
import { openUrl } from '../lib/urls';
import { SearchBox, type Command } from './search-box';

vi.mock('../lib/urls', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/urls')>()),
  openUrl: vi.fn()
}));

const groups = (): Group[] => [
  {
    ...createGroup('Code'),
    bookmarks: [
      createBookmark({
        name: 'GitHub',
        url: 'https://github.com',
        description: 'Pull requests',
        icon: ''
      }),
      createBookmark({ name: 'npm', url: 'https://www.npmjs.com', description: '', icon: '' })
    ]
  },
  {
    ...createGroup('Read'),
    bookmarks: [
      createBookmark({ name: 'Lobsters', url: 'https://lobste.rs', description: '', icon: '' })
    ]
  }
];

const command = (id: string, label: string, keywords = '', hint?: string): Command => ({
  id,
  label,
  icon: <svg data-testid={`icon-${id}`} />,
  keywords,
  hint,
  run: vi.fn()
});

const open = (
  options: { engine?: SearchEngine; newTab?: boolean; commands?: Command[] } = {}
): { input: HTMLInputElement; commands: Command[] } => {
  const commands = options.commands ?? [];
  const inputRef = createRef<HTMLInputElement>();
  const view = (): JSX.Element => (
    <SearchBox
      groups={groups()}
      engine={options.engine ?? 'google'}
      newTab={options.newTab ?? false}
      commands={commands}
      inputRef={inputRef}
    />
  );
  render(view());

  return { input: screen.getByRole('combobox', { name: 'Search' }) as HTMLInputElement, commands };
};

const type = async (input: HTMLInputElement, text: string): Promise<void> => {
  await userEvent.click(input);
  await userEvent.type(input, text);
};

const options = (): string[] =>
  screen.queryAllByRole('option').map((option) => option.textContent ?? '');

const last = <T,>(items: readonly T[]): T => items[items.length - 1]!;

describe('SearchBox', () => {
  beforeEach(() => {
    vi.mocked(openUrl).mockClear();
  });

  describe('the box', () => {
    it('is a combobox that starts closed and empty', () => {
      const { input } = open();

      expect(input).toHaveAttribute('aria-expanded', 'false');
      expect(input).not.toHaveAttribute('aria-activedescendant');
      expect(input).toHaveAttribute('placeholder', 'Search bookmarks or the web');
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });

    it('reminds the visitor of the shortcut until it is used', async () => {
      const { input } = open();
      expect(screen.getByText('/')).toBeInTheDocument();

      await userEvent.click(input);
      expect(screen.queryByText('/')).not.toBeInTheDocument();

      await userEvent.tab();
      expect(screen.getByText('/')).toBeInTheDocument();
    });

    it('stays closed while it has no focus, whatever was typed', async () => {
      const { input } = open();
      await type(input, 'git');

      fireEvent.blur(input);

      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });
  });

  describe('the results', () => {
    it('finds bookmarks, saying which group each is in and where it goes', async () => {
      const { input } = open();

      await type(input, 'github');

      expect(input).toHaveAttribute('aria-expanded', 'true');
      expect(within(screen.getAllByRole('option')[0]!).getByText('GitHub')).toBeInTheDocument();
      expect(screen.getByText('Code · github.com')).toBeInTheDocument();
    });

    it('always ends with a web search, in the chosen engine', async () => {
      const { input } = open({ engine: 'duckduckgo' });

      await type(input, 'github');

      const results = options();
      expect(last(results)).toMatch(/^Search DuckDuckGo for github/);
    });

    it('offers a web search for anything that is not a bookmark', async () => {
      const { input } = open();

      await type(input, 'zzzz');

      expect(options()).toHaveLength(1);
      expect(options()[0]).toMatch(/^Search Google for zzzz/);
    });

    it('offers to go straight to an address, ahead of everything else', async () => {
      const { input } = open();

      await type(input, 'example.com/page');

      expect(options()[0]).toBe('Go to example.com/page');
      expect(last(options())).toMatch(/^Search Google for/);
    });

    it('offers the board’s own actions by name, once two letters are typed', async () => {
      const { input } = open({
        commands: [
          command('add', 'Add a bookmark', 'new link', 'N'),
          command('edit', 'Edit the board', 'arrange', 'E')
        ]
      });

      await type(input, 'a');
      expect(options().some((text) => text.startsWith('Add a bookmark'))).toBe(false);

      await userEvent.type(input, 'd');
      expect(options().some((text) => text.startsWith('Add a bookmark'))).toBe(true);
      expect(options().some((text) => text.startsWith('Edit the board'))).toBe(false);
    });

    it('finds a command by its keywords too, and shows its shortcut', async () => {
      const { input } = open({
        commands: [command('edit', 'Edit the board', 'arrange move resize', 'E')]
      });

      await type(input, 'arr');

      const row = screen.getByRole('option', { name: /Edit the board/ });
      expect(within(row).getByText('E').tagName).toBe('KBD');
      expect(within(row).getByTestId('icon-edit')).toBeInTheDocument();
    });

    it('matches the start of a word, not the middle of one', async () => {
      const { input } = open({ commands: [command('edit', 'Edit the board', 'arrange')] });

      await type(input, 'rang');

      expect(options().some((text) => text.startsWith('Edit the board'))).toBe(false);
    });

    it('shows no shortcut for a command without one', async () => {
      const { input } = open({ commands: [command('settings', 'Settings', 'preferences')] });

      await type(input, 'set');

      expect(
        within(screen.getByRole('option', { name: /Settings/ })).queryByText(/./, {
          selector: 'kbd'
        })
      ).toBeNull();
    });

    it('marks the first result as the one Enter will open', async () => {
      const { input } = open();

      await type(input, 'github');

      expect(screen.getAllByRole('option')[0]).toHaveAttribute('aria-selected', 'true');
      expect(input.getAttribute('aria-activedescendant')).toBe(
        screen.getAllByRole('option')[0]!.id
      );
    });
  });

  describe('choosing', () => {
    it('moves down and up through the results, wrapping at either end', async () => {
      const { input } = open();
      await type(input, 'git');
      const count = screen.getAllByRole('option').length;

      await userEvent.keyboard('{ArrowDown}');
      expect(screen.getAllByRole('option')[1]).toHaveAttribute('aria-selected', 'true');

      await userEvent.keyboard('{ArrowUp}{ArrowUp}');
      expect(screen.getAllByRole('option')[count - 1]).toHaveAttribute('aria-selected', 'true');

      await userEvent.keyboard('{ArrowDown}');
      expect(screen.getAllByRole('option')[0]).toHaveAttribute('aria-selected', 'true');
    });

    it('follows the pointer too', async () => {
      const { input } = open();
      await type(input, 'git');

      await userEvent.hover(last(screen.getAllByRole('option')));

      expect(last(screen.getAllByRole('option'))).toHaveAttribute('aria-selected', 'true');
    });

    it('goes back to the first result when the text changes', async () => {
      const { input } = open();
      await type(input, 'git');
      await userEvent.keyboard('{ArrowDown}');

      await userEvent.type(input, 'h');

      expect(screen.getAllByRole('option')[0]).toHaveAttribute('aria-selected', 'true');
    });

    it('opens the chosen bookmark on Enter, then clears and leaves the box', async () => {
      const { input } = open();
      await type(input, 'github');

      await userEvent.keyboard('{Enter}');

      expect(openUrl).toHaveBeenCalledExactlyOnceWith('https://github.com', false);
      expect(input).toHaveValue('');
      expect(input).not.toHaveFocus();
    });

    it('opens it in a new tab when the board is set to', async () => {
      const { input } = open({ newTab: true });
      await type(input, 'github');

      await userEvent.keyboard('{Enter}');

      expect(openUrl).toHaveBeenCalledWith('https://github.com', true);
    });

    it.each(['{Control>}{Enter}{/Control}', '{Meta>}{Enter}{/Meta}'])(
      'opens it in a new tab with %s whatever the setting',
      async (keys) => {
        const { input } = open({ newTab: false });
        await type(input, 'github');

        await userEvent.keyboard(keys);

        expect(openUrl).toHaveBeenCalledWith('https://github.com', true);
      }
    );

    it('goes to an address typed in full', async () => {
      const { input } = open();
      await type(input, 'example.com');

      await userEvent.keyboard('{Enter}');

      expect(openUrl).toHaveBeenCalledWith('https://example.com/', false);
    });

    it('searches the web in the chosen engine, encoding what was typed', async () => {
      const { input } = open({ engine: 'duckduckgo' });
      await type(input, 'cats & dogs');

      await userEvent.keyboard('{Enter}');

      expect(openUrl).toHaveBeenCalledWith(
        expect.stringContaining(encodeURIComponent('cats & dogs')),
        false
      );
      expect(vi.mocked(openUrl).mock.calls[0]![0]).toContain('duckduckgo');
    });

    it('runs a command instead of opening anything', async () => {
      const { input, commands } = open({
        commands: [command('edit', 'Edit the board', 'arrange')]
      });
      await type(input, 'edit');
      const selected = screen.getByRole('option', { selected: true });
      expect(selected).toHaveTextContent('Edit the board');

      await userEvent.keyboard('{Enter}');

      expect(commands[0]!.run).toHaveBeenCalledTimes(1);
      expect(openUrl).not.toHaveBeenCalled();
      expect(input).toHaveValue('');
    });

    it('does nothing on Enter when there is nothing to choose', async () => {
      const { input } = open();
      await userEvent.click(input);

      await userEvent.keyboard('{Enter}');

      expect(openUrl).not.toHaveBeenCalled();
    });

    it('opens a result that is clicked, keeping the box focused until then', async () => {
      const { input } = open();
      await type(input, 'github');
      const mouseDown = fireEvent.mouseDown(screen.getByRole('listbox'));
      expect(mouseDown).toBe(false);

      await userEvent.click(screen.getAllByRole('option')[0]!);

      expect(openUrl).toHaveBeenCalledWith('https://github.com', false);
    });

    it('opens a clicked result in a new tab with Ctrl held', async () => {
      const { input } = open();
      await type(input, 'github');

      fireEvent.click(screen.getAllByRole('option')[0]!, { ctrlKey: true });

      expect(openUrl).toHaveBeenCalledWith('https://github.com', true);
    });

    it('runs a command that is clicked', async () => {
      const { input, commands } = open({
        commands: [command('edit', 'Edit the board', 'arrange')]
      });
      await type(input, 'edit');

      await userEvent.click(screen.getByRole('option', { name: /Edit the board/ }));

      expect(commands[0]!.run).toHaveBeenCalledTimes(1);
    });

    it('opens a result in a new tab on a middle click', async () => {
      const { input } = open();
      await type(input, 'github');

      fireEvent(
        screen.getAllByRole('option')[0]!,
        new MouseEvent('auxclick', { bubbles: true, button: 1 })
      );

      expect(openUrl).toHaveBeenCalledWith('https://github.com', true);
    });

    it('ignores other auxiliary buttons', async () => {
      const { input } = open();
      await type(input, 'github');

      fireEvent(
        screen.getAllByRole('option')[0]!,
        new MouseEvent('auxclick', { bubbles: true, button: 2 })
      );

      expect(openUrl).not.toHaveBeenCalled();
    });
  });

  describe('Escape', () => {
    it('clears what was typed first', async () => {
      const { input } = open();
      await type(input, 'github');

      await userEvent.keyboard('{Escape}');

      expect(input).toHaveValue('');
      expect(input).toHaveFocus();
    });

    it('then leaves the box', async () => {
      const { input } = open();
      await userEvent.click(input);

      await userEvent.keyboard('{Escape}');

      expect(input).not.toHaveFocus();
    });
  });
});
