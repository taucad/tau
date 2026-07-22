import { cn } from '#utils/ui.utils.js';
import { Tau } from '#components/icons/tau.js';

export function LogoLoader({ className }: { readonly className?: string }): React.JSX.Element {
  return (
    <div className={cn('size-4 animate-pulse-subtle', className)} style={{ zIndex: 10 }}>
      <Tau className='size-full' />
    </div>
  );
}
