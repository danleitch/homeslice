import type {
  AiProvider,
  BackgroundStyle,
  BranchSeparators,
  BranchSettings,
  PersistedForm,
  RecentBranch
} from '../types';
import { AI_PROVIDERS } from './ai-handoff';
import { DEFAULT_NAMING_SETTINGS, sanitizeBranchType } from './branch-utils';
import { cleanFishName } from './fish-name';
import { DEFAULT_BASE_FISH, MAX_BASE_FISH, MIN_BASE_FISH } from './koi';
import { sanitizeLilyPlacements, type LilyPlacements } from './pond-decor';
import {
  DEFAULT_PARTICLE_SETTINGS,
  sanitizeParticleSettings,
  type ParticleSettings
} from './particles';

export const FORM_STORAGE_KEY = 'branchify-form';
export const RECENT_STORAGE_KEY = 'branchify-recent';
export const SETTINGS_STORAGE_KEY = 'branchify-settings';
// Kept apart from the naming settings: the backdrop says nothing about branch names.
export const BACKGROUND_STORAGE_KEY = 'branchify-background';
// The pond's own setting, not a naming one either, and not read unless the
// koi background is actually mounted.
export const BASE_FISH_STORAGE_KEY = 'branchify-koi-base-fish';
// How the particles background looks; like the pond's fish, nothing to do with naming.
export const PARTICLES_STORAGE_KEY = 'branchify-particles';
// Where the visitor has dragged the pond's lilies, as fractions of the viewport.
export const LILY_PLACEMENTS_STORAGE_KEY = 'branchify-koi-lilies';
// Names the visitor has given branch koi and residents, by the fish's pond key.
// Fish from the market are renamed in the market account instead.
export const FISH_NAMES_STORAGE_KEY = 'branchify-koi-names';
// The image behind the dashboard's glass when the Wallpaper background is chosen.
export const WALLPAPER_STORAGE_KEY = 'dashboard-wallpaper';
// Whether the Dreams landscape shows by day, by night, or as the system's light or dark.
export const DREAMS_MODE_STORAGE_KEY = 'dashboard-dreams-mode';
// Matches the pond's own cap, so a base fish count of 10 has ten real branches
// to promote out of "resident" and into "yours" before the koi runs out.
export const MAX_RECENT_BRANCHES = MAX_BASE_FISH;
export const MAX_SEPARATOR_LENGTH = 3;

export const EMPTY_FORM: PersistedForm = {
  branchType: 'feat',
  ticketNumber: '',
  description: ''
};

export const DEFAULT_SETTINGS: BranchSettings = DEFAULT_NAMING_SETTINGS;

/**
 * Reads a raw string from localStorage, tolerating environments where storage
 * is unavailable (private browsing, SSR, blocked cookies).
 */
export const readStorage = (key: string): string | null => {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
};

/** Writes to localStorage, silently ignoring quota/availability errors. */
export const writeStorage = (key: string, value: string): void => {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* storage is best-effort; ignore failures */
  }
};

export const parseForm = (raw: string | null): PersistedForm => {
  if (!raw) {
    return EMPTY_FORM;
  }

  try {
    return { ...EMPTY_FORM, ...(JSON.parse(raw) as Partial<PersistedForm>) };
  } catch {
    return EMPTY_FORM;
  }
};

/** Strips whitespace and caps length; falls back to the default when the value isn't a string. */
const sanitizeSeparator = (value: unknown, fallback: string): string => {
  if (typeof value !== 'string') {
    return fallback;
  }

  return value.replace(/\s+/g, '').slice(0, MAX_SEPARATOR_LENGTH);
};

/** Sanitises and de-duplicates stored branch types; falls back to defaults when none survive. */
const sanitizeBranchTypes = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [...DEFAULT_SETTINGS.branchTypes];
  }

  const types = value
    .filter((item): item is string => typeof item === 'string')
    .map(sanitizeBranchType)
    .filter((type, index, all) => type !== '' && all.indexOf(type) === index);

  return types.length > 0 ? types : [...DEFAULT_SETTINGS.branchTypes];
};

/** Sanitises stored AI handoff targets; migrates the older `showAiLinks` boolean when present. */
const sanitizeAiHandoffTargets = (value: unknown, legacyShowAiLinks: unknown): AiProvider[] => {
  if (Array.isArray(value)) {
    const targets = value.filter((item): item is AiProvider =>
      AI_PROVIDERS.includes(item as AiProvider)
    );
    return [...new Set(targets)];
  }

  if (typeof legacyShowAiLinks === 'boolean') {
    return legacyShowAiLinks ? [...AI_PROVIDERS] : [];
  }

  return [...DEFAULT_SETTINGS.aiHandoffTargets];
};

export const parseSettings = (raw: string | null): BranchSettings => {
  if (!raw) {
    return DEFAULT_SETTINGS;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<BranchSettings> & { showAiLinks?: unknown };

    return {
      typeSeparator: sanitizeSeparator(parsed.typeSeparator, DEFAULT_SETTINGS.typeSeparator),
      ticketSeparator: sanitizeSeparator(parsed.ticketSeparator, DEFAULT_SETTINGS.ticketSeparator),
      branchTypes: sanitizeBranchTypes(parsed.branchTypes),
      aiHandoffTargets: sanitizeAiHandoffTargets(parsed.aiHandoffTargets, parsed.showAiLinks)
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const parseSnapshotForm = (value: unknown): PersistedForm | undefined =>
  isRecord(value) &&
  typeof value.branchType === 'string' &&
  typeof value.ticketNumber === 'string' &&
  typeof value.description === 'string'
    ? {
        branchType: value.branchType,
        ticketNumber: value.ticketNumber,
        description: value.description
      }
    : undefined;

const parseSnapshotSeparators = (value: unknown): BranchSeparators | undefined =>
  isRecord(value) &&
  typeof value.typeSeparator === 'string' &&
  typeof value.ticketSeparator === 'string'
    ? {
        typeSeparator: sanitizeSeparator(value.typeSeparator, DEFAULT_SETTINGS.typeSeparator),
        ticketSeparator: sanitizeSeparator(value.ticketSeparator, DEFAULT_SETTINGS.ticketSeparator)
      }
    : undefined;

export const parseRecentBranches = (raw: string | null): RecentBranch[] => {
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter(
        (item): item is Record<string, unknown> =>
          isRecord(item) && typeof item.value === 'string' && typeof item.createdAt === 'string'
      )
      .slice(0, MAX_RECENT_BRANCHES)
      .map((item): RecentBranch => {
        const form = parseSnapshotForm(item.form);
        const separators = parseSnapshotSeparators(item.separators);

        return {
          value: item.value as string,
          createdAt: item.createdAt as string,
          // Only keep the snapshot when it is complete; a half-valid one can't be loaded reliably.
          ...(form && separators ? { form, separators } : {})
        };
      });
  } catch {
    return [];
  }
};

export const BACKGROUND_STYLES: readonly BackgroundStyle[] = [
  'koi',
  'dreams',
  'particles',
  'wallpaper',
  'plain'
];

export const DEFAULT_BACKGROUND: BackgroundStyle = 'koi';

/** Falls back to the default for anything written by a future or broken version. */
export const parseBackground = (raw: string | null): BackgroundStyle =>
  BACKGROUND_STYLES.includes(raw as BackgroundStyle)
    ? (raw as BackgroundStyle)
    : DEFAULT_BACKGROUND;

export type DreamsMode = 'auto' | 'day' | 'night';

export const DREAMS_MODES: readonly DreamsMode[] = ['auto', 'day', 'night'];

export const parseDreamsMode = (raw: string | null): DreamsMode =>
  DREAMS_MODES.includes(raw as DreamsMode) ? (raw as DreamsMode) : 'auto';

/** Falls back to the default for anything missing, non-numeric, or out of range. */
export const parseBaseFish = (raw: string | null): number => {
  const value = Number(raw);

  return Number.isInteger(value) && value >= MIN_BASE_FISH && value <= MAX_BASE_FISH
    ? value
    : DEFAULT_BASE_FISH;
};

/** Keeps whatever still makes sense from a stored look and defaults the rest. */
export const parseParticleSettings = (raw: string | null): ParticleSettings => {
  if (!raw) {
    return DEFAULT_PARTICLE_SETTINGS;
  }

  try {
    return sanitizeParticleSettings(JSON.parse(raw));
  } catch {
    return DEFAULT_PARTICLE_SETTINGS;
  }
};

/** Keeps the placements that still make sense; anything else leaves its lily where the pond put it. */
export const parseLilyPlacements = (raw: string | null): LilyPlacements => {
  if (!raw) {
    return [];
  }

  try {
    return sanitizeLilyPlacements(JSON.parse(raw));
  } catch {
    return [];
  }
};

/** Names a visitor has given fish, by pond key. */
export type FishNames = Readonly<Record<string, string>>;

/** How many names are remembered; a branch that has left the recent list keeps its koi's name only this long. */
export const MAX_FISH_NAMES = 200;

/** Keeps the names that are still names, newest last, within the cap. */
export const sanitizeFishNames = (value: unknown): FishNames => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {};
  }

  const kept = Object.entries(value)
    .map(([key, name]) => [key, cleanFishName(name)] as const)
    .filter((entry): entry is readonly [string, string] => entry[1] !== null);

  return Object.fromEntries(kept.slice(-MAX_FISH_NAMES));
};

export const parseFishNames = (raw: string | null): FishNames => {
  if (!raw) {
    return {};
  }

  try {
    return sanitizeFishNames(JSON.parse(raw));
  } catch {
    return {};
  }
};

/** An image address for the wallpaper background; anything that isn't one is dropped. */
export const parseWallpaper = (raw: string | null): string => {
  const value = raw?.trim() ?? '';
  return /^(https?:\/\/|data:image\/|\/)/i.test(value) ? value.slice(0, 4000) : '';
};
