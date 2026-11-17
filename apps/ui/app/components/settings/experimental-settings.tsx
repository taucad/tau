import { useId, useSyncExternalStore } from 'react';
import { useSelector } from '@xstate/react';
import type { ActorRefFrom } from 'xstate';
import type { graphicsMachine } from '@taucad/viewer/machines/graphics.machine';
import { selectCanvasBackend } from '@taucad/viewer/machines/canvas.machine';
import { findEntryGraphics } from '@taucad/workbench-panes/units/geometry-units';
import { selectProjectRef } from '#runtime/project-runtime.js';
import type { ProjectRuntimeViewSource } from '#runtime/project-runtime.session.js';
import { useFocusedProjectSession } from '#routes/w.$workspace.$project/focused-project-view.session.js';
import { SettingsGroup, SettingsRow } from '@taucad/settings-ui/components/settings/settings-item';
import { Switch } from '@taucad/ui/components/switch';
import { flagRegistry, experimentalFeatureFlagNames } from '#flags/flag.constants.js';
import type { FeatureFlagName } from '#flags/flag.constants.js';
import { useFeatureFlags, useSetFeatureFlag } from '#flags/use-feature.js';

function ActiveRendererStatus({
  graphicsRef,
  shouldPreferWebGpu,
}: {
  readonly graphicsRef: ActorRefFrom<typeof graphicsMachine>;
  readonly shouldPreferWebGpu: boolean;
}): React.JSX.Element {
  const canvasRef = useSelector(graphicsRef, (snapshot) => snapshot.context.canvas?.ref);
  const backend = useSelector(canvasRef, selectCanvasBackend);
  const label =
    backend === 'webgpu'
      ? 'Using WebGPU.'
      : backend === 'webgl'
        ? shouldPreferWebGpu
          ? 'Using WebGL2 fallback.'
          : 'Using WebGL2.'
        : 'No active 3D viewer.';
  return (
    <span role='status' className='text-xs text-muted-foreground'>
      {label}
    </span>
  );
}

function RendererStatus({ shouldPreferWebGpu }: { readonly shouldPreferWebGpu: boolean }): React.JSX.Element {
  /* Settings is in the shell, outside the focused project's view: it reads the focused session (A11). */
  const runtime = useFocusedProjectSession()?.runtime;
  return runtime ? (
    <FocusedRendererStatus source={runtime} shouldPreferWebGpu={shouldPreferWebGpu} />
  ) : (
    <NoActiveViewer />
  );
}

function FocusedRendererStatus({
  source,
  shouldPreferWebGpu,
}: {
  readonly source: ProjectRuntimeViewSource;
  readonly shouldPreferWebGpu: boolean;
}): React.JSX.Element {
  const projectRef = useSelector(source.runtime.actor, selectProjectRef);
  const viewGraphics = useSelector(projectRef, (state) => state.context.viewGraphics);
  const mainEntryPath = useSelector(projectRef, (state) => state.context.mainEntryPath);
  const { viewEntryPaths } = useSyncExternalStore(
    source.viewRecords.subscribe,
    source.viewRecords.getSnapshot,
    source.viewRecords.getSnapshot,
  );
  const graphicsRef = findEntryGraphics(viewGraphics, viewEntryPaths, mainEntryPath);
  return graphicsRef ? (
    <ActiveRendererStatus graphicsRef={graphicsRef} shouldPreferWebGpu={shouldPreferWebGpu} />
  ) : (
    <NoActiveViewer />
  );
}

function NoActiveViewer(): React.JSX.Element {
  return (
    <span role='status' className='text-xs text-muted-foreground'>
      No active 3D viewer.
    </span>
  );
}

function FlagRow({ flag }: { readonly flag: FeatureFlagName }): React.JSX.Element | undefined {
  const flags = useFeatureFlags();
  const setFlag = useSetFeatureFlag();
  const definition = flagRegistry[flag];
  const id = useId();

  // The row's text labels the switch, so the whole row is its target: the bare switch alone is too small to tap.
  return (
    <SettingsRow
      settingId={`flag-${flag}`}
      title={
        <label htmlFor={id} className='cursor-action'>
          {definition.label}
        </label>
      }
      description={
        <span className='flex flex-col gap-0.5'>
          <label htmlFor={id} className='cursor-action'>
            {definition.description}
          </label>
          {flag === 'webGpu' ? <RendererStatus shouldPreferWebGpu={flags.webGpu} /> : null}
        </span>
      }
      control={
        <Switch
          id={id}
          aria-label={definition.label}
          checked={flags[flag]}
          onCheckedChange={(checked) => {
            setFlag(flag, checked);
          }}
        />
      }
    />
  );
}

export function ExperimentalSettings(): React.JSX.Element {
  return (
    <div className='flex flex-col gap-6 pb-6'>
      <SettingsGroup>
        {experimentalFeatureFlagNames.map((flag) => (
          <FlagRow key={flag} flag={flag} />
        ))}
      </SettingsGroup>
    </div>
  );
}
