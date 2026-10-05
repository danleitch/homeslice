import { describe, expect, it } from 'vitest';
import { ROW_PX } from '../lib/model';
import { FIT_HEIGHT, HEIGHT_OPTIONS, heightChoices, heightOfChoice } from './layout-options';

describe('the heights a card can be given', () => {
  it('start with Fit, which is no height at all, and then go up in rows of the board', () => {
    expect(HEIGHT_OPTIONS.map((option) => option.label)).toEqual(['Fit', 'S', 'M', 'L', 'XL']);
    expect(HEIGHT_OPTIONS[0].value).toBe(FIT_HEIGHT);
    expect(HEIGHT_OPTIONS.slice(1).map((option) => Number(option.value))).toEqual([
      48, 72, 96, 144
    ]);
  });

  it('say how many pixels each is', () => {
    expect(HEIGHT_OPTIONS[2].title).toBe(`${72 * ROW_PX} pixels`);
  });

  it('are the only choices for a card that has none, or one of them', () => {
    expect(heightChoices(undefined)).toBe(HEIGHT_OPTIONS);
    expect(heightChoices(72)).toBe(HEIGHT_OPTIONS);
  });

  it('gain the height dragging made, in pixels, when it is not one of them', () => {
    const choices = heightChoices(50);

    expect(choices).toHaveLength(HEIGHT_OPTIONS.length + 1);
    expect(choices[choices.length - 1]).toEqual({ value: '50', label: `${50 * ROW_PX}px` });
  });

  it('read back as no height for Fit, and as rows for the rest', () => {
    expect(heightOfChoice(FIT_HEIGHT)).toBeUndefined();
    expect(heightOfChoice('96')).toBe(96);
  });
});
