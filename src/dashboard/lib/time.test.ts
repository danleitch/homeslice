import { describe, expect, it } from 'vitest';
import { formatTime } from './time';

// 14:05 in Reykjavík and London (UTC+0 and +1 in winter, so UTC itself is used), 23:05 in Tokyo.
const afternoon = new Date('2026-01-15T14:05:00Z');
const midnight = new Date('2026-01-15T00:09:00Z');

describe('formatTime', () => {
  it('writes the 24-hour clock with a leading zero', () => {
    expect(formatTime(afternoon, '24h', 'UTC')).toBe('14:05');
    expect(formatTime(midnight, '24h', 'UTC')).toBe('00:09');
  });

  it('writes the 12-hour clock with am or pm', () => {
    expect(formatTime(afternoon, '12h', 'UTC')).toMatch(/^2:05\s?PM$/i);
    expect(formatTime(midnight, '12h', 'UTC')).toMatch(/^12:09\s?AM$/i);
  });

  it('shows the time in another zone', () => {
    expect(formatTime(afternoon, '24h', 'Asia/Tokyo')).toBe('23:05');
    expect(formatTime(afternoon, '24h', 'America/New_York')).toBe('09:05');
  });

  it('falls back to the visitor’s own zone when none is given', () => {
    expect(formatTime(afternoon, '24h')).toMatch(/^\d{2}:\d{2}$/);
  });

  it('shows dashes for a zone that does not exist, instead of failing', () => {
    expect(formatTime(afternoon, '24h', 'Not/A_Zone')).toBe('--:--');
  });
});
