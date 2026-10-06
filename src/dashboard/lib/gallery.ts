/**
 * What the widget gallery knows beyond how to draw its examples.
 */
import type { Widget } from './model';

/** The place the Weather example is of. It is the example's, not the visitor's. */
export const SAMPLE_PLACE = 'Cape Town, South Africa';

/**
 * Whether a widget handed over with settings from the gallery still needs something only its
 * owner knows. The gallery can't hold a GitHub token, and a weather widget still set to the
 * example's place was never given one of the visitor's own.
 */
export const needsSetup = (widget: Widget): boolean =>
  (widget.type === 'prs' && !widget.token) ||
  (widget.type === 'weather' &&
    widget.location.trim().toLowerCase() === SAMPLE_PLACE.toLowerCase());
