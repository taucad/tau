import { Route } from 'lucide-react';
import { cn } from '@taucad/ui/utils/cn';

/** Auto's glyph: Lucide Route, in the colour of the row it sits in. */
export function AutoKernelGlyph({ className }: { readonly className?: string }): React.JSX.Element {
  return <Route aria-hidden className={cn('size-4 shrink-0', className)} />;
}
