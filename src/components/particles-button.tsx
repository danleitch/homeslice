import type { JSX } from 'react';

type ParticlesButtonProps = {
  expanded: boolean;
  onClick: () => void;
};

export const ParticlesButton = ({ expanded, onClick }: ParticlesButtonProps): JSX.Element => (
  <button
    type="button"
    className="header-action"
    onClick={onClick}
    aria-label="Particle settings"
    aria-haspopup="dialog"
    aria-expanded={expanded}
    title="Particle settings"
  >
    {/* A little linked constellation, one node in Branchify's own blue. */}
    <svg
      className="particles-icon"
      viewBox="0 0 24 24"
      width="24"
      height="24"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M5.5 16.5 10 6.5l8.5 3.5-4 8.5ZM10 6.5l4.5 12"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
        strokeOpacity="0.55"
      />
      <circle cx="5.5" cy="16.5" r="2" fill="currentColor" />
      <circle cx="10" cy="6.5" r="2.4" fill="#4c7ff7" />
      <circle cx="18.5" cy="10" r="1.8" fill="currentColor" />
      <circle cx="14.5" cy="18.5" r="1.5" fill="currentColor" />
    </svg>
  </button>
);
