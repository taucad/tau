/**
 * The View defaults group (onboarding blueprint, Finding 6, V4): the person's own value for the inheritable leaves a
 * person picks a default for. Every view that does not set a leaf shows this value; no view file is written. A set leaf shows
 * the modified dot, which removes it; "Reset all" removes every leaf and is disabled when none is set.
 */
import { useState } from 'react';
import { Aperture } from 'lucide-react';
import { resetLeaf } from '@taucad/preferences';
import type { LeafPatch, PersonalViewDefaults, ViewerPreferences } from '@taucad/preferences';
import { lengthUnits, tauViewDefaults } from '@taucad/workbench';
import type { LengthUnit } from '@taucad/workbench';
import { lengthUnitOptions } from '@taucad/viewer/constants/length-units';
import { Button } from '@taucad/ui/components/button';
import { ModifiedIndicator } from '@taucad/ui/components/modified-indicator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@taucad/ui/components/select';
import { SliderInput } from '@taucad/ui/components/slider-input';
import { Switch } from '@taucad/ui/components/switch';
import type { SettingId } from '#components/settings/settings-registry.js';
import { SettingsGroup, SettingsRow } from '#components/settings/settings-item.js';
import {
  resetToTauDefault,
  viewDefaultCopy,
  viewDefaultsInfo,
} from '#components/settings/viewer/viewer-settings-copy.js';
import type { ViewDefaultLeaf } from '#components/settings/viewer/viewer-settings-copy.js';
import type { SectionWriteResult } from '#preferences/section-store.js';
import { useOnboardingTelemetry } from '#telemetry/onboarding-telemetry.js';

/** The rows in order, with their registry ids. */
const rows = [
  ['fieldOfView', 'viewer-projection'],
  ['display.gizmo', 'viewer-show-gizmo'],
  ['display.grid', 'viewer-grid'],
  ['display.axes', 'viewer-axes'],
  ['display.matcap', 'viewer-matcap'],
  ['grid.unit', 'viewer-grid-unit'],
] as const satisfies ReadonlyArray<readonly [ViewDefaultLeaf, SettingId]>;

type SwitchLeaf = Extract<ViewDefaultLeaf, `display.${string}`>;

/** The widest field of view in degrees; 0° is orthographic. The editor's Viewer settings uses the same range. */
const maxFieldOfView = 90;

/** A settings control's height and border around the slider; the label is muted, as in the editor's row. */
const projectionFieldClassName =
  'h-7 w-48 max-w-full rounded-md border border-input bg-background px-2.5 text-sm tabular-nums shadow-xs [&_[data-slot=slider-input-leading]]:text-muted-foreground';

/**
 * The editor's field-of-view control: one slider from 0° (orthographic) to 90°. Drag, click to type, or step with the
 * arrow keys. A drag shows its angle at once and stores the angle it settles on, so one drag is one write.
 */
function ProjectionControl({
  value,
  onChange,
}: {
  readonly value: number;
  readonly onChange: (value: number) => void;
}): React.JSX.Element {
  const [dragAngle, setDragAngle] = useState<number>();
  const shownAngle = dragAngle ?? value;
  const commit = (next: number): void => {
    setDragAngle(undefined);
    const angle = Math.min(Math.max(Math.round(next), 0), maxFieldOfView);
    if (angle !== value) {
      onChange(angle);
    }
  };
  return (
    <SliderInput
      value={shownAngle}
      min={0}
      max={maxFieldOfView}
      step={1}
      leadingContent={
        <>
          <Aperture aria-hidden='true' className='size-4 shrink-0' />
          <span>{shownAngle === 0 ? 'Orthographic' : 'Field of view'}</span>
        </>
      }
      trailingAdornment={
        <span aria-hidden='true' className='ml-0.5 text-muted-foreground'>
          °
        </span>
      }
      className={projectionFieldClassName}
      aria-label={viewDefaultCopy.fieldOfView.title}
      aria-valuetext={`${shownAngle}°`}
      onScrubChange={setDragAngle}
      onScrubCommit={commit}
      onScrubCancel={() => {
        setDragAngle(undefined);
      }}
      onInputCommit={commit}
    />
  );
}

function GridUnitControl({
  value,
  onChange,
}: {
  readonly value: LengthUnit;
  readonly onChange: (value: LengthUnit) => void;
}): React.JSX.Element {
  return (
    <Select
      size='md'
      value={value}
      onValueChange={(next) => {
        const unit = lengthUnits.find((each) => each === next);
        if (unit !== undefined) {
          onChange(unit);
        }
      }}
    >
      <SelectTrigger className='w-36 max-w-full' aria-label={viewDefaultCopy['grid.unit'].title}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {lengthUnitOptions.map((option) => (
          <SelectItem key={option.symbol} value={option.symbol}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * The View defaults group.
 *
 * @param props - The person's viewer preferences, their writer, and where to report what each write did.
 * @returns The group.
 */
export function ViewDefaultsGroup({
  viewer,
  writeViewer,
  onWrite,
}: {
  readonly viewer: ViewerPreferences;
  readonly writeViewer: (patch: LeafPatch<ViewerPreferences>) => SectionWriteResult;
  readonly onWrite: (result: SectionWriteResult) => void;
}): React.JSX.Element {
  const telemetry = useOnboardingTelemetry();
  const defaults = viewer.viewDefaults;
  const setLeaves = Object.keys(defaults).filter(
    (leaf) => defaults[leaf as ViewDefaultLeaf] !== undefined,
  ) as ViewDefaultLeaf[];

  const write = (viewDefaults: LeafPatch<PersonalViewDefaults>): void => {
    onWrite(writeViewer({ viewDefaults }));
  };
  const setLeaf = <Leaf extends ViewDefaultLeaf>(leaf: Leaf, value: NonNullable<PersonalViewDefaults[Leaf]>): void => {
    write({ [leaf]: value } as LeafPatch<PersonalViewDefaults>);
    telemetry.viewerDefaultChanged({ level: 'person', field: leaf });
  };
  const resetLeaves = (leaves: readonly ViewDefaultLeaf[]): void => {
    write(Object.fromEntries(leaves.map((leaf) => [leaf, resetLeaf])) as LeafPatch<PersonalViewDefaults>);
    for (const leaf of leaves) {
      telemetry.viewerOverrideReset({ level: 'person', field: leaf });
    }
  };

  const controlOf = (leaf: ViewDefaultLeaf): React.ReactNode => {
    if (leaf === 'fieldOfView') {
      return (
        <ProjectionControl
          value={defaults.fieldOfView ?? tauViewDefaults.fieldOfView}
          onChange={(value) => {
            setLeaf('fieldOfView', value);
          }}
        />
      );
    }
    if (leaf === 'grid.unit') {
      return (
        <GridUnitControl
          value={defaults['grid.unit'] ?? tauViewDefaults['grid.unit']}
          onChange={(value) => {
            setLeaf('grid.unit', value);
          }}
        />
      );
    }
    const switchLeaf: SwitchLeaf = leaf;
    return (
      <Switch
        aria-label={viewDefaultCopy[switchLeaf].title}
        checked={defaults[switchLeaf] ?? tauViewDefaults[switchLeaf]}
        onCheckedChange={(checked) => {
          setLeaf(switchLeaf, checked);
        }}
      />
    );
  };

  return (
    <SettingsGroup
      title='View defaults'
      info={viewDefaultsInfo}
      action={
        <Button
          variant='ghost'
          size='xs'
          disabled={setLeaves.length === 0}
          onClick={() => {
            resetLeaves(setLeaves);
          }}
        >
          Reset all
        </Button>
      }
    >
      {rows.map(([leaf, settingId]) => (
        <SettingsRow
          key={leaf}
          settingId={settingId}
          title={viewDefaultCopy[leaf].title}
          description={viewDefaultCopy[leaf].description}
          control={
            <>
              {defaults[leaf] === undefined ? undefined : (
                <ModifiedIndicator
                  tooltip={resetToTauDefault}
                  onReset={() => {
                    resetLeaves([leaf]);
                  }}
                />
              )}
              {controlOf(leaf)}
            </>
          }
        />
      ))}
    </SettingsGroup>
  );
}
