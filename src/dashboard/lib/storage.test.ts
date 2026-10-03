import { beforeEach, describe, expect, it } from 'vitest';
import { BACKGROUND_STORAGE_KEY, PARTICLES_STORAGE_KEY } from '../../lib/storage';
import { createStarterConfig, sanitizeConfig } from './model';
import {
  DASHBOARD_STORAGE_KEY,
  SAVED_KEYS,
  collectSavedState,
  loadConfig,
  restoreSavedState,
  saveConfig
} from './storage';
import { yamlToConfig } from './yaml';

describe('the stored dashboard', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('is the starter board for a first visit', () => {
    expect(loadConfig().name).toBe(createStarterConfig().name);
  });

  it('is the starter board when what was stored is not a dashboard', () => {
    window.localStorage.setItem(DASHBOARD_STORAGE_KEY, 'title: [unclosed');

    expect(loadConfig().name).toBe(createStarterConfig().name);
  });

  it('comes back as it was saved, in the same YAML the editor shows', () => {
    const config = sanitizeConfig({
      name: 'Sam',
      groups: [{ name: 'Code', bookmarks: [{ name: 'GitHub', url: 'https://github.com' }] }]
    });

    const yaml = saveConfig(config);

    expect(window.localStorage.getItem(DASHBOARD_STORAGE_KEY)).toBe(yaml);
    expect(yamlToConfig(yaml).ok).toBe(true);
    expect(loadConfig().name).toBe('Sam');
  });
});

describe('the rest of what is stored', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('collects only what has been stored', () => {
    expect(collectSavedState()).toEqual({});

    window.localStorage.setItem(PARTICLES_STORAGE_KEY, JSON.stringify({ count: 40 }));

    expect(collectSavedState()).toEqual({ particles: { count: 40 } });
  });

  it('reads the background as it is stored, bare rather than quoted', () => {
    window.localStorage.setItem(BACKGROUND_STORAGE_KEY, 'koi');

    expect(collectSavedState()).toEqual({ background: 'koi' });
  });

  it('writes an export’s state back, strings as they are and the rest as JSON', () => {
    restoreSavedState({ background: 'plain', particles: { count: 7 } });

    expect(window.localStorage.getItem(BACKGROUND_STORAGE_KEY)).toBe('plain');
    expect(window.localStorage.getItem(PARTICLES_STORAGE_KEY)).toBe('{"count":7}');
  });

  it('leaves alone whatever the export does not mention, and what it mentions that is not ours', () => {
    window.localStorage.setItem(PARTICLES_STORAGE_KEY, '{"count":1}');

    restoreSavedState({ background: 'plain', 'something-else': 'ignored' });

    expect(window.localStorage.getItem(PARTICLES_STORAGE_KEY)).toBe('{"count":1}');
    expect(window.localStorage.getItem('something-else')).toBeNull();
  });

  it('collects back what it restored, under every name it knows', () => {
    const everything = Object.fromEntries(
      Object.keys(SAVED_KEYS).map((name) => [name, `{"x":"${name}"}`])
    );

    restoreSavedState(
      Object.fromEntries(Object.entries(everything).map(([name, json]) => [name, JSON.parse(json)]))
    );

    expect(collectSavedState()).toEqual(
      Object.fromEntries(Object.entries(everything).map(([name, json]) => [name, JSON.parse(json)]))
    );
  });
});
