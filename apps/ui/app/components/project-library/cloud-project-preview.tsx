import { useEffect, useRef, useState } from 'react';
import { Box } from 'lucide-react';
import { Loader } from '@taucad/ui/components/loader';
import { Skeleton } from '@taucad/ui/components/skeleton';
import { Button } from '@taucad/ui/components/button';
import { cn } from '@taucad/ui/utils/cn';
import { useCloudProjectPreview } from '#hooks/use-cloud-project-preview.js';

export function CloudProjectPreview({
  projectId,
  name,
  isCompact = false,
}: {
  readonly projectId: string;
  readonly name: string;
  readonly isCompact?: boolean;
}): React.JSX.Element {
  const target = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [failedUrl, setFailedUrl] = useState<string>();
  const preview = useCloudProjectPreview(projectId, isVisible);
  useEffect(() => {
    const element = target.current;
    if (!element) {
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsVisible(entry?.isIntersecting ?? false);
      },
      { rootMargin: '100px' },
    );
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, []);
  const hasImage = preview.url !== undefined && failedUrl !== preview.url;
  return (
    <div
      ref={target}
      className={cn(
        'relative flex shrink-0 items-center justify-center overflow-hidden bg-muted text-muted-foreground',
        isCompact ? 'size-9 rounded-md' : 'aspect-4/3 w-full',
      )}
    >
      {hasImage ? (
        <img
          src={preview.url}
          alt={`Saved preview of ${name}`}
          className='size-full object-contain'
          onError={() => {
            setFailedUrl(preview.url);
          }}
        />
      ) : preview.isLoading ? (
        <Skeleton className='size-full' role='status' aria-busy='true' aria-label='Loading saved preview' />
      ) : (
        <Box
          aria-label={preview.isFailed || failedUrl ? 'Saved preview unavailable' : 'No saved preview'}
          className={isCompact ? 'size-4' : 'size-8'}
        />
      )}
      {!isCompact && hasImage ? (
        <span className='absolute right-2 bottom-2 rounded-md bg-background px-2 py-1 text-xs'>Saved preview</span>
      ) : null}
      {!isCompact && preview.isFailed && !preview.canRetry ? (
        <p className='absolute right-2 bottom-2 left-2 text-center text-xs'>
          Preview unavailable. Open the project to view it.
        </p>
      ) : null}
      {!isCompact && ((preview.isFailed && preview.canRetry) || (preview.url && failedUrl === preview.url)) ? (
        <Button
          size='sm'
          variant='outline'
          className='absolute bottom-2'
          disabled={preview.isLoading}
          aria-busy={preview.isLoading}
          onClick={async () => {
            setFailedUrl(undefined);
            await preview.retry();
          }}
        >
          {preview.isLoading ? <Loader className='size-3 motion-reduce:animate-none' /> : null}
          {preview.isLoading ? 'Loading preview…' : 'Retry preview'}
        </Button>
      ) : null}
    </div>
  );
}
