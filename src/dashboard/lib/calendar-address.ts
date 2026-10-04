/**
 * Which calendar addresses this dashboard will fetch. A calendar added in the
 * Agenda's settings is sent to the server, which fetches it on the page's
 * behalf, so the server has to be strict about what it will fetch: only
 * Google Calendar's own iCal addresses, which look like
 *
 *   https://calendar.google.com/calendar/ical/<calendar>/<private-token or public>/basic.ics
 *
 * nginx.conf and vite.config.ts enforce the same rule, and a test keeps the
 * copy in nginx.conf the same as this one.
 */
export const ADDRESS_PATTERN =
  /^https:\/\/calendar\.google\.com\/calendar\/ical\/[A-Za-z0-9._%-]+\/(?:private-[A-Za-z0-9]+|public)\/basic\.ics$/;

/** The header the page puts an address in, so it stays out of URLs and access logs. */
export const ADDRESS_HEADER = 'X-Calendar-Url';

/** Where the page asks for a calendar it holds the address of. */
export const FEED_RELAY = '/api/calendar/feed';

/**
 * A pasted address as the server will have it, or null when it is not a
 * Google Calendar iCal address. Apple's "webcal" form is the same address.
 */
export const normaliseAddress = (value: string): string | null => {
  const address = value.trim().replace(/^webcals?:\/\//i, 'https://');
  return ADDRESS_PATTERN.test(address) ? address : null;
};
