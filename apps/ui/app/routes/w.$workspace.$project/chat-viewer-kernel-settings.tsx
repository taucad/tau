import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useSelector } from '@xstate/react';
import type { ActorRefFrom } from 'xstate';
import { workbenchRecords } from '@taucad/workbench';
import { KernelSettings, kernelSettingsGroups } from '#components/geometry/cad/kernel-settings.js';
import { useProject } from '#hooks/use-project.js';
import { selectCadEvaluation } from '#machines/cad.machine.js';
import type { cadMachine } from '#machines/cad.machine.js';
import { getLiveViewOptions, setLiveViewOptions, useLiveViewOptions } from '#workbench-records/live-view-options.js';
import type { LiveViewOptions } from '#workbench-records/live-view-options.js';
import { newViewRecord } from '#workbench-records/projection.js';
import { useWorkbenchViewCommands } from '#workbench-records/view-actions.js';

/** How long setting edits rest before the view record is written; closing the menu writes at once. */
export const viewOptionsSaveDelay = 300;

/**
 * Kernel settings for the view this pane shows, inside the viewer settings menu: nothing when the view declares no
 * options. Each edit re-renders the view at once through the pane's live draft; the record is written once edits rest,
 * so a drag re-renders every frame without a file write per frame.
 */
export function ViewerKernelSettings({
  viewId,
  entryPath,
  cadActor,
}: {
  readonly viewId: string;
  readonly entryPath: string;
  readonly cadActor: ActorRefFrom<typeof cadMachine>;
}): React.JSX.Element | undefined {
  const evaluation = useSelector(cadActor, selectCadEvaluation);
  const { viewRecords } = useProject();
  const viewCommands = useWorkbenchViewCommands();
  const liveOptions = useLiveViewOptions(viewId);
  const record = viewRecords.get(viewId);
  const views = evaluation?.success ? evaluation.views : [];
  const offered = record?.selectedKernelView ? views.find((view) => view.id === record.selectedKernelView) : views[0];
  const options = offered?.options;
  const groups = useMemo(() => (options ? kernelSettingsGroups(options.schema, options.defaults) : []), [options]);

  // The save travels with its edit, so `flush` stays stable and the unmount cleanup runs only when the menu closes.
  const pendingSave = useRef<{
    readonly draft: LiveViewOptions;
    readonly save: (draft: LiveViewOptions) => Promise<void>;
    readonly timer: ReturnType<typeof setTimeout>;
  }>(undefined);
  /* The record is the durable copy; the live draft keeps the viewer on what the menu shows until the record has it,
   * and a newer draft stays in place. */
  const save = async (draft: LiveViewOptions): Promise<void> => {
    await viewCommands.edit(viewId, (current) => {
      const nextRecord = current ?? newViewRecord(entryPath);
      const states = nextRecord.kernelViews ?? [];
      const prior = states.find((view) => view.id === draft.viewId) ?? { id: draft.viewId };
      return workbenchRecords.view.schema.parse({
        ...nextRecord,
        kernelViews: [...states.filter((view) => view.id !== draft.viewId), { ...prior, options: draft.options }],
      });
    });
    if (getLiveViewOptions(viewId) === draft) {
      setLiveViewOptions(viewId, undefined);
    }
  };
  const flush = useCallback((): void => {
    const pending = pendingSave.current;
    if (!pending) {
      return;
    }
    clearTimeout(pending.timer);
    pendingSave.current = undefined;
    void pending.save(pending.draft);
  }, []);
  // The menu unmounts its rows when it closes, which writes any edit still resting.
  useEffect(() => flush, [flush]);

  if (!offered || !options || groups.length === 0) {
    return undefined;
  }
  const change = (next: Record<string, unknown>): void => {
    const draft = { viewId: offered.id, options: next };
    setLiveViewOptions(viewId, draft);
    clearTimeout(pendingSave.current?.timer);
    pendingSave.current = { draft, save, timer: setTimeout(flush, viewOptionsSaveDelay) };
  };
  const state = record?.kernelViews?.find((view) => view.id === offered.id);
  return (
    <KernelSettings
      groups={groups}
      values={liveOptions?.viewId === offered.id ? liveOptions.options : (state?.options ?? {})}
      defaults={options.defaults}
      onChange={change}
      onReset={() => {
        change(options.defaults);
        flush();
      }}
    />
  );
}
