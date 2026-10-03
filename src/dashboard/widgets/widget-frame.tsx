import {
  forwardRef,
  type CSSProperties,
  type HTMLAttributes,
  type PointerEvent,
  type ReactNode,
  type JSX
} from 'react';
import { GripVertical, Settings2, X } from 'lucide-react';
import type { DraggableSyntheticListeners } from '@dnd-kit/core';
import { presetTitle } from '../lib/benchlm';
import { WIDGET_LABELS, type Widget } from '../lib/model';
import { noDrag } from '../components/no-drag';

type WidgetFrameProps = Omit<HTMLAttributes<HTMLElement>, 'children'> & {
  widget: Widget;
  editing: boolean;
  children: ReactNode;
  /** Something to show beside the title, like when the data was fetched. */
  aside?: ReactNode;
  overlay?: boolean;
  placeholder?: boolean;
  handleRef?: (element: HTMLElement | null) => void;
  handleListeners?: DraggableSyntheticListeners;
  onConfigure?: (widget: Widget) => void;
  onRemove?: (widget: Widget) => void;
  onResizeStart?: (event: PointerEvent<HTMLElement>) => void;
};

/** The glass every widget sits in, with a header to carry it by. */
export const WidgetFrame = forwardRef<HTMLElement, WidgetFrameProps>(
  (
    {
      widget,
      editing,
      children,
      aside,
      overlay = false,
      placeholder = false,
      handleRef,
      handleListeners,
      onConfigure,
      onRemove,
      onResizeStart,
      className,
      style,
      ...rest
    },
    ref
  ) => {
    const subtitle = widget.type === 'benchlm' ? presetTitle(widget) : null;

    return (
      <section
        ref={ref}
        className={[
          'wdg',
          'glass',
          `wdg--${widget.type}`,
          overlay && 'wdg--overlay',
          placeholder && 'wdg--placeholder',
          className
        ]
          .filter(Boolean)
          .join(' ')}
        style={
          {
            '--span': widget.width,
            '--span-md': widget.width <= 6 ? 6 : 12,
            ...style
          } as CSSProperties
        }
        aria-label={WIDGET_LABELS[widget.type]}
        data-dash=""
        {...rest}
      >
        <header className="wdg-head" ref={handleRef} {...handleListeners}>
          <GripVertical className="grp-grip" size={13} aria-hidden="true" />
          <h2 className="wdg-title">
            {WIDGET_LABELS[widget.type]}
            {subtitle && (
              <>
                <span aria-hidden="true"> · </span>
                <span className="wdg-title-sub">{subtitle}</span>
              </>
            )}
          </h2>
          {aside && <span className="wdg-aside">{aside}</span>}
          <span className="wdg-actions">
            {onConfigure && (
              <button
                type="button"
                className="icon-btn"
                aria-label={`Configure ${WIDGET_LABELS[widget.type]}`}
                title="Configure"
                {...noDrag}
                onClick={() => onConfigure(widget)}
              >
                <Settings2 size={14} />
              </button>
            )}
            {editing && onRemove && (
              <button
                type="button"
                className="icon-btn icon-btn--danger"
                aria-label={`Remove ${WIDGET_LABELS[widget.type]}`}
                title="Remove"
                {...noDrag}
                onClick={() => onRemove(widget)}
              >
                <X size={14} />
              </button>
            )}
          </span>
        </header>
        <div className="wdg-body">{children}</div>
        {editing && onResizeStart && (
          <span
            className="resize-grip"
            role="separator"
            aria-orientation="vertical"
            aria-label={`Resize ${WIDGET_LABELS[widget.type]}`}
            title="Drag to resize"
            {...noDrag}
            onPointerDown={onResizeStart}
          />
        )}
      </section>
    );
  }
);

WidgetFrame.displayName = 'WidgetFrame';

/** A widget's body while it has nothing to show yet, or something went wrong. */
export const WidgetState = ({
  tone = 'muted',
  children,
  action
}: {
  tone?: 'muted' | 'error';
  children: ReactNode;
  action?: ReactNode;
}): JSX.Element => (
  <div className={`wdg-state wdg-state--${tone}`} role={tone === 'error' ? 'alert' : undefined}>
    <span>{children}</span>
    {action}
  </div>
);

/** Shimmering rows in the shape of what is coming. */
export const WidgetSkeleton = ({ rows = 3 }: { rows?: number }): JSX.Element => (
  <div className="wdg-skeleton" aria-label="Loading" role="status">
    {Array.from({ length: rows }, (_unused, index) => (
      <span key={index} style={{ '--i': index } as CSSProperties} />
    ))}
  </div>
);
