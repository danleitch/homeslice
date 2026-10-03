import type { JSX } from 'react';
import { formatTime } from '../lib/time';
import { useNow } from '../hooks/use-now';
import type {
  CalendarWidget as CalendarWidgetConfig,
  ClockWidget as ClockWidgetConfig,
  HourFormat
} from '../lib/model';
import { WidgetState } from './widget-frame';

/** Minutes a zone is ahead of UTC at a moment. */
const offsetMinutes = (date: Date, timeZone: string): number | null => {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    }).formatToParts(date);
    const get = (type: string): number => Number(parts.find((part) => part.type === type)?.value);
    const asUtc = Date.UTC(
      get('year'),
      get('month') - 1,
      get('day'),
      get('hour') % 24,
      get('minute')
    );
    return Math.round((asUtc - date.getTime()) / 60_000);
  } catch {
    return null;
  }
};

const relativeOffset = (date: Date, timeZone: string): string => {
  const there = offsetMinutes(date, timeZone);

  if (there === null) {
    return '';
  }

  const difference = there + date.getTimezoneOffset();

  if (difference === 0) {
    return 'Same time';
  }

  const hours = Math.abs(difference) / 60;
  const amount = Number.isInteger(hours) ? `${hours}h` : `${hours.toFixed(1)}h`;
  return `${difference > 0 ? '+' : '−'}${amount}`;
};

const cityOf = (zone: string): string => (zone.split('/').pop() ?? zone).replace(/_/g, ' ');

const dayAt = (date: Date, timeZone: string): string => {
  try {
    return new Intl.DateTimeFormat(undefined, { weekday: 'short', timeZone }).format(date);
  } catch {
    return '';
  }
};

const isDaytime = (date: Date, timeZone: string): boolean => {
  try {
    const hour = Number(
      new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone }).format(date)
    );
    return hour >= 7 && hour < 19;
  } catch {
    return true;
  }
};

export const ClockWidget = ({
  widget,
  clock
}: {
  widget: ClockWidgetConfig;
  clock: HourFormat;
}): JSX.Element => {
  const now = useNow();

  if (widget.zones.length === 0) {
    return <WidgetState>Add a time zone in this widget’s settings.</WidgetState>;
  }

  return (
    <ul className="clk-list">
      {widget.zones.map((zone) => (
        <li key={`${zone.zone}:${zone.label}`} className="clk-row">
          <span
            className={`clk-dot${isDaytime(now, zone.zone) ? ' clk-dot--day' : ''}`}
            aria-hidden="true"
          />
          <span className="clk-place">
            <span className="clk-label">{zone.label || cityOf(zone.zone)}</span>
            <span className="clk-offset">
              {dayAt(now, zone.zone)} · {relativeOffset(now, zone.zone)}
            </span>
          </span>
          <span className="clk-time">{formatTime(now, clock, zone.zone)}</span>
        </li>
      ))}
    </ul>
  );
};

export const CalendarWidget = ({ widget }: { widget: CalendarWidgetConfig }): JSX.Element => {
  const now = useNow();
  const year = now.getFullYear();
  const month = now.getMonth();
  const first = new Date(year, month, 1);
  const days = new Date(year, month + 1, 0).getDate();
  const lead = (first.getDay() - widget.weekStart + 7) % 7;
  const cells = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: days }, (_unused, index) => index + 1)
  ];
  const weekdays = Array.from({ length: 7 }, (_unused, index) =>
    new Date(2024, 0, 7 + widget.weekStart + index).toLocaleDateString(undefined, {
      weekday: 'narrow'
    })
  );

  return (
    <div className="cal">
      <div className="cal-head">
        <span className="cal-month">{now.toLocaleDateString(undefined, { month: 'long' })}</span>
        <span className="cal-year">{year}</span>
      </div>
      <div className="cal-grid" role="grid" aria-label="This month">
        {weekdays.map((day, index) => (
          <span key={`w${index}`} className="cal-weekday">
            {day}
          </span>
        ))}
        {cells.map((day, index) => (
          <span
            key={index}
            className={`cal-day${day === now.getDate() ? ' cal-day--today' : ''}`}
            aria-current={day === now.getDate() ? 'date' : undefined}
          >
            {day ?? ''}
          </span>
        ))}
      </div>
    </div>
  );
};
