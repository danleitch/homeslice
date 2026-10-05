import { describe, expect, it } from 'vitest';
import {
  GUESS_ROWS,
  buildLayout,
  cardKey,
  cardsOf,
  inReadingOrder,
  isFixed,
  rowsFor,
  type Card
} from './layout';
import {
  GRID_COLUMNS,
  GRID_GAP,
  MAX_ROWS,
  MIN_ROWS,
  MIN_SPAN,
  ROW_PX,
  pageOf,
  sanitizeConfig
} from './model';

const card = (overrides: Partial<Card> = {}): Card => ({
  key: 'group:a',
  kind: 'group',
  id: 'a',
  width: 4,
  collapsed: false,
  ...overrides
});

const at = (layout: ReturnType<typeof buildLayout>, key: string) =>
  layout.find((item) => item.i === key)!;

describe('the cards of a page', () => {
  it('keys a card by what it is and its id', () => {
    expect(cardKey('group', 'x1')).toBe('group:x1');
    expect(cardKey('widget', 'x1')).toBe('widget:x1');
  });

  it('lists the widgets, then the groups, with what each says about its size and place', () => {
    const page = pageOf(
      sanitizeConfig({
        widgets: [{ type: 'calendar', width: 3, height: 60, column: 8, row: 2 }],
        groups: [
          { name: 'A', width: 6, bookmarks: [] },
          { name: 'B', collapsed: true, bookmarks: [] }
        ]
      }),
      0
    );

    const cards = cardsOf(page);

    expect(cards.map((item) => [item.kind, item.width, item.collapsed])).toEqual([
      ['widget', 3, false],
      ['group', 6, false],
      ['group', 4, true]
    ]);
    expect(cards[0]).toMatchObject({
      key: `widget:${page.widgets[0]!.id}`,
      id: page.widgets[0]!.id,
      height: 60,
      column: 8,
      row: 2
    });
    expect(cards[1]).toMatchObject({ key: `group:${page.groups[0]!.id}` });
    expect(cards[1]!.height).toBeUndefined();
  });

  it('is empty for an empty page', () => {
    expect(cardsOf({ widgets: [], groups: [] })).toEqual([]);
  });
});

describe('how tall a card is held to be', () => {
  it('is fixed once it has a height', () => {
    expect(isFixed(card({ height: 60 }))).toBe(true);
    expect(isFixed(card())).toBe(false);
  });

  it('is never fixed while folded: it is only its header then', () => {
    expect(isFixed(card({ height: 60, collapsed: true }))).toBe(false);
  });

  it('takes the rows its pixels need, with the gap beneath it', () => {
    expect(rowsFor(200)).toBe(Math.ceil((200 + GRID_GAP) / ROW_PX));
    expect(rowsFor(201)).toBe(Math.ceil((201 + GRID_GAP) / ROW_PX));
    expect(rowsFor(0)).toBe(Math.ceil(GRID_GAP / ROW_PX));
  });

  it('never takes less than one row', () => {
    expect(rowsFor(-500)).toBe(1);
  });
});

describe('the layout the grid is given', () => {
  it('has an item for every card, with the limits resizing keeps to', () => {
    const layout = buildLayout([card(), card({ key: 'widget:b', kind: 'widget', id: 'b' })], {});

    expect(layout).toHaveLength(2);
    expect(at(layout, 'group:a')).toMatchObject({
      w: 4,
      minW: MIN_SPAN,
      maxW: GRID_COLUMNS,
      minH: MIN_ROWS,
      maxH: MAX_ROWS
    });
  });

  it('is empty for no cards', () => {
    expect(buildLayout([], {})).toEqual([]);
  });

  describe('height', () => {
    it('is the height a card was given', () => {
      expect(at(buildLayout([card({ height: 90 })], { 'group:a': 20 }), 'group:a').h).toBe(90);
    });

    it('is what the browser measured, when it has not been given one', () => {
      expect(at(buildLayout([card()], { 'group:a': 33 }), 'group:a').h).toBe(33);
    });

    it('is a guess until it has been measured', () => {
      expect(at(buildLayout([card()], {}), 'group:a').h).toBe(GUESS_ROWS);
    });

    it('is the measure, not the height it was given, for a card folded to its header', () => {
      const folded = card({ height: 90, collapsed: true });

      expect(at(buildLayout([folded], { 'group:a': 12 }), 'group:a').h).toBe(12);
    });
  });

  describe('width', () => {
    it.each([
      [1, MIN_SPAN],
      [5, 5],
      [40, GRID_COLUMNS]
    ])('is %i columns wide as %i, kept within the board', (width, expected) => {
      expect(at(buildLayout([card({ width })], {}), 'group:a').w).toBe(expected);
    });
  });

  describe('a card that has been put somewhere', () => {
    it('keeps its place', () => {
      const layout = buildLayout([card({ column: 5, row: 17 })], {});

      expect(at(layout, 'group:a')).toMatchObject({ x: 5, y: 17 });
    });

    it('is moved left when its width would carry it off the right edge', () => {
      const layout = buildLayout([card({ width: 6, column: 10, row: 0 })], {});

      expect(at(layout, 'group:a').x).toBe(GRID_COLUMNS - 6);
    });

    it('is not a place unless it has a column and a row both', () => {
      const layout = buildLayout([card({ column: 5 }), card({ key: 'g:b', id: 'b', row: 9 })], {});

      expect(at(layout, 'group:a')).toMatchObject({ x: 0 });
      expect(at(layout, 'g:b')).toMatchObject({ x: 4 });
    });
  });

  describe('a card with no place', () => {
    const four = (): Card[] =>
      ['a', 'b', 'c', 'd'].map((id) => card({ key: `group:${id}`, id, width: 4 }));

    it('is packed left to right, a row at a time, in order', () => {
      const layout = buildLayout(four(), {});

      expect(layout.map((item) => [item.x, item.y])).toEqual([
        [0, 0],
        [4, 0],
        [8, 0],
        [0, 1]
      ]);
    });

    it('starts a new row when the next card does not fit beside the last', () => {
      const layout = buildLayout(
        [card({ width: 8 }), card({ key: 'group:b', id: 'b', width: 6 })],
        {}
      );

      expect(at(layout, 'group:b')).toMatchObject({ x: 0, y: 1 });
    });

    it('waits its turn below every card that has a place', () => {
      const placed = card({ key: 'group:p', id: 'p', column: 0, row: 5, height: 20 });
      const layout = buildLayout([card(), placed], {});

      expect(at(layout, 'group:a')).toMatchObject({ x: 0, y: 25 });
      expect(at(layout, 'group:p')).toMatchObject({ x: 0, y: 5 });
    });
  });

  it('cannot be resized when the card is folded, and says nothing of it otherwise', () => {
    const layout = buildLayout([card({ collapsed: true }), card({ key: 'group:b', id: 'b' })], {});

    expect(at(layout, 'group:a').isResizable).toBe(false);
    expect(at(layout, 'group:b')).not.toHaveProperty('isResizable');
  });
});

describe('the order the cards read in', () => {
  it('is top to bottom, then left to right', () => {
    const cards = [
      card({ key: 'group:low', id: 'low', column: 0, row: 30 }),
      card({ key: 'group:right', id: 'right', column: 6, row: 0 }),
      card({ key: 'group:left', id: 'left', column: 0, row: 0 })
    ];

    expect(inReadingOrder(cards, {}).map((item) => item.id)).toEqual(['left', 'right', 'low']);
  });

  it('keeps the order of cards with no place, which are packed in order', () => {
    const cards = ['x', 'y', 'z'].map((id) => card({ key: `group:${id}`, id, width: 4 }));

    expect(inReadingOrder(cards, {}).map((item) => item.id)).toEqual(['x', 'y', 'z']);
  });

  it('puts cards that have no place after those that do', () => {
    const cards = [
      card({ key: 'group:new', id: 'new' }),
      card({ key: 'group:old', id: 'old', column: 8, row: 12 })
    ];

    expect(inReadingOrder(cards, {}).map((item) => item.id)).toEqual(['old', 'new']);
  });

  it('leaves the cards it was given as they were', () => {
    const cards = [
      card({ column: 0, row: 9 }),
      card({ key: 'group:b', id: 'b', column: 0, row: 1 })
    ];

    inReadingOrder(cards, {});

    expect(cards.map((item) => item.id)).toEqual(['a', 'b']);
  });
});
