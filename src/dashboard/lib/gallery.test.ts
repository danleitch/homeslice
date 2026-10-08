import { describe, expect, it } from 'vitest';
import { GALLERY_GROUPS, PACKS, SAMPLE_PLACE, countByType, needsSetup } from './gallery';
import { GRID_COLUMNS, WIDGET_TYPES, createWidget, type Widget, type WidgetType } from './model';

type Of<T extends WidgetType> = Extract<Widget, { type: T }>;

const widgetOf = <T extends WidgetType>(type: T, overrides: Partial<Of<T>> = {}): Widget =>
  ({ ...createWidget(type), ...overrides }) as Widget;

describe('needsSetup', () => {
  it('is true for My PRs, which has no token until its owner gives one', () => {
    expect(needsSetup(widgetOf('prs', { token: '' }))).toBe(true);
  });

  it('is false for My PRs that has one', () => {
    expect(
      needsSetup(widgetOf('prs', { token: 'github_pat_11ABCDEFG0abcdefghijklmnopqrstuvwxyz' }))
    ).toBe(false);
  });

  it('is true for a weather widget still set to the example’s place, however it is written', () => {
    expect(needsSetup(widgetOf('weather', { location: SAMPLE_PLACE }))).toBe(true);
    expect(needsSetup(widgetOf('weather', { location: `  ${SAMPLE_PLACE.toUpperCase()} ` }))).toBe(
      true
    );
  });

  it('is false for a weather widget given a place of its own', () => {
    expect(needsSetup(widgetOf('weather', { location: 'Oslo' }))).toBe(false);
    expect(needsSetup(widgetOf('weather', { location: 'Cape Town' }))).toBe(false);
  });

  it.each([
    'markets',
    'clock',
    'focus',
    'calendar',
    'agenda',
    'hackernews',
    'github',
    'benchlm',
    'tv',
    'movies',
    'notes',
    'news'
  ] as const)('is false for %s, which shows something useful as it is', (type) => {
    expect(needsSetup(widgetOf(type))).toBe(false);
  });
});

describe('the groups', () => {
  it('hold every widget, each in exactly one, so none can be filtered away', () => {
    const grouped = GALLERY_GROUPS.flatMap((group) => group.types);

    expect([...grouped].sort()).toEqual([...WIDGET_TYPES].sort());
    expect(new Set(grouped).size).toBe(grouped.length);
  });

  it('have their own ids and names', () => {
    expect(new Set(GALLERY_GROUPS.map((group) => group.id)).size).toBe(GALLERY_GROUPS.length);

    for (const group of GALLERY_GROUPS) {
      expect(group.label.trim()).not.toBe('');
      expect(['all', 'packs']).not.toContain(group.id);
    }
  });
});

describe('the packs', () => {
  it('have their own ids and names, and something to say', () => {
    expect(new Set(PACKS.map((pack) => pack.id)).size).toBe(PACKS.length);

    for (const pack of PACKS) {
      expect(pack.name.trim()).not.toBe('');
      expect(pack.blurb.trim()).not.toBe('');
      expect(pack.widgets.length).toBeGreaterThan(0);
    }
  });

  it('are of widgets that exist, set as a new one is or better', () => {
    for (const pack of PACKS) {
      for (const widget of pack.widgets) {
        expect(WIDGET_TYPES).toContain(widget.type);
        expect(widget.width).toBeGreaterThanOrEqual(2);
        expect(widget.width).toBeLessThanOrEqual(GRID_COLUMNS);
      }
    }
  });

  it('tile the board, a whole number of rows across, where there is more than one widget', () => {
    for (const pack of PACKS.filter((candidate) => candidate.widgets.length > 1)) {
      const across = pack.widgets.reduce((total, widget) => total + widget.width, 0);

      expect(across % GRID_COLUMNS).toBe(0);
    }
  });

  it('can follow a token: the crypto pack has the main coins to start from', () => {
    const crypto = PACKS.find((pack) => pack.id === 'crypto')!;

    expect(crypto.widgets).toHaveLength(1);
    expect(crypto.widgets[0]).toMatchObject({
      type: 'markets',
      symbols: [
        { symbol: 'BTC-USD', name: 'Bitcoin' },
        { symbol: 'ETH-USD', name: 'Ethereum' },
        { symbol: 'SOL-USD', name: 'Solana' }
      ]
    });
  });

  it('start the Dev morning with the reviews waiting on you', () => {
    expect(PACKS[0]!.widgets.map((widget) => widget.type)).toEqual(['prs', 'github', 'hackernews']);
  });
});

describe('countByType', () => {
  it('counts each kind', () => {
    expect(
      countByType([createWidget('weather'), createWidget('clock'), createWidget('weather')])
    ).toEqual({ weather: 2, clock: 1 });
  });

  it('is empty for no widgets', () => {
    expect(countByType([])).toEqual({});
  });
});
