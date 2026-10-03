/**
 * Everything the dashboard can add or take away: its own tools and widgets,
 * which ship inside this bundle and can be turned off, and web apps, which
 * live at their own address and open over the board in a frame.
 *
 * A first-party extension is a manifest here plus the code it points at. An
 * app is only a name and an address, so anything that runs on the web, built
 * with anything, can be one without this project knowing how it is made.
 */
import { AppWindow, Gamepad2, GitBranch, type LucideIcon } from 'lucide-react';
import {
  appSlug,
  type AppExtension,
  type ExtensionsConfig
} from '../dashboard/lib/extensions-config';
import {
  WIDGET_BLURBS,
  WIDGET_LABELS,
  WIDGET_TYPES,
  type WidgetType
} from '../dashboard/lib/model';
import { WIDGET_ICONS } from '../dashboard/widgets/widget-icons';

export type ExtensionKind = 'tool' | 'widget' | 'app';

export type Extension = {
  /** "branchify", "widget:weather", "app:doddle". */
  id: string;
  name: string;
  publisher: string;
  description: string;
  kind: ExtensionKind;
  icon: LucideIcon;
  /** The key that opens a tool, shown in its tooltip. */
  shortcut?: string;
  /** For a widget: the card it adds. */
  widget?: WidgetType;
  /** For an app: where it lives. */
  url?: string;
};

export const KIND_LABELS: Readonly<Record<ExtensionKind, string>> = {
  tool: 'Tool',
  widget: 'Widget',
  app: 'App'
};

export const BRANCHIFY_ID = 'branchify';

export const widgetExtensionId = (type: WidgetType): string => `widget:${type}`;

export const appExtensionId = (id: string): string => `app:${id}`;

/** What ships inside the dashboard; each can be turned off but not removed. */
export const BUILT_IN_EXTENSIONS: readonly Extension[] = [
  {
    id: BRANCHIFY_ID,
    name: 'Branchify',
    publisher: 'Built in',
    description: 'Name a git branch from a ticket, with the command and PR title to match.',
    kind: 'tool',
    icon: GitBranch,
    shortcut: 'B'
  },
  ...WIDGET_TYPES.map((type): Extension => ({
    id: widgetExtensionId(type),
    name: WIDGET_LABELS[type],
    publisher: 'Built in',
    description: WIDGET_BLURBS[type],
    kind: 'widget',
    icon: WIDGET_ICONS[type],
    widget: type
  }))
];

export type SuggestedApp = {
  name: string;
  description: string;
  icon: LucideIcon;
  /** Where it usually runs; empty when each person hosts their own. */
  url: string;
  urlHint: string;
  /** Shown with no title bar or border: just the app, and a click outside closes it. */
  frameless?: boolean;
};

/** Apps offered in the Extensions view before they are installed. */
export const SUGGESTED_APPS: readonly SuggestedApp[] = [
  {
    name: 'Doddle',
    description: 'A word game: guess the hidden word on a 4, 5 or 6 letter board.',
    icon: Gamepad2,
    url: 'https://doddle.theleechies.co.za/',
    urlHint: 'Where Doddle runs',
    frameless: true
  }
];

/** Whether an app opens bare, as its suggestion says; any other app gets a title bar. */
export const isFramelessApp = (app: Pick<AppExtension, 'name'>): boolean =>
  SUGGESTED_APPS.find((suggested) => suggested.name.toLowerCase() === app.name.toLowerCase())
    ?.frameless === true;

export const iconForApp = (app: Pick<AppExtension, 'name'>): LucideIcon =>
  SUGGESTED_APPS.find((suggested) => suggested.name.toLowerCase() === app.name.toLowerCase())
    ?.icon ?? AppWindow;

export const appToExtension = (app: AppExtension): Extension => ({
  id: appExtensionId(app.id),
  name: app.name,
  publisher: hostLabel(app.url),
  description:
    SUGGESTED_APPS.find((suggested) => suggested.name.toLowerCase() === app.name.toLowerCase())
      ?.description ?? 'A web app, opened over the board.',
  kind: 'app',
  icon: iconForApp(app),
  url: app.url
});

export const hostLabel = (url: string): string => {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};

export const isEnabled = (extensions: ExtensionsConfig, id: string): boolean =>
  !extensions.disabled.includes(id);

export const setEnabled = (
  extensions: ExtensionsConfig,
  id: string,
  enabled: boolean
): ExtensionsConfig => ({
  ...extensions,
  disabled: enabled
    ? extensions.disabled.filter((other) => other !== id)
    : [...extensions.disabled.filter((other) => other !== id), id]
});

/** Adds an app under a slug no other installed app has, and says which one it got. */
export const installApp = (
  extensions: ExtensionsConfig,
  name: string,
  url: string
): { extensions: ExtensionsConfig; app: AppExtension } => {
  const taken = new Set(extensions.apps.map((app) => app.id));
  const base = appSlug(name);
  let id = base;

  for (let suffix = 2; taken.has(id); suffix += 1) {
    id = `${base}-${suffix}`;
  }

  const app: AppExtension = { id, name: name.trim() || hostLabel(url), url: url.trim() };
  return { extensions: { ...extensions, apps: [...extensions.apps, app] }, app };
};

export const uninstallApp = (extensions: ExtensionsConfig, id: string): ExtensionsConfig => ({
  ...extensions,
  apps: extensions.apps.filter((app) => app.id !== id)
});

/** The widget types still offered in the Add widget list. */
export const enabledWidgetTypes = (extensions: ExtensionsConfig): WidgetType[] =>
  WIDGET_TYPES.filter((type) => isEnabled(extensions, widgetExtensionId(type)));
