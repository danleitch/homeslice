/**
 * What the widget gallery knows beyond how to draw its examples.
 */
import { createWidget, type Widget, type WidgetType } from './model';

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

/** The kinds the gallery can narrow to; every widget is in one, so none can be filtered away. */
export type GalleryGroup = { id: string; label: string; types: readonly WidgetType[] };

export const GALLERY_GROUPS: readonly GalleryGroup[] = [
  { id: 'time', label: 'Time and notes', types: ['clock', 'focus', 'calendar', 'agenda', 'notes'] },
  { id: 'everyday', label: 'Everyday', types: ['weather', 'markets', 'news'] },
  { id: 'developer', label: 'Developer', types: ['hackernews', 'github', 'prs', 'benchlm'] },
  { id: 'watch', label: 'Watch', types: ['tv', 'movies'] }
];

/** A few widgets that go together, added in one step. */
export type Pack = {
  id: string;
  name: string;
  blurb: string;
  /** The widgets as they are added. Each is given an id of its own when it is. */
  widgets: readonly Widget[];
};

const make = <T extends WidgetType>(
  type: T,
  patch: Partial<Extract<Widget, { type: T }>> = {}
): Widget => ({ ...createWidget(type), ...patch }) as Widget;

/**
 * Widths that fill a row of the board, which is twelve columns across, so a pack tiles
 * rather than leaving a gap.
 */
export const PACKS: readonly Pack[] = [
  {
    id: 'dev-morning',
    name: 'Dev morning',
    blurb: 'The reviews waiting on you, what everyone is starring, and the front page.',
    widgets: [make('prs'), make('github'), make('hackernews')]
  },
  {
    id: 'planner',
    name: 'Planner',
    blurb: 'The month and what is coming up, a focus timer, and the time where your people are.',
    widgets: [make('agenda', { width: 6 }), make('focus'), make('clock', { width: 3 })]
  },
  {
    id: 'catch-up',
    name: 'Catch up',
    blurb: 'Headlines, the markets and the weather, to start the day.',
    widgets: [make('news'), make('markets'), make('weather')]
  },
  {
    id: 'crypto',
    name: 'Crypto watch',
    blurb: 'Bitcoin, Ether and Solana, with room to follow a token of your own by its address.',
    widgets: [
      make('markets', {
        symbols: [
          { symbol: 'BTC-USD', name: 'Bitcoin' },
          { symbol: 'ETH-USD', name: 'Ethereum' },
          { symbol: 'SOL-USD', name: 'Solana' }
        ]
      })
    ]
  },
  {
    id: 'movie-night',
    name: 'Movie night',
    blurb: 'What everyone is watching, on TV and at the cinema.',
    widgets: [make('movies', { width: 6 }), make('tv', { width: 6 })]
  }
];

/** How many widgets of each kind a page has. */
export const countByType = (widgets: readonly Widget[]): Partial<Record<WidgetType, number>> => {
  const counts: Partial<Record<WidgetType, number>> = {};

  for (const widget of widgets) {
    counts[widget.type] = (counts[widget.type] ?? 0) + 1;
  }

  return counts;
};
