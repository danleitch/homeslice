import type { IParticlesProps } from '@tsparticles/react';

/** The shapes tsParticles' slim bundle can draw without loading an image. */
export type ParticleShape = 'circle' | 'square' | 'triangle' | 'polygon' | 'star' | 'emoji';

/** What the particles do while a pointer is over the page. */
export type ParticleHoverMode = 'grab' | 'bubble' | 'repulse' | 'attract' | 'connect' | 'slow';

/** What a click on the background does to the particles. */
export type ParticleClickMode = 'push' | 'remove' | 'bubble' | 'repulse' | 'attract' | 'pause';

export type ParticleDirection =
  | 'none'
  | 'top'
  | 'top-right'
  | 'right'
  | 'bottom-right'
  | 'bottom'
  | 'bottom-left'
  | 'left'
  | 'top-left';

/** Whether particles leaving the screen wrap round to the far side or bounce off the edge. */
export type ParticleEdgeMode = 'out' | 'bounce';

/**
 * Everything the particle controls can change, kept flat so it stores as one
 * small JSON object. Mirrors the particles.js demo's settings, minus the ones
 * that don't apply here (detect_on, retina_detect, image shapes).
 */
export type ParticleSettings = {
  background: string;
  count: number;
  color: string;
  randomColor: boolean;
  shape: ParticleShape;
  /** Sides of a polygon, or points of a star. */
  sides: number;
  /** Space-separated emoji, one picked per particle. */
  emoji: string;
  size: number;
  randomSize: boolean;
  /** Each particle slowly grows and shrinks. */
  pulse: boolean;
  opacity: number;
  randomOpacity: boolean;
  /** Each particle slowly fades in and out. */
  twinkle: boolean;
  links: boolean;
  linkDistance: number;
  linkColor: string;
  linkOpacity: number;
  linkWidth: number;
  move: boolean;
  speed: number;
  direction: ParticleDirection;
  randomSpeed: boolean;
  straight: boolean;
  edges: ParticleEdgeMode;
  hover: boolean;
  hoverMode: ParticleHoverMode;
  click: boolean;
  clickMode: ParticleClickMode;
  grabDistance: number;
  grabOpacity: number;
  bubbleDistance: number;
  bubbleSize: number;
  bubbleDuration: number;
  bubbleOpacity: number;
  repulseDistance: number;
  pushQuantity: number;
  removeQuantity: number;
};

type KeysOfType<T> = {
  [K in keyof ParticleSettings]: ParticleSettings[K] extends T ? K : never;
}[keyof ParticleSettings];

export type ParticleNumberKey = KeysOfType<number>;
export type ParticleFlagKey = KeysOfType<boolean>;
export type ParticleColourKey = 'background' | 'color' | 'linkColor';

export type ParticleRange = { min: number; max: number; step: number };

/** Slider bounds for every number; stored values outside them are clamped back in. */
export const PARTICLE_RANGES: Readonly<Record<ParticleNumberKey, ParticleRange>> = {
  count: { min: 0, max: 800, step: 1 },
  sides: { min: 3, max: 12, step: 1 },
  size: { min: 1, max: 150, step: 0.5 },
  opacity: { min: 0.05, max: 1, step: 0.05 },
  linkDistance: { min: 20, max: 500, step: 10 },
  linkOpacity: { min: 0.05, max: 1, step: 0.05 },
  linkWidth: { min: 0.5, max: 8, step: 0.5 },
  speed: { min: 0.1, max: 20, step: 0.1 },
  grabDistance: { min: 20, max: 500, step: 10 },
  grabOpacity: { min: 0.05, max: 1, step: 0.05 },
  bubbleDistance: { min: 20, max: 500, step: 10 },
  bubbleSize: { min: 0, max: 80, step: 1 },
  bubbleDuration: { min: 0.1, max: 5, step: 0.1 },
  bubbleOpacity: { min: 0, max: 1, step: 0.05 },
  repulseDistance: { min: 20, max: 500, step: 10 },
  pushQuantity: { min: 1, max: 20, step: 1 },
  removeQuantity: { min: 1, max: 20, step: 1 }
};

export const PARTICLE_SHAPES: readonly ParticleShape[] = [
  'circle',
  'square',
  'triangle',
  'polygon',
  'star',
  'emoji'
];

export const PARTICLE_HOVER_MODES: readonly ParticleHoverMode[] = [
  'grab',
  'bubble',
  'repulse',
  'attract',
  'connect',
  'slow'
];

export const PARTICLE_CLICK_MODES: readonly ParticleClickMode[] = [
  'push',
  'remove',
  'bubble',
  'repulse',
  'attract',
  'pause'
];

export const PARTICLE_DIRECTIONS: readonly ParticleDirection[] = [
  'none',
  'top',
  'top-right',
  'right',
  'bottom-right',
  'bottom',
  'bottom-left',
  'left',
  'top-left'
];

export const PARTICLE_EDGE_MODES: readonly ParticleEdgeMode[] = ['out', 'bounce'];

/** Long enough for a handful of emoji, including the multi-part ones. */
export const MAX_EMOJI_LENGTH = 24;

/** The blue network Branchify has always drawn. */
export const DEFAULT_PARTICLE_SETTINGS: ParticleSettings = {
  background: '#0d1117',
  count: 300,
  color: '#4c7ff7',
  randomColor: false,
  shape: 'circle',
  sides: 5,
  emoji: '✨',
  size: 3,
  randomSize: true,
  pulse: false,
  opacity: 0.5,
  randomOpacity: false,
  twinkle: false,
  links: true,
  linkDistance: 150,
  linkColor: '#4c7ff7',
  linkOpacity: 0.3,
  linkWidth: 1,
  move: true,
  speed: 1.2,
  direction: 'none',
  randomSpeed: false,
  straight: false,
  edges: 'bounce',
  hover: true,
  hoverMode: 'repulse',
  click: false,
  clickMode: 'push',
  grabDistance: 160,
  grabOpacity: 0.8,
  bubbleDistance: 200,
  bubbleSize: 8,
  bubbleDuration: 2,
  bubbleOpacity: 0.8,
  repulseDistance: 100,
  pushQuantity: 4,
  removeQuantity: 2
};

export type ParticlePreset = { id: string; label: string; settings: ParticleSettings };

const preset = (id: string, label: string, changes: Partial<ParticleSettings>): ParticlePreset => ({
  id,
  label,
  settings: { ...DEFAULT_PARTICLE_SETTINGS, ...changes }
});

/**
 * Starting points, after the particles.js demo's own. Counts are scaled up
 * from particles.js, which counts per 800×800 area where tsParticles counts
 * per 1080p screen, and speeds are roughly halved to match.
 */
export const PARTICLE_PRESETS: readonly ParticlePreset[] = [
  preset('branchify', 'Branchify', {}),
  preset('classic', 'Classic', {
    background: '#b61924',
    count: 250,
    color: '#ffffff',
    linkColor: '#ffffff',
    linkOpacity: 0.4,
    speed: 3,
    edges: 'out',
    hoverMode: 'grab',
    grabDistance: 140,
    grabOpacity: 1,
    click: true
  }),
  preset('nasa', 'NASA', {
    background: '#0b0f2b',
    count: 400,
    color: '#ffffff',
    opacity: 1,
    randomOpacity: true,
    twinkle: true,
    links: false,
    linkColor: '#ffffff',
    speed: 1,
    randomSpeed: true,
    edges: 'out',
    hoverMode: 'bubble',
    bubbleDistance: 250,
    bubbleSize: 0,
    bubbleOpacity: 0,
    click: true,
    clickMode: 'repulse',
    repulseDistance: 400
  }),
  preset('bubble', 'Bubble', {
    background: '#b61924',
    count: 12,
    color: '#1b1e34',
    shape: 'polygon',
    sides: 6,
    size: 120,
    randomSize: false,
    pulse: true,
    opacity: 0.3,
    randomOpacity: true,
    links: false,
    speed: 5,
    edges: 'out',
    hover: false
  }),
  preset('snow', 'Snow', {
    background: '#1b2735',
    count: 600,
    color: '#ffffff',
    size: 5,
    randomOpacity: true,
    links: false,
    linkColor: '#ffffff',
    speed: 2,
    direction: 'bottom',
    edges: 'out',
    hoverMode: 'bubble',
    bubbleSize: 4,
    bubbleDuration: 0.3,
    bubbleOpacity: 1,
    click: true,
    clickMode: 'repulse',
    repulseDistance: 200
  }),
  preset('shooting-stars', 'Shooting stars', {
    background: '#043564',
    count: 300,
    color: '#ffffff',
    shape: 'star',
    size: 4,
    links: false,
    linkColor: '#ffffff',
    speed: 8,
    direction: 'left',
    randomSpeed: true,
    straight: true,
    edges: 'out',
    hover: false,
    click: true,
    clickMode: 'repulse'
  }),
  preset('blossom', 'Blossom', {
    background: '#1f1a24',
    count: 60,
    shape: 'emoji',
    emoji: '🌸',
    size: 10,
    opacity: 0.9,
    links: false,
    speed: 1.5,
    direction: 'bottom-right',
    edges: 'out'
  })
];

const SETTING_KEYS = Object.keys(DEFAULT_PARTICLE_SETTINGS) as (keyof ParticleSettings)[];

/** The preset these settings are exactly, or null once anything has been tuned. */
export const matchParticlePreset = (settings: ParticleSettings): ParticlePreset | null =>
  PARTICLE_PRESETS.find((candidate) =>
    SETTING_KEYS.every((key) => candidate.settings[key] === settings[key])
  ) ?? null;

const HEX_COLOUR = /^#[0-9a-f]{6}$/i;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const oneOf = <T extends string>(raw: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(raw as T) ? (raw as T) : fallback;

/**
 * Rebuilds settings from anything found in storage: unknown keys dropped,
 * missing or broken ones defaulted, numbers clamped into their slider's range.
 */
export const sanitizeParticleSettings = (value: unknown): ParticleSettings => {
  if (!isRecord(value)) {
    return DEFAULT_PARTICLE_SETTINGS;
  }

  const d = DEFAULT_PARTICLE_SETTINGS;

  const num = (key: ParticleNumberKey): number => {
    const raw = value[key];
    const { min, max } = PARTICLE_RANGES[key];

    return typeof raw === 'number' && Number.isFinite(raw)
      ? Math.min(max, Math.max(min, raw))
      : d[key];
  };

  const flag = (key: ParticleFlagKey): boolean =>
    typeof value[key] === 'boolean' ? (value[key] as boolean) : d[key];

  const colour = (key: ParticleColourKey): string => {
    const raw = value[key];
    return typeof raw === 'string' && HEX_COLOUR.test(raw) ? raw.toLowerCase() : d[key];
  };

  const emoji =
    typeof value.emoji === 'string'
      ? Array.from(value.emoji).slice(0, MAX_EMOJI_LENGTH).join('')
      : d.emoji;

  return {
    background: colour('background'),
    count: num('count'),
    color: colour('color'),
    randomColor: flag('randomColor'),
    shape: oneOf(value.shape, PARTICLE_SHAPES, d.shape),
    sides: num('sides'),
    emoji,
    size: num('size'),
    randomSize: flag('randomSize'),
    pulse: flag('pulse'),
    opacity: num('opacity'),
    randomOpacity: flag('randomOpacity'),
    twinkle: flag('twinkle'),
    links: flag('links'),
    linkDistance: num('linkDistance'),
    linkColor: colour('linkColor'),
    linkOpacity: num('linkOpacity'),
    linkWidth: num('linkWidth'),
    move: flag('move'),
    speed: num('speed'),
    direction: oneOf(value.direction, PARTICLE_DIRECTIONS, d.direction),
    randomSpeed: flag('randomSpeed'),
    straight: flag('straight'),
    edges: oneOf(value.edges, PARTICLE_EDGE_MODES, d.edges),
    hover: flag('hover'),
    hoverMode: oneOf(value.hoverMode, PARTICLE_HOVER_MODES, d.hoverMode),
    click: flag('click'),
    clickMode: oneOf(value.clickMode, PARTICLE_CLICK_MODES, d.clickMode),
    grabDistance: num('grabDistance'),
    grabOpacity: num('grabOpacity'),
    bubbleDistance: num('bubbleDistance'),
    bubbleSize: num('bubbleSize'),
    bubbleDuration: num('bubbleDuration'),
    bubbleOpacity: num('bubbleOpacity'),
    repulseDistance: num('repulseDistance'),
    pushQuantity: num('pushQuantity'),
    removeQuantity: num('removeQuantity')
  };
};

/** The emoji a particle may be drawn as; an emptied field falls back to the default sparkle. */
export const emojiChoices = (emoji: string): string[] => {
  const choices = emoji.split(/\s+/).filter(Boolean);
  return choices.length > 0 ? choices : [DEFAULT_PARTICLE_SETTINGS.emoji];
};

export type ParticlesOptions = NonNullable<IParticlesProps['options']>;

/** Randomised values run from a fraction of the chosen one up to it, as in particles.js. */
const sizeRange = (size: number): { min: number; max: number } => ({
  min: Math.min(size, Math.max(1, size / 4)),
  max: size
});

const opacityRange = (opacity: number): { min: number; max: number } => ({
  min: opacity / 10,
  max: opacity
});

/** Translates the flat settings into tsParticles' options. */
export const toParticlesOptions = (settings: ParticleSettings): ParticlesOptions => {
  const s = settings;

  return {
    background: { color: { value: s.background } },
    fpsLimit: 60,
    interactivity: {
      events: {
        onHover: { enable: s.hover, mode: s.hoverMode },
        onClick: { enable: s.click, mode: s.clickMode }
      },
      modes: {
        grab: { distance: s.grabDistance, links: { opacity: s.grabOpacity } },
        bubble: {
          distance: s.bubbleDistance,
          size: s.bubbleSize,
          duration: s.bubbleDuration,
          opacity: s.bubbleOpacity
        },
        repulse: { distance: s.repulseDistance, duration: 0.4 },
        push: { quantity: s.pushQuantity },
        remove: { quantity: s.removeQuantity }
      }
    },
    particles: {
      // tsParticles 4 paints from `paint` and no longer reads `particles.color`.
      paint: { fill: { enable: true, color: { value: s.randomColor ? 'random' : s.color } } },
      links: {
        color: s.linkColor,
        distance: s.linkDistance,
        enable: s.links,
        opacity: s.linkOpacity,
        width: s.linkWidth
      },
      move: {
        enable: s.move,
        speed: s.speed,
        direction: s.direction,
        random: s.randomSpeed,
        straight: s.straight,
        outModes: { default: s.edges }
      },
      number: {
        density: { enable: true },
        value: s.count
      },
      opacity: {
        value: s.randomOpacity || s.twinkle ? opacityRange(s.opacity) : s.opacity,
        animation: { enable: s.twinkle, speed: 1, sync: false }
      },
      shape: {
        type: s.shape,
        options: {
          polygon: { sides: s.sides },
          star: { sides: s.sides },
          emoji: { value: emojiChoices(s.emoji) }
        }
      },
      size: {
        value: s.randomSize || s.pulse ? sizeRange(s.size) : s.size,
        // Big shapes need a faster pulse to get through their range at all.
        animation: { enable: s.pulse, speed: Math.max(2, s.size / 4), sync: false }
      }
    },
    detectRetina: true
  };
};
