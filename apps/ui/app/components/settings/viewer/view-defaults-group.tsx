/**
 * The View defaults group (onboarding blueprint, Finding 6, V4): the person's own value for each of the nine
 * inheritable leaves. Every view that does not set a leaf shows this value; no view file is written. A set leaf shows
 * the modified dot, which removes it; "Reset all" removes every leaf and is disabled when none is set.
 */
import { useState } from 'react';
import { resetLeaf } from '@taucad/preferences';
import type { LeafPatch, PersonalViewDefaults, ViewerPreferences } from '@taucad/preferences';
import { lengthUnits, tauViewDefaults } from '@taucad/workbench';
import type { LengthUnit } from '@taucad/workbench';
import { lengthUnitOptions } from '@taucad/viewer/constants/length-units';
import { Button } from '@taucad/ui/components/button';
import { ModifiedIndicator } from '@taucad/ui/components/modified-indicator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@taucad/ui/components/select';
import { Slider } from '@taucad/ui/components/slider';
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
  ['display.surfaces', 'viewer-surfaces'],
  ['display.lines', 'viewer-edges'],
  ['display.gizmo', 'viewer-show-gizmo'],
  ['display.grid', 'viewer-grid'],
  ['display.axes', 'viewer-axes'],
  ['display.matcap', 'viewer-matcap'],
  ['display.postProcessing', 'viewer-post-processing'],
  ['grid.unit', 'viewer-grid-unit'],
] as const satisfies ReadonlyArray<readonly [ViewDefaultLeaf, SettingId]>;

type SwitchLeaf = Extract<ViewDefaultLeaf, `display.${string}`>;

/** The perspective angle Perspective returns to: the last one held in this session, or Tau's 60°. */
let sessionPerspectiveAngle: number | undefined;
const fallbackPerspectiveAngle = 60;
const minPerspectiveAngle = 10;
const maxPerspectiveAngle = 90;

/** Forget the session's perspective angle. Tests only. */
export const resetSessionPerspectiveAngleForTesting = (): void => {
  sessionPerspectiveAngle = undefined;
};

function ProjectionControl({
  value,
  onChange,
}: {
  readonly value: number;
  readonly onChange: (value: number) => void;
}): React.JSX.Element {
  const isPerspective = value > 0;
  /* A drag shows its angle at once and stores the angle it settles on, so one drag is one write. */
  const [dragAngle, setDragAngle] = useState<number>();
  const shownAngle = dragAngle ?? value;
  return (
    <span className='flex max-w-full min-w-0 flex-wrap items-center justify-end gap-2'>
      {isPerspective ? (
        <span className='flex items-center gap-2'>
          <Slider
            value={[shownAngle]}
            min={minPerspectiveAngle}
            max={maxPerspectiveAngle}
            step={1}
            aria-label='Field of view'
            className='w-28'
            onValueChange={([next]) => {
              setDragAngle(next);
            }}
            onValueCommit={([next]) => {
              setDragAngle(undefined);
              if (next !== undefined) {
                sessionPerspectiveAngle = next;
                onChange(next);
              }
            }}
          />
          <span className='w-8 text-right text-xs text-muted-foreground tabular-nums'>{shownAngle}°</span>
        </span>
      ) : undefined}
      <Select
        size='sm'
        value={isPerspective ? 'perspective' : 'orthographic'}
        onValueChange={(next) => {
          if (next === 'orthographic') {
            if (isPerspective) {
              sessionPerspectiveAngle = value;
            }
            onChange(0);
            return;
          }
          if (!isPerspective) {
            onChange(sessionPerspectiveAngle ?? fallbackPerspectiveAngle);
          }
        }}
      >
        <SelectTrigger className='w-36 max-w-full' aria-label={viewDefaultCopy.fieldOfView.title}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value='perspective'>Perspective</SelectItem>
          <SelectItem value='orthographic'>Orthographic</SelectItem>
        </SelectContent>
      </Select>
    </span>
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
      size='sm'
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
