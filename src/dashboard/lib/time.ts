import type { HourFormat } from './model';

/** A time of day in the visitor's chosen clock, optionally in another zone. */
export const formatTime = (date: Date, format: HourFormat, timeZone?: string): string => {
  try {
    return new Intl.DateTimeFormat(undefined, {
      hour: format === '12h' ? 'numeric' : '2-digit',
      minute: '2-digit',
      hourCycle: format === '12h' ? 'h12' : 'h23',
      timeZone
    }).format(date);
  } catch {
    return '--:--';
  }
};

/** Minutes a zone is ahead of UTC at a moment; null for a zone the browser doesn't know. */
export const offsetMinutes = (date: Date, timeZone: string): number | null => {
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
    // The zone's clock is read to the minute, so the moment must be too: with seconds left on it,
    // an offset of four hours comes out a minute short, and a "UTC−4" reads "UTC−4:01".
    const minute = Math.floor(date.getTime() / 60_000) * 60_000;
    return Math.round((asUtc - minute) / 60_000);
  } catch {
    return null;
  }
};

/** A zone's offset from UTC at a moment, as "UTC−5" or "UTC+5:30"; empty if the zone is unknown. */
export const utcOffsetLabel = (date: Date, timeZone: string): string => {
  const minutes = offsetMinutes(date, timeZone);

  if (minutes === null || Number.isNaN(minutes)) {
    return '';
  }

  if (minutes === 0) {
    return 'UTC';
  }

  const hours = Math.floor(Math.abs(minutes) / 60);
  const rest = Math.abs(minutes) % 60;

  return `UTC${minutes < 0 ? '−' : '+'}${hours}${rest ? `:${String(rest).padStart(2, '0')}` : ''}`;
};
