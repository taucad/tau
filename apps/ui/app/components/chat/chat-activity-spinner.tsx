import { lazy, Suspense } from 'react';
import { LoaderCircle } from 'lucide-react';
import { cn } from '@taucad/ui/utils/cn';

const loadMetalMorphSpinner = async () => import('#components/geometry/loader/metal-morph-spinner.js');

const MetalMorphSpinnerLazy = lazy(async () => {
  const module = await loadMetalMorphSpinner();
  return { default: module.MetalMorphSpinner };
});

/**
 * Build the page's one spinner renderer before a row needs it. Coming up costs a few hundred milliseconds of
 * adapter probe, studio environment and shader compile, which is exactly what the stand-in covers, so callers
 * warm it as soon as a turn is live rather than when the row appears. Repeat calls are free.
 */
export const warmChatActivitySpinner = async (theme: 'dark' | 'light'): Promise<void> => {
  const module = await loadMetalMorphSpinner();
  await module.warmMetalMorphSpinner(theme);
};

export type ChatActivitySpinnerProperties = Readonly<{
  className?: string;
}>;

/**
 * The spinner for a chat row that is still working: a tool call in a partial state, or the planning indicator
 * between parts. It is decorative, because the row's own text already carries the status.
 *
 * Every one of these paints from the page's single liquid-metal renderer rather than owning a GPU context, so
 * a turn with a dozen rows in flight still costs one surface and every row holds the same pose. The renderer
 * survives a row that comes and goes, so the walk carries on where the last row left it instead of replaying
 * the same opening, and {@link warmChatActivitySpinner} has it running before the first row appears.
 *
 * The slot is the same `size-3` box as every other row icon so icon and text columns line up; the canvas is
 * drawn at twice that, centred and overflowing, because the body only fills part of its frame. A glyph this
 * small also needs more device pixels than it owns, which the shared source supersamples for every copy.
 */
export function ChatActivitySpinner({ className }: ChatActivitySpinnerProperties): React.JSX.Element {
  const flatSpinner = <LoaderCircle className='size-3 shrink-0 animate-spin motion-reduce:animate-none' />;

  return (
    <span
      aria-hidden='true'
      data-slot='chat-activity-spinner'
      className={cn('relative inline-flex size-3 shrink-0', className)}
    >
      <Suspense fallback={flatSpinner}>
        <MetalMorphSpinnerLazy
          className='pointer-events-none absolute top-1/2 left-1/2 size-6 -translate-1/2'
          fallback={flatSpinner}
        />
      </Suspense>
    </span>
  );
}
