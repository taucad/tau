/**
 * Shared workspace-directory panel.
 *
 * Three rendering variants share the same status model + copy so every
 * surface (Settings, /files, creation, and FM recovery) speaks
 * with one voice (Audit R6).
 *
 * - `inline` — large card-like component used as an empty-state CTA.
 * - `banner` — compact one-row banner for warning callouts.
 * - `row` — one borderless row of a settings group's workspace list.
 *
 * The component is intentionally **presentational**: it doesn't own the
 * picker, the permission request, or persistence. Each call site supplies
 * the action callbacks because picker invocation has to live within a
 * user-gesture-bearing event handler (browser security requirement) and
 * the persistence target varies by surface.
 */

import { FolderOpen, AlertTriangle, RefreshCw, Unplug, Trash2 } from 'lucide-react';
import { Button } from '@taucad/ui/components/button';
import { cn } from '@taucad/ui/utils/cn';
import {
  workspaceDirectoryActions,
  workspaceDirectoryCopy,
  workspaceDirectoryRowLabel,
} from '@taucad/ui-core/constants/workspace-directory-copy.constants';
import type { WorkspaceDirectoryStatus } from '@taucad/ui-core/constants/workspace-directory-copy.constants';

export type WorkspaceDirectoryPanelVariant = 'inline' | 'banner' | 'row';

export type WorkspaceDirectoryPanelProps = {
  /** Layout variant. */
  readonly variant: WorkspaceDirectoryPanelVariant;
  /**
   * Identity of the workspace this panel represents. Optional — `none`
   * and `unsupported` panels render before a workspace exists.
   */
  readonly workspaceId?: string;
  /** Display label (typically the folder name). */
  readonly workspaceName?: string;
  /** Optional folder path or supporting detail. */
  readonly description?: string;
  /** Current status — drives copy, badge colour, and CTA visibility. */
  readonly status: WorkspaceDirectoryStatus;
  /** Show a spinner / disable buttons while a picker or permission flow runs. */
  readonly isBusy?: boolean;
  /** Connect a new workspace (or change the directory of this one). */
  readonly onConnect?: () => void | Promise<void>;
  /** Re-grant read/write permission on the current handle. */
  readonly onGrantAccess?: () => void | Promise<void>;
  /** Remove Tau's retained directory handle while preserving workspace identity. */
  readonly onDisconnect?: () => void | Promise<void>;
  /** Probe an unavailable folder again (D2 **Try again**). */
  readonly onRetry?: () => void | Promise<void>;
  /** Relink this workspace to the folder's new place (D2 **Locate…**); the row offers it only when supplied. */
  readonly onLocate?: () => void | Promise<void>;
  /** Forget this workspace, its access and its project bindings, never its files (D2 **Remove from Tau**). */
  readonly onRemove?: () => void | Promise<void>;
  /** Why a `conflict` or `error` folder can't be used, shown after the row's label. */
  readonly reason?: string;
  /** The `row` variant's status is not published yet: it shows no label and no command until it is (T-R3.2). */
  readonly isChecking?: boolean;
  /**
   * Optional right-aligned metadata node rendered in the `row` variant
   * between the description block and the action group. Lets callers
   * compose status-agnostic affordances such as a project count without
   * bolting on a sub-row.
   */
  readonly meta?: React.ReactNode;
};

export function WorkspaceDirectoryPanel({
  variant,
  workspaceName,
  status,
  description,
  isBusy = false,
  onConnect,
  onGrantAccess,
  onDisconnect,
  onRetry,
  onLocate,
  onRemove,
  reason,
  isChecking = false,
  meta,
}: WorkspaceDirectoryPanelProps): React.JSX.Element {
  const copy = workspaceDirectoryCopy[status];
  const isAttention = status !== 'connected' && status !== 'unsupported';
  const showConnect =
    (status === 'none' || status === 'disconnected' || status === 'connected' || status === 'permission') && onConnect;
  const showGrantAccess = status === 'permission' && onGrantAccess;
  const connectLabel =
    status === 'none'
      ? workspaceDirectoryActions.connect
      : status === 'disconnected'
        ? workspaceDirectoryActions.reconnect
        : workspaceDirectoryActions.change;

  const indicator =
    status === 'connected' ? (
      <FolderOpen className='size-4 shrink-0 text-muted-foreground' />
    ) : status === 'unsupported' ? (
      <AlertTriangle className='size-4 shrink-0 text-muted-foreground' />
    ) : (
      <AlertTriangle className='size-4 shrink-0 text-warning' />
    );

  if (variant === 'banner') {
    return (
      <div
        role={isAttention ? 'alert' : undefined}
        className={cn(
          'flex items-center justify-between gap-4 rounded-md border px-3 py-2 text-sm',
          isAttention ? 'border-warning/40 bg-warning/10' : 'border-border bg-muted/40',
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
              {workspaceDirectoryActions.grantAccess}
            </Button>
          ) : undefined}
          {showConnect ? (
            <Button size='sm' variant='outline' disabled={isBusy} onClick={onConnect}>
              {connectLabel}
            </Button>
          ) : undefined}
        </div>
      </div>
    );
  }

  if (variant === 'row') {
    return (
      <div className='flex flex-wrap items-center justify-between gap-3 py-3'>
        <div className={cn('flex min-w-0 items-center gap-3', isAttention && 'text-muted-foreground')}>
          {indicator}
          <div className='flex min-w-0 flex-col'>
            <span className='truncate text-sm font-medium text-foreground'>{workspaceName ?? copy.title}</span>
            {description ? <span className='text-xs break-all text-muted-foreground'>{description}</span> : undefined}
            {isChecking ? undefined : status === 'connected' ? (
              <span className='text-xs text-muted-foreground'>{workspaceDirectoryRowLabel.connected}</span>
            ) : (
              <span className='text-xs text-muted-foreground'>
                <span className='font-medium text-foreground'>{copy.title}</span>
                {(status === 'conflict' || status === 'error') && reason ? <span>: {reason}</span> : undefined}
                <span>. {copy.description}</span>
              </span>
            )}
          </div>
        </div>
        <div className='flex shrink-0 flex-wrap items-center gap-2'>
          {meta}
          {isChecking ? undefined : (
            <RowActions
              status={status}
              isBusy={isBusy}
              connectLabel={connectLabel}
              onConnect={onConnect}
              onGrantAccess={onGrantAccess}
              onDisconnect={onDisconnect}
              onRetry={onRetry}
              onLocate={onLocate}
              onRemove={onRemove}
            />
          )}
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
              {workspaceDirectoryActions.grantAccess}
            </Button>
          ) : undefined}
          {showConnect ? (
            <Button size='sm' variant={showGrantAccess ? 'outline' : 'default'} disabled={isBusy} onClick={onConnect}>
              <FolderOpen className='mr-1 size-3.5' />
              {connectLabel}
            </Button>
          ) : undefined}
        </div>
      ) : undefined}
    </div>
  );
}

type RowAction = 'connect' | 'grantAccess' | 'retry' | 'locate' | 'remove' | 'disconnect';

/**
 * The actions a folder row offers in each state, in order (blueprint D2's table). `connect` is Reconnect on a
 * disconnected row and the web's Change folder on a connected one; Remove is offered in every state but `connected`.
 */
const rowActionsByStatus: Readonly<Record<WorkspaceDirectoryStatus, readonly RowAction[]>> = {
  connected: ['connect', 'disconnect'],
  notFound: ['locate', 'retry', 'remove'],
  unreachable: ['retry', 'locate', 'remove'],
  permission: ['grantAccess', 'locate', 'remove'],
  conflict: ['locate', 'remove'],
  error: ['retry', 'remove'],
  disconnected: ['connect', 'remove'],
  none: ['connect'],
  unsupported: [],
};

function RowActions({
  status,
  isBusy,
  connectLabel,
  onConnect,
  onGrantAccess,
  onDisconnect,
  onRetry,
  onLocate,
  onRemove,
}: Pick<
  WorkspaceDirectoryPanelProps,
  'status' | 'onConnect' | 'onGrantAccess' | 'onDisconnect' | 'onRetry' | 'onLocate' | 'onRemove'
> & {
  readonly isBusy: boolean;
  readonly connectLabel: string;
}): React.JSX.Element {
  const handlers: Readonly<Record<RowAction, (() => void | Promise<void>) | undefined>> = {
    connect: onConnect,
    grantAccess: onGrantAccess,
    retry: onRetry,
    locate: onLocate,
    remove: onRemove,
    disconnect: onDisconnect,
  };
  return (
    <>
      {rowActionsByStatus[status].map((action) => {
        const handler = handlers[action];
        if (handler === undefined) {
          return undefined;
        }
        if (action === 'disconnect') {
          return (
            <Button
              key={action}
              size='sm'
              variant='outline'
              disabled={isBusy}
              aria-busy={isBusy}
              onClick={handler}
              aria-label={workspaceDirectoryActions.disconnect}
            >
              <Unplug aria-hidden />
              Disconnect
            </Button>
          );
        }
        if (action === 'remove') {
          return (
            <Button key={action} size='sm' variant='outline' disabled={isBusy} aria-busy={isBusy} onClick={handler}>
              <Trash2 aria-hidden />
              {workspaceDirectoryActions.remove}
            </Button>
          );
        }
        const label =
          action === 'connect'
            ? connectLabel
            : action === 'grantAccess'
              ? workspaceDirectoryActions.grantAccess
              : action === 'retry'
                ? workspaceDirectoryActions.retry
                : workspaceDirectoryActions.locate;
        return (
          <Button key={action} size='sm' variant='outline' disabled={isBusy} onClick={handler}>
            {label}
          </Button>
        );
      })}
    </>
  );
}
