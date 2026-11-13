import { Button } from '#components/button.js';
import { Loader } from '#components/loader.js';
import { useWaitClock } from '#hooks/use-wait-clock.js';
import { cn } from '#utils/cn.js';
import type { WaitIndicatorTiming } from '#utils/wait-timing.js';

/**
 * Props for {@link WaitIndicator}.
 *
 * @public
 */
export type WaitIndicatorProps = Readonly<{
  /** Whether the wait is running: from its start until its content, or its failure, arrives. */
  active: boolean;
  /** What is being waited for, such as "Loading chat"; the indicator ends it with an ellipsis. */
  label: string;
  /** The words from 10,000 ms, such as "Still loading chat". Defaults to the label. */
  slowLabel?: string;
  /**
   * When the wait started, on the performance timeline (`performance.now()`, not `Date.now()`): `0` (the default) for
   * a wait that started with the document, the gesture's time for a later one, such as a refetch or a Retry. Milliseconds.
   */
  startedAt?: number;
  /** How far the wait is, from 0 to 1, shown as a whole percentage; omit while unknown. */
  progress?: number;
  /** Retries the wait. Offered beside the slow words. */
  onRetry?: () => void;
  /** The Retry control's words. Defaults to "Retry". */
  retryLabel?: string;
  /**
   * Whether the slot announces the wait. A route open is one group announced once by the route's own live region, so
   * the region indicators inside it pass `false`: they are seen, not announced. A wait started by a gesture after the
   * open is its own group and keeps the default.
   */
  live?: boolean;
  /** `inline` sits in a header's trailing slot; `pill` is the viewer status pill's skin. */
  variant?: 'inline' | 'pill';
  className?: string;
}>;

const variantClasses = {
  inline: 'gap-1.5 text-xs text-muted-foreground',
  pill: 'h-7 gap-1.5 rounded-lg border bg-sidebar px-2 text-xs text-foreground shadow-xs',
} as const;

/** The slot is as tall as its body at every state, so idle and active slots have one height. */
const slotHeightClasses = { inline: 'min-h-6', pill: 'min-h-7' } as const;

type WaitTimingStyle = React.CSSProperties & Partial<Record<`--wait-${string}`, string>>;

function timingStyle(timing: WaitIndicatorTiming): WaitTimingStyle | undefined {
  if (timing.state === 'waiting') {
    const style: WaitTimingStyle = {
      '--wait-reveal-delay': timing.revealDelay,
      '--wait-slow-delay': timing.slowDelay,
      '--wait-entrance': timing.entrance,
    };
    return style;
  }
  if (timing.state === 'holding') {
    const style: WaitTimingStyle = { '--wait-hide-delay': timing.hideDelay };
    return style;
  }
  return undefined;
}

/**
 * The one wait indicator for loading regions (UI Policy § 5 and § 6): a spinner and words in a slot the region's frame
 * already has, shown only once a wait passes 1,000 ms, kept at least 500 ms, and saying the wait is long, with Retry,
 * from 10,000 ms. It always carries words, because the spinner stops under reduced motion.
 *
 * The slot is always rendered, at its skin's height, so it can sit in a header's trailing slot without changing the header's
 * height. Its words are laid out (and hidden) from the wait's start, so the reveal moves nothing. While nothing is
 * showing the slot is empty to assistive technology, because hidden words are not in the accessibility tree; they
 * enter it only when revealed, so a fast load announces nothing. A CSS animation reveals them, so the server-rendered
 * element works before hydration and the component keeps it after.
 * The region's own container carries `aria-busy` for the whole wait; this slot does not.
 *
 * @param props - The wait, its words and the slot's skin.
 * @returns The indicator slot.
 * @public
 *
 * @example <caption>A chat header's trailing slot</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { WaitIndicator } from '@taucad/ui/components/wait-indicator';
 *
 * export const slot = createElement(WaitIndicator, {
 *   active: true,
 *   label: 'Loading chat',
 *   slowLabel: 'Still loading chat',
 *   live: false,
 * });
 * ```
 */
export function WaitIndicator({
  active,
  label,
  slowLabel,
  startedAt,
  progress,
  onRetry,
  retryLabel = 'Retry',
  live = true,
  variant = 'inline',
  className,
}: WaitIndicatorProps): React.JSX.Element {
  const { timing, wait } = useWaitClock({ active, startedAt });
  const isWaiting = timing.state === 'waiting';
  const hasSlowWords = slowLabel !== undefined || onRetry !== undefined;

  return (
    <span
      data-slot='wait-indicator'
      data-state={timing.state}
      role={live ? 'status' : undefined}
      className={cn('inline-flex items-center', slotHeightClasses[variant], className)}
    >
      {timing.state === 'idle' ? null : (
        <span
          // A new wait gets a new element, so its animations start from the new wait's delays.
          key={wait}
          data-slot='wait-indicator-body'
          style={timingStyle(timing)}
          className={cn('inline-flex items-center', variantClasses[variant], isWaiting ? 'wait-reveal' : 'wait-hold')}
        >
          <Loader className='size-3.5 text-primary' />
          {/* Both sets of words share one grid cell, so the slot is as wide as the longer and the swap moves nothing. */}
          <span className='inline-grid items-center'>
            <span
              data-slot='wait-indicator-label'
              className={cn('[grid-area:1/1] first-letter:uppercase', isWaiting && hasSlowWords && 'wait-until-slow')}
            >
              {label}…
            </span>
            {hasSlowWords ? (
              <span
                data-slot='wait-indicator-slow'
                className={cn(
                  'inline-flex items-center gap-1.5 [grid-area:1/1]',
                  isWaiting ? 'wait-after-slow' : 'invisible',
                )}
              >
                <span className='first-letter:uppercase'>{slowLabel ?? label}…</span>
                {onRetry === undefined ? null : (
                  <Button type='button' variant='ghost' size='xs' className='min-w-6' onClick={onRetry}>
                    {retryLabel}
                  </Button>
                )}
              </span>
            ) : null}
          </span>
          {progress === undefined ? null : (
            <span className='text-muted-foreground tabular-nums'>
              {Math.round(Math.min(Math.max(progress, 0), 1) * 100)}%
            </span>
          )}
        </span>
      )}
    </span>
  );
}
