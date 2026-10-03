import type { JSX } from 'react';

type SettingsButtonProps = {
  expanded: boolean;
  onClick: () => void;
};

export const SettingsButton = ({ expanded, onClick }: SettingsButtonProps): JSX.Element => (
  <button
    type="button"
    className="header-action"
    onClick={onClick}
    aria-label="Settings"
    aria-haspopup="dialog"
    aria-expanded={expanded}
    title="Settings"
  >
    <span aria-hidden="true" className="settings-icon">
      &#9881;
    </span>
  </button>
);
