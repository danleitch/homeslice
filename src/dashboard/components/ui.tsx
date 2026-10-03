import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type JSX
} from 'react';
import { createPortal } from 'react-dom';
import { ChevronRight, RotateCcw, X } from 'lucide-react';
import type { Toast } from '../hooks/use-dashboard';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Keeps Tab inside an open dialog, wrapping from the last control to the first. */
const trapTab = (event: KeyboardEvent<HTMLElement>): void => {
  if (event.key !== 'Tab') {
    return;
  }

  const focusable = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (element) => element.offsetParent !== null || element === document.activeElement
  );

  if (focusable.length === 0) {
    return;
  }

  const first = focusable[0];
  const last = focusable[focusable.length - 1];

  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
};

/** Puts focus inside a dialog when it opens and hands it back when it closes. */
const useDialogFocus = (ref: React.RefObject<HTMLElement | null>): void => {
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const element = ref.current;
    const target =
      element?.querySelector<HTMLElement>('[autofocus], [data-autofocus]') ??
      element?.querySelector<HTMLElement>(FOCUSABLE);
    target?.focus();

    return () => {
      if (previous && document.contains(previous)) {
        previous.focus();
      }
    };
  }, [ref]);
};

type ModalProps = {
  title: ReactNode;
  subtitle?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
};

export const Modal = ({
  title,
  subtitle,
  onClose,
  children,
  footer,
  size = 'md',
  className
}: ModalProps): JSX.Element => {
  const titleId = useId();
  const ref = useRef<HTMLDivElement>(null);
  useDialogFocus(ref);

  return createPortal(
    <div
      className="modal-backdrop"
      data-dash=""
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        ref={ref}
        className={`modal modal--${size}${className ? ` ${className}` : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.stopPropagation();
            onClose();
            return;
          }

          trapTab(event);
        }}
      >
        <header className="modal-head">
          <div>
            <h2 id={titleId}>{title}</h2>
            {subtitle && <p className="modal-subtitle">{subtitle}</p>}
          </div>
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
            <X size={16} />
          </button>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-foot">{footer}</footer>}
      </div>
    </div>,
    document.body
  );
};

type DrawerProps = {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  /** Settings slide in from the right; the Extensions view opens beside the side bar. */
  side?: 'left' | 'right';
  closeLabel?: string;
};

/** A panel that slides in from the right edge, for settings. */
export const Drawer = ({
  title,
  onClose,
  children,
  side = 'right',
  closeLabel = 'Close settings'
}: DrawerProps): JSX.Element => {
  const titleId = useId();
  const ref = useRef<HTMLDivElement>(null);
  useDialogFocus(ref);

  return createPortal(
    <div
      className={`drawer-backdrop drawer-backdrop--${side}`}
      data-dash=""
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <aside
        ref={ref}
        className="drawer glass"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.stopPropagation();
            onClose();
            return;
          }

          trapTab(event);
        }}
      >
        <header className="drawer-head">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="icon-btn" aria-label={closeLabel} onClick={onClose}>
            <X size={16} />
          </button>
        </header>
        {children}
      </aside>
    </div>,
    document.body
  );
};

export type MenuItem =
  | {
      label: string;
      icon?: ReactNode;
      onSelect?: () => void;
      danger?: boolean;
      disabled?: boolean;
      checked?: boolean;
      hint?: string;
      items?: MenuItem[];
    }
  | 'separator';

type MenuProps = {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
  label: string;
};

const MenuList = ({
  items,
  onClose,
  label,
  autoFocus,
  onBack
}: {
  items: MenuItem[];
  onClose: () => void;
  label: string;
  autoFocus: boolean;
  onBack?: () => void;
}): JSX.Element => {
  const [openSub, setOpenSub] = useState<number | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (autoFocus) {
      listRef.current?.querySelector<HTMLElement>('[role="menuitem"]:not([disabled])')?.focus();
    }
  }, [autoFocus]);

  const move = (event: KeyboardEvent<HTMLDivElement>): void => {
    const buttons = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>(
        ':scope > [role="menuitem"]:not([disabled])'
      )
    );
    const index = buttons.indexOf(document.activeElement as HTMLElement);

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      event.stopPropagation();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      buttons[(index + step + buttons.length) % buttons.length]?.focus();
    } else if (event.key === 'ArrowLeft' && onBack) {
      event.preventDefault();
      event.stopPropagation();
      onBack();
    }
  };

  return (
    <div className="menu glass" role="menu" aria-label={label} ref={listRef} onKeyDown={move}>
      {items.map((item, index) => {
        if (item === 'separator') {
          return <div key={`s${index}`} className="menu-sep" role="separator" />;
        }

        const hasSub = Boolean(item.items?.length);

        return (
          <div
            key={item.label}
            className="menu-row"
            onMouseEnter={() => setOpenSub(hasSub ? index : null)}
          >
            <button
              type="button"
              role="menuitem"
              className={`menu-item${item.danger ? ' menu-item--danger' : ''}`}
              disabled={item.disabled}
              aria-haspopup={hasSub ? 'menu' : undefined}
              aria-expanded={hasSub ? openSub === index : undefined}
              aria-checked={item.checked}
              onKeyDown={(event) => {
                if (hasSub && (event.key === 'ArrowRight' || event.key === 'Enter')) {
                  event.preventDefault();
                  event.stopPropagation();
                  setOpenSub(index);
                }
              }}
              onClick={() => {
                if (hasSub) {
                  setOpenSub(index);
                  return;
                }

                item.onSelect?.();
                onClose();
              }}
            >
              <span className="menu-icon">{item.icon}</span>
              <span className="menu-label">{item.label}</span>
              {item.checked && <span className="menu-check">✓</span>}
              {item.hint && <kbd className="menu-hint">{item.hint}</kbd>}
              {hasSub && <ChevronRight size={14} className="menu-chevron" />}
            </button>
            {hasSub && openSub === index && (
              <div className="menu-sub">
                <MenuList
                  items={item.items!}
                  onClose={onClose}
                  label={item.label}
                  autoFocus
                  onBack={() => {
                    setOpenSub(null);
                    listRef.current
                      ?.querySelectorAll<HTMLElement>(':scope > .menu-row > [role="menuitem"]')
                      [index]?.focus();
                  }}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

/** A right-click menu, kept inside the window wherever it was opened. */
export const ContextMenu = ({ x, y, items, onClose, label }: MenuProps): JSX.Element => {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: x, top: y });

  useLayoutEffect(() => {
    const element = ref.current;

    if (!element) {
      return;
    }

    const { width, height } = element.getBoundingClientRect();
    setPosition({
      left: Math.max(8, Math.min(x, window.innerWidth - width - 8)),
      top: Math.max(8, Math.min(y, window.innerHeight - height - 8))
    });
  }, [x, y]);

  useEffect(() => {
    const close = (event: Event): void => {
      if (!ref.current?.contains(event.target as Node)) {
        onClose();
      }
    };
    const handleKey = (event: globalThis.KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };

    document.addEventListener('mousedown', close, true);
    document.addEventListener('contextmenu', close, true);
    document.addEventListener('keydown', handleKey, true);
    window.addEventListener('resize', onClose);
    window.addEventListener('blur', onClose);

    return () => {
      document.removeEventListener('mousedown', close, true);
      document.removeEventListener('contextmenu', close, true);
      document.removeEventListener('keydown', handleKey, true);
      window.removeEventListener('resize', onClose);
      window.removeEventListener('blur', onClose);
    };
  }, [onClose]);

  return createPortal(
    <div
      ref={ref}
      className="menu-anchor"
      data-dash=""
      style={{ left: position.left, top: position.top }}
      onContextMenu={(event) => event.preventDefault()}
    >
      <MenuList items={items} onClose={onClose} label={label} autoFocus />
    </div>,
    document.body
  );
};

export const Toasts = ({
  toasts,
  onUndo,
  onDismiss
}: {
  toasts: Toast[];
  onUndo: (id: number) => void;
  onDismiss: (id: number) => void;
}): JSX.Element => (
  <div className="toasts" role="status" aria-live="polite" data-dash="">
    {toasts.map((toast) => (
      <div key={toast.id} className={`toast glass toast--${toast.tone}`}>
        <span className="toast-message">{toast.message}</span>
        {toast.undo && (
          <button type="button" className="toast-undo" onClick={() => onUndo(toast.id)}>
            <RotateCcw size={13} aria-hidden="true" />
            Undo
          </button>
        )}
        <button
          type="button"
          className="icon-btn toast-close"
          aria-label="Dismiss"
          onClick={() => onDismiss(toast.id)}
        >
          <X size={13} />
        </button>
      </div>
    ))}
  </div>
);

/** A row of mutually exclusive choices, like a segmented control on a phone. */
export const Segmented = <T extends string>({
  value,
  options,
  onChange,
  label
}: {
  value: T;
  options: readonly { value: T; label: ReactNode; title?: string }[];
  onChange: (value: T) => void;
  label: string;
}): JSX.Element => (
  <div className="segmented" role="radiogroup" aria-label={label}>
    {options.map((option) => (
      <button
        key={option.value}
        type="button"
        role="radio"
        aria-checked={value === option.value}
        title={option.title}
        className="segmented-option"
        onClick={() => onChange(option.value)}
      >
        {option.label}
      </button>
    ))}
  </div>
);

/** A labelled form field. */
export const Field = ({
  label,
  hint,
  children,
  error
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
}): JSX.Element => (
  <label className="field">
    <span className="field-label">{label}</span>
    {children}
    {error ? (
      <span className="field-error" role="alert">
        {error}
      </span>
    ) : (
      hint && <span className="field-hint">{hint}</span>
    )}
  </label>
);

/** An on/off switch with its label. */
export const Switch = ({
  checked,
  onChange,
  label,
  hint
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  hint?: ReactNode;
}): JSX.Element => (
  <label className="switch-row">
    <span className="switch-text">
      <span className="field-label">{label}</span>
      {hint && <span className="field-hint">{hint}</span>}
    </span>
    <input
      type="checkbox"
      role="switch"
      className="switch"
      checked={checked}
      onChange={(event) => onChange(event.target.checked)}
    />
  </label>
);
