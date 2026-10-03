import { ACESFilmicToneMapping, Vector3 } from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_PHYSICAL, PIVOT_STATION } from '../vendor/koi-pond/koi3d/config';
import { POND_VIEW } from '../vendor/koi-pond/model/pond-view';
import type { GoldfishGenome } from './goldfish';
import { createGenomeKoi } from './koi-body';
import type { KoiGenome } from './koi-genome';
import {
  FILL,
  STUDIO_MOTION,
  closeStudio,
  frameStudio,
  hasWebgl,
  openStudio,
  seatKoi
} from './koi-studio';

// jsdom can't give three.js a WebGL context, so the renderer is a stand-in that
// keeps what it is told. Everything else (scene, camera, the koi) is the real thing.
const renderers = vi.hoisted(() => ({
  made: [] as {
    options: Record<string, unknown>;
    domElement: HTMLCanvasElement;
    toneMapping: number;
    toneMappingExposure: number;
    setClearAlpha: (alpha: number) => void;
    setSize: (width: number, height: number, updateStyle: boolean) => void;
    dispose: () => void;
    forceContextLoss: () => void;
  }[]
}));

vi.mock('three', async (importOriginal) => {
  const three = await importOriginal<typeof import('three')>();

  class FakeRenderer {
    options: Record<string, unknown>;
    domElement: HTMLCanvasElement;
    toneMapping = 0;
    toneMappingExposure = 1;
    setClearAlpha = vi.fn();
    setSize = vi.fn();
    dispose = vi.fn();
    forceContextLoss = vi.fn();

    constructor(options: { canvas: HTMLCanvasElement } & Record<string, unknown>) {
      this.options = options;
      this.domElement = options.canvas;
      renderers.made.push(this);
    }
  }

  return { ...three, WebGLRenderer: FakeRenderer };
});

const koi: KoiGenome = { variety: 'kohaku', modifiers: [], seed: 4242 };
const goldfish: GoldfishGenome = { species: 'goldfish', variety: 'comet', seed: 77 };

describe('hasWebgl', () => {
  const realGetContext = HTMLCanvasElement.prototype.getContext;

  afterEach(() => {
    HTMLCanvasElement.prototype.getContext = realGetContext;
  });

  const offering = (...kinds: string[]): ReturnType<typeof vi.fn> => {
    const getContext = vi.fn((kind: string) => (kinds.includes(kind) ? {} : null));
    HTMLCanvasElement.prototype.getContext = getContext as never;
    return getContext;
  };

  it('is true when the browser offers WebGL 2', () => {
    offering('webgl2');

    expect(hasWebgl()).toBe(true);
  });

  it('is true when the browser offers only WebGL 1', () => {
    offering('webgl');

    expect(hasWebgl()).toBe(true);
  });

  it('is false when it offers neither', () => {
    offering();

    expect(hasWebgl()).toBe(false);
  });

  it('is false when asking throws', () => {
    HTMLCanvasElement.prototype.getContext = vi.fn(() => {
      throw new Error('blocked');
    }) as never;

    expect(hasWebgl()).toBe(false);
  });

  it('only falls back to WebGL 1 when WebGL 2 is not offered', () => {
    const getContext = offering('webgl2', 'webgl');

    hasWebgl();

    expect(getContext).toHaveBeenCalledTimes(1);
  });
});

describe('openStudio', () => {
  beforeEach(() => {
    renderers.made.length = 0;
  });

  it('renders the way the pond does: transparent, tone-mapped, at the pond’s exposure', () => {
    const { renderer } = openStudio();
    const [made] = renderers.made;

    expect(made!.options).toMatchObject({ alpha: true, antialias: true });
    expect(renderer.setClearAlpha).toHaveBeenCalledWith(0);
    expect(renderer.toneMapping).toBe(ACESFilmicToneMapping);
    expect(renderer.toneMappingExposure).toBe(POND_VIEW.exposure);
  });

  it('draws on a canvas of its own', () => {
    const { renderer } = openStudio();

    expect(renderer.domElement).toBeInstanceOf(HTMLCanvasElement);
    expect(renderer.domElement.isConnected).toBe(false);
  });

  it('lets the drawing buffer be read back only when asked, for taking stills', () => {
    openStudio();
    openStudio({ preserveDrawingBuffer: true });

    expect(renderers.made.map((made) => made.options.preserveDrawingBuffer)).toEqual([false, true]);
  });

  it('lights the scene with the pond’s lights, and looks through the pond’s lens', () => {
    const { scene, camera } = openStudio();

    expect(scene.children.length).toBeGreaterThan(0);
    expect(camera.fov).toBe(POND_VIEW.fovDeg);
  });

  it('opens a fresh studio each time', () => {
    expect(openStudio().scene).not.toBe(openStudio().scene);
  });
});

describe('closeStudio', () => {
  it('hands the WebGL context back', () => {
    const studio = openStudio();

    closeStudio(studio);

    expect(studio.renderer.dispose).toHaveBeenCalledTimes(1);
    expect(studio.renderer.forceContextLoss).toHaveBeenCalledTimes(1);
  });
});

describe('frameStudio', () => {
  /** Where a point in the swim plane lands in the frame, from -1 (left) to 1 (right). */
  const screenX = (studio: ReturnType<typeof openStudio>, point: Vector3): number => {
    studio.camera.updateMatrixWorld(true);
    return point.clone().project(studio.camera).x;
  };

  it('sizes the renderer and the camera to the frame', () => {
    const studio = openStudio();

    frameStudio(studio, 520, 320, 1);

    expect(studio.renderer.setSize).toHaveBeenCalledWith(520, 320, false);
    expect(studio.camera.aspect).toBeCloseTo(520 / 320);
  });

  it.each([
    [520, 320, 1],
    [260, 160, 0.4],
    [300, 600, 2.5]
  ])('makes a fish of any length fill the same share of a %ix%i frame', (width, height, length) => {
    const studio = openStudio();

    frameStudio(studio, width, height, length);

    expect(screenX(studio, new Vector3(length / 2, 0, 0))).toBeCloseTo(FILL);
    expect(screenX(studio, new Vector3(-length / 2, 0, 0))).toBeCloseTo(-FILL);
  });

  it('looks down on the fish, tilted as the pond is, with the nose to the right', () => {
    const studio = openStudio();

    frameStudio(studio, 520, 320, 1);

    const tilt = (POND_VIEW.tiltDeg * Math.PI) / 180;
    const { position, up } = studio.camera;

    expect(position.x).toBe(0);
    expect(position.y).toBeGreaterThan(position.z);
    expect(Math.atan2(position.z, position.y)).toBeCloseTo(tilt);
    expect(up.toArray()).toEqual([0, 0, -1]);
  });

  it('keeps the fish centred however the frame changes', () => {
    const studio = openStudio();

    frameStudio(studio, 520, 320, 1);
    frameStudio(studio, 200, 400, 1);

    expect(screenX(studio, new Vector3(0, 0, 0))).toBeCloseTo(0);
  });
});

describe('seatKoi', () => {
  it('mounts the fish in the studio’s scene', () => {
    const studio = openStudio();

    const fish = seatKoi(studio, koi);

    expect(studio.scene.children).toContain(fish.object);
  });

  it('centres the fish, whose origin is its pivot a third of the way back from the nose', () => {
    const studio = openStudio();

    const fish = seatKoi(studio, koi);

    expect(fish.object.position.x).toBeCloseTo(fish.config.physical.length * (0.5 - PIVOT_STATION));
    expect(fish.object.position.y).toBe(0);
    expect(fish.object.position.z).toBe(0);
  });

  it('seats a goldfish at its own length, not a koi’s', () => {
    const studio = openStudio();

    const koiFish = seatKoi(studio, koi);
    const goldFish = seatKoi(openStudio(), goldfish);

    expect(goldFish.config.physical.length).not.toBe(koiFish.config.physical.length);
    expect(goldFish.object.position.x).toBeCloseTo(
      goldFish.config.physical.length * (0.5 - PIVOT_STATION)
    );
  });

  it('swims it at the studio’s gentle cruise', () => {
    expect(STUDIO_MOTION).toMatchObject({ speed: 0.5, turnRate: 0.24, escapeIntensity: 0 });
    expect(seatKoi(openStudio(), koi).pose.stations.length).toBeGreaterThan(1);
  });

  it('settles the body into a living curve before it is photographed', () => {
    const bend = (fish: ReturnType<typeof seatKoi>): number => {
      const yaws = fish.pose.stations.map((station) => station.yaw);
      return Math.max(...yaws) - Math.min(...yaws);
    };
    const fresh = createGenomeKoi(koi, DEFAULT_PHYSICAL);

    expect(bend(seatKoi(openStudio(), koi))).toBeGreaterThan(bend(fresh) + 0.05);
  });

  it('seats the same fish the same way every time', () => {
    const first = seatKoi(openStudio(), koi);
    const second = seatKoi(openStudio(), koi);

    expect(first.object.position.toArray()).toEqual(second.object.position.toArray());
    expect(first.pose.stations).toEqual(second.pose.stations);
  });
});
