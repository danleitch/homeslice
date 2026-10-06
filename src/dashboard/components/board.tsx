import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent,
  type MouseEvent,
  type ReactNode,
  type JSX
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
  useDroppable,
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
import { GridLayout, verticalCompactor } from 'react-grid-layout/react';
import {
  absoluteStrategy,
  gridBounds,
  minMaxSize,
  type LayoutConstraint
} from 'react-grid-layout/core';
import { FolderPlus, LayoutGrid } from 'lucide-react';
import type { ApplyToPage } from '../hooks/use-dashboard';
import { useEdgeScroll } from '../hooks/use-edge-scroll';
import { useElementWidth } from '../hooks/use-element-width';
import { findBookmark, fitCard, moveBookmark, placeCards } from '../lib/edit';
import {
  FLOW_BELOW,
  buildLayout,
  cardsOf,
  inReadingOrder,
  isFixed,
  rowsFor,
  type Card,
  type CardKind
} from '../lib/layout';
import {
  GRID_COLUMNS,
  GRID_GAP,
  HEIGHT_STEP,
  ROW_PX,
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
  { type: 'bookmark'; bookmarkId: string; groupId: string } | { type: 'group'; groupId: string };

const bookmarkKey = (id: string): string => `bm:${id}`;
const groupKey = (id: string): string => `group:${id}`;

const dataOf = (value: unknown): DragData | undefined => value as DragData | undefined;

const SORT_TRANSITION = { duration: 240, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' };

const dropAnimation: DropAnimation = {
  duration: 240,
  easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
  sideEffects: defaultDropAnimationSideEffects({ styles: { active: { opacity: '0.35' } } })
};

/** What the grid is given as its width before the board has been measured. */
const UNMEASURED_WIDTH = 1200;

/** Cards are carried by their headers, though not by what is in them. */
const DRAG_HANDLE = '.grp-head, .wdg-head';
const DRAG_CANCEL = 'button, a, input, select, textarea';

/** The bottom edge, and the corner, move in steps, so cards are easy to line up. */
const heightSteps: LayoutConstraint = {
  name: 'height-steps',
  constrainSize: (_item, w, h, handle) => ({
    w,
    h: handle.includes('s') ? Math.round(h / HEIGHT_STEP) * HEIGHT_STEP : h
  })
};

const CONSTRAINTS = [gridBounds, heightSteps, minMaxSize];

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
  /** A widget changed itself, like a task ticked off in Notes. */
  onUpdateWidget: (widget: Widget) => void;
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
  onClick,
  children
}: {
  onClick: () => void;
  children: ReactNode;
}): JSX.Element => (
  <button type="button" className="ghost-tile" onClick={onClick}>
    {children}
  </button>
);

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

type DroppableGroupProps = {
  group: Group;
  editing: boolean;
  newTab: boolean;
  linkOver: boolean;
  freshId: string | null;
  actions: BoardActions;
  onLinkOver: (groupId: string | null) => void;
};

/** A group, which a bookmark can be carried into, and a link from another tab dropped on. */
const DroppableGroup = ({
  group,
  editing,
  newTab,
  linkOver,
  freshId,
  actions,
  onLinkOver
}: DroppableGroupProps): JSX.Element => {
  const { setNodeRef } = useDroppable({
    id: groupKey(group.id),
    data: { type: 'group', groupId: group.id } satisfies DragData
  });

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
      ref={setNodeRef}
      group={group}
      linkOver={linkOver}
      onAdd={(target) => actions.onAddBookmark(target.id)}
      onToggle={actions.onToggleGroup}
      onMenu={actions.onGroupMenu}
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

/**
 * Wraps a card whose height is its contents', and tells the board how many
 * rows that is, now and whenever it changes. A card that has been given a
 * height needs no measuring.
 */
const Fit = ({
  cardKey,
  fixed,
  onFit,
  children
}: {
  cardKey: string;
  fixed: boolean;
  onFit: (key: string, rows: number) => void;
  children: ReactNode;
}): JSX.Element => {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const element = ref.current;

    if (!element || fixed) {
      return;
    }

    const measure = (): void => onFit(cardKey, rowsFor(element.offsetHeight));
    measure();

    if (typeof ResizeObserver !== 'function') {
      return;
    }

    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [cardKey, fixed, onFit]);

  return (
    <div ref={ref} className="cell-fit">
      {children}
    </div>
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
 * The board: widgets and groups, all cards on one 12-column grid. Cards are
 * carried by their headers and, in edit mode, resized from their right edge,
 * bottom edge or corner; the rest of the board shuffles out of the way and
 * closes up behind. A card is as tall as what is in it until it is resized.
 * Bookmarks are carried by themselves, within a group or across to another one.
 *
 * Below FLOW_BELOW pixels there is no room for a grid, so the cards simply
 * stack in the order they sit.
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
  const [moving, setMoving] = useState<CardKind | null>(null);
  const [resizing, setResizing] = useState<string | null>(null);
  const [fit, setFit] = useState<Record<string, number>>({});
  const [linkOver, setLinkOver] = useState<string | null>(null);
  const [settled, setSettled] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);
  const width = useElementWidth(gridRef);
  const edgeScroll = useEdgeScroll();
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

  // Cards slide into place, but not on the way in: they begin at a guess of
  // their height and close up as each is measured.
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setSettled(true));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const cards = useMemo(
    () => cardsOf({ widgets: config.widgets, groups }),
    [config.widgets, groups]
  );
  const layout = useMemo(() => buildLayout(cards, fit), [cards, fit]);
  const ordered = useMemo(() => inReadingOrder(cards, fit), [cards, fit]);
  const flow = width > 0 && width < FLOW_BELOW;

  const handleFit = useCallback(
    (key: string, rows: number): void =>
      setFit((current) => (current[key] === rows ? current : { ...current, [key]: rows })),
    []
  );

  const collisionDetection = useCallback<CollisionDetection>((args) => {
    const data = dataOf(args.active.data.current);
    const ofType = (type: DragData['type']) =>
      args.droppableContainers.filter((container) => dataOf(container.data.current)?.type === type);

    if (data?.type !== 'bookmark') {
      return [];
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

  /** The click that ends a drag is not a click on whatever it ended over. */
  const settleClicks = (): void => {
    justDragged.current = true;
    window.setTimeout(() => {
      justDragged.current = false;
    }, 60);
  };

  const finish = (): void => {
    setActive(null);
    lastOverId.current = null;
    settleClicks();
  };

  const handleDragStart = (event: DragStartEvent): void => {
    const data = dataOf(event.active.data.current);

    if (data?.type !== 'bookmark') {
      return;
    }

    setActive(data);
    setDraft(config.groups);
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
    } else {
      const target = current.find((group) => group.id === overData.groupId);

      if (!target || target.id === from.group.id || target.collapsed) {
        return;
      }

      toGroupId = target.id;
      toIndex = target.bookmarks.length;
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

    if (data?.type !== 'bookmark') {
      setDraft(null);
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
  const arranging = moving !== null || resizing !== null;

  const renderCard = (card: Card): JSX.Element => {
    if (card.kind === 'group') {
      const group = groups.find((candidate) => candidate.id === card.id)!;

      return (
        <DroppableGroup
          group={group}
          editing={editing}
          newTab={config.newTab}
          linkOver={linkOver === group.id}
          freshId={freshId}
          actions={actions}
          onLinkOver={setLinkOver}
        />
      );
    }

    const widget = config.widgets.find((candidate) => candidate.id === card.id)!;

    return (
      <WidgetFrame
        widget={widget}
        editing={editing}
        onConfigure={actions.onConfigureWidget}
        onRemove={actions.onRemoveWidget}
      >
        <WidgetView
          widget={widget}
          clock={config.clock}
          newTab={config.newTab}
          onChange={actions.onUpdateWidget}
        />
      </WidgetFrame>
    );
  };

  /** Pulling a handle twice sends a card back to the height of its contents. */
  const handleFitClick =
    (card: Card) =>
    (event: MouseEvent): void => {
      if ((event.target as Element).closest('.react-resizable-handle')) {
        apply((page) => fitCard(page, card.kind, card.id));
      }
    };

  const cell = (card: Card): JSX.Element => {
    const fixed = isFixed(card) || card.key === resizing;

    return (
      <div
        key={card.key}
        className="cell"
        data-kind={card.kind}
        data-fit={fixed ? 'fixed' : 'auto'}
        onDoubleClick={handleFitClick(card)}
      >
        <Fit cardKey={card.key} fixed={fixed} onFit={handleFit}>
          {renderCard(card)}
        </Fit>
      </div>
    );
  };

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
  }

  return (
    <div
      className="board"
      data-guides={arranging ? 'on' : undefined}
      data-editing={editing ? 'on' : undefined}
      data-dragging={active ? active.type : (moving ?? undefined)}
      onClickCapture={(event) => {
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
        {/* Widgets and groups share one grid, which closes up behind a short
            card so a tall one never leaves a hole beside it. */}
        <div
          className="dash-grid"
          ref={gridRef}
          data-settled={settled ? '' : undefined}
          style={{ '--board-gap': `${GRID_GAP}px`, '--board-row': `${ROW_PX}px` } as CSSProperties}
        >
          {flow ? (
            <div className="dash-flow">
              {ordered.map((card) => (
                <div
                  key={card.key}
                  className="cell cell--flow"
                  data-kind={card.kind}
                  data-wide={card.width > GRID_COLUMNS / 2 ? '' : undefined}
                >
                  {renderCard(card)}
                </div>
              ))}
            </div>
          ) : (
            <>
              <GridGuides />
              <GridLayout
                className="dash-layout"
                width={width || UNMEASURED_WIDTH}
                layout={layout}
                gridConfig={{
                  cols: GRID_COLUMNS,
                  rowHeight: ROW_PX,
                  margin: [GRID_GAP, 0],
                  containerPadding: [0, 0]
                }}
                dragConfig={{
                  enabled: true,
                  bounded: true,
                  handle: DRAG_HANDLE,
                  cancel: DRAG_CANCEL
                }}
                resizeConfig={{
                  enabled: editing,
                  handles: ['se', 'e', 's'],
                  handleComponent: (axis, ref) => (
                    <span
                      ref={ref}
                      className={`react-resizable-handle react-resizable-handle-${axis}`}
                      title="Drag to resize; double-click to fit the contents"
                    />
                  )
                }}
                positionStrategy={absoluteStrategy}
                compactor={verticalCompactor}
                constraints={CONSTRAINTS}
                onDragStart={(_layout, item) => {
                  edgeScroll.start();
                  setMoving(cards.find((card) => card.key === item?.i)?.kind ?? null);
                }}
                onDragStop={(next) => {
                  edgeScroll.stop();
                  setMoving(null);
                  settleClicks();
                  apply((page) => placeCards(page, next));
                }}
                onResizeStart={(_layout, item) => {
                  edgeScroll.start();
                  setResizing(item?.i ?? null);
                }}
                onResizeStop={(next, before, after) => {
                  edgeScroll.stop();
                  setResizing(null);
                  settleClicks();
                  // Only a card dragged taller or shorter is given a height of its own.
                  const taller = before && after && before.h !== after.h;
                  apply((page) => placeCards(page, next, taller ? before.i : undefined));
                }}
              >
                {ordered.map(cell)}
              </GridLayout>
            </>
          )}
        </div>

        {editing && (
          <div className="dash-add">
            <GhostTile onClick={actions.onAddWidget}>
              <LayoutGrid size={18} aria-hidden="true" />
              Add a widget
            </GhostTile>
            <GhostTile onClick={actions.onAddGroup}>
              <FolderPlus size={18} aria-hidden="true" />
              New group
            </GhostTile>
          </div>
        )}

        <DragOverlay dropAnimation={dropAnimation}>{overlay}</DragOverlay>
      </DndContext>
    </div>
  );
};
