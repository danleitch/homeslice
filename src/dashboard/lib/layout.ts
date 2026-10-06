/**
 * How the board lays its cards out, as pure functions: the cards in the order
 * they sit, the grid positions the grid library is given, and how a card's
 * height is chosen.
 *
 * A card is a group or a widget. Each has a width in columns; a height in rows
 * if it was set by hand (otherwise it is as tall as what is in it, which only
 * the browser can measure, so that comes in as `fit`); and a place, once it
 * has been dragged somewhere.
 */
import type { LayoutItem } from 'react-grid-layout/core';
import {
  GRID_COLUMNS,
  GRID_GAP,
  MAX_ROWS,
  MIN_ROWS,
  MIN_SPAN,
  ROW_PX,
  minSpanOf,
  type BoardPage
} from './model';

export type CardKind = 'widget' | 'group';

export type Card = {
  /** `widget:<id>` or `group:<id>`; the same key the grid library knows the card by. */
  key: string;
  kind: CardKind;
  id: string;
  width: number;
  /** The fewest columns it may take; a group's is MIN_SPAN. */
  minWidth?: number;
  /** Rows, when the card was given a height. */
  height?: number;
  column?: number;
  row?: number;
  /** A folded group is only its header, whatever height it was given. */
  collapsed: boolean;
};

/** What a card is guessed to need before the browser has measured it. */
export const GUESS_ROWS = 60;

/** Below this many pixels the board stops being a grid and simply stacks its cards. */
export const FLOW_BELOW = 900;

export const cardKey = (kind: CardKind, id: string): string => `${kind}:${id}`;

/** The page's widgets, then its groups. */
export const cardsOf = (page: BoardPage): Card[] => [
  ...page.widgets.map((widget): Card => ({
    key: cardKey('widget', widget.id),
    kind: 'widget',
    id: widget.id,
    width: widget.width,
    minWidth: minSpanOf(widget.type),
    height: widget.height,
    column: widget.column,
    row: widget.row,
    collapsed: false
  })),
  ...page.groups.map((group): Card => ({
    key: cardKey('group', group.id),
    kind: 'group',
    id: group.id,
    width: group.width,
    height: group.height,
    column: group.column,
    row: group.row,
    collapsed: group.collapsed
  }))
];

/** Whether a card is held to a height of its own, rather than fitting its contents. */
export const isFixed = (card: Card): boolean => card.height !== undefined && !card.collapsed;

/** The rows a card this many pixels tall takes, with the gap beneath it. */
export const rowsFor = (pixels: number): number =>
  Math.max(1, Math.ceil((pixels + GRID_GAP) / ROW_PX));

const hasPlace = (card: Card): card is Card & { column: number; row: number } =>
  card.column !== undefined && card.row !== undefined;

/**
 * The cards as the grid library wants them. A card with a place keeps it; the
 * rest are packed in order, left to right, on rows below the placed ones. They
 * only need to start in the right order: the grid pulls every card up into the
 * first gap it fits, so a board that has never been arranged packs like
 * masonry.
 */
export const buildLayout = (
  cards: readonly Card[],
  fit: Readonly<Record<string, number>>
): LayoutItem[] => {
  const sized = cards.map((card) => {
    const minW = card.minWidth ?? MIN_SPAN;
    const w = Math.min(GRID_COLUMNS, Math.max(minW, card.width));
    const h = isFixed(card) ? card.height! : (fit[card.key] ?? GUESS_ROWS);
    return { card, w, minW, h };
  });

  let floor = 0;

  for (const { card, h } of sized) {
    if (hasPlace(card)) {
      floor = Math.max(floor, card.row + h);
    }
  }

  let column = 0;
  let row = floor;

  return sized.map(({ card, w, minW, h }): LayoutItem => {
    let x: number;
    let y: number;

    if (hasPlace(card)) {
      x = Math.min(card.column, GRID_COLUMNS - w);
      y = card.row;
    } else {
      if (column + w > GRID_COLUMNS) {
        column = 0;
        row += 1;
      }

      x = column;
      y = row;
      column += w;
    }

    return {
      i: card.key,
      x,
      y,
      w,
      h,
      minW,
      maxW: GRID_COLUMNS,
      minH: MIN_ROWS,
      maxH: MAX_ROWS,
      ...(card.collapsed ? { isResizable: false } : {})
    };
  });
};

/** The cards in the order a reader meets them: top to bottom, left to right. */
export const inReadingOrder = (
  cards: readonly Card[],
  fit: Readonly<Record<string, number>>
): Card[] => {
  const at = new Map(buildLayout(cards, fit).map((item) => [item.i, item]));

  return [...cards].sort((a, b) => {
    const first = at.get(a.key)!;
    const second = at.get(b.key)!;
    return first.y - second.y || first.x - second.x;
  });
};
