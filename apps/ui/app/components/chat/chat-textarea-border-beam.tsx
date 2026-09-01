import { cn } from '@taucad/ui/utils/cn';

type ChatTextareaBorderBeamProps = {
  /**
   * When true, renders the spinning conic-gradient ring; when false,
   * renders nothing. Caller decides the gating signal (typically the
   * `isSubmitting` flag returned by `useChatTextareaLogic`).
   */
  readonly isActive: boolean;
  /**
   * Tailwind classes appended to the beam wrapper. Use this to override
   * the default `rounded-2xl` corner radius (or the `-inset-0.5` ring
   * width) when the host container's shape differs — e.g. a composer
   * with `rounded-sm` would forward `rounded-sm` here so the beam
   * follows the same shape and stays concentric with the border.
   */
  readonly className?: string;
};

/**
 * Decorative tracer beam that overlays the host container's border with
 * a slow-spinning conic-gradient comet. The wrapper sits just OUTSIDE
 * the host container — positioned `-inset-0.5` relative to a sibling
 * positioning shell — so the host's static border continues to paint at
 * full strength underneath; the beam is purely additive chrome and
 * never replaces the border.
 *
 * Architecture note: this component MUST be rendered inside a sibling
 * `position: relative` shell that auto-sizes to the host container, and
 * that shell MUST NOT carry a `className` passthrough. Any padding /
 * border-radius forwarded to the shell would offset the host container
 * away from the beam and the visible ring would lose its uniform width
 * (the cause of the previous "fat at the top" bug — `pt-1` on the shell
 * produced a 5px gap on the top vs 1px elsewhere). All host-container
 * styling overrides live on the host container itself.
 *
 * @example <caption>typical wiring</caption>
 * ```tsx
 * <div className='relative size-full'>
 *   <ChatTextareaBorderBeam isActive={isSubmitting} />
 *   <div ref={containerReference} className={cn('border bg-background rounded-2xl size-full', className)}>
 *     {children}
 *   </div>
 * </div>
 * ```
 */
export function ChatTextareaBorderBeam({
  isActive,
  className,
}: ChatTextareaBorderBeamProps): React.JSX.Element | undefined {
  if (!isActive) {
    return undefined;
  }
  return (
    <div aria-hidden className={cn('pointer-events-none absolute -inset-0.5 overflow-hidden rounded-2xl', className)}>
      <div
        className={cn(
          // Spinning square is sized to be larger than any composer
          // (`max(200%, 200vh)` covers tall narrow mobile composers too)
          // so the conic-gradient's centre stays well inside the comet's
          // painted area regardless of host aspect ratio.
          'absolute top-1/2 left-1/2 aspect-square w-[max(200%,200vh)] -translate-x-1/2 -translate-y-1/2',
          'animate-spin animation-duration-[3s]',
          // Comet wedge: 35% of the gradient (~126°), peak at 90% with
          // a long ~90° trail and a sharper ~36° leading edge so the
          // ring reads as a moving beam, not a wedge of light.
          'bg-[conic-gradient(from_0deg,transparent_0%,transparent_65%,var(--color-primary)_90%,transparent_100%)]',
        )}
      />
    </div>
  );
}
