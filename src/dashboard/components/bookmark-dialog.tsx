import { useMemo, useState, type FormEvent, type JSX } from 'react';
import { Trash2 } from 'lucide-react';
import type { BookmarkFields } from '../lib/edit';
import type { Group } from '../lib/model';
import { guessName, hostOf, normalizeUrl } from '../lib/urls';
import { BookmarkCard } from './bookmark-card';
import { Field, Modal } from './ui';

const NEW_GROUP = '__new__';

export type BookmarkTarget = { groupId: string } | { newGroup: string };

type BookmarkDialogProps = {
  mode: 'add' | 'edit';
  initial: Partial<BookmarkFields> & { groupId?: string | null };
  groups: readonly Group[];
  onSave: (fields: BookmarkFields, target: BookmarkTarget) => void;
  onDelete?: () => void;
  onClose: () => void;
};

export const BookmarkDialog = ({
  mode,
  initial,
  groups,
  onSave,
  onDelete,
  onClose
}: BookmarkDialogProps): JSX.Element => {
  const [url, setUrl] = useState(initial.url ?? '');
  const [name, setName] = useState(initial.name ?? '');
  // A name the visitor hasn't typed follows the address as it changes.
  const [nameTouched, setNameTouched] = useState(Boolean(initial.name));
  const [description, setDescription] = useState(initial.description ?? '');
  const [icon, setIcon] = useState(initial.icon ?? '');
  const [groupId, setGroupId] = useState<string>(
    initial.groupId && groups.some((group) => group.id === initial.groupId)
      ? initial.groupId
      : (groups[0]?.id ?? NEW_GROUP)
  );
  const [newGroup, setNewGroup] = useState(groups.length === 0 ? 'Bookmarks' : '');
  const [error, setError] = useState('');

  const normalized = normalizeUrl(url);
  const autoName = normalized ? guessName(normalized) : '';
  const shownName = nameTouched ? name : name || autoName;

  const preview = useMemo(
    () => ({
      id: 'preview',
      url: normalized ?? 'https://example.com',
      name: shownName || 'New bookmark',
      description,
      icon
    }),
    [normalized, shownName, description, icon]
  );

  const submit = (event: FormEvent): void => {
    event.preventDefault();

    if (!normalized) {
      setError(url.trim() ? 'That doesn’t look like a web address.' : 'Paste or type an address.');
      return;
    }

    if (groupId === NEW_GROUP && !newGroup.trim()) {
      setError('Give the new group a name.');
      return;
    }

    onSave(
      {
        url: normalized,
        name: (shownName || hostOf(normalized) || normalized).trim(),
        description: description.trim(),
        icon: icon.trim()
      },
      groupId === NEW_GROUP ? { newGroup: newGroup.trim() } : { groupId }
    );
  };

  return (
    <Modal
      title={mode === 'add' ? 'Add a bookmark' : 'Edit bookmark'}
      subtitle={
        mode === 'add' ? 'Tip: paste a link anywhere on the board to start here.' : undefined
      }
      onClose={onClose}
      footer={
        <>
          {onDelete && (
            <button type="button" className="btn btn-ghost btn-danger-text" onClick={onDelete}>
              <Trash2 size={14} aria-hidden="true" />
              Delete
            </button>
          )}
          <span className="spacer" />
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="bookmark-form" className="btn btn-primary">
            {mode === 'add' ? 'Add bookmark' : 'Save'}
          </button>
        </>
      }
    >
      <ul className="bm-preview" aria-label="Preview">
        <BookmarkCard bookmark={preview} variant="cards" newTab />
      </ul>

      <form id="bookmark-form" className="form" onSubmit={submit} noValidate>
        <Field label="Address" error={error}>
          <input
            type="url"
            inputMode="url"
            value={url}
            placeholder="https://github.com"
            autoComplete="off"
            spellCheck={false}
            data-autofocus=""
            onChange={(event) => {
              setUrl(event.target.value);
              setError('');
            }}
            onBlur={() => {
              if (normalized) {
                setUrl(normalized);
              }
            }}
          />
        </Field>

        <div className="form-row">
          <Field label="Name">
            <input
              type="text"
              value={shownName}
              placeholder={autoName || 'GitHub'}
              maxLength={120}
              onChange={(event) => {
                setName(event.target.value);
                setNameTouched(true);
              }}
            />
          </Field>
          <Field label="Group">
            <select value={groupId} onChange={(event) => setGroupId(event.target.value)}>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
              <option value={NEW_GROUP}>New group…</option>
            </select>
          </Field>
        </div>

        {groupId === NEW_GROUP && (
          <Field label="New group name">
            <input
              type="text"
              value={newGroup}
              placeholder="e.g. GitHub"
              maxLength={80}
              onChange={(event) => {
                setNewGroup(event.target.value);
                setError('');
              }}
            />
          </Field>
        )}

        <Field label="Description" hint="Optional. Cards show the address when it’s empty.">
          <input
            type="text"
            value={description}
            placeholder={normalized ? hostOf(normalized) : 'What this is for'}
            maxLength={240}
            onChange={(event) => setDescription(event.target.value)}
          />
        </Field>

        <Field
          label="Icon"
          hint={
            <>
              Empty uses the site’s favicon. Also takes <code>si-github</code>,{' '}
              <code>mdi-home</code>, <code>plex.png</code>, an emoji, or an image address.
            </>
          }
        >
          <input
            type="text"
            value={icon}
            placeholder="Automatic"
            spellCheck={false}
            autoComplete="off"
            onChange={(event) => setIcon(event.target.value)}
          />
        </Field>
      </form>
    </Modal>
  );
};
