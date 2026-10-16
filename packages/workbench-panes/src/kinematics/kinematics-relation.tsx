/**
 * A follower's relation to its driver: an outlined badge beside the follower's name and the card it opens on hover
 * and on focus. Design: docs/research/kinematics-pane-ux-blueprint.md § Refinement round.
 */
import type { DegreeOfFreedom, Mechanism } from '@taucad/kinematics';
import { Badge } from '@taucad/ui/components/badge';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@taucad/ui/components/hover-card';
import { CurveSparkline, curveRange } from '#kinematics/kinematics-instruments.jsx';
import {
  capitalize,
  describeCoupling,
  displayRatio,
  dofLabel,
  formatRatio,
  getDisplayFactors,
  linkLabel,
  plural,
  withSymbol,
} from '#kinematics/kinematics-format.js';

type RelationProps = Readonly<{
  dof: DegreeOfFreedom;
  driver: DegreeOfFreedom;
  mechanism: Mechanism;
  /** The follower's value in mechanism units. */
  value: number;
  /** Its driver's value in mechanism units. */
  driverValue: number;
  /** The part names the follower moves. */
  parts: readonly string[];
}>;

/** One term and its value in the card's two columns. */
function Term({ term, children }: { readonly term: string; readonly children: React.ReactNode }): React.JSX.Element {
  return (
    <>
      <dt className='text-muted-foreground'>{term}</dt>
      <dd className='min-w-0 text-foreground'>{children}</dd>
    </>
  );
}

/** `0.25 × Sun` and `Turns with Sun`, or `Crank, by curve`. */
function FollowsTerm({
  dof,
  driver,
  mechanism,
}: Pick<RelationProps, 'dof' | 'driver' | 'mechanism'>): React.JSX.Element {
  const { coupling } = dof;
  const driverName = dofLabel(driver, mechanism);
  if (coupling === undefined || 'curve' in coupling) {
    return <Term term='Follows'>{driverName}, by curve</Term>;
  }
  return (
    <Term term='Follows'>
      <span className='font-mono'>{formatRatio(displayRatio({ ratio: coupling.ratio, dof, driver, mechanism }))}</span>{' '}
      × {driverName}
      {coupling.offset ? (
        <>
          {' '}
          +{' '}
          <span className='font-mono'>
            {withSymbol(coupling.offset * getDisplayFactors(mechanism)[dof.kind], dof.kind)}
          </span>
        </>
      ) : null}
      {dof.kind === 'angle' && driver.kind === 'angle' ? (
        <span className='block text-muted-foreground'>
          Turns {coupling.ratio >= 0 ? 'with' : 'against'} {driverName}
        </span>
      ) : null}
    </Term>
  );
}

/**
 * The relation card: the joint and its kind, how it follows (a curve drawn across the card, since the row's glyph
 * carries no numbers), where it can go, what carries it and what it moves. Terms sit in one quiet column, values in
 * the other.
 */
function RelationCard({ dof, driver, mechanism, value, driverValue, parts }: RelationProps): React.JSX.Element {
  const { coupling, limits } = dof;
  const factors = getDisplayFactors(mechanism);
  const inDisplay = (amount: number, kind: DegreeOfFreedom['kind']): string => withSymbol(amount * factors[kind], kind);
  const name = dofLabel(dof, mechanism);
  const driverName = dofLabel(driver, mechanism);
  const curve = coupling !== undefined && 'curve' in coupling ? coupling.curve : undefined;
  const travel = curve === undefined ? undefined : curveRange(curve);
  const parent = mechanism.joints[dof.jointId]?.parent;
  const shownParts = parts.slice(0, 4);
  return (
    <div className='flex flex-col gap-2.5'>
      <div className='flex flex-col gap-0.5'>
        <span className='truncate text-sm font-medium text-foreground'>{name}</span>
        <span className='text-xs text-muted-foreground'>
          {capitalize(mechanism.joints[dof.jointId]?.type ?? 'fixed')} follower
          {name === dof.jointId ? null : (
            <>
              {' · '}
              <span className='font-mono'>{dof.jointId}</span>
            </>
          )}
        </span>
      </div>
      {curve === undefined ? null : (
        <div className='flex items-center rounded-md bg-muted/60 px-3 py-2'>
          <CurveSparkline curve={curve} driverValue={driverValue} value={value} width={120} className='h-8 w-full' />
        </div>
      )}
      <dl className='grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-xs'>
        <FollowsTerm dof={dof} driver={driver} mechanism={mechanism} />
        {curve !== undefined && travel !== undefined ? (
          <Term term='Travel'>
            {inDisplay(travel.lower, dof.kind)} to {inDisplay(travel.upper, dof.kind)} over{' '}
            {inDisplay(curve.driverPeriod, driver.kind)} of {driverName}
          </Term>
        ) : (
          <Term term='Range'>
            {limits ? `${inDisplay(limits.lower, dof.kind)} to ${inDisplay(limits.upper, dof.kind)}` : 'Unlimited'}
          </Term>
        )}
        <Term term='On'>{parent === undefined ? '—' : linkLabel(parent, mechanism)}</Term>
        <Term term='Moves'>
          {parts.length === 0 ? (
            'No parts'
          ) : (
            <>
              {plural(parts.length, 'part')}
              <span className='block text-muted-foreground'>
                {shownParts.join(', ')}
                {parts.length > shownParts.length ? ` and ${parts.length - shownParts.length} more` : ''}
              </span>
            </>
          )}
        </Term>
      </dl>
    </div>
  );
}

/**
 * How a follower follows, as one outlined badge anchored right after the name so it never moves when the readout's
 * width changes: `0.25×` (the sign carries the sense) and `+ offset`, or the curve's sparkline; `of <joint>` only for
 * a follower of another follower. Hovering or focusing it opens the relation card.
 * @param props - The follower, its direct driver and their mechanism, both values, the parts it moves, every degree
 *   of freedom (for the accessible coupling text) and whether its driver heads the group it sits in.
 * @returns The badge with its card.
 */
export function RelationBadge({
  dofs,
  isGroupDriver,
  ...relation
}: RelationProps & Readonly<{ dofs: readonly DegreeOfFreedom[]; isGroupDriver: boolean }>): React.JSX.Element {
  const { dof, driver, mechanism, value, driverValue } = relation;
  const { coupling } = dof;
  const driverName = dofLabel(driver, mechanism);
  return (
    <HoverCard openDelay={150} closeDelay={100}>
      <HoverCardTrigger asChild>
        <Badge
          variant='outline'
          tabIndex={0}
          data-slot='kinematics-relation'
          aria-label={`Follows ${driverName}: ${describeCoupling(dof, dofs, mechanism)}`}
          className='h-6 min-w-0 shrink-[3] gap-1.5 px-2 font-mono text-[13px] font-normal text-muted-foreground tabular-nums outline-none focus-visible:focus-outline'
        >
          {coupling !== undefined && 'curve' in coupling ? (
            // The badge sizes direct svg children to 12 px; the span keeps the sparkline at 20.
            <span className='flex items-center'>
              <CurveSparkline curve={coupling.curve} driverValue={driverValue} value={value} className='h-5 w-auto' />
            </span>
          ) : coupling === undefined ? null : (
            <span>
              {formatRatio(displayRatio({ ratio: coupling.ratio, dof, driver, mechanism }))}×
              {coupling.offset
                ? ` +${withSymbol(coupling.offset * getDisplayFactors(mechanism)[dof.kind], dof.kind)}`
                : ''}
            </span>
          )}
          {isGroupDriver ? null : <span className='truncate font-sans text-muted-foreground/70'>of {driverName}</span>}
        </Badge>
      </HoverCardTrigger>
      <HoverCardContent side='bottom' align='start' className='w-72 p-3'>
        <RelationCard {...relation} />
      </HoverCardContent>
    </HoverCard>
  );
}
