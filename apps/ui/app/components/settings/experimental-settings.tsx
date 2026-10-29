import { useSelector } from '@xstate/react';
import type { ActorRefFrom } from 'xstate';
import type { graphicsMachine } from '@taucad/viewer/machines/graphics.machine';
import { findEntryGraphics } from '@taucad/workbench-panes/units/geometry-units';
import { useProject } from '#hooks/use-project.js';
import { SettingsItem, SettingsSectionCard } from '#components/settings/settings-item.js';
import { FlaskConical } from 'lucide-react';
import { CardContent, CardHeader, CardTitle } from '@taucad/ui/components/card';
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
  const backend = useSelector(graphicsRef, (snapshot) => snapshot.context.activeRenderer?.backend);
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
  const project = useProject({ enableNoContext: true });
  const graphicsRef = project
    ? findEntryGraphics(project.viewGraphics, project.viewEntryPaths, project.mainEntryPath)
    : undefined;
  return graphicsRef ? (
    <ActiveRendererStatus graphicsRef={graphicsRef} shouldPreferWebGpu={shouldPreferWebGpu} />
  ) : (
    <span role='status' className='text-xs text-muted-foreground'>
      No active 3D viewer.
    </span>
  );
}

function FlagRow({ flag }: { readonly flag: FeatureFlagName }): React.JSX.Element {
  const flags = useFeatureFlags();
  const setFlag = useSetFeatureFlag();
  const definition = flagRegistry[flag];

  return (
    <SettingsItem settingId={`flag-${flag}`}>
      {/* The whole row is the switch's target: the bare switch alone is too small to tap. */}
      <label className='flex items-center justify-between gap-4'>
        <span className='flex flex-col gap-0.5'>
          <span className='text-sm font-medium'>{definition.label}</span>
          <span className='text-xs text-muted-foreground'>{definition.description}</span>
          {flag === 'webGpu' ? <RendererStatus shouldPreferWebGpu={flags.webGpu} /> : null}
        </span>
        <Switch
          aria-label={definition.label}
          checked={flags[flag]}
          onCheckedChange={(checked) => {
            setFlag(flag, checked);
          }}
        />
      </label>
    </SettingsItem>
  );
}

export function ExperimentalSettings(): React.JSX.Element {
  return (
    <div className='flex flex-col gap-6 pb-6'>
      <SettingsSectionCard>
        <CardHeader>
          <CardTitle className='flex items-center gap-2'>
            <FlaskConical className='size-4' />
            Feature Flags
          </CardTitle>
        </CardHeader>
        <CardContent className='flex flex-col gap-4'>
          {experimentalFeatureFlagNames.map((flag) => (
            <FlagRow key={flag} flag={flag} />
          ))}
        </CardContent>
      </SettingsSectionCard>
    </div>
  );
}
