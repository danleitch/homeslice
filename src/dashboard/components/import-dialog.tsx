import type { ImportPlan } from '../lib/yaml';
import { Modal } from './ui';

const SOURCE_LABELS: Readonly<Record<ImportPlan['source'], string>> = {
  dashboard: 'a dashboard export',
  homepage: 'a homepage bookmarks file',
  browser: 'your browser’s bookmarks'
};

type ImportDialogProps = {
  plan: ImportPlan;
  fileName: string;
  onMerge: () => void;
  onReplace: () => void;
  onClose: () => void;
};

/** Says what a file holds and lets the visitor add it to the board or swap the board for it. */
export const ImportDialog = ({
  plan,
  fileName,
  onMerge,
  onReplace,
  onClose
}: ImportDialogProps): JSX.Element => {
  const bookmarks = plan.groups.reduce((total, group) => total + group.bookmarks.length, 0);
  const full = plan.source === 'dashboard';

  return (
    <Modal
      title="Import"
      subtitle={`${fileName} looks like ${SOURCE_LABELS[plan.source]}.`}
      size="sm"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <span className="spacer" />
          <button
            type="button"
            className={`btn ${full ? 'btn-secondary' : 'btn-ghost btn-danger-text'}`}
            onClick={full ? onMerge : onReplace}
          >
            {full ? 'Only add its bookmarks' : 'Replace my bookmarks'}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={full ? onReplace : onMerge}
            data-autofocus=""
          >
            {full ? 'Restore everything' : 'Add to my board'}
          </button>
        </>
      }
    >
      <dl className="import-summary">
        <div>
          <dt>Groups</dt>
          <dd>{plan.groups.length}</dd>
        </div>
        <div>
          <dt>Bookmarks</dt>
          <dd>{bookmarks}</dd>
        </div>
        {plan.config && (
          <div>
            <dt>Widgets</dt>
            <dd>{plan.config.pages.reduce((total, page) => total + page.widgets.length, 0)}</dd>
          </div>
        )}
      </dl>
      <ul className="import-groups">
        {plan.groups.slice(0, 8).map((group) => (
          <li key={group.id}>
            <span>{group.name}</span>
            <span className="import-count">{group.bookmarks.length}</span>
          </li>
        ))}
        {plan.groups.length > 8 && (
          <li className="import-more">and {plan.groups.length - 8} more</li>
        )}
      </ul>
      <p className="field-hint">
        {full
          ? 'Restoring replaces your bookmarks, widgets and settings, and brings back the Branchify and pond settings saved with it.'
          : 'Adding puts these groups after yours; a group with the same name as one of yours is merged into it, skipping links you already have.'}
      </p>
    </Modal>
  );
};
