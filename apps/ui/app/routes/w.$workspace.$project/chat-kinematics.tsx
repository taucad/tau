import { useCallback, useContext, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { ChevronDown, CircleAlert, OctagonAlert, Pause, Play, Rotate3d, RotateCcw } from 'lucide-react';
import { useSelector } from '@xstate/react';
import type { ActorRefFrom } from 'xstate';
import type { DockviewPanelApi, PaneviewApi, PaneviewPanelApi } from 'dockview-react';
import { PaneviewReact } from 'dockview-react';
import { convert, createQuantity, quantityKinds } from '@taucad/units/quantity';
import type { DegreeOfFreedom, Mechanism } from '@taucad/kinematics';
import type { KernelIssue } from '@taucad/runtime';
import { cn } from '@taucad/ui/utils/cn';
import { useProject } from '#hooks/use-project.js';
import { SearchInput } from '#components/search-input.js';
import { Loader } from '#components/ui/loader.js';
import { PaneButton } from '#components/ui/pane-button.js';
import { PanelEmptyState } from '#components/ui/panel-empty-state.js';
import { ComboBoxResponsive } from '#components/ui/combobox-responsive.js';
import { ParametersNumberField } from '#components/geometry/parameters/parameters-number-field.js';
import { useReducedMotion } from '#components/geometry/loader/metal-morph-playback-gates.js';
import {
  PaneviewHeader,
  paneviewAttachedBodyClassName,
  paneviewAttachedSurfaceStyleOverrides,
  paneviewHeaderSize,
} from '#components/panes/paneview-header.js';
import type { cadMachine } from '#machines/cad.machine.js';
import type { graphicsMachine } from '#machines/graphics.machine.js';
import { deriveModelInteractionUnitId } from '#machines/model-interaction.machine.js';
import { getKinematicsDragNotice, getKinematicsUnitState, sweepAnimationId } from '#machines/kinematics.machine.js';
import type { KinematicsDragNotice, KinematicsUnitState, kinematicsMachine } from '#machines/kinematics.machine.js';
import { sortGeometryUnitEntries } from '#routes/w.$workspace.$project/geometry-unit.utils.js';
import { WorkspaceLanesContext } from '#routes/w.$workspace.$project/project-workspace-context.js';

type GraphicsRef = ActorRefFrom<typeof graphicsMachine>;
type CadRef = ActorRefFrom<typeof cadMachine>;
type KinematicsRef = ActorRefFrom<typeof kinematicsMachine>;

/**
 * The pane shows angles in degrees and lengths in millimetres, whatever the mechanism's units. A joint without
 * limits is never clamped: it scrubs a window of ±`extent` centred on its current value.
 */
const displayByKind = {
  angle: { unit: 'deg', symbol: '°', step: 1, extent: 360 },
  distance: { unit: 'mm', symbol: 'mm', step: 0.1, extent: 100 },
} as const;

const playbackSpeeds = [0.25, 0.5, 1, 2, 4] as const;

const blockedReasonCopy: Record<KinematicsDragNotice, string> = {
  limit: 'a joint reached its limit',
  singular: 'the mechanism is at a singular pose',
  budget: 'the solver ran out of iterations',
};

/** The replicad kernel reports a rejected mechanism as a warning whose `details.mechanism` holds the reason. */
const isMechanismIssue = (issue: KernelIssue): boolean =>
  typeof issue.details === 'object' && issue.details !== null && 'mechanism' in issue.details;

const mechanismUnit = (dof: DegreeOfFreedom, mechanism: Mechanism): string =>
  dof.kind === 'angle' ? mechanism.units.angle : mechanism.units.length;

const convertCoordinate = ({
  value,
  kind,
  from,
  to,
}: Readonly<{ value: number; kind: DegreeOfFreedom['kind']; from: string; to: string }>): number => {
  if (from === to) {
    return value;
  }
  const quantity = createQuantity({
    value,
    unit: from,
    kind: kind === 'angle' ? quantityKinds.planeAngle : quantityKinds.length,
    space: 'linear',
  });
  const converted = quantity.status === 'success' ? convert({ quantity: quantity.value, to }) : quantity;
  if (converted.status !== 'success' || typeof converted.value.value !== 'number') {
    throw new Error(
      converted.status === 'success' ? 'Coordinate conversion was not numeric.' : converted.diagnostic.message,
    );
  }
  return converted.value.value;
};

const formatNumber = (value: number): string => String(Math.round(value * 100) / 100);

/** Four significant digits, so a worm's −1/30 reads −0.03333 rather than −0.03. */
const formatRatio = (value: number): string => String(Number(value.toPrecision(4)));

const capitalize = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

const plural = (count: number, noun: string): string => `${count} ${noun}${count === 1 ? '' : 's'}`;

const dofLabel = (dof: DegreeOfFreedom): string =>
  dof.id === dof.jointId ? dof.jointId : `${dof.jointId} ${dof.id.slice(dof.jointId.length + 1)}`;

/** `= ratio × driver + offset` in display units, or `= curve of driver` for a sampled curve. */
const describeCoupling = (dof: DegreeOfFreedom, dofs: readonly DegreeOfFreedom[], mechanism: Mechanism): string => {
  const { coupling } = dof;
  const driver = dofs.find((candidate) => candidate.id === coupling?.driver);
  if (coupling === undefined || driver === undefined) {
    return '';
  }
  if ('curve' in coupling) {
    return `= curve of ${dofLabel(driver)}`;
  }
  const toDisplay = (value: number, of: DegreeOfFreedom) =>
    convertCoordinate({ value, kind: of.kind, from: mechanismUnit(of, mechanism), to: displayByKind[of.kind].unit });
  const ratio = toDisplay(coupling.ratio, dof) / toDisplay(1, driver);
  const offset = coupling.offset
    ? ` + ${formatNumber(toDisplay(coupling.offset, dof))} ${displayByKind[dof.kind].symbol}`
    : '';
  return `= ${formatRatio(ratio)} × ${dofLabel(driver)}${offset}`;
};

const noop = (): void => undefined;

function JointRow({
  dof,
  mechanism,
  value,
  isAtLimit,
  relation,
  onCommit,
}: {
  readonly dof: DegreeOfFreedom;
  readonly mechanism: Mechanism;
  readonly value: number;
  readonly isAtLimit: boolean;
  readonly relation?: string;
  /** Absent for followers, which are derived and read-only. */
  readonly onCommit?: (id: string, value: number) => void;
}): React.JSX.Element {
  const display = displayByKind[dof.kind];
  const unit = mechanismUnit(dof, mechanism);
  const toDisplay = (next: number) => convertCoordinate({ value: next, kind: dof.kind, from: unit, to: display.unit });
  const { limits } = dof;
  const displayValue = toDisplay(value);
  const min = limits ? toDisplay(limits.lower) : displayValue - display.extent;
  const max = limits ? toDisplay(limits.upper) : displayValue + display.extent;
  const label = dofLabel(dof);
  const withSymbol = (next: number) => `${formatNumber(next)}${display.symbol === '°' ? '' : ' '}${display.symbol}`;
  const details = [
    `${capitalize(mechanism.joints[dof.jointId]?.type ?? 'fixed')} joint · ${dof.role}`,
    ...(relation ? [relation] : []),
    limits ? `Range ${withSymbol(min)} to ${withSymbol(max)}` : 'Unlimited range',
  ];
  const scrubStart = useRef<number | undefined>(undefined);

  const commit = (next: number): void => {
    onCommit?.(dof.id, convertCoordinate({ value: next, kind: dof.kind, from: display.unit, to: unit }));
  };

  return (
    <div data-slot='kinematics-joint' className='@container/parameter my-1.5 px-2.5'>
      <div className='flex min-w-0 flex-col gap-1 @[240px]/parameter:flex-row @[240px]/parameter:items-start @[240px]/parameter:gap-2'>
        <span className='min-w-0 shrink-0 truncate text-sm leading-6 @[240px]/parameter:w-[40%]'>{label}</span>
        <div
          data-testid={`kinematics-dof-${dof.id}`}
          className='flex min-w-0 flex-1 flex-col gap-0.5'
          onKeyDown={(event) => {
            // Spin-button keys: unmodified Home and End jump to a limited joint's limits; arrows step in SliderInput.
            const isRangeEndKey =
              (event.key === 'Home' || event.key === 'End') &&
              !event.shiftKey &&
              !event.ctrlKey &&
              !event.altKey &&
              !event.metaKey;
            if (onCommit !== undefined && limits !== undefined && isRangeEndKey) {
              event.preventDefault();
              commit(event.key === 'Home' ? min : max);
            }
          }}
        >
          <ParametersNumberField
            value={displayValue}
            formattedValue={formatNumber(displayValue)}
            unit={display.symbol}
            details={details}
            rangeMin={min}
            rangeMax={max}
            step={display.step}
            isReadOnly={onCommit === undefined}
            aria-label={label}
            diagnostic={isAtLimit ? (dof.role === 'driver' ? 'At limit' : 'Outside its limits') : undefined}
            // A range track would claim bounds an unlimited joint does not have.
            className={limits ? undefined : '[&_[data-slot=slider-input-fill]]:hidden'}
            onSliderChange={(next) => {
              scrubStart.current ??= displayValue;
              commit(next);
            }}
            onSliderRelease={(next) => {
              scrubStart.current = undefined;
              commit(next);
            }}
            onSliderCancel={() => {
              if (scrubStart.current !== undefined) {
                commit(scrubStart.current);
                scrubStart.current = undefined;
              }
            }}
            onValueChange={commit}
            onTextChange={noop}
            onFocusChange={noop}
          />
        </div>
      </div>
    </div>
  );
}

type PickerItem = Readonly<{ id: string; label: string }>;

const getPickerValue = (item: PickerItem): string => item.id;

const playbackSpeedGroups = [
  { name: 'Speed', items: playbackSpeeds.map((speed): PickerItem => ({ id: String(speed), label: `${speed}×` })) },
];

const renderAnimationItem = (item: PickerItem): React.JSX.Element => (
  <span
    data-testid={`kinematics-animation-${item.id === sweepAnimationId ? 'sweep' : item.id}`}
    className='truncate text-sm'
  >
    {item.label}
  </span>
);

const renderSpeedItem = (item: PickerItem): React.JSX.Element => (
  <span className='text-sm tabular-nums'>{item.label}</span>
);

function KinematicsToolbar({
  kinematicsRef,
  unitId,
  unit,
}: {
  readonly kinematicsRef: KinematicsRef;
  readonly unitId: string;
  readonly unit: KinematicsUnitState;
}): React.JSX.Element {
  const { playback, mechanism, degreesOfFreedom } = unit;
  const isPlaying = playback.status === 'playing';
  const isReducedMotion = useReducedMotion();
  // The driver sweep needs a driver, so a mechanism with neither drivers nor clips has nothing to play.
  const hasMotion = (mechanism?.animations?.length ?? 0) > 0 || degreesOfFreedom.some((dof) => dof.role === 'driver');
  const animations = useMemo<PickerItem[]>(
    () => [
      ...(mechanism?.animations ?? []).map(({ id, name }) => ({ id, label: name ?? id })),
      { id: sweepAnimationId, label: 'Sweep drivers' },
    ],
    [mechanism],
  );
  const animationGroups = useMemo(() => [{ name: 'Animations', items: animations }], [animations]);
  const selectedAnimation = animations.find(({ id }) => id === (playback.animationId ?? sweepAnimationId));

  return (
    <div role='group' aria-label='Playback' className='flex min-w-0 flex-wrap items-center gap-1'>
      <PaneButton
        aria-label={isPlaying ? 'Pause' : 'Play'}
        data-testid={isPlaying ? 'kinematics-pause' : 'kinematics-play'}
        tooltip={isPlaying ? 'Pause' : 'Play'}
        disabled={!hasMotion}
        onClick={() => {
          kinematicsRef.send(isPlaying ? { type: 'pause', unitId } : { type: 'play', unitId });
        }}
      >
        {isPlaying ? <Pause aria-hidden /> : <Play aria-hidden />}
      </PaneButton>
      <PaneButton
        aria-label='Reset pose'
        data-testid='kinematics-reset'
        tooltip='Reset to as built'
        onClick={() => {
          kinematicsRef.send({ type: 'reset', unitId });
        }}
      >
        <RotateCcw aria-hidden />
      </PaneButton>
      <ComboBoxResponsive
        groupedItems={animationGroups}
        renderLabel={renderAnimationItem}
        getValue={getPickerValue}
        value={selectedAnimation}
        title='Animation'
        description='Choose the motion to play.'
        isSearchEnabled={animations.length > 5}
        popoverProperties={{ align: 'start', className: 'w-56' }}
        onSelect={(animationId) => {
          // Under reduced motion a choice only selects the clip; Play stays the explicit start.
          kinematicsRef.send(
            isReducedMotion ? { type: 'selectAnimation', unitId, animationId } : { type: 'play', unitId, animationId },
          );
        }}
      >
        <PaneButton
          size='label'
          aria-label={`Animation: ${selectedAnimation?.label ?? ''}`}
          className='min-w-0'
          disabled={!hasMotion}
        >
          <span className='truncate'>{selectedAnimation?.label}</span>
          <ChevronDown aria-hidden className='size-3 opacity-60' />
        </PaneButton>
      </ComboBoxResponsive>
      <ComboBoxResponsive
        groupedItems={playbackSpeedGroups}
        renderLabel={renderSpeedItem}
        getValue={getPickerValue}
        value={playbackSpeedGroups[0]!.items.find(({ id }) => Number(id) === playback.speed)}
        title='Playback speed'
        description='Choose how fast animations play.'
        isSearchEnabled={false}
        popoverProperties={{ align: 'start', className: 'w-28' }}
        onSelect={(speed) => {
          kinematicsRef.send({ type: 'setPlaybackSpeed', unitId, speed: Number(speed) });
        }}
      >
        <PaneButton size='label' aria-label={`Playback speed: ${playback.speed}×`} className='tabular-nums'>
          {playback.speed}×
          <ChevronDown aria-hidden className='size-3 opacity-60' />
        </PaneButton>
      </ComboBoxResponsive>
    </div>
  );
}

const describeStatus = (unit: KinematicsUnitState, isUpdating: boolean, animationLabel: string | undefined): string => {
  if (isUpdating) {
    return 'Model updating. Joints still show the previous render.';
  }
  switch (unit.playback.status) {
    case 'playing': {
      return `Playing ${animationLabel ?? 'driver sweep'}`;
    }
    case 'paused': {
      return `Paused at ${unit.playback.time.toFixed(1)} s`;
    }
    case 'stopped': {
      return 'Ready';
    }
  }
};

/** Live regions stay mounted and empty until they speak: a region created with its message may go unread. */
function KinematicsLiveRegions({
  unit,
  isUpdating,
  isBuilding,
  mechanismIssue,
}: {
  readonly unit: KinematicsUnitState;
  readonly isUpdating: boolean;
  readonly isBuilding: boolean;
  readonly mechanismIssue: KernelIssue | undefined;
}): React.JSX.Element {
  const { mechanism, issues, playback } = unit;
  const dragNotice = getKinematicsDragNotice(unit.drag);
  const animationLabel =
    mechanism?.animations?.find(({ id }) => id === playback.animationId)?.name ?? playback.animationId;

  return (
    <>
      <div
        role='status'
        aria-label='Kinematics status'
        aria-busy={isBuilding || undefined}
        data-testid='kinematics-status'
      >
        {isBuilding ? (
          <PanelEmptyState
            icon={Loader}
            title='Building the model'
            description='Its joints appear here when the build finishes.'
            className='min-h-40'
          />
        ) : null}
        {mechanism === undefined ? null : (
          <p className='px-2.5 pt-1 text-xs text-muted-foreground'>
            {describeStatus(unit, isUpdating, animationLabel)}
          </p>
        )}
      </div>
      <div role='alert' aria-label='Kinematics error'>
        {mechanism === undefined && mechanismIssue !== undefined ? (
          <PanelEmptyState
            icon={OctagonAlert}
            iconClassName='text-feature'
            title='The mechanism could not be loaded'
            description={mechanismIssue.message}
            className='min-h-40'
          />
        ) : null}
        {issues.length > 0 ? (
          <p className='flex items-start gap-1.5 px-2.5 pt-1 text-xs text-muted-foreground'>
            <CircleAlert aria-hidden className='mt-0.5 size-3.5 shrink-0 text-warning' />
            <span>Pose not applied: {issues[0]!.message} The last valid pose is kept.</span>
          </p>
        ) : null}
      </div>
      <div role='status' aria-label='Drag notice'>
        {dragNotice === undefined ? null : (
          <p className='flex items-start gap-1.5 px-2.5 pt-1 text-xs text-muted-foreground'>
            <CircleAlert aria-hidden className='mt-0.5 size-3.5 shrink-0 text-warning' />
            <span>Drag blocked: {blockedReasonCopy[dragNotice]}. The part follows as far as the mechanism allows.</span>
          </p>
        )}
      </div>
    </>
  );
}

function LiveKinematicsUnit({
  entryPath,
  graphicsRef,
  cadRef,
  filterTerm,
  isShown,
}: {
  readonly entryPath: string;
  readonly graphicsRef: GraphicsRef;
  readonly cadRef: CadRef | undefined;
  readonly filterTerm: string;
  /** Whether the pane is on screen; the viewer poses parts under the pointer only then. */
  readonly isShown: boolean;
}): React.JSX.Element {
  const kinematicsRef = useSelector(graphicsRef, (state) => state.context.kinematicsRef);
  const unitId = deriveModelInteractionUnitId({ sourceFile: entryPath });
  const unit = useSelector(kinematicsRef, (state) => getKinematicsUnitState(state.context, unitId));
  const isUpdating = useSelector(cadRef, (state) => state?.hasTag('cad-loading') ?? false);
  const mechanismIssue = useSelector(cadRef, (state) =>
    state?.context.kernelIssues.get(entryPath)?.find((issue) => isMechanismIssue(issue)),
  );
  const headingId = useId();
  const handleCommit = useCallback(
    (id: string, value: number) => {
      kinematicsRef.send({ type: 'setCoordinate', unitId, id, value });
    },
    [kinematicsRef, unitId],
  );

  // Viewer drags are armed while this section shows the unit (the viewer reads `dragEnabled`).
  useEffect(() => {
    if (!isShown) {
      return;
    }
    kinematicsRef.send({ type: 'setDragEnabled', unitId, enabled: true });
    return () => {
      // A closed viewer has already stopped its actor, and any drag with it.
      if (kinematicsRef.getSnapshot().status === 'active') {
        kinematicsRef.send({ type: 'setDragEnabled', unitId, enabled: false });
      }
    };
  }, [isShown, kinematicsRef, unitId]);

  const { mechanism, degreesOfFreedom, pose, atLimit } = unit;
  const isBuilding = mechanism === undefined && mechanismIssue === undefined && isUpdating;
  const term = filterTerm.trim().toLowerCase();
  const visible = degreesOfFreedom.filter((dof) => dofLabel(dof).toLowerCase().includes(term));
  const drivers = visible.filter((dof) => dof.role === 'driver');
  const followers = visible.filter((dof) => dof.role === 'follower');
  const hasDrivers = degreesOfFreedom.some((dof) => dof.role === 'driver');
  const row = (dof: DegreeOfFreedom, loaded: Mechanism) => (
    <JointRow
      key={dof.id}
      dof={dof}
      mechanism={loaded}
      value={pose?.coordinates[dof.id] ?? 0}
      isAtLimit={atLimit.includes(dof.id)}
      relation={dof.role === 'follower' ? describeCoupling(dof, degreesOfFreedom, loaded) : undefined}
      onCommit={dof.role === 'driver' ? handleCommit : undefined}
    />
  );

  return (
    <div className={cn('flex min-h-full flex-col pb-2', paneviewAttachedBodyClassName)}>
      {mechanism === undefined ? null : (
        <div className='flex flex-col gap-1 px-2.5 pt-2'>
          <KinematicsToolbar kinematicsRef={kinematicsRef} unitId={unitId} unit={unit} />
          <p className='text-xs text-muted-foreground'>
            Root {mechanism.root} · {plural(Object.keys(mechanism.links).length, 'link')} ·{' '}
            {plural(Object.keys(mechanism.joints).length, 'joint')}
          </p>
          {hasDrivers ? (
            <p className='text-xs text-muted-foreground'>
              Drag parts in the viewer to move them while this pane is open.
            </p>
          ) : null}
        </div>
      )}
      <KinematicsLiveRegions
        unit={unit}
        isUpdating={isUpdating}
        isBuilding={isBuilding}
        mechanismIssue={mechanismIssue}
      />
      {mechanism === undefined ? (
        isBuilding || mechanismIssue !== undefined ? null : (
          <PanelEmptyState
            icon={Rotate3d}
            title='This model declares no mechanism'
            description={
              <>
                Export a mechanism from the entry file, for example <code>export function mechanism</code>, to move its
                parts here.
              </>
            }
            className='min-h-40'
          />
        )
      ) : (
        <>
          {visible.length === 0 ? (
            <p className='px-2.5 py-2 text-sm text-muted-foreground'>
              {degreesOfFreedom.length === 0
                ? 'No movable joints. Every joint in this mechanism is fixed.'
                : 'No matching joints'}
            </p>
          ) : null}
          {drivers.length > 0 ? (
            <section aria-labelledby={`${headingId}-drivers`}>
              <h3 id={`${headingId}-drivers`} className='px-2.5 pt-2 text-xs font-medium text-muted-foreground'>
                Drivers
              </h3>
              {drivers.map((dof) => row(dof, mechanism))}
            </section>
          ) : null}
          {followers.length > 0 ? (
            <section aria-labelledby={`${headingId}-followers`}>
              <h3 id={`${headingId}-followers`} className='px-2.5 pt-2 text-xs font-medium text-muted-foreground'>
                Followers
              </h3>
              {followers.map((dof) => row(dof, mechanism))}
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}

type KinematicsPanelParams = {
  entryPath: string;
  graphicsRef?: GraphicsRef;
  cadRef?: CadRef;
  filterTerm: string;
  isShown: boolean;
};

function KinematicsPanel({ params }: { readonly params: KinematicsPanelParams }): React.JSX.Element {
  if (params.graphicsRef === undefined) {
    return (
      <div className={cn('min-h-full', paneviewAttachedBodyClassName)}>
        <PanelEmptyState icon={Rotate3d} title='Open renderer to pose this model' className='min-h-16 break-all' />
      </div>
    );
  }
  return (
    <LiveKinematicsUnit
      entryPath={params.entryPath}
      graphicsRef={params.graphicsRef}
      cadRef={params.cadRef}
      filterTerm={params.filterTerm}
      isShown={params.isShown}
    />
  );
}

function KinematicsPanelHeader({
  api,
  params,
}: {
  readonly api: PaneviewPanelApi;
  readonly params: KinematicsPanelParams;
}): React.JSX.Element {
  return <PaneviewHeader api={api} title={params.entryPath} />;
}

const paneviewComponents = { kinematicsPanel: KinematicsPanel };
const paneviewHeaderComponents = { kinematicsHeader: KinematicsPanelHeader };

type KinematicsEntry = readonly [entryPath: string, cadRef: CadRef | undefined, graphicsRef: GraphicsRef | undefined];

// ponytail: expansion is not persisted; a `kinematicsPaneview` panel-state key would add it (editor types/constants).
function KinematicsPaneview({
  entries,
  filterTerm,
  isShown,
}: {
  readonly entries: readonly KinematicsEntry[];
  readonly filterTerm: string;
  readonly isShown: boolean;
}): React.JSX.Element {
  const paneviewApiRef = useRef<PaneviewApi | undefined>(undefined);
  const paneviewKey = entries.map(([entryPath]) => entryPath).join('\0');

  const handleReady = useCallback(
    ({ api }: { api: PaneviewApi }) => {
      paneviewApiRef.current = api;
      for (const [entryPath, cadRef, graphicsRef] of entries) {
        api.addPanel({
          id: entryPath,
          title: entryPath,
          component: 'kinematicsPanel',
          headerComponent: 'kinematicsHeader',
          headerSize: paneviewHeaderSize,
          isExpanded: true,
          minimumBodySize: 80,
          params: { entryPath, cadRef, graphicsRef, filterTerm, isShown } satisfies KinematicsPanelParams,
        });
      }
    },
    [entries, filterTerm, isShown],
  );

  useEffect(() => {
    for (const [entryPath, cadRef, graphicsRef] of entries) {
      paneviewApiRef.current?.getPanel(entryPath)?.api.updateParameters({ cadRef, graphicsRef, filterTerm, isShown });
    }
  }, [entries, filterTerm, isShown]);

  return (
    <PaneviewReact
      key={paneviewKey}
      className={paneviewAttachedSurfaceStyleOverrides}
      components={paneviewComponents}
      headerComponents={paneviewHeaderComponents}
      onReady={handleReady}
    />
  );
}

function KinematicsContent({
  filterTerm,
  isShown,
}: {
  readonly filterTerm: string;
  readonly isShown: boolean;
}): React.JSX.Element {
  const { geometryUnits, mainEntryPath, viewGraphics, editorRef } = useProject();
  const viewSettings = useSelector(editorRef, (state) => state.context.viewSettings);
  // The unit posed here is the one a viewer shows: its graphics actor owns the kinematics actor.
  const entries = useMemo(
    () =>
      sortGeometryUnitEntries([...geometryUnits.entries()], mainEntryPath).map(
        ([entryPath, cadRef]): KinematicsEntry => {
          const graphicsRef = [...viewGraphics].find(([viewId]) => viewSettings[viewId]?.entryPath === entryPath)?.[1];
          return [entryPath, cadRef, graphicsRef];
        },
      ),
    [geometryUnits, mainEntryPath, viewGraphics, viewSettings],
  );

  if (entries.length === 0) {
    return <PanelEmptyState icon={Rotate3d} title='No geometry units' className='min-h-16' />;
  }
  return <KinematicsPaneview entries={entries} filterTerm={filterTerm} isShown={isShown} />;
}

/** The dockview API of the workbench panel hosting the pane; dockview keeps a hidden panel mounted. */
type KinematicsHostPanelApi = Pick<DockviewPanelApi, 'isVisible' | 'onDidVisibilityChange'>;

export function KinematicsPanelBody({ panelApi }: { readonly panelApi?: KinematicsHostPanelApi }): React.JSX.Element {
  const [filterTerm, setFilterTerm] = useState('');
  const subscribeVisibility = useCallback(
    (onChange: () => void) => {
      const subscription = panelApi?.onDidVisibilityChange(onChange);
      return () => {
        subscription?.dispose();
      };
    },
    [panelApi],
  );
  // Without a host panel API the pane counts as shown for as long as it is mounted.
  const isPanelShown = useSyncExternalStore(
    subscribeVisibility,
    () => panelApi?.isVisible ?? true,
    () => true,
  );
  // A hidden workbench lane stays mounted too; pages without lanes always show the workbench.
  const lanes = useContext(WorkspaceLanesContext);
  const isShown = isPanelShown && (lanes?.workbench ?? true);

  return (
    <div
      data-slot='kinematics-panel-body'
      data-testid='kinematics-pane'
      className='flex size-full min-h-0 flex-col overflow-hidden bg-sidebar'
    >
      <div data-slot='kinematics-filter' className='shrink-0 bg-sidebar px-2 pt-2'>
        <SearchInput
          aria-label='Filter joints'
          placeholder='Filter joints...'
          value={filterTerm}
          className='h-7 min-w-0 bg-background'
          onChange={(event) => {
            setFilterTerm(event.target.value);
          }}
          onClear={() => {
            setFilterTerm('');
          }}
        />
      </div>
      <div className='min-h-0 flex-1 overflow-hidden'>
        <KinematicsContent filterTerm={filterTerm} isShown={isShown} />
      </div>
    </div>
  );
}
