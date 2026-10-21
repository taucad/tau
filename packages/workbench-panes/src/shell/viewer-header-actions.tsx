import { Separator } from '@taucad/ui/components/separator';
import { PaneAction } from '#components/pane-action.jsx';
import { workbenchPanes } from '#registry/pane-registry.js';

/**
 * A pane the viewer header's actions open.
 *
 * @public
 */
export type ViewerHeaderPane = 'share' | 'export';

/**
 * Props for {@link ViewerHeaderActions}.
 *
 * @public
 */
export type ViewerHeaderActionsProps = Readonly<{
  /** Show the workbench and make `pane` its active tab, opening the tab when it is closed. */
  onOpenPane: (pane: ViewerHeaderPane) => void;
  /** Whether Share and Export are unavailable, as while no model is shown; they stay visible. */
  isDisabled?: boolean;
  /** Host actions before Share, such as the Tau app's sidebar trigger and revision status, with their own separators. */
  leading?: React.ReactNode;
  /** What ends the header after a hairline, such as the workbench toggle or the slot it floats into. */
  trailing?: React.ReactNode;
  /** The Share button, for a host that hands focus back to it. */
  shareRef?: React.Ref<HTMLButtonElement>;
}>;

/** Share and Export fold to their icons below the viewer's `@xl` container width, on every host. */
const foldClasses = {
  className: '@max-xl/viewer:w-7 @max-xl/viewer:px-0',
  labelClassName: 'hidden @xl/viewer:inline',
} as const;

/**
 * The viewer header's action cluster, which ends the row the viewer's tabs share: the host's leading actions, Share and
 * Export (opening their panes, with the pane registry's icons), then a hairline and the trailing control. The workbench
 * toggle ends the rightmost header: the viewer's while the workbench is closed, the workbench's while it is open. Draw
 * it inside an `@container/viewer` element and a `TooltipProvider`.
 *
 * @param props - What the actions open, whether they are available, and the host's leading and trailing content.
 * @returns The labelled group of actions.
 * @public
 *
 * @example <caption>Share and Export, then the workbench toggle</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { WorkbenchToggleButton } from '@taucad/workbench-panes/components/workbench-toggle';
 * import { ViewerHeaderActions } from '@taucad/workbench-panes/shell/viewer-header-actions';
 *
 * export const actions = createElement(ViewerHeaderActions, {
 *   onOpenPane: (pane) => {
 *     console.info(`open ${pane}`);
 *   },
 *   trailing: createElement(WorkbenchToggleButton, { isOpen: false, onClick: () => undefined }),
 * });
 * ```
 */
export function ViewerHeaderActions({
  onOpenPane,
  isDisabled = false,
  leading,
  trailing,
  shareRef,
}: ViewerHeaderActionsProps): React.JSX.Element {
  return (
    <div role='group' aria-label='Workbench actions' className='flex h-full shrink-0 items-center gap-1'>
      {leading}
      <PaneAction
        ref={shareRef}
        icon={workbenchPanes.share.icon}
        label='Share'
        tooltip='Share project'
        disabled={isDisabled}
        onClick={() => {
          onOpenPane('share');
        }}
        {...foldClasses}
      />
      {/* What Export can do for the shown file is the Export pane's to say, so the button stays live while one shows. */}
      <PaneAction
        icon={workbenchPanes.export.icon}
        label='Export'
        tooltip='Open exporter'
        disabled={isDisabled}
        onClick={() => {
          onOpenPane('export');
        }}
        {...foldClasses}
      />
      {trailing === undefined || trailing === null ? null : (
        <>
          {/* The variant, not `h-4`: the separator's own `data-[orientation=vertical]:h-full` outranks a bare height. */}
          <Separator orientation='vertical' className='data-[orientation=vertical]:h-4' />
          {trailing}
        </>
      )}
    </div>
  );
}
