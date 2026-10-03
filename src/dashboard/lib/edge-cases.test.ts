import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveIcon } from './icons';
import { pageOf, sanitizeConfig } from './model';
import { displayUrl, guessName, openUrl } from './urls';
import { planImport, readYaml } from './yaml';

describe('reading YAML', () => {
  it('turns away YAML nested far deeper than any board could be, saying where', () => {
    const result = readYaml('['.repeat(30_000));

    expect(result).toEqual({
      ok: false,
      problem: { message: 'nesting exceeded maxDepth (100)', line: 1 }
    });
  });

  it('turns any other failure of the parser into a plain message too, as js-yaml 5 asks', () => {
    const hostile = {
      toString() {
        throw new RangeError('not a YAML error');
      }
    };

    expect(readYaml(hostile as never)).toEqual({
      ok: false,
      problem: { message: 'This is not valid YAML.', line: null }
    });
  });

  it('says where a malformed document goes wrong, in a document being imported', () => {
    const plan = planImport('title: [unclosed');

    expect(plan).toEqual({
      ok: false,
      problem: { message: 'unexpected end of the stream within a flow collection', line: 1 }
    });
  });
});

describe('importing something that is nearly a homepage file', () => {
  const notRecognised = {
    ok: false,
    problem: {
      message:
        'That file isn’t a dashboard export, a homepage bookmarks.yaml, or a browser bookmarks file.',
      line: null
    }
  };

  it('does not take a group whose items are not a list for a bookmarks file', () => {
    expect(planImport('- Group: not-an-array\n')).toEqual(notRecognised);
  });

  it('does not take a list entry with more than one group in it for one either', () => {
    expect(planImport('- A: []\n  B: []\n')).toEqual(notRecognised);
  });

  it('skips the items it cannot read, and keeps the ones it can', () => {
    const plan = planImport(
      '- Media:\n    - 7\n    - Plex: 5\n    - Odd: [1, 2]\n    - Jelly:\n        - href: http://j.lan\n'
    );

    expect(plan.ok && plan.value.groups).toHaveLength(1);
    expect(plan.ok && plan.value.groups[0]!.bookmarks.map((bookmark) => bookmark.name)).toEqual([
      'Jelly'
    ]);
  });
});

describe('sanitising a board', () => {
  const firstPage = (config: unknown): ReturnType<typeof pageOf> =>
    pageOf(sanitizeConfig(config), 0);

  it('reads a number or a yes/no as the text it looks like', () => {
    const config = sanitizeConfig({ name: 42, title: true });

    expect(config.name).toBe('42');
    expect(config.title).toBe('true');
  });

  it('drops groups that are not groups', () => {
    const page = firstPage({ groups: [null, 'text', 7, { name: 'Real', bookmarks: [] }] });

    expect(page.groups.map((group) => group.name)).toEqual(['Real']);
  });

  it('drops widgets that are not widgets', () => {
    const page = firstPage({ widgets: [null, 7, 'weather', { type: 'calendar' }] });

    expect(page.widgets.map((widget) => widget.type)).toEqual(['calendar']);
  });

  it('keeps a market symbol written as text, and drops what is neither text nor a record', () => {
    const page = firstPage({
      widgets: [
        {
          type: 'markets',
          symbols: [7, null, 'aapl', { symbol: 'msft', name: 'Microsoft' }, { name: 'No symbol' }]
        }
      ]
    });

    expect(page.widgets[0]).toMatchObject({
      symbols: [
        { symbol: 'AAPL', name: '' },
        { symbol: 'MSFT', name: 'Microsoft' }
      ]
    });
  });

  it('keeps a clock zone written as text, and drops what is neither', () => {
    const page = firstPage({
      widgets: [
        {
          type: 'clock',
          zones: [7, null, ' UTC ', { timezone: 'Asia/Tokyo', name: 'Tokyo' }, { label: 'No zone' }]
        }
      ]
    });

    expect(page.widgets[0]).toMatchObject({
      zones: [
        { zone: 'UTC', label: '' },
        { zone: 'Asia/Tokyo', label: 'Tokyo' }
      ]
    });
  });

  it('turns a page that is not a page into an empty one', () => {
    const config = sanitizeConfig({
      pages: [7, null, { groups: [{ name: 'Kept', bookmarks: [] }] }]
    });

    expect(pageOf(config, 0)).toMatchObject({ groups: [], widgets: [] });
    expect(pageOf(config, 1)).toMatchObject({ groups: [], widgets: [] });
    expect(pageOf(config, 2).groups.map((group) => group.name)).toEqual(['Kept']);
  });
});

describe('icon names', () => {
  it('reads a dashboard-icons name by its prefix, trying vector first and then bitmap', () => {
    expect(resolveIcon('di-plex', '')).toEqual({
      kind: 'images',
      candidates: [
        { src: 'https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/svg/plex.svg' },
        { src: 'https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/png/plex.png' }
      ]
    });
  });

  it('goes straight to the format a dashboard-icons name asks for, with either separator', () => {
    for (const icon of ['di:plex.png', 'di-plex.png']) {
      expect(resolveIcon(icon, '')).toEqual({
        kind: 'images',
        candidates: [
          { src: 'https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/png/plex.png' }
        ]
      });
    }
  });

  it('puts the site’s own icon after a dashboard-icons name, in case it is missing', () => {
    const source = resolveIcon('di-plex', 'https://example.com');

    expect(source.kind === 'images' && source.candidates).toHaveLength(2 + 4);
  });

  it('shows nothing for a name that is nothing, on an address that has no icon to fall back on', () => {
    expect(resolveIcon('not a name!', '')).toEqual({ kind: 'none' });
  });

  it('falls back to the site’s own icon for a name it cannot place', () => {
    const source = resolveIcon('not a name!', 'https://example.com');

    expect(source.kind).toBe('images');
    expect(source.kind === 'images' && source.candidates[0]!.src).toContain(
      'google.com/s2/favicons'
    );
  });
});

describe('addresses that are not addresses', () => {
  it('shows what was given, as it was', () => {
    expect(displayUrl('not a url')).toBe('not a url');
  });

  it('guesses no name for it', () => {
    expect(guessName('not a url')).toBe('');
  });
});

describe('openUrl in the same tab', () => {
  afterEach(() => {
    window.history.replaceState(null, '', '/');
  });

  it('goes to the address, which is how an ordinary link would', () => {
    openUrl('#elsewhere', false);

    expect(window.location.hash).toBe('#elsewhere');
  });

  it('opens a new tab, without handing the page to the tab it opened, when asked to', () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);

    openUrl('https://example.com', true);

    expect(open).toHaveBeenCalledWith('https://example.com', '_blank', 'noopener,noreferrer');
    open.mockRestore();
  });
});
