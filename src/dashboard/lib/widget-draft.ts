/**
 * A widget's settings as they are edited, and what they become when they are kept: checked, so
 * that nothing a visitor typed can leave a widget that can't work, and tidied. The widget's
 * dialog and the gallery both keep a widget this way.
 */
import { readCalendarSources } from './agenda';
import { normalizeCalendarAddress } from './calendar-address';
import { isSealed } from './calendar-secret';
import { languageSlug } from './github';
import type { ClockZone, Widget } from './model';
import { findPlaces, isPlaceName } from './places';
import { isToken, readToken } from './pulls';
import { normalizeSymbol } from './tokens';

const isZone = (zone: string): boolean => {
  try {
    new Intl.DateTimeFormat('en', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
};

/**
 * What typed text means as a clock's zone. A place's name finds its zone ("Boston" keeps time by
 * America/New_York, and labels the row Boston unless it has a label of its own); an IANA name
 * is left as it is. "EST" is a zone to the browser, but one with no daylight saving, so a word
 * with no slash goes to the place search first.
 */
const resolveZone = (zone: ClockZone): ClockZone => {
  const text = zone.zone.trim();

  if (!text || text.includes('/')) {
    return zone;
  }

  const place = findPlaces(text, 1)[0];

  return place
    ? {
        zone: place.zone,
        label: zone.label.trim() && !isPlaceName(zone.label) ? zone.label : place.name
      }
    : zone;
};

/** What is wrong with a draft, in words for the visitor, or an empty string. */
export const draftProblem = (draft: Widget): string => {
  if (draft.type === 'weather' && !draft.location.trim()) {
    return 'Choose a place.';
  }

  if (draft.type === 'clock') {
    // Blank rows are left out when it is kept, so only a zone that was actually typed can be wrong.
    const bad = draft.zones.map(resolveZone).find((zone) => zone.zone.trim() && !isZone(zone.zone));

    if (bad) {
      return `“${bad.zone}” isn’t a place or a time zone. Try a city, or a name like Europe/Paris.`;
    }
  }

  if (draft.type === 'prs' && draft.token.trim() && !isToken(draft.token)) {
    return 'That doesn’t look like a GitHub token. It is letters, numbers and underscores, 20 or more of them, like github_pat_… or ghp_…';
  }

  if (draft.type === 'agenda') {
    // Blank rows are left out when it is kept, so only an address that was actually typed can be
    // wrong. An address that was saved is sealed, and can't be wrong; one typed here is checked.
    const typed = draft.calendars
      .map((calendar) => calendar.url.trim())
      .filter((url) => url && !isSealed(url));

    if (typed.some((address) => !normalizeCalendarAddress(address))) {
      return 'That isn’t a Google Calendar secret address in iCal format. It starts with https://calendar.google.com/calendar/ical/ and ends in /basic.ics.';
    }
  }

  return '';
};

/** A draft as it is kept: tidied, with blank rows gone. Call it on a draft with no problem. */
export const tidyWidget = (draft: Widget): Widget => {
  switch (draft.type) {
    case 'markets':
      return {
        ...draft,
        symbols: draft.symbols
          .map((item) => ({ symbol: normalizeSymbol(item.symbol), name: item.name.trim() }))
          .filter((item) => item.symbol)
      };
    case 'clock':
      return { ...draft, zones: draft.zones.map(resolveZone).filter((zone) => zone.zone.trim()) };
    case 'weather':
      return { ...draft, location: draft.location.trim() };
    case 'github':
      return { ...draft, language: languageSlug(draft.language) };
    case 'prs':
      return { ...draft, token: readToken(draft.token) };
    case 'agenda':
      return { ...draft, calendars: readCalendarSources(draft.calendars) };
    default:
      return draft;
  }
};

/**
 * A widget as the gallery hands it to the board. What only the examples have is left behind: the
 * sample tasks and note, the sample calendars and the sample token are not the visitor's.
 */
export const forBoard = (widget: Widget): Widget => {
  switch (widget.type) {
    case 'notes':
      return { ...widget, items: [], text: '' };
    case 'agenda':
      return { ...widget, calendars: [] };
    case 'prs':
      return { ...widget, token: '' };
    default:
      return widget;
  }
};
