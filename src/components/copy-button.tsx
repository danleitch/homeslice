import { useEffect, useState, type JSX } from 'react';

type CopyButtonProps = {
  value: string;
  /** Called once the value is actually on the clipboard. */
  onCopied?: () => void;
};

export const CopyButton = ({ value, onCopied }: CopyButtonProps): JSX.Element => {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) {
      return;
    }

    const timeout = window.setTimeout(() => setCopied(false), 1400);
    return () => window.clearTimeout(timeout);
  }, [copied]);

  const handleCopy = async (): Promise<void> => {
    if (!value) {
      return;
    }

    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      onCopied?.();
    } catch {
      setCopied(false);
    }
  };

  return (
    <button className="btn btn-secondary" type="button" onClick={handleCopy}>
      {copied ? 'Copied!' : 'Copy'}
    </button>
  );
};
