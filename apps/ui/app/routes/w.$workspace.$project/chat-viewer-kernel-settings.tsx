import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSelector } from '@xstate/react';
import type { ActorRefFrom } from 'xstate';
import { workbenchRecords } from '@taucad/workbench';
import { KernelSettings, kernelSettingsGroups } from '@taucad/viewer/cad/kernel-settings';
import { useProject } from '#hooks/use-project.js';
import { selectCadEvaluateOptions, selectCadEvaluation } from '#machines/cad.machine.js';
import type { cadMachine } from '#machines/cad.machine.js';
import { getLiveViewOptions, setLiveViewOptions, useLiveViewOptions } from '#workbench-records/live-view-options.js';
import type { LiveViewOptions } from '#workbench-records/live-view-options.js';
import { newViewRecord } from '@taucad/workbench-panes/records/view-record';
import { useWorkbenchViewCommands } from '#workbench-records/view-actions.js';

/** How long setting edits rest before the view record is written; closing the menu writes at once. */
export const viewOptionsSaveDelay = 300;

/**
 * Defaults to show for evaluate options: the schema's own, then each property's first example. An option the kernel
 * resolves itself when unset (a mesh adaptivity) declares no default but shows its usual value as an example.
 */
const shownDefaults = (offer: Readonly<{ schema: unknown; defaults: Readonly<Record<string, unknown>> }>) => {
  const properties = (offer.schema as { properties?: Record<string, { examples?: unknown }> }).properties ?? {};
  const shown: Record<string, unknown> = {};
  for (const [key, property] of Object.entries(properties)) {
    if (Array.isArray(property.examples) && property.examples.length > 0) {
      shown[key] = property.examples[0];
    }
  }
  return { ...shown, ...offer.defaults };
};

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
  // Evaluate options are the document's: a change re-evaluates it, so edits rest before they are sent.
  const evaluateOffer = evaluation?.success ? evaluation.evaluateOptions : undefined;
  const evaluateDefaults = useMemo(() => (evaluateOffer ? shownDefaults(evaluateOffer) : {}), [evaluateOffer]);
  const evaluateGroups = useMemo(
    () => (evaluateOffer ? kernelSettingsGroups(evaluateOffer.schema, evaluateDefaults) : []),
    [evaluateOffer, evaluateDefaults],
  );
  const evaluateOptions = useSelector(cadActor, selectCadEvaluateOptions);
  const [evaluateDraft, setEvaluateDraft] = useState<Record<string, unknown>>();
  const pendingEvaluate = useRef<{
    readonly next: Record<string, unknown>;
    readonly timer: ReturnType<typeof setTimeout>;
  }>(undefined);
  const flushEvaluate = useCallback((): void => {
    const pending = pendingEvaluate.current;
    if (!pending) {
      return;
    }
    clearTimeout(pending.timer);
    pendingEvaluate.current = undefined;
    cadActor.send({ type: 'setEvaluateOptions', evaluateOptions: pending.next });
    setEvaluateDraft(undefined);
  }, [cadActor]);
  const sendEvaluate = (next: Record<string, unknown>, restDelay: number): void => {
    setEvaluateDraft(next);
    clearTimeout(pendingEvaluate.current?.timer);
    pendingEvaluate.current = { next, timer: setTimeout(flushEvaluate, restDelay) };
  };
  // Closing the menu sends an edit still resting, as it writes a resting view option.
  useEffect(() => flushEvaluate, [flushEvaluate]);

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

  const evaluateSettings =
    evaluateGroups.length > 0 ? (
      <KernelSettings
        groups={evaluateGroups}
        values={evaluateDraft ?? evaluateOptions}
        defaults={evaluateDefaults}
        onChange={(next) => {
          sendEvaluate(next, viewOptionsSaveDelay);
        }}
        onReset={() => {
          // Unset options take the kernel's own defaults, which may depend on others (a picovoxel lane).
          sendEvaluate({}, 0);
        }}
      />
    ) : undefined;
  if (!offered || !options || groups.length === 0) {
    return evaluateSettings;
  }
  const change = (next: Record<string, unknown>): void => {
    const draft = { viewId: offered.id, options: next };
    setLiveViewOptions(viewId, draft);
    clearTimeout(pendingSave.current?.timer);
    pendingSave.current = { draft, save, timer: setTimeout(flush, viewOptionsSaveDelay) };
  };
  const state = record?.kernelViews?.find((view) => view.id === offered.id);
  return (
    <>
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
      {evaluateSettings}
    </>
  );
}
