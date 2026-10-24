import { Box, LayoutGrid, MessageCircle, SlidersHorizontal } from 'lucide-react';
import { cn } from '@taucad/ui/utils/cn';

const destinations = [
  { id: 'chat', label: 'Chat', icon: MessageCircle },
  { id: 'parameters', label: 'Parameters', icon: SlidersHorizontal },
  { id: 'model', label: 'Model', icon: Box },
  { id: 'all', label: 'All', icon: LayoutGrid },
] as const;

type Destination = (typeof destinations)[number]['id'];

/** The mobile workbench's primary destinations; secondary surfaces live under All. */
export function MobileWorkbenchNavigation({
  active,
  onSelect,
  className,
}: {
  readonly active: string;
  readonly onSelect: (destination: Destination) => void;
  readonly className?: string;
}): React.JSX.Element {
  return (
    <nav
      aria-label='Workbench'
      className={cn(
        'grid shrink-0 grid-cols-[repeat(auto-fit,minmax(min(100%,4rem),1fr))] gap-1 rounded-none border-x-0 border-t border-b-0 bg-background px-2 pb-1',
        className,
      )}
    >
      {destinations.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          type='button'
          aria-current={active === id ? 'page' : undefined}
          onClick={() => {
            onSelect(id);
          }}
          className={cn(
            'flex min-h-11 min-w-0 flex-col items-center justify-center gap-0.5 rounded-lg border border-transparent text-xs outline-none focus-visible:focus-outline',
            active === id
              ? 'border-border bg-background font-medium text-foreground'
              : 'text-muted-foreground hover:bg-accent/60',
          )}
        >
          <Icon aria-hidden className='size-4' />
          <span className='max-w-full text-center wrap-anywhere'>{label}</span>
        </button>
      ))}
    </nav>
  );
}
