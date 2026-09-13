import { Loader2Icon } from 'lucide-react';

import { cn } from '#utils/ui.utils.js';

function Spinner({ className, ...props }: React.ComponentProps<'svg'>): React.JSX.Element {
  return (
    <Loader2Icon
      role='status'
      aria-label='Loading'
      className={cn('size-4 animate-spin [animation-duration:500ms]', className)}
      {...props}
    />
  );
}

export { Spinner };
