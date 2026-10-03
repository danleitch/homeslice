import { useMemo, useState, type ReactNode, type RefObject, type JSX } from 'react';
import { ArrowUpRight, CornerDownLeft, Globe, Search } from 'lucide-react';
import { SEARCH_ENGINES, type Group, type SearchEngine } from '../lib/model';
import { searchBookmarks } from '../lib/search';
import { displayUrl, looksLikeUrl, normalizeUrl, openUrl } from '../lib/urls';
import { BookmarkIcon } from './bookmark-icon';

export type Command = {
  id: string;
  label: string;
  icon: ReactNode;
  /** Extra words that should find this command. */
  keywords: string;
  hint?: string;
  run: () => void;
};

type Result =
  | { kind: 'bookmark'; key: string; url: string; label: string; detail: string; icon: ReactNode }
  | { kind: 'go'; key: string; url: string; label: string }
  | { kind: 'search'; key: string; url: string; label: string }
  | { kind: 'command'; key: string; command: Command };

type SearchBoxProps = {
  groups: readonly Group[];
  engine: SearchEngine;
  newTab: boolean;
  commands: readonly Command[];
  inputRef: RefObject<HTMLInputElement | null>;
};

/**
 * One box for everything: type to find a bookmark, paste an address to go
 * there, or press Enter to search the web. A few of the board's own actions
 * answer to their names too.
 */
export const SearchBox = ({
  groups,
  engine,
  newTab,
  commands,
  inputRef
}: SearchBoxProps): JSX.Element => {
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const trimmed = query.trim();

  const results = useMemo<Result[]>(() => {
    if (!trimmed) {
      return [];
    }

    const lower = trimmed.toLowerCase();
    const list: Result[] = searchBookmarks(groups, trimmed, 7).map(({ bookmark, group }) => ({
      kind: 'bookmark',
      key: `b:${bookmark.id}`,
      url: bookmark.url,
      label: bookmark.name,
      detail: `${group.name} · ${displayUrl(bookmark.url)}`,
      icon: <BookmarkIcon icon={bookmark.icon} url={bookmark.url} name={bookmark.name} />
    }));

    const direct = looksLikeUrl(trimmed) ? normalizeUrl(trimmed) : null;

    if (direct) {
      list.unshift({ kind: 'go', key: 'go', url: direct, label: displayUrl(direct) });
    }

    for (const command of commands) {
      const words = `${command.label} ${command.keywords}`.toLowerCase();

      if (lower.length >= 2 && words.split(/\s+/).some((word) => word.startsWith(lower))) {
        list.push({ kind: 'command', key: `c:${command.id}`, command });
      }
    }

    list.push({
      kind: 'search',
      key: 'search',
      url: `${SEARCH_ENGINES[engine].url}${encodeURIComponent(trimmed)}`,
      label: trimmed
    });

    return list;
  }, [trimmed, groups, commands, engine]);

  const open = results.length > 0 && focused;
  const active = Math.min(activeIndex, Math.max(results.length - 1, 0));

  const run = (result: Result, forceNewTab = false): void => {
    if (result.kind === 'command') {
      result.command.run();
    } else {
      openUrl(result.url, newTab || forceNewTab);
    }

    setQuery('');
    inputRef.current?.blur();
  };

  return (
    <div className={`search${open ? ' search--open' : ''}`} data-dash="">
      <div className="search-field glass">
        <Search size={18} className="search-icon" aria-hidden="true" />
        <input
          ref={inputRef}
          type="search"
          className="search-input"
          value={query}
          placeholder="Search bookmarks or the web"
          aria-label="Search"
          role="combobox"
          aria-expanded={open}
          aria-controls="search-results"
          aria-activedescendant={open ? `search-${results[active]?.key}` : undefined}
          autoComplete="off"
          spellCheck={false}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onChange={(event) => {
            setQuery(event.target.value);
            setActiveIndex(0);
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault();
              const step = event.key === 'ArrowDown' ? 1 : -1;
              setActiveIndex((active + step + results.length) % Math.max(results.length, 1));
            } else if (event.key === 'Enter' && results[active]) {
              event.preventDefault();
              run(results[active], event.ctrlKey || event.metaKey);
            } else if (event.key === 'Escape') {
              if (query) {
                setQuery('');
              } else {
                event.currentTarget.blur();
              }
            }
          }}
        />
        {!focused && (
          <span className="search-keys" aria-hidden="true">
            <kbd>/</kbd>
          </span>
        )}
      </div>

      {open && (
        <ul
          id="search-results"
          className="search-results glass"
          role="listbox"
          // Keeps the input focused while a result is clicked.
          onMouseDown={(event) => event.preventDefault()}
        >
          {results.map((result, index) => {
            const selected = index === active;
            const common = {
              id: `search-${result.key}`,
              role: 'option' as const,
              'aria-selected': selected,
              className: `search-result${selected ? ' search-result--active' : ''}`,
              onMouseEnter: () => setActiveIndex(index)
            };

            if (result.kind === 'command') {
              return (
                <li key={result.key} {...common} onClick={() => run(result)}>
                  <span className="search-result-icon search-result-icon--command">
                    {result.command.icon}
                  </span>
                  <span className="search-result-text">
                    <span className="search-result-label">{result.command.label}</span>
                  </span>
                  {result.command.hint && <kbd>{result.command.hint}</kbd>}
                </li>
              );
            }

            return (
              <li
                key={result.key}
                {...common}
                onClick={(event) => run(result, event.ctrlKey || event.metaKey)}
                onAuxClick={(event) => {
                  if (event.button === 1) {
                    openUrl(result.url, true);
                  }
                }}
              >
                <span className="search-result-icon">
                  {result.kind === 'bookmark' && result.icon}
                  {result.kind === 'go' && <ArrowUpRight size={16} />}
                  {result.kind === 'search' && <Globe size={16} />}
                </span>
                <span className="search-result-text">
                  <span className="search-result-label">
                    {result.kind === 'go' && 'Go to '}
                    {result.kind === 'search' && `Search ${SEARCH_ENGINES[engine].label} for `}
                    <strong>{result.label}</strong>
                  </span>
                  {result.kind === 'bookmark' && (
                    <span className="search-result-detail">{result.detail}</span>
                  )}
                </span>
                {selected && (
                  <CornerDownLeft size={14} className="search-enter" aria-hidden="true" />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};
