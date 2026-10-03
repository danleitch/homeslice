import { describe, expect, it } from 'vitest';
import {
  emptyExtensions,
  extensionsToYaml,
  sanitizeExtensions
} from '../dashboard/lib/extensions-config';
import {
  BRANCHIFY_ID,
  appToExtension,
  enabledWidgetTypes,
  hostLabel,
  installApp,
  isFramelessApp,
  isEnabled,
  setEnabled,
  uninstallApp,
  widgetExtensionId
} from './registry';

describe('extensions', () => {
  it('starts with everything on and turns things off and on again', () => {
    let extensions = emptyExtensions();
    expect(isEnabled(extensions, BRANCHIFY_ID)).toBe(true);

    extensions = setEnabled(extensions, BRANCHIFY_ID, false);
    extensions = setEnabled(extensions, BRANCHIFY_ID, false);
    expect(extensions.disabled).toEqual([BRANCHIFY_ID]);
    expect(isEnabled(extensions, BRANCHIFY_ID)).toBe(false);

    extensions = setEnabled(extensions, BRANCHIFY_ID, true);
    expect(isEnabled(extensions, BRANCHIFY_ID)).toBe(true);
  });

  it('takes a turned-off widget out of the Add widget list', () => {
    const extensions = setEnabled(emptyExtensions(), widgetExtensionId('markets'), false);
    expect(enabledWidgetTypes(extensions)).not.toContain('markets');
    expect(enabledWidgetTypes(extensions)).toContain('weather');
  });

  it('installs apps under addresses of their own, and uninstalls them', () => {
    let extensions = emptyExtensions();
    const first = installApp(extensions, 'Doddle', 'http://localhost:8080');
    const second = installApp(first.extensions, 'Doddle', 'https://doddle.example.com');
    extensions = second.extensions;

    expect(first.app.id).toBe('doddle');
    expect(second.app.id).toBe('doddle-2');
    expect(appToExtension(first.app)).toMatchObject({
      id: 'app:doddle',
      kind: 'app',
      publisher: 'localhost:8080'
    });

    extensions = uninstallApp(extensions, 'doddle');
    expect(extensions.apps.map((app) => app.id)).toEqual(['doddle-2']);
  });

  it('keeps what makes sense from hand-edited YAML', () => {
    expect(
      sanitizeExtensions({
        disabled: ['branchify', 'branchify', 7, '', 'widget:weather'],
        apps: [
          { name: 'Doddle', url: 'http://localhost:8080' },
          { name: 'Doddle', url: 'https://doddle.example.com' },
          { name: 'Bad', url: 'javascript:alert(1)' },
          'nope'
        ]
      })
    ).toEqual({
      disabled: ['branchify', 'widget:weather'],
      apps: [
        { id: 'doddle', name: 'Doddle', url: 'http://localhost:8080' },
        { id: 'doddle-2', name: 'Doddle', url: 'https://doddle.example.com' }
      ]
    });
    expect(sanitizeExtensions(undefined)).toEqual(emptyExtensions());
  });

  it('writes nothing to YAML until something changes', () => {
    expect(extensionsToYaml(emptyExtensions())).toBeUndefined();
    expect(extensionsToYaml({ disabled: ['branchify'], apps: [] })).toEqual({
      disabled: ['branchify']
    });
  });
});

describe('hostLabel', () => {
  it('names the host an app runs on, with its port', () => {
    expect(hostLabel('https://doddle.example.com/play')).toBe('doddle.example.com');
    expect(hostLabel('http://nas.lan:8080/app')).toBe('nas.lan:8080');
  });

  it('gives back an address that is not one, as it was', () => {
    expect(hostLabel('not a url')).toBe('not a url');
  });
});

describe('isFramelessApp', () => {
  it('opens Doddle bare, whatever the case of its name', () => {
    expect(isFramelessApp({ name: 'Doddle' })).toBe(true);
    expect(isFramelessApp({ name: 'doddle' })).toBe(true);
  });

  it('gives any other app its title bar', () => {
    expect(isFramelessApp({ name: 'Notes' })).toBe(false);
  });
});
