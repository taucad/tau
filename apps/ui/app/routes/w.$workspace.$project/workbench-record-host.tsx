/**
 * The layout record's live region (app state orchestration plan § 4 A8b). The record session, its watch, its issue,
 * its producer and the arrangement it applies are the project runtime's `workbenchLayout` child now, which lives as long
 * as the runtime (rows Y1 to Y5, I13); this component only announces what the layout did: each arrangement read from
 * the record, and each restore notice. It also hands the runtime's restore the page's checked file client.
 *
 * @module
 */
import { useLayoutEffect, useMemo, useSyncExternalStore } from 'react';
import { useSelector } from '@xstate/react';
import { useFileManager } from '#hooks/use-file-manager.js';
import { useProject } from '#hooks/use-project.js';
import { useWorkbenchLayoutController } from '#routes/w.$workspace.$project/project-workspace-context.js';
import { selectWorkbenchLayoutRef } from '#runtime/project-runtime.js';
import type { ProjectRuntime } from '#runtime/project-runtime.js';
import type { WorkbenchLayoutRef } from '#runtime/project-runtime.layout.js';
import type { WorkbenchLayoutView } from '#workbench-records/workbench-layout.machine.js';

/** The revision of the latest arrangement read from the record, or `undefined` before one (or while it is refused). */
const selectReadRevision = (snapshot: WorkbenchLayoutView): number | undefined => {
  const { latest } = snapshot.context;
  return latest === undefined || latest.refused || latest.layout === undefined ? undefined : latest.revision;
};

/** The runtime's layout; it is spawned with the runtime and never replaced, so one read is enough. */
const selectRuntimeLayout = (runtime: ProjectRuntime): WorkbenchLayoutRef | undefined =>
  selectWorkbenchLayoutRef(runtime.actor.getSnapshot());

/** The arrangements read from the record, announced once each. */
function ArrangementAnnouncement({ layout }: { readonly layout: WorkbenchLayoutRef }): React.ReactNode {
  const revision = useSelector(layout, selectReadRevision);
  return revision === undefined ? null : (
    <span key={`arranged-${String(revision)}`}>Workbench arrangement updated.</span>
  );
}

/** Announces the workbench arrangement's changes to assistive technology, and hands a restore its checked files. */
export function WorkbenchRecordHost(): React.JSX.Element {
  const { projectRuntime } = useProject();
  const layout = selectRuntimeLayout(projectRuntime);
  const { parameterFiles, workbenchFiles } = useFileManager();
  const restoreFiles = useMemo(() => ({ ...parameterFiles, ...workbenchFiles }), [parameterFiles, workbenchFiles]);
  /* A value for the runtime's restore, which recreates view records through the page's checked file client. */
  useLayoutEffect(() => {
    projectRuntime.layout?.setFiles(restoreFiles);
    return () => {
      projectRuntime.layout?.setFiles(undefined);
    };
  }, [projectRuntime, restoreFiles]);
  const controller = useWorkbenchLayoutController();
  const notice = useSyncExternalStore(
    controller.subscribe,
    () => controller.snapshot()?.notice,
    () => undefined,
  );
  return (
    <div role='status' aria-live='polite' className='sr-only'>
      {layout === undefined ? null : <ArrangementAnnouncement layout={layout} />}
      {notice === undefined ? null : <span key={`notice-${String(notice.version)}`}>{notice.text}</span>}
    </div>
  );
}
