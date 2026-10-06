import { useCallback, type CSSProperties, type JSX } from 'react';
import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudMoon,
  CloudRain,
  CloudSnow,
  CloudSun,
  Droplets,
  Leaf,
  MapPin,
  Moon,
  Sun,
  SunMedium,
  Sunrise,
  Sunset,
  Wind,
  type LucideIcon
} from 'lucide-react';
import { useRemote } from '../hooks/use-remote';
import type { HourFormat, WeatherWidget as WeatherWidgetConfig } from '../lib/model';
import { formatTime } from '../lib/time';
import { airLevel, describeWeather, fetchWeather, uvLevel, type WeatherKind } from '../lib/weather';
import { WidgetSkeleton, WidgetState } from './widget-frame';

const WEATHER_TTL_MS = 30 * 60 * 1000;

const ICONS: Readonly<Record<WeatherKind, [LucideIcon, LucideIcon]>> = {
  clear: [Sun, Moon],
  partly: [CloudSun, CloudMoon],
  cloudy: [Cloud, Cloud],
  fog: [CloudFog, CloudFog],
  drizzle: [CloudDrizzle, CloudDrizzle],
  rain: [CloudRain, CloudRain],
  snow: [CloudSnow, CloudSnow],
  storm: [CloudLightning, CloudLightning]
};

export const WeatherIcon = ({
  code,
  isDay = true,
  size
}: {
  code: number;
  isDay?: boolean;
  size: number;
}): JSX.Element => {
  const { kind, label } = describeWeather(code);
  const Icon = ICONS[kind][isDay ? 0 : 1];

  return (
    <Icon
      className={`wx-icon wx-icon--${kind}${isDay ? '' : ' wx-icon--night'}`}
      size={size}
      strokeWidth={1.6}
      aria-label={label}
    />
  );
};

const hourLabel = (hour: number, format: HourFormat): string => {
  if (format === '24h') {
    return `${String(hour).padStart(2, '0')}:00`;
  }

  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelve}${hour < 12 ? 'am' : 'pm'}`;
};

const unitSymbol = (units: WeatherWidgetConfig['units']): string =>
  units === 'imperial' ? '°F' : '°C';

export const WeatherWidget = ({
  widget,
  clock
}: {
  widget: WeatherWidgetConfig;
  clock: HourFormat;
}): JSX.Element => {
  const { uv, air } = widget;
  const load = useCallback(
    (signal: AbortSignal) => fetchWeather(widget.location, widget.units, signal, { uv, air }),
    [widget.location, widget.units, uv, air]
  );
  // The UV and the air are read only when they are shown, and are different readings: the sun's
  // times come with the forecast anyway, so showing them doesn't change the key.
  const { data, error, refresh } = useRemote(
    `weather:${widget.location.toLowerCase()}:${widget.units}${uv ? ':uv' : ''}${air ? ':air' : ''}`,
    WEATHER_TTL_MS,
    load
  );

  if (!widget.location.trim()) {
    return <WidgetState>Choose a place in this widget’s settings.</WidgetState>;
  }

  if (!data) {
    return error ? (
      <WidgetState
        tone="error"
        action={
          <button type="button" className="link-btn" onClick={refresh}>
            Try again
          </button>
        }
      >
        {error}
      </WidgetState>
    ) : (
      <WidgetSkeleton rows={4} />
    );
  }

  const { label } = describeWeather(data.code);
  const place = [data.place.name, data.place.country].filter(Boolean).join(', ');
  const showDays = widget.width >= 6 && data.days.length > 0;
  // The first and last columns of daylight round off its glow.
  const dawn = data.columns.findIndex((column) => column.daylight);
  const dusk = data.columns.map((column) => column.daylight).lastIndexOf(true);
  const uvNow = widget.uv && typeof data.uv === 'number' ? uvLevel(data.uv) : null;
  const airNow = widget.air && typeof data.air === 'number' ? airLevel(data.air) : null;
  const sunTimes = widget.sun ? data.sun : undefined;

  return (
    <div className="wx">
      <div className="wx-now">
        <WeatherIcon code={data.code} isDay={data.isDay} size={44} />
        <div className="wx-temp">
          {data.temperature}
          <span className="wx-unit">{unitSymbol(widget.units)}</span>
        </div>
        <div className="wx-summary">
          <span className="wx-label">{label}</span>
          <span className="wx-meta">
            Feels {data.apparent}° · H {data.high}° L {data.low}°
          </span>
        </div>
      </div>

      <div className="wx-columns" role="img" aria-label="Temperatures through the day">
        {data.columns.map((column, index) => (
          <div
            key={column.hour}
            className={[
              'wx-col',
              index === data.currentColumn && 'wx-col--now',
              column.daylight && 'wx-col--day',
              index === dawn && 'wx-col--dawn',
              index === dusk && 'wx-col--dusk',
              // Every third hour is labelled, unless it would crowd the one now.
              index % 3 === 2 && Math.abs(index - data.currentColumn) > 1 && 'wx-col--label',
              column.rain && 'wx-col--rain'
            ]
              .filter(Boolean)
              .join(' ')}
            style={{ '--h': column.scale } as CSSProperties}
          >
            <span className="wx-col-value">{column.temperature}°</span>
            <span className="wx-bar" />
            <span className="wx-col-time">{hourLabel(column.hour, clock)}</span>
          </div>
        ))}
      </div>

      {showDays && (
        <ul className="wx-days">
          {data.days.map((day) => (
            <li key={day.date}>
              <span>
                {new Date(`${day.date}T12:00:00Z`).toLocaleDateString(undefined, {
                  weekday: 'short',
                  timeZone: 'UTC'
                })}
              </span>
              <WeatherIcon code={day.code} size={18} />
              <span className="wx-range">
                {day.high}° <small>{day.low}°</small>
              </span>
            </li>
          ))}
        </ul>
      )}

      {(sunTimes || uvNow || airNow) && (
        <ul className="wx-facts" aria-label="Sun and air">
          {sunTimes && (
            <>
              <li title="Sunrise">
                <Sunrise size={14} aria-hidden="true" />
                <span className="visually-hidden">Sunrise </span>
                {formatTime(new Date(sunTimes.rise), clock, data.place.timezone)}
              </li>
              <li title="Sunset">
                <Sunset size={14} aria-hidden="true" />
                <span className="visually-hidden">Sunset </span>
                {formatTime(new Date(sunTimes.set), clock, data.place.timezone)}
              </li>
            </>
          )}
          {uvNow && (
            <li data-tone={uvNow.tone} title="The highest UV index today">
              <SunMedium size={14} aria-hidden="true" />
              UV {data.uv} <small>{uvNow.label}</small>
            </li>
          )}
          {airNow && (
            <li data-tone={airNow.tone} title="US air quality index">
              <Leaf size={14} aria-hidden="true" />
              Air {data.air} <small>{airNow.label}</small>
            </li>
          )}
        </ul>
      )}

      <div className="wx-foot">
        <span className="wx-place">
          <MapPin size={12} aria-hidden="true" />
          {place}
        </span>
        <span className="wx-extra">
          <span title="Humidity">
            <Droplets size={12} aria-hidden="true" />
            {data.humidity}%
          </span>
          <span title="Wind">
            <Wind size={12} aria-hidden="true" />
            {data.wind} {widget.units === 'imperial' ? 'mph' : 'km/h'}
          </span>
        </span>
      </div>
    </div>
  );
};
