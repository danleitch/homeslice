/**
 * Today's weather from Open-Meteo, which needs no key and answers browsers
 * directly. The shape follows glance's weather widget: twelve two-hour
 * columns across the day, with daylight and rain marked on them.
 */
import type { TemperatureUnits } from './model';

export type Place = {
  name: string;
  area: string;
  country: string;
  latitude: number;
  longitude: number;
  timezone: string;
};

export type WeatherColumn = {
  /** The first hour this column covers, 0 to 22. */
  hour: number;
  temperature: number;
  /** 0 to 1 across the day's range, for the bar's height. */
  scale: number;
  rain: boolean;
  daylight: boolean;
};

export type WeatherDay = { date: string; code: number; high: number; low: number };

export type WeatherReport = {
  place: Place;
  /** Today's sunrise and sunset, in milliseconds since 1970. */
  sun?: { rise: number; set: number };
  /** The highest UV index today, when it was asked for; null when the service had none. */
  uv?: number | null;
  /** The US air quality index now, when it was asked for; null when the service had none. */
  air?: number | null;
  temperature: number;
  apparent: number;
  code: number;
  isDay: boolean;
  wind: number;
  humidity: number;
  high: number;
  low: number;
  currentColumn: number;
  columns: WeatherColumn[];
  days: WeatherDay[];
};

type GeocodeResponse = {
  results?: {
    name: string;
    admin1?: string;
    country?: string;
    country_code?: string;
    latitude: number;
    longitude: number;
    timezone: string;
  }[];
};

type ForecastResponse = {
  current: {
    temperature_2m: number;
    apparent_temperature: number;
    weather_code: number;
    is_day: number;
    wind_speed_10m: number;
    relative_humidity_2m: number;
  };
  hourly: { temperature_2m: number[]; precipitation_probability: (number | null)[] };
  daily: {
    time: number[];
    sunrise: number[];
    sunset: number[];
    uv_index_max?: (number | null)[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    weather_code: number[];
  };
};

const COUNTRY_ALIASES: Readonly<Record<string, string>> = {
  us: 'united states',
  usa: 'united states',
  uk: 'united kingdom',
  uae: 'united arab emirates',
  sa: 'south africa'
};

const GEO_CACHE_PREFIX = 'dashboard-geo:';

/** Finds a place by name; "Portland, Oregon, US" narrows by area and country. */
export const findPlace = async (location: string, signal: AbortSignal): Promise<Place> => {
  const cacheKey = GEO_CACHE_PREFIX + location.trim().toLowerCase();

  try {
    const cached = window.localStorage.getItem(cacheKey);

    if (cached) {
      return JSON.parse(cached) as Place;
    }
  } catch {
    /* look it up again */
  }

  const parts = location
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length === 0) {
    throw new Error('Set a location for this widget.');
  }

  const response = await fetch(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(parts[0])}&count=20&language=en&format=json`,
    { signal }
  );

  if (!response.ok) {
    throw new Error('Couldn’t look that place up.');
  }

  const { results = [] } = (await response.json()) as GeocodeResponse;
  const qualifiers = parts.slice(1).map((part) => {
    const lower = part.toLowerCase();
    return COUNTRY_ALIASES[lower] ?? lower;
  });
  const matches = (result: NonNullable<GeocodeResponse['results']>[number]): boolean =>
    qualifiers.every((qualifier) =>
      [result.admin1, result.country, result.country_code]
        .filter((value): value is string => Boolean(value))
        .some((value) => value.toLowerCase() === qualifier)
    );
  const found = results.find(matches);

  if (!found) {
    throw new Error(`No place called “${location}” was found.`);
  }

  const place: Place = {
    name: found.name,
    area: found.admin1 ?? '',
    country: found.country ?? '',
    latitude: found.latitude,
    longitude: found.longitude,
    timezone: found.timezone
  };

  try {
    window.localStorage.setItem(cacheKey, JSON.stringify(place));
  } catch {
    /* it will be looked up again */
  }

  return place;
};

/** The hour of the day at a place, wherever the visitor happens to be. */
const hourAt = (timezone: string, when: Date): number => {
  try {
    const hour = new Intl.DateTimeFormat('en-GB', {
      hour: 'numeric',
      hourCycle: 'h23',
      timeZone: timezone
    }).format(when);
    return Number(hour) % 24;
  } catch {
    return when.getHours();
  }
};

/** The calendar date at a place, as YYYY-MM-DD, noon UTC of which has the right weekday. */
const dayAt = (timezone: string, when: Date): string => {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      timeZone: timezone
    }).format(when);
  } catch {
    return when.toISOString().slice(0, 10);
  }
};

/** Turns Open-Meteo's answer into the widget's report. Exposed for tests. */
export const buildReport = (place: Place, forecast: ForecastResponse, now: Date): WeatherReport => {
  const hourNow = hourAt(place.timezone, now);
  const currentColumn = Math.floor(hourNow / 2);
  const sunriseHour = hourAt(place.timezone, new Date(forecast.daily.sunrise[0] * 1000));
  const sunsetHour = hourAt(place.timezone, new Date(forecast.daily.sunset[0] * 1000));
  const temperatures = forecast.hourly.temperature_2m.slice(0, 24);
  const rain = forecast.hourly.precipitation_probability.slice(0, 24);

  const raw = Array.from({ length: 12 }, (_unused, index) => {
    const first = temperatures[index * 2] ?? temperatures[temperatures.length - 1] ?? 0;
    const second = temperatures[index * 2 + 1] ?? first;
    const temperature =
      index === currentColumn
        ? Math.round(forecast.current.temperature_2m)
        : Math.round((first + second) / 2);
    const chance = ((rain[index * 2] ?? 0) + (rain[index * 2 + 1] ?? 0)) / 2;
    const hour = index * 2;

    return {
      hour,
      temperature,
      rain: chance >= 60,
      daylight: hour + 1 >= sunriseHour && hour <= sunsetHour
    };
  });

  const min = Math.min(...raw.map((column) => column.temperature));
  const max = Math.max(...raw.map((column) => column.temperature));
  const range = max - min;

  const uvMax = forecast.daily.uv_index_max?.[0];

  return {
    place,
    sun: { rise: forecast.daily.sunrise[0] * 1000, set: forecast.daily.sunset[0] * 1000 },
    ...(forecast.daily.uv_index_max
      ? { uv: typeof uvMax === 'number' ? Math.round(uvMax) : null }
      : {}),
    temperature: Math.round(forecast.current.temperature_2m),
    apparent: Math.round(forecast.current.apparent_temperature),
    code: forecast.current.weather_code,
    isDay: forecast.current.is_day === 1,
    wind: Math.round(forecast.current.wind_speed_10m),
    humidity: Math.round(forecast.current.relative_humidity_2m),
    high: Math.round(forecast.daily.temperature_2m_max[0]),
    low: Math.round(forecast.daily.temperature_2m_min[0]),
    currentColumn,
    columns: raw.map((column) => ({
      ...column,
      scale: range > 0 ? (column.temperature - min) / range : 1
    })),
    days: forecast.daily.time.slice(1, 6).map((time, index) => ({
      date: dayAt(place.timezone, new Date(time * 1000)),
      code: forecast.daily.weather_code[index + 1],
      high: Math.round(forecast.daily.temperature_2m_max[index + 1]),
      low: Math.round(forecast.daily.temperature_2m_min[index + 1])
    }))
  };
};

/** What the weather shows beyond its basics, each of which may cost a little more to read. */
export type WeatherExtras = { uv: boolean; air: boolean };

type AirResponse = { current?: { us_aqi?: number | null } };

/**
 * The US air quality index at a place now, or null when the service has none or can't say: the
 * air is a small extra, and never worth losing the weather over.
 */
export const fetchAirQuality = async (
  place: Place,
  signal: AbortSignal
): Promise<number | null> => {
  const query = new URLSearchParams({
    latitude: String(place.latitude),
    longitude: String(place.longitude),
    current: 'us_aqi'
  });

  try {
    const response = await fetch(`https://air-quality-api.open-meteo.com/v1/air-quality?${query}`, {
      signal
    });

    if (!response.ok) {
      return null;
    }

    const aqi = ((await response.json()) as AirResponse).current?.us_aqi;
    return typeof aqi === 'number' && Number.isFinite(aqi) ? Math.round(aqi) : null;
  } catch (error) {
    if (signal.aborted) {
      throw error;
    }

    return null;
  }
};

export const fetchWeather = async (
  location: string,
  units: TemperatureUnits,
  signal: AbortSignal,
  extras: WeatherExtras = { uv: false, air: false }
): Promise<WeatherReport> => {
  const place = await findPlace(location, signal);
  const query = new URLSearchParams({
    latitude: String(place.latitude),
    longitude: String(place.longitude),
    timezone: place.timezone,
    timeformat: 'unixtime',
    forecast_days: '6',
    current:
      'temperature_2m,apparent_temperature,weather_code,is_day,wind_speed_10m,relative_humidity_2m',
    hourly: 'temperature_2m,precipitation_probability',
    daily: `sunrise,sunset,temperature_2m_max,temperature_2m_min,weather_code${extras.uv ? ',uv_index_max' : ''}`,
    temperature_unit: units === 'imperial' ? 'fahrenheit' : 'celsius',
    wind_speed_unit: units === 'imperial' ? 'mph' : 'kmh'
  });
  const [response, air] = await Promise.all([
    fetch(`https://api.open-meteo.com/v1/forecast?${query}`, { signal }),
    extras.air ? fetchAirQuality(place, signal) : Promise.resolve(undefined)
  ]);

  if (!response.ok) {
    throw new Error('The weather service didn’t answer.');
  }

  const report = buildReport(place, (await response.json()) as ForecastResponse, new Date());
  return air === undefined ? report : { ...report, air };
};

/** How strong the sun is, by the UV index, in the words the health services use. */
export const uvLevel = (
  index: number
): { label: string; tone: 'good' | 'fair' | 'poor' | 'bad' } =>
  index <= 2
    ? { label: 'Low', tone: 'good' }
    : index <= 5
      ? { label: 'Moderate', tone: 'fair' }
      : index <= 7
        ? { label: 'High', tone: 'poor' }
        : { label: index <= 10 ? 'Very high' : 'Extreme', tone: 'bad' };

/** How clean the air is, by the US air quality index. */
export const airLevel = (
  index: number
): { label: string; tone: 'good' | 'fair' | 'poor' | 'bad' } =>
  index <= 50
    ? { label: 'Good', tone: 'good' }
    : index <= 100
      ? { label: 'Moderate', tone: 'fair' }
      : index <= 150
        ? { label: 'Poor for some', tone: 'poor' }
        : { label: index <= 200 ? 'Poor' : 'Very poor', tone: 'bad' };

export type WeatherKind =
  'clear' | 'partly' | 'cloudy' | 'fog' | 'drizzle' | 'rain' | 'snow' | 'storm';

/** WMO weather codes, as Open-Meteo reports them. */
const CODES: Readonly<Record<number, [string, WeatherKind]>> = {
  0: ['Clear sky', 'clear'],
  1: ['Mainly clear', 'clear'],
  2: ['Partly cloudy', 'partly'],
  3: ['Overcast', 'cloudy'],
  45: ['Fog', 'fog'],
  48: ['Rime fog', 'fog'],
  51: ['Light drizzle', 'drizzle'],
  53: ['Drizzle', 'drizzle'],
  55: ['Heavy drizzle', 'drizzle'],
  56: ['Freezing drizzle', 'drizzle'],
  57: ['Freezing drizzle', 'drizzle'],
  61: ['Light rain', 'rain'],
  63: ['Rain', 'rain'],
  65: ['Heavy rain', 'rain'],
  66: ['Freezing rain', 'rain'],
  67: ['Freezing rain', 'rain'],
  71: ['Light snow', 'snow'],
  73: ['Snow', 'snow'],
  75: ['Heavy snow', 'snow'],
  77: ['Snow grains', 'snow'],
  80: ['Rain showers', 'rain'],
  81: ['Rain showers', 'rain'],
  82: ['Violent showers', 'rain'],
  85: ['Snow showers', 'snow'],
  86: ['Snow showers', 'snow'],
  95: ['Thunderstorm', 'storm'],
  96: ['Thunderstorm, hail', 'storm'],
  99: ['Thunderstorm, hail', 'storm']
};

export const describeWeather = (code: number): { label: string; kind: WeatherKind } => {
  const [label, kind] = CODES[code] ?? ['Unknown', 'cloudy'];
  return { label, kind };
};
