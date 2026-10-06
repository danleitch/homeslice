import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../app';
import { DASHBOARD_STORAGE_KEY } from './lib/storage';
import { configToYaml } from './lib/yaml';
import { sanitizeConfig } from './lib/model';

type User = ReturnType<typeof userEvent.setup>;

/** A board with no widgets, so nothing reaches for the network unless a test wants it to. */
const seed = (config: unknown): void => {
  window.localStorage.setItem(DASHBOARD_STORAGE_KEY, configToYaml(sanitizeConfig(config)));
};

const simpleBoard = {
  name: 'Sam',
  groups: [
    {
      name: 'Code',
      bookmarks: [
        { name: 'GitHub', url: 'https://github.com', description: 'Pull requests' },
        { name: 'npm', url: 'https://www.npmjs.com' }
      ]
    },
    { name: 'Read', style: 'list', bookmarks: [{ name: 'Lobsters', url: 'https://lobste.rs' }] }
  ]
};

const storedYaml = (): string => window.localStorage.getItem(DASHBOARD_STORAGE_KEY) ?? '';

const group = (name: string): HTMLElement => screen.getByRole('region', { name });

const openSettingsTab = async (user: User, tab: string): Promise<HTMLElement> => {
  await user.click(screen.getByRole('button', { name: 'Dashboard settings' }));
  const dialog = screen.getByRole('dialog', { name: 'Settings' });
  await user.click(within(dialog).getByRole('tab', { name: tab }));
  return dialog;
};

describe('Dashboard', () => {
  it('greets the visitor and lays out their groups of bookmarks', () => {
    seed(simpleBoard);
    render(<App />);

    expect(screen.getByText(/Good (morning|afternoon|evening|night), Sam/)).toBeInTheDocument();

    const code = group('Code');
    const github = within(code).getByRole('link', { name: /GitHub/ });
    expect(github).toHaveAttribute('href', 'https://github.com');
    expect(github).toHaveAttribute('target', '_blank');
    expect(within(code).getByText('Pull requests')).toBeInTheDocument();
    expect(within(group('Read')).getByRole('link', { name: /Lobsters/ })).toBeInTheDocument();
  });

  it('starts a first visit with an example board, saved as YAML', async () => {
    render(<App />);

    expect(group('Code')).toBeInTheDocument();
    await waitFor(() => expect(storedYaml()).toContain('name: Code'));
    expect(storedYaml()).toContain('type: weather');
  });

  it('adds a bookmark from the toolbar, guessing its name, and writes it to the YAML', async () => {
    seed(simpleBoard);
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: 'Add bookmark' }));
    const dialog = screen.getByRole('dialog', { name: 'Add a bookmark' });
    await user.type(within(dialog).getByLabelText('Address'), 'gitlab.com/dashboard');
    expect(within(dialog).getByLabelText('Name')).toHaveValue('GitLab');

    await user.selectOptions(within(dialog).getByLabelText('Group'), 'Code');
    await user.click(within(dialog).getByRole('button', { name: 'Add bookmark' }));

    expect(within(group('Code')).getByRole('link', { name: /GitLab/ })).toHaveAttribute(
      'href',
      'https://gitlab.com/dashboard'
    );
    expect(screen.getByText('Added “GitLab” to Code')).toBeInTheDocument();
    await waitFor(() => expect(storedYaml()).toContain('url: https://gitlab.com/dashboard'));
  });

  it('adds a bookmark to a group it creates on the way', async () => {
    seed(simpleBoard);
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: 'Add bookmark' }));
    const dialog = screen.getByRole('dialog', { name: 'Add a bookmark' });
    await user.type(within(dialog).getByLabelText('Address'), 'https://plex.example');
    await user.selectOptions(within(dialog).getByLabelText('Group'), 'New group…');
    await user.type(within(dialog).getByLabelText('New group name'), 'Media');
    await user.click(within(dialog).getByRole('button', { name: 'Add bookmark' }));

    expect(within(group('Media')).getByRole('link', { name: /Plex/ })).toBeInTheDocument();
  });

  it('will not add something that is not an address', async () => {
    seed(simpleBoard);
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: 'Add bookmark' }));
    const dialog = screen.getByRole('dialog', { name: 'Add a bookmark' });
    await user.type(within(dialog).getByLabelText('Address'), 'not a link');
    await user.click(within(dialog).getByRole('button', { name: 'Add bookmark' }));

    expect(within(dialog).getByRole('alert')).toHaveTextContent('doesn’t look like a web address');
  });

  it('starts a bookmark from a link pasted onto the board', async () => {
    seed(simpleBoard);
    const user = userEvent.setup();
    render(<App />);

    await user.paste('https://developer.mozilla.org/en-US/');

    const dialog = screen.getByRole('dialog', { name: 'Add a bookmark' });
    expect(within(dialog).getByLabelText('Address')).toHaveValue(
      'https://developer.mozilla.org/en-US/'
    );
    expect(within(dialog).getByLabelText('Name')).toHaveValue('Mozilla');
  });

  it('deletes a bookmark from its menu, and can take it back', async () => {
    seed(simpleBoard);
    const user = userEvent.setup();
    render(<App />);

    fireEvent.contextMenu(within(group('Code')).getByRole('link', { name: /npm/ }));
    await user.click(screen.getByRole('menuitem', { name: 'Delete' }));

    expect(within(group('Code')).queryByRole('link', { name: /npm/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Undo' }));

    expect(within(group('Code')).getByRole('link', { name: /npm/ })).toBeInTheDocument();
  });

  it('moves a bookmark to another group from its menu', async () => {
    seed(simpleBoard);
    const user = userEvent.setup();
    render(<App />);

    fireEvent.contextMenu(within(group('Code')).getByRole('link', { name: /npm/ }));
    await user.click(screen.getByRole('menuitem', { name: 'Move to' }));
    await user.click(screen.getByRole('menuitem', { name: 'Read' }));

    expect(within(group('Read')).getByRole('link', { name: /npm/ })).toBeInTheDocument();
    expect(within(group('Code')).queryByRole('link', { name: /npm/ })).not.toBeInTheDocument();
  });

  it('edits a bookmark in edit mode', async () => {
    seed(simpleBoard);
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: 'Edit the board' }));
    expect(screen.getByRole('toolbar', { name: 'Edit the board' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Edit GitHub' }));
    const dialog = screen.getByRole('dialog', { name: 'Edit bookmark' });
    await user.clear(within(dialog).getByLabelText('Name'));
    await user.type(within(dialog).getByLabelText('Name'), 'My repos');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    expect(within(group('Code')).getByRole('link', { name: /My repos/ })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^Done$/ }));
    expect(screen.queryByRole('toolbar', { name: 'Edit the board' })).not.toBeInTheDocument();
  });

  it('collapses a group and remembers it', async () => {
    seed(simpleBoard);
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: 'Collapse Read' }));

    expect(within(group('Read')).queryByRole('link')).not.toBeInTheDocument();
    await waitFor(() => expect(storedYaml()).toContain('collapsed: true'));
  });

  it('creates a group from the edit dock and changes its layout from its menu', async () => {
    seed(simpleBoard);
    const user = userEvent.setup();
    render(<App />);

    await user.keyboard('e');
    await user.click(
      within(screen.getByRole('toolbar', { name: 'Edit the board' })).getByRole('button', {
        name: 'Group'
      })
    );
    const dialog = screen.getByRole('dialog', { name: 'New group' });
    await user.type(within(dialog).getByLabelText('Name'), 'GitHub');
    await user.click(within(dialog).getByRole('radio', { name: /Tiles/ }));
    await user.click(within(dialog).getByRole('button', { name: 'Create group' }));

    expect(within(group('GitHub')).getByText('Drop bookmarks here')).toBeInTheDocument();
    await waitFor(() => expect(storedYaml()).toMatch(/name: GitHub\n\s+width: 4\n\s+style: tiles/));
  });

  it('finds bookmarks from the search box and opens the one chosen', async () => {
    seed(simpleBoard);
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const user = userEvent.setup();
    render(<App />);

    await user.keyboard('/');
    expect(screen.getByRole('combobox', { name: 'Search' })).toHaveFocus();
    await user.keyboard('lob');

    const results = screen.getByRole('listbox');
    expect(within(results).getByRole('option', { name: /Lobsters/ })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(
      within(results).getByRole('option', { name: /Search Google for lob/ })
    ).toBeInTheDocument();

    await user.keyboard('{Enter}');
    expect(open).toHaveBeenCalledWith('https://lobste.rs', '_blank', 'noopener,noreferrer');
  });

  it('searches the web for anything that is not a bookmark', async () => {
    seed({ ...simpleBoard, search: 'duckduckgo' });
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('combobox', { name: 'Search' }));
    await user.keyboard('css grid{Enter}');

    expect(open).toHaveBeenCalledWith(
      'https://duckduckgo.com/?q=css%20grid',
      '_blank',
      'noopener,noreferrer'
    );
  });

  it('applies YAML edited in Settings, and says where it is wrong', async () => {
    seed(simpleBoard);
    const user = userEvent.setup();
    render(<App />);

    const dialog = await openSettingsTab(user, 'Data & YAML');
    const editor = within(dialog).getByLabelText('Dashboard YAML');

    fireEvent.change(editor, { target: { value: 'title: Home\ngroups:\n  - name: [oops\n' } });
    await user.click(within(dialog).getByRole('button', { name: /Apply/ }));
    expect(within(dialog).getByRole('alert')).toHaveTextContent(/^Line \d+:/);

    fireEvent.change(editor, {
      target: {
        value:
          'title: Work\ngroups:\n  - name: Tools\n    bookmarks:\n      - name: Linear\n        url: https://linear.app\n'
      }
    });
    await user.click(within(dialog).getByRole('button', { name: /Apply/ }));

    expect(document.title).toBe('Work');
    expect(within(group('Tools')).getByRole('link', { name: /Linear/ })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Code' })).not.toBeInTheDocument();
  });

  it('imports a homepage bookmarks file into the board', async () => {
    seed(simpleBoard);
    const user = userEvent.setup();
    render(<App />);

    const dialog = await openSettingsTab(user, 'Data & YAML');
    const input = dialog.querySelector<HTMLInputElement>('input[type="file"]')!;
    const file = new File(
      [
        '- Media:\n    - Jellyfin:\n        - href: http://jellyfin.home\n          icon: sh-jellyfin\n'
      ],
      'bookmarks.yaml',
      { type: 'text/yaml' }
    );
    await user.upload(input, file);

    const confirm = await screen.findByRole('dialog', { name: 'Import' });
    expect(within(confirm).getByText(/homepage bookmarks file/)).toBeInTheDocument();
    await user.click(within(confirm).getByRole('button', { name: 'Add to my board' }));

    expect(within(group('Media')).getByRole('link', { name: /Jellyfin/ })).toBeInTheDocument();
    expect(group('Code')).toBeInTheDocument();
  });

  it('restores a full export, Branchify settings and all', async () => {
    seed(simpleBoard);
    const user = userEvent.setup();
    render(<App />);

    const exported = `title: Restored
groups:
  - name: Back
    bookmarks:
      - name: Home
        url: https://example.com
saved:
  background: plain
  branchify-settings:
    typeSeparator: _
`;
    const dialog = await openSettingsTab(user, 'Data & YAML');
    await user.upload(
      dialog.querySelector<HTMLInputElement>('input[type="file"]')!,
      new File([exported], 'dashboard.yaml', { type: 'text/yaml' })
    );
    await user.click(
      within(await screen.findByRole('dialog', { name: 'Import' })).getByRole('button', {
        name: 'Restore everything'
      })
    );

    expect(await screen.findByRole('region', { name: 'Back' })).toBeInTheDocument();
    expect(document.querySelector('canvas.koi-pond')).not.toBeInTheDocument();
    expect(JSON.parse(window.localStorage.getItem('branchify-settings')!)).toMatchObject({
      typeSeparator: '_'
    });
    expect(screen.getByText('Restored 1 bookmarks and your settings')).toBeInTheDocument();
  });

  it('exports the board and everything else as a YAML download', async () => {
    seed(simpleBoard);
    window.localStorage.setItem('branchify-background', 'particles');
    const createObjectURL = vi.fn<(blob: Blob) => string>(() => 'blob:dashboard');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL, revokeObjectURL }));
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const user = userEvent.setup();
    render(<App />);

    const dialog = await openSettingsTab(user, 'Data & YAML');
    await user.click(within(dialog).getByRole('button', { name: /Export YAML/ }));

    expect(click).toHaveBeenCalled();
    const yaml = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.readAsText(createObjectURL.mock.calls[0][0]);
    });
    expect(yaml).toContain('name: GitHub');
    expect(yaml).toContain('background: particles');
    expect(screen.getByText(/^Exported dashboard-\d{4}-\d{2}-\d{2}\.yaml$/)).toBeInTheDocument();
  });

  it('offers a way in when the board is empty', async () => {
    seed({ groups: [] });
    const user = userEvent.setup();
    render(<App />);

    expect(screen.getByRole('heading', { name: 'Your board is empty' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Use the example/ }));

    expect(group('Code')).toBeInTheDocument();
  });

  it('keeps a separate board on each page, chosen from the dots', async () => {
    seed({
      pages: [
        simpleBoard,
        { groups: [{ name: 'Media', bookmarks: [{ name: 'Plex', url: 'https://plex.tv' }] }] }
      ]
    });
    const user = userEvent.setup();
    render(<App />);

    const pages = screen.getByRole('navigation', { name: 'Pages' });
    expect(within(pages).getByRole('button', { name: 'Page 1' })).toHaveAttribute(
      'aria-current',
      'page'
    );
    expect(group('Code')).toBeInTheDocument();

    await user.click(within(pages).getByRole('button', { name: 'Page 2' }));

    expect(group('Media')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Code' })).not.toBeInTheDocument();
    expect(within(pages).getByRole('button', { name: 'Page 2' })).toHaveAttribute(
      'aria-current',
      'page'
    );
    expect(window.localStorage.getItem('dashboard-page')).toBe('1');

    // Search still finds what lives on the other pages.
    await user.type(screen.getByRole('combobox', { name: 'Search' }), 'github');
    expect(await screen.findByRole('option', { name: /GitHub/ })).toBeInTheDocument();

    await user.clear(screen.getByRole('combobox', { name: 'Search' }));
    await user.click(within(pages).getByRole('button', { name: 'Page 3' }));
    expect(await screen.findByRole('heading', { name: 'Your board is empty' })).toBeInTheDocument();
  });
});

describe('Dashboard widgets', () => {
  const json = (body: unknown): Response =>
    new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });

  it('shows the weather for a place from Open-Meteo', async () => {
    seed({ widgets: [{ type: 'weather', location: 'Oslo' }], groups: [] });
    const day = Math.floor(Date.now() / 1000 / 86400) * 86400;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url.includes('geocoding')
          ? json({
              results: [
                {
                  name: 'Oslo',
                  country: 'Norway',
                  latitude: 59.9,
                  longitude: 10.7,
                  timezone: 'UTC'
                }
              ]
            })
          : json({
              current: {
                temperature_2m: 7.4,
                apparent_temperature: 4.9,
                weather_code: 3,
                is_day: 1,
                wind_speed_10m: 11,
                relative_humidity_2m: 70
              },
              hourly: {
                temperature_2m: Array.from({ length: 24 }, (_unused, hour) => hour / 2),
                precipitation_probability: Array.from({ length: 24 }, () => 0)
              },
              daily: {
                time: Array.from({ length: 6 }, (_unused, index) => day + index * 86400),
                sunrise: Array.from({ length: 6 }, () => day + 6 * 3600),
                sunset: Array.from({ length: 6 }, () => day + 19 * 3600),
                temperature_2m_max: [9, 10, 11, 12, 13, 14],
                temperature_2m_min: [2, 3, 4, 5, 6, 7],
                weather_code: [3, 3, 3, 3, 3, 3]
              }
            })
      )
    );
    render(<App />);

    const widget = screen.getByRole('region', { name: 'Weather' });
    expect(await within(widget).findByText('Overcast')).toBeInTheDocument();
    expect(within(widget).getByText('Oslo, Norway')).toBeInTheDocument();
    expect(within(widget).getByText(/Feels 5°/)).toBeInTheDocument();
  });

  it('shows prices with their trend through the markets proxy', async () => {
    seed({
      widgets: [{ type: 'markets', symbols: [{ symbol: 'AAPL', name: 'Apple' }] }],
      groups: []
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        json({
          chart: {
            result: [
              {
                meta: { symbol: 'AAPL', currency: 'USD', regularMarketPrice: 210.5, priceHint: 2 },
                indicators: { quote: [{ close: [200, 205, 210.5] }] }
              }
            ]
          }
        })
      )
    );
    render(<App />);

    const widget = screen.getByRole('region', { name: 'Markets' });
    expect(await within(widget).findByText('$210.50')).toBeInTheDocument();
    expect(within(widget).getByText('+2.68%')).toBeInTheDocument();
  });

  it('explains when the host has no markets proxy', async () => {
    seed({ widgets: [{ type: 'markets', symbols: ['AAPL'] }], groups: [] });
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () => new Response('<!doctype html>', { headers: { 'content-type': 'text/html' } })
      )
    );
    render(<App />);

    const widget = screen.getByRole('region', { name: 'Markets' });
    expect(await within(widget).findByRole('alert')).toHaveTextContent(
      /need the dashboard’s proxy/
    );
  });

  it('lets a widget be pointed somewhere else', async () => {
    seed({ widgets: [{ type: 'calendar' }], groups: [] });
    const user = userEvent.setup();
    render(<App />);

    expect(screen.getByRole('region', { name: 'Calendar' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Configure Calendar' }));
    const dialog = screen.getByRole('dialog', { name: 'Calendar' });
    await user.click(within(dialog).getByRole('radio', { name: 'Sunday' }));
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(storedYaml()).toContain('weekStart: 0'));
  });
});

describe('The side bar and extensions', () => {
  const bar = (): HTMLElement => screen.getByRole('navigation', { name: 'Dashboard' });

  it('tucks the bar away until it is wanted, and keeps it out once pinned', async () => {
    seed(simpleBoard);
    const user = userEvent.setup();
    render(<App />);

    expect(bar()).toHaveAttribute('data-state', 'hidden');

    // Focus brings it out for the keyboard.
    fireEvent.focus(screen.getByRole('button', { name: 'Add bookmark' }));
    expect(bar()).toHaveAttribute('data-state', 'shown');

    const dialog = await openSettingsTab(user, 'General');
    await user.click(within(dialog).getByRole('switch', { name: /Don’t auto-hide the side bar/ }));
    await user.click(within(dialog).getByRole('button', { name: 'Close settings' }));

    expect(bar()).toHaveAttribute('data-state', 'shown');
    expect(bar()).toHaveAttribute('data-pinned');
    await waitFor(() => expect(storedYaml()).toContain('pinBar: true'));
  });

  it('turns Branchify off and on from Extensions', async () => {
    seed(simpleBoard);
    const user = userEvent.setup();
    render(<App />);

    expect(within(bar()).getByRole('button', { name: 'Branchify' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Extensions' }));
    const panel = screen.getByRole('dialog', { name: 'Extensions' });
    await user.click(within(panel).getByRole('switch', { name: 'Branchify enabled' }));
    await user.click(within(panel).getByRole('button', { name: 'Close extensions' }));

    expect(within(bar()).queryByRole('button', { name: 'Branchify' })).not.toBeInTheDocument();
    await user.keyboard('b');
    expect(screen.queryByRole('dialog', { name: /Branchify/ })).not.toBeInTheDocument();
    await waitFor(() => expect(storedYaml()).toContain('- branchify'));
  });

  it('installs Doddle, opens it over the board in a frame, and uninstalls it', async () => {
    seed(simpleBoard);
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: 'Extensions' }));
    let panel = screen.getByRole('dialog', { name: 'Extensions' });
    await user.click(within(panel).getByRole('button', { name: 'Install' }));
    await waitFor(() => expect(storedYaml()).toContain('url: https://doddle.theleechies.co.za/'));
    await user.click(within(panel).getByRole('button', { name: 'Open' }));

    const app = screen.getByRole('dialog', { name: 'Doddle' });
    expect(within(app).getByTitle('Doddle')).toHaveAttribute(
      'src',
      'https://doddle.theleechies.co.za/'
    );
    expect(window.location.hash).toBe('#app/doddle');

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Doddle' })).not.toBeInTheDocument();
    expect(window.location.hash).toBe('');

    // It has its own place in the bar now.
    await user.click(within(bar()).getByRole('button', { name: 'Doddle' }));
    expect(screen.getByRole('dialog', { name: 'Doddle' })).toBeInTheDocument();
    // Doddle opens bare, with no close button: a click outside it puts it away.
    expect(screen.queryByRole('button', { name: 'Close Doddle' })).not.toBeInTheDocument();
    await user.click(document.querySelector('.app-backdrop')!);
    expect(screen.queryByRole('dialog', { name: 'Doddle' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Extensions' }));
    panel = screen.getByRole('dialog', { name: 'Extensions' });
    await user.click(within(panel).getByRole('button', { name: 'Uninstall Doddle' }));
    await waitFor(() => expect(storedYaml()).not.toContain('doddle'));
  });

  it('leaves a turned-off widget out of the Add widget list', async () => {
    seed({ ...simpleBoard, extensions: { disabled: ['widget:markets'] } });
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: 'Edit the board' }));
    await user.click(screen.getByRole('button', { name: /Widget/ }));
    const picker = screen.getByRole('dialog', { name: 'Add a widget' });
    expect(within(picker).queryByText('Markets')).not.toBeInTheDocument();
    expect(within(picker).getByText('GitHub Trending')).toBeInTheDocument();
  });

  it('shows what is trending on GitHub', async () => {
    seed({ widgets: [{ type: 'github', language: 'Rust', since: 'weekly' }], groups: [] });
    const fetchMock = vi.fn<(url: string) => Promise<Response>>(
      async () =>
        new Response(
          JSON.stringify({
            pubDate: new Date().toUTCString(),
            items: [
              {
                title: 'tokio-rs / tokio',
                url: 'https://github.com/tokio-rs/tokio',
                description: 'An asynchronous runtime',
                language: 'Rust',
                languageColor: '#dea584',
                stars: '28,100',
                forks: '2,600',
                addStars: '410'
              }
            ]
          })
        )
    );
    vi.stubGlobal('fetch', fetchMock);
    render(<App />);

    const card = screen.getByRole('region', { name: 'GitHub Trending' });
    expect(await within(card).findByRole('link', { name: /tokio/ })).toHaveAttribute(
      'href',
      'https://github.com/tokio-rs/tokio'
    );
    expect(within(card).getByText('+410 this week')).toBeInTheDocument();
    expect(String(fetchMock.mock.calls[0]?.[0])).toMatch(/\/data\/weekly\/rust\.json$/);
  });

  it('ranks the strongest AI models, from one lab when asked', async () => {
    seed({ widgets: [{ type: 'benchlm', surface: 'coding', creator: 'anthropic', count: 3 }] });
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              dataAsOf: '2026-10-02',
              items: [
                { rank: 1, name: 'GPT-6 Astra', creator: 'OpenAI', score: 88.75 },
                { rank: 2, name: 'Claude Opus 5.5', creator: 'Anthropic', score: 87.78 },
                { rank: 3, name: 'Claude Sonnet 5.5', creator: 'Anthropic', score: 83.42 },
                { rank: 4, name: 'Claude Fable 5.1', creator: 'Anthropic', score: 82.85 },
                { rank: 5, name: 'Claude Haiku 5', creator: 'Anthropic', score: 70.1 }
              ]
            }),
            { headers: { 'content-type': 'application/json' } }
          )
      )
    );
    render(<App />);

    const card = screen.getByRole('region', { name: 'AI Leaderboard' });
    expect(await within(card).findByText('Claude Opus 5.5')).toBeInTheDocument();
    expect(within(card).getByText('Claude Sonnet 5.5')).toBeInTheDocument();
    expect(within(card).queryByText('GPT-6 Astra')).not.toBeInTheDocument();
    expect(within(card).getByText('Claude Fable 5.1')).toBeInTheDocument();
    expect(within(card).queryByText('Claude Haiku 5')).not.toBeInTheDocument();
    expect(within(card).getByRole('link', { name: 'BenchLM.ai' })).toBeInTheDocument();
  });

  it('ranks the best coding models under a dollar, from BenchLM’s rankings and prices', async () => {
    seed({
      widgets: [{ type: 'benchlm', surface: 'coding', maxPrice: 1, count: 15, creator: '' }]
    });
    const json = (body: unknown): Response =>
      new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
    const fetchMock = vi.fn(async (url: string) =>
      url.startsWith('/api/benchlm/pricing')
        ? json({
            models: [
              { model: 'Claude Opus 5.5', inputPrice: 4, outputPrice: 20 },
              { model: 'Gemini Flash 3', inputPrice: 0.3, outputPrice: 2.5 },
              { model: 'Qwen Coder', inputPrice: 0.2, outputPrice: 0.8 }
            ]
          })
        : json({
            dataAsOf: '2026-10-02',
            items: [
              { rank: 1, name: 'Claude Opus 5.5', creator: 'Anthropic', score: 87.78 },
              { rank: 2, name: 'Gemini-Flash-3', creator: 'Google', score: 80.1 },
              { rank: 3, name: 'Qwen Coder', creator: 'Alibaba', score: 75.5 }
            ]
          })
    );
    vi.stubGlobal('fetch', fetchMock);
    render(<App />);

    const card = screen.getByRole('region', { name: 'AI Leaderboard' });
    expect(await within(card).findByText('Gemini-Flash-3')).toBeInTheDocument();
    expect(within(card).getByText('Google · $0.30 / $2.50')).toBeInTheDocument();
    expect(within(card).getByText('Qwen Coder')).toBeInTheDocument();
    expect(within(card).queryByText('Claude Opus 5.5')).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.map(([url]) => url)).toContain(
      '/api/benchlm/rankings?surface=coding&limit=200'
    );
    expect(fetchMock.mock.calls.map(([url]) => url)).toContain('/api/benchlm/pricing?offset=0');
  });

  it('says which preset an AI Leaderboard is on in its title, and nothing for custom settings', async () => {
    seed({
      widgets: [
        { type: 'benchlm', surface: 'overall', maxPrice: 0 },
        { type: 'benchlm', surface: 'coding', maxPrice: 2, count: 5 },
        { type: 'benchlm', surface: 'agentic', maxPrice: 0 }
      ]
    });
    render(<App />);

    const cards = screen.getAllByRole('region', { name: 'AI Leaderboard' });
    const titles = cards.map((card) => within(card).getByRole('heading', { level: 2 }));

    expect(titles.map((title) => title.textContent)).toEqual([
      'AI Leaderboard · Frontier',
      'AI Leaderboard · Budget',
      'AI Leaderboard'
    ]);
  });

  it('lists the TV everyone is watching, linked to TMDB', async () => {
    seed({ widgets: [{ type: 'tv', window: 'day', count: 3 }] });
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              results: [
                {
                  id: 1,
                  name: 'East of Eden',
                  first_air_date: '2026-10-01',
                  vote_average: 7.9,
                  vote_count: 12
                }
              ]
            }),
            { headers: { 'content-type': 'application/json' } }
          )
      )
    );
    render(<App />);

    const card = screen.getByRole('region', { name: 'Popular TV' });
    expect(await within(card).findByRole('link', { name: /East of Eden/ })).toHaveAttribute(
      'href',
      'https://www.themoviedb.org/tv/1'
    );
    expect(within(card).getByText('7.9')).toBeInTheDocument();
  });

  it('lists the films everyone is watching, linked to TMDB as films', async () => {
    seed({ widgets: [{ type: 'movies', window: 'day', count: 3 }] });
    const fetchMock = vi.fn<(url: string) => Promise<Response>>(
      async () =>
        new Response(
          JSON.stringify({
            results: [
              {
                id: 7,
                title: 'The Long Drive',
                release_date: '2026-09-12',
                vote_average: 6.5,
                vote_count: 80
              }
            ]
          }),
          { headers: { 'content-type': 'application/json' } }
        )
    );
    vi.stubGlobal('fetch', fetchMock);
    render(<App />);

    const card = screen.getByRole('region', { name: 'Popular Movies' });
    expect(await within(card).findByRole('link', { name: /The Long Drive/ })).toHaveAttribute(
      'href',
      'https://www.themoviedb.org/movie/7'
    );
    expect(within(card).getByText('6.5')).toBeInTheDocument();
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/tmdb/trending-movie?window=day');
  });

  it('says when this server has no key for a widget', async () => {
    seed({ widgets: [{ type: 'tv' }] });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 401 }))
    );
    render(<App />);

    const card = screen.getByRole('region', { name: 'Popular TV' });
    expect(await within(card).findByRole('alert')).toHaveTextContent(/TMDB_TOKEN/);
  });
});
