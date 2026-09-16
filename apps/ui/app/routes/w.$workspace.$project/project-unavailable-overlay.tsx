/**
 * Indirection layer for every reason the project shell can't render
 * normal content (Audit R8). Renders inside both the desktop and mobile
 * chat shells over the dockview / viewer so the broken state is fully
 * covered — a banner approach was rejected because the dockview still
 * paints "File not found" errors underneath while the user is reading
 * the recovery copy.
 *
 * Priority (highest first):
 * 1. Project-machine load error.
 * 2. File-manager terminal error.
 * 3. `WorkspaceUnavailableRecovery` — webaccess handle missing or
 *    permission revoked (`unavailableReason !== undefined`).
 *
 * When none of the above apply, nothing renders (the dockview is fine).
 *
 * Blueprint R6: the two error branches now render the route notices'
 * presentation — `PanelEmptyState`, the soft-error glyph tone, a primary
 * "Try again" and a secondary "Go back" — instead of their own panel. The
 * `ProjectRouteNotice` wrapper itself is deliberately not reused: it owns a
 * pane header with the mobile `SidebarTrigger`, and this overlay covers one
 * pane inside a shell that already has both.
 */

import { useSelector } from '@xstate/react';
import { ArrowLeft, OctagonAlert, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router';
import { Button } from '@taucad/ui/components/button';
import { cn } from '@taucad/ui/utils/cn';
import { PanelEmptyState } from '#components/ui/panel-empty-state.js';
import { WorkspaceUnavailableRecovery } from '#routes/w.$workspace.$project/workspace-unavailable-recovery.js';
import { useFileManager } from '#hooks/use-file-manager.js';
import { useProject } from '#hooks/use-project.js';

type ProjectUnavailableOverlayProps = {
  readonly className?: string;
};

type ProjectUnavailableNoticeProps = {
  readonly className?: string;
  readonly description: string;
  readonly error: Error;
  readonly onRetry: () => void;
  readonly title: string;
};

/**
 * One broken-state surface over the viewer, on the route notices' presentation.
 *
 * The glyph carries the soft-error tone (`text-feature`) rather than
 * destructive red: nothing has been lost, the project just did not open.
 */
function ProjectUnavailableNotice({
  className,
  description,
  error,
  onRetry,
  title,
}: ProjectUnavailableNoticeProps): React.JSX.Element {
  const navigate = useNavigate();

  return (
    <div className={cn('absolute inset-0 z-20 bg-background', className)} role='alert'>
      <PanelEmptyState
        icon={OctagonAlert}
        iconClassName='text-feature'
        title={title}
        description={
          <>
            {description}
            <span className='mt-2 block font-mono text-xs wrap-break-word'>{error.message}</span>
          </>
        }
        /* D2: PanelEmptyState's own mt-3 is tuned for small panes; this covers a whole one. */
        className='p-6 [&_[data-slot=panel-empty-state-copy]]:mt-6'
      >
        <div className='flex flex-wrap items-center justify-center gap-2'>
          <Button type='button' onClick={onRetry}>
            <RefreshCw />
            Try again
          </Button>
          <Button
            type='button'
            variant='outline'
            onClick={() => {
              void navigate(-1);
            }}
          >
            <ArrowLeft />
            Go back
          </Button>
        </div>
      </PanelEmptyState>
    </div>
  );
}

export function ProjectUnavailableOverlay({
  className,
}: ProjectUnavailableOverlayProps): React.JSX.Element | undefined {
  const { projectRef } = useProject();
  const isProjectError = useSelector(projectRef, (state) => state.matches('error'));
  const projectError = useSelector(projectRef, (state) => state.context.error);
  const { fileManagerRef, unavailableReason, activeWorkspaceId, activeWorkspaceName } = useFileManager();
  const isFileManagerError = useSelector(fileManagerRef, (state) => state.matches('error'));
  const fileManagerError = useSelector(fileManagerRef, (state) => state.context.error);

  if (isProjectError) {
    return (
      <ProjectUnavailableNotice
        className={className}
        title="Couldn't open this project"
        description='Tau could not load this project. Try again, or go back and pick another one.'
        error={projectError ?? new Error('Project failed to load.')}
        onRetry={() => {
          projectRef.send({ type: 'reloadProject' });
        }}
      />
    );
  }

  if (isFileManagerError) {
    return (
      <ProjectUnavailableNotice
        className={className}
        title="Couldn't reach this project's files"
        description='The file service for this project stopped. Its files are still on disk — try again to reconnect.'
        error={fileManagerError ?? new Error('File manager failed.')}
        onRetry={() => {
          globalThis.location.reload();
        }}
      />
    );
  }

  if (unavailableReason) {
    return (
      <WorkspaceUnavailableRecovery
        className={className}
        reason={unavailableReason}
        workspaceId={activeWorkspaceId}
        workspaceName={activeWorkspaceName}
      />
    );
  }

  return undefined;
}
