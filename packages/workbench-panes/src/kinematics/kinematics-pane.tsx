import { createContext, memo, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  Anchor,
  ChevronDown,
  CircleAlert,
  CopyMinus,
  CopyPlus,
  ListTree,
  Lock,
  OctagonAlert,
  Rotate3d,
} from 'lucide-react';
import { useSelector } from '@xstate/react';
import type { PaneviewApi, PaneviewPanelApi } from 'dockview-react';
import type { DegreeOfFreedom, JointLimits, Mechanism } from '@taucad/kinematics';
import { PaneVirtualList } from '@taucad/ui/components/pane-virtual-list';
import { Button } from '@taucad/ui/components/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@taucad/ui/components/collapsible';
import { Tooltip, TooltipContent, TooltipTrigger } from '@taucad/ui/components/tooltip';
import { cn } from '@taucad/ui/utils/cn';
import { SearchInput } from '@taucad/ui/components/search-input';
import { HighlightText } from '@taucad/ui/components/highlight-text';
import { Loader } from '@taucad/ui/components/loader';
import { ModifiedIndicator } from '@taucad/ui/components/modified-indicator';
import { PanelEmptyState } from '@taucad/ui/components/panel-empty-state';
import { disclosureMotion } from '@taucad/ui/components/actions';
import { ParameterGroupCard } from '@taucad/viewer/parameters/parameter-group-card';
import { ParametersNumberField } from '@taucad/viewer/parameters/parameters-number-field';
import {
  deriveModelInteractionUnitId,
  getModelInteractionUnitState,
} from '@taucad/viewer/machines/model-interaction.machine';
import { getKinematicsDragNotice } from '@taucad/viewer/machines/kinematics.machine';
import type { KinematicsDragNotice } from '@taucad/viewer/machines/kinematics.machine';
import { useWorkbenchPanesHost } from '#host/workbench-host.jsx';
import type { GraphicsRef, WorkbenchUnit } from '#host/workbench-host.jsx';
import { Paneview } from '#paneview/paneview.jsx';
import {
  PaneviewHeader,
  PaneviewHeaderAction,
  PaneviewHeaderActionGroup,
  PaneviewHeaderContentActions,
  PaneviewHeaderControls,
  paneviewAttachedBodyClassName,
  paneviewAttachedSurfaceStyleOverrides,
  paneviewHeaderSize,
} from '#paneview/paneview-header.jsx';
import type { KinematicsSource, KinematicsUnitStatus } from '#kinematics/kinematics-source.js';
import {
  findKinematicsJointByComponent,
  getKinematicsRootDriver,
  getKinematicsStructure,
} from '#kinematics/kinematics-structure.js';
import type { KinematicsStructure } from '#kinematics/kinematics-structure.js';
import { AngleDial, TravelTrack, curveRange } from '#kinematics/kinematics-instruments.jsx';
import { KinematicsPlayer, unitSelector } from '#kinematics/kinematics-player.jsx';
import type { KinematicsRef } from '#kinematics/kinematics-player.jsx';
import {
  capitalize,
  displayByKind,
  dofLabel,
  formatNumber,
  getDisplayFactors,
  humanize,
  linkLabel,
  listParts,
  plural,
  quantityLabel,
  withSymbol,
} from '#kinematics/kinematics-format.js';
import { RelationBadge } from '#kinematics/kinematics-relation.jsx';

/** A followers list shows this many rows before "Show N more", as the Revisions history does (`rowLimit`). */
const followerPageSize = 12;

const blockedReasonCopy: Record<KinematicsDragNotice, string> = {
  limit: 'a joint reached its limit',
  singular: 'the mechanism is at a singular pose',
  budget: 'the solver ran out of iterations',
};

const matchesTerm = (term: string, texts: readonly string[]): boolean =>
  term === '' || texts.some((text) => text.toLowerCase().includes(term));

const noop = (): void => undefined;

const idleUnitStatus: KinematicsUnitStatus = { isUpdating: false, mechanismIssue: undefined };

/** A host without build status: no entry is ever updating or rejected. */
const useIdleUnitStatus = (): KinematicsUnitStatus => idleUnitStatus;

/** A host without visibility: the pane counts as shown while mounted. */
const useAlwaysShown = (): boolean => true;

const emptySource: KinematicsSource = {};

type UseUnitStatus = (entryPath: string) => KinematicsUnitStatus;

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

/**
 * The row's glyph is its live instrument: an angle as its dial, a distance as its track over its limits (or over the
 * travel its coupling curve covers). It names the joint's kind and shows where the joint is at once.
 */
function LiveGlyph({ dof, value }: { readonly dof: DegreeOfFreedom; readonly value: number }): React.JSX.Element {
  const { mechanism } = useUnitContext();
  const factor = getDisplayFactors(mechanism)[dof.kind];
  const scaled = (range: JointLimits): JointLimits => ({ lower: range.lower * factor, upper: range.upper * factor });
  if (dof.kind === 'angle') {
    return <AngleDial value={value * factor} limits={dof.limits === undefined ? undefined : scaled(dof.limits)} />;
  }
  const range =
    dof.limits ?? (dof.coupling !== undefined && 'curve' in dof.coupling ? curveRange(dof.coupling.curve) : undefined);
  // ponytail: an unlimited linear distance draws over its ±extent scrub window; a dedicated glyph if that misleads.
  const { extent } = displayByKind.distance;
  return (
    <TravelTrack
      value={value * factor}
      range={range === undefined ? { lower: -extent, upper: extent } : scaled(range)}
    />
  );
}

/** A driver, laid out as a Parameters row with its live glyph. It subscribes to its own value, so playback re-renders only rows that move. */
const JointRow = memo(function JointRow({
  dof,
  label,
  componentIds,
}: {
  readonly dof: DegreeOfFreedom;
  readonly label: string;
  readonly componentIds: readonly string[];
}): React.JSX.Element {
  const { kinematicsRef, unitId, mechanism, term, partNames } = useUnitContext();
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
  const scrubStart = useRef<number | undefined>(undefined);
  const display = displayByKind[dof.kind];
  const factor = getDisplayFactors(mechanism)[dof.kind];
  const { limits } = dof;
  const displayValue = value * factor;
  const min = limits ? limits.lower * factor : displayValue - display.extent;
  const max = limits ? limits.upper * factor : displayValue + display.extent;
  const name = dofLabel(dof, mechanism);
  const type = capitalize(mechanism.joints[dof.jointId]?.type ?? 'fixed');
  const parent = mechanism.joints[dof.jointId]?.parent;
  const parts = listParts(partNames(componentIds));
  const details = [
    `${type} joint · driver · ${dof.jointId}`,
    limits ? `Range ${withSymbol(min, dof.kind)} to ${withSymbol(max, dof.kind)}` : 'Unlimited range',
    ...(parent === undefined ? [] : [`On ${linkLabel(parent, mechanism)}`]),
    ...(parts === undefined ? [] : [parts]),
  ];

  const commit = (next: number): void => {
    kinematicsRef.send({ type: 'setCoordinate', unitId, id: dof.id, value: next / factor });
  };

  return (
    <div
      data-slot='kinematics-joint'
      data-driver-control
      className='@container/parameter mx-1 my-0.5 flex flex-col gap-0.5 rounded-md px-1.5 py-1 transition-colors duration-150 focus-within:bg-accent/50 hover:bg-accent/50 motion-reduce:transition-none'
      {...pointerHandlers}
    >
      <div className='flex min-w-0 flex-col gap-1 @[240px]/parameter:flex-row @[240px]/parameter:items-start @[240px]/parameter:gap-2'>
        <div className='flex min-h-6 min-w-0 shrink-0 items-center gap-1.5 @[240px]/parameter:w-[40%]'>
          <span className='flex w-6 shrink-0 justify-center'>
            <LiveGlyph dof={dof} value={value} />
          </span>
          <span className='min-w-0 truncate text-sm font-medium text-foreground'>
            <HighlightText text={label} searchTerm={term} />
          </span>
          {value !== 0 && !isPlaying ? (
            <ModifiedIndicator
              tooltip={`Reset ${name}`}
              className='size-5'
              onReset={() => {
                kinematicsRef.send({ type: 'setCoordinate', unitId, id: dof.id, value: 0 });
              }}
            />
          ) : null}
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
            aria-label={name}
            diagnostic={isAtLimit ? 'At limit' : undefined}
            // An unlimited driver's window has no bounds: no fill.
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
});

/** A follower on one line: its live glyph, its name with the relation badge beside it, its value at the right. */
const FollowerRow = memo(function FollowerRow({
  dof,
  groupDriverId,
  componentIds,
}: {
  readonly dof: DegreeOfFreedom;
  readonly groupDriverId: string;
  readonly componentIds: readonly string[];
}): React.JSX.Element {
  const { kinematicsRef, unitId, mechanism, dofs, term, partNames } = useUnitContext();
  const driver = dofs.find((candidate) => candidate.id === dof.coupling?.driver);
  const value = useSelector(
    kinematicsRef,
    unitSelector(unitId, (unit) => unit.pose?.coordinates[dof.id] ?? 0),
  );
  const driverValue = useSelector(
    kinematicsRef,
    unitSelector(unitId, (unit) =>
      dof.coupling === undefined ? 0 : (unit.pose?.coordinates[dof.coupling.driver] ?? 0),
    ),
  );
  const isAtLimit = useSelector(
    kinematicsRef,
    unitSelector(unitId, (unit) => unit.atLimit.includes(dof.id)),
  );
  const pointerHandlers = usePointerHandlers(componentIds);
  return (
    <div
      data-slot='kinematics-follower'
      data-testid={`kinematics-dof-${dof.id}`}
      className='mx-1 my-0.5 flex min-h-7 items-center gap-2 rounded-md px-1.5 transition-colors duration-150 focus-within:bg-accent/50 hover:bg-accent/50 motion-reduce:transition-none'
      {...pointerHandlers}
    >
      <span className='flex w-6 shrink-0 justify-center'>
        <LiveGlyph dof={dof} value={value} />
      </span>
      <span className='flex min-w-0 flex-1 items-center gap-2'>
        <span className='min-w-12 truncate text-sm text-foreground'>
          <HighlightText text={dofLabel(dof, mechanism)} searchTerm={term} />
        </span>
        {driver === undefined ? null : (
          <RelationBadge
            dof={dof}
            driver={driver}
            dofs={dofs}
            mechanism={mechanism}
            value={value}
            driverValue={driverValue}
            parts={partNames(componentIds)}
            isGroupDriver={driver.id === groupDriverId}
          />
        )}
      </span>
      <span className='flex min-w-14 shrink-0 items-center justify-end gap-1 text-sm text-muted-foreground tabular-nums'>
        {isAtLimit ? (
          <Tooltip>
            <TooltipTrigger asChild>
              {/* A button only so the tooltip has a keyboard path; it does nothing on its own. */}
              <button
                type='button'
                aria-label='Outside its limits'
                className='inline-flex rounded-sm outline-none focus-visible:focus-outline'
              >
                <CircleAlert aria-hidden className='size-3.5 text-warning' />
              </button>
            </TooltipTrigger>
            <TooltipContent>Outside its limits</TooltipContent>
          </Tooltip>
        ) : null}
        <span>
          {formatNumber(value * getDisplayFactors(mechanism)[dof.kind])}
          <span className='ml-0.5 font-mono text-xs text-muted-foreground/60'>{displayByKind[dof.kind].symbol}</span>
        </span>
      </span>
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
  const { mechanism, structure, term } = context;
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
        <JointRow dof={driver} label={quantityLabel(driver)} componentIds={driverComponents} />
        {/* A flat list under a hairline, not a nested card: the followers belong to the driver above them. */}
        <Collapsible
          open={isFollowersOpen}
          className='group/followers mt-1 border-t border-border/70 pt-0.5'
          onOpenChange={(next) => {
            onDisclosureChange((current) => ({
              ...current,
              openFollowers: toggled(current.openFollowers, driver.id, next),
            }));
          }}
        >
          <div
            className='mx-1 rounded-md transition-colors duration-150 focus-within:bg-sidebar-accent hover:bg-sidebar-accent motion-reduce:transition-none'
            {...followersHeaderHandlers}
          >
            <CollapsibleTrigger
              aria-label={`Followers of ${title}`}
              className='flex min-h-7 w-full items-center gap-2 rounded-md px-1.5 text-left text-xs text-muted-foreground outline-none focus-visible:focus-outline'
            >
              <span className='flex-1 font-medium'>Followers</span>
              <span className={cn('tabular-nums', isCountFiltered && 'italic')}>
                {isCountFiltered ? `${matching.length} of ${followers.length}` : followers.length}
              </span>
              <ChevronDown
                aria-hidden
                className='size-3.5 shrink-0 transition-transform duration-150 ease-out group-data-[state=open]/followers:rotate-180 motion-reduce:transition-none'
              />
            </CollapsibleTrigger>
          </div>
          <CollapsibleContent className={disclosureMotion}>
            <div className='pb-0.5'>
              <FollowerList followers={shown} driverId={driver.id} revealed={revealed} />
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
            </div>
          </CollapsibleContent>
        </Collapsible>
      </ParameterGroupCard>
    </div>
  );
}

const dofKey = (dof: DegreeOfFreedom): string => dof.id;

function FollowerList({
  followers,
  driverId,
  revealed,
}: {
  readonly followers: readonly DegreeOfFreedom[];
  readonly driverId: string;
  readonly revealed: Readonly<{ dofId: string; requestId: number }> | undefined;
}): React.JSX.Element {
  const { mechanism, dofs, structure } = useUnitContext();
  const renderItem = useCallback(
    (_index: number, dof: DegreeOfFreedom) => (
      <FollowerRow
        dof={dof}
        groupDriverId={driverId}
        componentIds={structure.componentsByJoint.get(dof.jointId) ?? []}
      />
    ),
    [driverId, structure],
  );
  const reveal = useMemo(
    () => (revealed ? { key: revealed.dofId, requestId: revealed.requestId } : undefined),
    [revealed],
  );
  return (
    <PaneVirtualList
      data={followers}
      getItemKey={dofKey}
      itemContent={renderItem}
      ariaLabel={`Followers of ${dofLabel(dofs.find((dof) => dof.id === driverId)!, mechanism)}`}
      reveal={reveal}
      focusSelector='[data-slot=kinematics-relation]'
      scrollParentSelector='[data-slot=kinematics-unit-scroller]'
    />
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
  readonly mechanismIssue: KinematicsUnitStatus['mechanismIssue'];
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
  const drivers = useMemo(
    () =>
      structure.drivers.filter(
        (driver) =>
          matchesTerm(term, searchTexts(driver, context)) ||
          (structure.followersByDriver.get(driver.id) ?? []).some((dof) =>
            matchesTerm(term, searchTexts(dof, context)),
          ),
      ),
    [context, structure, term],
  );
  const renderDriver = useCallback(
    (_index: number, driver: DegreeOfFreedom) => {
      const followers = structure.followersByDriver.get(driver.id) ?? [];
      return followers.length > 0 ? (
        <DriverGroup
          driver={driver}
          followers={followers}
          disclosure={disclosure}
          revealed={revealed}
          onDisclosureChange={updateDisclosure}
        />
      ) : (
        <JointRow
          dof={driver}
          label={dofLabel(driver, mechanism)}
          componentIds={structure.componentsByJoint.get(driver.jointId) ?? []}
        />
      );
    },
    [disclosure, mechanism, revealed, structure, updateDisclosure],
  );
  const reveal = useMemo(() => {
    const dof = dofs.find((candidate) => candidate.id === revealed?.dofId);
    return dof && revealed
      ? { key: getKinematicsRootDriver(dof, dofs), requestId: revealed.requestId, shouldFocus: dof.role !== 'follower' }
      : undefined;
  }, [dofs, revealed]);
  if (dofs.length === 0) {
    return (
      <p className='px-2.5 py-2 text-sm text-muted-foreground'>
        No movable joints. Every joint in this mechanism is fixed.
      </p>
    );
  }
  if (drivers.length === 0) {
    return <p className='px-2.5 py-2 text-sm text-muted-foreground'>No matching joints or parts</p>;
  }
  return (
    <section aria-label='Drivers' className='px-1.5 pt-2'>
      <PaneVirtualList
        data={drivers}
        getItemKey={dofKey}
        itemContent={renderDriver}
        itemSpacing='groups'
        ariaLabel='Joints and drivers'
        reveal={reveal}
        focusSelector='[role=spinbutton]'
        scrollParentSelector='[data-slot=kinematics-unit-scroller]'
      />
    </section>
  );
}

/** A joint's live glyph, subscribed to its own value for the Structure tree. */
function LiveJointGlyph({ dof }: { readonly dof: DegreeOfFreedom }): React.JSX.Element {
  const { kinematicsRef, unitId } = useUnitContext();
  const value = useSelector(
    kinematicsRef,
    unitSelector(unitId, (unit) => unit.pose?.coordinates[dof.id] ?? 0),
  );
  return <LiveGlyph dof={dof} value={value} />;
}

/** A joint's live value in the Structure tree. */
function LiveJointValue({ dof }: { readonly dof: DegreeOfFreedom }): React.JSX.Element {
  const { kinematicsRef, unitId, mechanism } = useUnitContext();
  const value = useSelector(
    kinematicsRef,
    unitSelector(unitId, (unit) => unit.pose?.coordinates[dof.id] ?? 0),
  );
  return (
    <span className='shrink-0 text-muted-foreground tabular-nums'>
      {withSymbol(value * getDisplayFactors(mechanism)[dof.kind], dof.kind)}
    </span>
  );
}

/** One link of the tree, under the joint that moves it, with what it carries indented on a rail. */
function StructureNode({ link, jointId }: { readonly link: string; readonly jointId: string | undefined }) {
  const { mechanism, dofs, structure } = useUnitContext();
  const jointDofs = useMemo(() => dofs.filter((dof) => dof.jointId === jointId), [dofs, jointId]);
  const componentIds =
    jointId === undefined
      ? (mechanism.links[link]?.components ?? [])
      : (structure.componentsByJoint.get(jointId) ?? []);
  const pointerHandlers = usePointerHandlers(componentIds);
  const children = Object.entries(mechanism.joints).filter(([, joint]) => joint.parent === link);
  const parts = mechanism.links[link]?.components.length ?? 0;
  const [firstDof] = jointDofs;
  return (
    <div>
      <div
        className='flex min-h-6 items-center gap-1.5 rounded-md px-1 text-xs transition-colors duration-150 hover:bg-accent/50 motion-reduce:transition-none'
        {...pointerHandlers}
      >
        <span className='flex w-6 shrink-0 justify-center text-muted-foreground'>
          {jointId === undefined ? (
            <Anchor aria-hidden className='size-3.5' />
          ) : firstDof === undefined ? (
            <Lock aria-hidden className='size-3.5' />
          ) : (
            <LiveJointGlyph dof={firstDof} />
          )}
        </span>
        <span className='min-w-0 flex-1 truncate'>
          {humanize(link)}
          <span className='ml-1.5 text-muted-foreground/70'>{plural(parts, 'part')}</span>
        </span>
        {jointDofs.length === 0 ? (
          <span className='shrink-0 text-muted-foreground'>{jointId === undefined ? 'Ground' : 'Fixed'}</span>
        ) : (
          jointDofs.map((dof) => <LiveJointValue key={dof.id} dof={dof} />)
        )}
      </div>
      {children.length > 0 ? (
        <div className='ml-2.5 border-l border-border/60 pl-2'>
          {children.map(([id, joint]) => (
            <StructureNode key={id} link={joint.child} jointId={id} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * The mechanism as a tree after the joints: links under the joints that move them, with live values, fixed joints
 * and the ground. The followers list groups by what sets a joint; this orders by what carries it.
 */
function StructureDisclosure(): React.JSX.Element {
  const { mechanism } = useUnitContext();
  // ponytail: open for the session; persist it with the other disclosure state if people ask.
  const [isOpen, setIsOpen] = useState(false);
  return (
    <Collapsible
      open={isOpen}
      className='group/structure mx-1.5 mt-2 border-t border-border/70 pt-1'
      onOpenChange={setIsOpen}
    >
      <CollapsibleTrigger className='flex min-h-8 w-full items-center gap-2 rounded-md px-2 text-left text-sm transition-colors duration-150 outline-none hover:bg-sidebar-accent focus-visible:focus-outline motion-reduce:transition-none'>
        <ListTree aria-hidden className='size-3.5 shrink-0 text-muted-foreground' />
        <span className='flex-1 font-medium text-muted-foreground'>Structure</span>
        <span className='text-xs text-muted-foreground tabular-nums'>
          {plural(Object.keys(mechanism.links).length, 'link')} ·{' '}
          {plural(Object.keys(mechanism.joints).length, 'joint')}
        </span>
        <ChevronDown
          aria-hidden
          className='size-4 shrink-0 text-muted-foreground transition-transform duration-150 ease-out group-data-[state=open]/structure:rotate-180 motion-reduce:transition-none'
        />
      </CollapsibleTrigger>
      <CollapsibleContent className={disclosureMotion}>
        <div className='px-1 pt-1 pb-2'>
          <StructureNode link={mechanism.root} jointId={undefined} />
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function LiveKinematicsUnit({
  entryPath,
  graphicsRef,
  useUnitStatus,
  filterTerm,
  isShown,
  disclosure,
  onDisclosureChange,
  reveal,
}: {
  readonly entryPath: string;
  readonly graphicsRef: GraphicsRef;
  /** The host's build status for the entry. */
  readonly useUnitStatus: UseUnitStatus;
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
  const { isUpdating, mechanismIssue } = useUnitStatus(entryPath);
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
    <div className={cn('flex h-full flex-col', paneviewAttachedBodyClassName)}>
      {mechanism === undefined ? null : (
        <KinematicsPlayer kinematicsRef={kinematicsRef} unitId={unitId} mechanism={mechanism} dofs={dofs} />
      )}
      <div
        data-slot='kinematics-unit-scroller'
        className='flex min-h-0 w-full flex-1 scroll-shadows-y flex-col overflow-y-auto pb-2 [--scroll-fade-end:transparent] [--scroll-fade-size:28px]'
      >
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
            <StructureDisclosure />
          </UnitContext>
        )}
      </div>
    </div>
  );
}

type KinematicsPanelParams = {
  entryPath: string;
  graphicsRef?: GraphicsRef;
  useUnitStatus: UseUnitStatus;
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
      useUnitStatus={params.useUnitStatus}
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

// ponytail: expansion and disclosure live for the session; a `kinematicsPaneview` panel-state key would persist them.
function KinematicsPaneview({
  units,
  useUnitStatus,
  filterTerm,
  isShown,
  reveal,
}: {
  readonly units: readonly WorkbenchUnit[];
  readonly useUnitStatus: UseUnitStatus;
  readonly filterTerm: string;
  readonly isShown: boolean;
  readonly reveal: KinematicsReveal | undefined;
}): React.JSX.Element {
  const paneviewApiRef = useRef<PaneviewApi | undefined>(undefined);
  const paneviewKey = units.map(({ entryPath }) => entryPath).join('\0');
  // Disclosure is shared by each file's header (Expand all) and body (its groups), so it lives above both.
  const [disclosures, setDisclosures] = useState<Readonly<Record<string, KinematicsDisclosure>>>({});
  const handleDisclosureChange = useCallback<UpdateDisclosure>((entryPath, update) => {
    setDisclosures((current) => ({ ...current, [entryPath]: update(current[entryPath] ?? initialDisclosure) }));
  }, []);
  const panelParams = useCallback(
    (entryPath: string, graphicsRef: GraphicsRef | undefined): KinematicsPanelParams => ({
      entryPath,
      graphicsRef,
      useUnitStatus,
      filterTerm,
      isShown,
      disclosure: disclosures[entryPath] ?? initialDisclosure,
      onDisclosureChange: handleDisclosureChange,
      reveal,
    }),
    [disclosures, filterTerm, handleDisclosureChange, isShown, reveal, useUnitStatus],
  );

  const handleReady = useCallback(
    ({ api }: { api: PaneviewApi }) => {
      paneviewApiRef.current = api;
      for (const { entryPath, graphicsRef } of units) {
        api.addPanel({
          id: entryPath,
          title: entryPath,
          component: 'kinematicsPanel',
          headerComponent: 'kinematicsHeader',
          headerSize: paneviewHeaderSize,
          isExpanded: true,
          minimumBodySize: 80,
          params: panelParams(entryPath, graphicsRef),
        });
      }
    },
    [panelParams, units],
  );

  useEffect(() => {
    for (const { entryPath, graphicsRef } of units) {
      paneviewApiRef.current?.getPanel(entryPath)?.api.updateParameters(panelParams(entryPath, graphicsRef));
    }
  }, [panelParams, units]);

  // A revealed part's file panel opens so its row can show.
  useEffect(() => {
    if (reveal !== undefined) {
      paneviewApiRef.current?.getPanel(reveal.entryPath)?.api.setExpanded(true);
    }
  }, [reveal]);

  return (
    <Paneview
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
  useUnitStatus,
}: {
  readonly filterTerm: string;
  readonly isShown: boolean;
  readonly reveal: KinematicsReveal | undefined;
  readonly useUnitStatus: UseUnitStatus;
}): React.JSX.Element {
  const { useUnits, claimUnits } = useWorkbenchPanesHost();
  // The unit posed here is the one a viewer shows: its graphics actor owns the kinematics actor.
  const units = useUnits();
  // Claims follow the listed entries, not their graphics: a viewer opening on an entry keeps its claim.
  const entryKey = units.map(({ entryPath }) => entryPath).join('\0');
  useEffect(() => {
    if (!isShown || claimUnits === undefined || entryKey === '') {
      return;
    }
    return claimUnits(entryKey.split('\0'));
  }, [claimUnits, entryKey, isShown]);

  if (units.length === 0) {
    return <PanelEmptyState icon={Rotate3d} title='No geometry units' className='min-h-16' />;
  }
  return (
    <KinematicsPaneview
      units={units}
      useUnitStatus={useUnitStatus}
      filterTerm={filterTerm}
      isShown={isShown}
      reveal={reveal}
    />
  );
}

/**
 * The Kinematics pane body, drawn from the host's units and its {@link KinematicsSource}: a filter, then one panel per
 * entry with its player, its drivers and followers, and its structure.
 *
 * @returns The pane body for every unit the host lists.
 * @public
 */
export function KinematicsPane(): React.JSX.Element {
  const source = useWorkbenchPanesHost().kinematics ?? emptySource;
  const useIsShown = source.useIsShown ?? useAlwaysShown;
  const isShown = useIsShown();
  const { subscribeReveal } = source;
  const useUnitStatus = source.useUnitStatus ?? useIdleUnitStatus;
  const [filterTerm, setFilterTerm] = useState('');
  const [reveal, setReveal] = useState<KinematicsReveal>();

  // "Show kinematics" from the part menu: a search could hide the row, so it clears.
  useEffect(
    () =>
      subscribeReveal?.((request) => {
        setFilterTerm('');
        setReveal((current) => ({
          entryPath: request.entryPath,
          componentId: request.componentId,
          requestId: (current?.requestId ?? 0) + 1,
        }));
      }),
    [subscribeReveal],
  );

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
        <KinematicsContent filterTerm={filterTerm} isShown={isShown} reveal={reveal} useUnitStatus={useUnitStatus} />
      </div>
    </div>
  );
}
