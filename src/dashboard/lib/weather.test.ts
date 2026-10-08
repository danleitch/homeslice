import { describe, expect, it } from 'vitest';
import { airLevel, buildReport, describeWeather, uvLevel, type Place } from './weather';

const place: Place = {
  name: 'Reykjavík',
  area: 'Capital Region',
  country: 'Iceland',
  latitude: 64.1,
  longitude: -21.9,
  // UTC all year, so the hours read plainly.
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
    // Coldest at midnight, warmest at noon.
    temperature_2m: hours.map((hour) => 4 + 12 - Math.abs(12 - hour)),
    precipitation_probability: hours.map((hour) => (hour >= 14 && hour < 18 ? 90 : 10))
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

describe('buildReport', () => {
  const report = buildReport(place, forecast, new Date((day + 13.5 * 3600) * 1000));

  it('reads the conditions now', () => {
    expect(report).toMatchObject({
      temperature: 15,
      apparent: 12,
      code: 61,
      isDay: true,
      wind: 18,
      humidity: 81,
      high: 16,
      low: 4
    });
  });

  it('lays the day out in twelve two-hour columns, the current one showing the reading now', () => {
    expect(report.columns).toHaveLength(12);
    expect(report.currentColumn).toBe(6);
    expect(report.columns[6].temperature).toBe(15);
    expect(report.columns[0].scale).toBe(0);
    expect(Math.max(...report.columns.map((column) => column.scale))).toBe(1);
  });

  it('marks daylight and rain on the columns', () => {
    expect(report.columns.filter((column) => column.daylight).map((column) => column.hour)).toEqual(
      [6, 8, 10, 12, 14, 16, 18, 20]
    );
    expect(report.columns.filter((column) => column.rain).map((column) => column.hour)).toEqual([
      14, 16
    ]);
  });

  it('looks ahead five days, dated where the place is', () => {
    expect(report.days.map((entry) => entry.date)).toEqual([
      '2026-06-02',
      '2026-06-03',
      '2026-06-04',
      '2026-06-05',
      '2026-06-06'
    ]);
    expect(report.days[0]).toMatchObject({ code: 0, high: 17, low: 5 });
  });
});

describe('describeWeather', () => {
  it('names the WMO codes Open-Meteo reports', () => {
    expect(describeWeather(0)).toEqual({ label: 'Clear sky', kind: 'clear' });
    expect(describeWeather(95).kind).toBe('storm');
    expect(describeWeather(1234).label).toBe('Unknown');
  });
});

describe('buildReport, beyond the basics', () => {
  const now = new Date((day + 13.5 * 3600) * 1000);

  it('always has the day’s sunrise and sunset, in milliseconds', () => {
    expect(buildReport(place, forecast, now).sun).toEqual({
      rise: (day + 6 * 3600) * 1000,
      set: (day + 20 * 3600) * 1000
    });
  });

  it('has no UV index when none was asked for', () => {
    expect(buildReport(place, forecast, now)).not.toHaveProperty('uv');
  });

  it('has today’s highest UV index, to the whole number, when it was asked for', () => {
    const asked = { ...forecast, daily: { ...forecast.daily, uv_index_max: [7.4, 6, 5, 4, 3, 2] } };

    expect(buildReport(place, asked, now).uv).toBe(7);
  });

  it('says there is none when the service gave a gap', () => {
    const gap = { ...forecast, daily: { ...forecast.daily, uv_index_max: [null, 6, 5, 4, 3, 2] } };

    expect(buildReport(place, gap, now).uv).toBeNull();
  });
});

describe('uvLevel', () => {
  it.each([
    [0, 'Low', 'good'],
    [2, 'Low', 'good'],
    [3, 'Moderate', 'fair'],
    [5, 'Moderate', 'fair'],
    [6, 'High', 'poor'],
    [7, 'High', 'poor'],
    [8, 'Very high', 'bad'],
    [10, 'Very high', 'bad'],
    [11, 'Extreme', 'bad'],
    [14, 'Extreme', 'bad']
  ])('calls a UV index of %i %s', (index, label, tone) => {
    expect(uvLevel(index)).toEqual({ label, tone });
  });
});

describe('airLevel', () => {
  it.each([
    [0, 'Good', 'good'],
    [50, 'Good', 'good'],
    [51, 'Moderate', 'fair'],
    [100, 'Moderate', 'fair'],
    [101, 'Poor for some', 'poor'],
    [150, 'Poor for some', 'poor'],
    [151, 'Poor', 'bad'],
    [200, 'Poor', 'bad'],
    [201, 'Very poor', 'bad'],
    [350, 'Very poor', 'bad']
  ])('calls an air quality index of %i %s', (index, label, tone) => {
    expect(airLevel(index)).toEqual({ label, tone });
  });
});
