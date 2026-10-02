/**
 * Shared workspace-directory panel.
 *
 * Three rendering variants share the same status model + copy so every
 * surface (Settings, /files, /projects/new, FM recovery overlay) speaks
 * with one voice (Audit R6).
 *
 * - `inline` — large card-like component used as an empty-state CTA.
 * - `banner` — compact one-row banner for warning callouts.
 * - `row` — table-row style for workspace lists.
 *
 * The component is intentionally **presentational**: it doesn't own the
 * picker, the permission request, or persistence. Each call site supplies
 * the action callbacks because picker invocation has to live within a
 * user-gesture-bearing event handler (browser security requirement) and
 * the persistence target (default workspace vs. workspace-specific row)
 * varies by surface.
 */

import { FolderOpen, AlertTriangle, RefreshCw, Trash2 } from 'lucide-react';
import { Button } from '#components/ui/button.js';
import { cn } from '#utils/ui.utils.js';
import { workspaceDirectoryActions, workspaceDirectoryCopy } from '#constants/workspace-directory-copy.constants.js';
import type { WorkspaceDirectoryStatus } from '#constants/workspace-directory-copy.constants.js';

export type WorkspaceDirectoryPanelVariant = 'inline' | 'banner' | 'row';

export type WorkspaceDirectoryPanelProps = {
  /** Layout variant. */
  readonly variant: WorkspaceDirectoryPanelVariant;
  /**
   * Identity of the workspace this panel represents. Optional — `missing`
   * and `unsupported` panels render before a workspace exists.
   */
  readonly workspaceId?: string;
  /** Display label (typically the folder name). */
  readonly workspaceName?: string;
  /** Current status — drives copy, badge colour, and CTA visibility. */
  readonly status: WorkspaceDirectoryStatus;
  /** Show a spinner / disable buttons while a picker or permission flow runs. */
  readonly isBusy?: boolean;
  /** Connect a new workspace (or change the directory of this one). */
  readonly onConnect?: () => void | Promise<void>;
  /** Re-grant read/write permission on the current handle. */
  readonly onGrantAccess?: () => void | Promise<void>;
  /** Forget the workspace + every project bound to it (irreversible). */
  readonly onForget?: () => void | Promise<void>;
  /**
   * Optional right-aligned metadata node rendered in the `row` variant
   * between the description block and the action group. Lets callers
   * compose status-agnostic affordances (project count, "Default"
   * badge, "Set as default" button) without bolting on a sub-row.
   */
  readonly meta?: React.ReactNode;
};

export function WorkspaceDirectoryPanel({
  variant,
  workspaceName,
  status,
  isBusy = false,
  onConnect,
  onGrantAccess,
  onForget,
  meta,
}: WorkspaceDirectoryPanelProps): React.JSX.Element {
  const copy = workspaceDirectoryCopy[status];
  const showConnect = (status === 'missing' || status === 'connected' || status === 'permission') && onConnect;
  const showGrantAccess = status === 'permission' && onGrantAccess;
  const showForget = status !== 'unsupported' && variant === 'row' && onForget;

  const indicator =
    status === 'connected' ? (
      <FolderOpen className='size-4 shrink-0 text-muted-foreground' />
    ) : status === 'unsupported' ? (
      <AlertTriangle className='size-4 shrink-0 text-muted-foreground' />
    ) : (
      <AlertTriangle className='text-amber-500 size-4 shrink-0' />
    );

  if (variant === 'banner') {
    return (
      <div
        role={status === 'permission' || status === 'missing' ? 'alert' : undefined}
        className={cn(
          'flex items-center justify-between gap-4 rounded-md border px-3 py-2 text-sm',
          status === 'permission' || status === 'missing'
            ? 'border-amber-500/40 bg-amber-500/10'
            : 'border-border bg-muted/40',
        )}
      >
        <div className='flex min-w-0 items-center gap-2'>
          {indicator}
          <span className='truncate'>
            <span className='font-medium'>{copy.title}</span>
            {workspaceName ? <span className='text-muted-foreground'> · {workspaceName}</span> : undefined}
          </span>
        </div>
        <div className='flex shrink-0 items-center gap-2'>
          {showGrantAccess ? (
            <Button size='sm' variant='outline' disabled={isBusy} onClick={onGrantAccess}>
              <RefreshCw className='mr-1 size-3.5' />
              {workspaceDirectoryActions.reconnect}
            </Button>
          ) : undefined}
          {showConnect ? (
            <Button size='sm' variant='outline' disabled={isBusy} onClick={onConnect}>
              {status === 'missing' ? workspaceDirectoryActions.connect : workspaceDirectoryActions.change}
            </Button>
          ) : undefined}
        </div>
      </div>
    );
  }

  if (variant === 'row') {
    return (
      <div className='flex items-center justify-between gap-4 rounded-md border border-border bg-card px-3 py-2'>
        <div className='flex min-w-0 items-center gap-3'>
          {indicator}
          <div className='flex min-w-0 flex-col'>
            <span className='truncate font-medium'>{workspaceName ?? copy.title}</span>
            {status === 'connected' ? undefined : (
              <span className='truncate text-xs text-muted-foreground'>{copy.description}</span>
            )}
          </div>
        </div>
        <div className='flex shrink-0 items-center gap-2'>
          {meta}
          {showGrantAccess ? (
            <Button size='sm' variant='outline' disabled={isBusy} onClick={onGrantAccess}>
              {workspaceDirectoryActions.reconnect}
            </Button>
          ) : undefined}
          {showForget ? (
            <Button size='sm' variant='ghost' disabled={isBusy} onClick={onForget} aria-label='Forget workspace'>
              <Trash2 className='size-4' />
            </Button>
          ) : undefined}
        </div>
      </div>
    );
  }

  // `inline` variant — large empty-state CTA card.
  return (
    <div className='flex flex-col gap-3 rounded-md border border-border bg-muted/30 p-4'>
      <div className='flex items-start gap-3'>
        {indicator}
        <div className='flex flex-col gap-1'>
          <span className='font-medium'>{copy.title}</span>
          <span className='text-sm text-muted-foreground'>{copy.description}</span>
        </div>
      </div>
      {(showConnect ?? showGrantAccess) ? (
        <div className='flex items-center gap-2'>
          {showGrantAccess ? (
            <Button size='sm' disabled={isBusy} onClick={onGrantAccess}>
              <RefreshCw className='mr-1 size-3.5' />
              {workspaceDirectoryActions.reconnect}
            </Button>
          ) : undefined}
          {showConnect ? (
            <Button size='sm' variant={showGrantAccess ? 'outline' : 'default'} disabled={isBusy} onClick={onConnect}>
              <FolderOpen className='mr-1 size-3.5' />
              {status === 'missing' ? workspaceDirectoryActions.connect : workspaceDirectoryActions.change}
            </Button>
          ) : undefined}
        </div>
      ) : undefined}
    </div>
  );
}
