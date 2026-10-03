import { useState, type FormEvent, type JSX } from 'react';
import { STYLE_CHOICES, WIDTH_OPTIONS } from './layout-options';
import type { BookmarkStyle, Group } from '../lib/model';
import { Field, Modal, Segmented } from './ui';

export type GroupFields = Pick<Group, 'name' | 'icon' | 'style' | 'width'>;

type GroupDialogProps = {
  initial?: Partial<GroupFields>;
  mode: 'add' | 'edit';
  onSave: (fields: GroupFields) => void;
  onClose: () => void;
};

export const GroupDialog = ({ initial, mode, onSave, onClose }: GroupDialogProps): JSX.Element => {
  const [name, setName] = useState(initial?.name ?? '');
  const [icon, setIcon] = useState(initial?.icon ?? '');
  const [style, setStyle] = useState<BookmarkStyle>(initial?.style ?? 'cards');
  const [width, setWidth] = useState(initial?.width ?? 4);
  const [error, setError] = useState('');

  const submit = (event: FormEvent): void => {
    event.preventDefault();

    if (!name.trim()) {
      setError('Give the group a name.');
      return;
    }

    onSave({ name: name.trim(), icon: icon.trim(), style, width });
  };

  return (
    <Modal
      title={mode === 'add' ? 'New group' : 'Group settings'}
      size="sm"
      onClose={onClose}
      footer={
        <>
          <span className="spacer" />
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="group-form" className="btn btn-primary">
            {mode === 'add' ? 'Create group' : 'Save'}
          </button>
        </>
      }
    >
      <form id="group-form" className="form" onSubmit={submit} noValidate>
        <Field label="Name" error={error}>
          <input
            type="text"
            value={name}
            placeholder="e.g. GitHub"
            maxLength={80}
            data-autofocus=""
            onChange={(event) => {
              setName(event.target.value);
              setError('');
            }}
          />
        </Field>
        <Field label="Icon" hint="Optional: an emoji, si-github, mdi-folder or an image address.">
          <input
            type="text"
            value={icon}
            placeholder="None"
            spellCheck={false}
            onChange={(event) => setIcon(event.target.value)}
          />
        </Field>
        <div className="field">
          <span className="field-label">Layout</span>
          <Segmented
            label="Layout"
            value={style}
            options={STYLE_CHOICES.map(({ value, text, icon: Icon, title }) => ({
              value,
              title,
              label: (
                <>
                  <Icon size={14} aria-hidden="true" /> {text}
                </>
              )
            }))}
            onChange={setStyle}
          />
        </div>
        <div className="field">
          <span className="field-label">Width</span>
          <Segmented
            label="Width"
            value={String(width)}
            options={
              WIDTH_OPTIONS.some((option) => option.value === String(width))
                ? WIDTH_OPTIONS
                : [...WIDTH_OPTIONS, { value: String(width), label: `${width}/12` }]
            }
            onChange={(value) => setWidth(Number(value))}
          />
          <span className="field-hint">In edit mode you can also drag a group’s right edge.</span>
        </div>
      </form>
    </Modal>
  );
};
