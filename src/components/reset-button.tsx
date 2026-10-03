import type { JSX } from 'react';

type ResetButtonProps = {
  onReset: () => void;
};

export const ResetButton = ({ onReset }: ResetButtonProps): JSX.Element => (
  <button
    type="button"
    className="header-action"
    onClick={onReset}
    aria-label="Reset form"
    title="Reset form"
  >
    <span aria-hidden="true" className="reset-icon">
      &#8635;
    </span>
  </button>
);
