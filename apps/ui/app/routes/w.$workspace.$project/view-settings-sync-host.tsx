import { useSelector } from '@xstate/react';
import type { ActorRefFrom } from 'xstate';
import { useProject } from '#hooks/use-project.js';
import { useViewSettingsSync } from '#hooks/use-view-settings-sync.js';
import type { editorMachine } from '#machines/editor.machine.js';
import type { graphicsMachine } from '#machines/graphics.machine.js';
import type { projectMachine } from '#machines/project.machine.js';

/**
 * The write side of every live view's durable settings (R6).
 *
 * One host per project, mounted beside `ProjectPersistenceGuard` rather than inside the viewer: the
 * owner of a durable field is the actor that holds it, and those actors outlive the pane that
 * happens to be showing them. A project whose panes are closed, whose window is unfocused or whose
 * panel is mid-drag still writes what its owners hold, and writes it exactly once.
 */
export function ViewSettingsSyncHost(): React.JSX.Element {
  const { projectRef, editorRef } = useProject();
  const viewGraphics = useSelector(projectRef, (state) => state.context.viewGraphics);

  return (
    <>
      {[...viewGraphics].map(([viewId, graphicsRef]) => (
        <ViewSettingsSyncEntry
          key={viewId}
          viewId={viewId}
          graphicsRef={graphicsRef}
          projectRef={projectRef}
          editorRef={editorRef}
        />
      ))}
    </>
  );
}

/** One live view: its graphics actor, the CAD actor of the entry it renders, and the editor store. */
function ViewSettingsSyncEntry({
  viewId,
  graphicsRef,
  projectRef,
  editorRef,
}: {
  readonly viewId: string;
  readonly graphicsRef: ActorRefFrom<typeof graphicsMachine>;
  readonly projectRef: ActorRefFrom<typeof projectMachine>;
  readonly editorRef: ActorRefFrom<typeof editorMachine>;
}): React.JSX.Element {
  /* The editor record is what names a view's entry; the pane only mirrors it. */
  const entryPath = useSelector(editorRef, (state) => state.context.viewSettings[viewId]?.entryPath);
  const cadRef = useSelector(projectRef, (state) =>
    entryPath === undefined ? undefined : state.context.geometryUnits.get(entryPath),
  );

  useViewSettingsSync({ viewId, entryPath, graphicsRef, cadRef, editorRef });

  // oxlint-disable-next-line react/jsx-no-useless-fragment -- Headless component
  return <></>;
}
