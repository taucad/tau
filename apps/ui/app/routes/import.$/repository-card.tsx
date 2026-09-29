import { Star, GitFork } from 'lucide-react';
import { Badge } from '@taucad/ui/components/badge';
import { ExternalLink } from '#components/external-link.js';
import { Skeleton } from '@taucad/ui/components/skeleton';
import { cn } from '@taucad/ui/utils/cn';

type RepositoryCardProperties = {
  readonly metadata:
    | {
        avatarUrl: string | undefined;
        description: string | undefined;
        stars: number | undefined;
        forks: number | undefined;
        watchers: number | undefined;
        license: string | undefined;
        defaultBranch: string | undefined;
        isPrivate: boolean | undefined;
        lastUpdated: string | undefined;
      }
    | undefined;
  readonly owner: string;
  readonly repo: string;
  readonly isLoading?: boolean;
  readonly className?: string;
};

function formatRelativeTime(dateString: string | undefined): string {
  if (!dateString) {
    return 'Unknown';
  }

  const date = new Date(dateString);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const diffDays = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return 'Today';
  }

  if (diffDays === 1) {
    return 'Yesterday';
  }

  if (diffDays < 7) {
    return `${diffDays} days ago`;
  }

  if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7);
    return `${weeks} ${weeks === 1 ? 'week' : 'weeks'} ago`;
  }

  if (diffDays < 365) {
    const months = Math.floor(diffDays / 30);
    return `${months} ${months === 1 ? 'month' : 'months'} ago`;
  }

  const years = Math.floor(diffDays / 365);
  return `${years} ${years === 1 ? 'year' : 'years'} ago`;
}

export function RepositoryCard(properties: RepositoryCardProperties): React.JSX.Element {
  const { metadata, owner, repo, isLoading, className } = properties;

  if (isLoading) {
    return (
      <div
        role='status'
        aria-label='Loading repository'
        aria-busy='true'
        className={cn('flex min-w-0 gap-3', className)}
      >
        <Skeleton className='size-8 shrink-0 rounded-full' />
        <div className='min-w-0 flex-1 space-y-2'>
          <Skeleton className='h-5 w-48 max-w-full' />
          <Skeleton className='h-4 w-full' />
        </div>
      </div>
    );
  }

  return (
    <div className={cn('flex min-w-0 items-start gap-3', className)}>
      <span
        aria-hidden
        className='flex size-8 shrink-0 items-center justify-center rounded-full border bg-muted text-sm font-medium'
      >
        {owner[0]?.toUpperCase()}
      </span>
      <div className='min-w-0 flex-1 space-y-1'>
        <ExternalLink href={`https://github.com/${owner}/${repo}`} className='font-mono text-sm font-medium break-all'>
          {owner}/{repo}
        </ExternalLink>
        {metadata?.description ? <p className='text-sm text-muted-foreground'>{metadata.description}</p> : undefined}
        <div className='flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground tabular-nums'>
          {metadata?.stars === undefined ? undefined : (
            <span className='flex items-center gap-1'>
              <Star aria-hidden className='size-3.5' />
              {metadata.stars.toLocaleString()} stars
            </span>
          )}
          {metadata?.forks === undefined ? undefined : (
            <span className='flex items-center gap-1'>
              <GitFork aria-hidden className='size-3.5' />
              {metadata.forks.toLocaleString()} forks
            </span>
          )}
          {metadata?.isPrivate === undefined ? undefined : (
            <Badge variant='outline'>{metadata.isPrivate ? 'Private' : 'Public'}</Badge>
          )}
          {metadata?.license ? <span>{metadata.license}</span> : undefined}
          {metadata?.lastUpdated ? <span>Updated {formatRelativeTime(metadata.lastUpdated)}</span> : undefined}
        </div>
      </div>
    </div>
  );
}
