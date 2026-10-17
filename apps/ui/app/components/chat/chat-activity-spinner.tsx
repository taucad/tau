import { lazy, Suspense } from 'react';
import { LoaderCircle } from 'lucide-react';
import { cn } from '@taucad/ui/utils/cn';

const loadMetalMorphSpinner = async () => import('#components/geometry/loader/metal-morph-spinner.js');

const MetalMorphSpinnerLazy = lazy(async () => {
  const module = await loadMetalMorphSpinner();
  return { default: module.MetalMorphSpinner };
});

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
 * the same opening. The fallback covers the initial renderer startup.
 *
 * The footer reserves a `size-[0.9rem]` slot so the metallic shape stays legible beside its activity label. The
 * canvas is drawn at twice that, centred and overflowing, because the body only fills part of its frame.
 * The shared source supersamples every copy to keep its reflections crisp.
 */
export function ChatActivitySpinner({ className }: ChatActivitySpinnerProperties): React.JSX.Element {
  const flatSpinner = <LoaderCircle className='size-[0.9rem] shrink-0 spin-glyph' />;

  return (
    <span
      aria-hidden='true'
      data-slot='chat-activity-spinner'
      className={cn('relative inline-flex size-[0.9rem] shrink-0', className)}
    >
      <Suspense fallback={flatSpinner}>
        <MetalMorphSpinnerLazy
          className='pointer-events-none absolute top-1/2 left-1/2 size-[1.8rem] -translate-1/2'
          fallback={flatSpinner}
        />
      </Suspense>
    </span>
  );
}
