/**
 * Every change a visitor can make to a page of the board, as pure functions from one
 * config to the next. The hook keeps the previous config for undo, so none of
 * these need to worry about taking anything back.
 */
import type { Layout } from 'react-grid-layout/core';
import { cardKey, type CardKind } from './layout';
import {
  MAX_ROWS,
  MIN_ROWS,
  clampSpan,
  createBookmark,
  createGroup,
  createWidget,
  minSpanOf,
  type BoardPage,
  type Bookmark,
  type PageConfig,
  type Group,
  type Placement,
  type Widget,
  type WidgetType
} from './model';

export const arrayMove = <T>(items: readonly T[], from: number, to: number): T[] => {
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(to, next.length)), 0, moved);
  return next;
};

export const findBookmark = (
  groups: readonly Group[],
  bookmarkId: string
): { group: Group; bookmark: Bookmark; index: number } | null => {
  for (const group of groups) {
    const index = group.bookmarks.findIndex((bookmark) => bookmark.id === bookmarkId);

    if (index !== -1) {
      return { group, bookmark: group.bookmarks[index], index };
    }
  }

  return null;
};

const mapGroup = (
  config: PageConfig,
  groupId: string,
  change: (group: Group) => Group
): PageConfig => ({
  ...config,
  groups: config.groups.map((group) => (group.id === groupId ? change(group) : group))
});

export type BookmarkFields = Omit<Bookmark, 'id'>;

/** Adds a bookmark to the end of a group; a group that doesn't exist yet is created by name. */
export const addBookmark = (
  config: PageConfig,
  target: { groupId: string } | { newGroup: string },
  fields: BookmarkFields
): { config: PageConfig; bookmark: Bookmark; groupId: string } => {
  const bookmark = createBookmark(fields);

  if ('newGroup' in target) {
    const group = { ...createGroup(target.newGroup), bookmarks: [bookmark] };
    return {
      config: { ...config, groups: [...config.groups, group] },
      bookmark,
      groupId: group.id
    };
  }

  return {
    config: mapGroup(config, target.groupId, (group) => ({
      ...group,
      collapsed: false,
      bookmarks: [...group.bookmarks, bookmark]
    })),
    bookmark,
    groupId: target.groupId
  };
};

export const updateBookmark = (
  config: PageConfig,
  bookmarkId: string,
  patch: Partial<BookmarkFields>
): PageConfig => ({
  ...config,
  groups: config.groups.map((group) =>
    group.bookmarks.some((bookmark) => bookmark.id === bookmarkId)
      ? {
          ...group,
          bookmarks: group.bookmarks.map((bookmark) =>
            bookmark.id === bookmarkId ? { ...bookmark, ...patch } : bookmark
          )
        }
      : group
  )
});

export const deleteBookmark = (config: PageConfig, bookmarkId: string): PageConfig => ({
  ...config,
  groups: config.groups.map((group) => ({
    ...group,
    bookmarks: group.bookmarks.filter((bookmark) => bookmark.id !== bookmarkId)
  }))
});

/** Moves a bookmark to a place in a group, which may be the one it is already in. */
export const moveBookmark = (
  groups: readonly Group[],
  bookmarkId: string,
  toGroupId: string,
  toIndex: number
): Group[] => {
  const found = findBookmark(groups, bookmarkId);

  if (!found) {
    return [...groups];
  }

  if (found.group.id === toGroupId) {
    return groups.map((group) =>
      group.id === toGroupId
        ? { ...group, bookmarks: arrayMove(group.bookmarks, found.index, toIndex) }
        : group
    );
  }

  return groups.map((group) => {
    if (group.id === found.group.id) {
      return { ...group, bookmarks: group.bookmarks.filter((item) => item.id !== bookmarkId) };
    }

    if (group.id === toGroupId) {
      const bookmarks = [...group.bookmarks];
      bookmarks.splice(Math.max(0, Math.min(toIndex, bookmarks.length)), 0, found.bookmark);
      return { ...group, bookmarks };
    }

    return group;
  });
};

/**
 * A card with its placement made sound: a height kept within the limits, a
 * place only when it has both halves, and nothing left `undefined`, which the
 * YAML writer would refuse. A patch that sets `height: undefined` is how a card
 * goes back to fitting its contents.
 */
const settled = <T extends Placement>(card: T): T => {
  const { height, column, row, ...rest } = card;
  const placed = column !== undefined && row !== undefined;

  return {
    ...rest,
    ...(height !== undefined
      ? { height: Math.min(MAX_ROWS, Math.max(MIN_ROWS, Math.round(height))) }
      : {}),
    ...(placed ? { column, row } : {})
  } as T;
};

export const addGroup = (
  config: PageConfig,
  name: string,
  patch: Partial<Omit<Group, 'id' | 'bookmarks'>> = {}
): { config: PageConfig; group: Group } => {
  const group = settled({ ...createGroup(name), ...patch });
  return { config: { ...config, groups: [...config.groups, group] }, group };
};

export const updateGroup = (
  config: PageConfig,
  groupId: string,
  patch: Partial<Omit<Group, 'id'>>
): PageConfig =>
  mapGroup(config, groupId, (group) =>
    settled({
      ...group,
      ...patch,
      ...(patch.width !== undefined ? { width: clampSpan(patch.width) } : {})
    })
  );

export const deleteGroup = (config: PageConfig, groupId: string): PageConfig => ({
  ...config,
  groups: config.groups.filter((group) => group.id !== groupId)
});

/** Where a card sits, or nothing when it has not been put anywhere yet. */
const placeOf = ({ column, row }: Placement): Pick<Placement, 'column' | 'row'> =>
  column !== undefined && row !== undefined ? { column, row } : {};

/**
 * Moves a group to another place in the order, trading places on the board with
 * the group that was there: the one before it for "earlier", the one after for
 * "later".
 */
export const moveGroup = (config: PageConfig, from: number, to: number): PageConfig => {
  const mover = config.groups[from];
  const other = config.groups[to];

  if (!mover || !other || from === to) {
    return config;
  }

  const groups = config.groups.map((group) => {
    if (group.id === mover.id) {
      return settled({ ...group, column: undefined, row: undefined, ...placeOf(other) });
    }

    return group.id === other.id
      ? settled({ ...group, column: undefined, row: undefined, ...placeOf(mover) })
      : group;
  });

  return { ...config, groups: arrayMove(groups, from, to) };
};

export const addWidget = (
  config: PageConfig,
  type: WidgetType
): { config: PageConfig; widget: Widget } => {
  const widget = createWidget(type);
  return { config: { ...config, widgets: [...config.widgets, widget] }, widget };
};

export const updateWidget = (
  config: PageConfig,
  widgetId: string,
  patch: Partial<Widget>
): PageConfig => ({
  ...config,
  widgets: config.widgets.map((widget) =>
    widget.id === widgetId
      ? settled({
          ...widget,
          ...patch,
          ...(patch.width !== undefined
            ? { width: clampSpan(patch.width, undefined, minSpanOf(widget.type)) }
            : {}),
          id: widget.id,
          type: widget.type
        } as Widget)
      : widget
  )
});

export const deleteWidget = (config: PageConfig, widgetId: string): PageConfig => ({
  ...config,
  widgets: config.widgets.filter((widget) => widget.id !== widgetId)
});

/** Sends a card back to being as tall as its contents; a card that already is stays as it is. */
export const fitCard = (config: PageConfig, kind: CardKind, id: string): PageConfig => {
  const cards: readonly (Placement & { id: string })[] =
    kind === 'group' ? config.groups : config.widgets;

  if (cards.find((card) => card.id === id)?.height === undefined) {
    return config;
  }

  return kind === 'group'
    ? updateGroup(config, id, { height: undefined })
    : updateWidget(config, id, { height: undefined });
};

/** Orders cards as they sit on the board: top to bottom, then left to right. */
const byPlace = <T extends Placement>(cards: readonly T[]): T[] =>
  [...cards].sort((a, b) => (a.row ?? 0) - (b.row ?? 0) || (a.column ?? 0) - (b.column ?? 0));

/**
 * Writes down where a drag or resize left the cards: every card's column, row
 * and width, and the height of those that were given one (or, for `resized`,
 * the card just dragged taller or shorter, which is given one now). The groups
 * and widgets are kept in the order they sit, so stacking them on a narrow
 * screen reads the same way. A layout that changes nothing returns the page
 * itself.
 */
export const placeCards = <T extends BoardPage>(page: T, layout: Layout, resized?: string): T => {
  const items = new Map(layout.map((item) => [item.i, item]));

  const place = <C extends Placement & { id: string; width: number }>(
    kind: CardKind,
    card: C,
    collapsed = false
  ): C => {
    const key = cardKey(kind, card.id);
    const item = items.get(key);

    if (!item) {
      return card;
    }

    const sized = !collapsed && (card.height !== undefined || key === resized);

    if (
      card.width === item.w &&
      card.column === item.x &&
      card.row === item.y &&
      (!sized || card.height === item.h)
    ) {
      return card;
    }

    return settled({
      ...card,
      width: item.w,
      column: item.x,
      row: item.y,
      ...(sized ? { height: item.h } : {})
    });
  };

  const arranged = <C extends Placement>(
    before: readonly C[],
    after: readonly C[]
  ): readonly C[] => {
    const sorted = byPlace(after);
    return sorted.some((card, index) => card !== before[index]) ? sorted : before;
  };

  const widgets = page.widgets.map((widget) => place('widget', widget));
  const groups = page.groups.map((group) => place('group', group, group.collapsed));
  const nextWidgets = arranged(page.widgets, widgets);
  const nextGroups = arranged(page.groups, groups);

  return nextWidgets === page.widgets && nextGroups === page.groups
    ? page
    : { ...page, widgets: [...nextWidgets], groups: [...nextGroups] };
};

/** Adds imported groups after the existing ones, merging into any group with the same name. */
export const mergeGroups = (config: PageConfig, incoming: readonly Group[]): PageConfig => {
  const groups = config.groups.map((group) => ({ ...group, bookmarks: [...group.bookmarks] }));

  for (const group of incoming) {
    const existing = groups.find(
      (candidate) => candidate.name.toLowerCase() === group.name.toLowerCase()
    );

    if (!existing) {
      // Where it sat on someone else's board means nothing here; it goes at the end.
      groups.push(settled({ ...group, column: undefined, row: undefined }));
      continue;
    }

    const known = new Set(existing.bookmarks.map((bookmark) => bookmark.url));
    existing.bookmarks.push(...group.bookmarks.filter((bookmark) => !known.has(bookmark.url)));
  }

  return { ...config, groups };
};
