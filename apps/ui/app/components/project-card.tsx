import { Eye } from 'lucide-react';
import type { To } from 'react-router';
import { Link } from 'react-router';
import { CadPreviewViewer } from '#components/cad-preview.js';
import type { CadPreviewGraphicsOptions } from '#components/cad-preview.js';
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

export function ProjectCard({
  to,
  linkLabel,
  className,
  children,
  ...properties
}: ProjectCardProps): React.JSX.Element {
  return (
    <Card
      className={cn('isolate relative h-full overflow-hidden pt-0 hover:border-foreground/30', className)}
      {...properties}
    >
      <Link to={to} className='absolute inset-0 z-10 rounded-xl focus-visible:focus-outline'>
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
  return (
    <div
      className={cn('overflow-hidden bg-muted', shouldFill ? 'absolute inset-0' : 'relative aspect-4/3 h-fit w-full')}
    >
      {/* The card link names the card, so the thumbnail is decorative. */}
      {isPreviewVisible ? null : (
        <img src={thumbnailSource ?? '/placeholder.svg'} alt='' className='size-full object-cover' loading='lazy' />
      )}
      <div className='relative z-20 size-full' hidden={!isPreviewVisible}>
        {children}
      </div>
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
    <CadPreviewViewer
      className='size-full'
      enablePan={false}
      initialVerticalFieldOfView={45}
      graphicsOptions={projectCardGraphicsOptions}
    />
  );
}
