/**
 * The part of the dashboard's YAML that says which extensions are on and
 * which apps are installed. Like the rest of the config, it is sanitised on
 * the way in, so a hand-edited file can never break the page.
 */

/** A web app installed as an extension: it opens over the board in a frame. */
export type AppExtension = {
  /** A slug, unique among the installed apps, used in its address: /#app/doddle. */
  id: string;
  name: string;
  url: string;
};

export type ExtensionsConfig = {
  /** Built-in extensions that have been turned off; everything else is on. */
  disabled: string[];
  apps: AppExtension[];
};

export const emptyExtensions = (): ExtensionsConfig => ({ disabled: [], apps: [] });

/** A slug for an app's address, from its name. */
export const appSlug = (name: string): string =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'app';

/** Only http(s) addresses can be framed as apps. */
export const isAppUrl = (url: string): boolean => /^https?:\/\/\S+$/i.test(url.trim());

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const text = (value: unknown, max: number): string =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';

const sanitizeApps = (value: unknown): AppExtension[] => {
  const seen = new Set<string>();

  return (Array.isArray(value) ? value : [])
    .map((item): AppExtension | null => {
      if (!isRecord(item)) {
        return null;
      }

      const url = text(item.url, 2000);

      if (!isAppUrl(url)) {
        return null;
      }

      const name = text(item.name, 60) || url;
      const base = appSlug(text(item.id, 40) || name);
      let id = base;

      for (let suffix = 2; seen.has(id); suffix += 1) {
        id = `${base}-${suffix}`;
      }

      seen.add(id);
      return { id, name, url };
    })
    .filter((item): item is AppExtension => item !== null)
    .slice(0, 24);
};

export const sanitizeExtensions = (value: unknown): ExtensionsConfig => {
  const record = isRecord(value) ? value : {};

  return {
    disabled: [
      ...new Set(
        (Array.isArray(record.disabled) ? record.disabled : [])
          .map((item) => text(item, 60))
          .filter(Boolean)
      )
    ].slice(0, 64),
    apps: sanitizeApps(record.apps)
  };
};

/** What the YAML says, leaving out what is the default. */
export const extensionsToYaml = (
  extensions: ExtensionsConfig
): Record<string, unknown> | undefined =>
  extensions.disabled.length || extensions.apps.length
    ? {
        ...(extensions.disabled.length ? { disabled: extensions.disabled } : {}),
        ...(extensions.apps.length
          ? { apps: extensions.apps.map(({ id, name, url }) => ({ id, name, url })) }
          : {})
      }
    : undefined;
