import {
  createContext,
  memo,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { ChevronDown, CircleAlert, CopyMinus, CopyPlus, OctagonAlert, Pause, Play, Rotate3d } from 'lucide-react';
import { useSelector } from '@xstate/react';
import type { ActorRefFrom } from 'xstate';
import type { DockviewPanelApi, PaneviewApi, PaneviewPanelApi } from 'dockview-react';
import { PaneviewReact } from 'dockview-react';
import { convert, createQuantity, quantityKinds } from '@taucad/units/quantity';
import type { DegreeOfFreedom, Mechanism } from '@taucad/kinematics';
import type { KernelIssue } from '@taucad/runtime';
import { randomUuid } from '@taucad/utils/id';
import { Button } from '@taucad/ui/components/button';
import { Collapsible, CollapsibleContent } from '@taucad/ui/components/collapsible';
import { cn } from '@taucad/ui/utils/cn';
import { useProject } from '#hooks/use-project.js';
import { SearchInput } from '#components/search-input.js';
import { HighlightText } from '#components/highlight-text.js';
import { Loader } from '#components/ui/loader.js';
import { ModifiedIndicator } from '#components/ui/modified-indicator.js';
import { PaneButton } from '#components/ui/pane-button.js';
import { PanelEmptyState } from '#components/ui/panel-empty-state.js';
import { SliderInput } from '#components/ui/slider-input.js';
import { ComboBoxResponsive } from '#components/ui/combobox-responsive.js';
import { ParameterGroupCard } from '#components/geometry/parameters/parameter-group-card.js';
import { ParametersNumberField } from '#components/geometry/parameters/parameters-number-field.js';
import { useReducedMotion } from '#components/geometry/loader/metal-morph-playback-gates.js';
import { disclosureMotion } from '#components/revisions/revision-actions.js';
import {
  PaneviewHeader,
  PaneviewHeaderAction,
  PaneviewHeaderActionGroup,
  PaneviewHeaderContentActions,
  PaneviewHeaderControls,
  paneviewAttachedBodyClassName,
  paneviewAttachedSurfaceStyleOverrides,
  paneviewHeaderSize,
} from '#components/panes/paneview-header.js';
import type { cadMachine } from '#machines/cad.machine.js';
import type { graphicsMachine } from '#machines/graphics.machine.js';
import { deriveModelInteractionUnitId, getModelInteractionUnitState } from '#machines/model-interaction.machine.js';
import {
  getKinematicsAnimation,
  getKinematicsClipTime,
  getKinematicsDragNotice,
  getKinematicsUnitState,
  sweepAnimationId,
} from '#machines/kinematics.machine.js';
import type { KinematicsDragNotice, KinematicsUnitState, kinematicsMachine } from '#machines/kinematics.machine.js';
import {
  findKinematicsJointByComponent,
  getKinematicsRootDriver,
  getKinematicsStructure,
} from '#utils/kinematics-structure.utils.js';
import type { KinematicsStructure } from '#utils/kinematics-structure.utils.js';
import { listGeometryEntryPaths } from '#routes/w.$workspace.$project/geometry-unit.utils.js';
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

/** A followers list shows this many rows before "Show N more", as the Revisions history does (`rowLimit`). */
const followerPageSize = 12;

const blockedReasonCopy: Record<KinematicsDragNotice, string> = {
  limit: 'a joint reached its limit',
  singular: 'the mechanism is at a singular pose',
  budget: 'the solver ran out of iterations',
};

/** The replicad kernel reports a rejected mechanism as a warning whose `details.mechanism` holds the reason. */
const isMechanismIssue = (issue: KernelIssue): boolean =>
  typeof issue.details === 'object' && issue.details !== null && 'mechanism' in issue.details;

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

type DisplayFactors = Readonly<Record<DegreeOfFreedom['kind'], number>>;

const displayFactorsByMechanism = new WeakMap<Mechanism, DisplayFactors>();

/**
 * Mechanism units to display units. Both conversions are linear (rad to deg, m to mm), so one factor per kind,
 * computed once per mechanism, replaces a unit conversion per value per frame.
 */
const getDisplayFactors = (mechanism: Mechanism): DisplayFactors => {
  let factors = displayFactorsByMechanism.get(mechanism);
  if (factors === undefined) {
    factors = {
      angle: convertCoordinate({ value: 1, kind: 'angle', from: mechanism.units.angle, to: displayByKind.angle.unit }),
      distance: convertCoordinate({
        value: 1,
        kind: 'distance',
        from: mechanism.units.length,
        to: displayByKind.distance.unit,
      }),
    };
    displayFactorsByMechanism.set(mechanism, factors);
  }
  return factors;
};

const formatNumber = (value: number): string => String(Math.round(value * 100) / 100);

/** Four significant digits, so a worm's −1/30 reads −0.03333 rather than −0.03. */
const formatRatio = (value: number): string => String(Number(value.toPrecision(4)));

const capitalize = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

const plural = (count: number, noun: string): string => `${count} ${noun}${count === 1 ? '' : 's'}`;

const withSymbol = (value: number, kind: DegreeOfFreedom['kind']): string => {
  const { symbol } = displayByKind[kind];
  return `${formatNumber(value)}${symbol === '°' ? '' : ' '}${symbol}`;
};

/** A joint's authored name, else its id; a joint with several coordinates appends which one. */
const dofLabel = (dof: DegreeOfFreedom, mechanism: Mechanism): string => {
  const name = mechanism.joints[dof.jointId]?.name ?? dof.jointId;
  return dof.id === dof.jointId ? name : `${name} ${dof.id.slice(dof.jointId.length + 1)}`;
};

/** Inside its own group a driver's control is labelled by what it sets: the group title already names the joint. */
const quantityLabel = (dof: DegreeOfFreedom): string =>
  dof.id === dof.jointId
    ? dof.kind === 'angle'
      ? 'Angle'
      : 'Travel'
    : capitalize(dof.id.slice(dof.jointId.length + 1));

/** `= ratio × driver + offset` in display units, or `= curve of driver` for a sampled curve. */
const describeCoupling = (dof: DegreeOfFreedom, dofs: readonly DegreeOfFreedom[], mechanism: Mechanism): string => {
  const { coupling } = dof;
  const driver = dofs.find((candidate) => candidate.id === coupling?.driver);
  if (coupling === undefined || driver === undefined) {
    return '';
  }
  if ('curve' in coupling) {
    return `= curve of ${dofLabel(driver, mechanism)}`;
  }
  const factors = getDisplayFactors(mechanism);
  const ratio = (coupling.ratio * factors[dof.kind]) / factors[driver.kind];
  const offset = coupling.offset ? ` + ${withSymbol(coupling.offset * factors[dof.kind], dof.kind)}` : '';
  return `= ${formatRatio(ratio)} × ${dofLabel(driver, mechanism)}${offset}`;
};

/**
 * How a follower follows, short: `Ratio 0.25`, `Curve`. The group it sits in names the driver, so only a follower
 * of another follower (a chain) names its own.
 */
const describeRelation = (
  dof: DegreeOfFreedom,
  groupDriverId: string,
  { dofs, mechanism }: Readonly<{ dofs: readonly DegreeOfFreedom[]; mechanism: Mechanism }>,
): string => {
  const { coupling } = dof;
  const driver = dofs.find((candidate) => candidate.id === coupling?.driver);
  if (coupling === undefined || driver === undefined) {
    return '';
  }
  const of = driver.id === groupDriverId ? '' : ` of ${dofLabel(driver, mechanism)}`;
  if ('curve' in coupling) {
    return `Curve${of}`;
  }
  const factors = getDisplayFactors(mechanism);
  const ratio = (coupling.ratio * factors[dof.kind]) / factors[driver.kind];
  const offset = coupling.offset ? ` + ${withSymbol(coupling.offset * factors[dof.kind], dof.kind)}` : '';
  return `Ratio ${formatRatio(ratio)}${offset}${of}`;
};

const listParts = (names: readonly string[]): string | undefined => {
  if (names.length === 0) {
    return undefined;
  }
  const shown = names.slice(0, 5);
  const rest = names.length - shown.length;
  return `Moves ${plural(names.length, 'part')}: ${shown.join(', ')}${rest > 0 ? ` and ${rest} more` : ''}`;
};

const matchesTerm = (term: string, texts: readonly string[]): boolean =>
  term === '' || texts.some((text) => text.toLowerCase().includes(term));

const noop = (): void => undefined;

/** Which groups are open, per unit: driver groups start open, Followers groups and full lists start closed. */
type KinematicsDisclosure = Readonly<{
  closedGroups: ReadonlySet<string>;
  openFollowers: ReadonlySet<string>;
  expandedLists: ReadonlySet<string>;
}>;

const initialDisclosure: KinematicsDisclosure = {
  closedGroups: new Set(),
  openFollowers: new Set(),
  expandedLists: new Set(),
};

const toggled = (set: ReadonlySet<string>, id: string, isMember: boolean): ReadonlySet<string> => {
  if (set.has(id) === isMember) {
    return set;
  }
  const next = new Set(set);
  if (isMember) {
    next.add(id);
  } else {
    next.delete(id);
  }
  return next;
};

type UpdateDisclosure = (entryPath: string, update: (disclosure: KinematicsDisclosure) => KinematicsDisclosure) => void;

/** A part the part menu's "Show kinematics" asked to see; `requestId` makes each request its own. */
type KinematicsReveal = Readonly<{ entryPath: string; componentId: string; requestId: number }>;

/** What every row of one unit reads: the actor, the loaded mechanism and how the pane organises it. */
type UnitContextValue = Readonly<{
  kinematicsRef: KinematicsRef;
  unitId: string;
  mechanism: Mechanism;
  dofs: readonly DegreeOfFreedom[];
  structure: KinematicsStructure;
  term: string;
  partNames: (componentIds: readonly string[]) => string[];
  /** Point the viewer at components; an empty list clears it. */
  pointAt: (componentIds: readonly string[]) => void;
}>;

const UnitContext = createContext<UnitContextValue | undefined>(undefined);

function useUnitContext(): UnitContextValue {
  const context = useContext(UnitContext);
  if (context === undefined) {
    throw new Error('Kinematics rows render inside a loaded unit.');
  }
  return context;
}

const unitSelector =
  <T,>(unitId: string, select: (unit: KinematicsUnitState) => T) =>
  (state: { context: Parameters<typeof getKinematicsUnitState>[0] }): T =>
    select(getKinematicsUnitState(state.context, unitId));

/** Hover and focus handlers that point the viewer at components and clear it on leave. */
function usePointerHandlers(componentIds: readonly string[]) {
  const { pointAt } = useUnitContext();
  return useMemo(
    () => ({
      onMouseEnter: () => {
        pointAt(componentIds);
      },
      onMouseLeave: () => {
        pointAt([]);
      },
      onFocus: () => {
        pointAt(componentIds);
      },
      onBlur: (event: React.FocusEvent<HTMLElement>) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          pointAt([]);
        }
      },
    }),
    [componentIds, pointAt],
  );
}

/** One degree of freedom, laid out as a Parameters row. It subscribes to its own value, so playback re-renders only rows that move. */
const JointRow = memo(function JointRow({
  dof,
  label,
  relation,
  componentIds,
  revealRequestId,
}: {
  readonly dof: DegreeOfFreedom;
  readonly label: string;
  /** A follower's short relation to its group's driver. */
  readonly relation?: string;
  readonly componentIds: readonly string[];
  /** Set when "Show kinematics" asked for this row: it scrolls into view and takes focus, once per request. */
  readonly revealRequestId?: number;
}): React.JSX.Element {
  const { kinematicsRef, unitId, mechanism, dofs, term, partNames } = useUnitContext();
  const isDriver = dof.role === 'driver';
  const value = useSelector(
    kinematicsRef,
    unitSelector(unitId, (unit) => unit.pose?.coordinates[dof.id] ?? 0),
  );
  const isAtLimit = useSelector(
    kinematicsRef,
    unitSelector(unitId, (unit) => unit.atLimit.includes(dof.id)),
  );
  // A playing clip crosses as built every cycle; a mark blinking with it is noise. The file's pose mark stays.
  const isPlaying = useSelector(
    kinematicsRef,
    unitSelector(unitId, (unit) => unit.playback.status === 'playing'),
  );
  const pointerHandlers = usePointerHandlers(componentIds);
  const rootRef = useRef<HTMLDivElement>(null);
  const scrubStart = useRef<number | undefined>(undefined);
  const display = displayByKind[dof.kind];
  const factor = getDisplayFactors(mechanism)[dof.kind];
  const { limits } = dof;
  const displayValue = value * factor;
  const min = limits ? limits.lower * factor : displayValue - display.extent;
  const max = limits ? limits.upper * factor : displayValue + display.extent;
  const name = dofLabel(dof, mechanism);
  const type = capitalize(mechanism.joints[dof.jointId]?.type ?? 'fixed');
  const parts = listParts(partNames(componentIds));
  const details = [
    `${type} joint · ${dof.role} · ${dof.jointId}`,
    ...(isDriver ? [] : [describeCoupling(dof, dofs, mechanism)]),
    limits ? `Range ${withSymbol(min, dof.kind)} to ${withSymbol(max, dof.kind)}` : 'Unlimited range',
    ...(parts === undefined ? [] : [parts]),
  ];

  const commit = (next: number): void => {
    if (isDriver) {
      kinematicsRef.send({ type: 'setCoordinate', unitId, id: dof.id, value: next / factor });
    }
  };

  useEffect(() => {
    if (revealRequestId === undefined) {
      return;
    }
    let isCancelled = false;
    // Wait for the groups the reveal opened to finish sliding open: mid-animation the row's offset is stale.
    // Only the pane's scroller moves, never the page around it.
    const frame = requestAnimationFrame(() => {
      const row = rootRef.current;
      const scroller = row?.closest<HTMLElement>('[data-slot=kinematics-unit-scroller]');
      if (!row || !scroller) {
        return;
      }
      const opening = scroller
        .getAnimations({ subtree: true })
        .filter((animation) => animation.effect instanceof KeyframeEffect && animation.effect.target?.contains(row));
      // async-iife: bootstrap — a frame callback cannot await; the cancellation flag makes a late settle a no-op.
      void (async () => {
        await Promise.allSettled(opening.map(async (animation) => animation.finished));
        if (isCancelled) {
          return;
        }
        const offset = row.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
        scroller.scrollTo({
          top: scroller.scrollTop + offset - (scroller.clientHeight - row.offsetHeight) / 2,
          behavior: 'smooth',
        });
        row.querySelector<HTMLElement>('[role=spinbutton]')?.focus({ preventScroll: true });
      })();
    });
    return () => {
      isCancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [revealRequestId]);

  return (
    <div
      ref={rootRef}
      data-slot='kinematics-joint'
      data-driver-control={isDriver || undefined}
      className='@container/parameter mx-1 my-0.5 flex flex-col gap-0.5 rounded-md px-1.5 py-1 transition-colors duration-150 focus-within:bg-accent/50 hover:bg-accent/50 motion-reduce:transition-none'
      {...pointerHandlers}
    >
      <div className='flex min-w-0 flex-col gap-1 @[240px]/parameter:flex-row @[240px]/parameter:items-start @[240px]/parameter:gap-2'>
        <div className='flex min-w-0 shrink-0 flex-col @[240px]/parameter:w-[40%]'>
          <div className='flex min-h-6 min-w-0 items-center gap-1.5'>
            <span
              className={cn(
                'min-w-0 truncate text-sm',
                isDriver ? 'font-medium text-foreground' : 'text-muted-foreground',
              )}
            >
              <HighlightText text={label} searchTerm={term} />
            </span>
            {isDriver && value !== 0 && !isPlaying ? (
              <ModifiedIndicator
                tooltip={`Reset ${name}`}
                className='size-5'
                onReset={() => {
                  kinematicsRef.send({ type: 'setCoordinate', unitId, id: dof.id, value: 0 });
                }}
              />
            ) : null}
          </div>
          {relation ? <span className='truncate text-xs text-muted-foreground/70'>{relation}</span> : null}
        </div>
        <div data-testid={`kinematics-dof-${dof.id}`} className='flex min-w-0 flex-1 flex-col gap-0.5'>
          <ParametersNumberField
            value={displayValue}
            formattedValue={formatNumber(displayValue)}
            unit={display.symbol}
            details={details}
            rangeMin={min}
            rangeMax={max}
            // An unlimited joint's range is a scrub window, so Home and End have no limit to reach.
            hasMinimum={limits !== undefined}
            hasMaximum={limits !== undefined}
            step={display.step}
            isReadOnly={!isDriver}
            aria-label={name}
            diagnostic={isAtLimit ? (isDriver ? 'At limit' : 'Outside its limits') : undefined}
            // A follower is a readout, not a control, and an unlimited driver's window has no bounds: no fill.
            className={limits && isDriver ? undefined : '[&_[data-slot=slider-input-fill]]:hidden'}
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
});

/** A closed driver group still shows where its driver is. */
function CollapsedValue({ dof }: { readonly dof: DegreeOfFreedom }): React.JSX.Element {
  const { kinematicsRef, unitId, mechanism } = useUnitContext();
  const value = useSelector(
    kinematicsRef,
    unitSelector(unitId, (unit) => unit.pose?.coordinates[dof.id] ?? 0),
  );
  return (
    <span className='shrink-0 text-xs text-muted-foreground tabular-nums'>
      {withSymbol(value * getDisplayFactors(mechanism)[dof.kind], dof.kind)}
    </span>
  );
}

const searchTexts = (dof: DegreeOfFreedom, context: UnitContextValue): string[] => [
  dofLabel(dof, context.mechanism),
  dof.jointId,
  ...context.partNames(context.structure.componentsByJoint.get(dof.jointId) ?? []),
];

/** A driver that moves followers: a Parameters group card holding its control and a nested Followers group. */
function DriverGroup({
  driver,
  followers,
  disclosure,
  onDisclosureChange,
  revealed,
}: {
  readonly driver: DegreeOfFreedom;
  readonly followers: readonly DegreeOfFreedom[];
  readonly disclosure: KinematicsDisclosure;
  readonly onDisclosureChange: (update: (disclosure: KinematicsDisclosure) => KinematicsDisclosure) => void;
  readonly revealed: Readonly<{ dofId: string; requestId: number }> | undefined;
}): React.JSX.Element | undefined {
  const context = useUnitContext();
  const { mechanism, dofs, structure, term } = context;
  const title = dofLabel(driver, mechanism);
  const driverComponents = structure.componentsByDriver.get(driver.id) ?? [];
  const followerComponents = useMemo(
    () => [...new Set(followers.flatMap((dof) => structure.componentsByJoint.get(dof.jointId) ?? []))],
    [followers, structure],
  );
  const headerHandlers = usePointerHandlers(driverComponents);
  const followersHeaderHandlers = usePointerHandlers(followerComponents);
  const isDriverMatch = matchesTerm(term, searchTexts(driver, context));
  const matching =
    term === '' || isDriverMatch ? followers : followers.filter((dof) => matchesTerm(term, searchTexts(dof, context)));
  if (term !== '' && !isDriverMatch && matching.length === 0) {
    return undefined;
  }
  // A search opens what it reaches into; at rest the person's own choice holds.
  const isSearching = term !== '';
  const isOpen = isSearching || !disclosure.closedGroups.has(driver.id);
  const isFollowersOpen = disclosure.openFollowers.has(driver.id) || (isSearching && !isDriverMatch);
  const isCountFiltered = isSearching && matching.length !== followers.length;
  const isPaged = !isSearching && !disclosure.expandedLists.has(driver.id) && matching.length > followerPageSize;
  const shown = isPaged ? matching.slice(0, followerPageSize) : matching;

  return (
    // The header lights while its control row is pointed at, as the viewer shows the same parts.
    <div data-slot='kinematics-driver-group' className='group/kinematics-driver'>
      <ParameterGroupCard
        title={title}
        searchTerm={term}
        isOpen={isOpen}
        trailing={isOpen ? null : <CollapsedValue dof={driver} />}
        headerProps={headerHandlers}
        headerClassName='group-has-[[data-driver-control]:hover]/kinematics-driver:bg-sidebar-accent group-has-[[data-driver-control]:focus-within]/kinematics-driver:bg-sidebar-accent'
        onOpenChange={(next) => {
          onDisclosureChange((current) => ({
            ...current,
            closedGroups: toggled(current.closedGroups, driver.id, !next),
          }));
        }}
      >
        <JointRow
          dof={driver}
          label={quantityLabel(driver)}
          componentIds={driverComponents}
          revealRequestId={revealed?.dofId === driver.id ? revealed.requestId : undefined}
        />
        <ParameterGroupCard
          isSubgroup
          title='Followers'
          triggerLabel={`Followers of ${title}`}
          isOpen={isFollowersOpen}
          trailing={
            <span className={cn('shrink-0 text-xs tabular-nums text-muted-foreground', isCountFiltered && 'italic')}>
              {isCountFiltered ? `(${matching.length}/${followers.length})` : `(${followers.length})`}
            </span>
          }
          headerProps={followersHeaderHandlers}
          onOpenChange={(next) => {
            onDisclosureChange((current) => ({
              ...current,
              openFollowers: toggled(current.openFollowers, driver.id, next),
            }));
          }}
        >
          {shown.map((dof) => (
            <JointRow
              key={dof.id}
              dof={dof}
              label={dofLabel(dof, mechanism)}
              relation={describeRelation(dof, driver.id, { dofs, mechanism })}
              componentIds={structure.componentsByJoint.get(dof.jointId) ?? []}
              revealRequestId={revealed?.dofId === dof.id ? revealed.requestId : undefined}
            />
          ))}
          {isPaged ? (
            <Button
              variant='ghost'
              size='xs'
              className='mx-1 mt-0.5 text-muted-foreground'
              onClick={() => {
                onDisclosureChange((current) => ({
                  ...current,
                  expandedLists: toggled(current.expandedLists, driver.id, true),
                }));
              }}
            >
              <ChevronDown aria-hidden className='size-3' />
              Show {matching.length - followerPageSize} more
            </Button>
          ) : null}
        </ParameterGroupCard>
      </ParameterGroupCard>
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

const loopCopy = { none: 'Once', repeat: 'Repeats', pingPong: 'Back and forth' } as const;

/** While a clip plays or is paused, its time slides in under the transport: scrubbed or typed, it seeks. */
function KinematicsTimeline({
  kinematicsRef,
  unitId,
  mechanism,
  dofs,
}: {
  readonly kinematicsRef: KinematicsRef;
  readonly unitId: string;
  readonly mechanism: Mechanism;
  readonly dofs: readonly DegreeOfFreedom[];
}): React.JSX.Element {
  const status = useSelector(
    kinematicsRef,
    unitSelector(unitId, (unit) => unit.playback.status),
  );
  const animationId = useSelector(
    kinematicsRef,
    unitSelector(unitId, (unit) => unit.playback.animationId),
  );
  const time = useSelector(
    kinematicsRef,
    unitSelector(unitId, (unit) => unit.playback.time),
  );
  const clip = useMemo(
    () => getKinematicsAnimation({ mechanism, degreesOfFreedom: dofs, animationId }),
    [animationId, dofs, mechanism],
  );
  const clipTime = clip === undefined ? 0 : getKinematicsClipTime(clip, time);
  const seek = useCallback(
    (next: number) => {
      kinematicsRef.send({ type: 'seek', unitId, time: next });
    },
    [kinematicsRef, unitId],
  );

  return (
    <Collapsible open={status !== 'stopped' && clip !== undefined}>
      <CollapsibleContent className={disclosureMotion}>
        {clip === undefined ? null : (
          <div role='group' aria-label='Timeline' className='flex items-center gap-2 pt-1'>
            <SliderInput
              value={clipTime}
              displayValue={`${clipTime.toFixed(1)} / ${clip.duration.toFixed(1)} s`}
              min={0}
              max={clip.duration}
              step={0.1}
              aria-label='Time'
              aria-valuetext={`${clipTime.toFixed(1)} of ${clip.duration.toFixed(1)} seconds`}
              className='h-6 min-w-0 flex-1 rounded-md bg-muted px-2 text-right text-sm text-muted-foreground'
              onScrubChange={seek}
              onScrubCommit={seek}
              onInputCommit={seek}
              onStep={(direction) => {
                seek(clipTime + direction * 0.1);
              }}
            />
            <span className='shrink-0 text-xs text-muted-foreground'>{loopCopy[clip.loop ?? 'none']}</span>
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}

function KinematicsToolbar({
  kinematicsRef,
  unitId,
  mechanism,
  dofs,
}: {
  readonly kinematicsRef: KinematicsRef;
  readonly unitId: string;
  readonly mechanism: Mechanism;
  readonly dofs: readonly DegreeOfFreedom[];
}): React.JSX.Element {
  const isPlaying = useSelector(
    kinematicsRef,
    unitSelector(unitId, (unit) => unit.playback.status === 'playing'),
  );
  const animationId = useSelector(
    kinematicsRef,
    unitSelector(unitId, (unit) => unit.playback.animationId),
  );
  const speed = useSelector(
    kinematicsRef,
    unitSelector(unitId, (unit) => unit.playback.speed),
  );
  const isReducedMotion = useReducedMotion();
  // The driver sweep needs a driver, so a mechanism with neither drivers nor clips has nothing to play.
  const hasMotion = (mechanism.animations?.length ?? 0) > 0 || dofs.some((dof) => dof.role === 'driver');
  const animations = useMemo<PickerItem[]>(
    () => [
      ...(mechanism.animations ?? []).map(({ id, name }) => ({ id, label: name ?? id })),
      { id: sweepAnimationId, label: 'Sweep drivers' },
    ],
    [mechanism],
  );
  const animationGroups = useMemo(() => [{ name: 'Animations', items: animations }], [animations]);
  const selectedAnimation = animations.find(({ id }) => id === (animationId ?? sweepAnimationId));

  return (
    <div className='flex flex-col'>
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
        <ComboBoxResponsive
          groupedItems={animationGroups}
          renderLabel={renderAnimationItem}
          getValue={getPickerValue}
          value={selectedAnimation}
          title='Animation'
          description='Choose the motion to play.'
          isSearchEnabled={animations.length > 5}
          popoverProperties={{ align: 'start', className: 'w-56' }}
          onSelect={(next) => {
            // Under reduced motion a choice only selects the clip; Play stays the explicit start.
            kinematicsRef.send(
              isReducedMotion
                ? { type: 'selectAnimation', unitId, animationId: next }
                : { type: 'play', unitId, animationId: next },
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
          value={playbackSpeedGroups[0]!.items.find(({ id }) => Number(id) === speed)}
          title='Playback speed'
          description='Choose how fast animations play.'
          isSearchEnabled={false}
          popoverProperties={{ align: 'start', className: 'w-28' }}
          onSelect={(next) => {
            kinematicsRef.send({ type: 'setPlaybackSpeed', unitId, speed: Number(next) });
          }}
        >
          <PaneButton size='label' aria-label={`Playback speed: ${speed}×`} className='tabular-nums'>
            {speed}×
            <ChevronDown aria-hidden className='size-3 opacity-60' />
          </PaneButton>
        </ComboBoxResponsive>
      </div>
      <KinematicsTimeline kinematicsRef={kinematicsRef} unitId={unitId} mechanism={mechanism} dofs={dofs} />
    </div>
  );
}

/** Live regions stay mounted and empty until they speak: a region created with its message may go unread. */
function KinematicsLiveRegions({
  kinematicsRef,
  unitId,
  isUpdating,
  isBuilding,
  mechanismIssue,
}: {
  readonly kinematicsRef: KinematicsRef;
  readonly unitId: string;
  readonly isUpdating: boolean;
  readonly isBuilding: boolean;
  readonly mechanismIssue: KernelIssue | undefined;
}): React.JSX.Element {
  const mechanism = useSelector(
    kinematicsRef,
    unitSelector(unitId, (unit) => unit.mechanism),
  );
  const status = useSelector(
    kinematicsRef,
    unitSelector(unitId, (unit) => unit.playback.status),
  );
  const animationId = useSelector(
    kinematicsRef,
    unitSelector(unitId, (unit) => unit.playback.animationId),
  );
  // Only a paused time is announced, so playback does not re-render the region every frame.
  const pausedAt = useSelector(
    kinematicsRef,
    unitSelector(unitId, (unit) => (unit.playback.status === 'paused' ? unit.playback.time : undefined)),
  );
  const issue = useSelector(
    kinematicsRef,
    unitSelector(unitId, (unit) => unit.issues[0]?.message),
  );
  const dragNotice = useSelector(
    kinematicsRef,
    unitSelector(unitId, (unit) => getKinematicsDragNotice(unit.drag)),
  );
  const animationLabel = mechanism?.animations?.find(({ id }) => id === animationId)?.name ?? animationId;
  const statusText = isUpdating
    ? 'Model updating. Joints still show the previous render.'
    : status === 'playing'
      ? `Playing ${animationLabel ?? 'driver sweep'}`
      : status === 'paused'
        ? `Paused at ${(pausedAt ?? 0).toFixed(1)} s`
        : 'Ready';

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
        {/* The transport and the timeline already show playback; the words are for assistive technology. */}
        {mechanism === undefined ? null : <p className='sr-only'>{statusText}</p>}
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
        {issue === undefined ? null : (
          <p className='flex items-start gap-1.5 px-2.5 pt-1 text-xs text-muted-foreground'>
            <CircleAlert aria-hidden className='mt-0.5 size-3.5 shrink-0 text-warning' />
            <span>Pose not applied: {issue} The last valid pose is kept.</span>
          </p>
        )}
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

/** The drivers: a plain row for a driver that moves nothing else, a group card for one with followers. */
function KinematicsJointList({
  entryPath,
  disclosure,
  onDisclosureChange,
  revealed,
}: {
  readonly entryPath: string;
  readonly disclosure: KinematicsDisclosure;
  readonly onDisclosureChange: UpdateDisclosure;
  readonly revealed: Readonly<{ dofId: string; requestId: number }> | undefined;
}): React.JSX.Element {
  const context = useUnitContext();
  const { dofs, mechanism, structure, term } = context;
  const updateDisclosure = useCallback(
    (update: (current: KinematicsDisclosure) => KinematicsDisclosure) => {
      onDisclosureChange(entryPath, update);
    },
    [entryPath, onDisclosureChange],
  );
  if (dofs.length === 0) {
    return (
      <p className='px-2.5 py-2 text-sm text-muted-foreground'>
        No movable joints. Every joint in this mechanism is fixed.
      </p>
    );
  }
  if (term !== '' && !dofs.some((dof) => matchesTerm(term, searchTexts(dof, context)))) {
    return <p className='px-2.5 py-2 text-sm text-muted-foreground'>No matching joints or parts</p>;
  }
  return (
    <section aria-label='Drivers' className='flex flex-col gap-1.5 px-1.5 pt-2'>
      {structure.drivers.map((driver) => {
        const followers = structure.followersByDriver.get(driver.id) ?? [];
        if (followers.length > 0) {
          return (
            <DriverGroup
              key={driver.id}
              driver={driver}
              followers={followers}
              disclosure={disclosure}
              revealed={revealed}
              onDisclosureChange={updateDisclosure}
            />
          );
        }
        if (!matchesTerm(term, searchTexts(driver, context))) {
          return null;
        }
        return (
          <JointRow
            key={driver.id}
            dof={driver}
            label={dofLabel(driver, mechanism)}
            componentIds={structure.componentsByJoint.get(driver.jointId) ?? []}
            revealRequestId={revealed?.dofId === driver.id ? revealed.requestId : undefined}
          />
        );
      })}
    </section>
  );
}

function LiveKinematicsUnit({
  entryPath,
  graphicsRef,
  cadRef,
  filterTerm,
  isShown,
  disclosure,
  onDisclosureChange,
  reveal,
}: {
  readonly entryPath: string;
  readonly graphicsRef: GraphicsRef;
  readonly cadRef: CadRef | undefined;
  readonly filterTerm: string;
  /** Whether the pane is on screen; the viewer poses parts under the pointer only then. */
  readonly isShown: boolean;
  readonly disclosure: KinematicsDisclosure;
  readonly onDisclosureChange: UpdateDisclosure;
  readonly reveal: KinematicsReveal | undefined;
}): React.JSX.Element {
  const kinematicsRef = useSelector(graphicsRef, (state) => state.context.kinematicsRef);
  const modelInteractionRef = useSelector(graphicsRef, (state) => state.context.modelInteractionRef);
  const unitId = deriveModelInteractionUnitId({ sourceFile: entryPath });
  // Structure only: each row, the toolbar and the regions subscribe to the values they show.
  const mechanism = useSelector(
    kinematicsRef,
    unitSelector(unitId, (unit) => unit.mechanism),
  );
  const dofs = useSelector(
    kinematicsRef,
    unitSelector(unitId, (unit) => unit.degreesOfFreedom),
  );
  const manifest = useSelector(
    modelInteractionRef,
    (state) => getModelInteractionUnitState(state.context, unitId).manifest,
  );
  const isUpdating = useSelector(cadRef, (state) => state?.hasTag('cad-loading') ?? false);
  const mechanismIssue = useSelector(cadRef, (state) =>
    state?.context.kernelIssues.get(entryPath)?.find((issue) => isMechanismIssue(issue)),
  );
  const [revealed, setRevealed] = useState<Readonly<{ dofId: string; requestId: number }>>();
  const handledRevealRef = useRef<number | undefined>(undefined);

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

  const pointAt = useCallback(
    (componentIds: readonly string[]) => {
      if (kinematicsRef.getSnapshot().status === 'active') {
        kinematicsRef.send({ type: 'setHoveredComponents', unitId, componentIds });
      }
    },
    [kinematicsRef, unitId],
  );
  // A row that unmounts under the pointer (the pane closes, a search hides it) leaves no highlight behind.
  useEffect(
    () => () => {
      pointAt([]);
    },
    [pointAt],
  );

  // "Show kinematics" on a part: open its driver's group, and for a follower its Followers group and whole list.
  useEffect(() => {
    if (
      reveal === undefined ||
      reveal.entryPath !== entryPath ||
      mechanism === undefined ||
      handledRevealRef.current === reveal.requestId
    ) {
      return;
    }
    handledRevealRef.current = reveal.requestId;
    const jointId = findKinematicsJointByComponent(mechanism, reveal.componentId);
    const dof = dofs.find((candidate) => candidate.jointId === jointId);
    if (dof === undefined) {
      return;
    }
    const root = getKinematicsRootDriver(dof, dofs);
    const isFollower = dof.role === 'follower';
    onDisclosureChange(entryPath, (current) => ({
      closedGroups: toggled(current.closedGroups, root, false),
      openFollowers: isFollower ? toggled(current.openFollowers, root, true) : current.openFollowers,
      expandedLists: isFollower ? toggled(current.expandedLists, root, true) : current.expandedLists,
    }));
    // oxlint-disable-next-line react/set-state-in-effect -- A reveal is an external request answered once, by id.
    setRevealed({ dofId: dof.id, requestId: reveal.requestId });
  }, [dofs, entryPath, mechanism, onDisclosureChange, reveal]);

  const partNames = useCallback(
    (componentIds: readonly string[]) => componentIds.map((id) => manifest?.nodesById[id]?.name ?? id),
    [manifest],
  );
  const term = filterTerm.trim().toLowerCase();
  const context = useMemo<UnitContextValue | undefined>(
    () =>
      mechanism === undefined
        ? undefined
        : {
            kinematicsRef,
            unitId,
            mechanism,
            dofs,
            structure: getKinematicsStructure(mechanism, dofs),
            term,
            partNames,
            pointAt,
          },
    [dofs, kinematicsRef, mechanism, partNames, pointAt, term, unitId],
  );
  const isBuilding = mechanism === undefined && mechanismIssue === undefined && isUpdating;

  return (
    <div className={cn('h-full', paneviewAttachedBodyClassName)}>
      <div
        data-slot='kinematics-unit-scroller'
        className='flex size-full scroll-shadows-y flex-col overflow-y-auto pb-2 [--scroll-fade-end:transparent] [--scroll-fade-size:28px]'
      >
        {mechanism === undefined ? null : (
          <div className='px-2.5 pt-2'>
            <KinematicsToolbar kinematicsRef={kinematicsRef} unitId={unitId} mechanism={mechanism} dofs={dofs} />
          </div>
        )}
        <KinematicsLiveRegions
          kinematicsRef={kinematicsRef}
          unitId={unitId}
          isUpdating={isUpdating}
          isBuilding={isBuilding}
          mechanismIssue={mechanismIssue}
        />
        {context === undefined ? (
          isBuilding || mechanismIssue !== undefined ? null : (
            <PanelEmptyState
              icon={Rotate3d}
              title='This model declares no mechanism'
              description={
                <>
                  Export a mechanism from the entry file, for example <code>export function mechanism</code>, to move
                  its parts here.
                </>
              }
              className='min-h-40'
            />
          )
        ) : (
          <UnitContext value={context}>
            <KinematicsJointList
              entryPath={entryPath}
              disclosure={disclosure}
              revealed={revealed}
              onDisclosureChange={onDisclosureChange}
            />
            {/* Engineering detail, after the joints rather than above them. */}
            <p className='px-2.5 pt-3 text-xs text-muted-foreground'>
              Root {context.mechanism.root} · {plural(Object.keys(context.mechanism.links).length, 'link')} ·{' '}
              {plural(Object.keys(context.mechanism.joints).length, 'joint')} · {context.mechanism.units.length},{' '}
              {context.mechanism.units.angle}
            </p>
          </UnitContext>
        )}
      </div>
    </div>
  );
}

type KinematicsPanelParams = {
  entryPath: string;
  graphicsRef?: GraphicsRef;
  cadRef?: CadRef;
  filterTerm: string;
  isShown: boolean;
  disclosure: KinematicsDisclosure;
  onDisclosureChange: UpdateDisclosure;
  reveal: KinematicsReveal | undefined;
};

function KinematicsPanel({ params }: { readonly params: KinematicsPanelParams }): React.JSX.Element {
  if (params.graphicsRef === undefined) {
    return (
      <div className={cn('h-full', paneviewAttachedBodyClassName)}>
        <PanelEmptyState icon={Rotate3d} title='Open renderer to pose this model' />
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
      disclosure={params.disclosure}
      reveal={params.reveal}
      onDisclosureChange={params.onDisclosureChange}
    />
  );
}

/** The file's pose mark and Expand all / Collapse all, as the Parameters header carries its parameters' mark. */
function KinematicsHeaderControls({
  graphicsRef,
  entryPath,
  disclosure,
  onDisclosureChange,
}: {
  readonly graphicsRef: GraphicsRef;
  readonly entryPath: string;
  readonly disclosure: KinematicsDisclosure;
  readonly onDisclosureChange: UpdateDisclosure;
}): React.JSX.Element {
  const kinematicsRef = useSelector(graphicsRef, (state) => state.context.kinematicsRef);
  const unitId = deriveModelInteractionUnitId({ sourceFile: entryPath });
  const mechanism = useSelector(
    kinematicsRef,
    unitSelector(unitId, (unit) => unit.mechanism),
  );
  const dofs = useSelector(
    kinematicsRef,
    unitSelector(unitId, (unit) => unit.degreesOfFreedom),
  );
  // Playing counts as posed, so the mark does not blink as a clip passes the as-built pose.
  const isPosed = useSelector(
    kinematicsRef,
    unitSelector(
      unitId,
      (unit) => unit.playback.status !== 'stopped' || Object.values(unit.coordinates).some((value) => value !== 0),
    ),
  );
  const grouped = useMemo(() => {
    if (mechanism === undefined) {
      return [];
    }
    const structure = getKinematicsStructure(mechanism, dofs);
    return structure.drivers
      .filter((driver) => (structure.followersByDriver.get(driver.id)?.length ?? 0) > 0)
      .map((driver) => driver.id);
  }, [dofs, mechanism]);
  const isAllExpanded = grouped.every((id) => !disclosure.closedGroups.has(id) && disclosure.openFollowers.has(id));

  return (
    <>
      {isPosed ? (
        /* Status sits beside the file name, as a parameter's mark sits beside its label. */
        <PaneviewHeaderControls className='ml-0'>
          <ModifiedIndicator
            tooltip='Reset pose to as built'
            className='size-6 group-hover/paneview-header:**:data-[slot=dot]:opacity-0 group-hover/paneview-header:**:data-[slot=icon]:opacity-100'
            onReset={() => {
              kinematicsRef.send({ type: 'reset', unitId });
            }}
          />
        </PaneviewHeaderControls>
      ) : null}
      {grouped.length > 0 ? (
        <PaneviewHeaderControls>
          <PaneviewHeaderActionGroup className='opacity-0 transition-opacity duration-150 group-focus-within/paneview-header:opacity-100 group-hover/paneview-header:opacity-100 motion-reduce:transition-none [@media(hover:none)]:opacity-100'>
            <PaneviewHeaderContentActions>
              <PaneviewHeaderAction
                aria-expanded={isAllExpanded}
                aria-label={isAllExpanded ? 'Collapse all' : 'Expand all'}
                tooltip={isAllExpanded ? 'Collapse all' : 'Expand all'}
                onClick={() => {
                  onDisclosureChange(entryPath, (current) => ({
                    ...current,
                    closedGroups: isAllExpanded ? new Set(grouped) : new Set(),
                    openFollowers: isAllExpanded ? new Set() : new Set(grouped),
                  }));
                }}
              >
                {isAllExpanded ? <CopyMinus /> : <CopyPlus />}
              </PaneviewHeaderAction>
            </PaneviewHeaderContentActions>
          </PaneviewHeaderActionGroup>
        </PaneviewHeaderControls>
      ) : null}
    </>
  );
}

function KinematicsPanelHeader({
  api,
  params,
}: {
  readonly api: PaneviewPanelApi;
  readonly params: KinematicsPanelParams;
}): React.JSX.Element {
  return (
    <PaneviewHeader api={api} title={params.entryPath}>
      {params.graphicsRef === undefined ? null : (
        <KinematicsHeaderControls
          graphicsRef={params.graphicsRef}
          entryPath={params.entryPath}
          disclosure={params.disclosure}
          onDisclosureChange={params.onDisclosureChange}
        />
      )}
    </PaneviewHeader>
  );
}

const paneviewComponents = { kinematicsPanel: KinematicsPanel };
const paneviewHeaderComponents = { kinematicsHeader: KinematicsPanelHeader };

type KinematicsEntry = readonly [entryPath: string, cadRef: CadRef | undefined, graphicsRef: GraphicsRef | undefined];

// ponytail: expansion and disclosure live for the session; a `kinematicsPaneview` panel-state key would persist them.
function KinematicsPaneview({
  entries,
  filterTerm,
  isShown,
  reveal,
}: {
  readonly entries: readonly KinematicsEntry[];
  readonly filterTerm: string;
  readonly isShown: boolean;
  readonly reveal: KinematicsReveal | undefined;
}): React.JSX.Element {
  const paneviewApiRef = useRef<PaneviewApi | undefined>(undefined);
  const paneviewKey = entries.map(([entryPath]) => entryPath).join('\0');
  // Disclosure is shared by each file's header (Expand all) and body (its groups), so it lives above both.
  const [disclosures, setDisclosures] = useState<Readonly<Record<string, KinematicsDisclosure>>>({});
  const handleDisclosureChange = useCallback<UpdateDisclosure>((entryPath, update) => {
    setDisclosures((current) => ({ ...current, [entryPath]: update(current[entryPath] ?? initialDisclosure) }));
  }, []);
  const panelParams = useCallback(
    (entryPath: string, cadRef: CadRef | undefined, graphicsRef: GraphicsRef | undefined): KinematicsPanelParams => ({
      entryPath,
      cadRef,
      graphicsRef,
      filterTerm,
      isShown,
      disclosure: disclosures[entryPath] ?? initialDisclosure,
      onDisclosureChange: handleDisclosureChange,
      reveal,
    }),
    [disclosures, filterTerm, handleDisclosureChange, isShown, reveal],
  );

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
          params: panelParams(entryPath, cadRef, graphicsRef),
        });
      }
    },
    [entries, panelParams],
  );

  useEffect(() => {
    for (const [entryPath, cadRef, graphicsRef] of entries) {
      paneviewApiRef.current?.getPanel(entryPath)?.api.updateParameters(panelParams(entryPath, cadRef, graphicsRef));
    }
  }, [entries, panelParams]);

  // A revealed part's file panel opens so its row can show.
  useEffect(() => {
    if (reveal !== undefined) {
      paneviewApiRef.current?.getPanel(reveal.entryPath)?.api.setExpanded(true);
    }
  }, [reveal]);

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
  reveal,
}: {
  readonly filterTerm: string;
  readonly isShown: boolean;
  readonly reveal: KinematicsReveal | undefined;
}): React.JSX.Element {
  const { geometryUnits, mainEntryPath, viewGraphics, viewRecords, projectRef } = useProject();
  const entryPaths = useMemo(
    () => listGeometryEntryPaths(geometryUnits, viewRecords, mainEntryPath),
    [geometryUnits, mainEntryPath, viewRecords],
  );
  useEffect(() => {
    if (!isShown) {
      return;
    }
    const claims = entryPaths.map((entryPath) => {
      const claimId = randomUuid();
      projectRef.send({ type: 'claimGeometryUnit', claimId, entryPath });
      return claimId;
    });
    return () => {
      for (const claimId of claims) {
        projectRef.send({ type: 'releaseGeometryUnit', claimId });
      }
    };
  }, [entryPaths, isShown, projectRef]);
  // The unit posed here is the one a viewer shows: its graphics actor owns the kinematics actor.
  const entries = useMemo(
    () =>
      entryPaths.map((entryPath): KinematicsEntry => {
        const graphicsRef = [...viewGraphics].find(([viewId]) => viewRecords.get(viewId)?.entryPath === entryPath)?.[1];
        return [entryPath, geometryUnits.get(entryPath), graphicsRef];
      }),
    [entryPaths, geometryUnits, viewGraphics, viewRecords],
  );

  if (entries.length === 0) {
    return <PanelEmptyState icon={Rotate3d} title='No geometry units' className='min-h-16' />;
  }
  return <KinematicsPaneview entries={entries} filterTerm={filterTerm} isShown={isShown} reveal={reveal} />;
}

/** The dockview API of the workbench panel hosting the pane; dockview keeps a hidden panel mounted. */
type KinematicsHostPanelApi = Pick<DockviewPanelApi, 'isVisible' | 'onDidVisibilityChange'>;

export function KinematicsPanelBody({ panelApi }: { readonly panelApi?: KinematicsHostPanelApi }): React.JSX.Element {
  const { editorRef } = useProject();
  const [filterTerm, setFilterTerm] = useState('');
  const [reveal, setReveal] = useState<KinematicsReveal>();
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

  // "Show kinematics" from the part menu: a search could hide the row, so it clears.
  useEffect(() => {
    const subscription = editorRef.on('kinematicsRevealRequested', (event) => {
      setFilterTerm('');
      setReveal((current) => ({
        entryPath: event.entryPath,
        componentId: event.componentId,
        requestId: (current?.requestId ?? 0) + 1,
      }));
    });
    return () => {
      subscription.unsubscribe();
    };
  }, [editorRef]);

  return (
    <div
      data-slot='kinematics-panel-body'
      data-testid='kinematics-pane'
      className='flex size-full min-h-0 flex-col overflow-hidden bg-sidebar'
    >
      <div data-slot='kinematics-filter' className='shrink-0 bg-sidebar px-2 pt-2'>
        <SearchInput
          aria-label='Filter joints and parts'
          placeholder='Filter joints and parts…'
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
        <KinematicsContent filterTerm={filterTerm} isShown={isShown} reveal={reveal} />
      </div>
    </div>
  );
}
