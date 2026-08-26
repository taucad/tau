import type { ReactNode } from 'react';
import { cn } from '#utils/ui.utils.js';
import { PaneButton } from '#components/ui/pane-button.js';

type DockviewPaneActionProperties = {
  readonly className?: string;
  readonly children: ReactNode;
  readonly onClick?: React.MouseEventHandler<HTMLButtonElement>;
  readonly onContextMenu?: React.MouseEventHandler<HTMLButtonElement>;
  readonly 'aria-label': string;
  readonly ref?: React.Ref<HTMLButtonElement>;
  readonly tooltip?: ReactNode;
  readonly tooltipSide?: 'left' | 'right' | 'top' | 'bottom';
};

/**
 * Shared button style for Dockview tab-bar actions (e.g. open-file "+", split).
 *
 * Thin wrapper around `PaneButton` that adds the `.dv-pane-action` CSS class
 * for group-hover opacity transitions defined in `dockview.tsx`.
 */
export function DockviewPaneAction({ className, ...properties }: DockviewPaneActionProperties): React.JSX.Element {
  return <PaneButton className={cn('dv-pane-action', className)} {...properties} />;
}
