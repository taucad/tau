import { useProjectAvailability } from '#hooks/use-project-availability.js';
import { ProjectSyncPlaceholder } from '#routes/w.$workspace.$project/project-sync-placeholder.js';
import { XIcon } from 'lucide-react';
import { useCallback, memo, useState, useMemo, useRef, useEffect } from 'react';
import { useSelector } from '@xstate/react';
import type { ActorRefFrom, SnapshotFrom } from 'xstate';
import { KeyShortcut } from '@taucad/ui/components/key-shortcut';
import { toast } from '#components/ui/sonner.js';
import { ExportSelector } from '#components/files/export-selector.js';
import {
  FloatingPanel,
  FloatingPanelClose,
  FloatingPanelContent,
  FloatingPanelContentBody,
  FloatingPanelContentHeader,
  FloatingPanelContentHeaderActions,
  FloatingPanelContentTitle,
} from '#components/ui/floating-panel.js';
import { useKeybinding } from '@taucad/ui/components/keyboard';
import { ParametersPane } from '@taucad/workbench-panes/parameters/parameters-pane';
import type {
  ParametersEntryState,
  ParametersPaneviewPersistence,
  ParametersSource,
} from '@taucad/workbench-panes/parameters/parameters-source';
import { useProject, useParameterSetActor } from '#hooks/use-project.js';
import type { ParameterCommit } from '@taucad/viewer/parameters/rjsf-context';
import type { cadMachine } from '#machines/cad.machine.js';
import type { ParameterManifest } from '@taucad/parameters';
import type { FileParameterEntry, JSONValue } from '@taucad/types';
import type { ParameterSetService } from '#services/parameter-set-service.js';
import { withPointerValue } from '#services/parameter-set-service.js';
import { usePaneviewPersistence } from '#routes/w.$workspace.$project/use-chat-interface-state.js';
import { projectWorkspaceKeyCombinations } from '#routes/w.$workspace.$project/project-workspace-context.js';
import { ProjectWorkbenchPanesHost } from '#routes/w.$workspace.$project/workbench-panes-host.js';
import type { parameterSetMachine } from '@taucad/parameters/set-machine';

const toggleParametersKeyCombination = projectWorkspaceKeyCombinations.parameters;

type ParameterSetActor = NonNullable<ReturnType<ParameterSetService['actor']>>;
type ParameterSetState = SnapshotFrom<typeof parameterSetMachine>;

const currentEntryOf = (state: ParameterSetState | undefined): FileParameterEntry | undefined =>
  state?.context.current?.entry;

const sameManifestRevision = (left: ParameterManifest | undefined, right: ParameterManifest | undefined): boolean =>
  left === right || (left?.revision !== undefined && left.revision === right?.revision);

/**
 * Ensure the entry's authority actor exists and follow it. `resolve` is idempotent; a retired actor
 * (rename rollback, delete and recreate, retried close) leaves the store and is resolved again.
 */
const useResolvedParameterActor = (
  entryPath: string,
  manifest: ParameterManifest | undefined,
): ParameterSetActor | undefined => {
  const { resolveParameterEntry } = useProject();
  const actor = useParameterSetActor(entryPath);
  // Resolve once per actor and manifest revision: a failed load stays on screen with its own retry,
  // so re-rendering with an equal manifest must not reload it again.
  const resolved = useRef<Readonly<{ actor: ParameterSetActor | undefined; revision: string }>>(undefined);
  useEffect(() => {
    if (manifest === undefined) {
      return;
    }
    const previous = resolved.current;
    if (actor !== undefined && previous?.actor === actor && previous.revision === manifest.revision) {
      return;
    }
    if (actor?.getSnapshot().context.current?.manifest.revision !== manifest.revision) {
      resolveParameterEntry(entryPath, manifest);
    }
    resolved.current = { actor, revision: manifest.revision };
  }, [actor, entryPath, manifest, resolveParameterEntry]);
  return actor;
};

const authorityFailureOf = (
  state: ParameterSetState | undefined,
): Readonly<{ code: string; message: string }> | undefined =>
  state?.matches({ open: 'disconnected' }) === true || state?.matches({ open: 'uncertain' }) === true
    ? state.context.diagnostic
    : undefined;

/** Longest last render that keeps a drag live on a kernel that cannot cancel a render. Milliseconds. */
const liveDragRenderBudget = 250;

/**
 * Whether this unit's last settled render took at most {@link liveDragRenderBudget}.
 *
 * Timed from the default subscription entering `rendering` to reaching `ready`.
 * Repeated rendering status for the same CAD attempt is ignored; a replaced attempt starts fresh.
 * A failed projection or one already running at mount is never counted.
 */
function useLastRenderWithinBudget(cadRef: ActorRefFrom<typeof cadMachine> | undefined): boolean {
  const [isWithinBudget, setIsWithinBudget] = useState(false);

  useEffect(() => {
    if (cadRef === undefined) {
      return undefined;
    }
    let selectedView = cadRef.getSnapshot().context.defaultView;
    let startedAt: number | undefined;
    let previousStatus: 'rendering' | 'ready' | 'error' | 'closed' | undefined;
    let startedAttempt: number | undefined;
    let startedEvaluationId: string | undefined;
    const listen = (view: typeof selectedView): (() => void) | undefined =>
      view?.on('status', (status) => {
        const { openAttempt, evaluation } = cadRef.getSnapshot().context;
        if (status === 'rendering') {
          if (
            previousStatus !== 'rendering' ||
            startedAttempt !== openAttempt ||
            startedEvaluationId !== evaluation?.id
          ) {
            startedAt = previousStatus === undefined ? undefined : performance.now();
            startedAttempt = openAttempt;
            startedEvaluationId = evaluation?.id;
          }
        } else {
          if (
            status === 'ready' &&
            startedAt !== undefined &&
            startedAttempt === openAttempt &&
            startedEvaluationId === evaluation?.id
          ) {
            setIsWithinBudget(performance.now() - startedAt <= liveDragRenderBudget);
          }
          startedAt = undefined;
        }
        previousStatus = status;
      });
    let unlisten = listen(selectedView);
    const subscription = cadRef.subscribe((snapshot: SnapshotFrom<typeof cadMachine>) => {
      if (snapshot.context.defaultView === selectedView) {
        return;
      }
      unlisten?.();
      selectedView = snapshot.context.defaultView;
      startedAt = undefined;
      previousStatus = undefined;
      startedAttempt = undefined;
      startedEvaluationId = undefined;
      unlisten = listen(selectedView);
    });
    return () => {
      subscription.unsubscribe();
      unlisten?.();
    };
  }, [cadRef]);

  return isWithinBudget;
}

/**
 * Drag-time dispatch for one geometry unit (D2).
 *
 * The pump holds the newest sample and hands it to the unit on an animation frame, but only while
 * no render is in flight: a sample per frame regardless of render cost starves the lane, because
 * every dispatch supersedes the render before it can settle (S2). Samples in between are dropped,
 * which is what latest-wins means. Nothing here is persisted; the released value is committed
 * through the ordinary checked write.
 *
 * Cancellation only matters at release, when the commit supersedes the last sample, so a kernel
 * that cannot cancel stays live while its last render fits the budget. Otherwise `scrub` is absent
 * and the row previews the value on its own. `endScrub` stays, so a drag that loses the lane
 * mid-gesture still ends the samples it sent.
 */
function useScrubDispatch(
  cadRef: ActorRefFrom<typeof cadMachine> | undefined,
): Pick<ParameterCommit, 'scrub' | 'endScrub'> {
  const isCooperative = useSelector(cadRef, (state) => {
    const kernelId = state?.context.activeKernelId;
    return (
      kernelId !== undefined &&
      state?.context.capabilities?.renderCapabilities[kernelId]?.cancellation === 'cooperative'
    );
  });
  const isLastRenderWithinBudget = useLastRenderWithinBudget(cadRef);
  const canScrub = isCooperative || isLastRenderWithinBudget;

  const pending = useRef<Readonly<{ generation: number; parameters: Record<string, unknown> }> | undefined>(undefined);
  const frame = useRef<number | undefined>(undefined);
  const latestGeneration = useRef(0);
  const activeGeneration = useRef<Readonly<{ generation: number; sent: boolean }> | undefined>(undefined);

  const lane = useMemo(() => {
    const unit = cadRef;
    const clearPending = (): void => {
      pending.current = undefined;
      if (frame.current !== undefined) {
        cancelAnimationFrame(frame.current);
        frame.current = undefined;
      }
    };
    function pump(): void {
      frame.current = undefined;
      if (pending.current === undefined || unit === undefined) {
        return;
      }
      if (unit.getSnapshot().hasTag('cad-loading')) {
        frame.current = requestAnimationFrame(pump);
        return;
      }
      const next = pending.current;
      pending.current = undefined;
      unit.send({ type: 'scrubParameters', parameters: next.parameters });
      if (activeGeneration.current?.generation === next.generation) {
        activeGeneration.current = { ...activeGeneration.current, sent: true };
      }
    }
    return {
      scrub(field: Readonly<{ pointer: string; value: JSONValue }>): void {
        activeGeneration.current ??= { generation: ++latestGeneration.current, sent: false };
        pending.current = {
          generation: activeGeneration.current.generation,
          parameters: withPointerValue({}, field.pointer, field.value),
        };
        frame.current ??= requestAnimationFrame(pump);
      },
      async stop(final?: Promise<boolean>): Promise<void> {
        const completed = activeGeneration.current;
        activeGeneration.current = undefined;
        clearPending();
        if (completed?.sent !== true) {
          return;
        }
        if (final === undefined) {
          unit?.send({ type: 'restoreParameters' });
          return;
        }
        const committed = await final;
        if (!committed && latestGeneration.current === completed.generation) {
          unit?.send({ type: 'restoreParameters' });
        }
      },
      dispose(): void {
        activeGeneration.current = undefined;
        clearPending();
      },
    };
  }, [cadRef]);

  useEffect(() => {
    return () => {
      lane.dispose();
    };
  }, [lane]);

  const hasUnit = cadRef !== undefined;
  return useMemo(
    () => (hasUnit ? (canScrub ? { scrub: lane.scrub, endScrub: lane.stop } : { endScrub: lane.stop }) : {}),
    [canScrub, hasUnit, lane],
  );
}

// ---------------------------------------------------------------------------
// The Parameters pane source over the project
// ---------------------------------------------------------------------------

/** Every admitted geometry unit has a section; a view of an entry with no unit has none. */
function useProjectParameterEntryPaths(): readonly string[] {
  const { geometryUnits } = useProject();
  return useMemo(() => [...geometryUnits.keys()], [geometryUnits]);
}

/** The unit's manifest (by revision, so an equal republish re-renders nothing), and its authority actor's record. */
function useProjectParameterEntry(entryPath: string): ParametersEntryState {
  const { geometryUnits } = useProject();
  // The kernel republishes an equal manifest after every render; comparing revisions keeps the
  // section (and every row under it) from re-rendering on that notification.
  const manifest = useSelector(
    geometryUnits.get(entryPath),
    (state) => state?.context.parameterManifest,
    sameManifestRevision,
  );
  const actor = useResolvedParameterActor(entryPath, manifest);
  const entry = useSelector(actor, currentEntryOf);
  const authorityFailure = useSelector(actor, authorityFailureOf);
  const failure = manifest !== undefined && actor !== undefined ? authorityFailure : undefined;
  return useMemo(() => ({ manifest, entry, failure }), [entry, failure, manifest]);
}

function useProjectParameterScrub(entryPath: string): Pick<ParameterCommit, 'scrub' | 'endScrub'> {
  const { geometryUnits } = useProject();
  return useScrubDispatch(geometryUnits.get(entryPath));
}

function useParametersPaneviewPersistence(): ParametersPaneviewPersistence {
  return usePaneviewPersistence('parametersPaneview');
}

function ParametersQuickExport({ entryPath }: { readonly entryPath: string }): React.JSX.Element | undefined {
  const { geometryUnits, projectRef } = useProject();
  const projectName = useSelector(projectRef, (state) => state.context.project?.name) ?? 'model';
  const cadRef = geometryUnits.get(entryPath);
  if (cadRef === undefined) {
    return undefined;
  }
  return <ExportSelector cadActor={cadRef} filenameBase={projectName} defaultEntryPath={entryPath} variant='sub' />;
}

/**
 * The Parameters pane source over the project: its geometry units, their parameter-set actors and the project's
 * parameter, viewer, editor and export actions.
 *
 * @returns The source, stable while the project's services are.
 */
function useProjectParametersSource(): ParametersSource {
  const {
    parameterService,
    projectRef,
    editorRef,
    setGeometryUnitParameters,
    switchParameterGroup,
    createParameterGroup,
    deleteParameterGroup,
    renameParameterGroup,
  } = useProject();
  return useMemo(
    (): ParametersSource => ({
      useEntryPaths: useProjectParameterEntryPaths,
      useEntry: useProjectParameterEntry,
      target: (entryPath) => parameterService.target(entryPath),
      commitValue: async (entryPath, manifest, field) =>
        parameterService.commitValue(parameterService.target(entryPath), manifest, field),
      replaceValues: (entryPath, manifest, values) => {
        setGeometryUnitParameters(entryPath, manifest, { ...values });
      },
      retry: (entryPath, manifest) => {
        if (manifest !== undefined) {
          parameterService.actor(entryPath)?.send({ type: 'resolve', resolution: manifest.identity.resolution });
        }
      },
      resetRecord: async (entryPath) => parameterService.resetRecord(entryPath),
      reportError: (message) => {
        toast.error(message);
      },
      drafts: {
        draft: ({ entryPath, group, pointer }) =>
          parameterService.draft({ target: parameterService.target(entryPath), group, pointer }),
        setDraft: ({ entryPath, group, pointer }, draft) => {
          parameterService.setDraft({ target: parameterService.target(entryPath), group, pointer }, draft);
        },
        subscribe: parameterService.subscribeDrafts,
      },
      useScrub: useProjectParameterScrub,
      groups: {
        select: switchParameterGroup,
        create: (entryPath, manifest, { group, values }) => {
          createParameterGroup(entryPath, manifest, {
            groupName: group,
            ...(values === undefined ? {} : { values: { ...values } }),
          });
        },
        rename: (entryPath, manifest, { group, nextGroup }) => {
          renameParameterGroup(entryPath, manifest, { oldName: group, newName: nextGroup });
        },
        delete: deleteParameterGroup,
      },
      openInViewer: (entryPath) => {
        projectRef.send({ type: 'openInViewer', entryPath });
      },
      openInEditor: (entryPath) => {
        editorRef.send({ type: 'openFile', path: entryPath, source: 'user' });
      },
      closeEntry: (entryPath) => {
        projectRef.send({ type: 'destroyGeometryUnit', entryPath });
      },
      QuickExport: ParametersQuickExport,
      usePaneviewPersistence: useParametersPaneviewPersistence,
    }),
    [
      createParameterGroup,
      deleteParameterGroup,
      editorRef,
      parameterService,
      projectRef,
      renameParameterGroup,
      setGeometryUnitParameters,
      switchParameterGroup,
    ],
  );
}

function ProjectParametersPane(): React.JSX.Element {
  const parameters = useProjectParametersSource();
  const sources = useMemo(() => ({ parameters }), [parameters]);
  return (
    <ProjectWorkbenchPanesHost sources={sources}>
      <ParametersPane />
    </ProjectWorkbenchPanesHost>
  );
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export const ChatParameters = memo(function (props: {
  readonly className?: string;
  readonly isExpanded?: boolean;
  readonly setIsExpanded?: (value: boolean | ((current: boolean) => boolean)) => void;
}) {
  const { className, isExpanded = true, setIsExpanded } = props;

  const toggleParametersOpen = useCallback(() => {
    setIsExpanded?.((current) => !current);
  }, [setIsExpanded]);

  const { formattedKeyCombination: formattedParametersKeyCombination } = useKeybinding(
    toggleParametersKeyCombination,
    toggleParametersOpen,
  );

  return (
    <FloatingPanel isOpen={isExpanded} side='right' className={className} onOpenChange={setIsExpanded}>
      <FloatingPanelContent>
        <FloatingPanelContentHeader>
          <FloatingPanelContentTitle>Parameters</FloatingPanelContentTitle>
          <FloatingPanelContentHeaderActions>
            <FloatingPanelClose
              icon={XIcon}
              tooltipContent={(isOpen) => (
                <div className='flex items-center gap-2'>
                  {isOpen ? 'Close' : 'Open'} Parameters
                  <KeyShortcut variant='tooltip'>{formattedParametersKeyCombination}</KeyShortcut>
                </div>
              )}
            />
          </FloatingPanelContentHeaderActions>
        </FloatingPanelContentHeader>

        <FloatingPanelContentBody className='overflow-y-hidden'>
          <ParametersPanelBody />
        </FloatingPanelContentBody>
      </FloatingPanelContent>
    </FloatingPanel>
  );
});

export function ParametersPanelBody(): React.JSX.Element {
  const availability = useProjectAvailability();
  return availability === 'ready' ? <ProjectParametersPane /> : <ProjectSyncPlaceholder state={availability} />;
}
