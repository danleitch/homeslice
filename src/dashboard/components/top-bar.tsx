import type { ReactNode, JSX } from 'react';
import { BookmarkPlus, Check, FileUp, FolderPlus, LayoutGrid, Plus, Sparkles } from 'lucide-react';
import type { HourFormat } from '../lib/model';
import { useNow } from '../hooks/use-now';
import { formatTime } from '../lib/time';

const greetingFor = (hour: number): string =>
  hour < 5
    ? 'Good night'
    : hour < 12
      ? 'Good morning'
      : hour < 18
        ? 'Good afternoon'
        : 'Good evening';

type TopBarProps = {
  name: string;
  clock: HourFormat;
  children?: ReactNode;
};

/** The greeting, the time and the search box; the controls live in the activity bar. */
export const TopBar = ({ name, clock, children }: TopBarProps): JSX.Element => {
  const now = useNow();
  const time = formatTime(now, clock).replace(/\s?[AP]M$/i, '');
  const meridiem = clock === '12h' ? (now.getHours() < 12 ? 'AM' : 'PM') : null;

  return (
    <header className="topbar">
      <div className="hello">
        <p className="hello-greeting">
          {greetingFor(now.getHours())}
          {name ? `, ${name}` : ''}
        </p>
        <p className="hello-time">
          <time dateTime={now.toISOString()}>{time}</time>
          {meridiem && <span className="hello-meridiem">{meridiem}</span>}
        </p>
        <p className="hello-date">
          {now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
      </div>

      <div className="topbar-center">{children}</div>
    </header>
  );
};

type EditDockProps = {
  onAddBookmark: () => void;
  onAddGroup: () => void;
  onAddWidget: () => void;
  onDone: () => void;
};

/** What edit mode adds: the ways to make something new, and the way out. */
export const EditDock = ({
  onAddBookmark,
  onAddGroup,
  onAddWidget,
  onDone
}: EditDockProps): JSX.Element => (
  <div className="dock glass" role="toolbar" aria-label="Edit the board" data-dash="">
    <span className="dock-hint">
      Drag to arrange · drag a right edge to resize · right-click for more
    </span>
    <button type="button" className="dock-btn" onClick={onAddBookmark}>
      <BookmarkPlus size={16} aria-hidden="true" /> Bookmark
    </button>
    <button type="button" className="dock-btn" onClick={onAddGroup}>
      <FolderPlus size={16} aria-hidden="true" /> Group
    </button>
    <button type="button" className="dock-btn" onClick={onAddWidget}>
      <LayoutGrid size={16} aria-hidden="true" /> Widget
    </button>
    <button type="button" className="dock-btn dock-btn--done" onClick={onDone}>
      <Check size={16} aria-hidden="true" /> Done
    </button>
  </div>
);

type EmptyBoardProps = {
  onAddBookmark: () => void;
  onImport: () => void;
  onExample: () => void;
};

export const EmptyBoard = ({
  onAddBookmark,
  onImport,
  onExample
}: EmptyBoardProps): JSX.Element => (
  <section className="empty glass" data-dash="">
    <span className="empty-art" aria-hidden="true">
      <BookmarkPlus size={28} />
    </span>
    <h2>Your board is empty</h2>
    <p>
      Add the sites you open every day, bring in your browser’s bookmarks, or start from an example
      and make it yours.
    </p>
    <div className="empty-actions">
      <button type="button" className="btn btn-primary" onClick={onAddBookmark}>
        <Plus size={15} aria-hidden="true" /> Add a bookmark
      </button>
      <button type="button" className="btn btn-secondary" onClick={onImport}>
        <FileUp size={15} aria-hidden="true" /> Import bookmarks
      </button>
      <button type="button" className="btn btn-ghost" onClick={onExample}>
        <Sparkles size={15} aria-hidden="true" /> Use the example
      </button>
    </div>
    <p className="empty-hint">
      Tip: paste a link anywhere on this page, or drag one in from another tab.
    </p>
  </section>
);
