import { describe, expect, it } from 'vitest';
import { GOLDFISH, GOLDFISH_NAMES, goldfishOf } from './goldfish';
import { goldfishCounter } from './goldfish-market';

const DAY = '2026-09-23';

describe('the goldfish counter', () => {
  it('has one fish of every breed, cheapest breed first', () => {
    const counter = goldfishCounter(DAY);
    const breeds = counter.map((listing) => goldfishOf(listing.genome));

    expect(new Set(breeds.map((breed) => breed.id)).size).toBe(GOLDFISH.length);
    expect(breeds.map((breed) => breed.price)).toEqual(
      [...breeds.map((breed) => breed.price)].sort((a, b) => a - b)
    );
    expect(counter.every((listing) => listing.day === DAY)).toBe(true);
  });

  it('shows everyone the same goldfish on the same day, and new ones tomorrow', () => {
    expect(goldfishCounter(DAY)).toEqual(goldfishCounter(DAY));
    expect(goldfishCounter('2026-09-24')).not.toEqual(goldfishCounter(DAY));
  });

  it('brings the next of a breed up when one is bought, and leaves the rest alone', () => {
    const before = goldfishCounter(DAY);
    const comet = before.find((listing) => listing.genome.variety === 'comet')!;
    const after = goldfishCounter(DAY, [comet.id], [comet.name]);
    const next = after.find((listing) => listing.genome.variety === 'comet')!;

    expect(next.id).toBe(`${DAY}~comet.1`);
    expect(next.genome.seed).not.toBe(comet.genome.seed);
    expect(next.name).not.toBe(comet.name);
    expect(after.filter((listing) => listing !== next)).toEqual(
      before.filter((listing) => listing !== comet)
    );
  });

  it('never gives two fish on the counter, or a fish already swimming, the same name', () => {
    for (const day of ['2026-09-20', '2026-09-21', '2026-09-22', DAY]) {
      const names = goldfishCounter(day).map((listing) => listing.name);

      expect(new Set(names).size).toBe(names.length);
    }

    const swimming = goldfishCounter(DAY).map((listing) => listing.name);
    const counter = goldfishCounter(DAY, [], swimming);

    expect(counter.some((listing) => swimming.includes(listing.name))).toBe(false);
  });

  it('sells pond-sized fish for pocket money, a bigger fish of a breed for more', () => {
    const days = Array.from({ length: 20 }, (_unused, index) => `2026-10-${10 + index}`);
    const listings = days.flatMap((day) => goldfishCounter(day));

    for (const listing of listings) {
      const [small, large] = goldfishOf(listing.genome).adult;

      expect(listing.lengthCm).toBeGreaterThanOrEqual(7.5);
      expect(listing.lengthCm).toBeLessThanOrEqual(11);
      expect(listing.adultCm).toBeGreaterThanOrEqual(small);
      expect(listing.adultCm).toBeLessThanOrEqual(large);
      expect(listing.price).toBeLessThanOrEqual(50);
    }

    const comets = listings
      .filter((listing) => listing.genome.variety === 'comet')
      .sort((a, b) => a.lengthCm - b.lengthCm);

    expect(comets[comets.length - 1]!.price).toBeGreaterThan(comets[0]!.price);
  });

  it('still names every fish when the whole pond already holds every name', () => {
    const listings = goldfishCounter(DAY, [], GOLDFISH_NAMES);

    expect(listings.length).toBeGreaterThan(0);

    for (const listing of listings) {
      expect(GOLDFISH_NAMES).toContain(listing.name);
    }
  });
});
