import { lazy, Suspense, useEffect, useRef } from 'react';
import { Eye } from 'lucide-react';
import type { To } from 'react-router';
import { Link } from 'react-router';
import type { CadPreviewGraphicsOptions } from '#components/cad-preview.js';
import { warmProjectWorkspace } from '#lib/project-workspace-warmup.js';
import { Button } from '@taucad/ui/components/button';
import { Card } from '@taucad/ui/components/card';
import { Tooltip, TooltipContent, TooltipTrigger } from '@taucad/ui/components/tooltip';
import { cn } from '@taucad/ui/utils/cn';

type ProjectCardProps = React.ComponentProps<typeof Card> & {
  readonly to: To;
  readonly linkLabel: string;
};

type ProjectCardMediaProps = {
  readonly thumbnailSource?: string;
  readonly isPreviewVisible: boolean;
  readonly onPreviewVisibilityChange: (isVisible: boolean) => void;
  /**
   * Fill a positioned parent that owns the media geometry instead of sizing itself
   * at 4:3, so a card spanning grid rows takes its height from the rows.
   */
  readonly shouldFill?: boolean;
  readonly children: React.ReactNode;
};

const projectCardGraphicsOptions = {
  enableAxes: false,
  enableGizmo: false,
  enableGrid: false,
  enableLines: true,
  viewerClassName: 'bg-muted',
} satisfies CadPreviewGraphicsOptions;

/**
 * A card preview hands no larger model to three.js: a 31-38 MB Planetary Gear GLB crashed the
 * desktop renderer (SIGTRAP). Bigger models are viewed by opening the project.
 */
export const projectCardPreviewByteLimit = 16 * 1024 * 1024;

const CadPreviewViewer = lazy(async () => {
  const module = await import('#components/cad-preview.js');
  return { default: module.CadPreviewViewer };
});

export function ProjectCard({
  to,
  linkLabel,
  className,
  children,
  ...properties
}: ProjectCardProps): React.JSX.Element {
  const warmWorkspace = (typeof to === 'string' ? to : to.pathname)?.startsWith('/w/')
    ? warmProjectWorkspace
    : undefined;
  return (
    <Card
      className={cn('isolate relative h-full overflow-hidden pt-0 hover:border-foreground/30', className)}
      {...properties}
    >
      <Link
        to={to}
        className='absolute inset-0 z-10 rounded-xl focus-visible:focus-outline'
        onPointerEnter={warmWorkspace}
        onPointerDown={warmWorkspace}
        onFocus={warmWorkspace}
      >
        <span className='sr-only'>{linkLabel}</span>
      </Link>
      {children}
    </Card>
  );
}

export function ProjectCardMedia({
  thumbnailSource,
  isPreviewVisible,
  onPreviewVisibilityChange,
  shouldFill = false,
  children,
}: ProjectCardMediaProps): React.JSX.Element {
  const mediaRef = useRef<HTMLDivElement>(null);

  /* A live preview is torn down once its card scrolls out of view, releasing its kernel and GPU memory. */
  useEffect(() => {
    const media = mediaRef.current;
    // oxlint-disable-next-line @typescript-eslint/no-unnecessary-condition -- absent in jsdom and old engines
    if (!isPreviewVisible || !media || globalThis.IntersectionObserver === undefined) {
      return undefined;
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry && !entry.isIntersecting) {
        onPreviewVisibilityChange(false);
      }
    });
    observer.observe(media);
    return () => {
      observer.disconnect();
    };
  }, [isPreviewVisible, onPreviewVisibilityChange]);

  return (
    <div
      ref={mediaRef}
      className={cn('overflow-hidden bg-muted', shouldFill ? 'absolute inset-0' : 'relative aspect-4/3 h-fit w-full')}
    >
      {/* The card link names the card, so the thumbnail is decorative. A hidden preview is
          unmounted rather than kept, so its kernel workers and memory are released. */}
      {isPreviewVisible ? (
        <div className='relative z-20 size-full'>{children}</div>
      ) : (
        <img src={thumbnailSource ?? '/placeholder.svg'} alt='' className='size-full object-cover' loading='lazy' />
      )}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type='button'
            variant='overlay'
            size='icon'
            aria-label='Preview model'
            aria-pressed={isPreviewVisible}
            className='absolute top-2 right-2 z-30 aria-pressed:bg-accent aria-pressed:text-foreground'
            onClick={() => {
              onPreviewVisibilityChange(!isPreviewVisible);
            }}
          >
            <Eye />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Preview model</TooltipContent>
      </Tooltip>
    </div>
  );
}

export function ProjectCardCadPreview(): React.JSX.Element {
  return (
    <Suspense fallback={<div role='status' aria-label='Loading preview' className='size-full bg-muted' />}>
      <CadPreviewViewer
        className='size-full'
        enablePan={false}
        initialVerticalFieldOfView={45}
        graphicsOptions={projectCardGraphicsOptions}
        maxArtifactBytes={projectCardPreviewByteLimit}
      />
    </Suspense>
  );
}
