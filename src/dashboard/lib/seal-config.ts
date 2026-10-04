/**
 * Seals the calendar addresses a dashboard holds as typed: ones saved before
 * addresses were sealed, and ones that arrive in an imported or hand-edited
 * file. The widget's settings seal what is typed there; this is for the rest.
 */
import { isSealed } from './calendar-secret';
import type { DashboardConfig } from './model';

/** Every address in the dashboard that is still as it was typed, each once. */
export const plainCalendarUrls = (config: DashboardConfig): string[] => [
  ...new Set(
    config.pages.flatMap((page) =>
      page.widgets.flatMap((widget) =>
        widget.type === 'agenda'
          ? widget.calendars.map((calendar) => calendar.url).filter((url) => !isSealed(url))
          : []
      )
    )
  )
];

/**
 * The dashboard with each address in `sealed` swapped for its sealed form, or the very same
 * dashboard when none is there to swap, which is how a change is told from none.
 */
export const withSealedCalendars = (
  config: DashboardConfig,
  sealed: ReadonlyMap<string, string>
): DashboardConfig => {
  let changed = false;

  const pages = config.pages.map((page) => {
    let pageChanged = false;

    const widgets = page.widgets.map((widget) => {
      if (
        widget.type !== 'agenda' ||
        !widget.calendars.some((calendar) => sealed.has(calendar.url))
      ) {
        return widget;
      }

      pageChanged = true;
      return {
        ...widget,
        calendars: widget.calendars.map((calendar) => ({
          ...calendar,
          url: sealed.get(calendar.url) ?? calendar.url
        }))
      };
    });

    changed ||= pageChanged;
    return pageChanged ? { ...page, widgets } : page;
  });

  return changed ? { ...config, pages } : config;
};
