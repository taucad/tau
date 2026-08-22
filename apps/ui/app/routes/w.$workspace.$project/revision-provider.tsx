import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useActorRef, useSelector } from '@xstate/react';
import type { ActorRefFrom } from 'xstate';
import { useQueryClient } from '@tanstack/react-query';
import type { PersistedRevisionState } from '@taucad/types';
import { toast } from '#components/ui/sonner.js';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '#components/ui/alert-dialog.js';
import { Button } from '#components/ui/button.js';
import type { ContentChangeEvent } from '@taucad/fs-client/file-content-service';
import { fromSafeAsync } from '#lib/xstate.lib.js';
import { useProject } from '#hooks/use-project.js';
import { useProjectManager } from '#hooks/use-project-manager.js';
import { useFileManager } from '#hooks/use-file-manager.js';
import { useAnalytics } from '#hooks/use-analytics.js';
import type { Chat } from '@taucad/chat';
import { isDesignPath, migrateHeadTurnId, resolveRestore } from '#lib/file-restore-timeline.js';
import { applyRestorePlan } from '#lib/restore-apply.js';
import { revisionMachine } from '#machines/revision.machine.js';
import type { ApplyPlanInput, ComputePlanInput, PlanComputedEvent } from '#machines/revision.machine.js';
import { RevisionPaneContext } from '#routes/w.$workspace.$project/revision-pane-context.js';
import type { RevisionPaneState } from '#routes/w.$workspace.$project/revision-pane-context.js';

/**
 * Owns the per-project `revisionMachine` actor, supplies its real
 * `computePlan` / `applyPlan` actors (closed over the live query client and
 * file-manager via a deps ref, mirroring `use-cad-preview`), and persists the
 * slice through the project machine's single-writer store via an
 * `updateRevisionState` event — never a direct out-of-band project write, which
 * the machine's full-document persist would clobber (see
 * docs/research/revision-state-atomic-persistence.md). The persisted slice
 * converges across tabs on the next project load, not live. The confirm dialog
 * (PC9) and the sonner undo/error toasts are wired here. The live turn/dirty/fork
 * seams (Seams 1–3) are added in P5/P6.
 */

const DEFAULT_REVISION_STATE: PersistedRevisionState = {
  headTurnId: '',
  supersededTurnIds: [],
  dirty: false,
};

export type RevisionActor = ActorRefFrom<typeof revisionMachine>;

const RevisionActorContext = createContext<RevisionActor | undefined>(undefined);

export function useRevisionActor(): RevisionActor {
  const actor = useContext(RevisionActorContext);
  if (!actor) {
    throw new Error('useRevisionActor must be used within a RevisionProvider');
  }
  return actor;
}

export function RevisionProvider({ children }: { readonly children: ReactNode }): React.JSX.Element {
  const { projectId, projectRef } = useProject();
  const projectManager = useProjectManager();
  const { writeFiles, deleteFile, exists, contentService } = useFileManager();
  const queryClient = useQueryClient();
  const analytics = useAnalytics();

  const persistedRevisionState = useSelector(projectRef, (s) => s.context.revisionState);
  // Mount-only: `useActorRef` captures `input` once, so the migration runs against
  // whatever chats are already in the React Query cache (best-effort — a legacy
  // parked restore that can't resolve falls back to the tip, never baseline).
  const initial = useMemo<PersistedRevisionState>(
    () => {
      const cachedChats = queryClient.getQueryData<Chat[]>(['chats', projectId, { includeDeleted: true }]) ?? [];
      return {
        headTurnId: migrateHeadTurnId(persistedRevisionState, cachedChats),
        supersededTurnIds: persistedRevisionState?.supersededTurnIds ?? DEFAULT_REVISION_STATE.supersededTurnIds,
        dirty: persistedRevisionState?.dirty ?? DEFAULT_REVISION_STATE.dirty,
      };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only actor input
    [],
  );

  const [paneOpen, setPaneOpen] = useState(false);
  const paneState = useMemo<RevisionPaneState>(
    () => ({
      isOpen: paneOpen,
      setOpen: setPaneOpen,
      toggle: () => {
        setPaneOpen((open) => !open);
      },
    }),
    [paneOpen],
  );

  // Deps ref: the actor is created once, so its actors must read the latest
  // closures rather than the mount-time snapshot (stale-closure guard).
  const depsRef = useRef({
    projectId,
    projectRef,
    projectManager,
    writeFiles,
    deleteFile,
    exists,
    queryClient,
  });
  depsRef.current = {
    projectId,
    projectRef,
    projectManager,
    writeFiles,
    deleteFile,
    exists,
    queryClient,
  };

  const actor = useActorRef(
    revisionMachine.provide({
      actors: {
        computePlan: fromSafeAsync<PlanComputedEvent, ComputePlanInput>(async ({ input }) => {
          const deps = depsRef.current;
          // H3: fresh cross-chat load via React Query's own primitive, reusing
          // the existing key. includeDeleted:true — soft-deleted chats still
          // mutated the FS (PC6).
          const chats = await deps.queryClient.fetchQuery({
            queryKey: ['chats', input.projectId, { includeDeleted: true }],
            queryFn: async () =>
              deps.projectManager.getChatsForResource(input.projectId, {
                includeDeleted: true,
              }),
          });
          const resolved = resolveRestore(chats, input.target, input.supersededTurnIds);
          return { type: 'planComputed', ...resolved };
        }),
        applyPlan: fromSafeAsync<void, ApplyPlanInput>(async ({ input }) => {
          const deps = depsRef.current;
          await applyRestorePlan(input.plan, {
            writeFiles: deps.writeFiles,
            deleteFile: deps.deleteFile,
            exists: deps.exists,
          });
        }),
      },
    }),
    {
      input: {
        projectId,
        initial,
        persist: (state) => {
          // Single-writer persistence: hand the slice to the project machine, the
          // sole owner of the project document. Never write it out-of-band — the
          // machine's full-document persist would otherwise clobber it (R2).
          depsRef.current.projectRef.send({ type: 'updateRevisionState', revisionState: state });
        },
      },
    },
  );

  // Seam 3: dirty detection. A non-'machine' write to a design path diverges
  // the live FS from the head (H6). Reuses the existing source-aware
  // content-change stream — Monaco saves ('editor') and file-tree ops ('user')
  // flip dirty; restore's own 'machine' writes and .tau/ paths are excluded.
  useEffect(() => {
    if (!contentService) {
      return undefined;
    }
    return contentService.onDidContentChange((event: ContentChangeEvent) => {
      if (
        (event.type === 'written' || event.type === 'batchWritten' || event.type === 'deleted') &&
        event.source !== 'machine'
      ) {
        const paths = event.type === 'batchWritten' ? event.paths : [event.path];
        for (const path of paths) {
          if (isDesignPath(path)) {
            actor.send({ type: 'FS_WRITE', source: event.source, path });
          }
        }
      }
    });
  }, [contentService, actor]);

  // Undo / error toasts (sonner action toast — no custom undo control) plus
  // telemetry (R/P8) via the existing posthog pipeline.
  useEffect(() => {
    const restored = actor.on('toast.restored', ({ n, unrecoverable }) => {
      analytics.capture('revision_restored', {
        revision: n,
        unrecoverableCount: unrecoverable.length,
      });
      toast.success(`Restored to Revision ${n}`, {
        description:
          unrecoverable.length > 0
            ? `${unrecoverable.length} file(s) could not be recovered (recorded before content capture).`
            : undefined,
        action: {
          label: 'Undo',
          onClick: () => {
            actor.send({ type: 'UNDO' });
          },
        },
      });
    });
    const errored = actor.on('toast.error', ({ message }) => {
      analytics.capture('revision_restore_failed', { message });
      toast.error('Restore failed', { description: message });
    });
    const forked = actor.on('forkMarker', ({ atRevision }) => {
      analytics.capture('revision_forked', { atRevision });
    });
    return () => {
      restored.unsubscribe();
      errored.unsubscribe();
      forked.unsubscribe();
    };
  }, [actor, analytics]);

  return (
    <RevisionActorContext.Provider value={actor}>
      <RevisionPaneContext.Provider value={paneState}>
        {children}
        <RestoreConfirmDialog actor={actor} />
      </RevisionPaneContext.Provider>
    </RevisionActorContext.Provider>
  );
}

/** Risky-restore confirmation (PC9) — reused `AlertDialog`, driven by `confirming`. */
function RestoreConfirmDialog({ actor }: { readonly actor: RevisionActor }): React.JSX.Element {
  const open = useSelector(actor, (s) => s.matches('confirming'));
  const deleteCount = useSelector(actor, (s) => s.context.plan?.remove.size ?? 0);
  const dirty = useSelector(actor, (s) => s.context.dirty);

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          actor.send({ type: 'CANCEL' });
        }
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Restore this revision?</AlertDialogTitle>
          <AlertDialogDescription>
            {deleteCount > 0 ? `This deletes ${deleteCount} file(s) created since. ` : ''}
            {dirty ? 'Unsaved editor changes will be overwritten. ' : ''}
            You can undo this restore.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button
            variant='outline'
            onClick={() => {
              actor.send({ type: 'CANCEL' });
            }}
          >
            Cancel
          </Button>
          <Button
            onClick={() => {
              actor.send({ type: 'CONFIRM' });
            }}
          >
            Restore
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
