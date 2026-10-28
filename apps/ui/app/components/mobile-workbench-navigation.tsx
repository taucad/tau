import { Box, LayoutGrid, MessageCircle, SlidersHorizontal } from 'lucide-react';
import { useId } from 'react';
import { cn } from '@taucad/ui/utils/cn';

const destinations = [
  { id: 'chat', label: 'Chat', icon: MessageCircle },
  { id: 'parameters', label: 'Parameters', icon: SlidersHorizontal },
  { id: 'model', label: 'Model', icon: Box },
  { id: 'all', label: 'All', icon: LayoutGrid },
] as const;

type Destination = (typeof destinations)[number]['id'];

/** Something waiting behind a destination: an attention dot, and the sentence a screen reader hears after its name. */
export type MobileWorkbenchDestinationCue = Readonly<{
  tone: 'attention' | 'failed';
  description: string;
}>;

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
  cues,
}: {
  readonly active: string;
  readonly onSelect: (destination: Destination) => void;
  readonly className?: string;
  /** Cues by destination; the name stays the label, the cue is its description (I6). */
  readonly cues?: Partial<Record<Destination, MobileWorkbenchDestinationCue>>;
}): React.JSX.Element {
  const cueId = useId();
  return (
    <nav
      aria-label='Workbench'
      className={cn(
        'grid h-(--nav-offset) shrink-0 auto-cols-fr grid-flow-col items-center gap-1 rounded-none border-x-0 border-t border-b-0 bg-background px-2 pt-px',
        // One row whatever the text size: the row's height is fixed (--nav-height), so a destination that wrapped to a
        // second row would sit under the viewport's edge. 1px border + 1px + 40px buttons + 2px fills --nav-height
        // exactly; the home-indicator inset goes below the buttons.
        'pb-[calc(var(--spacing)*0.5_+_env(safe-area-inset-bottom))]',
        mobileWorkbenchNavigationHeight,
        className,
      )}
    >
      {destinations.map(({ id, label, icon: Icon }) => {
        const cue = cues?.[id];
        return (
          <button
            key={id}
            type='button'
            aria-current={active === id ? 'page' : undefined}
            aria-describedby={cue ? `${cueId}-${id}` : undefined}
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
            <span className='relative'>
              <Icon aria-hidden className='size-4' />
              {cue ? (
                <span
                  aria-hidden
                  data-slot='destination-cue'
                  data-tone={cue.tone}
                  className={cn(
                    'absolute -top-0.5 -right-1 size-2 rounded-full ring-2 ring-background',
                    // The sidebar's mark hues (status-mark.tsx): amber needs you, the feature hue failed.
                    cue.tone === 'failed' ? 'bg-feature/80' : 'bg-warning/80',
                  )}
                />
              ) : null}
            </span>
            {/* One line: the button is 40px for an icon and a line, so large text truncates the label, never the target. */}
            <span className='max-w-full truncate'>{label}</span>
            {cue ? (
              // Hidden from the name computation, still read as the description.
              <span hidden id={`${cueId}-${id}`}>
                {cue.description}
              </span>
            ) : null}
          </button>
        );
      })}
    </nav>
  );
}
