import { Mesh } from 'three';
import { describe, expect, it } from 'vitest';
import { DEFAULT_PHYSICAL } from '../vendor/koi-pond/koi3d/config';
import type { GoldfishGenome } from './goldfish';
import { createGenomeKoi } from './koi-body';
import { resolveLook, type FishGenome, type KoiGenome } from './koi-genome';

const koi: KoiGenome = { variety: 'kohaku', modifiers: [], seed: 4242 };
const goldfish: GoldfishGenome = { species: 'goldfish', variety: 'comet', seed: 77 };

const build = (genome: FishGenome): ReturnType<typeof createGenomeKoi> =>
  createGenomeKoi(genome, DEFAULT_PHYSICAL);

const vertices = (fish: ReturnType<typeof createGenomeKoi>): number =>
  fish.surfaces.skin.geometry.getAttribute('position').count;

describe('createGenomeKoi', () => {
  it('builds a fish that carries the genome’s seed', () => {
    expect(build(koi).config.seed).toBe(koi.seed);
    expect(build(goldfish).config.seed).toBe(goldfish.seed);
  });

  it('paints the variety’s own markings and belly onto the skin', () => {
    const fish = build(koi);
    const look = resolveLook(koi);

    expect(`#${fish.uniforms.uBellyColour.value.getHexString()}`).toBe(look.belly.toLowerCase());
    expect(fish.config.appearance.primary).toBe(look.appearance.primary);
  });

  it('is the same fish every time for the same genome', () => {
    expect(vertices(build(koi))).toBe(vertices(build(koi)));
    expect(build(koi).uniforms.uBellyColour.value.getHex()).toBe(
      build(koi).uniforms.uBellyColour.value.getHex()
    );
  });

  it('shaves a goldfish’s barbels, which a koi keeps', () => {
    const whiskered = vertices(build(koi));
    const shaven = vertices(build(goldfish));

    expect(shaven).toBeLessThan(whiskered);
  });

  it('points the silhouette trace at the shaven skin', () => {
    const fish = build(goldfish);
    const trace = fish.object.getObjectByName('koi-outline-skin') as Mesh | undefined;

    expect(trace).toBeDefined();
    expect(trace!.geometry).toBe(fish.surfaces.skin.geometry);
  });

  it('passes the swim trim through to the fish, and leaves it untrimmed otherwise', () => {
    const untrimmed = createGenomeKoi(koi, DEFAULT_PHYSICAL);
    const brisk = createGenomeKoi(koi, DEFAULT_PHYSICAL, { frequency: 1.4, amplitude: 0.8 });

    expect(untrimmed.config.trim).toMatchObject({ frequency: 1, amplitude: 1 });
    expect(brisk.config.trim).toMatchObject({ frequency: 1.4, amplitude: 0.8 });
  });
});
