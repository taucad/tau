import { cn } from '#utils/cn.js';

type LoaderProps = Omit<React.ComponentProps<'svg'>, 'children'>;

const radius = 9;
const strokeWidth = 2;
/** The tail sweeps three quarters of the ring, fading from clear to the solid head. */
const tailSweep = 270;
const segmentCount = 48;

const pointAt = (degrees: number): string => {
  const radians = (degrees * Math.PI) / 180;
  return `${(12 + radius * Math.sin(radians)).toFixed(3)} ${(12 - radius * Math.cos(radians)).toFixed(3)}`;
};

/* SVG has no conic gradient, so the fading tail is a stack of arcs that all end at the head. Each
   starts a little further round and adds a little opacity, so the opacity they build up rises with
   the square of the distance along the tail. Abutting arcs would leave hairline joins; stacked arcs
   have none. */
const tailSegments = Array.from({ length: segmentCount }, (_, index) => {
  const before = (index / segmentCount) ** 2;
  const after = ((index + 1) / segmentCount) ** 2;
  const start = (index * tailSweep) / segmentCount;
  const largeArc = tailSweep - start > 180 ? 1 : 0;
  return {
    path: `M${pointAt(start)}A${radius} ${radius} 0 ${largeArc} 1 ${pointAt(tailSweep)}`,
    opacity: Number(((after - before) / (1 - before)).toFixed(4)),
  };
});
const headPath = `M${pointAt(tailSweep - 0.01)}A${radius} ${radius} 0 0 1 ${pointAt(tailSweep)}`;

/**
 * An indeterminate spinner: a solid leading head that turns clockwise with a tail fading out behind it.
 * It is hidden from assistive technology unless it is given an accessible name; otherwise the caller
 * announces the busy state.
 *
 * @param props - Optional classes and SVG attributes such as `role` and `aria-label`.
 * @returns The spinner.
 *
 * @public
 */
export function Loader({ className, ...props }: LoaderProps): React.JSX.Element {
  const isNamed = props['aria-label'] !== undefined || props['aria-labelledby'] !== undefined;
  return (
    <svg
      aria-hidden={isNamed ? undefined : true}
      width='24'
      height='24'
      viewBox='0 0 24 24'
      fill='none'
      {...props}
      className={cn('spin-glyph', className)}
    >
      <g stroke='currentColor' strokeWidth={strokeWidth}>
        {tailSegments.map((segment) => (
          <path key={segment.path} d={segment.path} strokeOpacity={segment.opacity} />
        ))}
        <path d={headPath} strokeLinecap='round' />
      </g>
    </svg>
  );
}
