import { afterEach, describe, expect, it, vi } from 'vitest';
import { ageAtLength, joinedLabel, lengthAtAge } from './fish-growth';
import { createSwimmer, nominalLength, stepSwimmer, type PondBounds } from './koi-pond';
import { DAILY_STOCK, isSelfColoured, koiTank } from './koi-market';
import { buildKoiRoster } from './koi-roster';
import { findVariety } from './koi-varieties';
import { parseLilyPlacements, readStorage } from './storage';

describe('fish growth', () => {
  it('gives the age of a fish no longer than it was when it hatched as nought', () => {
    expect(ageAtLength('koi', 0.1, 75)).toBe(0);
    expect(ageAtLength('koi', 0, 75)).toBe(0);
  });

  it('reads an age back into the length it grows to, and the length into the age', () => {
    const length = lengthAtAge('koi', 2, 75);

    expect(ageAtLength('koi', length, 75)).toBeCloseTo(2, 5);
  });

  describe('when a fish joined', () => {
    const now = new Date(2026, 8, 23, 12);

    it('says so plainly for a date that cannot be read', () => {
      expect(joinedLabel('not a date', now)).toBe('Joined recently');
    });

    it('says so plainly for a date that is still to come, such as from a clock that ran fast', () => {
      expect(joinedLabel(new Date(2026, 8, 25).toISOString(), now)).toBe('Joined recently');
    });

    it('says today, yesterday and how many days ago', () => {
      expect(joinedLabel(new Date(2026, 8, 23, 6).toISOString(), now)).toBe('Joined today');
      expect(joinedLabel(new Date(2026, 8, 22, 6).toISOString(), now)).toBe('Joined yesterday');
      expect(joinedLabel(new Date(2026, 8, 18, 6).toISOString(), now)).toBe('Joined 5 days ago');
    });
  });
});

describe('storage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reads nothing, rather than failing, where storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });

    expect(readStorage('anything')).toBeNull();
  });

  it('reads no lily placements from storage that is not JSON', () => {
    expect(parseLilyPlacements('{not json')).toEqual([]);
    expect(parseLilyPlacements(null)).toEqual([]);
    expect(parseLilyPlacements('')).toEqual([]);
  });
});

describe('the daily koi tank', () => {
  it('always holds a self-coloured koi and a patterned one, whatever the day brings', () => {
    for (let day = 0; day < 400; day += 1) {
      const date = new Date(2026, 0, 1 + day).toISOString().slice(0, 10);
      const varieties = koiTank(date).map((listing) => findVariety(listing.genome.variety)!);

      expect(varieties, date).toHaveLength(DAILY_STOCK);
      expect(varieties.some(isSelfColoured), `${date} has a self-coloured koi`).toBe(true);
      expect(
        varieties.some((variety) => !isSelfColoured(variety)),
        `${date} has a patterned koi`
      ).toBe(true);
    }
  });

  it('never lists the same variety twice in one tank', () => {
    for (let day = 0; day < 100; day += 1) {
      const date = new Date(2026, 0, 1 + day).toISOString().slice(0, 10);
      const ids = koiTank(date).map((listing) => listing.genome.variety);

      expect(new Set(ids).size, date).toBe(ids.length);
    }
  });
});

describe('the pond, when the panel fills it', () => {
  const bounds: PondBounds = { width: 1280, height: 800 };
  const descriptor = buildKoiRoster([], 1)[0]!;

  it('starts a koi hugging the bank, since nowhere in the water is clear', () => {
    const everything: PondBounds = {
      ...bounds,
      island: { x: -500, y: -500, width: 3000, height: 3000 }
    };

    const swimmer = createSwimmer(descriptor, everything);

    expect(swimmer.nose.x).toBeLessThan(nominalLength(everything));
    expect(swimmer.nose.y).toBeGreaterThan(bounds.height * 0.1 - 1);
    expect(swimmer.nose.y).toBeLessThan(bounds.height * 0.9 + 1);
  });

  it('starts the same koi in the same place every time', () => {
    const everything: PondBounds = {
      ...bounds,
      island: { x: -500, y: -500, width: 3000, height: 3000 }
    };

    expect(createSwimmer(descriptor, everything).nose).toEqual(
      createSwimmer(descriptor, everything).nose
    );
  });
});

describe('a koi at the edge of the pond', () => {
  const bounds: PondBounds = { width: 1280, height: 800 };
  const descriptor = buildKoiRoster([], 1)[0]!;

  const swim = (from: { x: number; y: number }, steps = 240): { x: number; y: number }[] => {
    let swimmer = { ...createSwimmer(descriptor, bounds) };
    swimmer = { ...swimmer, nose: { ...from } };
    const path: { x: number; y: number }[] = [];

    for (let step = 0; step < steps; step += 1) {
      swimmer = stepSwimmer(swimmer, 1 / 30, step / 30, bounds, false);
      path.push({ ...swimmer.nose });
    }

    return path;
  };

  it.each([
    ['left', { x: 2, y: 400 }, (point: { x: number; y: number }) => point.x],
    ['top', { x: 640, y: 2 }, (point: { x: number; y: number }) => point.y]
  ])('is turned in from the %s bank', (_side, start, axis) => {
    const path = swim(start);

    expect(Math.max(...path.map(axis))).toBeGreaterThan(axis(start) + 20);
  });

  it.each([
    [
      'right',
      { x: bounds.width - 2, y: 400 },
      (point: { x: number; y: number }) => point.x,
      bounds.width
    ],
    [
      'bottom',
      { x: 640, y: bounds.height - 2 },
      (point: { x: number; y: number }) => point.y,
      bounds.height
    ]
  ])('is turned in from the %s bank', (_side, start, axis, limit) => {
    const path = swim(start);

    expect(Math.min(...path.map(axis))).toBeLessThan(limit - 20);
  });

  it('stays within the pond, give or take a body length, wherever it started', () => {
    for (const start of [
      { x: 2, y: 2 },
      { x: bounds.width - 2, y: 2 },
      { x: 2, y: bounds.height - 2 },
      { x: bounds.width - 2, y: bounds.height - 2 }
    ]) {
      for (const point of swim(start, 600)) {
        expect(point.x).toBeGreaterThan(-nominalLength(bounds));
        expect(point.x).toBeLessThan(bounds.width + nominalLength(bounds));
        expect(point.y).toBeGreaterThan(-nominalLength(bounds));
        expect(point.y).toBeLessThan(bounds.height + nominalLength(bounds));
      }
    }
  });
});
