import { ArrowLeft, FolderX, Home } from 'lucide-react';
import { useNavigate, Link } from 'react-router';
import { Button, buttonVariants } from '#components/ui/button.js';
import {
  FloatingPanel,
  FloatingPanelContent,
  FloatingPanelContentHeader,
  FloatingPanelContentTitle,
  FloatingPanelContentBody,
} from '#components/ui/floating-panel.js';
import { cn } from '#utils/ui.utils.js';

type ProjectNotFoundProperties = {
  readonly className?: string;
};

export function ProjectNotFound({ className }: ProjectNotFoundProperties): React.JSX.Element {
  const navigate = useNavigate();

  const goBack = (): void => {
    void navigate(-1);
  };

  return (
    <div className={cn('absolute inset-0 z-20', className)}>
      <FloatingPanel isOpen side='right' align='start'>
        <FloatingPanelContent>
          <FloatingPanelContentHeader>
            <FloatingPanelContentTitle>Project Not Found</FloatingPanelContentTitle>
          </FloatingPanelContentHeader>

          <FloatingPanelContentBody className='flex items-center justify-center p-6'>
            <div className='w-full max-w-sm animate-in duration-300 fade-in'>
              {/* Icon */}
              <div className='mb-6 text-center'>
                <div className='mb-4 flex items-center justify-center'>
                  <div className='flex size-16 items-center justify-center rounded-full bg-muted/50 dark:bg-muted/30'>
                    <FolderX className='size-8 text-muted-foreground' />
                  </div>
                </div>
              </div>

              {/* Content */}
              <div className='mb-6 rounded-lg border border-border/60 bg-card/80 p-4 text-center shadow-sm dark:border-border/40 dark:bg-card/50'>
                <p className='text-muted-foreground'>
                  The project you&apos;re looking for doesn&apos;t exist or may have been deleted.
                </p>
              </div>

              {/* Action Buttons */}
              <div className='flex flex-col gap-3 sm:flex-row'>
                <Button variant='outline' className='flex-1' onClick={goBack}>
                  <ArrowLeft className='mr-2 size-4' />
                  Go Back
                </Button>

                <Link to='/' className={cn(buttonVariants(), 'flex-1')}>
                  <Home className='mr-2 size-4' />
                  Go Home
                </Link>
              </div>
            </div>
          </FloatingPanelContentBody>
        </FloatingPanelContent>
      </FloatingPanel>
    </div>
  );
}
