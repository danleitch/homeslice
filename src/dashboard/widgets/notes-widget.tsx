import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type JSX,
  type KeyboardEvent
} from 'react';
import { Pencil, Plus, X } from 'lucide-react';
import {
  MAX_ITEMS,
  MAX_ITEM_LENGTH,
  MAX_TEXT,
  addItem,
  clearDone,
  editItem,
  remaining,
  removeItem,
  toggleItem,
  type NoteItem,
  type NotesWidget as NotesWidgetConfig
} from '../lib/notes';

/** How long after the last key a note is saved, so typing doesn't save the board on every letter. */
const SAVE_AFTER_MS = 500;

type Change = (widget: NotesWidgetConfig) => void;

const Task = ({
  item,
  editing,
  onToggle,
  onEdit,
  onSave,
  onCancel,
  onRemove
}: {
  item: NoteItem;
  editing: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onSave: (text: string) => void;
  onCancel: () => void;
  onRemove: () => void;
}): JSX.Element => {
  const id = useId();
  const [text, setText] = useState(item.text);
  const box = useRef<HTMLInputElement>(null);

  // The cursor goes into the words, which are selected, so typing replaces them.
  useEffect(() => {
    if (editing) {
      box.current?.focus();
      box.current?.select();
    }
  }, [editing]);

  if (editing) {
    return (
      <li className="nt-item nt-item--editing">
        <input
          ref={box}
          className="nt-edit"
          aria-label={`Reword “${item.text}”`}
          value={text}
          maxLength={MAX_ITEM_LENGTH}
          onChange={(event) => setText(event.target.value)}
          onBlur={() => onSave(text)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              onSave(text);
            } else if (event.key === 'Escape') {
              // The dialog this sits in, if any, would take Escape to mean "close".
              event.stopPropagation();
              onCancel();
            }
          }}
        />
      </li>
    );
  }

  return (
    <li className={`nt-item${item.done ? ' nt-item--done' : ''}`}>
      <input id={id} type="checkbox" className="nt-check" checked={item.done} onChange={onToggle} />
      <label htmlFor={id} className="nt-text">
        {item.text}
      </label>
      <span className="nt-tools">
        <button
          type="button"
          className="icon-btn"
          aria-label={`Reword “${item.text}”`}
          title="Reword"
          onClick={() => {
            setText(item.text);
            onEdit();
          }}
        >
          <Pencil size={13} />
        </button>
        <button
          type="button"
          className="icon-btn icon-btn--danger"
          aria-label={`Remove “${item.text}”`}
          title="Remove"
          onClick={onRemove}
        >
          <X size={13} />
        </button>
      </span>
    </li>
  );
};

const TaskList = ({
  widget,
  onChange
}: {
  widget: NotesWidgetConfig;
  onChange: Change;
}): JSX.Element => {
  const { items } = widget;
  const [adding, setAdding] = useState('');
  const [editing, setEditing] = useState<number | null>(null);
  const left = remaining(items);
  const full = items.length >= MAX_ITEMS;
  const change = (next: readonly NoteItem[]): void => onChange({ ...widget, items: [...next] });

  const add = (event: FormEvent): void => {
    event.preventDefault();
    change(addItem(items, adding));
    setAdding('');
  };

  return (
    <div className="nt">
      {items.length === 0 ? (
        <p className="nt-empty">Nothing to do. Add a task below.</p>
      ) : (
        <ul className="nt-list">
          {items.map((item, index) => (
            <Task
              // A task is told apart by its place: two can say the same, and none has an id.
              key={index}
              item={item}
              editing={editing === index}
              onToggle={() => change(toggleItem(items, index))}
              onEdit={() => setEditing(index)}
              onSave={(text) => {
                setEditing(null);
                change(editItem(items, index, text));
              }}
              onCancel={() => setEditing(null)}
              onRemove={() => change(removeItem(items, index))}
            />
          ))}
        </ul>
      )}

      <form className="nt-add" onSubmit={add}>
        <input
          aria-label="Add a task"
          placeholder={full ? 'The list is full' : 'Add a task'}
          value={adding}
          maxLength={MAX_ITEM_LENGTH}
          disabled={full}
          onChange={(event) => setAdding(event.target.value)}
        />
        <button
          type="submit"
          className="icon-btn"
          aria-label="Add"
          title="Add"
          disabled={full || !adding.trim()}
        >
          <Plus size={15} />
        </button>
      </form>

      {items.length > 0 && (
        <p className="nt-foot">
          <span>{left === 0 ? 'All done' : `${left} left`}</span>
          {left < items.length && (
            <button type="button" className="link-btn" onClick={() => change(clearDone(items))}>
              Clear done
            </button>
          )}
        </p>
      )}
    </div>
  );
};

const TextNote = ({
  widget,
  onChange
}: {
  widget: NotesWidgetConfig;
  onChange: Change;
}): JSX.Element => {
  const [draft, setDraft] = useState(widget.text);
  const [typing, setTyping] = useState(false);
  const [seen, setSeen] = useState(widget.text);
  const latest = useRef({ draft, widget, onChange });
  latest.current = { draft, widget, onChange };

  // What another tab wrote is shown, unless it is this one that is being typed in.
  if (seen !== widget.text) {
    setSeen(widget.text);

    if (!typing) {
      setDraft(widget.text);
    }
  }

  const save = (): void => {
    const current = latest.current;

    if (current.draft !== current.widget.text) {
      current.onChange({ ...current.widget, text: current.draft });
    }
  };

  // Saved a moment after the typing stops, when the note is left, and when the widget goes.
  useEffect(() => {
    if (draft === widget.text) {
      return undefined;
    }

    const timer = window.setTimeout(save, SAVE_AFTER_MS);
    return () => window.clearTimeout(timer);
    // `save` reads what is current, so it is the draft that starts the wait.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  useEffect(() => save, []);

  return (
    <div className="nt">
      <textarea
        className="nt-note"
        aria-label="Note"
        placeholder="Jot something down"
        value={draft}
        maxLength={MAX_TEXT}
        spellCheck
        onChange={(event) => setDraft(event.target.value)}
        onFocus={() => setTyping(true)}
        onBlur={() => {
          setTyping(false);
          save();
        }}
        onKeyDown={(event: KeyboardEvent) => {
          if (event.key === 'Escape') {
            // Leaving the note is what Escape does here, not closing something around it.
            event.stopPropagation();
            (event.target as HTMLElement).blur();
          }
        }}
      />
    </div>
  );
};

export const NotesWidget = ({
  widget,
  onChange
}: {
  widget: NotesWidgetConfig;
  /** Keeps what was written. Without it, a note can be read but not changed. */
  onChange?: Change;
}): JSX.Element => {
  const change: Change = onChange ?? (() => undefined);

  return widget.mode === 'text' ? (
    <TextNote widget={widget} onChange={change} />
  ) : (
    <TaskList widget={widget} onChange={change} />
  );
};
