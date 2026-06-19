import { Eye, GitFork } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '#components/ui/avatar.js';
import { formatNumberAbbreviation } from '#utils/number.utils.js';
import { formatRelativeTime } from '#utils/date.utils.js';
import { cn } from '#utils/ui.utils.js';
import type { ParsedPublication } from '#routes/v.$id/parsed-publication.js';

type PublicationHeroStripProps = {
  readonly publication: ParsedPublication;
  readonly className?: string;
};

const initialFromName = (name: string): string => {
  const trimmed = name.trim();
  if (trimmed === '') {
    return '?';
  }

  return trimmed.charAt(0).toUpperCase();
};

/**
 * Hero info strip pinned to the bottom of the viewer column. Translucent panel
 * with the publication's title, description, owner by-line, view/fork counts,
 * and relative publish time.
 */
export function PublicationHeroStrip({ publication, className }: PublicationHeroStripProps): React.JSX.Element {
  const owner = publication.ownerSnapshot;
  const ownerName = owner?.name ?? 'Anonymous';
  const ownerImage = owner?.image ?? null;
  const publishedDate = new Date(publication.createdAt);
  const publishedAtRelative = formatRelativeTime(publishedDate);

  return (
    <section
      role='region'
      aria-label='Model details'
      data-slot='publication-hero-strip'
      className={cn('flex shrink-0 flex-col gap-1 bg-background/85 px-6 py-4 backdrop-blur-md', className)}
    >
      <div className='flex min-w-0 items-center gap-3'>
        <h1 className='min-w-0 truncate text-lg font-semibold'>{publication.title}</h1>
      </div>
      {publication.description ? (
        <p className='line-clamp-2 text-sm text-muted-foreground'>{publication.description}</p>
      ) : null}
      <address className='mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground not-italic'>
        <div className='flex items-center gap-2'>
          <Avatar className='size-5'>
            {ownerImage ? <AvatarImage src={ownerImage} alt={ownerName} /> : null}
            <AvatarFallback aria-hidden>{initialFromName(ownerName)}</AvatarFallback>
          </Avatar>
          <span>
            <span className='text-muted-foreground'>By </span>
            <span className='font-medium text-foreground'>{ownerName}</span>
          </span>
        </div>
        <span aria-hidden>·</span>
        <time dateTime={publication.createdAt}>{publishedAtRelative}</time>
        <span aria-hidden>·</span>
        <span
          data-slot='publication-hero-views'
          className='flex items-center gap-1'
          aria-label={`${publication.viewCount} views`}
        >
          <Eye className='size-3.5' aria-hidden />
          <span>{formatNumberAbbreviation(publication.viewCount)}</span>
        </span>
        <span
          data-slot='publication-hero-forks'
          className='flex items-center gap-1'
          aria-label={`${publication.forkCount} remixes`}
        >
          <GitFork className='size-3.5' aria-hidden />
          <span>{formatNumberAbbreviation(publication.forkCount)}</span>
        </span>
      </address>
    </section>
  );
}
