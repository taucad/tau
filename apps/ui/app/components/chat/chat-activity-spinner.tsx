import { Suspense } from 'react';
import type { ComponentType } from 'react';
import type { MetalMorphSpinnerProperties } from '#components/geometry/loader/metal-morph-spinner.js';
import { Loader } from '@taucad/ui/components/loader';
import { cn } from '@taucad/ui/utils/cn';
import { load } from '#lib/code-loading.js';
import { lazy } from '#lib/lazy-component.js';

/** The flat spinner, which also stands in for the liquid-metal one while it loads or when its chunk fails. */
function FlatSpinner(): React.JSX.Element {
  return <Loader className='size-[0.9rem] shrink-0' />;
}

/* Decorative, so optional (PL7 FP9, D20): a chunk that fails to load degrades to the flat spinner and never fails
   the chat panel, nor reloads the page. */
const MetalMorphSpinnerLazy = lazy<ComponentType<MetalMorphSpinnerProperties>>(
  async () => {
    const module = await load(async () => import('#components/geometry/loader/metal-morph-spinner.js'), {
      optional: true,
    });
    return { default: module.MetalMorphSpinner };
  },
  { fallback: FlatSpinner },
);

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
 * the same opening. The fallback covers the initial renderer startup, and a chunk that failed to load.
 *
 * The footer reserves a `size-[0.9rem]` slot so the metallic shape stays legible beside its activity label. The
 * canvas is drawn at twice that, centred and overflowing, because the body only fills part of its frame.
 * The shared source supersamples every copy to keep its reflections crisp.
 */
export function ChatActivitySpinner({ className }: ChatActivitySpinnerProperties): React.JSX.Element {
  const flatSpinner = <FlatSpinner />;

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
