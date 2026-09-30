import { cn } from '@taucad/ui/utils/cn';

/** Workbench spacing values. Collections use padding inside measured rows, never margins or list gaps. */
export const paneSpacingClassName =
  '[--pane-unit-gap:--spacing(2)] [--pane-row-gap:--spacing(1)] [--pane-group-gap:--spacing(2)]';

/** Dense data rows and disclosed object groups share their spacing values across panes. */
export const paneCollectionItemSpacing = {
  compact: 'pt-(--pane-row-gap)',
  groups: 'pt-(--pane-group-gap)',
};

/** RJSF group fields keep the same gap in natural layouts and inside measured collection rows. */
export const paneFieldGroupSpacingClassName = cn(
  paneSpacingClassName,
  '[&:not(:first-child)]:pt-(--pane-group-gap)',
  '[[data-pane-list-key]:not([aria-posinset="1"])>&]:pt-(--pane-group-gap)',
);
