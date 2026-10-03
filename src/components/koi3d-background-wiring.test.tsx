import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installCanvasStub, type CanvasStub } from '../test/canvas';
import { buildKoiRoster } from '../lib/koi-roster';
import type { FishReading } from '../lib/koi-inspect';
import type { PondStage } from '../lib/koi3d';
import type { RecentBranch } from '../types';
import { Koi3dBackground } from './koi3d-background';

// The 3D stage is what needs WebGL, so it is replaced by something that records what it is
// told and answers what it is asked. Everything around it is the real component: the 2D water
// and surface, the scenery and the lilies, the roster and the fish card.
const stages = vi.hoisted(() => ({
  made: [] as unknown[],
  hooks: null as unknown,
  fail: false
}));

vi.mock('../lib/koi3d', async (importOriginal) => {
  const real = await importOriginal<typeof import('../lib/koi3d')>();

  return {
    ...real,
    createPondStage: vi.fn((_canvas: unknown, _reduced: boolean, hooks: unknown) => {
      if (stages.fail) {
        throw new Error('no WebGL');
      }

      const stage = {
        draw: vi.fn(),
        setSize: vi.fn(),
        setIsland: vi.fn(),
        setRoster: vi.fn(),
        attend: vi.fn(),
        pick: vi.fn((): string | null => null),
        inspect: vi.fn(),
        grab: vi.fn(() => true),
        carry: vi.fn(),
        release: vi.fn(),
        dispose: vi.fn()
      };
      stages.made.push(stage);
      stages.hooks = hooks;
      return stage;
    })
  };
});

const WIDTH = 1200;
const HEIGHT = 800;

const branches = (...values: string[]): RecentBranch[] =>
  values.map((value) => ({ value, createdAt: '2026-01-01T00:00:00.000Z' }));

const READING: FishReading = {
  traits: {
    cruiseSpeed: 0.5,
    shyness: 0.5,
    socialAffinity: 0.5,
    awareness: 0.5,
    directionalCaution: 0.5,
    depthWillingness: 0.5,
    reactionIntensity: 0.5,
    turnResponsiveness: 0.5
  },
  pattern: 'kohaku',
  lengthCm: 41,
  activity: 'cruising'
};

type Props = Partial<Parameters<typeof Koi3dBackground>[0]>;

describe('Koi3dBackground', () => {
  let canvasStub: CanvasStub;
  let frames: Map<number, FrameRequestCallback>;
  let nextFrame: number;
  let cancelled: number[];
  let now: number;

  const stage = (): { [K in keyof PondStage]: ReturnType<typeof vi.fn> } =>
    stages.made[stages.made.length - 1] as never;
  const hooks = (): {
    onRipple: (x: number, y: number, strength: number) => void;
    readFood: () => unknown[];
    onEat: (id: number) => void;
  } => stages.hooks as never;

  const mount = (props: Props = {}): ReturnType<typeof render> =>
    render(<Koi3dBackground recentBranches={branches('feat/one')} baseFishCount={1} {...props} />);

  const canvases = (
    container: HTMLElement
  ): { water: HTMLCanvasElement; pond: HTMLCanvasElement; surface: HTMLCanvasElement } => {
    const [water, pond, surface] = container.querySelectorAll('canvas');
    return { water: water!, pond: pond!, surface: surface! };
  };

  const runFrame = (afterMs = 16): void => {
    const [id, callback] = [...frames.entries()].pop()!;
    frames.delete(id);
    now += afterMs;
    act(() => callback(now));
  };

  const setMotion = (reduced: boolean): void => {
    window.matchMedia = vi.fn((query: string) => ({
      matches: query.includes('reduced-motion') && reduced
    })) as never;
  };

  const pointer = (
    type: string,
    at: { x: number; y: number },
    extra: {
      buttons?: number;
      button?: number;
      id?: number;
      pointerType?: string;
      target?: EventTarget;
    } = {}
  ): void => {
    act(() => {
      const event = Object.assign(
        new MouseEvent(type, {
          bubbles: true,
          cancelable: true,
          clientX: at.x,
          clientY: at.y,
          button: extra.button ?? 0,
          buttons: extra.buttons ?? 1
        }),
        { pointerId: extra.id ?? 1, pointerType: extra.pointerType ?? 'mouse' }
      );
      (extra.target ?? window).dispatchEvent(event);
    });
  };

  beforeEach(() => {
    canvasStub = installCanvasStub();
    stages.made.length = 0;
    stages.hooks = null;
    stages.fail = false;
    frames = new Map();
    cancelled = [];
    nextFrame = 1;
    now = 1000;
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: WIDTH });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: HEIGHT });
    Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 1 });
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    setMotion(false);
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frames.set(nextFrame, callback);
      return nextFrame++;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
      cancelled.push(id);
      frames.delete(id);
    });
    vi.spyOn(performance, 'now').mockImplementation(() => now);
  });

  afterEach(() => {
    canvasStub.restore();
    vi.restoreAllMocks();
    delete (document as { hidden?: boolean }).hidden;
    delete (window as { matchMedia?: unknown }).matchMedia;
    document.documentElement.classList.remove('koi-over-fish', 'koi-carrying');
  });

  describe('the layers', () => {
    it('is three canvases: the water beneath, the koi, and the surface over them', () => {
      const { container } = mount();
      const { water, pond, surface } = canvases(container);

      expect(container.querySelectorAll('canvas')).toHaveLength(3);
      expect(water).toHaveClass('koi-pond', 'koi-water');
      expect(pond).toHaveClass('koi-pond');
      expect(surface).toHaveClass('koi-pond', 'koi-surface');
    });

    it('hides all three from assistive technology', () => {
      const { container } = mount();

      for (const canvas of container.querySelectorAll('canvas')) {
        expect(canvas).toHaveAttribute('aria-hidden', 'true');
      }
    });

    it('sizes the 2D layers to the window at the pixel ratio, and the 3D one in CSS', () => {
      Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 2 });
      const { container } = mount();
      const { water, pond, surface } = canvases(container);

      expect(water).toMatchObject({ width: WIDTH * 2, height: HEIGHT * 2 });
      expect(surface).toMatchObject({ width: WIDTH * 2, height: HEIGHT * 2 });
      expect(pond.style.width).toBe(`${WIDTH}px`);
      expect(pond.style.height).toBe(`${HEIGHT}px`);
    });

    it('stops short of twice the pixel ratio for the water', () => {
      Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 3 });

      expect(canvases(mount().container).water.width).toBe(WIDTH * 2);
    });

    it('opens the stage on the 3D canvas', () => {
      const { container } = mount();

      expect(stages.made).toHaveLength(1);
      expect(stage().setSize).toHaveBeenCalledWith(WIDTH, HEIGHT);
      expect(canvases(container).pond).toBeInstanceOf(HTMLCanvasElement);
    });
  });

  describe('the roster', () => {
    it('puts a koi in the pond for each entry, in the pond’s own terms', () => {
      mount({ recentBranches: branches('feat/one', 'feat/two'), baseFishCount: 2 });

      const entries = stage().setRoster.mock.calls[0]![0] as {
        key: string;
        seed: number;
        accent: string;
      }[];
      expect(entries.length).toBeGreaterThanOrEqual(2);
      expect(entries[0]).toMatchObject({
        key: expect.any(String),
        seed: expect.any(Number),
        accent: expect.any(String)
      });
    });

    it('is the same roster the 2D pond swims', () => {
      mount({ recentBranches: branches('feat/one'), baseFishCount: 3 });

      const entries = stage().setRoster.mock.calls[0]![0] as { key: string }[];
      expect(entries.map((entry) => entry.key)).toEqual(
        buildKoiRoster(branches('feat/one'), 3, undefined, undefined).map(
          (descriptor) => descriptor.key
        )
      );
    });

    it('changes in place when branches come and go, without opening another stage', () => {
      const { rerender } = mount({ baseFishCount: 1 });
      const lastRoster = (): unknown[] => {
        const { calls } = stage().setRoster.mock;
        return calls[calls.length - 1]![0] as unknown[];
      };
      const before = lastRoster().length;

      rerender(
        <Koi3dBackground recentBranches={branches('feat/one', 'feat/two')} baseFishCount={2} />
      );

      expect(stages.made).toHaveLength(1);
      expect(lastRoster().length).toBeGreaterThan(before);
    });

    it('does not ask for another frame when it does', () => {
      const { rerender } = mount();
      const before = frames.size;

      rerender(<Koi3dBackground recentBranches={branches('a', 'b')} baseFishCount={1} />);

      expect(frames.size).toBe(before);
    });
  });

  describe('each frame', () => {
    it('moves the koi, lets the surface settle, and paints both layers', () => {
      const { container } = mount();
      const { water, surface } = canvases(container);
      const waterCtx = canvasStub.contextOf(water);
      const surfaceCtx = canvasStub.contextOf(surface);
      waterCtx.reset();
      surfaceCtx.reset();

      runFrame(16);

      expect(stage().draw).toHaveBeenCalledWith(0.016);
      expect(waterCtx.callsTo('fillRect').length).toBeGreaterThan(0);
      expect(surfaceCtx.callsTo('clearRect')).toEqual([[0, 0, WIDTH, HEIGHT]]);
      expect(surfaceCtx.callsTo('drawImage').length).toBeGreaterThanOrEqual(5);
    });

    it('asks for the next frame, and keeps asking', () => {
      mount();
      expect(frames.size).toBe(1);

      runFrame();
      runFrame();

      expect(frames.size).toBe(1);
    });

    it('holds the koi where they are, rather than teleporting them, after the tab was away', () => {
      mount();

      runFrame(60_000);

      expect(stage().draw).toHaveBeenCalledWith(0.05);
    });

    it('lets the surface carry on past what the koi do', () => {
      const { container } = mount();
      const surfaceCtx = canvasStub.contextOf(canvases(container).surface);
      act(() => hooks().onRipple(300, 300, 1));

      runFrame(16);
      surfaceCtx.reset();
      runFrame(16);

      expect(surfaceCtx.callsTo('arc').length).toBeGreaterThan(0);
    });

    it('is painted without a layer that has no 2D context', () => {
      canvasStub.restore();

      expect(() => {
        mount();
        runFrame();
      }).not.toThrow();
    });
  });

  describe('the hooks the stage is given', () => {
    it('makes a ring when a koi gulps at the surface', () => {
      const { container } = mount();
      const surfaceCtx = canvasStub.contextOf(canvases(container).surface);

      act(() => hooks().onRipple(300, 300, 0.7));
      runFrame();

      expect(surfaceCtx.callsTo('arc').some(([x, y]) => x === 300 && y === 300)).toBe(true);
    });

    it('shows the pellets floating on the surface, and takes one when it is eaten', () => {
      mount();
      const context = canvasStub;
      expect(context).toBeDefined();

      // Pellets come from right-clicking the water.
      fireEvent.contextMenu(document.body, { clientX: 600, clientY: 400 });
      const before = hooks().readFood().length;
      expect(before).toBeGreaterThanOrEqual(6);

      const [first] = hooks().readFood() as { id: number }[];
      act(() => hooks().onEat(first!.id));

      expect(hooks().readFood().length).toBe(before - 1);
    });
  });

  describe('a hidden tab', () => {
    const setHidden = (hidden: boolean): void => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
      document.dispatchEvent(new Event('visibilitychange'));
    };

    it('gets no frames, and picks up again without a jump when it is back', () => {
      mount();
      const pending = [...frames.keys()][0]!;

      setHidden(true);
      expect(cancelled).toContain(pending);
      expect(frames.size).toBe(0);

      now += 600_000;
      setHidden(false);
      expect(frames.size).toBe(1);

      runFrame(16);
      expect(stage().draw).toHaveBeenLastCalledWith(0.016);
    });

    it('does not ask for a second frame when one is already coming', () => {
      mount();

      setHidden(false);

      expect(frames.size).toBe(1);
    });
  });

  describe('touching the water', () => {
    it('sends a ring out and calls the koi over', () => {
      mount();

      fireEvent.click(document.body, { clientX: 500, clientY: 300 });

      expect(stage().attend).toHaveBeenCalledWith({ x: 500, y: 300 });
    });

    it('ignores a click on a button, which was meant for it', () => {
      mount();
      const button = document.createElement('button');
      document.body.append(button);

      fireEvent.click(button, { clientX: 500, clientY: 300 });

      expect(stage().attend).not.toHaveBeenCalled();
      button.remove();
    });

    it('ignores any button but the main one', () => {
      mount();

      fireEvent.click(document.body, { clientX: 500, clientY: 300, button: 1 });

      expect(stage().attend).not.toHaveBeenCalled();
    });

    it('scatters a handful of food on a right click, instead of a menu', () => {
      mount();

      const proceeded = fireEvent.contextMenu(document.body, { clientX: 600, clientY: 400 });

      expect(proceeded).toBe(false);
      expect(hooks().readFood().length).toBeGreaterThanOrEqual(6);
    });

    it('leaves the browser’s menu alone over a button', () => {
      mount();
      const button = document.createElement('button');
      document.body.append(button);

      const proceeded = fireEvent.contextMenu(button, { clientX: 600, clientY: 400 });

      expect(proceeded).toBe(true);
      expect(hooks().readFood()).toHaveLength(0);
      button.remove();
    });

    it('keeps food on the water, even thrown at the very edge of the window', () => {
      mount();

      fireEvent.contextMenu(document.body, { clientX: 0, clientY: 0 });

      for (const pellet of hooks().readFood() as { x: number; y: number }[]) {
        expect(pellet.x).toBeGreaterThan(0);
        expect(pellet.y).toBeGreaterThan(0);
      }
    });
  });

  describe('a fish', () => {
    const SPOT = { x: 640, y: 480 };

    const withFish = (props: Props = {}): ReturnType<typeof render> => {
      const view = mount(props);
      const [first] = stage().setRoster.mock.calls[0]![0] as { key: string }[];
      stage().pick.mockImplementation((point: { x: number; y: number }) =>
        Math.hypot(point.x - SPOT.x, point.y - SPOT.y) < 30 ? first!.key : null
      );
      stage().inspect.mockReturnValue(READING);
      return view;
    };

    it('opens its card where it was clicked', async () => {
      withFish();

      pointer('pointerdown', SPOT);
      pointer('pointerup', SPOT);

      expect(await screen.findByRole('dialog')).toBeInTheDocument();
    });

    it('is not a touch on the water when it was the fish that was pressed', () => {
      withFish();

      pointer('pointerdown', SPOT);
      pointer('pointerup', SPOT);
      fireEvent.click(document.body, { clientX: SPOT.x, clientY: SPOT.y });

      expect(stage().attend).not.toHaveBeenCalled();
    });

    it('closes its card when the water is touched elsewhere', async () => {
      withFish();
      pointer('pointerdown', SPOT);
      pointer('pointerup', SPOT);
      expect(await screen.findByRole('dialog')).toBeInTheDocument();

      pointer('pointerdown', { x: 100, y: 100 });
      pointer('pointerup', { x: 100, y: 100 });
      fireEvent.click(document.body, { clientX: 100, clientY: 100 });

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('closes its card from the card’s own button', async () => {
      withFish();
      pointer('pointerdown', SPOT);
      pointer('pointerup', SPOT);

      await userEvent.click(await screen.findByRole('button', { name: /Close .*card/ }));

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('shows no card for a fish the pond cannot tell anything about', () => {
      withFish();
      stage().inspect.mockReturnValue(null);

      pointer('pointerdown', SPOT);
      pointer('pointerup', SPOT);

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('ignores a press that is not the main button, or is on a control', () => {
      withFish();
      const button = document.createElement('button');
      document.body.append(button);

      pointer('pointerdown', SPOT, { button: 2 });
      pointer('pointerup', SPOT, { button: 2 });
      pointer('pointerdown', SPOT, { target: button });
      pointer('pointerup', SPOT, { target: button });

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      button.remove();
    });

    it('ignores a press that was not on a fish', () => {
      withFish();

      pointer('pointerdown', { x: 10, y: 10 });
      pointer('pointerup', { x: 10, y: 10 });

      expect(stage().inspect).not.toHaveBeenCalled();
    });

    it('is the lily’s to move, when a lily floats over it', () => {
      withFish();
      // The first lily of the pond, over the fish.
      const lily = { x: 0.095 * WIDTH, y: 0.24 * HEIGHT };
      stage().pick.mockReturnValue('anything');

      pointer('pointerdown', lily);
      pointer('pointerup', lily);

      expect(stage().inspect).not.toHaveBeenCalled();
    });

    it('stops the press becoming a text selection, for a mouse on a fish', () => {
      withFish();
      pointer('pointerdown', SPOT);

      const proceeded = fireEvent.mouseDown(document.body, { clientX: SPOT.x, clientY: SPOT.y });

      expect(proceeded).toBe(false);
    });

    it('leaves a mouse press elsewhere alone', () => {
      withFish();
      pointer('pointerdown', { x: 10, y: 10 });

      expect(fireEvent.mouseDown(document.body, { clientX: 10, clientY: 10 })).toBe(true);
    });

    describe('under a finger', () => {
      const touch = (at: { x: number; y: number }, count = 1): boolean => {
        const event = new Event('touchstart', { bubbles: true, cancelable: true });
        const touches = Array.from({ length: count }, () => ({ clientX: at.x, clientY: at.y }));
        Object.defineProperty(event, 'touches', { value: touches });
        return window.dispatchEvent(event);
      };

      it('picks the fish up rather than scrolling the page', () => {
        withFish();

        expect(touch(SPOT)).toBe(false);
      });

      it('scrolls the page as usual when no fish is there, or more than one finger is down', () => {
        withFish();

        expect(touch({ x: 10, y: 10 })).toBe(true);
        expect(touch(SPOT, 2)).toBe(true);
      });
    });

    describe('being carried', () => {
      it('is picked up once the press has moved far enough', () => {
        withFish();
        pointer('pointerdown', SPOT);

        pointer('pointermove', { x: SPOT.x + 3, y: SPOT.y });
        expect(stage().grab).not.toHaveBeenCalled();

        pointer('pointermove', { x: SPOT.x + 20, y: SPOT.y });
        expect(stage().grab).toHaveBeenCalledTimes(1);
        expect(stage().grab).toHaveBeenCalledWith(expect.any(String), SPOT);
      });

      it('follows the pointer, and is put down where it is let go', () => {
        withFish();
        pointer('pointerdown', SPOT);
        pointer('pointermove', { x: SPOT.x + 20, y: SPOT.y });

        pointer('pointermove', { x: 800, y: 500 });
        expect(stage().carry).toHaveBeenLastCalledWith({ x: 800, y: 500 });

        pointer('pointerup', { x: 800, y: 500 });
        expect(stage().release).toHaveBeenCalledTimes(1);
      });

      it('marks the page while it is carried, so the cursor can say so', () => {
        withFish();
        pointer('pointerdown', SPOT);
        pointer('pointermove', { x: SPOT.x + 20, y: SPOT.y });
        expect(document.documentElement).toHaveClass('koi-carrying');

        pointer('pointerup', { x: 800, y: 500 });

        expect(document.documentElement).not.toHaveClass('koi-carrying');
      });

      it('puts the fish’s card away', async () => {
        withFish();
        pointer('pointerdown', SPOT);
        pointer('pointerup', SPOT);
        expect(await screen.findByRole('dialog')).toBeInTheDocument();

        pointer('pointerdown', SPOT);
        pointer('pointermove', { x: SPOT.x + 20, y: SPOT.y });

        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });

      it('is not a click when it is put down, so no card opens', () => {
        withFish();
        pointer('pointerdown', SPOT);
        pointer('pointermove', { x: SPOT.x + 20, y: SPOT.y });

        pointer('pointerup', { x: 800, y: 500 });

        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });

      it('is set down where it is when the button came up somewhere the page never heard of', () => {
        withFish();
        pointer('pointerdown', SPOT);
        pointer('pointermove', { x: SPOT.x + 20, y: SPOT.y });

        pointer('pointermove', { x: 700, y: 500 }, { buttons: 0 });

        expect(stage().release).toHaveBeenCalledTimes(1);
      });

      it('is put down when the press is cancelled, and opens no card', () => {
        withFish();
        pointer('pointerdown', SPOT);
        pointer('pointercancel', SPOT);

        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });

      it('is not carried when the fish cannot be picked up', () => {
        withFish();
        stage().grab.mockReturnValue(false);
        pointer('pointerdown', SPOT);

        pointer('pointermove', { x: SPOT.x + 20, y: SPOT.y });

        expect(stage().carry).not.toHaveBeenCalled();
        expect(document.documentElement).not.toHaveClass('koi-carrying');
      });

      it('answers only the pointer that pressed', () => {
        withFish();
        pointer('pointerdown', SPOT, { id: 1 });

        pointer('pointermove', { x: SPOT.x + 20, y: SPOT.y }, { id: 2 });
        pointer('pointerup', SPOT, { id: 2 });

        expect(stage().grab).not.toHaveBeenCalled();
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
    });

    describe('under the mouse', () => {
      it('shows the pointer can pick it up, until the pointer moves off', () => {
        withFish();

        pointer('pointermove', SPOT, { buttons: 0 });
        expect(document.documentElement).toHaveClass('koi-over-fish');

        pointer('pointermove', { x: 10, y: 10 }, { buttons: 0 });
        expect(document.documentElement).not.toHaveClass('koi-over-fish');
      });

      it('does not for a finger, which only touches or does not', () => {
        withFish();

        pointer('pointermove', SPOT, { buttons: 0, pointerType: 'touch' });

        expect(document.documentElement).not.toHaveClass('koi-over-fish');
      });

      it('does not over a control that is on top of the water', () => {
        withFish();
        const button = document.createElement('button');
        document.body.append(button);

        pointer('pointermove', SPOT, { buttons: 0, target: button });

        expect(document.documentElement).not.toHaveClass('koi-over-fish');
        button.remove();
      });
    });

    describe('its name', () => {
      it('is changed from the card, tidied, and told to the app', async () => {
        const onRenameFish = vi.fn();
        withFish({ onRenameFish });
        pointer('pointerdown', SPOT);
        pointer('pointerup', SPOT);
        const card = await screen.findByRole('dialog');

        await userEvent.click(within(card).getByRole('button', { name: /^Rename / }));
        const field = within(card).getByRole('textbox', { name: /^New name for / });
        await userEvent.clear(field);
        await userEvent.type(field, '  Bubbles  {Enter}');

        expect(onRenameFish).toHaveBeenCalledWith(expect.any(String), 'Bubbles');
        expect(within(screen.getByRole('dialog')).getByText('Bubbles')).toBeInTheDocument();
      });

      it('cannot be changed when the app has nowhere to keep the new name', async () => {
        withFish();
        pointer('pointerdown', SPOT);
        pointer('pointerup', SPOT);
        const card = await screen.findByRole('dialog');

        expect(within(card).queryByRole('button', { name: /^Rename / })).not.toBeInTheDocument();
      });

      it('is left alone when the new name is empty', async () => {
        const onRenameFish = vi.fn();
        withFish({ onRenameFish });
        pointer('pointerdown', SPOT);
        pointer('pointerup', SPOT);
        const card = await screen.findByRole('dialog');

        await userEvent.click(within(card).getByRole('button', { name: /^Rename / }));
        const field = within(card).getByRole('textbox', { name: /^New name for / });
        await userEvent.clear(field);
        await userEvent.type(field, '   {Enter}');

        expect(onRenameFish).not.toHaveBeenCalled();
      });
    });

    describe('leaving the pond', () => {
      it('takes its card with it', async () => {
        const { rerender } = withFish({
          recentBranches: branches('feat/one', 'feat/two'),
          baseFishCount: 2
        });
        pointer('pointerdown', SPOT);
        pointer('pointerup', SPOT);
        expect(await screen.findByRole('dialog')).toBeInTheDocument();

        rerender(
          <Koi3dBackground recentBranches={[]} baseFishCount={0} ownedKoi={[]} ownedGoldfish={[]} />
        );

        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });

      it('leaves its card be while it is still there', async () => {
        const { rerender } = withFish({ recentBranches: branches('feat/one'), baseFishCount: 2 });
        pointer('pointerdown', SPOT);
        pointer('pointerup', SPOT);
        expect(await screen.findByRole('dialog')).toBeInTheDocument();

        rerender(<Koi3dBackground recentBranches={branches('feat/one')} baseFishCount={3} />);

        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });
    });
  });

  describe('the panel', () => {
    const panel = (): { current: HTMLElement } => {
      const element = document.createElement('section');
      element.getBoundingClientRect = () =>
        ({ left: 400, top: 200, width: 400, height: 300 }) as DOMRect;
      return { current: element };
    };

    let observed: Element[];
    let measure: (() => void) | undefined;
    let disconnects: number;

    beforeEach(() => {
      observed = [];
      disconnects = 0;
      measure = undefined;
      vi.stubGlobal(
        'ResizeObserver',
        class {
          constructor(callback: () => void) {
            measure = callback;
          }
          observe = (element: Element): void => {
            observed.push(element);
          };
          disconnect = (): void => {
            disconnects += 1;
          };
        }
      );
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('is an island the koi swim round', () => {
      const avoidRef = panel();

      mount({ avoidRef });

      expect(stage().setIsland).toHaveBeenCalledWith({ x: 400, y: 200, width: 400, height: 300 });
    });

    it('is watched as it changes, and no longer when the pond closes', () => {
      const avoidRef = panel();
      const { unmount } = mount({ avoidRef });
      expect(observed).toEqual([avoidRef.current]);
      stage().setIsland.mockClear();

      measure!();
      expect(stage().setIsland).toHaveBeenCalledTimes(1);

      unmount();
      expect(disconnects).toBe(1);
    });

    it('is measured again when the window is resized, along with the pond', () => {
      mount({ avoidRef: panel() });
      stage().setIsland.mockClear();
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: 800 });
      Object.defineProperty(window, 'innerHeight', { configurable: true, value: 500 });

      fireEvent(window, new Event('resize'));

      expect(stage().setSize).toHaveBeenLastCalledWith(800, 500);
      expect(stage().setIsland).toHaveBeenCalledTimes(1);
    });

    it('is no island at all when there is no panel', () => {
      mount();

      expect(stage().setIsland).not.toHaveBeenCalled();
    });
  });

  describe('lilies', () => {
    const FIRST_LILY = { x: 0.095 * WIDTH, y: 0.24 * HEIGHT };

    it('are floated somewhere new by dragging them, and the app is told where', () => {
      const onLilyPlacementsChange = vi.fn();
      mount({ onLilyPlacementsChange });

      pointer('pointerdown', FIRST_LILY);
      pointer('pointermove', { x: 700, y: 300 });
      pointer('pointerup', { x: 700, y: 300 });

      expect(onLilyPlacementsChange.mock.calls[0]![0][0]).toEqual({
        x: 700 / WIDTH,
        y: 300 / HEIGHT
      });
    });

    it('are not a touch on the water when they are put down', () => {
      mount({ onLilyPlacementsChange: vi.fn() });
      pointer('pointerdown', FIRST_LILY);
      pointer('pointermove', { x: 700, y: 300 });
      pointer('pointerup', { x: 700, y: 300 });

      fireEvent.click(document.body, { clientX: 700, clientY: 300 });

      expect(stage().attend).not.toHaveBeenCalled();
    });

    it('are put where the visitor left them, and drawn there', () => {
      const { container } = mount({ lilyPlacements: [{ x: 0.5, y: 0.25 }] });
      const surfaceCtx = canvasStub.contextOf(canvases(container).surface);

      runFrame();

      expect(surfaceCtx.callsTo('translate')).toContainEqual([WIDTH * 0.5, HEIGHT * 0.25]);
    });

    it('go back where they belong when the placements are cleared', () => {
      const { container, rerender } = mount({ lilyPlacements: [{ x: 0.5, y: 0.25 }] });
      const surfaceCtx = canvasStub.contextOf(canvases(container).surface);
      runFrame();

      rerender(
        <Koi3dBackground
          recentBranches={branches('feat/one')}
          baseFishCount={1}
          lilyPlacements={[]}
        />
      );
      surfaceCtx.reset();
      runFrame();

      expect(surfaceCtx.callsTo('translate')).toContainEqual([0.095 * WIDTH, 0.24 * HEIGHT]);
    });
  });

  describe('for a visitor who asked for less motion', () => {
    beforeEach(() => {
      setMotion(true);
    });

    it('settles the pond once and draws it, with no animation', () => {
      const { container } = mount();

      expect(frames.size).toBe(0);
      // Settled in whole runs of 120 thirtieths of a second, however many times it was asked for.
      expect(stage().draw.mock.calls.length).toBeGreaterThanOrEqual(120);
      expect(stage().draw.mock.calls.length % 120).toBe(0);
      expect(stage().draw).toHaveBeenCalledWith(1 / 30);
      expect(
        canvasStub.contextOf(canvases(container).surface).callsTo('drawImage').length
      ).toBeGreaterThanOrEqual(5);
    });

    it('settles the pond again when the roster changes', () => {
      const { rerender } = mount();
      stage().draw.mockClear();

      rerender(
        <Koi3dBackground recentBranches={branches('feat/one', 'feat/two')} baseFishCount={1} />
      );

      expect(stage().draw).toHaveBeenCalledTimes(120);
    });

    it('paints again, without moving the koi, when a lily is moved', () => {
      const { container } = mount();
      const surfaceCtx = canvasStub.contextOf(canvases(container).surface);
      stage().draw.mockClear();
      surfaceCtx.reset();

      pointer('pointerdown', { x: 0.095 * WIDTH, y: 0.24 * HEIGHT });
      pointer('pointermove', { x: 700, y: 300 });

      expect(stage().draw).not.toHaveBeenCalled();
      expect(surfaceCtx.callsTo('translate')).toContainEqual([700, 300]);
    });

    it('cannot carry a fish, only look at it', async () => {
      const view = mount();
      const [first] = stage().setRoster.mock.calls[0]![0] as { key: string }[];
      stage().pick.mockImplementation(() => first!.key);
      stage().inspect.mockReturnValue(READING);
      expect(view).toBeDefined();

      pointer('pointerdown', { x: 640, y: 480 });
      pointer('pointermove', { x: 700, y: 480 });
      pointer('pointerup', { x: 700, y: 480 });

      expect(stage().grab).not.toHaveBeenCalled();
      expect(await screen.findByRole('dialog')).toBeInTheDocument();
      expect(screen.queryByText('Drag a fish to move it around the pond.')).not.toBeInTheDocument();
    });

    it('puts a fish’s card away when the water is clicked, and sends out no rings', async () => {
      mount();
      const [first] = stage().setRoster.mock.calls[0]![0] as { key: string }[];
      stage().pick.mockImplementation((point: { x: number; y: number }) =>
        Math.hypot(point.x - 640, point.y - 480) < 30 ? first!.key : null
      );
      stage().inspect.mockReturnValue(READING);
      pointer('pointerdown', { x: 640, y: 480 });
      pointer('pointerup', { x: 640, y: 480 });
      expect(await screen.findByRole('dialog')).toBeInTheDocument();

      // A click on the water is a press there, and then the click.
      pointer('pointerdown', { x: 100, y: 100 });
      pointer('pointerup', { x: 100, y: 100 });
      fireEvent.click(document.body, { clientX: 100, clientY: 100 });

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(stage().attend).not.toHaveBeenCalled();
    });

    it('stops listening to the window once closed', () => {
      const { unmount } = mount();
      const setSize = stage().setSize;
      unmount();
      setSize.mockClear();

      fireEvent(window, new Event('resize'));

      expect(setSize).not.toHaveBeenCalled();
    });
  });

  describe('going away', () => {
    it('stops the animation, hands the stage back, and clears the page’s markings', () => {
      const { unmount } = mount();
      const pending = [...frames.keys()][0]!;
      document.documentElement.classList.add('koi-carrying', 'koi-over-fish');

      unmount();

      expect(cancelled).toContain(pending);
      expect(stage().dispose).toHaveBeenCalledTimes(1);
      expect(document.documentElement).not.toHaveClass('koi-carrying', 'koi-over-fish');
    });

    it('stops listening for taps, clicks, resizing and the tab being hidden', () => {
      const { unmount } = mount();
      unmount();
      stage().attend.mockClear();
      stage().setSize.mockClear();

      fireEvent.click(document.body, { clientX: 5, clientY: 5 });
      fireEvent(window, new Event('resize'));
      document.dispatchEvent(new Event('visibilitychange'));

      expect(stage().attend).not.toHaveBeenCalled();
      expect(stage().setSize).not.toHaveBeenCalled();
    });
  });

  describe('when there is no WebGL', () => {
    beforeEach(() => {
      stages.fail = true;
    });

    it('hands over to the 2D pond', () => {
      const { container } = mount();

      expect(container.querySelectorAll('canvas')).toHaveLength(1);
      expect(container.querySelector('canvas')).toHaveClass('koi-pond', 'koi-water');
    });

    it('passes the pond’s settings on to it, lilies and all', () => {
      const { container } = mount({ lilyPlacements: [{ x: 0.5, y: 0.25 }] });
      const ctx = canvasStub.contextOf(container.querySelector('canvas')!);

      runFrame();

      expect(ctx.callsTo('translate')).toContainEqual([WIDTH * 0.5, HEIGHT * 0.25]);
    });

    it('does not keep a stage', () => {
      mount();

      expect(stages.made).toHaveLength(0);
    });
  });
});
