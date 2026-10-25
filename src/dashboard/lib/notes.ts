/**
 * The Notes widget: a to-do list to tick off, or one note to jot things in. Its words are kept in
 * the widget's own settings, so they go with the board: saved with it in this browser, in its YAML
 * export, and in step with every other tab that has the board open.
 */
export type NoteItem = { text: string; done: boolean };

export type NotesMode = 'list' | 'text';

export const NOTES_MODES: readonly NotesMode[] = ['list', 'text'];

export type NotesWidget = {
  id: string;
  type: 'notes';
  width: number;
  /** A list of tasks, or a single note. */
  mode: NotesMode;
  items: NoteItem[];
  text: string;
};

export const MAX_ITEMS = 100;
export const MAX_ITEM_LENGTH = 200;
export const MAX_TEXT = 5000;

/** One task as it is kept: its words on one line, to the length a task may be. */
const tidy = (text: string): string => text.replace(/\s+/g, ' ').trim().slice(0, MAX_ITEM_LENGTH);

/** The tasks in a stored or hand-written list: bare words are tasks that are not done yet. */
export const readItems = (value: unknown): NoteItem[] =>
  (Array.isArray(value) ? value : [])
    .map((item): NoteItem | null => {
      if (typeof item === 'string') {
        return { text: tidy(item), done: false };
      }

      if (typeof item === 'object' && item !== null && !Array.isArray(item)) {
        const { text, done } = item as { text?: unknown; done?: unknown };
        return {
          text: typeof text === 'string' || typeof text === 'number' ? tidy(String(text)) : '',
          done: done === true
        };
      }

      return null;
    })
    .filter((item): item is NoteItem => item !== null && item.text !== '')
    .slice(0, MAX_ITEMS);

/** The note as it is kept: lines as they were written, to the length a note may be. */
export const readNote = (value: unknown): string =>
  typeof value === 'string' ? value.replace(/\r\n?/g, '\n').slice(0, MAX_TEXT) : '';

/** The list with a task added at the end; the same list when there is nothing to add or no room. */
export const addItem = (items: readonly NoteItem[], text: string): readonly NoteItem[] => {
  const kept = tidy(text);
  return kept && items.length < MAX_ITEMS ? [...items, { text: kept, done: false }] : items;
};

/** The list with a task ticked, or unticked. */
export const toggleItem = (items: readonly NoteItem[], index: number): readonly NoteItem[] =>
  items.map((item, position) => (position === index ? { ...item, done: !item.done } : item));

/** The list with a task reworded; a task reworded to nothing is taken off. */
export const editItem = (
  items: readonly NoteItem[],
  index: number,
  text: string
): readonly NoteItem[] => {
  const kept = tidy(text);

  return kept
    ? items.map((item, position) => (position === index ? { ...item, text: kept } : item))
    : removeItem(items, index);
};

export const removeItem = (items: readonly NoteItem[], index: number): readonly NoteItem[] =>
  items.filter((_item, position) => position !== index);

/** The list without what has been ticked off. */
export const clearDone = (items: readonly NoteItem[]): readonly NoteItem[] =>
  items.filter((item) => !item.done);

export const remaining = (items: readonly NoteItem[]): number =>
  items.filter((item) => !item.done).length;
