import type { JSX } from 'react';
import { CopyButton } from './copy-button';

type BranchOutputsProps = {
  branchName: string;
  gitCommand: string;
  pullRequestTitle: string;
  /** Called whenever any of the outputs is copied, which is the branch being put to use. */
  onCopy?: () => void;
};

export const BranchOutputs = ({
  branchName,
  gitCommand,
  pullRequestTitle,
  onCopy
}: BranchOutputsProps): JSX.Element | null => {
  if (!branchName) {
    return null;
  }

  return (
    <section className="output-grid" aria-live="polite">
      <article>
        <h2>Branch name</h2>
        <code>{branchName}</code>
        <CopyButton value={branchName} onCopied={onCopy} />
      </article>

      <article>
        <h2>Checkout</h2>
        <code>{gitCommand}</code>
        <CopyButton value={gitCommand} onCopied={onCopy} />
      </article>

      {pullRequestTitle ? (
        <article className="output-wide">
          <h2>PR title</h2>
          <code>{pullRequestTitle}</code>
          <CopyButton value={pullRequestTitle} onCopied={onCopy} />
        </article>
      ) : null}
    </section>
  );
};
