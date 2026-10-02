import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { ExternalLink, Plus, Search, Trash2 } from 'lucide-react';
import { Drawer } from '../dashboard/components/ui';
import { isAppUrl, type ExtensionsConfig } from '../dashboard/lib/extensions-config';
import {
  BUILT_IN_EXTENSIONS,
  KIND_LABELS,
  SUGGESTED_APPS,
  appToExtension,
  installApp,
  isEnabled,
  setEnabled,
  uninstallApp,
  type Extension,
  type SuggestedApp
} from './registry';
import '../dashboard/shell.css';

type ExtensionsPanelProps = {
  extensions: ExtensionsConfig;
  onChange: (next: ExtensionsConfig, message?: string) => void;
  onOpenApp: (id: string) => void;
  onClose: () => void;
};

const matches = (query: string, ...fields: string[]): boolean => {
  const needle = query.trim().toLowerCase();
  return !needle || fields.some((field) => field.toLowerCase().includes(needle));
};

const Row = ({
  extension,
  disabled,
  children
}: {
  extension: Pick<Extension, 'name' | 'publisher' | 'description' | 'kind' | 'icon'>;
  disabled?: boolean;
  children: ReactNode;
}): JSX.Element => {
  const Icon = extension.icon;

  return (
    <li className="ext-row" data-disabled={disabled ? '' : undefined}>
      <span className={`ext-icon ext-icon--${extension.kind}`} aria-hidden="true">
        <Icon size={20} />
      </span>
      <div className="ext-text">
        <span className="ext-name">{extension.name}</span>
        <span className="ext-publisher">
          {extension.publisher} · {KIND_LABELS[extension.kind]}
        </span>
        <span className="ext-desc">{extension.description}</span>
      </div>
      <div className="ext-actions">{children}</div>
    </li>
  );
};

const Toggle = ({
  name,
  on,
  onChange
}: {
  name: string;
  on: boolean;
  onChange: (on: boolean) => void;
}): JSX.Element => (
  <input
    type="checkbox"
    role="switch"
    className="switch"
    checked={on}
    aria-label={`${name} enabled`}
    onChange={(event) => onChange(event.target.checked)}
  />
);

/** A suggested app, with the address it should open at asked for on install. */
const SuggestedRow = ({
  app,
  onInstall
}: {
  app: SuggestedApp;
  onInstall: (url: string) => void;
}): JSX.Element => {
  const [asking, setAsking] = useState(false);
  const [url, setUrl] = useState(app.url);
  const [error, setError] = useState('');

  const submit = (event: FormEvent): void => {
    event.preventDefault();

    if (!isAppUrl(url)) {
      setError('That needs to be a full address, starting http:// or https://');
      return;
    }

    onInstall(url.trim());
  };

  return (
    <Row
      extension={{
        name: app.name,
        publisher: 'Suggested',
        description: app.description,
        kind: 'app',
        icon: app.icon
      }}
    >
      {asking ? null : (
        <button
          type="button"
          className="btn btn-primary btn-small"
          onClick={() => (app.url ? onInstall(app.url) : setAsking(true))}
        >
          Install
        </button>
      )}
      {asking && (
        <form className="ext-install" onSubmit={submit}>
          <input
            type="url"
            value={url}
            placeholder={app.urlHint}
            aria-label={`Address of ${app.name}`}
            spellCheck={false}
            autoFocus
            onChange={(event) => {
              setUrl(event.target.value);
              setError('');
            }}
          />
          <button type="submit" className="btn btn-primary btn-small">
            Add
          </button>
          {error && (
            <span className="field-error" role="alert">
              {error}
            </span>
          )}
        </form>
      )}
    </Row>
  );
};

/** An app by address: anything on the web, built with anything, opened over the board. */
const AddAppForm = ({ onAdd }: { onAdd: (name: string, url: string) => void }): JSX.Element => {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');

  return (
    <form
      className="ext-add"
      onSubmit={(event) => {
        event.preventDefault();

        if (!isAppUrl(url)) {
          setError('That needs to be a full address, starting http:// or https://');
          return;
        }

        onAdd(name, url);
        setName('');
        setUrl('');
      }}
    >
      <span className="field-label">Add an app by address</span>
      <div className="ext-add-fields">
        <input
          type="text"
          value={name}
          placeholder="Name"
          aria-label="App name"
          maxLength={60}
          onChange={(event) => setName(event.target.value)}
        />
        <input
          type="url"
          value={url}
          placeholder="https://…"
          aria-label="App address"
          spellCheck={false}
          onChange={(event) => {
            setUrl(event.target.value);
            setError('');
          }}
        />
        <button type="submit" className="btn btn-secondary btn-small">
          <Plus size={14} aria-hidden="true" /> Add
        </button>
      </div>
      {error ? (
        <span className="field-error" role="alert">
          {error}
        </span>
      ) : (
        <span className="field-hint">
          It opens in a frame over the board, so the site has to allow being framed.
        </span>
      )}
    </form>
  );
};

/** VS Code's Extensions view: what is installed, what could be, and a switch for each. */
export const ExtensionsPanel = ({
  extensions,
  onChange,
  onOpenApp,
  onClose
}: ExtensionsPanelProps): JSX.Element => {
  const [query, setQuery] = useState('');

  const tools = BUILT_IN_EXTENSIONS.filter((extension) => extension.kind === 'tool');
  const widgets = BUILT_IN_EXTENSIONS.filter((extension) => extension.kind === 'widget');
  const apps = useMemo(() => extensions.apps.map(appToExtension), [extensions.apps]);
  const suggested = SUGGESTED_APPS.filter(
    (app) =>
      !extensions.apps.some((installed) => installed.name.toLowerCase() === app.name.toLowerCase())
  );

  const visible = (extension: Pick<Extension, 'name' | 'description' | 'publisher'>): boolean =>
    matches(query, extension.name, extension.description, extension.publisher);

  const toggleRow = (extension: Extension): JSX.Element => {
    const on = isEnabled(extensions, extension.id);

    return (
      <Row key={extension.id} extension={extension} disabled={!on}>
        <Toggle
          name={extension.name}
          on={on}
          onChange={(next) => onChange(setEnabled(extensions, extension.id, next))}
        />
      </Row>
    );
  };

  const install = (name: string, url: string): void => {
    const result = installApp(extensions, name, url);
    onChange(result.extensions, `Installed ${result.app.name}`);
  };

  const shownTools = tools.filter(visible);
  const shownApps = apps.filter(visible);
  const shownSuggested = suggested.filter((app) => matches(query, app.name, app.description));
  const shownWidgets = widgets.filter(visible);
  const nothing =
    shownTools.length + shownApps.length + shownSuggested.length + shownWidgets.length === 0;

  return (
    <Drawer title="Extensions" side="left" closeLabel="Close extensions" onClose={onClose}>
      <div className="drawer-body ext-body">
        <label className="ext-search">
          <Search size={15} aria-hidden="true" />
          <input
            type="search"
            value={query}
            placeholder="Search extensions"
            aria-label="Search extensions"
            data-autofocus=""
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>

        {shownTools.length > 0 && (
          <section className="ext-section">
            <h3>Tools</h3>
            <ul className="ext-list">{shownTools.map(toggleRow)}</ul>
          </section>
        )}

        {(shownApps.length > 0 || shownSuggested.length > 0 || !query) && (
          <section className="ext-section">
            <h3>Apps</h3>
            <ul className="ext-list">
              {shownApps.map((app) => {
                const id = app.id.replace(/^app:/, '');
                return (
                  <Row key={app.id} extension={app}>
                    <button
                      type="button"
                      className="btn btn-secondary btn-small"
                      onClick={() => onOpenApp(id)}
                    >
                      Open
                    </button>
                    <a
                      className="icon-btn"
                      href={app.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      aria-label={`Open ${app.name} in a new tab`}
                      title="Open in a new tab"
                    >
                      <ExternalLink size={14} />
                    </a>
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label={`Uninstall ${app.name}`}
                      title="Uninstall"
                      onClick={() =>
                        onChange(uninstallApp(extensions, id), `Uninstalled ${app.name}`)
                      }
                    >
                      <Trash2 size={14} />
                    </button>
                  </Row>
                );
              })}
              {shownSuggested.map((app) => (
                <SuggestedRow
                  key={app.name}
                  app={app}
                  onInstall={(url) => install(app.name, url)}
                />
              ))}
            </ul>
            {!query && <AddAppForm onAdd={install} />}
          </section>
        )}

        {shownWidgets.length > 0 && (
          <section className="ext-section">
            <h3>Widgets</h3>
            <p className="field-hint">
              A widget turned off leaves the Add widget list. Cards already on the board stay until
              you remove them.
            </p>
            <ul className="ext-list">{shownWidgets.map(toggleRow)}</ul>
          </section>
        )}

        {nothing && <p className="ext-empty">No extensions match “{query.trim()}”.</p>}
      </div>
    </Drawer>
  );
};
