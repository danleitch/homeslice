import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installCanvasStub, type CanvasStub } from '../test/canvas';
import type { GoldfishGenome } from './goldfish';
import type { KoiGenome } from './koi-genome';

type FakeKoi = {
  setBeat: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
  config: { physical: { length: number } };
};

const studio = vi.hoisted(() => {
  const order: string[] = [];
  const toBlob = vi.fn((callback: (blob: Blob | null) => void) => callback(new Blob(['png'])));
  const room = () => ({
    renderer: {
      setPixelRatio: vi.fn(),
      render: vi.fn(() => order.push('render')),
      domElement: { toBlob } as unknown as HTMLCanvasElement
    },
    scene: { scene: true },
    camera: { camera: true }
  });

  return {
    order,
    toBlob,
    room,
    hasWebgl: vi.fn(() => true),
    openStudio: vi.fn(room),
    closeStudio: vi.fn(),
    frameStudio: vi.fn(),
    seatKoi: vi.fn()
  };
});

vi.mock('./koi-studio', () => ({
  FILL: 0.82,
  STUDIO_MOTION: {},
  hasWebgl: studio.hasWebgl,
  openStudio: studio.openStudio,
  closeStudio: studio.closeStudio,
  frameStudio: studio.frameStudio,
  seatKoi: studio.seatKoi
}));

const koi: KoiGenome = { variety: 'kohaku', modifiers: [], seed: 1 };
const showa: KoiGenome = { variety: 'showa', modifiers: ['ginrin', 'doitsu'], seed: 2 };
const goldfish: GoldfishGenome = { species: 'goldfish', variety: 'comet', seed: 3 };

const freshModule = async (): Promise<typeof import('./koi-portrait')> => {
  vi.resetModules();
  return import('./koi-portrait');
};

const makeFish = (label: string): FakeKoi => ({
  setBeat: vi.fn(),
  dispose: vi.fn(() => studio.order.push(`dispose:${label}`)),
  config: { physical: { length: 1.5 } }
});

describe('koi portraits', () => {
  const realCreateObjectURL = URL.createObjectURL;
  let stub: CanvasStub | null = null;

  beforeEach(() => {
    studio.order.length = 0;
    studio.hasWebgl.mockReset().mockReturnValue(true);
    studio.openStudio.mockReset().mockImplementation(studio.room);
    studio.closeStudio.mockReset();
    studio.frameStudio.mockReset();
    studio.toBlob.mockClear();
    studio.seatKoi.mockReset().mockImplementation((_room, genome: KoiGenome) => {
      studio.order.push(`seat:${genome.seed}`);
      return makeFish(String(genome.seed));
    });
    URL.createObjectURL = vi.fn(() => 'blob:portrait');
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    URL.createObjectURL = realCreateObjectURL;
    stub?.restore();
    stub = null;
  });

  describe('portraitKey', () => {
    it('names a koi by variety, modifiers and seed', () => {
      return freshModule().then(({ portraitKey }) => {
        expect(portraitKey(koi)).toBe('kohaku::1');
      });
    });

    it('names a koi the same whatever order its traits were listed in', async () => {
      const { portraitKey } = await freshModule();

      expect(portraitKey(showa)).toBe('showa:doitsu+ginrin:2');
      expect(portraitKey({ ...showa, modifiers: ['doitsu', 'ginrin'] })).toBe(portraitKey(showa));
    });

    it('does not reorder the genome’s own list while it sorts', async () => {
      const { portraitKey } = await freshModule();

      portraitKey(showa);

      expect(showa.modifiers).toEqual(['ginrin', 'doitsu']);
    });

    it('keeps a goldfish apart from a koi', async () => {
      const { portraitKey } = await freshModule();

      expect(portraitKey(goldfish)).toBe('goldfish:comet:3');
    });
  });

  describe('with WebGL', () => {
    it('photographs the real fish, mid-stroke, framed for the card', async () => {
      const { koiPortrait, PORTRAIT_BEAT, PORTRAIT_WIDTH, PORTRAIT_HEIGHT } = await freshModule();

      const url = await koiPortrait(koi);

      const [room] = studio.openStudio.mock.results.map((result) => result.value);
      const fish = studio.seatKoi.mock.results[0]!.value as FakeKoi;
      expect(url).toBe('blob:portrait');
      expect(studio.openStudio).toHaveBeenCalledWith({ preserveDrawingBuffer: true });
      expect(room.renderer.setPixelRatio).toHaveBeenCalledWith(1);
      expect(studio.seatKoi).toHaveBeenCalledWith(room, koi);
      expect(fish.setBeat).toHaveBeenCalledWith(PORTRAIT_BEAT);
      expect(studio.frameStudio).toHaveBeenCalledWith(room, PORTRAIT_WIDTH, PORTRAIT_HEIGHT, 1.5);
      expect(room.renderer.render).toHaveBeenCalledWith(room.scene, room.camera);
      expect(URL.createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    });

    it('gives the fish back once it has been photographed', async () => {
      const { koiPortrait } = await freshModule();

      await koiPortrait(koi);

      expect(studio.order).toEqual(['seat:1', 'render', 'dispose:1']);
    });

    it('keeps each photograph for the session, so the market reopens instantly', async () => {
      const { koiPortrait } = await freshModule();

      const first = koiPortrait(koi);
      const again = koiPortrait(koi);
      await first;

      expect(again).toBe(first);
      expect(await koiPortrait({ ...koi })).toBe('blob:portrait');
      expect(studio.seatKoi).toHaveBeenCalledTimes(1);
    });

    it('photographs a different fish separately', async () => {
      const { koiPortrait } = await freshModule();

      await koiPortrait(koi);
      await koiPortrait(showa);

      expect(studio.seatKoi).toHaveBeenCalledTimes(2);
    });

    it('takes one portrait at a time, in the order they were asked for', async () => {
      const { koiPortrait } = await freshModule();

      await Promise.all([koiPortrait(koi), koiPortrait(showa), koiPortrait(goldfish)]);

      expect(studio.order.filter((entry) => entry !== 'render')).toEqual([
        'seat:1',
        'dispose:1',
        'seat:2',
        'dispose:2',
        'seat:3',
        'dispose:3'
      ]);
    });

    it('serves every portrait from one studio', async () => {
      const { koiPortrait } = await freshModule();

      await Promise.all([koiPortrait(koi), koiPortrait(showa)]);

      expect(studio.openStudio).toHaveBeenCalledTimes(1);
    });

    it('packs the studio away once the queue has been quiet, handing the context back', async () => {
      const { koiPortrait } = await freshModule();
      await koiPortrait(koi);

      vi.advanceTimersByTime(3999);
      expect(studio.closeStudio).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1);
      expect(studio.closeStudio).toHaveBeenCalledTimes(1);
    });

    it('keeps the studio open while portraits keep coming', async () => {
      const { koiPortrait } = await freshModule();
      await koiPortrait(koi);
      vi.advanceTimersByTime(3000);

      await koiPortrait(showa);
      vi.advanceTimersByTime(3000);

      expect(studio.closeStudio).not.toHaveBeenCalled();
      expect(studio.openStudio).toHaveBeenCalledTimes(1);
    });

    it('opens a new studio for a portrait asked for after the old one was packed away', async () => {
      const { koiPortrait } = await freshModule();
      await koiPortrait(koi);
      vi.advanceTimersByTime(4000);

      await koiPortrait(showa);

      expect(studio.openStudio).toHaveBeenCalledTimes(2);
    });

    it('gives no portrait, rather than failing, when the photograph goes wrong', async () => {
      const { koiPortrait } = await freshModule();
      studio.seatKoi.mockImplementationOnce(() => {
        throw new Error('lost context');
      });

      expect(await koiPortrait(koi)).toBeNull();
      expect(await koiPortrait(showa)).toBe('blob:portrait');
    });

    it('gives no portrait when the browser cannot make an image of the canvas', async () => {
      const { koiPortrait } = await freshModule();
      studio.toBlob.mockImplementationOnce((callback) => callback(null));

      expect(await koiPortrait(koi)).toBeNull();
    });

    it('gives no portrait when canvases cannot be saved at all', async () => {
      const { koiPortrait } = await freshModule();
      studio.openStudio.mockImplementationOnce(() => {
        const room = studio.room();
        (room.renderer.domElement as { toBlob?: unknown }).toBlob = undefined;
        return room;
      });

      expect(await koiPortrait(koi)).toBeNull();
    });
  });

  describe('without WebGL', () => {
    const imageSaved = (): void => {
      HTMLCanvasElement.prototype.toBlob = vi.fn((callback: BlobCallback) =>
        callback(new Blob(['png']))
      );
    };

    beforeEach(() => {
      studio.hasWebgl.mockReturnValue(false);
      stub = installCanvasStub();
      imageSaved();
    });

    it('sketches the fish with the 2D pond’s own drawing', async () => {
      const { koiPortrait, PORTRAIT_WIDTH, PORTRAIT_HEIGHT } = await freshModule();
      const toBlob = vi.fn((callback: BlobCallback) => callback(new Blob(['png'])));
      HTMLCanvasElement.prototype.toBlob = toBlob;

      const url = await koiPortrait(koi);

      // The canvas the sketch was saved from is the one `toBlob` was called on.
      const drawn = toBlob.mock.contexts[0] as HTMLCanvasElement;
      expect(url).toBe('blob:portrait');
      expect(studio.openStudio).not.toHaveBeenCalled();
      expect(drawn).toMatchObject({ width: PORTRAIT_WIDTH, height: PORTRAIT_HEIGHT });
      expect(stub!.contextOf(drawn).calls.length).toBeGreaterThan(50);
    });

    it('sketches a goldfish and a koi differently', async () => {
      const { koiPortrait } = await freshModule();
      const drawings: string[] = [];
      HTMLCanvasElement.prototype.toBlob = vi.fn(function (
        this: HTMLCanvasElement,
        callback: BlobCallback
      ) {
        drawings.push(JSON.stringify(stub!.contextOf(this).calls));
        callback(new Blob(['png']));
      });

      await koiPortrait(koi);
      await koiPortrait(goldfish);

      expect(drawings[0]).not.toBe(drawings[1]);
    });

    it('does not keep a studio open to wait for', async () => {
      const { koiPortrait } = await freshModule();

      await koiPortrait(koi);
      vi.advanceTimersByTime(10_000);

      expect(studio.closeStudio).not.toHaveBeenCalled();
    });

    it('gives no portrait when there is nothing to draw on', async () => {
      stub!.restore();
      const { koiPortrait } = await freshModule();

      expect(await koiPortrait(koi)).toBeNull();
    });

    it('gives no portrait when the sketch cannot be saved', async () => {
      const { koiPortrait } = await freshModule();
      HTMLCanvasElement.prototype.toBlob = undefined as never;

      expect(await koiPortrait(koi)).toBeNull();
    });
  });

  describe('when the studio will not open', () => {
    beforeEach(() => {
      stub = installCanvasStub();
      HTMLCanvasElement.prototype.toBlob = vi.fn((callback: BlobCallback) =>
        callback(new Blob(['png']))
      );
    });

    it('falls back to a sketch, and does not try WebGL again', async () => {
      const { koiPortrait } = await freshModule();
      studio.openStudio.mockImplementation(() => {
        throw new Error('no context');
      });

      expect(await koiPortrait(koi)).toBe('blob:portrait');
      expect(await koiPortrait(showa)).toBe('blob:portrait');

      expect(studio.openStudio).toHaveBeenCalledTimes(1);
      expect(studio.hasWebgl).toHaveBeenCalledTimes(1);
    });
  });
});
