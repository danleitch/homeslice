import { describe, expect, it } from 'vitest';
import {
  MAX_ITEMS,
  MAX_ITEM_LENGTH,
  MAX_TEXT,
  addItem,
  clearDone,
  editItem,
  readItems,
  readNote,
  remaining,
  removeItem,
  toggleItem,
  type NoteItem
} from './notes';

const items: NoteItem[] = [
  { text: 'one', done: false },
  { text: 'two', done: true },
  { text: 'three', done: false }
];

describe('readItems', () => {
  it('reads tasks with their words and whether they are done', () => {
    expect(readItems([{ text: 'Milk', done: true }, { text: 'Eggs' }])).toEqual([
      { text: 'Milk', done: true },
      { text: 'Eggs', done: false }
    ]);
  });

  it('takes bare words as tasks not yet done, as a hand-written list may have them', () => {
    expect(readItems(['Milk', 'Eggs'])).toEqual([
      { text: 'Milk', done: false },
      { text: 'Eggs', done: false }
    ]);
  });

  it('takes a number as its words, which YAML may have made of “2024”', () => {
    expect(readItems([{ text: 2024 }])).toEqual([{ text: '2024', done: false }]);
  });

  it('takes only a plain yes for done', () => {
    expect(
      readItems([
        { text: 'a', done: 'yes' },
        { text: 'b', done: 1 }
      ])
    ).toEqual([
      { text: 'a', done: false },
      { text: 'b', done: false }
    ]);
  });

  it('puts each task on one line, tidied, and to its length', () => {
    const [task] = readItems(['  a \n  b\t c  ', 'x'.repeat(MAX_ITEM_LENGTH + 50)]);
    expect(task).toEqual({ text: 'a b c', done: false });
    expect(readItems(['x'.repeat(MAX_ITEM_LENGTH + 50)])[0]!.text).toHaveLength(MAX_ITEM_LENGTH);
  });

  it('leaves out what is not a task, or says nothing', () => {
    expect(
      readItems(['', '   ', { text: '' }, { done: true }, { text: {} }, null, 7, [], ['x']])
    ).toEqual([]);
  });

  it('keeps no more than there is room for', () => {
    expect(readItems(Array.from({ length: MAX_ITEMS + 20 }, (_unused, n) => `t${n}`))).toHaveLength(
      MAX_ITEMS
    );
  });

  it.each([
    ['nothing', undefined],
    ['a string', 'milk'],
    ['an object', { text: 'a' }]
  ])('is empty for %s', (_what, value) => {
    expect(readItems(value)).toEqual([]);
  });
});

describe('readNote', () => {
  it('keeps the lines as they were written', () => {
    expect(readNote('one\n\n  two')).toBe('one\n\n  two');
  });

  it('writes line ends the one way', () => {
    expect(readNote('a\r\nb\rc')).toBe('a\nb\nc');
  });

  it('keeps to the length a note may be', () => {
    expect(readNote('x'.repeat(MAX_TEXT + 10))).toHaveLength(MAX_TEXT);
  });

  it.each([[undefined], [null], [42], [{}]])('is empty for %j', (value) => {
    expect(readNote(value)).toBe('');
  });
});

describe('addItem', () => {
  it('puts a task at the end, not done', () => {
    expect(addItem(items, '  four ')).toEqual([...items, { text: 'four', done: false }]);
  });

  it('does not change the list it was given', () => {
    const before = [...items];
    addItem(items, 'four');

    expect(items).toEqual(before);
  });

  it.each([[''], ['   '], ['\n\t']])('leaves the list as it is for %j', (text) => {
    expect(addItem(items, text)).toBe(items);
  });

  it('leaves the list as it is when there is no room', () => {
    const full = Array.from({ length: MAX_ITEMS }, (_unused, n) => ({
      text: `t${n}`,
      done: false
    }));

    expect(addItem(full, 'one more')).toBe(full);
  });

  it('keeps a task to its length', () => {
    expect(addItem([], 'x'.repeat(MAX_ITEM_LENGTH + 5))[0]!.text).toHaveLength(MAX_ITEM_LENGTH);
  });
});

describe('toggleItem', () => {
  it('ticks a task, and unticks it', () => {
    const ticked = toggleItem(items, 0);

    expect(ticked[0]!.done).toBe(true);
    expect(toggleItem(ticked, 0)[0]!.done).toBe(false);
  });

  it('changes that task and no other', () => {
    expect(toggleItem(items, 1)).toEqual([items[0], { text: 'two', done: false }, items[2]]);
  });

  it('changes nothing for a place with no task', () => {
    expect(toggleItem(items, 9)).toEqual(items);
  });
});

describe('editItem', () => {
  it('rewords a task, keeping whether it is done', () => {
    expect(editItem(items, 1, '  deux ')).toEqual([
      items[0],
      { text: 'deux', done: true },
      items[2]
    ]);
  });

  it('takes a task off when it is reworded to nothing', () => {
    expect(editItem(items, 1, '   ')).toEqual([items[0], items[2]]);
  });
});

describe('removeItem', () => {
  it('takes that task off and no other', () => {
    expect(removeItem(items, 0)).toEqual([items[1], items[2]]);
  });
});

describe('clearDone and remaining', () => {
  it('clears what was ticked off, keeping the order of the rest', () => {
    expect(clearDone(items)).toEqual([items[0], items[2]]);
  });

  it('counts what is left', () => {
    expect(remaining(items)).toBe(2);
    expect(remaining([])).toBe(0);
    expect(remaining(clearDone(items))).toBe(2);
  });
});
