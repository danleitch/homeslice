import {
  useCallback,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent,
  type MouseEvent,
  type ReactNode,
  type RefObject
} from 'react';
import {
  DndContext,
  DragOverlay,
  MeasuringStrategy,
  MouseSensor,
  TouchSensor,
  closestCenter,
  defaultDropAnimationSideEffects,
  pointerWithin,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type DropAnimation,
  type UniqueIdentifier
} from '@dnd-kit/core';
import { SortableContext, rectSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { FolderPlus, LayoutGrid } from 'lucide-react';
import type { ApplyToPage } from '../hooks/use-dashboard';
import { useJoinedRef, useMasonryRef } from '../hooks/use-masonry';
import { useSpanResize } from '../hooks/use-span-resize';
import {
  findBookmark,
  moveBookmark,
  moveGroup,
  moveWidget,
  updateGroup,
  updateWidget
} from '../lib/edit';
import {
  GRID_COLUMNS,
  type Bookmark,
  type PageConfig,
  type Group,
  type Widget
} from '../lib/model';
import { isLinkDrag, readDroppedLink } from '../lib/urls';
import { WidgetFrame } from '../widgets/widget-frame';
import { WidgetView } from '../widgets/widget-view';
import { BookmarkCard } from './bookmark-card';
import { GroupPanel } from './group-panel';

type DragData =
  | { type: 'bookmark'; bookmarkId: string; groupId: string }
  | { type: 'group'; groupId: string }
  | { type: 'widget'; widgetId: string };

const bookmarkKey = (id: string): string => `bm:${id}`;
const groupKey = (id: string): string => `group:${id}`;
const widgetKey = (id: string): string => `widget:${id}`;

const dataOf = (value: unknown): DragData | undefined => value as DragData | undefined;

const SORT_TRANSITION = { duration: 240, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' };

const dropAnimation: DropAnimation = {
  duration: 240,
  easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
  sideEffects: defaultDropAnimationSideEffects({ styles: { active: { opacity: '0.35' } } })
};

export type BoardActions = {
  onEditBookmark: (bookmark: Bookmark) => void;
  onDeleteBookmark: (bookmark: Bookmark) => void;
  onBookmarkMenu: (bookmark: Bookmark, event: MouseEvent) => void;
  onAddBookmark: (groupId: string) => void;
  onGroupMenu: (group: Group, event: MouseEvent) => void;
  onToggleGroup: (group: Group) => void;
  onAddGroup: () => void;
  onAddWidget: () => void;
  onConfigureWidget: (widget: Widget) => void;
  onRemoveWidget: (widget: Widget) => void;
  /** A link from another tab was dropped on a group. */
  onDropLink: (groupId: string, url: string, title: string) => void;
};

type BoardProps = BoardActions & {
  /** A bookmark just added or moved, which glows for a moment. */
  freshId?: string | null;
  config: PageConfig;
  editing: boolean;
  apply: ApplyToPage;
};

const GridGuides = (): JSX.Element => (
  <div className="grid-guides" aria-hidden="true">
    {Array.from({ length: GRID_COLUMNS }, (_unused, index) => (
      <span key={index} />
    ))}
  </div>
);

/** A dashed space in edit mode that makes something new. */
const GhostTile = ({
  span,
  onClick,
  children
}: {
  span: number;
  onClick: () => void;
  children: ReactNode;
}): JSX.Element => {
  const masonryRef = useMasonryRef();

  return (
    <button
      type="button"
      ref={masonryRef}
      className="ghost-tile"
      style={{ '--span': span, '--span-md': span <= 6 ? 6 : 12 } as CSSProperties}
      onClick={onClick}
    >
      {children}
    </button>
  );
};

type SortableBookmarkProps = {
  bookmark: Bookmark;
  groupId: string;
  group: Group;
  editing: boolean;
  newTab: boolean;
  actions: BoardActions;
  fresh: boolean;
};

const SortableBookmark = ({
  bookmark,
  groupId,
  group,
  editing,
  newTab,
  fresh,
  actions
}: SortableBookmarkProps): JSX.Element => {
  const { setNodeRef, listeners, transform, transition, isDragging } = useSortable({
    id: bookmarkKey(bookmark.id),
    data: { type: 'bookmark', bookmarkId: bookmark.id, groupId } satisfies DragData,
    transition: SORT_TRANSITION
  });

  return (
    <BookmarkCard
      ref={setNodeRef}
      bookmark={bookmark}
      variant={group.style}
      newTab={newTab}
      editing={editing}
      placeholder={isDragging}
      className={fresh ? 'bm--fresh' : undefined}
      data-bookmark-id={bookmark.id}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      onEdit={actions.onEditBookmark}
      onDelete={actions.onDeleteBookmark}
      onMenu={actions.onBookmarkMenu}
      {...listeners}
    />
  );
};

type SortableGroupProps = {
  group: Group;
  editing: boolean;
  newTab: boolean;
  gridRef: RefObject<HTMLDivElement>;
  linkOver: boolean;
  freshId: string | null;
  actions: BoardActions;
  apply: ApplyToPage;
  onResizing: (resizing: boolean) => void;
  onLinkOver: (groupId: string | null) => void;
};

const SortableGroup = ({
  group,
  editing,
  newTab,
  gridRef,
  linkOver,
  freshId,
  actions,
  apply,
  onResizing,
  onLinkOver
}: SortableGroupProps): JSX.Element => {
  const { setNodeRef, setActivatorNodeRef, listeners, transform, transition, isDragging } =
    useSortable({
      id: groupKey(group.id),
      data: { type: 'group', groupId: group.id } satisfies DragData,
      transition: SORT_TRANSITION
    });
  const nodeRef = useJoinedRef(setNodeRef, useMasonryRef());
  const resize = useSpanResize(
    gridRef,
    group.width,
    useCallback(
      (span: number) => apply((config) => updateGroup(config, group.id, { width: span })),
      [apply, group.id]
    ),
    onResizing
  );

  const handleLinkOver = (event: DragEvent<HTMLElement>): void => {
    if (!isLinkDrag(Array.from(event.dataTransfer.types))) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'copy';
    onLinkOver(group.id);
  };

  return (
    <GroupPanel
      ref={nodeRef}
      group={group}
      editing={editing}
      placeholder={isDragging}
      linkOver={linkOver}
      handleRef={setActivatorNodeRef}
      handleListeners={listeners}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      onAdd={(target) => actions.onAddBookmark(target.id)}
      onToggle={actions.onToggleGroup}
      onMenu={actions.onGroupMenu}
      onResizeStart={resize}
      onLinkDragOver={handleLinkOver}
      onLinkDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          onLinkOver(null);
        }
      }}
      onLinkDrop={(event) => {
        const link = readDroppedLink(event.dataTransfer);
        onLinkOver(null);

        if (link) {
          event.preventDefault();
          event.stopPropagation();
          actions.onDropLink(group.id, link.url, link.title);
        }
      }}
    >
      <SortableContext
        items={group.bookmarks.map((bookmark) => bookmarkKey(bookmark.id))}
        strategy={rectSortingStrategy}
      >
        {group.bookmarks.map((bookmark) => (
          <SortableBookmark
            key={bookmark.id}
            bookmark={bookmark}
            groupId={group.id}
            group={group}
            editing={editing}
            newTab={newTab}
            fresh={bookmark.id === freshId}
            actions={actions}
          />
        ))}
      </SortableContext>
    </GroupPanel>
  );
};

type SortableWidgetProps = {
  widget: Widget;
  config: PageConfig;
  editing: boolean;
  gridRef: RefObject<HTMLDivElement>;
  actions: BoardActions;
  apply: ApplyToPage;
  onResizing: (resizing: boolean) => void;
};

const SortableWidget = ({
  widget,
  config,
  editing,
  gridRef,
  actions,
  apply,
  onResizing
}: SortableWidgetProps): JSX.Element => {
  const { setNodeRef, setActivatorNodeRef, listeners, transform, transition, isDragging } =
    useSortable({
      id: widgetKey(widget.id),
      data: { type: 'widget', widgetId: widget.id } satisfies DragData,
      transition: SORT_TRANSITION
    });
  const nodeRef = useJoinedRef(setNodeRef, useMasonryRef());
  const resize = useSpanResize(
    gridRef,
    widget.width,
    useCallback(
      (span: number) => apply((current) => updateWidget(current, widget.id, { width: span })),
      [apply, widget.id]
    ),
    onResizing
  );

  return (
    <WidgetFrame
      ref={nodeRef}
      widget={widget}
      editing={editing}
      placeholder={isDragging}
      handleRef={setActivatorNodeRef}
      handleListeners={listeners}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      onConfigure={actions.onConfigureWidget}
      onRemove={actions.onRemoveWidget}
      onResizeStart={resize}
    >
      <WidgetView widget={widget} clock={config.clock} newTab={config.newTab} />
    </WidgetFrame>
  );
};

/** Where a dragged card's centre sits against the card it is over: past it, or before it. */
const isPast = (event: DragOverEvent): boolean => {
  const dragged = event.active.rect.current.translated;
  const over = event.over?.rect;

  if (!dragged || !over) {
    return false;
  }

  const dy = dragged.top + dragged.height / 2 - (over.top + over.height / 2);
  const dx = dragged.left + dragged.width / 2 - (over.left + over.width / 2);

  return Math.abs(dy) > over.height / 2 ? dy > 0 : dx > 0;
};

/**
 * The board: widgets along the top, then the groups, all on one 12-column
 * grid. Groups and widgets are carried by their headers; bookmarks by
 * themselves, within a group or across to another one.
 */
export const Board = ({
  config,
  editing,
  apply,
  freshId = null,
  ...actions
}: BoardProps): JSX.Element => {
  const [active, setActive] = useState<DragData | null>(null);
  const [draft, setDraft] = useState<Group[] | null>(null);
  const [resizing, setResizing] = useState(false);
  const [linkOver, setLinkOver] = useState<string | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const lastOverId = useRef<UniqueIdentifier | null>(null);
  const movedAcross = useRef(false);
  const justDragged = useRef(false);

  const groups = draft ?? config.groups;
  const groupsRef = useRef(groups);
  groupsRef.current = groups;

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } })
  );

  const collisionDetection = useCallback<CollisionDetection>((args) => {
    const data = dataOf(args.active.data.current);
    const ofType = (type: DragData['type']) =>
      args.droppableContainers.filter((container) => dataOf(container.data.current)?.type === type);

    if (!data) {
      return [];
    }

    if (data.type !== 'bookmark') {
      return closestCenter({ ...args, droppableContainers: ofType(data.type) });
    }

    const bookmarks = ofType('bookmark');

    if (args.pointerCoordinates) {
      // A card under the pointer is the clearest answer.
      const underCard = pointerWithin({ ...args, droppableContainers: bookmarks });

      if (underCard.length > 0) {
        lastOverId.current = underCard[0].id;
        return [underCard[0]];
      }

      // Over a group but between cards: the nearest card in that group, or
      // the group itself when it has none to offer.
      const underGroup = pointerWithin({ ...args, droppableContainers: ofType('group') });

      if (underGroup.length > 0) {
        const groupId = String(underGroup[0].id).slice('group:'.length);
        const inGroup = bookmarks.filter((container) => {
          const containerData = dataOf(container.data.current);
          return containerData?.type === 'bookmark' && containerData.groupId === groupId;
        });
        const nearest = inGroup.length
          ? closestCenter({ ...args, droppableContainers: inGroup })
          : [];
        const hit = nearest[0] ?? underGroup[0];
        lastOverId.current = hit.id;
        return [hit];
      }
    }

    // In the gaps between groups the card stays where it last was.
    return lastOverId.current ? [{ id: lastOverId.current }] : [];
  }, []);

  const finish = (): void => {
    setActive(null);
    lastOverId.current = null;
    justDragged.current = true;
    window.setTimeout(() => {
      justDragged.current = false;
    }, 60);
  };

  const handleDragStart = (event: DragStartEvent): void => {
    const data = dataOf(event.active.data.current);

    if (!data) {
      return;
    }

    setActive(data);

    if (data.type === 'bookmark') {
      setDraft(config.groups);
    }
  };

  const handleDragOver = (event: DragOverEvent): void => {
    const data = dataOf(event.active.data.current);
    const { over } = event;

    if (!over || data?.type !== 'bookmark' || movedAcross.current) {
      return;
    }

    const current = groupsRef.current;
    const from = findBookmark(current, data.bookmarkId);
    const overData = dataOf(over.data.current);

    if (!from || !overData) {
      return;
    }

    let toGroupId: string;
    let toIndex: number;

    if (overData.type === 'bookmark') {
      const target = findBookmark(current, overData.bookmarkId);

      if (!target || target.group.id === from.group.id) {
        // Within one group the sortable shifts the cards; the order is
        // settled when the card is put down.
        return;
      }

      toGroupId = target.group.id;
      toIndex = target.index + (isPast(event) ? 1 : 0);
    } else if (overData.type === 'group') {
      const target = current.find((group) => group.id === overData.groupId);

      if (!target || target.id === from.group.id || target.collapsed) {
        return;
      }

      toGroupId = target.id;
      toIndex = target.bookmarks.length;
    } else {
      return;
    }

    // One crossing per frame, so the groups' new sizes are measured before
    // the pointer is asked where it is again.
    movedAcross.current = true;
    window.requestAnimationFrame(() => {
      movedAcross.current = false;
    });
    setDraft(moveBookmark(current, data.bookmarkId, toGroupId, toIndex));
  };

  const handleDragEnd = (event: DragEndEvent): void => {
    const data = dataOf(event.active.data.current);
    const { over } = event;
    finish();

    if (!data) {
      setDraft(null);
      return;
    }

    if (data.type === 'group' || data.type === 'widget') {
      if (over && over.id !== event.active.id) {
        const list = data.type === 'group' ? config.groups : config.widgets;
        const key = data.type === 'group' ? groupKey : widgetKey;
        const from = list.findIndex((item) => key(item.id) === event.active.id);
        const to = list.findIndex((item) => key(item.id) === over.id);

        if (from !== -1 && to !== -1) {
          apply((current) =>
            data.type === 'group' ? moveGroup(current, from, to) : moveWidget(current, from, to)
          );
        }
      }

      return;
    }

    let next = groupsRef.current;
    const overData = dataOf(over?.data.current);

    if (overData?.type === 'bookmark' && overData.bookmarkId !== data.bookmarkId) {
      const from = findBookmark(next, data.bookmarkId);
      const to = findBookmark(next, overData.bookmarkId);

      if (from && to && from.group.id === to.group.id) {
        next = moveBookmark(next, data.bookmarkId, to.group.id, to.index);
      }
    } else if (overData?.type === 'group') {
      // A collapsed group takes a card dropped on its header, at the end.
      const from = findBookmark(next, data.bookmarkId);
      const target = next.find((group) => group.id === overData.groupId);

      if (from && target && from.group.id !== target.id) {
        next = moveBookmark(next, data.bookmarkId, target.id, target.bookmarks.length);
      }
    }

    apply((current) => ({ ...current, groups: next }));
    setDraft(null);
  };

  const handleDragCancel = (): void => {
    finish();
    setDraft(null);
  };

  const activeBookmark =
    active?.type === 'bookmark' ? findBookmark(groups, active.bookmarkId) : null;
  const activeGroup =
    active?.type === 'group' ? config.groups.find((group) => group.id === active.groupId) : null;
  const activeWidget =
    active?.type === 'widget'
      ? config.widgets.find((widget) => widget.id === active.widgetId)
      : null;
  const showGuides = resizing || active?.type === 'group' || active?.type === 'widget';

  let overlay: ReactNode = null;

  if (activeBookmark) {
    overlay = (
      <ul className="overlay-list">
        <BookmarkCard
          bookmark={activeBookmark.bookmark}
          variant={activeBookmark.group.style}
          newTab={config.newTab}
          overlay
        />
      </ul>
    );
  } else if (activeGroup) {
    overlay = (
      <GroupPanel group={activeGroup} editing={false} overlay>
        {activeGroup.bookmarks.map((bookmark) => (
          <BookmarkCard
            key={bookmark.id}
            bookmark={bookmark}
            variant={activeGroup.style}
            newTab={config.newTab}
          />
        ))}
      </GroupPanel>
    );
  } else if (activeWidget) {
    overlay = (
      <WidgetFrame widget={activeWidget} editing={false} overlay>
        <WidgetView widget={activeWidget} clock={config.clock} newTab={config.newTab} />
      </WidgetFrame>
    );
  }

  return (
    <div
      className="board"
      data-guides={showGuides ? 'on' : undefined}
      data-editing={editing ? 'on' : undefined}
      data-dragging={active ? active.type : undefined}
      onClickCapture={(event) => {
        // The click that ends a drag is not a click on the card it ended on.
        if (justDragged.current) {
          event.preventDefault();
          event.stopPropagation();
        }
      }}
    >
      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        {/* Widgets and groups share one grid, packed like masonry, so a tall
            widget never leaves a hole beside the groups that follow it. */}
        <div className="dash-grid" ref={gridRef}>
          <GridGuides />
          <SortableContext
            items={config.widgets.map((widget) => widgetKey(widget.id))}
            strategy={rectSortingStrategy}
          >
            {config.widgets.map((widget) => (
              <SortableWidget
                key={widget.id}
                widget={widget}
                config={config}
                editing={editing}
                gridRef={gridRef}
                actions={actions}
                apply={apply}
                onResizing={setResizing}
              />
            ))}
          </SortableContext>
          {editing && (
            <GhostTile span={4} onClick={actions.onAddWidget}>
              <LayoutGrid size={18} aria-hidden="true" />
              Add a widget
            </GhostTile>
          )}

          <SortableContext
            items={groups.map((group) => groupKey(group.id))}
            strategy={rectSortingStrategy}
          >
            {groups.map((group) => (
              <SortableGroup
                key={group.id}
                group={group}
                editing={editing}
                newTab={config.newTab}
                gridRef={gridRef}
                linkOver={linkOver === group.id}
                freshId={freshId}
                actions={actions}
                apply={apply}
                onResizing={setResizing}
                onLinkOver={setLinkOver}
              />
            ))}
          </SortableContext>
          {editing && (
            <GhostTile span={4} onClick={actions.onAddGroup}>
              <FolderPlus size={18} aria-hidden="true" />
              New group
            </GhostTile>
          )}
        </div>

        <DragOverlay dropAnimation={dropAnimation}>{overlay}</DragOverlay>
      </DndContext>
    </div>
  );
};
