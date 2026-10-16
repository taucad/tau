/**
 * The Kinematics pane's live instruments. Every one shares one grammar: a faint path for where a joint can go (a
 * dial's ring or limits arc, a track's bar, a curve over one driver period), a darker trail for where it has gone
 * since the as-built pose, and one dot for where it is now (a dial keeps a hand, since a dot on a 12 px ring does not
 * read as an angle). No end marks: the extents are numbers, and they live in the relation card. Monochrome, drawn
 * with semantic stroke and fill tokens. Design: docs/research/kinematics-pane-ux-blueprint.md § Refinement round.
 */
import { useMemo } from 'react';
import { ArrowLeftRight, MoveRight, Repeat } from 'lucide-react';
import type { Animation, CouplingCurve, JointLimits } from '@taucad/kinematics';
import { Tooltip, TooltipContent, TooltipTrigger } from '@taucad/ui/components/tooltip';
import { cn } from '@taucad/ui/utils/cn';

const pathClass = 'fill-none stroke-muted-foreground/45';
const trailClass = 'fill-none stroke-foreground/75';
const lineStroke = { strokeWidth: 1.25, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;
const dotRadius = 2;
const dotClass = 'fill-foreground';

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

const dialRadius = 6;

/** A point on the dial ring at `degrees` counter-clockwise from twelve o'clock, as a CAD angle turns. */
const dialPoint = (degrees: number): readonly [number, number] => {
  const radians = (degrees * Math.PI) / 180;
  return [8 - dialRadius * Math.sin(radians), 8 - dialRadius * Math.cos(radians)];
};

/** The ring arc from `from` counter-clockwise to `to`, in degrees, `from` below `to`, under a full turn. */
const dialArc = (from: number, to: number): string => {
  const [x1, y1] = dialPoint(from);
  const [x2, y2] = dialPoint(to);
  const isLarge = to - from > 180 ? 1 : 0;
  return `M${x1.toFixed(2)} ${y1.toFixed(2)}A${dialRadius} ${dialRadius} 0 ${isLarge} 0 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
};

/**
 * A 16 px dial: the ring is the joint's range (the full circle when unlimited, the arc between its limits over a
 * border-coloured ring), the trail the angle swept from the as-built pose at twelve o'clock (the whole ring past a
 * full turn), the hand its value. The hand rotates by transform only.
 * @param props - `value` and `limits` in degrees; `limits` undefined for an unlimited joint.
 * @returns The dial, hidden from assistive technology.
 */
export function AngleDial({
  value,
  limits,
  className,
}: {
  readonly value: number;
  readonly limits: JointLimits | undefined;
  readonly className?: string;
}): React.JSX.Element {
  const lower = limits?.lower ?? -Infinity;
  const upper = limits?.upper ?? Infinity;
  const isFullTurn = !Number.isFinite(lower) || !Number.isFinite(upper) || upper - lower >= 360;
  const swept = Math.min(Math.abs(value), 360);
  return (
    <svg viewBox='0 0 16 16' aria-hidden className={cn('size-4 shrink-0 overflow-visible', className)}>
      <circle
        cx='8'
        cy='8'
        r={dialRadius}
        {...lineStroke}
        className={isFullTurn ? pathClass : 'fill-none stroke-border'}
      />
      {isFullTurn ? null : <path d={dialArc(lower, upper)} {...lineStroke} className={pathClass} />}
      {swept >= 360 ? (
        <circle cx='8' cy='8' r={dialRadius} {...lineStroke} className={trailClass} />
      ) : swept > 0 ? (
        <path d={value > 0 ? dialArc(0, swept) : dialArc(-swept, 0)} {...lineStroke} className={trailClass} />
      ) : null}
      <g style={{ transform: `rotate(${-value}deg)`, transformOrigin: '8px 8px' }}>
        <path d='M8 8V2.5' strokeWidth='1.5' strokeLinecap='round' className='stroke-foreground' />
      </g>
      <circle cx='8' cy='8' r='1.25' className={dotClass} />
    </svg>
  );
}

const trackStart = 2;
const trackEnd = 22;

/**
 * A 24 px track for a distance: the bar is `range`, the trail runs from the as-built position (or the nearer end
 * when zero lies outside the range) to the dot, the dot is the value.
 * @param props - `value` and `range` in one unit.
 * @returns The track, hidden from assistive technology.
 */
export function TravelTrack({
  value,
  range,
  className,
}: {
  readonly value: number;
  readonly range: Required<JointLimits>;
  readonly className?: string;
}): React.JSX.Element {
  const span = range.upper - range.lower;
  const at = span > 0 ? clamp01((value - range.lower) / span) : 0;
  const from = span > 0 ? clamp01((0 - range.lower) / span) : 0;
  const x = (fraction: number): string => (trackStart + (trackEnd - trackStart) * fraction).toFixed(2);
  return (
    <svg viewBox='0 0 24 16' aria-hidden className={cn('h-4 w-6 shrink-0 overflow-visible', className)}>
      <path d={`M${trackStart} 8H${trackEnd}`} {...lineStroke} className={pathClass} />
      {at === from ? null : <path d={`M${x(from)} 8H${x(at)}`} {...lineStroke} className={trailClass} />}
      <circle cx={x(at)} cy='8' r={dotRadius} className={dotClass} />
    </svg>
  );
}

const sparkWidth = 36;
const sparkHeight = 16;
const sparkPad = 2.5;

/**
 * The range a sampled coupling curve covers.
 * @param curve - The coupling's samples over one driver period.
 * @returns Its lowest and highest sample, in the follower's mechanism units.
 */
export const curveRange = (curve: CouplingCurve): Required<JointLimits> => ({
  lower: Math.min(...curve.values),
  upper: Math.max(...curve.values),
});

/**
 * One period of a curve coupling as a sparkline 16 units tall: the faint curve is the whole period, the trail the
 * part traced since the period began, the dot the driver's phase on the follower's value, so it rides the curve as
 * the driver moves. Decorative: the relation badge and card carry the words.
 * @param props - `driverValue` and `value` in mechanism units (the dot's x is the driver's phase within
 *   `driverPeriod`, its y the follower's value); `width` in user units, 36 for the badge, wider for the card.
 * @returns The sparkline, hidden from assistive technology.
 */
export function CurveSparkline({
  curve,
  driverValue,
  value,
  width = sparkWidth,
  className,
}: {
  readonly curve: CouplingCurve;
  readonly driverValue: number;
  readonly value: number;
  readonly width?: number;
  readonly className?: string;
}): React.JSX.Element {
  const count = curve.values.length;
  const { y, points } = useMemo(() => {
    const { lower, upper } = curveRange(curve);
    const span = upper - lower || 1;
    const toY = (sample: number): string =>
      (sparkHeight - sparkPad - ((sample - lower) / span) * (sparkHeight - 2 * sparkPad)).toFixed(2);
    const toPoint = (sample: number, index: number): string =>
      `${((index / curve.values.length) * width).toFixed(2)},${toY(sample)}`;
    return { y: toY, points: [...curve.values, curve.values[0] ?? 0].map((sample, index) => toPoint(sample, index)) };
  }, [curve, width]);
  const { driverPeriod } = curve;
  const phase = (((driverValue % driverPeriod) + driverPeriod) % driverPeriod) / driverPeriod;
  const nowX = (phase * width).toFixed(2);
  const trail = [...points.slice(0, Math.floor(phase * count) + 1), `${nowX},${y(value)}`].join(' ');
  return (
    <svg
      viewBox={`0 0 ${width} ${sparkHeight}`}
      aria-hidden
      className={cn('h-4 w-9 shrink-0 overflow-visible', className)}
    >
      <polyline points={points.join(' ')} {...lineStroke} className={pathClass} />
      <polyline points={trail} {...lineStroke} className={trailClass} />
      <circle cx={nowX} cy={y(value)} r={dotRadius} className={dotClass} />
    </svg>
  );
}

const loopCopy = { none: 'Plays once', repeat: 'Repeats', pingPong: 'Back and forth' } as const;

/**
 * The clip's loop mode as a glyph, named in a tooltip and for assistive technology.
 * @param props - The clip's loop mode; none plays once.
 * @returns A focusable image with its name.
 */
export function LoopGlyph({ loop = 'none' }: { readonly loop?: Animation['loop'] }): React.JSX.Element {
  const Icon = loop === 'repeat' ? Repeat : loop === 'pingPong' ? ArrowLeftRight : MoveRight;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* A button only so the tooltip has a keyboard path; it does nothing on its own. */}
        <button
          type='button'
          aria-label={loopCopy[loop]}
          className='inline-flex size-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground outline-none focus-visible:focus-outline'
        >
          <Icon aria-hidden className='size-3.5' />
        </button>
      </TooltipTrigger>
      <TooltipContent>{loopCopy[loop]}</TooltipContent>
    </Tooltip>
  );
}

const ringRadius = 13.5;
const ringLength = 2 * Math.PI * ringRadius;

/**
 * Draws the clip's phase as an arc on a 28 px round outlined button's own border while it plays or is paused.
 * @param props - `phase` from 0 to 1, whether the arc shows, and the button it wraps.
 * @returns The button with the arc over its border.
 */
export function ProgressRing({
  phase,
  isVisible,
  children,
}: {
  readonly phase: number;
  readonly isVisible: boolean;
  readonly children: React.ReactNode;
}): React.JSX.Element {
  return (
    <span className='relative inline-flex shrink-0'>
      {children}
      <svg
        viewBox='0 0 28 28'
        aria-hidden
        className={cn(
          'pointer-events-none absolute inset-0 size-7 -rotate-90 transition-opacity duration-150 motion-reduce:transition-none',
          isVisible ? 'opacity-100' : 'opacity-0',
        )}
      >
        <circle
          cx='14'
          cy='14'
          r={ringRadius}
          strokeWidth='1.5'
          strokeLinecap='round'
          strokeDasharray={`${(clamp01(phase) * ringLength).toFixed(2)} ${ringLength.toFixed(2)}`}
          className='fill-none stroke-foreground'
        />
      </svg>
    </span>
  );
}
