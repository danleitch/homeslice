import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Gamepad2, Puzzle } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';
import { emptyExtensions, type ExtensionsConfig } from '../dashboard/lib/extensions-config';
import { WIDGET_TYPES } from '../dashboard/lib/model';
import { ExtensionsPanel } from './extensions-panel';
import { BRANCHIFY_ID, widgetExtensionId } from './registry';

// One suggested app that comes with an address, as Doddle does, and one that does not,
// since each person hosts their own and has to say where.
vi.mock('./registry', async (importOriginal) => {
  const registry = await importOriginal<typeof import('./registry')>();

  return {
    ...registry,
    SUGGESTED_APPS: [
      {
        name: 'Doddle',
        description: 'A word game.',
        icon: Gamepad2,
        url: 'https://doddle.example/',
        urlHint: 'Where Doddle runs'
      },
      {
        name: 'Self-hosted',
        description: 'Runs wherever you put it.',
        icon: Puzzle,
        url: '',
        urlHint: 'Where it runs'
      }
    ]
  };
});

const open = (
  extensions: ExtensionsConfig = emptyExtensions()
): {
  onChange: ReturnType<typeof vi.fn>;
  onOpenApp: ReturnType<typeof vi.fn>;
  onClose: ReturnType<typeof vi.fn>;
} => {
  const handlers = { onChange: vi.fn(), onOpenApp: vi.fn(), onClose: vi.fn() };
  render(<ExtensionsPanel extensions={extensions} {...handlers} />);
  return handlers;
};

const row = (name: string): HTMLElement => screen.getByText(name).closest('li')!;
const withApps = (...apps: { id: string; name: string; url: string }[]): ExtensionsConfig => ({
  disabled: [],
  apps
});

describe('ExtensionsPanel', () => {
  describe('the panel', () => {
    it('opens beside the side bar, named Extensions', () => {
      open();

      expect(screen.getByRole('dialog', { name: 'Extensions' })).toBeInTheDocument();
      expect(screen.getByRole('searchbox', { name: 'Search extensions' })).toHaveFocus();
    });

    it('closes from its button', async () => {
      const { onClose } = open();

      await userEvent.click(screen.getByRole('button', { name: 'Close extensions' }));

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('lists the tools, the apps and the widgets', () => {
      open();

      expect(screen.getByRole('heading', { name: 'Tools' })).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Apps' })).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Widgets' })).toBeInTheDocument();
      expect(row('Branchify')).toHaveTextContent('Built in · Tool');
    });

    it('has a switch for each widget, all on to begin with', () => {
      open();

      for (const switchRow of screen.getAllByRole('switch')) {
        expect(switchRow).toBeChecked();
      }

      expect(screen.getAllByRole('switch')).toHaveLength(1 + WIDGET_TYPES.length);
    });
  });

  describe('turning things on and off', () => {
    it('turns a tool off, and reports the new setting', async () => {
      const { onChange } = open();

      await userEvent.click(screen.getByRole('switch', { name: 'Branchify enabled' }));

      expect(onChange).toHaveBeenCalledExactlyOnceWith({ disabled: [BRANCHIFY_ID], apps: [] });
    });

    it('turns a widget off', async () => {
      const { onChange } = open();

      await userEvent.click(screen.getByRole('switch', { name: 'Weather enabled' }));

      expect(onChange).toHaveBeenCalledWith({ disabled: [widgetExtensionId('weather')], apps: [] });
    });

    it('turns something back on', async () => {
      const { onChange } = open({ disabled: [BRANCHIFY_ID], apps: [] });
      const toggle = screen.getByRole('switch', { name: 'Branchify enabled' });
      expect(toggle).not.toBeChecked();

      await userEvent.click(toggle);

      expect(onChange).toHaveBeenCalledWith({ disabled: [], apps: [] });
    });

    it('greys out what is off', () => {
      open({ disabled: [BRANCHIFY_ID], apps: [] });

      expect(row('Branchify')).toHaveAttribute('data-disabled');
      expect(row('Weather')).not.toHaveAttribute('data-disabled');
    });
  });

  describe('searching', () => {
    it('narrows the list by name, description or publisher', async () => {
      open();

      await userEvent.type(screen.getByRole('searchbox'), 'weather');

      expect(screen.getByText('Weather')).toBeInTheDocument();
      expect(screen.queryByText('Branchify')).not.toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: 'Tools' })).not.toBeInTheDocument();
    });

    it('ignores case and surrounding space', async () => {
      open();

      await userEvent.type(screen.getByRole('searchbox'), '  BRANCHIFY ');

      expect(screen.getByText('Branchify')).toBeInTheDocument();
    });

    it('says when nothing matches, quoting what was asked', async () => {
      open();

      await userEvent.type(screen.getByRole('searchbox'), '  zzzz ');

      expect(screen.getByText('No extensions match “zzzz”.')).toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: 'Apps' })).not.toBeInTheDocument();
    });

    it('finds a suggested app by what it does', async () => {
      open();

      await userEvent.type(screen.getByRole('searchbox'), 'word game');

      expect(screen.getByText('Doddle')).toBeInTheDocument();
    });

    it('offers to add an app by address only when not searching', async () => {
      open();
      expect(screen.getByText('Add an app by address')).toBeInTheDocument();

      await userEvent.type(screen.getByRole('searchbox'), 'doddle');

      expect(screen.queryByText('Add an app by address')).not.toBeInTheDocument();
    });
  });

  describe('suggested apps', () => {
    it('installs one that comes with an address in a single click', async () => {
      const { onChange } = open();

      await userEvent.click(within(row('Doddle')).getByRole('button', { name: 'Install' }));

      expect(onChange).toHaveBeenCalledWith(
        { disabled: [], apps: [{ id: 'doddle', name: 'Doddle', url: 'https://doddle.example/' }] },
        'Installed Doddle'
      );
    });

    it('stops suggesting an app once it is installed, whatever case its name is in', () => {
      open(withApps({ id: 'doddle', name: 'DODDLE', url: 'https://mine.example/' }));

      // Only the installed one is listed: no second Doddle with an Install button.
      expect(screen.getAllByText(/^doddle$/i)).toHaveLength(1);
      expect(
        within(row('DODDLE')).queryByRole('button', { name: 'Install' })
      ).not.toBeInTheDocument();
    });

    it('asks where an app is when each person hosts their own', async () => {
      const { onChange } = open();

      await userEvent.click(within(row('Self-hosted')).getByRole('button', { name: 'Install' }));

      const address = screen.getByLabelText('Address of Self-hosted');
      expect(address).toHaveFocus();
      expect(address).toHaveAttribute('placeholder', 'Where it runs');
      expect(onChange).not.toHaveBeenCalled();
      // The Install button gives way to the form.
      expect(
        within(row('Self-hosted')).queryByRole('button', { name: 'Install' })
      ).not.toBeInTheDocument();
    });

    it('installs it at the address given', async () => {
      const { onChange } = open();
      await userEvent.click(within(row('Self-hosted')).getByRole('button', { name: 'Install' }));

      await userEvent.type(
        screen.getByLabelText('Address of Self-hosted'),
        'https://mine.example/app'
      );
      await userEvent.click(within(row('Self-hosted')).getByRole('button', { name: 'Add' }));

      expect(onChange).toHaveBeenCalledWith(
        {
          disabled: [],
          apps: [{ id: 'self-hosted', name: 'Self-hosted', url: 'https://mine.example/app' }]
        },
        'Installed Self-hosted'
      );
    });

    it('refuses an address that is not a web address, until it is changed', async () => {
      const { onChange } = open();
      await userEvent.click(within(row('Self-hosted')).getByRole('button', { name: 'Install' }));
      const address = screen.getByLabelText('Address of Self-hosted');

      await userEvent.type(address, 'not a web address');
      fireEvent.submit(address.closest('form')!);

      expect(screen.getByRole('alert')).toHaveTextContent(
        'That needs to be a full address, starting http:// or https://'
      );
      expect(onChange).not.toHaveBeenCalled();

      await userEvent.type(address, '!');
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });

  describe('installed apps', () => {
    const installed = withApps({ id: 'doddle', name: 'Doddle', url: 'https://mine.example/' });

    it('opens one over the board', async () => {
      const { onOpenApp } = open(installed);

      await userEvent.click(within(row('Doddle')).getByRole('button', { name: 'Open' }));

      expect(onOpenApp).toHaveBeenCalledExactlyOnceWith('doddle');
    });

    it('links to it in a new tab, safely', () => {
      open(installed);

      const link = screen.getByRole('link', { name: 'Open Doddle in a new tab' });
      expect(link).toHaveAttribute('href', 'https://mine.example/');
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noreferrer noopener');
    });

    it('names its publisher by its address', () => {
      open(installed);

      expect(row('Doddle')).toHaveTextContent('mine.example · App');
    });

    it('uninstalls it, saying so', async () => {
      const { onChange } = open(installed);

      await userEvent.click(screen.getByRole('button', { name: 'Uninstall Doddle' }));

      expect(onChange).toHaveBeenCalledWith({ disabled: [], apps: [] }, 'Uninstalled Doddle');
    });
  });

  describe('adding an app by address', () => {
    const fill = async (name: string, url: string): Promise<void> => {
      if (name) {
        await userEvent.type(screen.getByLabelText('App name'), name);
      }

      if (url) {
        await userEvent.type(screen.getByLabelText('App address'), url);
      }
    };
    const submit = (): Promise<void> =>
      userEvent.click(
        within(screen.getByText('Add an app by address').closest('form')!).getByRole('button', {
          name: /Add/
        })
      );

    it('installs it, and clears the form for the next', async () => {
      const { onChange } = open();

      await fill('My tool', 'https://tool.example/');
      await submit();

      expect(onChange).toHaveBeenCalledWith(
        { disabled: [], apps: [{ id: 'my-tool', name: 'My tool', url: 'https://tool.example/' }] },
        'Installed My tool'
      );
      expect(screen.getByLabelText('App name')).toHaveValue('');
      expect(screen.getByLabelText('App address')).toHaveValue('');
    });

    it('names an app by its address when it is given no name', async () => {
      const { onChange } = open();

      await fill('', 'https://tool.example/');
      await submit();

      expect(onChange).toHaveBeenCalledWith(
        { disabled: [], apps: [{ id: 'app', name: 'tool.example', url: 'https://tool.example/' }] },
        'Installed tool.example'
      );
    });

    it('limits how long a name can be', () => {
      open();

      expect(screen.getByLabelText('App name')).toHaveAttribute('maxlength', '60');
    });

    it('refuses an address that is not a web address, keeping what was typed', async () => {
      const { onChange } = open();

      await fill('Tool', 'ftp://tool.example');
      await submit();

      expect(screen.getByRole('alert')).toHaveTextContent('That needs to be a full address');
      expect(onChange).not.toHaveBeenCalled();
      expect(screen.getByLabelText('App name')).toHaveValue('Tool');
    });

    it('takes the complaint back once the address is edited', async () => {
      open();
      await fill('Tool', 'ftp://tool.example');
      await submit();
      expect(screen.getByRole('alert')).toBeInTheDocument();

      await userEvent.type(screen.getByLabelText('App address'), 'x');

      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(screen.getByText(/the site has to allow being framed/)).toBeInTheDocument();
    });

    it('gives a second app of the same name a number of its own', async () => {
      const { onChange } = open(
        withApps({ id: 'my-tool', name: 'My tool', url: 'https://one.example/' })
      );

      await fill('My tool', 'https://two.example/');
      await submit();

      expect(onChange.mock.calls[0]![0].apps.map((app: { id: string }) => app.id)).toEqual([
        'my-tool',
        'my-tool-2'
      ]);
    });
  });
});
