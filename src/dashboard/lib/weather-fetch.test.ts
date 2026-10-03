import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildReport, fetchWeather, findPlace, type Place } from './weather';

const GEO_CACHE = 'dashboard-geo:';
const signal = new AbortController().signal;

type GeoResult = {
  name: string;
  admin1?: string;
  country?: string;
  country_code?: string;
  latitude: number;
  longitude: number;
  timezone: string;
};

const portlandOregon: GeoResult = {
  name: 'Portland',
  admin1: 'Oregon',
  country: 'United States',
  country_code: 'US',
  latitude: 45.5,
  longitude: -122.7,
  timezone: 'America/Los_Angeles'
};
const portlandMaine: GeoResult = {
  name: 'Portland',
  admin1: 'Maine',
  country: 'United States',
  country_code: 'US',
  latitude: 43.7,
  longitude: -70.3,
  timezone: 'America/New_York'
};
const portlandEngland: GeoResult = {
  name: 'Portland',
  admin1: 'England',
  country: 'United Kingdom',
  country_code: 'GB',
  latitude: 50.5,
  longitude: -2.4,
  timezone: 'Europe/London'
};

const answer = (body: unknown, ok = true): Response => ({ ok, json: async () => body }) as Response;

const geocoding = (...results: GeoResult[]): Response => answer({ results });

describe('findPlace', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('finds a place by name, with its own coordinates and time zone', async () => {
    fetchMock.mockResolvedValue(geocoding(portlandOregon));

    expect(await findPlace('Portland', signal)).toEqual({
      name: 'Portland',
      area: 'Oregon',
      country: 'United States',
      latitude: 45.5,
      longitude: -122.7,
      timezone: 'America/Los_Angeles'
    });
  });

  it('asks the geocoder for just the first part of the name, encoded', async () => {
    fetchMock.mockResolvedValue(
      geocoding({
        name: 'São Paulo',
        admin1: 'São Paulo',
        country: 'Brazil',
        country_code: 'BR',
        latitude: -23.5,
        longitude: -46.6,
        timezone: 'America/Sao_Paulo'
      })
    );

    await findPlace('São Paulo, Brazil', signal);

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(`name=${encodeURIComponent('São Paulo')}`),
      { signal }
    );
    expect(fetchMock.mock.calls[0]![0]).toContain('geocoding-api.open-meteo.com');
  });

  it('takes the first place when only a name is given', async () => {
    fetchMock.mockResolvedValue(geocoding(portlandOregon, portlandMaine));

    expect((await findPlace('Portland', signal)).area).toBe('Oregon');
  });

  it('narrows to a region when one is given', async () => {
    fetchMock.mockResolvedValue(geocoding(portlandOregon, portlandMaine));

    expect((await findPlace('Portland, Maine', signal)).area).toBe('Maine');
  });

  it('narrows to a country, by name or code, whatever the case', async () => {
    fetchMock.mockResolvedValue(geocoding(portlandOregon, portlandEngland));

    expect((await findPlace('Portland, United Kingdom', signal)).area).toBe('England');
    expect((await findPlace('portland, gb', signal)).area).toBe('England');
  });

  it.each([
    ['US', 'Oregon'],
    ['usa', 'Oregon'],
    ['UK', 'England'],
    ['uae', 'Dubai'],
    ['SA', 'Gauteng']
  ])('understands %s as a country', async (alias, area) => {
    fetchMock.mockResolvedValue(
      geocoding(
        portlandOregon,
        portlandEngland,
        { ...portlandOregon, admin1: 'Dubai', country: 'United Arab Emirates', country_code: 'AE' },
        { ...portlandOregon, admin1: 'Gauteng', country: 'South Africa', country_code: 'ZA' }
      )
    );

    expect((await findPlace(`Portland, ${alias}`, signal)).area).toBe(area);
  });

  it('wants every qualifier to match, in a region and a country', async () => {
    fetchMock.mockResolvedValue(geocoding(portlandOregon, portlandMaine));

    expect((await findPlace('Portland, Maine, US', signal)).area).toBe('Maine');
    await expect(findPlace('Portland, Maine, UK', signal)).rejects.toThrow(
      'No place called “Portland, Maine, UK” was found.'
    );
  });

  it('copes with a place that has no region or country on record', async () => {
    fetchMock.mockResolvedValue(
      geocoding({ name: 'Nowhere', latitude: 1, longitude: 2, timezone: 'UTC' })
    );

    expect(await findPlace('Nowhere', signal)).toMatchObject({ area: '', country: '' });
  });

  it('says so when nothing is found', async () => {
    fetchMock.mockResolvedValue(answer({}));

    await expect(findPlace('Atlantis', signal)).rejects.toThrow(
      'No place called “Atlantis” was found.'
    );
  });

  it('says so when no place matches the qualifiers', async () => {
    fetchMock.mockResolvedValue(geocoding(portlandOregon));

    await expect(findPlace('Portland, Texas', signal)).rejects.toThrow('was found.');
  });

  it('says so when the geocoder does not answer', async () => {
    fetchMock.mockResolvedValue(answer(null, false));

    await expect(findPlace('Portland', signal)).rejects.toThrow('Couldn’t look that place up.');
  });

  it('asks for a place to be set, without asking anyone', async () => {
    await expect(findPlace('', signal)).rejects.toThrow('Set a location for this widget.');
    await expect(findPlace(' , , ', signal)).rejects.toThrow('Set a location for this widget.');

    expect(fetchMock).not.toHaveBeenCalled();
  });

  describe('its memory', () => {
    it('remembers a place it found, under a key that ignores case and spaces at the ends', async () => {
      fetchMock.mockResolvedValue(geocoding(portlandOregon));

      await findPlace('  Portland ', signal);

      expect(JSON.parse(window.localStorage.getItem(`${GEO_CACHE}portland`)!)).toMatchObject({
        name: 'Portland',
        area: 'Oregon'
      });
    });

    it('does not ask again for a place it remembers', async () => {
      fetchMock.mockResolvedValue(geocoding(portlandOregon));
      await findPlace('Portland', signal);
      fetchMock.mockClear();

      const place = await findPlace('PORTLAND', signal);

      expect(place.area).toBe('Oregon');
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('remembers each spelling of a place on its own', async () => {
      fetchMock.mockResolvedValue(geocoding(portlandOregon, portlandMaine));

      await findPlace('Portland', signal);
      await findPlace('Portland, Maine', signal);

      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('looks again when what it remembered cannot be read', async () => {
      window.localStorage.setItem(`${GEO_CACHE}portland`, '{broken');
      fetchMock.mockResolvedValue(geocoding(portlandOregon));

      expect((await findPlace('Portland', signal)).area).toBe('Oregon');
    });

    it('carries on when it cannot read or keep anything', async () => {
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('blocked');
      });
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('full');
      });
      fetchMock.mockResolvedValue(geocoding(portlandOregon));

      expect((await findPlace('Portland', signal)).area).toBe('Oregon');
    });
  });
});

describe('fetchWeather', () => {
  const place: Place = {
    name: 'Reykjavík',
    area: 'Capital Region',
    country: 'Iceland',
    latitude: 64.1,
    longitude: -21.9,
    timezone: 'Atlantic/Reykjavik'
  };
  const day = Date.UTC(2026, 5, 1) / 1000;
  const hours = Array.from({ length: 24 }, (_unused, hour) => hour);
  const forecast = {
    current: {
      temperature_2m: 14.6,
      apparent_temperature: 12.2,
      weather_code: 61,
      is_day: 1,
      wind_speed_10m: 18.4,
      relative_humidity_2m: 81
    },
    hourly: {
      temperature_2m: hours.map((hour) => 4 + 12 - Math.abs(12 - hour)),
      precipitation_probability: hours.map(() => 10)
    },
    daily: {
      time: Array.from({ length: 6 }, (_unused, index) => day + index * 86400),
      sunrise: Array.from({ length: 6 }, () => day + 6 * 3600),
      sunset: Array.from({ length: 6 }, () => day + 20 * 3600),
      temperature_2m_max: [16, 17, 18, 19, 20, 21],
      temperature_2m_min: [4, 5, 6, 7, 8, 9],
      weather_code: [61, 0, 2, 3, 45, 95]
    }
  };
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    window.localStorage.setItem(`${GEO_CACHE}reykjavik`, JSON.stringify(place));
    fetchMock = vi.fn().mockResolvedValue(answer(forecast));
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const queryOf = (): URLSearchParams =>
    new URL(fetchMock.mock.calls[0]![0] as string).searchParams;

  it('reads the forecast for the place, and turns it into a report', async () => {
    const report = await fetchWeather('Reykjavik', 'metric', signal);

    expect(report.place).toEqual(place);
    expect(report).toMatchObject({ temperature: 15, code: 61, days: expect.any(Array) });
    expect(report.columns).toHaveLength(12);
  });

  it('asks for the place’s own coordinates and time zone, six days, in unix time', async () => {
    await fetchWeather('Reykjavik', 'metric', signal);

    expect(fetchMock.mock.calls[0]![0]).toContain('api.open-meteo.com/v1/forecast');
    expect(fetchMock.mock.calls[0]![1]).toEqual({ signal });
    expect(Object.fromEntries(queryOf())).toMatchObject({
      latitude: '64.1',
      longitude: '-21.9',
      timezone: 'Atlantic/Reykjavik',
      timeformat: 'unixtime',
      forecast_days: '6'
    });
  });

  it('asks for metric units', async () => {
    await fetchWeather('Reykjavik', 'metric', signal);

    expect(queryOf().get('temperature_unit')).toBe('celsius');
    expect(queryOf().get('wind_speed_unit')).toBe('kmh');
  });

  it('asks for imperial units', async () => {
    await fetchWeather('Reykjavik', 'imperial', signal);

    expect(queryOf().get('temperature_unit')).toBe('fahrenheit');
    expect(queryOf().get('wind_speed_unit')).toBe('mph');
  });

  it('says so when the weather service does not answer', async () => {
    fetchMock.mockResolvedValue(answer(null, false));

    await expect(fetchWeather('Reykjavik', 'metric', signal)).rejects.toThrow(
      'The weather service didn’t answer.'
    );
  });

  it('says so when the place cannot be found, without asking for a forecast', async () => {
    window.localStorage.clear();
    fetchMock.mockResolvedValue(answer({}));

    await expect(fetchWeather('Atlantis', 'metric', signal)).rejects.toThrow('was found.');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('buildReport in a place whose time zone the browser does not know', () => {
  const place: Place = {
    name: 'Nowhere',
    area: '',
    country: '',
    latitude: 0,
    longitude: 0,
    timezone: 'Not/A_Zone'
  };
  const day = Date.UTC(2026, 5, 1) / 1000;
  const hours = Array.from({ length: 24 }, (_unused, hour) => hour);
  const forecast = {
    current: {
      temperature_2m: 10,
      apparent_temperature: 9,
      weather_code: 0,
      is_day: 0,
      wind_speed_10m: 5,
      relative_humidity_2m: 50
    },
    hourly: {
      temperature_2m: hours.map(() => 10),
      precipitation_probability: hours.map(() => null)
    },
    daily: {
      time: Array.from({ length: 6 }, (_unused, index) => day + index * 86400),
      sunrise: [day + 6 * 3600],
      sunset: [day + 20 * 3600],
      temperature_2m_max: [12, 12, 12, 12, 12, 12],
      temperature_2m_min: [8, 8, 8, 8, 8, 8],
      weather_code: [0, 0, 0, 0, 0, 0]
    }
  };

  it('falls back to the visitor’s own clock and calendar', () => {
    const report = buildReport(place, forecast, new Date((day + 13 * 3600) * 1000));

    // The browser here runs in UTC, so its own clock is the place's.
    expect(report.currentColumn).toBe(6);
    expect(report.days[0]!.date).toBe('2026-06-02');
  });

  it('gives a flat day every column at full height', () => {
    const report = buildReport(place, forecast, new Date((day + 13 * 3600) * 1000));

    expect(report.columns.every((column) => column.scale === 1)).toBe(true);
  });

  it('treats missing rain chances as dry', () => {
    const report = buildReport(place, forecast, new Date((day + 13 * 3600) * 1000));

    expect(report.columns.some((column) => column.rain)).toBe(false);
  });
});
