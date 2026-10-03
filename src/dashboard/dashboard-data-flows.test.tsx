import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
const toast = (text: RegExp | string): HTMLElement => within(toasts()).getByText(text);
const groupNames = (): string[] =>
  [...document.querySelectorAll('section.grp')].map(
    (node) => node.getAttribute('aria-label') ?? ''
  );

const HOMEPAGE = `
- Media:
    - Plex:
        - href: http://plex.lan:32400
    - Jellyfin:
        - href: http://jellyfin.lan:8096
- Code:
    - Gitea:
        - href: http://git.lan
`;

const fileOf = (
  text: string,
  name = 'bookmarks.yaml',
  options: { size?: number; noText?: boolean } = {}
): File => {
  const file = new File([text], name, { type: 'text/yaml' });

  if (options.size !== undefined) {
    Object.defineProperty(file, 'size', { value: options.size });
  }

  if (options.noText) {
    Object.defineProperty(file, 'text', { value: undefined });
  }

  return file;
};

/** Drops a file anywhere on the page, as a visitor would. */
const dropFile = (file: File): void => {
  fireEvent(
    window,
    Object.assign(new Event('drop', { bubbles: true, cancelable: true }), {
      dataTransfer: { types: ['Files'], files: [file], getData: () => '' }
    })
  );
};

const importDialog = (): Promise<HTMLElement> => screen.findByRole('dialog', { name: 'Import' });

describe('Dashboard data flows', () => {
  beforeEach(() => {
    seed(board);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('importing a file', () => {
    it('shows what the file holds and what it looks like, before changing anything', async () => {
      render(<App />);

      dropFile(fileOf(HOMEPAGE, 'services.yaml'));
      const dialog = await importDialog();

      expect(
        within(dialog).getByText('services.yaml looks like a homepage bookmarks file.')
      ).toBeInTheDocument();
      expect(within(dialog).getByText('Groups').nextElementSibling).toHaveTextContent('2');
      expect(within(dialog).getByText('Bookmarks').nextElementSibling).toHaveTextContent('3');
      expect(groupNames()).toEqual(['Code', 'Read']);
    });

    it('adds its groups after the board’s own, merging a group of the same name', async () => {
      render(<App />);
      dropFile(fileOf(HOMEPAGE));

      await userEvent.click(
        within(await importDialog()).getByRole('button', { name: 'Add to my board' })
      );

      expect(groupNames()).toEqual(['Code', 'Read', 'Media']);
      expect(namesIn('Code')).toEqual(['GitHub', 'npm', 'Gitea']);
      expect(toast('Imported 3 bookmarks')).toBeInTheDocument();
      expect(screen.queryByRole('dialog', { name: 'Import' })).not.toBeInTheDocument();
    });

    it('can replace the board’s bookmarks, and be undone', async () => {
      render(<App />);
      dropFile(fileOf(HOMEPAGE));

      await userEvent.click(
        within(await importDialog()).getByRole('button', { name: 'Replace my bookmarks' })
      );

      expect(groupNames()).toEqual(['Media', 'Code']);
      expect(namesIn('Code')).toEqual(['Gitea']);
      expect(toast('Replaced your bookmarks')).toBeInTheDocument();

      await userEvent.click(within(toasts()).getByRole('button', { name: /Undo/ }));
      expect(groupNames()).toEqual(['Code', 'Read']);
    });

    it('says “bookmark” for a single one', async () => {
      render(<App />);
      dropFile(fileOf('- Solo:\n    - One:\n        - href: http://one.lan\n'));

      await userEvent.click(
        within(await importDialog()).getByRole('button', { name: 'Add to my board' })
      );

      expect(toast('Imported 1 bookmark')).toBeInTheDocument();
    });

    it('leaves everything alone when cancelled', async () => {
      render(<App />);
      dropFile(fileOf(HOMEPAGE));

      await userEvent.click(within(await importDialog()).getByRole('button', { name: 'Cancel' }));

      expect(screen.queryByRole('dialog', { name: 'Import' })).not.toBeInTheDocument();
      expect(groupNames()).toEqual(['Code', 'Read']);
    });

    it('reads a file in a browser whose files cannot read themselves', async () => {
      render(<App />);

      dropFile(fileOf(HOMEPAGE, 'old-browser.yaml', { noText: true }));

      expect(await importDialog()).toBeInTheDocument();
    });

    it('turns away a file too big to be a bookmarks file', async () => {
      render(<App />);

      dropFile(fileOf(HOMEPAGE, 'huge.yaml', { size: 5_000_001 }));

      expect(
        await screen.findByText('That file is too big to be a bookmarks file.')
      ).toBeInTheDocument();
      expect(screen.queryByRole('dialog', { name: 'Import' })).not.toBeInTheDocument();
    });

    it('accepts a file just under the limit', async () => {
      render(<App />);

      dropFile(fileOf(HOMEPAGE, 'big.yaml', { size: 5_000_000 }));

      expect(await importDialog()).toBeInTheDocument();
    });

    it('says what is wrong with a file it cannot read', async () => {
      render(<App />);

      dropFile(fileOf('this is not a bookmarks file at all', 'notes.txt'));

      await waitFor(() => expect(toasts().querySelector('.toast--error')).not.toBeNull());
      expect(screen.queryByRole('dialog', { name: 'Import' })).not.toBeInTheDocument();
    });

    it('imports a file chosen from Settings, putting Settings away', async () => {
      render(<App />);
      await userEvent.click(screen.getByRole('button', { name: 'Dashboard settings' }));
      const settings = screen.getByRole('dialog', { name: 'Settings' });
      await userEvent.click(within(settings).getByRole('tab', { name: 'Data & YAML' }));
      const input = settings.querySelector<HTMLInputElement>('input[type="file"]')!;

      fireEvent.change(input, { target: { files: [fileOf(HOMEPAGE)] } });

      expect(await importDialog()).toBeInTheDocument();
      expect(screen.queryByRole('dialog', { name: 'Settings' })).not.toBeInTheDocument();
    });
  });

  describe('starting over', () => {
    const resetTo = async (label: string): Promise<void> => {
      await userEvent.click(screen.getByRole('button', { name: 'Dashboard settings' }));
      const settings = screen.getByRole('dialog', { name: 'Settings' });
      await userEvent.click(within(settings).getByRole('tab', { name: 'Data & YAML' }));
      await userEvent.click(within(settings).getByRole('button', { name: /Reset the board…/ }));
      await userEvent.click(within(settings).getByRole('button', { name: label }));
    };

    it('goes back to the example, and puts Settings away', async () => {
      render(<App />);

      await resetTo('Example board');

      expect(toast('Started again from the example')).toBeInTheDocument();
      expect(screen.queryByRole('dialog', { name: 'Settings' })).not.toBeInTheDocument();
      expect(group('Code')).toBeInTheDocument();
      // The example's own bookmarks, not the ones this board started with.
      expect(namesIn('Code')).toContain('Stack Overflow');
    });

    it('clears the board, leaving the way in', async () => {
      render(<App />);

      await resetTo('Empty board');

      expect(toast('Cleared the board')).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Your board is empty' })).toBeInTheDocument();
    });

    it('forgets what the widgets had fetched', async () => {
      window.localStorage.setItem('dashboard-cache:weather', '{"at":1,"data":{}}');
      render(<App />);

      await resetTo('Empty board');

      expect(window.localStorage.getItem('dashboard-cache:weather')).toBeNull();
    });

    it('can be undone', async () => {
      render(<App />);
      await resetTo('Empty board');

      await userEvent.click(within(toasts()).getByRole('button', { name: /Undo/ }));

      expect(groupNames()).toEqual(['Code', 'Read']);
    });
  });

  describe('an empty board', () => {
    beforeEach(() => {
      seed({ name: 'Sam', groups: [], widgets: [] });
    });

    it('invites a bookmark, an import, or the example', () => {
      render(<App />);

      expect(screen.getByRole('heading', { name: 'Your board is empty' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Add a bookmark/ })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Import bookmarks/ })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Use the example/ })).toBeInTheDocument();
    });

    it('starts a bookmark from its button', async () => {
      render(<App />);

      await userEvent.click(screen.getByRole('button', { name: /Add a bookmark/ }));

      expect(screen.getByRole('dialog', { name: 'Add a bookmark' })).toBeInTheDocument();
    });

    it('opens the file chooser to import', async () => {
      render(<App />);
      const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
      const click = vi.spyOn(input, 'click').mockImplementation(() => {});

      await userEvent.click(screen.getByRole('button', { name: /Import bookmarks/ }));

      expect(click).toHaveBeenCalledTimes(1);
    });

    it('imports the file that was chosen, and lets the same one be chosen again', async () => {
      render(<App />);
      const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;

      fireEvent.change(input, { target: { files: [fileOf(HOMEPAGE)] } });

      expect(await importDialog()).toBeInTheDocument();
      expect(input.value).toBe('');
    });

    it('ignores the chooser being dismissed', () => {
      render(<App />);
      const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;

      fireEvent.change(input, { target: { files: [] } });

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('fills the page with the example', async () => {
      window.localStorage.setItem('dashboard-cache:weather', '{"at":1,"data":{}}');
      render(<App />);

      await userEvent.click(screen.getByRole('button', { name: /Use the example/ }));

      expect(group('Code')).toBeInTheDocument();
      expect(
        screen.queryByRole('heading', { name: 'Your board is empty' })
      ).not.toBeInTheDocument();
      expect(window.localStorage.getItem('dashboard-cache:weather')).toBeNull();
    });

    it('shows the board itself, ghost tiles and all, while it is being edited', () => {
      render(<App />);

      fireEvent.keyDown(document.body, { key: 'e' });

      expect(
        screen.queryByRole('heading', { name: 'Your board is empty' })
      ).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: /New group/ })).toBeInTheDocument();
    });
  });

  describe('the search box’s commands', () => {
    const run = async (query: string, label: RegExp): Promise<void> => {
      await userEvent.click(screen.getByRole('combobox', { name: 'Search' }));
      await userEvent.type(screen.getByRole('combobox', { name: 'Search' }), query);
      await userEvent.click(screen.getByRole('option', { name: label }));
    };

    it('opens Extensions', async () => {
      render(<App />);

      await run('ext', /^Extensions/);

      expect(screen.getByRole('dialog', { name: 'Extensions' })).toBeInTheDocument();
    });

    it('opens Settings', async () => {
      render(<App />);

      await run('sett', /^Settings/);

      const settings = screen.getByRole('dialog', { name: 'Settings' });
      expect(within(settings).getByRole('tab', { name: 'General' })).toHaveAttribute(
        'aria-selected',
        'true'
      );
    });

    it('opens the YAML editor', async () => {
      render(<App />);

      await run('yaml', /Edit YAML/);

      const settings = screen.getByRole('dialog', { name: 'Settings' });
      expect(within(settings).getByRole('tab', { name: 'Data & YAML' })).toHaveAttribute(
        'aria-selected',
        'true'
      );
    });

    it('adds a bookmark, and starts editing', async () => {
      render(<App />);

      await run('add', /Add a bookmark/);
      expect(screen.getByRole('dialog', { name: 'Add a bookmark' })).toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'Close' }));

      await run('edit', /Edit the board/);
      expect(screen.getByRole('toolbar', { name: 'Edit the board' })).toBeInTheDocument();
    });

    it('opens Branchify', async () => {
      render(<App />);

      await run('bran', /Open Branchify/);

      expect(screen.getByRole('dialog', { name: /Branchify/ })).toBeInTheDocument();
    });

    describe('exporting', () => {
      const original = { create: URL.createObjectURL, revoke: URL.revokeObjectURL };

      afterEach(() => {
        URL.createObjectURL = original.create;
        URL.revokeObjectURL = original.revoke;
        vi.restoreAllMocks();
      });

      it('downloads the board as a file, and lets go of it a while later', async () => {
        const createObjectURL = vi.fn(() => 'blob:export');
        const revoke = vi.fn();
        URL.createObjectURL = createObjectURL;
        URL.revokeObjectURL = revoke;
        const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
        const timeout = vi.spyOn(window, 'setTimeout');
        render(<App />);

        await run('export', /Export YAML/);

        expect(createObjectURL).toHaveBeenCalledTimes(1);
        expect(click).toHaveBeenCalledTimes(1);
        expect(toast(/^Exported dashboard-\d{4}-\d{2}-\d{2}\.yaml$/)).toBeInTheDocument();
        // The link was only there to be clicked.
        expect(document.querySelector('a[download]')).toBeNull();

        // The file's address is kept for ten seconds, then released.
        expect(revoke).not.toHaveBeenCalled();
        const release = timeout.mock.calls.find(([, delay]) => delay === 10_000)![0] as () => void;
        release();
        expect(revoke).toHaveBeenCalledWith('blob:export');
      });
    });
  });

  describe('the side bar’s menu', () => {
    it('keeps the bar out, and lets it hide again', async () => {
      render(<App />);
      const bar = screen.getByRole('navigation', { name: 'Dashboard' });
      expect(bar).not.toHaveAttribute('data-pinned');

      fireEvent.contextMenu(bar);
      await userEvent.click(screen.getByRole('menuitem', { name: 'Don’t auto-hide' }));
      expect(bar).toHaveAttribute('data-pinned');

      fireEvent.contextMenu(bar);
      expect(screen.getByRole('menuitem', { name: /Don’t auto-hide/ })).toHaveAttribute(
        'aria-checked',
        'true'
      );
      await userEvent.click(screen.getByRole('menuitem', { name: /Don’t auto-hide/ }));
      expect(bar).not.toHaveAttribute('data-pinned');
    });

    it('opens Extensions', async () => {
      render(<App />);

      fireEvent.contextMenu(screen.getByRole('navigation', { name: 'Dashboard' }));
      await userEvent.click(screen.getByRole('menuitem', { name: 'Extensions…' }));

      expect(screen.getByRole('dialog', { name: 'Extensions' })).toBeInTheDocument();
    });

    it('is named for the bar', () => {
      render(<App />);

      fireEvent.contextMenu(screen.getByRole('navigation', { name: 'Dashboard' }));

      expect(screen.getByRole('menu', { name: 'Side bar' })).toBeInTheDocument();
    });
  });
});
