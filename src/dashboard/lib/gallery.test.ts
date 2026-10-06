import { describe, expect, it } from 'vitest';
import { SAMPLE_PLACE, needsSetup } from './gallery';
import { createWidget, type Widget, type WidgetType } from './model';

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
