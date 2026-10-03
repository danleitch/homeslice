import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GoldfishGenome } from './goldfish';
import type { KoiGenome } from './koi-genome';

const kohaku: KoiGenome = { variety: 'kohaku', modifiers: [], seed: 1 };
const showa: KoiGenome = { variety: 'showa', modifiers: [], seed: 2 };
const comet: GoldfishGenome = { species: 'goldfish', variety: 'comet', seed: 3 };

const studio = vi.hoisted(() => {
  const makeRoom = () => ({
    renderer: {
      domElement: document.createElement('canvas'),
      setPixelRatio: vi.fn(),
      render: vi.fn()
    },
    scene: { scene: true },
    camera: { camera: true }
  });

  const makeFish = () => ({
    setBeat: vi.fn(),
    setMotion: vi.fn(),
    update: vi.fn(),
    dispose: vi.fn(),
    config: { physical: { length: 2 } }
  });

  return {
    makeRoom,
    makeFish,
    hasWebgl: vi.fn(() => true),
    openStudio: vi.fn(makeRoom),
    closeStudio: vi.fn(),
    frameStudio: vi.fn(),
    seatKoi: vi.fn(makeFish)
  };
});

vi.mock('./koi-studio', () => ({
  FILL: 0.82,
  STUDIO_MOTION: { speed: 0.5, turnRate: 0.24, acceleration: 0 },
  hasWebgl: studio.hasWebgl,
  openStudio: studio.openStudio,
  closeStudio: studio.closeStudio,
  frameStudio: studio.frameStudio,
  seatKoi: studio.seatKoi
}));

type Frame = (now: number) => void;

describe('the live koi', () => {
  let frames: Map<number, Frame>;
  let nextFrame: number;
  let now: number;
  const hostWidth = { width: 260, height: 160 };

  const freshModule = async (): Promise<typeof import('./koi-live')> => {
    vi.resetModules();
    return import('./koi-live');
  };

  const makeHost = (): HTMLElement => {
    const host = document.createElement('div');
    host.getBoundingClientRect = () => ({ ...hostWidth }) as DOMRect;
    document.body.append(host);
    return host;
  };

  /** Runs the animation frame the koi last asked for. */
  const runFrame = (at: number): void => {
    const [id, frame] = [...frames.entries()].pop()!;
    frames.delete(id);
    frame(at);
  };

  const setMedia = (reduce: boolean, hover: boolean): void => {
    window.matchMedia = vi.fn((query: string) => ({
      matches: query.includes('reduced-motion') ? reduce : hover
    })) as never;
  };

  beforeEach(() => {
    frames = new Map();
    nextFrame = 1;
    now = 1000;
    studio.hasWebgl.mockReset().mockReturnValue(true);
    studio.openStudio.mockReset().mockImplementation(studio.makeRoom);
    studio.closeStudio.mockReset();
    studio.frameStudio.mockReset();
    studio.seatKoi.mockReset().mockImplementation(studio.makeFish);
    hostWidth.width = 260;
    hostWidth.height = 160;
    setMedia(false, true);
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frames.set(nextFrame, callback);
      return nextFrame++;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
      frames.delete(id);
    });
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    Object.defineProperty(window, 'devicePixelRatio', { value: 1, configurable: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.replaceChildren();
  });

  describe('showing a koi', () => {
    it('opens a studio and puts its canvas in the host, over the photograph', async () => {
      const { showLiveKoi } = await freshModule();
      const host = makeHost();

      showLiveKoi(kohaku, host);

      const canvas = studio.openStudio.mock.results[0]!.value.renderer.domElement;
      expect(host.contains(canvas)).toBe(true);
      expect(canvas).toHaveClass('koi-live');
      expect(canvas).toHaveAttribute('aria-hidden', 'true');
      expect(host.dataset.live).toBe('true');
    });

    it('seats the fish as its photograph was taken, so the swap does not jump', async () => {
      const { showLiveKoi } = await freshModule();
      const { PORTRAIT_BEAT } = await import('./koi-portrait');

      showLiveKoi(kohaku, makeHost());

      const room = studio.openStudio.mock.results[0]!.value;
      const fish = studio.seatKoi.mock.results[0]!.value;
      expect(studio.seatKoi).toHaveBeenCalledWith(room, kohaku);
      expect(fish.setBeat).toHaveBeenCalledWith(PORTRAIT_BEAT);
    });

    it('frames the fish to the host’s size', async () => {
      const { showLiveKoi } = await freshModule();

      showLiveKoi(kohaku, makeHost());

      const room = studio.openStudio.mock.results[0]!.value;
      expect(studio.frameStudio).toHaveBeenCalledWith(room, 260, 160, 2);
    });

    it('never frames a host that has no size as nothing at all', async () => {
      const { showLiveKoi } = await freshModule();
      hostWidth.width = 0;
      hostWidth.height = 0;

      showLiveKoi(kohaku, makeHost());

      expect(studio.frameStudio).toHaveBeenCalledWith(expect.anything(), 1, 1, 2);
    });

    it.each([
      [1, 1],
      [2, 2],
      [3, 2],
      [0, 1]
    ])('draws at a pixel ratio of %i as %i, never past two', async (ratio, drawn) => {
      Object.defineProperty(window, 'devicePixelRatio', { value: ratio, configurable: true });
      const { showLiveKoi } = await freshModule();

      showLiveKoi(kohaku, makeHost());

      expect(studio.openStudio.mock.results[0]!.value.renderer.setPixelRatio).toHaveBeenCalledWith(
        drawn
      );
    });

    it('draws a frame before the canvas goes in, so it never shows empty water', async () => {
      const { showLiveKoi } = await freshModule();
      const host = makeHost();
      const room = studio.makeRoom();
      let attachedAtFirstRender: boolean | undefined;
      room.renderer.render.mockImplementation(() => {
        attachedAtFirstRender ??= host.contains(room.renderer.domElement);
      });
      studio.openStudio.mockReturnValueOnce(room);

      showLiveKoi(kohaku, host);

      expect(attachedAtFirstRender).toBe(false);
      expect(host.contains(room.renderer.domElement)).toBe(true);
    });

    it('starts the animation', async () => {
      const { showLiveKoi } = await freshModule();

      showLiveKoi(kohaku, makeHost());

      expect(frames.size).toBe(1);
    });

    it('opens one studio however many cards the pointer passes over', async () => {
      const { showLiveKoi } = await freshModule();

      showLiveKoi(kohaku, makeHost());
      showLiveKoi(showa, makeHost());
      showLiveKoi(comet, makeHost());

      expect(studio.openStudio).toHaveBeenCalledTimes(1);
    });

    it('moves the one canvas from card to card', async () => {
      const { showLiveKoi } = await freshModule();
      const first = makeHost();
      const second = makeHost();

      showLiveKoi(kohaku, first);
      showLiveKoi(showa, second);

      const canvas = studio.openStudio.mock.results[0]!.value.renderer.domElement;
      expect(first.contains(canvas)).toBe(false);
      expect(first.dataset.live).toBeUndefined();
      expect(second.contains(canvas)).toBe(true);
      expect(second.dataset.live).toBe('true');
      expect(frames.size).toBe(1);
    });

    it('swaps the koi when the next card has a different fish, putting the old one away', async () => {
      const { showLiveKoi } = await freshModule();

      showLiveKoi(kohaku, makeHost());
      showLiveKoi(showa, makeHost());

      const [first] = studio.seatKoi.mock.results.map((result) => result.value);
      expect(first.dispose).toHaveBeenCalledTimes(1);
      expect(studio.seatKoi).toHaveBeenCalledTimes(2);
    });

    it('keeps the same koi for the same fish, wherever it appears', async () => {
      const { showLiveKoi } = await freshModule();

      showLiveKoi(kohaku, makeHost());
      showLiveKoi({ ...kohaku }, makeHost());

      expect(studio.seatKoi).toHaveBeenCalledTimes(1);
      expect(studio.seatKoi.mock.results[0]!.value.dispose).not.toHaveBeenCalled();
    });

    it('brings a goldfish to life too', async () => {
      const { showLiveKoi } = await freshModule();

      showLiveKoi(comet, makeHost());

      expect(studio.seatKoi).toHaveBeenCalledWith(expect.anything(), comet);
    });
  });

  describe('swimming', () => {
    it('lets the fish carry on, with a lazy sway to its turn, and draws it', async () => {
      const { showLiveKoi } = await freshModule();
      showLiveKoi(kohaku, makeHost());
      const fish = studio.seatKoi.mock.results[0]!.value;
      const room = studio.openStudio.mock.results[0]!.value;
      room.renderer.render.mockClear();

      runFrame(now + 16);

      const dt = 0.016;
      expect(fish.update).toHaveBeenCalledWith(dt);
      expect(fish.setMotion).toHaveBeenCalledWith({
        speed: 0.5,
        turnRate: expect.closeTo(0.24 + Math.sin(dt * 0.8) * 0.22, 6),
        acceleration: 0
      });
      expect(room.renderer.render).toHaveBeenCalledWith(room.scene, room.camera);
    });

    it('asks for the next frame each time', async () => {
      const { showLiveKoi } = await freshModule();
      showLiveKoi(kohaku, makeHost());

      runFrame(now + 16);
      expect(frames.size).toBe(1);

      runFrame(now + 32);
      expect(frames.size).toBe(1);
    });

    it('sways the turn back and forth as time goes on', async () => {
      const { showLiveKoi } = await freshModule();
      showLiveKoi(kohaku, makeHost());
      const fish = studio.seatKoi.mock.results[0]!.value;
      const turns: number[] = [];

      for (let step = 1; step <= 120; step += 1) {
        runFrame(now + step * 50);
        turns.push(fish.setMotion.mock.calls.at(-1)![0].turnRate);
      }

      expect(Math.max(...turns)).toBeGreaterThan(0.24);
      expect(Math.min(...turns)).toBeLessThan(0.24);
      expect(Math.max(...turns)).toBeLessThanOrEqual(0.24 + 0.22 + 1e-9);
      expect(Math.min(...turns)).toBeGreaterThanOrEqual(0.24 - 0.22 - 1e-9);
    });

    it('carries on, rather than lurching, after the tab was away', async () => {
      const { showLiveKoi } = await freshModule();
      showLiveKoi(kohaku, makeHost());
      const fish = studio.seatKoi.mock.results[0]!.value;

      runFrame(now + 60_000);

      expect(fish.update).toHaveBeenCalledWith(0.05);
    });

    it('stops asking for frames once the koi is gone', async () => {
      const { showLiveKoi, closeLiveKoi } = await freshModule();
      showLiveKoi(kohaku, makeHost());
      const [, frame] = [...frames.entries()][0]!;

      closeLiveKoi();
      frames.clear();
      frame(now + 16);

      expect(frames.size).toBe(0);
    });
  });

  describe('hiding the koi', () => {
    it('stops the animation and takes the canvas out of its host', async () => {
      const { showLiveKoi, hideLiveKoi } = await freshModule();
      const host = makeHost();
      showLiveKoi(kohaku, host);
      const canvas = studio.openStudio.mock.results[0]!.value.renderer.domElement;

      hideLiveKoi(host);

      expect(host.contains(canvas)).toBe(false);
      expect(host.dataset.live).toBeUndefined();
      expect(frames.size).toBe(0);
    });

    it('keeps the studio and the koi for the next card', async () => {
      const { showLiveKoi, hideLiveKoi } = await freshModule();
      const host = makeHost();
      showLiveKoi(kohaku, host);

      hideLiveKoi(host);

      expect(studio.closeStudio).not.toHaveBeenCalled();
      expect(studio.seatKoi.mock.results[0]!.value.dispose).not.toHaveBeenCalled();
    });

    it('leaves the koi alone when asked about a card it is not swimming in', async () => {
      const { showLiveKoi, hideLiveKoi } = await freshModule();
      const host = makeHost();
      showLiveKoi(kohaku, host);

      hideLiveKoi(makeHost());

      expect(host.dataset.live).toBe('true');
      expect(frames.size).toBe(1);
    });

    it('does nothing for no host, or when nothing is swimming', async () => {
      const { showLiveKoi, hideLiveKoi } = await freshModule();

      expect(() => hideLiveKoi(makeHost())).not.toThrow();

      showLiveKoi(kohaku, makeHost());
      hideLiveKoi(null);

      expect(frames.size).toBe(1);
    });

    it('can bring the same koi back after hiding it, without re-seating it', async () => {
      const { showLiveKoi, hideLiveKoi } = await freshModule();
      const host = makeHost();

      showLiveKoi(kohaku, host);
      hideLiveKoi(host);
      showLiveKoi(kohaku, host);

      expect(host.dataset.live).toBe('true');
      expect(studio.seatKoi).toHaveBeenCalledTimes(1);
    });
  });

  describe('closing', () => {
    it('hands the WebGL context back and puts the koi away', async () => {
      const { showLiveKoi, closeLiveKoi } = await freshModule();
      const host = makeHost();
      showLiveKoi(kohaku, host);

      closeLiveKoi();

      const room = studio.openStudio.mock.results[0]!.value;
      expect(studio.closeStudio).toHaveBeenCalledWith(room);
      expect(studio.seatKoi.mock.results[0]!.value.dispose).toHaveBeenCalledTimes(1);
      expect(host.dataset.live).toBeUndefined();
      expect(frames.size).toBe(0);
    });

    it('is harmless when no koi was ever shown', async () => {
      const { closeLiveKoi } = await freshModule();

      expect(() => closeLiveKoi()).not.toThrow();
      expect(studio.closeStudio).not.toHaveBeenCalled();
    });

    it('opens a fresh studio the next time a koi is shown', async () => {
      const { showLiveKoi, closeLiveKoi } = await freshModule();

      showLiveKoi(kohaku, makeHost());
      closeLiveKoi();
      showLiveKoi(kohaku, makeHost());

      expect(studio.openStudio).toHaveBeenCalledTimes(2);
      expect(studio.seatKoi).toHaveBeenCalledTimes(2);
    });
  });

  describe('when it is better to stay still', () => {
    it('shows nothing to a visitor who asked for less motion', async () => {
      setMedia(true, true);
      const { showLiveKoi } = await freshModule();
      const host = makeHost();

      showLiveKoi(kohaku, host);

      expect(studio.openStudio).not.toHaveBeenCalled();
      expect(host.dataset.live).toBeUndefined();
    });

    it('shows nothing where the browser cannot say what the visitor prefers', async () => {
      window.matchMedia = undefined as never;
      const { showLiveKoi } = await freshModule();

      showLiveKoi(kohaku, makeHost());

      expect(studio.openStudio).not.toHaveBeenCalled();
    });

    it('shows nothing on a touch screen when only hovering would end it', async () => {
      setMedia(false, false);
      const { showLiveKoi } = await freshModule();

      showLiveKoi(kohaku, makeHost());

      expect(studio.openStudio).not.toHaveBeenCalled();
    });

    it('shows a koi on a touch screen when the card has its own way to close', async () => {
      setMedia(false, false);
      const { showLiveKoi } = await freshModule();

      showLiveKoi(kohaku, makeHost(), false);

      expect(studio.openStudio).toHaveBeenCalledTimes(1);
    });

    it('still honours reduced motion where the card has its own way to close', async () => {
      setMedia(true, false);
      const { showLiveKoi } = await freshModule();

      showLiveKoi(kohaku, makeHost(), false);

      expect(studio.openStudio).not.toHaveBeenCalled();
    });
  });

  describe('when WebGL is not there', () => {
    it('shows nothing, and does not ask again', async () => {
      studio.hasWebgl.mockReturnValue(false);
      const { showLiveKoi } = await freshModule();
      const host = makeHost();

      showLiveKoi(kohaku, host);
      showLiveKoi(showa, host);

      expect(studio.openStudio).not.toHaveBeenCalled();
      expect(studio.hasWebgl).toHaveBeenCalledTimes(1);
      expect(host.dataset.live).toBeUndefined();
    });

    it('shows nothing when the studio will not open, and does not try again', async () => {
      studio.openStudio.mockImplementation(() => {
        throw new Error('no context');
      });
      const { showLiveKoi } = await freshModule();

      showLiveKoi(kohaku, makeHost());
      showLiveKoi(showa, makeHost());

      expect(studio.openStudio).toHaveBeenCalledTimes(1);
      expect(studio.seatKoi).not.toHaveBeenCalled();
    });
  });
});
