import { Eye } from 'lucide-react';
import type { To } from 'react-router';
import { Link } from 'react-router';
import { CadPreviewViewer } from '#components/cad-preview.js';
import type { CadPreviewGraphicsOptions } from '#components/cad-preview.js';
import { Button } from '#components/ui/button.js';
import { Card } from '#components/ui/card.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '#components/ui/tooltip.js';
import { cn } from '#utils/ui.utils.js';

type ProjectCardProps = React.ComponentProps<typeof Card> & {
  readonly to: To;
  readonly linkLabel: string;
};

type ProjectCardMediaProps = {
  readonly name: string;
  readonly thumbnailSource?: string;
  readonly isPreviewVisible: boolean;
  readonly onPreviewVisibilityChange: (isVisible: boolean) => void;
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
      className={cn(
        'isolate relative h-full overflow-hidden pt-0 transition-colors duration-150 ease-out hover:border-primary/60',
        className,
      )}
      {...properties}
    >
      <Link
        to={to}
        className='absolute inset-0 z-10 cursor-pointer rounded-xl focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none focus-visible:ring-inset'
      >
        <span className='sr-only'>{linkLabel}</span>
      </Link>
      {children}
    </Card>
  );
}

export function ProjectCardMedia({
  name,
  thumbnailSource,
  isPreviewVisible,
  onPreviewVisibilityChange,
  children,
}: ProjectCardMediaProps): React.JSX.Element {
  return (
    <div className='relative aspect-4/3 h-fit w-full overflow-hidden bg-muted'>
      {isPreviewVisible ? null : (
        <img src={thumbnailSource ?? '/placeholder.svg'} alt={name} className='size-full object-cover' loading='lazy' />
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
            className='absolute top-1 right-1 z-30 size-7 sm:top-2 sm:right-2 sm:size-9'
            onClick={() => {
              onPreviewVisibilityChange(!isPreviewVisible);
            }}
          >
            <Eye className={cn('size-3.5 sm:size-4', isPreviewVisible && 'text-primary')} />
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
