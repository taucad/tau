import { Fragment, useId } from 'react';
import type { DeviceRecord, MousePresetId, PersonProfile, ViewerPreferences } from '@taucad/preferences';
import {
  effectiveGizmoStyle,
  effectivePreset,
  familiarProducts,
  gizmoStyleIds,
  mousePresetIds,
  suggestedPreset,
} from '@taucad/preferences';
import { resolveCameraMapping } from '@taucad/viewer/graphics/three/controls/camera-presets';
import type { CameraMappingId } from '@taucad/viewer/graphics/three/controls/camera-presets';
import { RadioGroup, RadioGroupItem } from '@taucad/ui/components/radio-group';
import { Switch } from '@taucad/ui/components/switch';
import { ToggleGroup, ToggleGroupItem } from '@taucad/ui/components/toggle-group';
import {
  familiarFromText,
  gestureCopy,
  gizmoCopy,
  presetCopy,
  viewerStepCopy,
} from '#components/onboarding/setup-copy.js';
import type { GizmoChoiceId } from '#components/onboarding/setup-copy.js';
import { gizmoChoice, legendBindings, presetReason } from '#components/onboarding/setup-model.js';
import { SetupViewerPreview } from '#components/onboarding/setup-viewer-preview.js';
import { resolveViewerCameraInput } from '#routes/w.$workspace.$project/use-viewer-camera-input.js';

/** What step 3 reads and writes. */
export type SetupViewerStepProps = Readonly<{
  profile: PersonProfile;
  viewer: ViewerPreferences;
  device: DeviceRecord;
  onPresetChange: (preset: MousePresetId) => void;
  onGizmoChange: (choice: GizmoChoiceId) => void;
  onTrackpadChange: (isTrackpad: boolean) => void;
}>;

const gizmoChoices: readonly GizmoChoiceId[] = [...gizmoStyleIds, 'none'];

const isPresetId = (value: string): value is MousePresetId => (mousePresetIds as readonly string[]).includes(value);
const isGizmoChoice = (value: string): value is GizmoChoiceId => (gizmoChoices as readonly string[]).includes(value);

/**
 * The binding legend: orbit, pan and zoom as key caps rendered from the preset data, then the bindings every preset
 * shares.
 *
 * @param properties - The mapping in effect.
 * @returns The legend.
 */
export function BindingLegend({ mapping }: { readonly mapping: CameraMappingId }): React.JSX.Element {
  const bindings = legendBindings(mapping);
  return (
    <dl
      className='grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-4 gap-y-2 text-xs'
      aria-label={viewerStepCopy.legendLabel}
      data-testid='setup-binding-legend'
    >
      {(['orbit', 'pan', 'zoom'] as const).map((gesture) => (
        <Fragment key={gesture}>
          <dt className='font-medium'>{gestureCopy[gesture]}</dt>
          <dd className='flex flex-wrap items-center gap-x-2 gap-y-1' data-testid={`setup-legend-${gesture}`}>
            {bindings[gesture].map((keys, position) => (
              <Fragment key={keys.join('+')}>
                {position > 0 ? <span className='text-muted-foreground'>{viewerStepCopy.or}</span> : null}
                <span className='inline-flex items-center gap-1 whitespace-nowrap'>
                  {keys.map((key, index) => (
                    <Fragment key={key}>
                      {index > 0 ? (
                        <span className='text-muted-foreground' aria-hidden='true'>
                          +
                        </span>
                      ) : null}
                      <kbd className='rounded-md border bg-muted px-1.5 py-0.5 font-sans text-xs text-foreground'>
                        {key}
                      </kbd>
                    </Fragment>
                  ))}
                </span>
              </Fragment>
            ))}
          </dd>
        </Fragment>
      ))}
      <dt className='font-medium'>{viewerStepCopy.legendAlways}</dt>
      <dd className='text-muted-foreground'>{viewerStepCopy.legendAlwaysText}</dd>
    </dl>
  );
}

/**
 * Step 3: the mouse preset and gizmo, preselected from the tool answer, the trackpad switch, the
 * binding legend and the preview. Choosing a preset stores `viewer.controls.preset`, a style `viewer.gizmo.style`,
 * None `viewDefaults['display.gizmo'] = false`, and the switch the device's `inputDevice`.
 *
 * @param properties - The record and its writers.
 * @returns The step's content.
 */
export function SetupViewerStep({
  profile,
  viewer,
  device,
  onPresetChange,
  onGizmoChange,
  onTrackpadChange,
}: SetupViewerStepProps): React.JSX.Element {
  const id = useId();
  const preset = effectivePreset(viewer, profile);
  const suggestion = suggestedPreset(profile.tool);
  const gizmo = gizmoChoice(viewer, profile);
  const isTrackpad = device.inputDevice === 'trackpad';
  const mapping = resolveCameraMapping({ preset, inputDevice: device.inputDevice });
  /* The preview moves as every open viewer will: the same resolution the project viewer uses. */
  const navigation = resolveViewerCameraInput({ enabled: true, profile, viewer, device });
  return (
    <div className='grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]'>
      <div className='flex min-w-0 flex-col gap-5'>
        <fieldset className='flex min-w-0 flex-col gap-2'>
          <legend className='mb-2 text-sm font-medium'>{viewerStepCopy.mouseControls}</legend>
          <RadioGroup
            value={preset}
            onValueChange={(value) => {
              if (isPresetId(value)) {
                onPresetChange(value);
              }
            }}
            className='gap-1.5'
          >
            {mousePresetIds.map((option) => (
              <label
                key={option}
                className='flex items-start gap-3 rounded-lg border bg-card px-3 py-2.5 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-accent/40'
              >
                <RadioGroupItem value={option} className='mt-0.5' aria-describedby={`${id}-${option}`} />
                <span className='flex min-w-0 flex-col gap-0.5'>
                  <span className='flex flex-wrap items-center gap-2 text-sm font-medium'>
                    {presetCopy[option].name}
                  </span>
                  <span id={`${id}-${option}`} className='text-xs text-muted-foreground'>
                    {familiarFromText(familiarProducts(option))}
                  </span>
                </span>
              </label>
            ))}
          </RadioGroup>
          <p className='text-xs text-muted-foreground' data-testid='setup-preset-reason'>
            {isTrackpad ? viewerStepCopy.trackpadNote : null}
            {!isTrackpad && preset === suggestion ? presetReason(profile.tool) : null}
            {!isTrackpad && preset !== suggestion ? familiarFromText(familiarProducts(preset)) : null}
          </p>
        </fieldset>

        <label className='flex items-center justify-between gap-4'>
          <span className='flex min-w-0 flex-col gap-0.5'>
            <span className='text-sm font-medium'>{viewerStepCopy.trackpad}</span>
            <span className='text-xs text-muted-foreground'>{viewerStepCopy.trackpadHint}</span>
          </span>
          <Switch checked={isTrackpad} onCheckedChange={onTrackpadChange} aria-label={viewerStepCopy.trackpad} />
        </label>

        <div className='flex min-w-0 flex-col gap-2'>
          <span id={`${id}-gizmo`} className='text-sm font-medium'>
            {viewerStepCopy.gizmo}
          </span>
          <ToggleGroup
            type='single'
            variant='outline'
            value={gizmo}
            onValueChange={(value) => {
              if (isGizmoChoice(value)) {
                onGizmoChange(value);
              }
            }}
            aria-labelledby={`${id}-gizmo`}
            className='flex-wrap justify-start'
          >
            {gizmoChoices.map((option) => (
              <ToggleGroupItem key={option} value={option} className='h-8 text-xs'>
                {gizmoCopy[option].name}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <p className='text-xs text-muted-foreground'>{gizmoCopy[gizmo].hint}</p>
        </div>
      </div>

      <div className='flex min-w-0 flex-col gap-4'>
        <SetupViewerPreview
          mapping={mapping}
          cameraInput={navigation.cameraInput ?? { preset }}
          gizmoStyle={navigation.gizmoStyle ?? effectiveGizmoStyle(viewer, profile)}
          isGizmoShown={gizmo !== 'none'}
        />
        <BindingLegend mapping={mapping} />
      </div>
    </div>
  );
}
