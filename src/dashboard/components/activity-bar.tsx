import { useCallback, useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { Blocks, Check, Pencil, Plus, Settings } from 'lucide-react';
import '../shell.css';

export type ActivityItem = {
  id: string;
  label: string;
  icon: ReactNode;
  shortcut?: string;
  active?: boolean;
  onSelect: () => void;
};

type ActivityBarProps = {
  /** Kept out at all times, rather than tucked away behind its tab. */
  pinned: boolean;
  /** Tools and apps from the enabled extensions, at the top like VS Code's views. */
  items: ActivityItem[];
  /** The app's own buttons, like the koi market's coins. */
  extras?: ReactNode;
  editing: boolean;
  extensionsOpen: boolean;
  onOpenExtensions: () => void;
  onAddBookmark: () => void;
  onToggleEdit: () => void;
  onOpenSettings: () => void;
  onContextMenu: (event: MouseEvent) => void;
};

/**
 * How long the bar waits after the pointer leaves before it tucks itself away:
 * long enough to wander off and come back without chasing it.
 */
const HIDE_DELAY_MS = 10_000;

const BarButton = ({
  label,
  shortcut,
  active,
  pressed,
  onClick,
  children
}: {
  label: string;
  shortcut?: string;
  active?: boolean;
  pressed?: boolean;
  onClick: () => void;
  children: ReactNode;
}): JSX.Element => (
  <button
    type="button"
    className="activity-btn"
    data-active={active ? '' : undefined}
    data-tip={shortcut ? `${label} (${shortcut})` : label}
    aria-label={label}
    aria-pressed={pressed}
    onClick={onClick}
  >
    {children}
  </button>
);

/**
 * The dashboard's controls down the left edge, as VS Code's activity bar:
 * tools at the top, making and managing at the foot. Unless pinned, it waits
 * off screen behind a small tab and slides out for the pointer or for focus.
 */
export const ActivityBar = ({
  pinned,
  items,
  extras,
  editing,
  extensionsOpen,
  onOpenExtensions,
  onAddBookmark,
  onToggleEdit,
  onOpenSettings,
  onContextMenu
}: ActivityBarProps): JSX.Element => {
  const [shown, setShown] = useState(false);
  const barRef = useRef<HTMLElement>(null);
  const tabRef = useRef<HTMLButtonElement>(null);
  const hideTimer = useRef<number>();
  const revealed = pinned || shown;

  const show = useCallback((): void => {
    window.clearTimeout(hideTimer.current);
    setShown(true);
  }, []);

  const hideSoon = useCallback((): void => {
    window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => {
      // Focus inside keeps it out: a keyboard visitor is still using it.
      if (!barRef.current?.contains(document.activeElement)) {
        setShown(false);
      }
    }, HIDE_DELAY_MS);
  }, []);

  useEffect(() => () => window.clearTimeout(hideTimer.current), []);

  // A tap anywhere else tucks it away again, for touch screens with no hover to leave.
  useEffect(() => {
    if (pinned || !shown) {
      return undefined;
    }

    const handlePointer = (event: PointerEvent): void => {
      const target = event.target as Node;

      if (!barRef.current?.contains(target) && !tabRef.current?.contains(target)) {
        setShown(false);
      }
    };

    document.addEventListener('pointerdown', handlePointer);
    return () => document.removeEventListener('pointerdown', handlePointer);
  }, [pinned, shown]);

  // Whatever a button opens takes the stage; an auto-hiding bar steps back for it.
  const run = (action: () => void) => (): void => {
    action();

    if (!pinned) {
      setShown(false);
    }
  };

  return (
    <>
      {!pinned && (
        <>
          <div className="activity-edge" aria-hidden="true" onMouseEnter={show} />
          <button
            ref={tabRef}
            type="button"
            className="activity-tab glass"
            data-dash=""
            aria-hidden="true"
            tabIndex={-1}
            data-hidden={revealed ? '' : undefined}
            onMouseEnter={show}
            onClick={() => (shown ? setShown(false) : show())}
          >
            <span className="activity-tab-grip" />
          </button>
        </>
      )}

      <nav
        ref={barRef}
        className="activity glass"
        aria-label="Dashboard"
        data-dash=""
        data-state={revealed ? 'shown' : 'hidden'}
        data-pinned={pinned ? '' : undefined}
        onMouseEnter={pinned ? undefined : show}
        onMouseLeave={pinned ? undefined : hideSoon}
        onFocus={pinned ? undefined : show}
        onBlur={(event) => {
          if (!pinned && !event.currentTarget.contains(event.relatedTarget as Node | null)) {
            hideSoon();
          }
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && !pinned && shown) {
            event.stopPropagation();
            setShown(false);
            (document.activeElement as HTMLElement | null)?.blur();
          }
        }}
        onContextMenu={(event) => {
          event.preventDefault();
          onContextMenu(event);
        }}
      >
        <div className="activity-group">
          {items.map((item) => (
            <BarButton
              key={item.id}
              label={item.label}
              shortcut={item.shortcut}
              active={item.active}
              onClick={run(item.onSelect)}
            >
              {item.icon}
            </BarButton>
          ))}
          {extras && <div className="activity-extras">{extras}</div>}
          <BarButton label="Extensions" active={extensionsOpen} onClick={run(onOpenExtensions)}>
            <Blocks size={20} aria-hidden="true" />
          </BarButton>
        </div>

        <div className="activity-group activity-group--end">
          <BarButton label="Add bookmark" shortcut="N" onClick={run(onAddBookmark)}>
            <Plus size={21} aria-hidden="true" />
          </BarButton>
          <BarButton
            label={editing ? 'Done editing' : 'Edit the board'}
            shortcut="E"
            pressed={editing}
            active={editing}
            onClick={onToggleEdit}
          >
            {editing ? (
              <Check size={20} aria-hidden="true" />
            ) : (
              <Pencil size={19} aria-hidden="true" />
            )}
          </BarButton>
          <BarButton label="Dashboard settings" onClick={run(onOpenSettings)}>
            <Settings size={20} aria-hidden="true" />
          </BarButton>
        </div>
      </nav>
    </>
  );
};
