import { describe, expect, it } from 'vitest';
import {
  addBookmark,
  addGroup,
  addWidget,
  addWidgets,
  arrayMove,
  deleteGroup,
  fitCard,
  mergeGroups,
  moveBookmark,
  moveGroup,
  placeCards,
  updateGroup,
  updateWidget
} from './edit';
import {
  MAX_ROWS,
  MIN_ROWS,
  createWidget,
  pageOf,
  sanitizeConfig,
  type PageConfig,
  type Widget,
  type WidgetType
} from './model';

const board = (): PageConfig =>
  pageOf(
    sanitizeConfig({
      widgets: [{ type: 'weather', location: 'Oslo' }],
      groups: [
        {
          name: 'Code',
          bookmarks: [
            { name: 'GitHub', url: 'https://github.com' },
            { name: 'GitLab', url: 'https://gitlab.com' },
            { name: 'npm', url: 'https://npmjs.com' }
          ]
        },
        { name: 'Read', bookmarks: [{ name: 'HN', url: 'https://news.ycombinator.com' }] }
      ]
    }),
    0
  );

const names = (config: PageConfig): string[][] =>
  config.groups.map((group) => group.bookmarks.map((bookmark) => bookmark.name));

describe('board edits', () => {
  it('moves items within a list', () => {
    expect(arrayMove(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a']);
    expect(arrayMove(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b']);
  });

  it('reorders a bookmark inside its group', () => {
    const config = board();
    const github = config.groups[0].bookmarks[0];

    expect(
      names({ ...config, groups: moveBookmark(config.groups, github.id, config.groups[0].id, 2) })
    ).toEqual([['GitLab', 'npm', 'GitHub'], ['HN']]);
  });

  it('leaves the groups as they were when the bookmark to move is not there', () => {
    const config = board();
    const moved = moveBookmark(config.groups, 'no-such-bookmark', config.groups[1].id, 0);

    expect(moved).toEqual(config.groups);
    expect(moved).not.toBe(config.groups);
  });

  it('carries a bookmark across to another group, at the place it was dropped', () => {
    const config = board();
    const npm = config.groups[0].bookmarks[2];

    expect(
      names({ ...config, groups: moveBookmark(config.groups, npm.id, config.groups[1].id, 0) })
    ).toEqual([
      ['GitHub', 'GitLab'],
      ['npm', 'HN']
    ]);
  });

  it('adds a bookmark to a new group by name, and opens a collapsed one it is added to', () => {
    const config = board();
    const collapsed = updateGroup(config, config.groups[1].id, { collapsed: true });
    const intoExisting = addBookmark(
      collapsed,
      { groupId: config.groups[1].id },
      { name: 'Lobsters', url: 'https://lobste.rs', description: '', icon: '' }
    );

    expect(intoExisting.config.groups[1].collapsed).toBe(false);
    expect(names(intoExisting.config)[1]).toEqual(['HN', 'Lobsters']);

    const intoNew = addBookmark(
      config,
      { newGroup: 'Media' },
      { name: 'Plex', url: 'http://plex.lan', description: '', icon: '' }
    );

    expect(intoNew.config.groups[intoNew.config.groups.length - 1]).toMatchObject({
      name: 'Media'
    });
    expect(intoNew.groupId).toBe(intoNew.config.groups[intoNew.config.groups.length - 1].id);
  });

  it('keeps widths on the board when a group or widget is resized', () => {
    const config = board();

    expect(updateGroup(config, config.groups[0].id, { width: 99 }).groups[0].width).toBe(12);
    expect(updateWidget(config, config.widgets[0].id, { width: 1 }).widgets[0].width).toBe(3);
  });

  it('lets Popular TV and Popular Movies narrow to two columns, and no other widget', () => {
    const config = {
      ...board(),
      widgets: ['tv', 'movies', 'weather', 'benchlm'].map((type) =>
        createWidget(type as WidgetType)
      )
    };
    const widthsAfter = (width: number): number[] =>
      config.widgets.map(
        (widget) =>
          updateWidget(config, widget.id, { width }).widgets.find((w) => w.id === widget.id)!.width
      );

    expect(widthsAfter(2)).toEqual([2, 2, 3, 3]);
    expect(widthsAfter(1)).toEqual([2, 2, 3, 3]);
    expect(widthsAfter(6)).toEqual([6, 6, 6, 6]);
  });

  it('never lets a widget change its type through an update', () => {
    const config = board();
    const updated = updateWidget(config, config.widgets[0].id, { type: 'markets' } as never);

    expect(updated.widgets[0].type).toBe('weather');
  });

  it('merges imported groups by name, skipping links already there', () => {
    const config = board();
    const incoming = sanitizeConfig({
      groups: [
        {
          name: 'code',
          bookmarks: [
            { name: 'GitHub again', url: 'https://github.com' },
            { name: 'Bitbucket', url: 'https://bitbucket.org' }
          ]
        },
        { name: 'New', bookmarks: [{ name: 'X', url: 'https://x.example' }] }
      ]
    }).pages[0].groups;

    expect(names(mergeGroups(config, incoming))).toEqual([
      ['GitHub', 'GitLab', 'npm', 'Bitbucket'],
      ['HN'],
      ['X']
    ]);
  });

  it('deletes a group with its bookmarks', () => {
    const config = board();

    expect(names(deleteGroup(config, config.groups[0].id))).toEqual([['HN']]);
  });
});

describe('where the cards sit', () => {
  /** A page with a widget and three groups that have all been put somewhere. */
  const arranged = (): PageConfig =>
    pageOf(
      sanitizeConfig({
        widgets: [{ type: 'calendar', width: 3, column: 0, row: 0 }],
        groups: [
          { name: 'A', width: 4, height: 60, column: 3, row: 0, bookmarks: [] },
          { name: 'B', width: 4, column: 7, row: 0, bookmarks: [] },
          { name: 'C', width: 4, column: 0, row: 40, collapsed: true, height: 60, bookmarks: [] }
        ]
      }),
      0
    );

  const key = (kind: 'group' | 'widget', id: string): string => `${kind}:${id}`;
  const item = (i: string, x: number, y: number, w: number, h: number) => ({ i, x, y, w, h });

  /** Every card of a page, laid out where it already is. */
  const asIs = (page: PageConfig) => [
    ...page.widgets.map((card) =>
      item(key('widget', card.id), card.column!, card.row!, card.width, 30)
    ),
    ...page.groups.map((card) =>
      item(key('group', card.id), card.column!, card.row!, card.width, card.height ?? 30)
    )
  ];

  describe('writing down a drag or resize', () => {
    it('gives every card its column, row and width', () => {
      const page = arranged();
      const [a, b, c] = page.groups;
      const layout = [
        item(key('widget', page.widgets[0]!.id), 0, 0, 3, 30),
        item(key('group', a!.id), 3, 0, 5, 60),
        item(key('group', b!.id), 8, 4, 4, 30),
        item(key('group', c!.id), 0, 40, 4, 60)
      ];

      const next = placeCards(page, layout);

      expect(next.groups.map((card) => [card.name, card.column, card.row, card.width])).toEqual([
        ['A', 3, 0, 5],
        ['B', 8, 4, 4],
        ['C', 0, 40, 4]
      ]);
    });

    it('changes only the height of a card that already has one', () => {
      const page = arranged();
      const [a, b] = page.groups;

      const next = placeCards(page, [
        ...asIs(page).filter(
          (entry) => ![key('group', a!.id), key('group', b!.id)].includes(entry.i)
        ),
        item(key('group', a!.id), 3, 0, 4, 90),
        item(key('group', b!.id), 7, 0, 4, 90)
      ]);

      expect(next.groups[0]!.height).toBe(90);
      // B fits its contents, so what the grid made of it is not written down.
      expect(next.groups[1]).not.toHaveProperty('height');
    });

    it('gives the card that was just pulled taller or shorter a height of its own', () => {
      const page = arranged();
      const b = page.groups[1]!;
      const layout = asIs(page).map((entry) =>
        entry.i === key('group', b.id) ? { ...entry, h: 42 } : entry
      );

      expect(placeCards(page, layout, key('group', b.id)).groups[1]!.height).toBe(42);
      expect(placeCards(page, layout).groups[1]).not.toHaveProperty('height');
    });

    it('leaves a folded group’s height alone, whatever the grid made of it', () => {
      const page = arranged();
      const c = page.groups[2]!;
      const layout = asIs(page).map((entry) =>
        entry.i === key('group', c.id) ? { ...entry, h: 8 } : entry
      );

      expect(placeCards(page, layout, key('group', c.id)).groups[2]!.height).toBe(60);
    });

    it('keeps the groups in the order they now sit, whichever were moved', () => {
      const page = arranged();
      const [a, b] = page.groups;
      // A drops below B, which stays on the first row; C is still furthest down.
      const layout = asIs(page).map((entry) =>
        entry.i === key('group', a!.id) ? { ...entry, x: 0, y: 5 } : entry
      );

      expect(placeCards(page, layout).groups.map((card) => card.name)).toEqual(['B', 'A', 'C']);
      expect(b!.name).toBe('B');
    });

    it('puts a group that moved to the top first', () => {
      const page = arranged();
      const c = page.groups[2]!;
      const layout = asIs(page).map((entry) =>
        entry.i === key('group', c.id) ? { ...entry, x: 0, y: 0 } : entry
      );

      // Every card sits at row 0 now, so it is left to right: C, then A, then B.
      expect(placeCards(page, layout).groups.map((card) => card.name)).toEqual(['C', 'A', 'B']);
    });

    it('returns the page itself when nothing changed', () => {
      const page = arranged();

      expect(placeCards(page, asIs(page))).toBe(page);
    });

    it('leaves alone a card the grid says nothing about', () => {
      const page = arranged();
      const [a, b] = page.groups;

      const next = placeCards(page, [item(key('group', a!.id), 9, 9, 3, 60)]);

      expect(next.groups.find((card) => card.name === 'A')).toMatchObject({
        column: 9,
        row: 9,
        width: 3
      });
      expect(next.groups.find((card) => card.name === 'B')).toBe(b);
      expect(next.widgets[0]).toBe(page.widgets[0]);
    });

    it('places widgets as well', () => {
      const page = arranged();
      const layout = asIs(page).map((entry) =>
        entry.i.startsWith('widget:') ? { ...entry, x: 9, y: 3, w: 3 } : entry
      );

      expect(placeCards(page, layout).widgets[0]).toMatchObject({ column: 9, row: 3, width: 3 });
    });

    it('gives a card with no place the one the grid found for it', () => {
      const page = pageOf(sanitizeConfig({ groups: [{ name: 'New', bookmarks: [] }] }), 0);

      const next = placeCards(page, [item(key('group', page.groups[0]!.id), 4, 7, 4, 30)]);

      expect(next.groups[0]).toMatchObject({ column: 4, row: 7 });
    });
  });

  describe('going back to the height of the contents', () => {
    it('takes a group’s height away, and leaves the rest of it', () => {
      const page = arranged();

      const next = fitCard(page, 'group', page.groups[0]!.id);

      expect(next.groups[0]).not.toHaveProperty('height');
      expect(next.groups[0]).toMatchObject({ name: 'A', column: 3, row: 0 });
    });

    it('does the same for a widget', () => {
      const page = pageOf(
        sanitizeConfig({ widgets: [{ type: 'calendar', height: 90, column: 0, row: 0 }] }),
        0
      );

      const next = fitCard(page, 'widget', page.widgets[0]!.id);

      expect(next.widgets[0]).not.toHaveProperty('height');
      expect(next.widgets[0]).toMatchObject({ column: 0, row: 0 });
    });
  });

  describe('fitting a card that is already fitting', () => {
    it('changes nothing, so there is nothing to save', () => {
      const page = arranged();

      expect(fitCard(page, 'group', page.groups[1]!.id)).toBe(page);
      expect(fitCard(page, 'widget', page.widgets[0]!.id)).toBe(page);
    });

    it('changes nothing for a card that is not there', () => {
      const page = arranged();

      expect(fitCard(page, 'group', 'gone')).toBe(page);
      expect(fitCard(page, 'widget', 'gone')).toBe(page);
    });
  });

  describe('settings that carry a height', () => {
    it('keeps a group’s height within what a card can be', () => {
      const page = arranged();
      const id = page.groups[1]!.id;

      expect(updateGroup(page, id, { height: 1 }).groups[1]!.height).toBe(MIN_ROWS);
      expect(updateGroup(page, id, { height: 99999 }).groups[1]!.height).toBe(MAX_ROWS);
      expect(updateGroup(page, id, { height: 71.6 }).groups[1]!.height).toBe(72);
    });

    it('leaves a group’s place alone when only its name changes', () => {
      const page = arranged();

      expect(updateGroup(page, page.groups[1]!.id, { name: 'Renamed' }).groups[1]).toMatchObject({
        column: 7,
        row: 0
      });
    });

    it('clears a half-set place, which would mean nothing', () => {
      const page = arranged();

      const next = updateGroup(page, page.groups[1]!.id, { row: undefined });

      expect(next.groups[1]).not.toHaveProperty('column');
      expect(next.groups[1]).not.toHaveProperty('row');
    });

    it('does the same for a widget, with its type and id untouched', () => {
      const page = arranged();
      const widget = page.widgets[0]!;

      const next = updateWidget(page, widget.id, { height: 9 }).widgets[0]!;

      expect(next.height).toBe(MIN_ROWS);
      expect(next).toMatchObject({ id: widget.id, type: 'calendar', column: 0, row: 0 });
    });

    it('adds a group with the height it was made with, and none that is undefined', () => {
      const page = arranged();

      expect(addGroup(page, 'Tall', { height: 72 }).group.height).toBe(72);
      expect(addGroup(page, 'Plain', { height: undefined }).group).not.toHaveProperty('height');
    });
  });

  describe('moving a group earlier or later', () => {
    it('trades places on the board with the group it passes', () => {
      const page = arranged();

      const next = moveGroup(page, 1, 0);

      expect(next.groups.map((card) => [card.name, card.column, card.row])).toEqual([
        ['B', 3, 0],
        ['A', 7, 0],
        ['C', 0, 40]
      ]);
    });

    it('keeps each group’s own width and height', () => {
      const page = arranged();

      const [b, a] = moveGroup(page, 1, 0).groups;

      expect(a).toMatchObject({ name: 'A', width: 4, height: 60 });
      expect(b).not.toHaveProperty('height');
    });

    it('moves later the same way', () => {
      const page = arranged();

      const next = moveGroup(page, 1, 2);

      expect(next.groups.map((card) => [card.name, card.column, card.row])).toEqual([
        ['A', 3, 0],
        ['C', 7, 0],
        ['B', 0, 40]
      ]);
    });

    it('only reorders groups that have not been put anywhere yet', () => {
      const page = pageOf(
        sanitizeConfig({
          groups: [
            { name: 'A', bookmarks: [] },
            { name: 'B', bookmarks: [] }
          ]
        }),
        0
      );

      const next = moveGroup(page, 1, 0);

      expect(next.groups.map((card) => card.name)).toEqual(['B', 'A']);
      expect(next.groups[0]).not.toHaveProperty('column');
    });

    it('gives a new group the place of the one it passes, which goes to the end in its turn', () => {
      const placed = arranged();
      const page: PageConfig = {
        ...placed,
        groups: [
          ...placed.groups,
          ...sanitizeConfig({ groups: [{ name: 'New', bookmarks: [] }] }).pages[0].groups
        ]
      };

      const next = moveGroup(page, 3, 2);

      expect(next.groups.map((card) => card.name)).toEqual(['A', 'B', 'New', 'C']);
      expect(next.groups[2]).toMatchObject({ column: 0, row: 40 });
      expect(next.groups[3]).not.toHaveProperty('column');
    });

    it('does nothing when there is nowhere to go, or no group there', () => {
      const page = arranged();

      expect(moveGroup(page, 0, -1)).toBe(page);
      expect(moveGroup(page, 2, 3)).toBe(page);
      expect(moveGroup(page, 1, 1)).toBe(page);
      expect(moveGroup(page, 7, 0)).toBe(page);
    });
  });

  describe('importing groups', () => {
    it('adds them at the end, keeping their height but not the place they had on another board', () => {
      const page = arranged();
      const incoming = sanitizeConfig({
        groups: [{ name: 'Imported', height: 72, column: 4, row: 4, bookmarks: [] }]
      }).pages[0].groups;

      const next = mergeGroups(page, incoming);

      expect(next.groups[3]).toMatchObject({ name: 'Imported', height: 72 });
      expect(next.groups[3]).not.toHaveProperty('column');
      expect(next.groups[3]).not.toHaveProperty('row');
    });
  });
});

describe('addWidget', () => {
  it('adds a new widget of the type at the end, as new ones start', () => {
    const { config, widget } = addWidget(board(), 'hackernews');

    expect(config.widgets).toHaveLength(2);
    expect(config.widgets[1]).toBe(widget);
    expect(widget).toEqual(expect.objectContaining({ type: 'hackernews', count: 6 }));
  });

  it('adds one with the settings it is given, as they are', () => {
    const settings = { ...createWidget('hackernews'), count: 11, width: 6 };
    const { config, widget } = addWidget(board(), 'hackernews', settings);

    expect(widget).toMatchObject({ type: 'hackernews', count: 11, width: 6 });
    expect(config.widgets[config.widgets.length - 1]).toBe(widget);
  });

  it('gives it an id of its own, so one set of settings added twice is two widgets', () => {
    const settings = createWidget('clock');
    const first = addWidget(board(), 'clock', settings);
    const second = addWidget(first.config, 'clock', settings);

    expect(first.widget.id).not.toBe(settings.id);
    expect(second.widget.id).not.toBe(first.widget.id);
    expect(new Set(second.config.widgets.map((widget) => widget.id)).size).toBe(3);
  });

  it('leaves the settings it was given, and the board it was given, as they were', () => {
    const settings = createWidget('clock');
    const before = board();
    addWidget(before, 'clock', settings);

    expect(settings.id).toBe(settings.id);
    expect(before.widgets).toHaveLength(1);
  });
});

describe('addWidgets', () => {
  it('adds each at the end, in order', () => {
    const config = addWidgets(board(), [createWidget('clock'), createWidget('hackernews')]);

    expect(config.widgets.map((widget) => widget.type)).toEqual(['weather', 'clock', 'hackernews']);
  });

  it('gives each an id of its own, even the same widgets added twice', () => {
    const widgets = [createWidget('clock')];
    const twice = addWidgets(addWidgets(board(), widgets), widgets);

    expect(new Set(twice.widgets.map((widget) => widget.id)).size).toBe(3);
    expect(widgets[0]!.id).not.toBe(twice.widgets[1]!.id);
  });

  it('keeps each widget’s settings', () => {
    const config = addWidgets(board(), [
      { ...createWidget('hackernews'), count: 11, width: 6 } as Widget
    ]);

    expect(config.widgets[1]).toMatchObject({ type: 'hackernews', count: 11, width: 6 });
  });

  it('changes nothing for no widgets, and not the board it was given', () => {
    const before = board();

    expect(addWidgets(before, []).widgets).toEqual(before.widgets);
    addWidgets(before, [createWidget('clock')]);
    expect(before.widgets).toHaveLength(1);
  });
});
