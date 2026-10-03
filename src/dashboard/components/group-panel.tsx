import {
  forwardRef,
  type CSSProperties,
  type DragEvent,
  type HTMLAttributes,
  type MouseEvent,
  type PointerEvent,
  type ReactNode
} from 'react';
import { ChevronDown, GripVertical, MoreHorizontal, Plus } from 'lucide-react';
import type { DraggableSyntheticListeners } from '@dnd-kit/core';
import type { Group } from '../lib/model';
import { BookmarkIcon } from './bookmark-icon';
import { noDrag } from './no-drag';

type GroupPanelProps = Omit<HTMLAttributes<HTMLElement>, 'children' | 'onToggle'> & {
  group: Group;
  editing: boolean;
  children?: ReactNode;
  overlay?: boolean;
  placeholder?: boolean;
  /** A link from another tab is being held over this group. */
  linkOver?: boolean;
  handleRef?: (element: HTMLElement | null) => void;
  handleListeners?: DraggableSyntheticListeners;
  onAdd?: (group: Group) => void;
  onToggle?: (group: Group) => void;
  onMenu?: (group: Group, event: MouseEvent) => void;
  onResizeStart?: (event: PointerEvent<HTMLElement>) => void;
  onLinkDragOver?: (event: DragEvent<HTMLElement>) => void;
  onLinkDragLeave?: (event: DragEvent<HTMLElement>) => void;
  onLinkDrop?: (event: DragEvent<HTMLElement>) => void;
};

/** One group of bookmarks: a header to carry it by, and its cards. */
export const GroupPanel = forwardRef<HTMLElement, GroupPanelProps>(
  (
    {
      group,
      editing,
      children,
      overlay = false,
      placeholder = false,
      linkOver = false,
      handleRef,
      handleListeners,
      onAdd,
      onToggle,
      onMenu,
      onResizeStart,
      onLinkDragOver,
      onLinkDragLeave,
      onLinkDrop,
      className,
      style,
      ...rest
    },
    ref
  ) => {
    const count = group.bookmarks.length;

    return (
      <section
        ref={ref}
        className={[
          'grp',
          'glass',
          overlay && 'grp--overlay',
          placeholder && 'grp--placeholder',
          linkOver && 'grp--link-over',
          group.collapsed && 'grp--collapsed',
          className
        ]
          .filter(Boolean)
          .join(' ')}
        style={
          {
            '--span': group.width,
            '--span-md': group.width <= 6 ? 6 : 12,
            ...style
          } as CSSProperties
        }
        aria-label={group.name}
        data-dash=""
        onDragOver={onLinkDragOver}
        onDragLeave={onLinkDragLeave}
        onDrop={onLinkDrop}
        {...rest}
      >
        <header
          className="grp-head"
          ref={handleRef}
          {...handleListeners}
          onContextMenu={(event) => {
            if (onMenu) {
              event.preventDefault();
              onMenu(group, event);
            }
          }}
        >
          <GripVertical className="grp-grip" size={14} aria-hidden="true" />
          {group.icon && (
            <span className="grp-icon">
              <BookmarkIcon icon={group.icon} url="" name={group.name} />
            </span>
          )}
          <h2 className="grp-name">{group.name}</h2>
          <span className="grp-count" aria-label={`${count} bookmarks`}>
            {count}
          </span>
          <span className="grp-actions">
            {onAdd && (
              <button
                type="button"
                className="icon-btn"
                aria-label={`Add a bookmark to ${group.name}`}
                title="Add bookmark"
                {...noDrag}
                onClick={() => onAdd(group)}
              >
                <Plus size={15} />
              </button>
            )}
            {onMenu && (
              <button
                type="button"
                className="icon-btn"
                aria-label={`${group.name} options`}
                title="Options"
                {...noDrag}
                onClick={(event) => onMenu(group, event)}
              >
                <MoreHorizontal size={15} />
              </button>
            )}
            {onToggle && (
              <button
                type="button"
                className="icon-btn grp-toggle"
                aria-label={group.collapsed ? `Expand ${group.name}` : `Collapse ${group.name}`}
                aria-expanded={!group.collapsed}
                {...noDrag}
                onClick={() => onToggle(group)}
              >
                <ChevronDown size={15} />
              </button>
            )}
          </span>
        </header>

        {!group.collapsed && (
          <div className="grp-body">
            {count > 0 ? (
              <ul className={`grp-items grp-items--${group.style}`}>{children}</ul>
            ) : (
              <div className="grp-empty">
                <span>Drop bookmarks here</span>
                {onAdd && (
                  <button type="button" className="link-btn" onClick={() => onAdd(group)}>
                    or add one
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {editing && onResizeStart && (
          <span
            className="resize-grip"
            role="separator"
            aria-orientation="vertical"
            aria-label={`Resize ${group.name}`}
            title="Drag to resize"
            {...noDrag}
            onPointerDown={onResizeStart}
          />
        )}
      </section>
    );
  }
);

GroupPanel.displayName = 'GroupPanel';
