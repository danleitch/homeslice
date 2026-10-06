import { describe, expect, it } from 'vitest';
import { formatTime, offsetMinutes, utcOffsetLabel } from './time';

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

describe('offsetMinutes', () => {
  it('is how far a zone is ahead of UTC at that moment, daylight saving included', () => {
    expect(offsetMinutes(afternoon, 'UTC')).toBe(0);
    expect(offsetMinutes(afternoon, 'Asia/Tokyo')).toBe(540);
    expect(offsetMinutes(afternoon, 'America/New_York')).toBe(-300);
    expect(offsetMinutes(new Date('2026-07-15T14:05:00Z'), 'America/New_York')).toBe(-240);
    expect(offsetMinutes(afternoon, 'Asia/Kolkata')).toBe(330);
  });

  it('is null for a zone the browser does not know', () => {
    expect(offsetMinutes(afternoon, 'Not/A_Zone')).toBeNull();
  });

  it('is the same at any second of the minute', () => {
    for (const second of ['00', '01', '29', '30', '31', '59']) {
      const moment = new Date(`2026-01-15T14:05:${second}.750Z`);

      expect(offsetMinutes(moment, 'America/New_York'), second).toBe(-300);
      expect(offsetMinutes(moment, 'Asia/Kolkata'), second).toBe(330);
      expect(utcOffsetLabel(moment, 'Europe/Sarajevo'), second).toBe('UTC+1');
    }
  });
});

describe('utcOffsetLabel', () => {
  it('writes the offset as hours from UTC, with a real minus sign', () => {
    expect(utcOffsetLabel(afternoon, 'Asia/Tokyo')).toBe('UTC+9');
    expect(utcOffsetLabel(afternoon, 'America/New_York')).toBe('UTC−5');
    expect(utcOffsetLabel(new Date('2026-07-15T14:05:00Z'), 'America/New_York')).toBe('UTC−4');
  });

  it('keeps the minutes of a zone that is not a whole hour out', () => {
    expect(utcOffsetLabel(afternoon, 'Asia/Kolkata')).toBe('UTC+5:30');
    expect(utcOffsetLabel(afternoon, 'Asia/Kathmandu')).toBe('UTC+5:45');
    expect(utcOffsetLabel(afternoon, 'America/St_Johns')).toBe('UTC−3:30');
  });

  it('is just UTC at UTC, and empty for a zone that does not exist', () => {
    expect(utcOffsetLabel(afternoon, 'UTC')).toBe('UTC');
    expect(utcOffsetLabel(afternoon, 'Not/A_Zone')).toBe('');
  });
});
