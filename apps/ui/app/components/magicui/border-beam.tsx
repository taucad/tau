import type { MotionStyle, Transition } from 'motion/react';
import { motion } from 'motion/react';
import { cn } from '#utils/ui.utils.js';

type BorderBeamProps = {
  /**
   * The size of the border beam.
   */
  readonly size?: number;
  /**
   * The duration of the border beam.
   */
  readonly duration?: number;
  /**
   * The delay of the border beam.
   */
  readonly delay?: number;
  /**
   * The color of the border beam from.
   */
  readonly colorFrom?: string;
  /**
   * The color of the border beam to.
   */
  readonly colorTo?: string;
  /**
   * The motion transition of the border beam.
   */
  readonly transition?: Transition;
  /**
   * The class name of the border beam.
   */
  readonly className?: string;
  /**
   * The style of the border beam.
   */
  readonly style?: React.CSSProperties;
  /**
   * Whether to reverse the animation direction.
   */
  readonly isReverse?: boolean;
  /**
   * The initial offset position (0-100).
   */
  readonly initialOffset?: number;
  /**
   * The border width of the beam.
   */
  readonly borderWidth?: number;
};

export function BorderBeam({
  className,
  size = 50,
  delay = 0,
  duration = 6,
  colorFrom = '#ffaa40',
  colorTo = '#9c40ff',
  transition,
  style,
  isReverse = false,
  initialOffset = 0,
  borderWidth = 1,
}: BorderBeamProps): React.JSX.Element {
  return (
    <div
      className="pointer-events-none absolute inset-0 rounded-[inherit] border-(length:--border-beam-width) border-transparent [mask-image:linear-gradient(transparent,transparent),linear-gradient(#000,#000)] [mask-composite:intersect] [mask-clip:padding-box,border-box]"
      style={
        {
          '--border-beam-width': `${borderWidth}px`,
        } as React.CSSProperties
      }
    >
      <motion.div
        className={cn(
          'absolute aspect-square',
          'bg-gradient-to-l from-[var(--color-from)] via-[var(--color-to)] to-transparent',
          className,
        )}
        style={
          {
            width: size,
            offsetPath: `rect(0 auto auto 0 round ${size}px)`,
            '--color-from': colorFrom,
            '--color-to': colorTo,
            ...style,
          } as MotionStyle
        }
        initial={{ offsetDistance: `${initialOffset}%` }}
        animate={{
          offsetDistance: isReverse
            ? [`${100 - initialOffset}%`, `${-initialOffset}%`]
            : [`${initialOffset}%`, `${100 + initialOffset}%`],
        }}
        transition={{
          repeat: Infinity,
          ease: 'linear',
          duration,
          delay: -delay,
          ...transition,
        }}
      />
    </div>
  );
}
