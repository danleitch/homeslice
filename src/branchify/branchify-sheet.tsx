import { useEffect, useRef, useState, type JSX } from 'react';
import { X } from 'lucide-react';
import { BranchForm } from '../components/branch-form';
import { BranchOutputs } from '../components/branch-outputs';
import { GithubButton } from '../components/github-button';
import { RecentBranches } from '../components/recent-branches';
import { ResetButton } from '../components/reset-button';
import { SettingsButton } from '../components/settings-button';
import { SettingsPanel } from '../components/settings-panel';
import type { RecentBranch } from '../types';
import type { UseBranchify } from './use-branchify';

type BranchifySheetProps = {
  branchify: UseBranchify;
  recentBranches: RecentBranch[];
  onRemoveRecent: (createdAt: string) => void;
  /** Any output was copied: the branch is being put to use. */
  onBranchUsed: (branch: string) => void;
  onClose: () => void;
};

/**
 * Branchify as one of the dashboard's tools: the same branch-name generator,
 * raised over the board in a sheet, with its own settings for branch types.
 */
export const BranchifySheet = ({
  branchify,
  recentBranches,
  onRemoveRecent,
  onBranchUsed,
  onClose
}: BranchifySheetProps): JSX.Element => {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const panelRef = useRef<HTMLElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const { form, settings, branchName } = branchify;

  // Opening the tool puts the cursor where the work starts.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panelRef.current?.querySelector<HTMLElement>('select, input')?.focus({ preventScroll: true });

    return () => {
      if (previous && document.contains(previous)) {
        previous.focus({ preventScroll: true });
      }
    };
  }, []);

  return (
    <div
      ref={backdropRef}
      className="tool-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <section
        className="panel tool-sheet"
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="branchify-title"
        onKeyDown={(event) => {
          // Branchify's own settings close themselves first.
          if (event.key === 'Escape' && !settingsOpen) {
            event.stopPropagation();
            onClose();
          }
        }}
      >
        <header className="panel-header">
          <div className="panel-header-top">
            <h1 id="branchify-title">Branchify 🪾</h1>
            <div className="header-actions">
              <GithubButton />
              <SettingsButton expanded={settingsOpen} onClick={() => setSettingsOpen(true)} />
              <ResetButton onReset={branchify.resetForm} />
              <button
                type="button"
                className="header-action"
                onClick={onClose}
                aria-label="Close Branchify"
                title="Close (Esc)"
              >
                <X size={20} />
              </button>
            </div>
          </div>
          <p>Create consistent Git branch names in one quick step.</p>
          <p>
            <strong>'{branchify.namingPattern}'</strong> — the practical modern standard used across
            teams leveraging your project management tools.
          </p>
        </header>

        <BranchForm
          form={form}
          branchTypes={settings.branchTypes}
          typeSeparator={settings.typeSeparator}
          ticketSeparator={settings.ticketSeparator}
          aiTargets={branchify.aiTargets}
          onChange={branchify.changeForm}
          onTypeSeparatorChange={(typeSeparator) => branchify.changeSettings({ typeSeparator })}
          onTicketSeparatorChange={(ticketSeparator) =>
            branchify.changeSettings({ ticketSeparator })
          }
        />

        <BranchOutputs
          branchName={branchName}
          gitCommand={branchify.gitCommand}
          pullRequestTitle={branchify.pullRequestTitle}
          onCopy={() => onBranchUsed(branchName)}
        />

        <RecentBranches
          branches={recentBranches}
          canLoad={branchify.canLoadRecent}
          onLoad={(item) => {
            if (branchify.loadRecent(item)) {
              const sheet = backdropRef.current;

              if (sheet) {
                sheet.scrollTop = 0;
              }
            }
          }}
          onRemove={onRemoveRecent}
        />
      </section>
      {settingsOpen && (
        <SettingsPanel
          branchTypes={settings.branchTypes}
          aiHandoffTargets={settings.aiHandoffTargets}
          onAiHandoffTargetsChange={(aiHandoffTargets) =>
            branchify.changeSettings({ aiHandoffTargets })
          }
          onAddType={branchify.addType}
          onRemoveType={branchify.removeType}
          onResetTypes={branchify.resetTypes}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  );
};
