import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PARTICLE_SETTINGS,
  PARTICLE_PRESETS,
  PARTICLE_RANGES,
  emojiChoices,
  matchParticlePreset,
  sanitizeParticleSettings,
  toParticlesOptions,
  type ParticleNumberKey
} from './particles';
import { parseParticleSettings } from './storage';

/** Reads an option a plugin supplies, which tsParticles 4 leaves untyped. */
const at = (value: unknown, ...path: string[]): unknown =>
  path.reduce<unknown>((node, key) => (node as Record<string, unknown> | undefined)?.[key], value);

describe('toParticlesOptions', () => {
  it('draws the default exactly as Branchify always has', () => {
    const options = toParticlesOptions(DEFAULT_PARTICLE_SETTINGS);

    expect(options.background).toEqual({ color: { value: '#0d1117' } });
    expect(at(options, 'interactivity', 'events')).toEqual({
      onHover: { enable: true, mode: 'repulse' },
      onClick: { enable: false, mode: 'push' }
    });
    expect(at(options, 'interactivity', 'modes', 'repulse')).toEqual({
      distance: 100,
      duration: 0.4
    });
    expect(options.particles).toMatchObject({
      paint: { fill: { enable: true, color: { value: '#4c7ff7' } } },
      links: { color: '#4c7ff7', distance: 150, enable: true, opacity: 0.3, width: 1 },
      move: { enable: true, speed: 1.2, outModes: { default: 'bounce' } },
      number: { density: { enable: true }, value: 300 },
      opacity: { value: 0.5 },
      shape: { type: 'circle' },
      size: { value: { min: 1, max: 3 } }
    });
  });

  it('asks tsParticles for random colours when they are switched on', () => {
    const options = toParticlesOptions({ ...DEFAULT_PARTICLE_SETTINGS, randomColor: true });

    expect(at(options, 'particles', 'paint', 'fill', 'color')).toEqual({ value: 'random' });
  });

  it('gives polygons and stars their sides', () => {
    const options = toParticlesOptions({
      ...DEFAULT_PARTICLE_SETTINGS,
      shape: 'polygon',
      sides: 7
    });

    expect(options.particles?.shape).toMatchObject({
      type: 'polygon',
      options: { polygon: { sides: 7 }, star: { sides: 7 } }
    });
  });

  it('keeps a single size unless sizes are randomised or pulsing', () => {
    const fixed = { ...DEFAULT_PARTICLE_SETTINGS, size: 12, randomSize: false };

    expect(toParticlesOptions(fixed).particles?.size).toMatchObject({ value: 12 });
    expect(toParticlesOptions({ ...fixed, pulse: true }).particles?.size).toMatchObject({
      value: { min: 3, max: 12 },
      animation: { enable: true }
    });
  });

  it('fades twinkling particles down from their chosen opacity', () => {
    const options = toParticlesOptions({ ...DEFAULT_PARTICLE_SETTINGS, twinkle: true });

    expect(options.particles?.opacity).toMatchObject({
      value: { min: 0.05, max: 0.5 },
      animation: { enable: true }
    });
  });

  it('passes the interaction mode settings through', () => {
    const options = toParticlesOptions({
      ...DEFAULT_PARTICLE_SETTINGS,
      hoverMode: 'grab',
      grabDistance: 220,
      click: true,
      clickMode: 'remove',
      removeQuantity: 5
    });

    expect(at(options, 'interactivity', 'events')).toEqual({
      onHover: { enable: true, mode: 'grab' },
      onClick: { enable: true, mode: 'remove' }
    });
    expect(at(options, 'interactivity', 'modes')).toMatchObject({
      grab: { distance: 220 },
      remove: { quantity: 5 }
    });
  });
});

describe('emojiChoices', () => {
  it('splits space-separated emoji into one choice each', () => {
    expect(emojiChoices(' 🌸  🍃 ')).toEqual(['🌸', '🍃']);
  });

  it('falls back to a sparkle when the field has been emptied', () => {
    expect(emojiChoices('   ')).toEqual(['✨']);
  });
});

describe('matchParticlePreset', () => {
  it('recognises every preset from its own settings', () => {
    for (const preset of PARTICLE_PRESETS) {
      expect(matchParticlePreset(preset.settings)?.id).toBe(preset.id);
    }
  });

  it('calls the default Branchify', () => {
    expect(matchParticlePreset(DEFAULT_PARTICLE_SETTINGS)?.label).toBe('Branchify');
  });

  it('matches nothing once a setting has been tuned', () => {
    expect(matchParticlePreset({ ...DEFAULT_PARTICLE_SETTINGS, count: 301 })).toBeNull();
  });

  it('keeps every preset inside the slider ranges', () => {
    for (const preset of PARTICLE_PRESETS) {
      expect(sanitizeParticleSettings(preset.settings)).toEqual(preset.settings);
    }
  });

  it('only ships numbers the sliders can land on', () => {
    for (const preset of PARTICLE_PRESETS) {
      for (const key of Object.keys(PARTICLE_RANGES) as ParticleNumberKey[]) {
        const { min, step } = PARTICLE_RANGES[key];
        const stepsFromMin = (preset.settings[key] - min) / step;

        expect(Math.abs(stepsFromMin - Math.round(stepsFromMin))).toBeLessThan(1e-9);
      }
    }
  });
});

describe('sanitizeParticleSettings', () => {
  it('returns the default for anything that is not an object', () => {
    expect(sanitizeParticleSettings(null)).toEqual(DEFAULT_PARTICLE_SETTINGS);
    expect(sanitizeParticleSettings('snow')).toEqual(DEFAULT_PARTICLE_SETTINGS);
  });

  it('fills settings missing from an older save with the defaults', () => {
    expect(sanitizeParticleSettings({ count: 42 })).toEqual({
      ...DEFAULT_PARTICLE_SETTINGS,
      count: 42
    });
  });

  it('clamps numbers into their slider range', () => {
    const settings = sanitizeParticleSettings({ count: 5000, speed: -3, opacity: 'lots' });

    expect(settings.count).toBe(PARTICLE_RANGES.count.max);
    expect(settings.speed).toBe(PARTICLE_RANGES.speed.min);
    expect(settings.opacity).toBe(DEFAULT_PARTICLE_SETTINGS.opacity);
  });

  it('rejects unknown modes, shapes and malformed colours', () => {
    const settings = sanitizeParticleSettings({
      hoverMode: 'explode',
      shape: 'image',
      direction: 'sideways',
      color: 'red',
      background: '#ABCDEF',
      links: 'yes'
    });

    expect(settings.hoverMode).toBe(DEFAULT_PARTICLE_SETTINGS.hoverMode);
    expect(settings.shape).toBe(DEFAULT_PARTICLE_SETTINGS.shape);
    expect(settings.direction).toBe(DEFAULT_PARTICLE_SETTINGS.direction);
    expect(settings.color).toBe(DEFAULT_PARTICLE_SETTINGS.color);
    expect(settings.background).toBe('#abcdef');
    expect(settings.links).toBe(DEFAULT_PARTICLE_SETTINGS.links);
  });

  it('drops keys it does not know', () => {
    expect(sanitizeParticleSettings({ nyanCat: true })).not.toHaveProperty('nyanCat');
  });
});

describe('parseParticleSettings', () => {
  it('uses the default when nothing, or nothing readable, is stored', () => {
    expect(parseParticleSettings(null)).toEqual(DEFAULT_PARTICLE_SETTINGS);
    expect(parseParticleSettings('{not json')).toEqual(DEFAULT_PARTICLE_SETTINGS);
  });

  it('round-trips saved settings', () => {
    const snow = PARTICLE_PRESETS.find((preset) => preset.id === 'snow')!.settings;

    expect(parseParticleSettings(JSON.stringify(snow))).toEqual(snow);
  });
});
