export type PersistedForm = {
  branchType: string;
  ticketNumber: string;
  description: string;
};

export type BranchSeparators = {
  typeSeparator: string;
  ticketSeparator: string;
};

export type RecentBranch = {
  createdAt: string;
  value: string;
  /** Form and separators used to generate `value`; absent on entries saved by older versions. */
  form?: PersistedForm;
  separators?: BranchSeparators;
};

/** An AI assistant the "shorten with AI" icons can hand a description off to. */
export type AiProvider = 'chatgpt' | 'claude';

export type BranchSettings = BranchSeparators & {
  branchTypes: string[];
  /** Which "shorten with AI" icons appear beside the description field. */
  aiHandoffTargets: AiProvider[];
};

/** Which backdrop the app draws behind the dashboard. */
export type BackgroundStyle = 'koi' | 'dreams' | 'particles' | 'wallpaper' | 'plain';
