import { describe, expect, it } from 'vitest';
import nginx from '../../../nginx.conf?raw';
import { ADDRESS_PATTERN, normaliseAddress } from './calendar-address';

const PRIVATE =
  'https://calendar.google.com/calendar/ical/dan%40example.com/private-4f9a8c1d2e3b4a5c6d7e8f9a0b1c2d3e/basic.ics';
const PUBLIC = 'https://calendar.google.com/calendar/ical/dan%40example.com/public/basic.ics';
const HOLIDAYS =
  'https://calendar.google.com/calendar/ical/en.usa%23holiday%40group.v.calendar.google.com/public/basic.ics';

describe('normaliseAddress', () => {
  it.each([PRIVATE, PUBLIC, HOLIDAYS])('accepts %s', (address) => {
    expect(normaliseAddress(address)).toBe(address);
  });

  it('trims what was pasted', () => {
    expect(normaliseAddress(`  ${PRIVATE}\n`)).toBe(PRIVATE);
  });

  it('reads the webcal form as the https address it stands for', () => {
    expect(normaliseAddress(PRIVATE.replace('https://', 'webcal://'))).toBe(PRIVATE);
    expect(normaliseAddress(PUBLIC.replace('https://', 'WEBCALS://'))).toBe(PUBLIC);
  });

  it.each([
    ['nothing', ''],
    ['a word', 'my calendar'],
    ['the calendar’s page', 'https://calendar.google.com/calendar/u/0/r'],
    ['the embed address', 'https://calendar.google.com/calendar/embed?src=dan%40example.com'],
    ['plain http', PRIVATE.replace('https:', 'http:')],
    ['another site', PRIVATE.replace('calendar.google.com', 'example.com')],
    ['a lookalike host', PRIVATE.replace('calendar.google.com', 'calendar.google.com.example.com')],
    [
      'a host with a login in front',
      PRIVATE.replace('https://', 'https://calendar.google.com@example.com/#')
    ],
    ['another path', PRIVATE.replace('/basic.ics', '/other.ics')],
    ['a trailing query', `${PRIVATE}?x=1`],
    ['a second address', `${PRIVATE} ${PUBLIC}`],
    ['a line break in the middle', PRIVATE.replace('/private', '\n/private')],
    ['a script', 'javascript:alert(1)']
  ])('refuses %s', (_name, address) => {
    expect(normaliseAddress(address)).toBeNull();
  });
});

describe('the rule nginx.conf holds', () => {
  /** The pattern in nginx's map, as a JavaScript one. */
  const inNginx = (): RegExp => {
    const line = nginx.split('\n').find((text) => text.trim().startsWith('"~^https://calendar'));
    const source = line
      ?.trim()
      .replace(/^"~/, '')
      .replace(/"\s+1;$/, '');

    if (!source) {
      throw new Error('nginx.conf has no calendar address rule');
    }

    return new RegExp(source);
  };

  it('is the same rule as the page’s', () => {
    // JavaScript escapes the slashes in a pattern's source; nginx does not.
    expect(inNginx().source.replace(/\\\//g, '/')).toBe(
      ADDRESS_PATTERN.source.replace(/\\\//g, '/')
    );
  });

  it('answers the same for any address', () => {
    for (const address of [
      PRIVATE,
      PUBLIC,
      HOLIDAYS,
      `${PRIVATE}?x=1`,
      'https://example.com/x.ics'
    ]) {
      expect(inNginx().test(address)).toBe(ADDRESS_PATTERN.test(address));
    }
  });
});
