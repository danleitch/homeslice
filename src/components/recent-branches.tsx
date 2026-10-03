import type { JSX } from 'react';
import type { RecentBranch } from '../types';
import { CopyButton } from './copy-button';

type RecentBranchesProps = {
  branches: RecentBranch[];
  canLoad: (item: RecentBranch) => boolean;
  onLoad: (item: RecentBranch) => void;
  onRemove: (createdAt: string) => void;
};

export const RecentBranches = ({
  branches,
  canLoad,
  onLoad,
  onRemove
}: RecentBranchesProps): JSX.Element | null => {
  if (branches.length === 0) {
    return null;
  }

  return (
    <section className="recent-list">
      <h3>Recent branches</h3>
      <ul>
        {branches.map((item) => (
          <li key={item.createdAt}>
            <code>{item.value}</code>
            <div className="recent-actions">
              <button
                className="btn btn-secondary"
                type="button"
                onClick={() => onLoad(item)}
                disabled={!canLoad(item)}
                title={canLoad(item) ? 'Load into the form' : 'Cannot be loaded into the form'}
                aria-label={`Load ${item.value}`}
              >
                Load
              </button>
              <CopyButton value={item.value} />
              <button
                className="btn-remove"
                type="button"
                onClick={() => onRemove(item.createdAt)}
                aria-label={`Remove ${item.value}`}
              >
                ✕
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
};
