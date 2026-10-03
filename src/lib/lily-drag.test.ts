import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { attachLilyDragging, type LilyDragging } from './lily-drag';
import type { LilyPlacements } from './pond-decor';
import type { PondScenery } from './pond-scenery';

const PLACEMENTS = [{ x: 0.2, y: 0.3 }] as unknown as LilyPlacements;

/** A pad centred on (100, 100) that the pointer can pick up within 30px of. */
const makeScenery = (): {
  scenery: PondScenery;
  lilyAt: Mock<(x: number, y: number) => { index: number; x: number; y: number } | null>;
  moveLily: Mock<() => LilyPlacements>;
} => {
  const lilyAt = vi.fn((x: number, y: number) =>
    Math.hypot(x - 100, y - 100) <= 30 ? { index: 2, x: 100, y: 100 } : null
  );
  const moveLily = vi.fn(() => PLACEMENTS);

  return { scenery: { lilyAt, moveLily } as unknown as PondScenery, lilyAt, moveLily };
};

const pointer = (
  type: string,
  at: { x: number; y: number; id?: number; button?: number },
  target: EventTarget = window
): Event => {
  const event = Object.assign(
    new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      clientX: at.x,
      clientY: at.y,
      button: at.button ?? 0
    }),
    { pointerId: at.id ?? 1 }
  );

  target.dispatchEvent(event);
  return event;
};

describe('attachLilyDragging', () => {
  let drag: LilyDragging;
  let onMove: Mock<() => void>;
  let onDrop: Mock<(placements: LilyPlacements) => void>;
  let moveLily: ReturnType<typeof makeScenery>['moveLily'];
  let lilyAt: ReturnType<typeof makeScenery>['lilyAt'];

  beforeEach(() => {
    const made = makeScenery();
    onMove = vi.fn<() => void>();
    onDrop = vi.fn<(placements: LilyPlacements) => void>();
    moveLily = made.moveLily;
    lilyAt = made.lilyAt;
    drag = attachLilyDragging(made.scenery, { onMove, onDrop });
  });

  afterEach(() => {
    drag.detach();
    document.body.replaceChildren();
    document.body.style.cursor = '';
  });

  it('picks a lily up where it was taken hold of, and carries it by that spot', () => {
    pointer('pointerdown', { x: 110, y: 95 });
    pointer('pointermove', { x: 160, y: 145 });

    // Taken 10px right of and 5px above its heart, so the heart stays that far from the pointer.
    expect(moveLily).toHaveBeenCalledWith(2, 150, 150);
    expect(onMove).toHaveBeenCalledTimes(1);
  });

  it('puts the lily down with every placement as it now stands', () => {
    pointer('pointerdown', { x: 100, y: 100 });
    pointer('pointermove', { x: 200, y: 200 });
    pointer('pointerup', { x: 200, y: 200 });

    expect(onDrop).toHaveBeenCalledExactlyOnceWith(PLACEMENTS);
  });

  it('stops carrying it once it has been put down', () => {
    pointer('pointerdown', { x: 100, y: 100 });
    pointer('pointermove', { x: 150, y: 150 });
    pointer('pointerup', { x: 150, y: 150 });
    moveLily.mockClear();

    pointer('pointermove', { x: 300, y: 300 });

    expect(moveLily).not.toHaveBeenCalled();
  });

  it('also lets go when the press is cancelled', () => {
    pointer('pointerdown', { x: 100, y: 100 });
    pointer('pointermove', { x: 150, y: 150 });
    pointer('pointercancel', { x: 150, y: 150 });

    expect(onDrop).toHaveBeenCalledTimes(1);
  });

  it('does not report a drop for a press that never moved the pad', () => {
    pointer('pointerdown', { x: 100, y: 100 });
    pointer('pointerup', { x: 100, y: 100 });

    expect(onDrop).not.toHaveBeenCalled();
  });

  it('leaves a press on bare water alone', () => {
    const event = pointer('pointerdown', { x: 500, y: 500 });
    pointer('pointermove', { x: 520, y: 520 });

    expect(event.defaultPrevented).toBe(false);
    expect(moveLily).not.toHaveBeenCalled();
  });

  it('only answers the primary button', () => {
    const event = pointer('pointerdown', { x: 100, y: 100, button: 2 });
    pointer('pointermove', { x: 150, y: 150 });

    expect(event.defaultPrevented).toBe(false);
    // The pointer moving about still looks for a lily to offer the hand, but nothing was picked up.
    expect(lilyAt).not.toHaveBeenCalledWith(100, 100);
    expect(moveLily).not.toHaveBeenCalled();
  });

  it('leaves presses on buttons and dialogs to them, even over a lily', () => {
    const button = document.createElement('button');
    document.body.append(button);

    const event = pointer('pointerdown', { x: 100, y: 100 }, button);
    pointer('pointermove', { x: 150, y: 150 });

    expect(event.defaultPrevented).toBe(false);
    expect(moveLily).not.toHaveBeenCalled();
  });

  it('holds back text selection while a pad is held', () => {
    expect(pointer('pointerdown', { x: 100, y: 100 }).defaultPrevented).toBe(true);
  });

  it('ignores a second pointer while one is holding the pad', () => {
    pointer('pointerdown', { x: 100, y: 100, id: 1 });
    pointer('pointermove', { x: 150, y: 150, id: 9 });
    pointer('pointerup', { x: 150, y: 150, id: 9 });

    expect(moveLily).not.toHaveBeenCalled();
    expect(onDrop).not.toHaveBeenCalled();

    pointer('pointermove', { x: 150, y: 150, id: 1 });
    expect(moveLily).toHaveBeenCalledTimes(1);
  });

  describe('the cursor', () => {
    it('offers a hand over a lily, and takes it away elsewhere', () => {
      pointer('pointermove', { x: 105, y: 105 });
      expect(document.body.style.cursor).toBe('grab');

      pointer('pointermove', { x: 600, y: 600 });
      expect(document.body.style.cursor).toBe('');
    });

    it('does not offer the hand over a dialog, whatever lies beneath', () => {
      const dialog = document.createElement('div');
      dialog.setAttribute('role', 'dialog');
      document.body.append(dialog);

      pointer('pointermove', { x: 105, y: 105 }, dialog);

      expect(document.body.style.cursor).toBe('');
    });

    it('closes the hand while a pad is held, and opens it again on release', () => {
      pointer('pointerdown', { x: 100, y: 100 });
      expect(document.body.style.cursor).toBe('grabbing');

      pointer('pointermove', { x: 150, y: 150 });
      pointer('pointerup', { x: 150, y: 150 });
      expect(document.body.style.cursor).toBe('');
    });
  });

  describe('claimsClick', () => {
    const dragBy = (distance: number): void => {
      pointer('pointerdown', { x: 100, y: 100 });
      pointer('pointermove', { x: 100 + distance, y: 100 });
      pointer('pointerup', { x: 100 + distance, y: 100 });
    };

    it('claims the click that ends a real drag, once', () => {
      dragBy(40);

      expect(drag.claimsClick()).toBe(true);
      expect(drag.claimsClick()).toBe(false);
    });

    it('leaves a barely-moved press to be a click on the water', () => {
      dragBy(3);

      expect(drag.claimsClick()).toBe(false);
    });

    it('counts the furthest the pointer went, not where it ended', () => {
      pointer('pointerdown', { x: 100, y: 100 });
      pointer('pointermove', { x: 160, y: 100 });
      pointer('pointermove', { x: 101, y: 100 });
      pointer('pointerup', { x: 101, y: 100 });

      expect(drag.claimsClick()).toBe(true);
    });

    it('claims nothing when nothing was dragged', () => {
      expect(drag.claimsClick()).toBe(false);
    });
  });

  describe('touch', () => {
    const touch = (): Event => {
      const event = new Event('touchstart', { bubbles: true, cancelable: true });
      window.dispatchEvent(event);
      return event;
    };

    it('keeps the page still under a finger holding a pad', () => {
      pointer('pointerdown', { x: 100, y: 100 });

      expect(touch().defaultPrevented).toBe(true);
    });

    it('lets the page scroll when no pad is held', () => {
      expect(touch().defaultPrevented).toBe(false);
    });
  });

  describe('detach', () => {
    it('stops listening and gives the cursor back', () => {
      pointer('pointerdown', { x: 100, y: 100 });
      expect(document.body.style.cursor).toBe('grabbing');

      drag.detach();
      expect(document.body.style.cursor).toBe('');

      lilyAt.mockClear();
      moveLily.mockClear();
      pointer('pointerdown', { x: 100, y: 100 });
      pointer('pointermove', { x: 150, y: 150 });

      expect(lilyAt).not.toHaveBeenCalled();
      expect(moveLily).not.toHaveBeenCalled();
    });
  });
});
