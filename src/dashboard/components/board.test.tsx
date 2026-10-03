import { act, createEvent, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import type { CollisionDetection, DndContextProps } from '@dnd-kit/core';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { pageOf, sanitizeConfig, type PageConfig } from '../lib/model';
import { Board, type BoardActions } from './board';

// The real DndContext does the sorting; this only lets a test reach the handlers the board gave it.
const dnd = vi.hoisted(() => ({ props: null as unknown }));

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

const group = (name: string): HTMLElement => screen.getByRole('region', { name });
const namesIn = (name: string): string[] =>
  [...group(name).querySelectorAll('.bm-name')].map((node) => node.textContent ?? '');

/** What a change given to `apply` would turn the page into. */
const appliedTo = (apply: ReturnType<typeof vi.fn>, config: PageConfig, call = 0): PageConfig =>
  (apply.mock.calls[call]![0] as (page: PageConfig) => PageConfig)(config);

const groupNames = (config: PageConfig): string[] => config.groups.map((item) => item.name);

// Ids as the board gives them to dnd-kit.
const bm = (id: string): string => `bm:${id}`;
const grp = (id: string): string => `group:${id}`;
const wdg = (id: string): string => `widget:${id}`;

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

  describe('dragging', () => {
    it('shows the guides and says what is being carried while a group or widget is held', () => {
      const config = boardConfig();
      setup({ config });

      act(() =>
        handlers().onDragStart(
          dragEvent({
            active: { id: grp(groupId(config, 'Code')), data: groupData(config, 'Code') }
          })
        )
      );

      const board = document.querySelector('.board')!;
      expect(board).toHaveAttribute('data-dragging', 'group');
      expect(board).toHaveAttribute('data-guides', 'on');

      act(() => handlers().onDragCancel({} as never));
      expect(board).not.toHaveAttribute('data-dragging');
      expect(board).not.toHaveAttribute('data-guides');
    });

    it('shows the guides for a widget too', () => {
      const config = boardConfig();
      setup({ config });

      act(() =>
        handlers().onDragStart(
          dragEvent({
            active: {
              id: wdg(config.widgets[0]!.id),
              data: { type: 'widget', widgetId: config.widgets[0]!.id }
            }
          })
        )
      );

      expect(document.querySelector('.board')).toHaveAttribute('data-dragging', 'widget');
      expect(document.querySelector('.board')).toHaveAttribute('data-guides', 'on');
    });

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
    });

    it('ignores a drag it knows nothing about', () => {
      setup();

      act(() => handlers().onDragStart(dragEvent({ active: { id: 'mystery' } })));

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
    it('reorders groups', () => {
      const config = boardConfig();
      const { apply } = setup({ config });

      act(() =>
        handlers().onDragEnd(
          dragEvent({
            active: { id: grp(groupId(config, 'Code')), data: groupData(config, 'Code') },
            over: { id: grp(groupId(config, 'Empty')), data: groupData(config, 'Empty') }
          })
        )
      );

      expect(groupNames(appliedTo(apply, config))).toEqual(['Read', 'Empty', 'Code', 'Folded']);
    });

    it('reorders widgets', () => {
      const config = boardConfig();
      const [first, second] = config.widgets;
      const { apply } = setup({ config });

      act(() =>
        handlers().onDragEnd(
          dragEvent({
            active: { id: wdg(first!.id), data: { type: 'widget', widgetId: first!.id } },
            over: { id: wdg(second!.id), data: { type: 'widget', widgetId: second!.id } }
          })
        )
      );

      expect(appliedTo(apply, config).widgets.map((widget) => widget.id)).toEqual([
        second!.id,
        first!.id
      ]);
    });

    it('does nothing for a group put down on itself, on nothing, or on something unknown', () => {
      const config = boardConfig();
      const { apply } = setup({ config });
      const active = { id: grp(groupId(config, 'Code')), data: groupData(config, 'Code') };

      act(() =>
        handlers().onDragEnd(dragEvent({ active, over: { id: active.id, data: active.data } }))
      );
      act(() => handlers().onDragEnd(dragEvent({ active, over: null })));
      act(() =>
        handlers().onDragEnd(
          dragEvent({ active, over: { id: grp('gone'), data: { type: 'group', groupId: 'gone' } } })
        )
      );
      act(() =>
        handlers().onDragEnd(
          dragEvent({
            active: { id: grp('gone'), data: { type: 'group', groupId: 'gone' } },
            over: { id: grp(groupId(config, 'Read')), data: groupData(config, 'Read') }
          })
        )
      );

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
      const active = { id: grp(groupId(config, 'Code')), data: groupData(config, 'Code') };
      act(() => handlers().onDragStart(dragEvent({ active })));

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
      const active = { id: grp(groupId(config, 'Code')), data: groupData(config, 'Code') };
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

    it('offers a carried group only the groups, and picks the nearest', () => {
      const config = boardConfig();
      const near = container('group:near', { type: 'group', groupId: 'near' }, rect(0, 0));
      const far = container('group:far', { type: 'group', groupId: 'far' }, rect(500, 500));
      const card = container(
        'bm:card',
        { type: 'bookmark', bookmarkId: 'c', groupId: 'near' },
        rect(0, 0)
      );

      const found = detect(config, {
        active: { id: 'group:me', data: { type: 'group', groupId: 'me' } },
        containers: [card, far, near],
        collisionRect: rect(10, 10)
      });

      expect(found[0]).toBe('group:near');
      expect(found).not.toContain('bm:card');
    });

    it('offers a carried widget only the widgets', () => {
      const config = boardConfig();
      const widget = container('widget:w', { type: 'widget', widgetId: 'w' }, rect(0, 0));
      const group = container('group:g', { type: 'group', groupId: 'g' }, rect(0, 0));

      const found = detect(config, {
        active: { id: 'widget:me', data: { type: 'widget', widgetId: 'me' } },
        containers: [group, widget]
      });

      expect(found).toEqual(['widget:w']);
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

  describe('resizing', () => {
    beforeEach(() => {
      Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
        configurable: true,
        get: () => 1200
      });
      // Only the grid's own gap is faked; everything else is measured as usual.
      const real = window.getComputedStyle.bind(window);
      vi.spyOn(window, 'getComputedStyle').mockImplementation((element, pseudo) => {
        const style = real(element, pseudo);

        if (element.classList.contains('dash-grid')) {
          Object.defineProperty(style, 'columnGap', { configurable: true, value: '12px' });
        }

        return style;
      });
      HTMLElement.prototype.setPointerCapture = vi.fn();
    });

    afterEach(() => {
      delete (HTMLElement.prototype as { clientWidth?: number }).clientWidth;
      delete (HTMLElement.prototype as { setPointerCapture?: unknown }).setPointerCapture;
      vi.restoreAllMocks();
    });

    it('resizes a group by dragging its right edge, and shows the guides while it does', () => {
      const config = boardConfig();
      const { apply } = setup({ config, editing: true });
      const grip = screen.getByRole('separator', { name: 'Resize Code' });
      const width = config.groups[0]!.width;

      fireEvent.pointerDown(grip, { button: 0, clientX: 500, pointerId: 1 });
      expect(document.querySelector('.board')).toHaveAttribute('data-guides', 'on');

      fireEvent(grip, new MouseEvent('pointermove', { clientX: 500 + 101 * 2 }));
      expect(apply).toHaveBeenCalledTimes(1);
      expect(appliedTo(apply, config).groups[0]!.width).toBe(width + 2);

      fireEvent(grip, new Event('pointerup'));
      expect(document.querySelector('.board')).not.toHaveAttribute('data-guides');
    });

    it('resizes a widget the same way', () => {
      const config = boardConfig();
      const { apply } = setup({ config, editing: true });
      const grip = screen
        .getAllByRole('separator')
        .find(
          (node) =>
            /Resize/.test(node.getAttribute('aria-label') ?? '') &&
            !/Code|Read|Empty|Folded/.test(node.getAttribute('aria-label') ?? '')
        )!;

      fireEvent.pointerDown(grip, { button: 0, clientX: 500, pointerId: 1 });
      fireEvent(grip, new MouseEvent('pointermove', { clientX: 500 + 101 * 3 }));

      expect(appliedTo(apply, config).widgets[0]!.width).toBe(config.widgets[0]!.width + 3);
    });
  });
});
