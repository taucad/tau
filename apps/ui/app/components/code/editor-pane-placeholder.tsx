import { Skeleton } from '@taucad/ui/components/skeleton';
import { cn } from '@taucad/ui/utils/cn';

/* Ragged code-shaped line lengths, as fractions of the pane. */
const lineWidths = ['42%', '68%', '55%', '30%', '0%', '61%', '74%', '48%', '36%', '0%', '58%', '44%'] as const;

/**
 * What an editor pane shows until its editor can mount: the editor's own
 * background, and — only if the wait outlasts a blink — faint code-shaped
 * lines where the text will be. The single loading owner for code panes, so a
 * pane never cycles through spinners, text and a blank on its way in.
 *
 * @param props - The screen-reader label, and optional classes for the frame.
 * @returns The placeholder.
 */
export function EditorPanePlaceholder({
  label,
  className,
}: {
  readonly label: string;
  readonly className?: string;
}): React.JSX.Element {
  return (
    <div
      role='status'
      aria-busy='true'
      data-slot='editor-pane-placeholder'
      className={cn('size-full overflow-hidden bg-background', className)}
    >
      <span className='sr-only'>{label}</span>
      {/* Held back 300ms so a warm load never flashes lines; reduced motion shows them at once. */}
      <div
        aria-hidden='true'
        className='flex animate-in flex-col gap-2 py-1.5 pr-6 pl-16 duration-300 fill-mode-both [animation-delay:300ms] fade-in motion-reduce:animate-none'
      >
        {lineWidths.map((width, index) => (
          <Skeleton
            // oxlint-disable-next-line react/no-array-index-key -- static decorative list
            key={index}
            className={cn('h-3 shrink-0 rounded-sm', width === '0%' && 'invisible')}
            style={{ width }}
          />
        ))}
      </div>
    </div>
  );
}
