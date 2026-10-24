import { Box, LayoutGrid, MessageCircle, SlidersHorizontal } from 'lucide-react';
import { cn } from '@taucad/ui/utils/cn';

const destinations = [
  { id: 'chat', label: 'Chat', icon: MessageCircle },
  { id: 'parameters', label: 'Parameters', icon: SlidersHorizontal },
  { id: 'model', label: 'Model', icon: Box },
  { id: 'all', label: 'All', icon: LayoutGrid },
] as const;

type Destination = (typeof destinations)[number]['id'];

/**
 * The nav's height contract, set on the shell and on any portalled surface that sits above the nav: `--nav-height` is
 * the button row (its top border, 40px targets and 2px of padding), and `--nav-offset` adds the home-indicator inset beneath it.
 */
export const mobileWorkbenchNavigationHeight =
  '[--nav-height:calc(var(--spacing)*11)] [--nav-offset:calc(var(--nav-height)_+_env(safe-area-inset-bottom))]';

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
        'grid h-(--nav-offset) shrink-0 grid-cols-[repeat(auto-fit,minmax(min(100%,4rem),1fr))] items-center gap-1 rounded-none border-x-0 border-t border-b-0 bg-background px-2 pt-px',
        // 1px border + 1px + 40px buttons + 2px fills --nav-height exactly; the home-indicator inset goes below the buttons.
        'pb-[calc(var(--spacing)*0.5_+_env(safe-area-inset-bottom))]',
        mobileWorkbenchNavigationHeight,
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
            'flex h-10 min-w-0 flex-col items-center justify-center gap-0.5 rounded-lg border border-transparent text-xs outline-none focus-visible:focus-outline',
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
