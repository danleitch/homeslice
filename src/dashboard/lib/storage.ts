import { KOI_ACCOUNT_STORAGE_KEY } from '../../lib/koi-account';
import {
  BACKGROUND_STORAGE_KEY,
  BASE_FISH_STORAGE_KEY,
  FISH_NAMES_STORAGE_KEY,
  FORM_STORAGE_KEY,
  LILY_PLACEMENTS_STORAGE_KEY,
  PARTICLES_STORAGE_KEY,
  RECENT_STORAGE_KEY,
  SETTINGS_STORAGE_KEY,
  WALLPAPER_STORAGE_KEY,
  DREAMS_MODE_STORAGE_KEY,
  readStorage,
  writeStorage
} from '../../lib/storage';
import { createStarterConfig, type DashboardConfig } from './model';
import { configToYaml, yamlToConfig, type SavedState } from './yaml';

/** The dashboard itself, stored as the same YAML the editor shows. */
export const DASHBOARD_STORAGE_KEY = 'dashboard-config';

/** The page this browser last looked at, so a reload comes back to it. */
export const PAGE_STORAGE_KEY = 'dashboard-page';

/**
 * Everything else worth carrying between browsers, by the name it has in an
 * export. Branchify's form and the pond's state are included so an import
 * really does bring a visitor's whole setup back.
 */
export const SAVED_KEYS: Readonly<Record<string, string>> = {
  background: BACKGROUND_STORAGE_KEY,
  wallpaper: WALLPAPER_STORAGE_KEY,
  'dreams-mode': DREAMS_MODE_STORAGE_KEY,
  particles: PARTICLES_STORAGE_KEY,
  'branchify-settings': SETTINGS_STORAGE_KEY,
  'branchify-recent': RECENT_STORAGE_KEY,
  'branchify-form': FORM_STORAGE_KEY,
  'pond-fish': BASE_FISH_STORAGE_KEY,
  'pond-lilies': LILY_PLACEMENTS_STORAGE_KEY,
  'pond-names': FISH_NAMES_STORAGE_KEY,
  'koi-market': KOI_ACCOUNT_STORAGE_KEY
};

/** The stored dashboard, or the starter board for a first visit. */
export const loadConfig = (): DashboardConfig => {
  const raw = readStorage(DASHBOARD_STORAGE_KEY);

  if (raw === null) {
    return createStarterConfig();
  }

  const parsed = yamlToConfig(raw);
  return parsed.ok ? parsed.value : createStarterConfig();
};

export const saveConfig = (config: DashboardConfig): string => {
  const yaml = configToYaml(config);
  writeStorage(DASHBOARD_STORAGE_KEY, yaml);
  return yaml;
};

/** Reads every other stored setting, as data rather than strings where it can. */
export const collectSavedState = (): SavedState => {
  const saved: SavedState = {};

  for (const [name, key] of Object.entries(SAVED_KEYS)) {
    const raw = readStorage(key);

    if (raw === null) {
      continue;
    }

    try {
      saved[name] = JSON.parse(raw);
    } catch {
      // The background is stored bare, as "koi" rather than "\"koi\"".
      saved[name] = raw;
    }
  }

  return saved;
};

/** Writes an export's saved state back; each value is checked again when it is next read. */
export const restoreSavedState = (saved: SavedState): void => {
  for (const [name, key] of Object.entries(SAVED_KEYS)) {
    if (!(name in saved)) {
      continue;
    }

    const value = saved[name];
    writeStorage(key, typeof value === 'string' ? value : JSON.stringify(value));
  }
};
