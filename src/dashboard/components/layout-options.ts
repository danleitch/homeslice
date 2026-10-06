import { LayoutGrid, List, Rows3, type LucideIcon } from 'lucide-react';
import { ROW_PX, type BookmarkStyle } from '../lib/model';

/** The three ways a group can lay out its bookmarks. */
export const STYLE_CHOICES: readonly {
  value: BookmarkStyle;
  text: string;
  icon: LucideIcon;
  title: string;
}[] = [
  { value: 'cards', text: 'Cards', icon: Rows3, title: 'Icon, name and description' },
  { value: 'tiles', text: 'Tiles', icon: LayoutGrid, title: 'Big icons, like a launcher' },
  { value: 'list', text: 'List', icon: List, title: 'Compact rows' }
];

/** Widths a group or widget can take, as fractions of the 12-column board. */
export const WIDTH_OPTIONS = [
  { value: '3', label: '¼', title: 'A quarter of the board' },
  { value: '4', label: '⅓', title: 'A third of the board' },
  { value: '6', label: '½', title: 'Half the board' },
  { value: '8', label: '⅔', title: 'Two thirds of the board' },
  { value: '12', label: 'Full', title: 'The whole width' }
] as const;

/** The value that leaves a group or widget as tall as what is in it. */
export const FIT_HEIGHT = 'fit';

/** Heights a group or widget can be given, in rows of the board; "Fit" is no height at all. */
export const HEIGHT_OPTIONS = [
  { value: FIT_HEIGHT, label: 'Fit', title: 'As tall as what is in it' },
  { value: '48', label: 'S', title: `${48 * ROW_PX} pixels` },
  { value: '72', label: 'M', title: `${72 * ROW_PX} pixels` },
  { value: '96', label: 'L', title: `${96 * ROW_PX} pixels` },
  { value: '144', label: 'XL', title: `${144 * ROW_PX} pixels` }
] as const;

/** The usual heights, and the one it has now if that is something dragging made. */
export const heightChoices = (
  height: number | undefined
): readonly { value: string; label: string; title?: string }[] =>
  height === undefined || HEIGHT_OPTIONS.some((option) => option.value === String(height))
    ? HEIGHT_OPTIONS
    : [...HEIGHT_OPTIONS, { value: String(height), label: `${height * ROW_PX}px` }];

/** Reads a chosen height back: "Fit" is no height, anything else is its rows. */
export const heightOfChoice = (value: string): number | undefined =>
  value === FIT_HEIGHT ? undefined : Number(value);
