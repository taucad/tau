import { Star, GitFork, Eye, Scale, Lock, Globe, Clock } from 'lucide-react';
import { Badge } from '#components/ui/badge.js';
import { Skeleton } from '#components/ui/skeleton.js';
import { formatFileSize } from '#components/geometry/converter/converter-utils.js';
import { cn } from '#utils/ui.utils.js';

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
  readonly size: number | undefined;
  readonly estimatedTime: number | undefined;
  readonly isLoading?: boolean;
  readonly className?: string;
};

function formatRelativeTime(dateString: string | undefined): string {
  if (!dateString) {
    return 'Unknown';
  }

  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

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

// eslint-disable-next-line complexity -- acceptable for containment.
export function RepositoryCard(properties: RepositoryCardProperties): React.JSX.Element {
  const { metadata, owner, repo, size, estimatedTime, isLoading, className } = properties;

  if (isLoading) {
    return (
      <div className={cn('space-y-4 rounded-lg border bg-muted/50 p-4', className)}>
        <div className="flex items-start gap-3">
          <Skeleton className="size-16 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-4 w-full" />
          </div>
        </div>
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  return (
    <div className={cn('space-y-4 rounded-lg border bg-muted/50 p-4', className)}>
      {/* Header with avatar and name */}
      <div className="flex items-start gap-3">
        {metadata?.avatarUrl ? (
          <img src={metadata.avatarUrl} alt={`${owner} avatar`} className="size-16 rounded-full" />
        ) : (
          <div className="flex size-16 items-center justify-center rounded-full bg-muted">
            <span className="text-2xl font-semibold">{owner[0]?.toUpperCase()}</span>
          </div>
        )}
        <div className="flex-1 space-y-1">
          <h3 className="font-mono text-lg font-semibold">
            {owner}/{repo}
          </h3>
          {metadata?.description ? (
            <p className="line-clamp-2 text-sm text-muted-foreground">{metadata.description}</p>
          ) : undefined}
        </div>
      </div>

      {/* Stats row */}
      {metadata?.stars !== undefined || metadata?.forks !== undefined || metadata?.watchers !== undefined ? (
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          {metadata.stars === undefined ? undefined : (
            <div className="flex items-center gap-1">
              <Star className="size-4" />
              <span>{metadata.stars.toLocaleString()}</span>
            </div>
          )}
          {metadata.forks === undefined ? undefined : (
            <div className="flex items-center gap-1">
              <GitFork className="size-4" />
              <span>{metadata.forks.toLocaleString()}</span>
            </div>
          )}
          {metadata.watchers === undefined ? undefined : (
            <div className="flex items-center gap-1">
              <Eye className="size-4" />
              <span>{metadata.watchers.toLocaleString()}</span>
            </div>
          )}
        </div>
      ) : undefined}

      {/* Bottom row with badges and info */}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {/* Visibility badge */}
        {metadata?.isPrivate === undefined ? undefined : (
          <Badge variant="secondary" className="gap-1">
            {metadata.isPrivate ? (
              <>
                <Lock className="size-3" />
                Private
              </>
            ) : (
              <>
                <Globe className="size-3" />
                Public
              </>
            )}
          </Badge>
        )}

        {/* License badge */}
        {metadata?.license ? (
          <Badge variant="secondary" className="gap-1">
            <Scale className="size-3" />
            {metadata.license}
          </Badge>
        ) : undefined}

        {/* Size and estimated time */}
        {size === undefined ? undefined : (
          <Badge variant="secondary" className="gap-1">
            <span className="font-mono">{formatFileSize(size)}</span>
            {estimatedTime !== undefined && estimatedTime > 0 ? (
              <span className="text-muted-foreground">(~{estimatedTime}s)</span>
            ) : undefined}
          </Badge>
        )}

        {/* Last updated */}
        {metadata?.lastUpdated ? (
          <Badge variant="secondary" className="gap-1">
            <Clock className="size-3" />
            {formatRelativeTime(metadata.lastUpdated)}
          </Badge>
        ) : undefined}
      </div>
    </div>
  );
}
