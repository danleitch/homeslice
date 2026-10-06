import { describe, expect, it, vi } from 'vitest';
import { findPlaces, isPlaceName } from './places';

const zoneOf = (query: string): string | undefined => findPlaces(query, 1)[0]?.zone;
const namesOf = (query: string, limit?: number): string[] =>
  findPlaces(query, limit).map((place) => place.name);

describe('finding a place', () => {
  it('finds a city that is not a zone’s own name, by the zone it keeps time by', () => {
    expect(zoneOf('boston')).toBe('America/New_York');
    expect(zoneOf('Atlanta')).toBe('America/New_York');
    expect(zoneOf('seattle')).toBe('America/Los_Angeles');
    expect(zoneOf('austin')).toBe('America/Chicago');
    expect(zoneOf('denver')).toBe('America/Denver');
    expect(zoneOf('phoenix')).toBe('America/Phoenix');
    expect(zoneOf('mumbai')).toBe('Asia/Kolkata');
    expect(zoneOf('beijing')).toBe('Asia/Shanghai');
  });

  it('finds a place from the start of its name, or of any word in it', () => {
    expect(namesOf('bos')[0]).toBe('Boston');
    expect(namesOf('york')[0]).toBe('New York');
    expect(namesOf('new yo')[0]).toBe('New York');
    expect(namesOf('salt lake')[0]).toBe('Salt Lake City');
    expect(namesOf('lake city')).toContain('Salt Lake City');
  });

  it('ignores case, accents and punctuation', () => {
    expect(zoneOf('SAO PAULO')).toBe('America/Sao_Paulo');
    expect(zoneOf('zurich')).toBe('Europe/Zurich');
    expect(zoneOf('Zürich')).toBe('Europe/Zurich');
    expect(zoneOf('st johns')).toBe('America/St_Johns');
    expect(zoneOf("St. John's")).toBe('America/St_Johns');
    expect(zoneOf('  tokyo  ')).toBe('Asia/Tokyo');
  });

  it('knows the other names people use', () => {
    expect(zoneOf('nyc')).toBe('America/New_York');
    expect(zoneOf('bombay')).toBe('Asia/Kolkata');
    expect(zoneOf('kiev')).toBe('Europe/Kyiv');
    expect(zoneOf('saigon')).toBe('Asia/Ho_Chi_Minh');
    expect(zoneOf('saint louis')).toBe('America/Chicago');
  });

  it('finds a place by its country, or the way people say it', () => {
    expect(namesOf('japan', 3)).toEqual(['Tokyo', 'Osaka', 'Kyoto']);
    expect(namesOf('uk')).toContain('London');
    expect(namesOf('usa boston')).toEqual(['Boston']);
    expect(namesOf('texas')).toEqual(expect.arrayContaining(['Dallas', 'Houston', 'Austin']));
  });

  it('finds a zone by the name it goes by', () => {
    expect(zoneOf('eastern time')).toBe('America/New_York');
    expect(zoneOf('PST')).toBe('America/Los_Angeles');
    expect(zoneOf('central time')).toBe('America/Chicago');
    expect(zoneOf('GMT')).toBe('UTC');
    expect(zoneOf('utc')).toBe('UTC');
    // IST is India's, Israel's and Ireland's, and the start of Istanbul: they all come up.
    expect(namesOf('IST', 20)).toEqual(expect.arrayContaining(['Istanbul', 'Delhi', 'Jerusalem']));
  });

  it('finds an IANA name, once, however many places keep that time', () => {
    expect(findPlaces('Asia/Tokyo').filter((place) => place.zone === 'Asia/Tokyo')).toHaveLength(1);
    expect(zoneOf('Europe/Paris')).toBe('Europe/Paris');
    expect(zoneOf('america/new_york')).toBe('America/New_York');
  });

  it('lists a place that keeps the same time as a better match only once', () => {
    const zones = findPlaces('syd').map((place) => place.zone);

    expect(namesOf('syd')[0]).toBe('Sydney');
    expect(new Set(zones).size).toBe(zones.length);
    // Canberra keeps Sydney’s time, but it was not what was typed.
    expect(namesOf('syd')).not.toContain('Canberra');
    expect(namesOf('canberra')).toEqual(['Canberra']);
  });

  it('puts a name that starts with the query before one that only has the word in it', () => {
    expect(namesOf('san')[0]).toBe('San Francisco');
    expect(namesOf('york')).toEqual(expect.arrayContaining(['New York']));
  });

  it('does not offer a zone twice because an engine spells it another way', () => {
    // Some engines call Kyiv's zone Europe/Kiev; either way it is one place, once.
    expect(findPlaces('kiev').filter((place) => /kyiv|kiev/i.test(place.name))).toHaveLength(1);
    expect(findPlaces('kyiv')).toHaveLength(1);
  });

  it('includes zones that no place in the list is named for', () => {
    const odd = findPlaces('Asia/Aqtau');

    expect(odd[0]).toEqual({ name: 'Aqtau', region: 'Asia', zone: 'Asia/Aqtau' });
  });

  it('gives as many as asked for, and none for nothing', () => {
    expect(findPlaces('a', 5)).toHaveLength(5);
    expect(findPlaces('a')).toHaveLength(8);
    expect(findPlaces('')).toEqual([]);
    expect(findPlaces('   ')).toEqual([]);
    expect(findPlaces('!!!')).toEqual([]);
    expect(findPlaces('zzzzqq')).toEqual([]);
  });

  it('still finds the listed places in a browser that cannot list its zones', async () => {
    vi.resetModules();
    vi.spyOn(
      Intl as unknown as { supportedValuesOf: () => string[] },
      'supportedValuesOf'
    ).mockImplementation(() => {
      throw new Error('unsupported');
    });
    const fresh = await import('./places');

    expect(fresh.findPlaces('paris')[0]?.zone).toBe('Europe/Paris');
    expect(fresh.findPlaces('Asia/Aqtau')).toEqual([]);
    vi.restoreAllMocks();
  });
});

describe('every place in the list', () => {
  const everything = (): ReturnType<typeof findPlaces> => {
    // Every letter and digit a name can start with, so the whole list comes out.
    const seen = new Map<string, ReturnType<typeof findPlaces>[number]>();

    for (const letter of 'abcdefghijklmnopqrstuvwxyz') {
      for (const second of 'abcdefghijklmnopqrstuvwxyz') {
        for (const place of findPlaces(`${letter}${second}`, 500)) {
          seen.set(`${place.name}|${place.region}|${place.zone}`, place);
        }
      }
    }

    return [...seen.values()];
  };

  it('keeps time by a zone the browser knows', () => {
    const places = everything();

    expect(places.length).toBeGreaterThan(300);

    for (const place of places) {
      expect(
        () => new Intl.DateTimeFormat('en', { timeZone: place.zone }),
        place.zone
      ).not.toThrow();
    }
  });

  it('is in a region, has a name, and is not listed twice', () => {
    const places = everything();
    const keys = places.map((place) => `${place.name}|${place.region}`);

    expect(places.every((place) => place.name.trim() && place.region.trim())).toBe(true);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('a label that is only a place’s name', () => {
  it('is told from one somebody wrote', () => {
    expect(isPlaceName('Boston')).toBe(true);
    expect(isPlaceName(' new york ')).toBe(true);
    expect(isPlaceName('São Paulo')).toBe(true);
    expect(isPlaceName('Sao Paulo')).toBe(true);
    expect(isPlaceName('Mum’s')).toBe(false);
    expect(isPlaceName('')).toBe(false);
  });
});
