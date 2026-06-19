import { Link } from 'react-router';
import { TauWordmark } from '#components/icons/tau-wordmark.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '#components/ui/tooltip.js';
import { ForkAction } from '#routes/v.$id/fork-action.js';
import type { ParsedPublication } from '#routes/v.$id/parsed-publication.js';
import { cn } from '#utils/ui.utils.js';

type PublicationTopbarProps = {
  readonly publication: ParsedPublication;
  readonly files: Map<string, { filename: string; content: Uint8Array<ArrayBuffer> }>;
  readonly className?: string;
};

/**
 * Slim self-owned top bar for `/v/:id` (no Tau app shell). Wordmark + Remix only;
 * title and meta strip live in the bottom hero strip.
 */
export function PublicationTopbar({ publication, files, className }: PublicationTopbarProps): React.JSX.Element {
  return (
    <header
      data-slot='publication-topbar'
      className={cn('flex h-12 shrink-0 items-center justify-between gap-4 border-b px-4', className)}
    >
      <Tooltip>
        <TooltipTrigger asChild className='flex items-center gap-2 font-medium'>
          <Link to='/' aria-label='Go home'>
            <TauWordmark className='h-6 text-primary' />
          </Link>
        </TooltipTrigger>
        <TooltipContent side='right'>Go home</TooltipContent>
      </Tooltip>
      <div className='flex items-center gap-2'>
        <ForkAction publication={publication} files={files} />
      </div>
    </header>
  );
}
