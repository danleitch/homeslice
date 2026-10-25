import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from '../app';
import { DASHBOARD_STORAGE_KEY } from './lib/storage';
import { sanitizeConfig } from './lib/model';
import { configToYaml } from './lib/yaml';

const seed = (config: unknown): void => {
  window.localStorage.setItem(DASHBOARD_STORAGE_KEY, configToYaml(sanitizeConfig(config)));
};

const board = {
  name: 'Sam',
  groups: [
    {
      name: 'Code',
      bookmarks: [
        { name: 'GitHub', url: 'https://github.com' },
        { name: 'npm', url: 'https://www.npmjs.com' }
      ]
    },
    { name: 'Read', bookmarks: [{ name: 'Lobsters', url: 'https://lobste.rs' }] }
  ]
};

const group = (name: string): HTMLElement => screen.getByRole('region', { name });
const namesIn = (name: string): string[] =>
  [...group(name).querySelectorAll('.bm-name')].map((node) => node.textContent ?? '');
const toasts = (): HTMLElement => document.querySelector<HTMLElement>('.toasts')!;
/**
 * Ends an animation. In jsdom, React listens for the vendor-prefixed name, so both
 * are fired; whichever it listens for is the one that runs.
 */
const endAnimation = (element: Element): void => {
  act(() => {
    element.dispatchEvent(new Event('animationend', { bubbles: true }));
    element.dispatchEvent(new Event('webkitAnimationEnd', { bubbles: true }));
  });
};

const key = (init: KeyboardEventInit): void => {
  fireEvent.keyDown(document.body, init);
};

/** Opens a bookmark's edit dialog from its menu. */
const editBookmark = async (name: RegExp): Promise<HTMLElement> => {
  fireEvent.contextMenu(screen.getByRole('link', { name }));
  await userEvent.click(screen.getByRole('menuitem', { name: 'Edit…' }));
  return screen.getByRole('dialog', { name: 'Edit bookmark' });
};

describe('Dashboard: more flows', () => {
  beforeEach(() => {
    seed(board);
  });

  afterEach(() => {
    window.history.replaceState(null, '', '/');
  });

  describe('editing a bookmark', () => {
    it('moves it to another group from its dialog, to the end', async () => {
      render(<App />);
      const dialog = await editBookmark(/npm/);

      await userEvent.selectOptions(within(dialog).getByLabelText('Group'), 'Read');
      await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));

      expect(namesIn('Read')).toEqual(['Lobsters', 'npm']);
      expect(namesIn('Code')).toEqual(['GitHub']);
    });

    it('moves it into a group made for it, at the start', async () => {
      render(<App />);
      const dialog = await editBookmark(/npm/);

      await userEvent.selectOptions(within(dialog).getByLabelText('Group'), 'New group…');
      await userEvent.type(within(dialog).getByLabelText('New group name'), 'Packages');
      await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));

      expect(group('Packages')).toBeInTheDocument();
      expect(namesIn('Packages')).toEqual(['npm']);
      expect(namesIn('Code')).toEqual(['GitHub']);
    });

    it('keeps it where it is when only its details change', async () => {
      render(<App />);
      const dialog = await editBookmark(/npm/);

      await userEvent.clear(within(dialog).getByLabelText('Name'));
      await userEvent.type(within(dialog).getByLabelText('Name'), 'Node packages');
      await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));

      expect(namesIn('Code')).toEqual(['GitHub', 'Node packages']);
    });

    it('deletes it from its dialog, closing the dialog and offering to take it back', async () => {
      render(<App />);
      const dialog = await editBookmark(/npm/);

      await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));

      expect(screen.queryByRole('dialog', { name: 'Edit bookmark' })).not.toBeInTheDocument();
      expect(namesIn('Code')).toEqual(['GitHub']);
      expect(within(toasts()).getByText('Deleted “npm”')).toBeInTheDocument();
    });

    it('closes without changing anything', async () => {
      render(<App />);
      const dialog = await editBookmark(/npm/);

      await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));

      expect(screen.queryByRole('dialog', { name: 'Edit bookmark' })).not.toBeInTheDocument();
      expect(namesIn('Code')).toEqual(['GitHub', 'npm']);
    });
  });

  describe('adding', () => {
    it('adds to the group whose plus button was pressed', async () => {
      render(<App />);

      await userEvent.click(screen.getByRole('button', { name: 'Add a bookmark to Read' }));

      const dialog = screen.getByRole('dialog', { name: 'Add a bookmark' });
      expect(within(dialog).getByLabelText('Group')).toHaveDisplayValue('Read');
    });

    it('adds from the edit dock', async () => {
      render(<App />);
      key({ key: 'e' });

      await userEvent.click(
        within(screen.getByRole('toolbar', { name: 'Edit the board' })).getByRole('button', {
          name: /Bookmark/
        })
      );

      expect(screen.getByRole('dialog', { name: 'Add a bookmark' })).toBeInTheDocument();
    });

    it('finishes editing from the edit dock', async () => {
      render(<App />);
      key({ key: 'e' });

      await userEvent.click(
        within(screen.getByRole('toolbar', { name: 'Edit the board' })).getByRole('button', {
          name: /Done/
        })
      );

      expect(screen.queryByRole('toolbar', { name: 'Edit the board' })).not.toBeInTheDocument();
    });
  });

  describe('the ghost tiles in edit mode', () => {
    it('start a new group', async () => {
      render(<App />);
      key({ key: 'e' });

      await userEvent.click(screen.getByRole('button', { name: /New group/, description: '' }));

      expect(screen.getByRole('dialog', { name: 'New group' })).toBeInTheDocument();
    });

    it('open the widget picker', async () => {
      render(<App />);
      key({ key: 'e' });

      await userEvent.click(screen.getByRole('button', { name: /Add a widget/ }));

      expect(screen.getByRole('dialog', { name: 'Add a widget' })).toBeInTheDocument();
    });
  });

  describe('closing a dialog without choosing', () => {
    it('the new group dialog', async () => {
      render(<App />);
      key({ key: 'e' });
      await userEvent.click(screen.getByRole('button', { name: /New group/ }));

      await userEvent.click(screen.getByRole('button', { name: 'Close' }));

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('the widget picker', async () => {
      render(<App />);
      key({ key: 'e' });
      await userEvent.click(screen.getByRole('button', { name: /Add a widget/ }));

      await userEvent.click(screen.getByRole('button', { name: 'Close' }));

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('a widget’s settings', async () => {
      render(<App />);
      key({ key: 'e' });
      await userEvent.click(screen.getByRole('button', { name: /Add a widget/ }));
      await userEvent.click(screen.getByRole('button', { name: 'Add Weather' }));
      expect(screen.getByRole('dialog', { name: 'Weather' })).toBeInTheDocument();

      await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  describe('an installed app', () => {
    it('can be opened from the search box by name', async () => {
      seed({
        ...board,
        extensions: { apps: [{ id: 'doddle', name: 'Doddle', url: 'https://doddle.example/' }] }
      });
      render(<App />);

      await userEvent.click(screen.getByRole('combobox', { name: 'Search' }));
      await userEvent.type(screen.getByRole('combobox', { name: 'Search' }), 'doddle');
      await userEvent.click(screen.getByRole('option', { name: /Open Doddle/ }));

      expect(screen.getByRole('dialog', { name: /Doddle/ })).toBeInTheDocument();
      expect(window.location.hash).toBe('#app/doddle');
    });
  });

  describe('moving between pages', () => {
    const pages = (): HTMLElement[] => [...document.querySelectorAll<HTMLElement>('.page')];

    it('leaves the old page in place while it slides out, then clears it away', async () => {
      render(<App />);
      expect(pages()).toHaveLength(1);

      await userEvent.click(screen.getByRole('button', { name: 'Page 2' }));
      expect(pages()).toHaveLength(2);
      const leaving = pages().find((page) => page.dataset.state === 'leaving')!;
      expect(leaving).toHaveAttribute('aria-hidden', 'true');

      endAnimation(leaving);

      expect(pages()).toHaveLength(1);
      expect(pages()[0]).toHaveAttribute('data-state', 'current');
    });

    it('ignores the end of an animation inside a page, which is not the page leaving', async () => {
      render(<App />);
      await userEvent.click(screen.getByRole('button', { name: 'Page 2' }));
      const leaving = pages().find((page) => page.dataset.state === 'leaving')!;

      endAnimation(leaving.querySelector('.grp')!);

      expect(pages()).toHaveLength(2);
    });

    it('ignores the end of the animation on the page that is arriving', async () => {
      render(<App />);
      await userEvent.click(screen.getByRole('button', { name: 'Page 2' }));
      const current = pages().find((page) => page.dataset.state === 'current')!;

      endAnimation(current);

      expect(pages()).toHaveLength(2);
    });
  });
});
