import { Loader } from '@taucad/ui/components/loader';
import { cn } from '@taucad/ui/utils/cn';

/**
 * Props for {@link ViewerStatusPill}.
 *
 * @public
 */
export type ViewerStatusPillProps = Readonly<{
  /** What is running, such as "Loading gear.glb" or a build phase; the pill ends it with an ellipsis. */
  label: string;
  /** How far it is, from 0 to 1, shown as a whole percentage; omit while unknown. */
  progress?: number;
  className?: string;
}>;

/**
 * The running work over the viewer, as a pill in the viewer bar's skin: a spinner, the label and, when known, the
 * percentage. `ViewerStage` places it, centred while no model is drawn and in the upper sixth over one, so the bar never
 * grows or shrinks around it. A failure is not a status pill: the stage draws it with `RuntimeErrorOverlay`.
 *
 * @param props - The label, the optional progress and extra classes.
 * @returns The pill, announced as a status.
 * @public
 *
 * @example <caption>A download in progress</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { ViewerStatusPill } from '@taucad/workbench-panes/shell/viewer-status';
 *
 * export const loading = createElement(ViewerStatusPill, { label: 'Loading gear.glb', progress: 0.42 });
 * ```
 */
export function ViewerStatusPill({ label, progress, className }: ViewerStatusPillProps): React.JSX.Element {
  return (
    <div
      role='status'
      className={cn(
        'm-auto flex h-7 items-center gap-1.5 rounded-lg border bg-sidebar px-2 text-xs text-foreground shadow-xs',
        className,
      )}
    >
      <Loader className='size-3.5 text-primary' />
      <span className='first-letter:uppercase'>{label}…</span>
      {progress === undefined ? null : (
        <span className='text-muted-foreground tabular-nums'>
          {Math.round(Math.min(Math.max(progress, 0), 1) * 100)}%
        </span>
      )}
    </div>
  );
}
