import { act, createEvent, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import type { CollisionDetection, DndContextProps } from '@dnd-kit/core';
import type { GridLayoutProps } from 'react-grid-layout/react';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { FLOW_BELOW, rowsFor } from '../lib/layout';
import {
  GRID_GAP,
  HEIGHT_STEP,
  ROW_PX,
  pageOf,
  sanitizeConfig,
  type PageConfig
} from '../lib/model';
import { Board, type BoardActions } from './board';

// The real DndContext and GridLayout do the work; these only let a test reach what the board gave them.
const dnd = vi.hoisted(() => ({ props: null as unknown }));
const grid = vi.hoisted(() => ({ props: null as unknown }));

vi.mock('react-grid-layout/react', async (importOriginal) => {
  const layout = await importOriginal<typeof import('react-grid-layout/react')>();

  return {
    ...layout,
    GridLayout: (props: GridLayoutProps) => {
      grid.props = props;
      return createElement(layout.GridLayout, props);
    }
  };
});

vi.mock('@dnd-kit/core', async (importOriginal) => {
  const core = await importOriginal<typeof import('@dnd-kit/core')>();

  return {
    ...core,
    DndContext: (props: DndContextProps) => {
      dnd.props = props;
      return createElement(core.DndContext, props);
    }
  };
});

const gridProps = (): GridLayoutProps => grid.props as GridLayoutProps;

const handlers = (): Required<
  Pick<
    DndContextProps,
    'onDragStart' | 'onDragOver' | 'onDragEnd' | 'onDragCancel' | 'collisionDetection'
  >
> => dnd.props as never;

const boardConfig = (): PageConfig =>
  pageOf(
    sanitizeConfig({
      widgets: [
        { type: 'calendar', width: 3, weekStart: 1 },
        { type: 'calendar', width: 3, weekStart: 0 }
      ],
      groups: [
        {
          name: 'Code',
          bookmarks: [
            { name: 'GitHub', url: 'https://github.com' },
            { name: 'npm', url: 'https://www.npmjs.com' },
            { name: 'MDN', url: 'https://developer.mozilla.org' }
          ]
        },
        {
          name: 'Read',
          bookmarks: [
            { name: 'Lobsters', url: 'https://lobste.rs' },
            { name: 'Aeon', url: 'https://aeon.co' }
          ]
        },
        { name: 'Empty', bookmarks: [] },
        {
          name: 'Folded',
          collapsed: true,
          bookmarks: [{ name: 'Hidden', url: 'https://example.org' }]
        }
      ]
    }),
    0
  );

type Actions = { [K in keyof BoardActions]: Mock<BoardActions[K]> };

const actionsOf = (): Actions => ({
  onEditBookmark: vi.fn<BoardActions['onEditBookmark']>(),
  onDeleteBookmark: vi.fn<BoardActions['onDeleteBookmark']>(),
  onBookmarkMenu: vi.fn<BoardActions['onBookmarkMenu']>(),
  onAddBookmark: vi.fn<BoardActions['onAddBookmark']>(),
  onGroupMenu: vi.fn<BoardActions['onGroupMenu']>(),
  onToggleGroup: vi.fn<BoardActions['onToggleGroup']>(),
  onAddGroup: vi.fn<BoardActions['onAddGroup']>(),
  onAddWidget: vi.fn<BoardActions['onAddWidget']>(),
  onConfigureWidget: vi.fn<BoardActions['onConfigureWidget']>(),
  onRemoveWidget: vi.fn<BoardActions['onRemoveWidget']>(),
  onDropLink: vi.fn<BoardActions['onDropLink']>()
});

const setup = (
  overrides: { editing?: boolean; freshId?: string | null; config?: PageConfig } = {}
): { config: PageConfig; apply: ReturnType<typeof vi.fn>; actions: Actions } => {
  const config = overrides.config ?? boardConfig();
  const apply = vi.fn();
  const actions = actionsOf();

  render(
    <Board
      config={config}
      editing={overrides.editing ?? false}
      freshId={overrides.freshId}
      apply={apply}
      {...actions}
    />
  );

  return { config, apply, actions };
};

/** `setup`, but able to give the same board another page, and to take it away. */
const setupWith = (
  config: PageConfig,
  editing = false
): {
  actions: Actions;
  apply: ReturnType<typeof vi.fn>;
  unmount: () => void;
  rerender: (next: PageConfig) => void;
} => {
  const apply = vi.fn();
  const actions = actionsOf();
  const { unmount, rerender } = render(
    <Board config={config} editing={editing} apply={apply} {...actions} />
  );

  return {
    actions,
    apply,
    unmount,
    rerender: (next) =>
      rerender(<Board config={next} editing={editing} apply={apply} {...actions} />)
  };
};

const group = (name: string): HTMLElement => screen.getByRole('region', { name });
const namesIn = (name: string): string[] =>
  [...group(name).querySelectorAll('.bm-name')].map((node) => node.textContent ?? '');

/** What a change given to `apply` would turn the page into. */
const appliedTo = (apply: ReturnType<typeof vi.fn>, config: PageConfig, call = 0): PageConfig =>
  (apply.mock.calls[call]![0] as (page: PageConfig) => PageConfig)(config);

// Ids as the board gives them to dnd-kit.
const bm = (id: string): string => `bm:${id}`;
const grp = (id: string): string => `group:${id}`;

type Rect = { top: number; left: number; width: number; height: number };
const rectOf = ({ top, left, width, height }: Rect): Rect & { right: number; bottom: number } => ({
  top,
  left,
  width,
  height,
  right: left + width,
  bottom: top + height
});

/** A drag event, as dnd-kit would give it. */
const dragEvent = (options: {
  active: { id: string; data?: unknown; translated?: Rect };
  over?: { id: string; data?: unknown; rect?: Rect } | null;
}): never =>
  ({
    active: {
      id: options.active.id,
      data: { current: options.active.data },
      rect: { current: { initial: null, translated: options.active.translated ?? null } }
    },
    over: options.over
      ? {
          id: options.over.id,
          data: { current: options.over.data },
          rect: options.over.rect
            ? rectOf(options.over.rect)
            : { top: 0, left: 0, width: 0, height: 0 }
        }
      : null
  }) as never;

const bookmarkData = (config: PageConfig, groupName: string, index: number) => {
  const found = config.groups.find((item) => item.name === groupName)!;
  return { type: 'bookmark', bookmarkId: found.bookmarks[index]!.id, groupId: found.id };
};
const groupData = (config: PageConfig, name: string) => ({
  type: 'group',
  groupId: config.groups.find((item) => item.name === name)!.id
});
const groupId = (config: PageConfig, name: string): string =>
  config.groups.find((item) => item.name === name)!.id;
const bookmarkId = (config: PageConfig, groupName: string, index: number): string =>
  config.groups.find((item) => item.name === groupName)!.bookmarks[index]!.id;

describe('Board', () => {
  describe('what it shows', () => {
    it('lays out the widgets, then the groups with their bookmarks', () => {
      setup();

      expect(screen.getAllByRole('grid', { name: 'This month' })).toHaveLength(2);
      expect(
        // Each widget is a region too, named for what it is.
        screen
          .getAllByRole('region')
          .map((region) => region.getAttribute('aria-label'))
          .filter((name) => name !== 'Calendar')
      ).toEqual(['Code', 'Read', 'Empty', 'Folded']);
      expect(namesIn('Code')).toEqual(['GitHub', 'npm', 'MDN']);
      expect(namesIn('Read')).toEqual(['Lobsters', 'Aeon']);
    });

    it('hides the bookmarks of a collapsed group', () => {
      setup();

      expect(namesIn('Folded')).toEqual([]);
    });

    it('is quiet until something happens: no guides, nothing dragging, not editing', () => {
      setup();
      const board = document.querySelector('.board')!;

      expect(board).not.toHaveAttribute('data-guides');
      expect(board).not.toHaveAttribute('data-dragging');
      expect(board).not.toHaveAttribute('data-editing');
    });

    it('says when it is being edited', () => {
      setup({ editing: true });

      expect(document.querySelector('.board')).toHaveAttribute('data-editing', 'on');
    });

    it('draws a column guide for each of the twelve columns', () => {
      setup();

      expect(document.querySelectorAll('.grid-guides span')).toHaveLength(12);
    });

    it('lights the bookmark that was just added', () => {
      const config = boardConfig();
      setup({ config, freshId: bookmarkId(config, 'Read', 1) });

      expect(document.querySelectorAll('.bm--fresh')).toHaveLength(1);
      expect(within(group('Read')).getByText('Aeon').closest('li')).toHaveClass('bm--fresh');
    });

    it('tags each bookmark with its id, for the drag to find', () => {
      const config = boardConfig();
      setup({ config });

      expect(
        group('Code').querySelector(`[data-bookmark-id="${bookmarkId(config, 'Code', 0)}"]`)
      ).not.toBeNull();
    });
  });

  describe('the ghost tiles', () => {
    it('offers to add a widget or a group while editing', async () => {
      const { actions } = setup({ editing: true });

      await userEvent.click(screen.getByRole('button', { name: /Add a widget/ }));
      await userEvent.click(screen.getByRole('button', { name: /New group/ }));

      expect(actions.onAddWidget).toHaveBeenCalledTimes(1);
      expect(actions.onAddGroup).toHaveBeenCalledTimes(1);
    });

    it('offers neither when not editing', () => {
      setup({ editing: false });

      expect(screen.queryByRole('button', { name: /Add a widget/ })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /New group/ })).not.toBeInTheDocument();
    });
  });

  describe('the actions', () => {
    it('adds to the group whose button was pressed', async () => {
      const config = boardConfig();
      const { actions } = setup({ config, editing: true });

      await userEvent.click(screen.getByRole('button', { name: 'Add a bookmark to Read' }));

      expect(actions.onAddBookmark).toHaveBeenCalledExactlyOnceWith(groupId(config, 'Read'));
    });

    it('toggles and opens the menu of the group it was asked about', async () => {
      const config = boardConfig();
      const { actions } = setup({ config });

      await userEvent.click(screen.getByRole('button', { name: 'Collapse Code' }));
      await userEvent.click(screen.getByRole('button', { name: 'Read options' }));

      expect(actions.onToggleGroup).toHaveBeenCalledWith(expect.objectContaining({ name: 'Code' }));
      expect(actions.onGroupMenu).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Read' }),
        expect.anything()
      );
    });

    it('edits and deletes the bookmark whose button was pressed', async () => {
      const { actions } = setup({ editing: true });

      await userEvent.click(within(group('Code')).getAllByRole('button', { name: /Edit/ })[1]!);
      await userEvent.click(
        within(group('Code')).getAllByRole('button', { name: /Delete|Remove/ })[0]!
      );

      expect(actions.onEditBookmark).toHaveBeenCalledWith(expect.objectContaining({ name: 'npm' }));
      expect(actions.onDeleteBookmark).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'GitHub' })
      );
    });

    it('opens a bookmark’s menu on a right-click', () => {
      const { actions } = setup();

      fireEvent.contextMenu(within(group('Code')).getByRole('link', { name: /MDN/ }));

      expect(actions.onBookmarkMenu).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'MDN' }),
        expect.anything()
      );
    });

    it('configures and removes the widget it was asked about', async () => {
      const { actions } = setup({ editing: true });

      await userEvent.click(screen.getAllByRole('button', { name: /Configure|Settings|Edit/ })[0]!);
      await userEvent.click(screen.getAllByRole('button', { name: /Remove|Delete/ })[0]!);

      expect(actions.onConfigureWidget).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'calendar' })
      );
      expect(actions.onRemoveWidget).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'calendar' })
      );
    });
  });

  describe('dragging a bookmark', () => {
    it('says a bookmark is being carried, without the guides', () => {
      const config = boardConfig();
      setup({ config });

      act(() =>
        handlers().onDragStart(
          dragEvent({
            active: { id: bm(bookmarkId(config, 'Code', 0)), data: bookmarkData(config, 'Code', 0) }
          })
        )
      );

      const board = document.querySelector('.board')!;
      expect(board).toHaveAttribute('data-dragging', 'bookmark');
      expect(board).not.toHaveAttribute('data-guides');

      act(() => handlers().onDragCancel({} as never));
      expect(board).not.toHaveAttribute('data-dragging');
    });

    it('ignores a drag it knows nothing about, or of anything but a bookmark', () => {
      const config = boardConfig();
      setup({ config });

      act(() => handlers().onDragStart(dragEvent({ active: { id: 'mystery' } })));
      act(() =>
        handlers().onDragStart(
          dragEvent({
            active: { id: grp(groupId(config, 'Code')), data: groupData(config, 'Code') }
          })
        )
      );

      expect(document.querySelector('.board')).not.toHaveAttribute('data-dragging');
    });
  });

  describe('carrying a bookmark into another group', () => {
    const start = (config: PageConfig): void => {
      act(() =>
        handlers().onDragStart(
          dragEvent({
            active: { id: bm(bookmarkId(config, 'Code', 0)), data: bookmarkData(config, 'Code', 0) }
          })
        )
      );
    };

    const dragOver = (
      config: PageConfig,
      over: { id: string; data: unknown; rect?: Rect } | null,
      translated?: Rect
    ): void => {
      act(() =>
        handlers().onDragOver(
          dragEvent({
            active: {
              id: bm(bookmarkId(config, 'Code', 0)),
              data: bookmarkData(config, 'Code', 0),
              translated
            },
            over
          })
        )
      );
    };

    let frames: (() => void)[];

    beforeEach(() => {
      frames = [];
      vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
        frames.push(() => callback(0));
        return frames.length;
      });
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    const overLobsters = (config: PageConfig) => ({
      id: bm(bookmarkId(config, 'Read', 0)),
      data: bookmarkData(config, 'Read', 0)
    });

    it('moves it in front of the bookmark it is over, when it is before that bookmark’s middle', () => {
      const config = boardConfig();
      setup({ config });
      start(config);

      dragOver(
        config,
        { ...overLobsters(config), rect: { top: 200, left: 100, width: 200, height: 60 } },
        { top: 100, left: 100, width: 200, height: 60 }
      );

      expect(namesIn('Read')).toEqual(['GitHub', 'Lobsters', 'Aeon']);
      expect(namesIn('Code')).toEqual(['npm', 'MDN']);
    });

    it('moves it after the bookmark it is over, once it has passed that bookmark’s middle', () => {
      const config = boardConfig();
      setup({ config });
      start(config);

      dragOver(
        config,
        { ...overLobsters(config), rect: { top: 200, left: 100, width: 200, height: 60 } },
        { top: 300, left: 100, width: 200, height: 60 }
      );

      expect(namesIn('Read')).toEqual(['Lobsters', 'GitHub', 'Aeon']);
    });

    it('goes by how far across it is, when level with the bookmark', () => {
      const config = boardConfig();
      setup({ config });
      start(config);

      dragOver(
        config,
        { ...overLobsters(config), rect: { top: 200, left: 100, width: 200, height: 60 } },
        { top: 200, left: 300, width: 200, height: 60 }
      );

      expect(namesIn('Read')).toEqual(['Lobsters', 'GitHub', 'Aeon']);
    });

    it('puts it first when nothing says where it is', () => {
      const config = boardConfig();
      setup({ config });
      start(config);

      dragOver(config, overLobsters(config));

      expect(namesIn('Read')).toEqual(['GitHub', 'Lobsters', 'Aeon']);
    });

    it('adds it to the end of a group it is dragged over', () => {
      const config = boardConfig();
      setup({ config });
      start(config);

      dragOver(config, { id: grp(groupId(config, 'Read')), data: groupData(config, 'Read') });

      expect(namesIn('Read')).toEqual(['Lobsters', 'Aeon', 'GitHub']);
    });

    it('fills an empty group', () => {
      const config = boardConfig();
      setup({ config });
      start(config);

      dragOver(config, { id: grp(groupId(config, 'Empty')), data: groupData(config, 'Empty') });

      expect(namesIn('Empty')).toEqual(['GitHub']);
    });

    it('stays put over its own group', () => {
      const config = boardConfig();
      setup({ config });
      start(config);

      dragOver(config, { id: grp(groupId(config, 'Code')), data: groupData(config, 'Code') });
      dragOver(config, {
        id: bm(bookmarkId(config, 'Code', 2)),
        data: bookmarkData(config, 'Code', 2)
      });

      expect(namesIn('Code')).toEqual(['GitHub', 'npm', 'MDN']);
    });

    it('does not drop it into a collapsed group, which cannot show it', () => {
      const config = boardConfig();
      setup({ config });
      start(config);

      dragOver(config, { id: grp(groupId(config, 'Folded')), data: groupData(config, 'Folded') });

      expect(namesIn('Code')).toEqual(['GitHub', 'npm', 'MDN']);
    });

    it('does nothing over nothing, or over something it does not know', () => {
      const config = boardConfig();
      setup({ config });
      start(config);

      dragOver(config, null);
      dragOver(config, { id: 'mystery', data: undefined });
      dragOver(config, { id: 'widget', data: { type: 'widget', widgetId: 'x' } });
      dragOver(config, { id: grp('gone'), data: { type: 'group', groupId: 'gone' } });
      dragOver(config, {
        id: bm('gone'),
        data: { type: 'bookmark', bookmarkId: 'gone', groupId: 'x' }
      });

      expect(namesIn('Code')).toEqual(['GitHub', 'npm', 'MDN']);
    });

    it('crosses once a frame, so the groups’ new sizes are measured before it moves again', () => {
      const config = boardConfig();
      setup({ config });
      start(config);

      dragOver(config, { id: grp(groupId(config, 'Read')), data: groupData(config, 'Read') });
      dragOver(config, { id: grp(groupId(config, 'Empty')), data: groupData(config, 'Empty') });
      expect(namesIn('Empty')).toEqual([]);

      act(() => frames.forEach((frame) => frame()));
      dragOver(config, { id: grp(groupId(config, 'Empty')), data: groupData(config, 'Empty') });
      // It had already crossed into Read, so now it crosses on from there.
      expect(namesIn('Empty')).toEqual(['GitHub']);
    });

    it('ignores a group or widget being carried over a bookmark', () => {
      const config = boardConfig();
      setup({ config });

      act(() =>
        handlers().onDragOver(
          dragEvent({
            active: { id: grp(groupId(config, 'Code')), data: groupData(config, 'Code') },
            over: { id: grp(groupId(config, 'Read')), data: groupData(config, 'Read') }
          })
        )
      );

      expect(namesIn('Code')).toEqual(['GitHub', 'npm', 'MDN']);
    });

    it('settles in its new group when put down there', () => {
      const config = boardConfig();
      const { apply } = setup({ config });
      start(config);
      dragOver(config, { id: grp(groupId(config, 'Read')), data: groupData(config, 'Read') });

      act(() =>
        handlers().onDragEnd(
          dragEvent({
            active: {
              id: bm(bookmarkId(config, 'Code', 0)),
              data: bookmarkData(config, 'Code', 0)
            },
            over: { id: grp(groupId(config, 'Read')), data: groupData(config, 'Read') }
          })
        )
      );

      const next = appliedTo(apply, config);
      expect(
        next.groups.find((item) => item.name === 'Read')!.bookmarks.map((item) => item.name)
      ).toEqual(['Lobsters', 'Aeon', 'GitHub']);
      expect(
        next.groups.find((item) => item.name === 'Code')!.bookmarks.map((item) => item.name)
      ).toEqual(['npm', 'MDN']);
    });

    it('goes back to where it was when the drag is cancelled', () => {
      const config = boardConfig();
      const { apply } = setup({ config });
      start(config);
      dragOver(config, { id: grp(groupId(config, 'Read')), data: groupData(config, 'Read') });
      expect(namesIn('Read')).toContain('GitHub');

      act(() => handlers().onDragCancel({} as never));

      expect(namesIn('Read')).toEqual(['Lobsters', 'Aeon']);
      expect(namesIn('Code')).toEqual(['GitHub', 'npm', 'MDN']);
      expect(apply).not.toHaveBeenCalled();
    });
  });

  describe('putting things down', () => {
    it('does nothing for a group or anything unknown put down', () => {
      const config = boardConfig();
      const { apply } = setup({ config });
      const active = { id: grp(groupId(config, 'Code')), data: groupData(config, 'Code') };

      act(() =>
        handlers().onDragEnd(
          dragEvent({
            active,
            over: { id: grp(groupId(config, 'Read')), data: groupData(config, 'Read') }
          })
        )
      );
      act(() => handlers().onDragEnd(dragEvent({ active, over: null })));

      expect(apply).not.toHaveBeenCalled();
    });

    it('reorders a bookmark within its group', () => {
      const config = boardConfig();
      const { apply } = setup({ config });
      act(() =>
        handlers().onDragStart(
          dragEvent({
            active: { id: bm(bookmarkId(config, 'Code', 0)), data: bookmarkData(config, 'Code', 0) }
          })
        )
      );

      act(() =>
        handlers().onDragEnd(
          dragEvent({
            active: {
              id: bm(bookmarkId(config, 'Code', 0)),
              data: bookmarkData(config, 'Code', 0)
            },
            over: { id: bm(bookmarkId(config, 'Code', 2)), data: bookmarkData(config, 'Code', 2) }
          })
        )
      );

      expect(
        appliedTo(apply, config)
          .groups.find((item) => item.name === 'Code')!
          .bookmarks.map((item) => item.name)
      ).toEqual(['npm', 'MDN', 'GitHub']);
    });

    it('leaves a bookmark where it was when put down on itself', () => {
      const config = boardConfig();
      const { apply } = setup({ config });
      const active = {
        id: bm(bookmarkId(config, 'Code', 1)),
        data: bookmarkData(config, 'Code', 1)
      };
      act(() => handlers().onDragStart(dragEvent({ active })));

      act(() =>
        handlers().onDragEnd(dragEvent({ active, over: { id: active.id, data: active.data } }))
      );

      expect(
        appliedTo(apply, config)
          .groups.find((item) => item.name === 'Code')!
          .bookmarks.map((item) => item.name)
      ).toEqual(['GitHub', 'npm', 'MDN']);
    });

    it('puts a bookmark at the end of a collapsed group it is dropped on', () => {
      const config = boardConfig();
      const { apply } = setup({ config });
      const active = {
        id: bm(bookmarkId(config, 'Code', 0)),
        data: bookmarkData(config, 'Code', 0)
      };
      act(() => handlers().onDragStart(dragEvent({ active })));

      act(() =>
        handlers().onDragEnd(
          dragEvent({
            active,
            over: { id: grp(groupId(config, 'Folded')), data: groupData(config, 'Folded') }
          })
        )
      );

      expect(
        appliedTo(apply, config)
          .groups.find((item) => item.name === 'Folded')!
          .bookmarks.map((item) => item.name)
      ).toEqual(['Hidden', 'GitHub']);
    });

    it('leaves a bookmark alone when dropped on its own group header', () => {
      const config = boardConfig();
      const { apply } = setup({ config });
      const active = {
        id: bm(bookmarkId(config, 'Code', 0)),
        data: bookmarkData(config, 'Code', 0)
      };
      act(() => handlers().onDragStart(dragEvent({ active })));

      act(() =>
        handlers().onDragEnd(
          dragEvent({
            active,
            over: { id: grp(groupId(config, 'Code')), data: groupData(config, 'Code') }
          })
        )
      );

      expect(
        appliedTo(apply, config)
          .groups.find((item) => item.name === 'Code')!
          .bookmarks.map((item) => item.name)
      ).toEqual(['GitHub', 'npm', 'MDN']);
    });

    it('keeps a bookmark where it was when dropped on nothing', () => {
      const config = boardConfig();
      const { apply } = setup({ config });
      const active = {
        id: bm(bookmarkId(config, 'Code', 0)),
        data: bookmarkData(config, 'Code', 0)
      };
      act(() => handlers().onDragStart(dragEvent({ active })));

      act(() => handlers().onDragEnd(dragEvent({ active, over: null })));

      expect(appliedTo(apply, config).groups).toEqual(config.groups);
    });

    it('does nothing at all for a drag it knows nothing about', () => {
      const { apply } = setup();

      act(() => handlers().onDragEnd(dragEvent({ active: { id: 'mystery' } })));

      expect(apply).not.toHaveBeenCalled();
    });

    it('clears what it was carrying', () => {
      const config = boardConfig();
      setup({ config });
      const active = {
        id: bm(bookmarkId(config, 'Code', 0)),
        data: bookmarkData(config, 'Code', 0)
      };
      act(() => handlers().onDragStart(dragEvent({ active })));
      expect(document.querySelector('.board')).toHaveAttribute('data-dragging', 'bookmark');

      act(() => handlers().onDragEnd(dragEvent({ active, over: null })));

      expect(document.querySelector('.board')).not.toHaveAttribute('data-dragging');
    });
  });

  describe('the click that ends a drag', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('is not a click on whatever the drag ended over, for a moment', () => {
      const config = boardConfig();
      const { actions } = setup({ config, editing: true });
      const active = {
        id: bm(bookmarkId(config, 'Code', 0)),
        data: bookmarkData(config, 'Code', 0)
      };
      act(() => handlers().onDragStart(dragEvent({ active })));
      act(() => handlers().onDragEnd(dragEvent({ active, over: null })));

      fireEvent.click(screen.getByRole('button', { name: /New group/ }));
      expect(actions.onAddGroup).not.toHaveBeenCalled();

      act(() => {
        vi.advanceTimersByTime(61);
      });
      fireEvent.click(screen.getByRole('button', { name: /New group/ }));
      expect(actions.onAddGroup).toHaveBeenCalledTimes(1);
    });

    it('is the same after a cancelled drag', () => {
      const config = boardConfig();
      const { actions } = setup({ config, editing: true });
      act(() => handlers().onDragCancel({} as never));

      fireEvent.click(screen.getByRole('button', { name: /New group/ }));

      expect(actions.onAddGroup).not.toHaveBeenCalled();
    });
  });

  describe('collision detection', () => {
    const rect = (top: number, left: number, width = 100, height = 50): ReturnType<typeof rectOf> =>
      rectOf({ top, left, width, height });

    const container = (id: string, data: unknown, box: ReturnType<typeof rectOf>) => ({
      id,
      data: { current: data },
      rect: { current: box },
      disabled: false,
      node: { current: null },
      key: id
    });

    const detect = (
      config: PageConfig,
      options: {
        active: { id: string; data?: unknown };
        containers: ReturnType<typeof container>[];
        pointer?: { x: number; y: number } | null;
        collisionRect?: ReturnType<typeof rectOf>;
      }
    ): string[] => {
      setup({ config });
      const collide: CollisionDetection = handlers().collisionDetection;
      const result = collide({
        active: { id: options.active.id, data: { current: options.active.data } } as never,
        collisionRect: options.collisionRect ?? rect(0, 0),
        droppableRects: new Map(
          options.containers.map((item) => [item.id, item.rect.current])
        ) as never,
        droppableContainers: options.containers as never,
        pointerCoordinates: options.pointer === null ? null : (options.pointer ?? null)
      });

      return result.map((collision) => String(collision.id));
    };

    it('finds nothing for a drag it knows nothing about', () => {
      expect(detect(boardConfig(), { active: { id: 'x' }, containers: [] })).toEqual([]);
    });

    it('offers nothing to a group or widget, which are not carried this way', () => {
      const group = container('group:g', { type: 'group', groupId: 'g' }, rect(0, 0));

      expect(
        detect(boardConfig(), {
          active: { id: 'group:me', data: { type: 'group', groupId: 'me' } },
          containers: [group],
          pointer: { x: 10, y: 10 }
        })
      ).toEqual([]);
    });

    describe('for a bookmark', () => {
      const active = { id: 'bm:me', data: { type: 'bookmark', bookmarkId: 'me', groupId: 'a' } };
      const cardA = container(
        'bm:a1',
        { type: 'bookmark', bookmarkId: 'a1', groupId: 'a' },
        rect(100, 0)
      );
      const cardA2 = container(
        'bm:a2',
        { type: 'bookmark', bookmarkId: 'a2', groupId: 'a' },
        rect(200, 0)
      );
      const cardB = container(
        'bm:b1',
        { type: 'bookmark', bookmarkId: 'b1', groupId: 'b' },
        rect(100, 400)
      );
      const groupA = container('group:a', { type: 'group', groupId: 'a' }, rect(80, 0, 150, 300));
      const groupB = container('group:b', { type: 'group', groupId: 'b' }, rect(80, 400, 150, 300));
      const groupEmpty = container(
        'group:e',
        { type: 'group', groupId: 'e' },
        rect(500, 0, 150, 100)
      );
      const all = [cardA, cardA2, cardB, groupA, groupB, groupEmpty];

      it('prefers the card under the pointer', () => {
        expect(
          detect(boardConfig(), { active, containers: all, pointer: { x: 20, y: 110 } })
        ).toEqual(['bm:a1']);
      });

      it('takes the nearest card of the group the pointer is over, when between cards', () => {
        // In group A, in the gap below the first card and nearer the second.
        const found = detect(boardConfig(), {
          active,
          containers: all,
          pointer: { x: 20, y: 170 },
          collisionRect: rect(165, 0)
        });

        expect(found).toEqual(['bm:a2']);
      });

      it('takes the group itself when it has no cards to offer', () => {
        expect(
          detect(boardConfig(), { active, containers: all, pointer: { x: 20, y: 520 } })
        ).toEqual(['group:e']);
      });

      it('stays with the last answer in the gaps between groups', () => {
        const config = boardConfig();
        setup({ config });
        const collide = handlers().collisionDetection;
        const args = (pointer: { x: number; y: number }) => ({
          active: { id: active.id, data: { current: active.data } } as never,
          collisionRect: rect(0, 0),
          droppableRects: new Map(all.map((item) => [item.id, item.rect.current])) as never,
          droppableContainers: all as never,
          pointerCoordinates: pointer
        });

        collide(args({ x: 20, y: 110 }));
        const between = collide(args({ x: 300, y: 10 }));

        expect(between.map((collision) => collision.id)).toEqual(['bm:a1']);
      });

      it('finds nothing in the gaps when it has not been anywhere yet', () => {
        expect(
          detect(boardConfig(), { active, containers: all, pointer: { x: 300, y: 10 } })
        ).toEqual([]);
      });

      it('stays with the last answer when moved by keyboard, which has no pointer', () => {
        const config = boardConfig();
        setup({ config });
        const collide = handlers().collisionDetection;
        const base = {
          active: { id: active.id, data: { current: active.data } } as never,
          collisionRect: rect(0, 0),
          droppableRects: new Map(all.map((item) => [item.id, item.rect.current])) as never,
          droppableContainers: all as never
        };

        expect(collide({ ...base, pointerCoordinates: null })).toEqual([]);
        collide({ ...base, pointerCoordinates: { x: 20, y: 110 } });
        expect(collide({ ...base, pointerCoordinates: null }).map((c) => c.id)).toEqual(['bm:a1']);
      });

      it('forgets the last answer once the bookmark is put down', () => {
        const config = boardConfig();
        setup({ config });
        const collide = handlers().collisionDetection;
        const base = {
          active: { id: active.id, data: { current: active.data } } as never,
          collisionRect: rect(0, 0),
          droppableRects: new Map(all.map((item) => [item.id, item.rect.current])) as never,
          droppableContainers: all as never
        };
        collide({ ...base, pointerCoordinates: { x: 20, y: 110 } });

        act(() => handlers().onDragCancel({} as never));

        expect(collide({ ...base, pointerCoordinates: null })).toEqual([]);
      });
    });
  });

  describe('links dragged in from another tab', () => {
    const link = (types: string[], data: Record<string, string> = {}) => ({
      dataTransfer: {
        types,
        dropEffect: 'none',
        getData: (type: string) => data[type] ?? ''
      }
    });

    /** jsdom leaves relatedTarget out of a drag event, so it is set on the event itself. */
    const leave = (from: HTMLElement, to: Element): void => {
      const event = createEvent.dragLeave(from);
      Object.defineProperty(event, 'relatedTarget', { value: to });
      fireEvent(from, event);
    };

    it('lights the group a link is held over, and copies rather than moves', () => {
      setup();
      const target = group('Read');
      const event = link(['text/uri-list']);

      fireEvent.dragOver(target, event);

      expect(target).toHaveClass('grp--link-over');
      expect(event.dataTransfer.dropEffect).toBe('copy');
    });

    it('ignores a drag that is not carrying a link', () => {
      setup();

      fireEvent.dragOver(group('Read'), link(['text/plain']));

      expect(group('Read')).not.toHaveClass('grp--link-over');
    });

    it('lights only the group under the link, moving as it moves', () => {
      setup();

      fireEvent.dragOver(group('Read'), link(['text/uri-list']));
      fireEvent.dragOver(group('Code'), link(['text/uri-list']));

      expect(group('Code')).toHaveClass('grp--link-over');
      expect(group('Read')).not.toHaveClass('grp--link-over');
    });

    it('stops lighting a group when the link leaves it', () => {
      setup();
      fireEvent.dragOver(group('Read'), link(['text/uri-list']));

      leave(group('Read'), document.body);

      expect(group('Read')).not.toHaveClass('grp--link-over');
    });

    it('keeps lighting it while the link moves between the group’s own parts', () => {
      setup();
      fireEvent.dragOver(group('Read'), link(['text/uri-list']));

      leave(group('Read'), within(group('Read')).getByText('Aeon'));

      expect(group('Read')).toHaveClass('grp--link-over');
    });

    it('hands over a dropped link, with its title, and the group it landed on', () => {
      const config = boardConfig();
      const { actions } = setup({ config });
      const event = link(['text/uri-list'], {
        'text/uri-list': 'https://example.com/page',
        'text/x-moz-url': 'https://example.com/page\nA Page'
      });

      fireEvent.drop(group('Read'), event);

      expect(actions.onDropLink).toHaveBeenCalledExactlyOnceWith(
        groupId(config, 'Read'),
        'https://example.com/page',
        'A Page'
      );
      expect(group('Read')).not.toHaveClass('grp--link-over');
    });

    it('ignores a drop that carries no link', () => {
      const { actions } = setup();

      fireEvent.drop(group('Read'), link(['text/plain'], { 'text/plain': 'just some words' }));

      expect(actions.onDropLink).not.toHaveBeenCalled();
    });
  });

  describe('the grid', () => {
    type Item = NonNullable<GridLayoutProps['layout']>[number];

    const items = (): Record<string, Item> =>
      Object.fromEntries((gridProps().layout ?? []).map((item) => [item.i, item]));
    const groupItem = (config: PageConfig, name: string): Item =>
      items()[`group:${config.groups.find((item) => item.name === name)!.id}`]!;
    const widgetItem = (config: PageConfig, index: number): Item =>
      items()[`widget:${config.widgets[index]!.id}`]!;
    const cellOf = (name: string): HTMLElement => group(name).closest<HTMLElement>('.cell')!;

    /** A page where the Code group has been put somewhere, and the Read group given a height. */
    const arrangedConfig = (): PageConfig =>
      pageOf(
        sanitizeConfig({
          widgets: [{ type: 'calendar', width: 3 }],
          groups: [
            { name: 'Code', width: 6, column: 4, row: 10, bookmarks: [] },
            { name: 'Read', width: 4, height: 60, bookmarks: [] },
            { name: 'Folded', collapsed: true, height: 60, bookmarks: [] }
          ]
        }),
        0
      );

    /** Moves one card in the layout the grid was given, as dragging it would. */
    const moved = (key: string, to: Partial<Item>): Item[] =>
      (gridProps().layout ?? []).map((item) => (item.i === key ? { ...item, ...to } : item));

    describe('what it is given', () => {
      it('is twelve columns of tiny rows, with a gap between the columns and none below', () => {
        setup();

        expect(gridProps().gridConfig).toMatchObject({
          cols: 12,
          rowHeight: ROW_PX,
          margin: [GRID_GAP, 0],
          containerPadding: [0, 0]
        });
      });

      it('has every card on it, widgets and groups, at the width it has', () => {
        const config = boardConfig();
        setup({ config });

        expect(Object.keys(items())).toHaveLength(6);
        expect(widgetItem(config, 0)).toMatchObject({ w: 3 });
        expect(groupItem(config, 'Code')).toMatchObject({ w: 4, minW: 3, maxW: 12 });
      });

      it('keeps a card where it was put, and packs the others in below', () => {
        const config = arrangedConfig();
        setup({ config });

        expect(groupItem(config, 'Code')).toMatchObject({ x: 4, y: 10 });
        // The card with no place waits its turn after everything that has one.
        expect(widgetItem(config, 0).y).toBeGreaterThanOrEqual(10);
      });

      it('is as wide as the board measures, or a desktop’s width before it has', () => {
        setup();
        expect(gridProps().width).toBe(1200);
      });

      it('is carried by its headers, though not by their buttons, and never off the board', () => {
        setup();
        const drag = gridProps().dragConfig!;

        expect(drag.handle).toBe('.grp-head, .wdg-head');
        expect(drag.cancel).toContain('button');
        expect(drag.bounded).toBe(true);
        expect(drag.enabled).toBe(true);
      });
    });

    describe('how tall a card is', () => {
      // jsdom's own `offsetHeight`, which has to come back: nothing else measures to a number.
      const offsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight')!;
      let heights: Map<string, number>;
      let observers: { callback: (entries: unknown[]) => void; observe: Mock; disconnect: Mock }[];

      beforeEach(() => {
        heights = new Map();
        observers = [];
        Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
          configurable: true,
          get(this: HTMLElement) {
            return this.classList.contains('cell-fit')
              ? (heights.get(this.querySelector('[aria-label]')!.getAttribute('aria-label')!) ?? 0)
              : 0;
          }
        });
        vi.stubGlobal(
          'ResizeObserver',
          class {
            callback: (entries: unknown[]) => void;
            observe = vi.fn();
            disconnect = vi.fn();

            constructor(callback: (entries: unknown[]) => void) {
              this.callback = callback;
              observers.push(this);
            }
          }
        );
      });

      afterEach(() => {
        Object.defineProperty(HTMLElement.prototype, 'offsetHeight', offsetHeight);
        vi.unstubAllGlobals();
      });

      it('is as tall as it measures, and the board follows as it grows and shrinks', () => {
        heights.set('Read', 200);
        const config = boardConfig();
        setup({ config });
        expect(groupItem(config, 'Read').h).toBe(rowsFor(200));

        heights.set('Read', 340);
        act(() => observers.forEach((observer) => observer.callback([])));
        expect(groupItem(config, 'Read').h).toBe(rowsFor(340));

        heights.set('Read', 90);
        act(() => observers.forEach((observer) => observer.callback([])));
        expect(groupItem(config, 'Read').h).toBe(rowsFor(90));
      });

      it('has room for the gap beneath it in the rows it takes', () => {
        expect(rowsFor(200)).toBe(Math.ceil((200 + GRID_GAP) / ROW_PX));
        expect(rowsFor(0)).toBeGreaterThanOrEqual(1);
      });

      it('is the height it was given, and is not measured, once it has one', () => {
        const config = arrangedConfig();
        heights.set('Read', 999);
        setup({ config });

        expect(groupItem(config, 'Read').h).toBe(60);
        expect(cellOf('Read')).toHaveAttribute('data-fit', 'fixed');
        expect(cellOf('Code')).toHaveAttribute('data-fit', 'auto');
        // Only the cards that fit their contents are watched.
        const watched = observers.flatMap((observer) => observer.observe.mock.calls.flat());
        expect(watched).not.toContain(cellOf('Read').querySelector('.cell-fit'));
        expect(watched).toContain(cellOf('Code').querySelector('.cell-fit'));
      });

      it('goes back to its contents’ height when the height is taken away', () => {
        const config = arrangedConfig();
        heights.set('Read', 150);
        const { rerender } = setupWith(config);
        expect(groupItem(config, 'Read').h).toBe(60);

        const fitted: PageConfig = {
          ...config,
          groups: config.groups.map((item) =>
            item.name === 'Read' ? { ...item, height: undefined } : item
          )
        };
        rerender(fitted);

        expect(groupItem(fitted, 'Read').h).toBe(rowsFor(150));
        expect(cellOf('Read')).toHaveAttribute('data-fit', 'auto');
      });

      it('is just its header when folded, whatever height it was given, and cannot be resized', () => {
        const config = arrangedConfig();
        heights.set('Folded', 60);
        setup({ config });

        expect(groupItem(config, 'Folded').h).toBe(rowsFor(60));
        expect(groupItem(config, 'Folded').isResizable).toBe(false);
        expect(cellOf('Folded')).toHaveAttribute('data-fit', 'auto');
        expect(groupItem(config, 'Read').isResizable).toBeUndefined();
      });

      it('stops watching a card that goes', () => {
        const config = boardConfig();
        const { unmount } = setupWith(config);
        const watching = observers.length;

        unmount();

        expect(watching).toBeGreaterThan(0);
        expect(observers.every((observer) => observer.disconnect.mock.calls.length > 0)).toBe(true);
      });
    });

    describe('resizing', () => {
      it('is offered only while editing, from the right edge, the bottom edge and the corner', () => {
        const { unmount } = setupWith(boardConfig());
        expect(gridProps().resizeConfig?.enabled).toBe(false);
        unmount();

        setup({ editing: true });
        expect(gridProps().resizeConfig).toMatchObject({
          enabled: true,
          handles: ['se', 'e', 's']
        });
      });

      it('has handles that say how to use them', () => {
        setup({ editing: true });

        const handle = document.querySelector<HTMLElement>('.react-resizable-handle-se')!;
        expect(handle).toHaveAttribute('title', expect.stringContaining('double-click'));
        expect(document.querySelector('.react-resizable-handle-e')).not.toBeNull();
        expect(document.querySelector('.react-resizable-handle-s')).not.toBeNull();
      });

      it('moves the height in steps from the bottom edge or the corner, and not from the side', () => {
        setup();
        const steps = gridProps().constraints!.find((item) => item.name === 'height-steps')!;
        const item = { i: 'group:x', x: 0, y: 0, w: 4, h: 50 };
        const context = {} as never;

        expect(steps.constrainSize!(item, 4, 40, 's', context)).toEqual({ w: 4, h: 42 });
        expect(steps.constrainSize!(item, 5, 44, 'se', context)).toEqual({ w: 5, h: 42 });
        expect(steps.constrainSize!(item, 6, 51, 'e', context)).toEqual({ w: 6, h: 51 });
        expect(42 % HEIGHT_STEP).toBe(0);
      });

      it('shows the guides while a card is resized, and gives it the height it is pulled to', () => {
        const config = boardConfig();
        const { apply } = setup({ config, editing: true });
        const before = groupItem(config, 'Code');
        const key = before.i;

        act(() =>
          gridProps().onResizeStart!(gridProps().layout!, before, before, null, {} as Event, null)
        );
        expect(document.querySelector('.board')).toHaveAttribute('data-guides', 'on');
        // It holds its height while it is pulled, rather than following its contents.
        expect(cellOf('Code')).toHaveAttribute('data-fit', 'fixed');

        const after = { ...before, h: 60, w: 6 };
        act(() =>
          gridProps().onResizeStop!(moved(key, after), before, after, null, {} as Event, null)
        );

        expect(document.querySelector('.board')).not.toHaveAttribute('data-guides');
        const next = appliedTo(apply, config);
        expect(next.groups[0]).toMatchObject({ width: 6, height: 60 });
      });

      it('gives a card a height of its own only when it was pulled taller or shorter', () => {
        const config = boardConfig();
        const { apply } = setup({ config, editing: true });
        const before = groupItem(config, 'Code');
        const after = { ...before, w: 6 };

        act(() =>
          gridProps().onResizeStop!(moved(before.i, after), before, after, null, {} as Event, null)
        );

        const next = appliedTo(apply, config);
        expect(next.groups[0]!.width).toBe(6);
        expect(next.groups[0]!.height).toBeUndefined();
      });

      it('carries on when the grid gives no card, which it only does for a drop from outside', () => {
        const { apply } = setup({ editing: true });

        act(() => gridProps().onResizeStart!([], null, null, null, {} as Event, null));
        act(() => gridProps().onResizeStop!([], null, null, null, {} as Event, null));

        expect(document.querySelector('.board')).not.toHaveAttribute('data-guides');
        expect(apply).toHaveBeenCalledTimes(1);
      });

      it('sends a card back to its contents’ height when its handle is double-clicked', () => {
        const config = arrangedConfig();
        const { apply } = setup({ config, editing: true });
        const readHeight = (page: PageConfig) => page.groups.find((g) => g.name === 'Read')!.height;

        fireEvent.doubleClick(
          cellOf('Read').querySelector('.react-resizable-handle-s') as HTMLElement
        );

        expect(readHeight(config)).toBe(60);
        expect(readHeight(appliedTo(apply, config))).toBeUndefined();
      });

      it('leaves a card alone when anything else on it is double-clicked', () => {
        const config = arrangedConfig();
        const { apply } = setup({ config, editing: true });

        fireEvent.doubleClick(within(group('Read')).getByRole('heading', { name: 'Read' }));

        expect(apply).not.toHaveBeenCalled();
      });

      it('does the same for a widget', () => {
        const config = pageOf(
          sanitizeConfig({ widgets: [{ type: 'calendar', width: 3, height: 90 }] }),
          0
        );
        const { apply } = setup({ config, editing: true });

        fireEvent.doubleClick(
          document.querySelector('.cell[data-kind="widget"] .react-resizable-handle-se')!
        );

        expect(config.widgets[0]!.height).toBe(90);
        expect(appliedTo(apply, config).widgets[0]!.height).toBeUndefined();
      });
    });

    describe('moving a card', () => {
      it('shows the guides, and says what is carried, while a group or widget is held', () => {
        const config = boardConfig();
        setup({ config });
        const board = document.querySelector('.board')!;

        act(() =>
          gridProps().onDragStart!(
            gridProps().layout!,
            groupItem(config, 'Code'),
            null,
            null,
            {} as Event,
            null
          )
        );
        expect(board).toHaveAttribute('data-dragging', 'group');
        expect(board).toHaveAttribute('data-guides', 'on');

        act(() =>
          gridProps().onDragStop!(gridProps().layout!, null, null, null, {} as Event, null)
        );
        expect(board).not.toHaveAttribute('data-dragging');
        expect(board).not.toHaveAttribute('data-guides');

        act(() =>
          gridProps().onDragStart!(
            gridProps().layout!,
            widgetItem(config, 0),
            null,
            null,
            {} as Event,
            null
          )
        );
        expect(board).toHaveAttribute('data-dragging', 'widget');
      });

      it('writes down where it was put, and the order the cards now read in', () => {
        const config = boardConfig();
        const { apply } = setup({ config });
        const read = groupItem(config, 'Read');

        act(() =>
          gridProps().onDragStop!(
            moved(read.i, { x: 0, y: 0 }),
            read,
            { ...read, x: 0, y: 0 },
            null,
            {} as Event,
            null
          )
        );

        const next = appliedTo(apply, config);
        expect(next.groups.find((item) => item.name === 'Read')).toMatchObject({
          column: 0,
          row: 0
        });
        expect(next.groups[0]!.name).toBe('Read');
      });

      it('changes nothing when the card ends up where it began', () => {
        const config = boardConfig();
        const { apply } = setup({ config });
        const placed = gridProps().layout!;

        act(() => gridProps().onDragStop!(placed, null, null, null, {} as Event, null));
        const first = appliedTo(apply, config);
        // Applying the same layout to the page it produced is a no-op.
        const again = (apply.mock.calls[0]![0] as (page: PageConfig) => PageConfig)(first);

        expect(again).toBe(first);
      });

      it('does not take the click that ends it for a click on whatever it ended over', () => {
        vi.useFakeTimers();
        const config = boardConfig();
        const { actions } = setup({ config, editing: true });
        act(() =>
          gridProps().onDragStop!(gridProps().layout!, null, null, null, {} as Event, null)
        );

        fireEvent.click(screen.getByRole('button', { name: /New group/ }));
        expect(actions.onAddGroup).not.toHaveBeenCalled();

        act(() => {
          vi.advanceTimersByTime(61);
        });
        fireEvent.click(screen.getByRole('button', { name: /New group/ }));
        expect(actions.onAddGroup).toHaveBeenCalledTimes(1);
        vi.useRealTimers();
      });
    });

    describe('near the top or bottom of the window', () => {
      let frames: Map<number, FrameRequestCallback>;
      let scrollBy: ReturnType<typeof vi.fn>;

      const tick = (): void => {
        const due = [...frames.values()];
        frames.clear();
        act(() => {
          due.forEach((frame) => frame(0));
        });
      };

      beforeEach(() => {
        frames = new Map();
        let last = 0;
        scrollBy = vi.fn();
        vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
          last += 1;
          frames.set(last, callback);
          return last;
        });
        // A frame that has been cancelled does not run.
        vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
          frames.delete(id);
        });
        window.scrollBy = scrollBy as never;
      });

      afterEach(() => {
        vi.restoreAllMocks();
      });

      it('scrolls the page while a card is carried to the edge, and stops once it is put down', () => {
        const config = boardConfig();
        setup({ config });

        act(() =>
          gridProps().onDragStart!(
            gridProps().layout!,
            groupItem(config, 'Code'),
            null,
            null,
            {} as Event,
            null
          )
        );
        window.dispatchEvent(new MouseEvent('mousemove', { clientX: 200, clientY: 4 }));
        tick();
        expect(scrollBy).toHaveBeenCalledTimes(1);

        act(() =>
          gridProps().onDragStop!(gridProps().layout!, null, null, null, {} as Event, null)
        );
        window.dispatchEvent(new MouseEvent('mousemove', { clientX: 200, clientY: 4 }));
        tick();
        expect(scrollBy).toHaveBeenCalledTimes(1);
      });

      it('does the same while a card is resized', () => {
        const config = boardConfig();
        setup({ config, editing: true });
        const item = groupItem(config, 'Code');

        act(() =>
          gridProps().onResizeStart!(gridProps().layout!, item, item, null, {} as Event, null)
        );
        window.dispatchEvent(
          new MouseEvent('mousemove', { clientX: 200, clientY: window.innerHeight - 4 })
        );
        tick();
        expect(scrollBy).toHaveBeenCalledTimes(1);

        act(() =>
          gridProps().onResizeStop!(gridProps().layout!, item, item, null, {} as Event, null)
        );
        tick();
        expect(scrollBy).toHaveBeenCalledTimes(1);
      });
    });

    describe('the order the cards read in', () => {
      it('is top to bottom and left to right, whichever are widgets and whichever groups', () => {
        const config = pageOf(
          sanitizeConfig({
            widgets: [{ type: 'calendar', width: 3, column: 0, row: 40 }],
            groups: [
              { name: 'Second', column: 4, row: 0, bookmarks: [] },
              { name: 'First', column: 0, row: 0, bookmarks: [] }
            ]
          }),
          0
        );
        setup({ config });

        expect(
          [...document.querySelectorAll('.cell')].map(
            (cell) => cell.querySelector('.grp, .wdg')!.getAttribute('aria-label') ?? cell.className
          )
        ).toEqual(['First', 'Second', 'Calendar']);
      });
    });

    describe('settling in', () => {
      it('slides cards into place only once the first frame has passed', () => {
        const frames: FrameRequestCallback[] = [];
        vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
          frames.push(callback);
          return frames.length;
        });
        vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
        setup();
        const grid = document.querySelector('.dash-grid')!;
        expect(grid).not.toHaveAttribute('data-settled');

        act(() => frames.forEach((frame) => frame(0)));

        expect(grid).toHaveAttribute('data-settled');
        vi.restoreAllMocks();
      });

      it('gives up waiting for that frame when it goes', () => {
        const cancel = vi.spyOn(window, 'cancelAnimationFrame');
        const { unmount } = setupWith(boardConfig());

        unmount();

        expect(cancel).toHaveBeenCalled();
        vi.restoreAllMocks();
      });
    });

    describe('on a narrow screen', () => {
      const widthIs = (pixels: number): void => {
        Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
          configurable: true,
          get: () => pixels
        });
      };

      afterEach(() => {
        delete (HTMLElement.prototype as { clientWidth?: number }).clientWidth;
      });

      it('lays a board as wide as a grid needs out as a grid', () => {
        widthIs(FLOW_BELOW);
        setup({ editing: true });

        expect(document.querySelector('.dash-layout')).not.toBeNull();
        expect(document.querySelector('.dash-flow')).toBeNull();
        expect(document.querySelectorAll('.grid-guides span')).toHaveLength(12);
        expect(gridProps().width).toBe(FLOW_BELOW);
      });

      it('stacks the cards instead, in the order they read, with no handles', () => {
        widthIs(FLOW_BELOW - 1);
        const config = pageOf(
          sanitizeConfig({
            widgets: [{ type: 'calendar', width: 3 }],
            groups: [
              { name: 'Wide', width: 8, bookmarks: [] },
              { name: 'Narrow', width: 4, bookmarks: [] }
            ]
          }),
          0
        );
        setup({ config, editing: true });

        expect(document.querySelector('.dash-layout')).toBeNull();
        expect(document.querySelector('.grid-guides')).toBeNull();
        expect(document.querySelector('.react-resizable-handle')).toBeNull();
        const cells = [...document.querySelectorAll('.dash-flow > .cell--flow')];
        expect(cells).toHaveLength(3);
        // A wide card spans every column; a narrow one takes its place in one.
        expect(group('Wide').closest('.cell')).toHaveAttribute('data-wide');
        expect(group('Narrow').closest('.cell')).not.toHaveAttribute('data-wide');
        expect(screen.getByRole('button', { name: /New group/ })).toBeInTheDocument();
      });

      it('follows the board as it is resized, between grid and stack', () => {
        widthIs(1200);
        setup();
        expect(document.querySelector('.dash-layout')).not.toBeNull();

        widthIs(500);
        act(() => {
          window.dispatchEvent(new Event('resize'));
        });

        expect(document.querySelector('.dash-flow')).not.toBeNull();
        expect(document.querySelector('.dash-layout')).toBeNull();
      });

      it('is watched for size with a ResizeObserver when there is one, and until it goes', () => {
        const disconnect = vi.fn();
        const callbacks: ((entries: unknown[]) => void)[] = [];
        vi.stubGlobal(
          'ResizeObserver',
          class {
            observe = vi.fn();
            disconnect = disconnect;

            constructor(callback: (entries: unknown[]) => void) {
              callbacks.push(callback);
            }
          }
        );
        widthIs(1200);
        const { unmount } = setupWith(boardConfig());

        widthIs(400);
        act(() => callbacks.forEach((callback) => callback([])));
        expect(document.querySelector('.dash-flow')).not.toBeNull();

        unmount();
        expect(disconnect).toHaveBeenCalled();
        vi.unstubAllGlobals();
      });
    });
  });
});
