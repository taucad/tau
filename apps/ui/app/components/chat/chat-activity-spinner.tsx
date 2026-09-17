import { lazy, Suspense } from 'react';
import { LoaderCircle } from 'lucide-react';
import { cn } from '@taucad/ui/utils/cn';

const MetalMorphSpinnerLazy = lazy(async () => {
  const module = await import('#components/geometry/loader/metal-morph-spinner.js');
  return { default: module.MetalMorphSpinner };
});

export type ChatActivitySpinnerProperties = Readonly<{
  className?: string;
}>;

/**
 * The spinner for a chat row that is still working: a tool call in a partial state, or the planning indicator
 * between parts.
 *
 * Every one of these draws from the page's shared liquid-metal renderer, so a turn with a dozen tool calls in
 * flight still costs one GPU context. It is decorative — the row's own text already carries the status — and
 * it shows the flat spinner until the first frame arrives.
 */
export function ChatActivitySpinner({ className }: ChatActivitySpinnerProperties): React.JSX.Element {
  const flatSpinner = <LoaderCircle className={cn('size-3 shrink-0 animate-spin', className)} />;

  return (
    <Suspense fallback={flatSpinner}>
      <MetalMorphSpinnerLazy className={cn('size-4 shrink-0', className)} fallback={flatSpinner} />
    </Suspense>
  );
}
