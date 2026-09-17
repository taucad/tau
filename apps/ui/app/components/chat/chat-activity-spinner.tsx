import { lazy, Suspense } from 'react';
import { LoaderCircle } from 'lucide-react';
import { cn } from '@taucad/ui/utils/cn';

const MetalMorphLoaderLazy = lazy(async () => {
  const module = await import('#components/geometry/loader/metal-morph-loader.js');
  return { default: module.MetalMorphLoader };
});

export type ChatActivitySpinnerProperties = Readonly<{
  className?: string;
}>;

/**
 * The spinner for a chat row that is still working: a tool call in a partial state, or the planning indicator
 * between parts. It is the liquid-metal loader at its inline tier, decorative because the row's own text
 * already carries the status, and it shows the flat spinner until the renderer has drawn its first frame.
 */
export function ChatActivitySpinner({ className }: ChatActivitySpinnerProperties): React.JSX.Element {
  const flatSpinner = <LoaderCircle className={cn('size-3 shrink-0 animate-spin', className)} />;

  return (
    <Suspense fallback={flatSpinner}>
      <MetalMorphLoaderLazy
        className={cn('size-4 shrink-0', className)}
        quality='inline'
        semantic='presentation'
        fallback={flatSpinner}
      />
    </Suspense>
  );
}
