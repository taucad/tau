/** Full-shell recovery surface for project and file-manager load failures. */

import { ArrowLeft, Home, AlertOctagon, RefreshCw } from 'lucide-react';
import { useNavigate, Link } from 'react-router';
import { Button, buttonVariants } from '@taucad/ui/components/button';
import {
  FloatingPanel,
  FloatingPanelContent,
  FloatingPanelContentHeader,
  FloatingPanelContentTitle,
  FloatingPanelContentBody,
} from '#components/ui/floating-panel.js';
import { cn } from '@taucad/ui/utils/cn';

type ProjectLoadErrorProps = {
  readonly error: Error;
  readonly className?: string;
  readonly onReload: () => void;
};

export function ProjectLoadError({ error, className, onReload }: ProjectLoadErrorProps): React.JSX.Element {
  const navigate = useNavigate();

  return (
    <div className={cn('absolute inset-0 z-20', className)}>
      <FloatingPanel isOpen side='right' align='start'>
        <FloatingPanelContent>
          <FloatingPanelContentHeader>
            <FloatingPanelContentTitle>Project Unavailable</FloatingPanelContentTitle>
          </FloatingPanelContentHeader>

          <FloatingPanelContentBody className='flex items-center justify-center p-6'>
            <div className='w-full max-w-sm animate-in duration-300 fade-in'>
              <div className='mb-6 text-center'>
                <div className='mb-4 flex items-center justify-center'>
                  <div className='flex size-16 items-center justify-center rounded-full bg-destructive/10'>
                    <AlertOctagon className='size-8 text-destructive' />
                  </div>
                </div>
              </div>

              <div className='mb-6 rounded-lg border border-destructive/40 bg-card/80 p-4 text-center shadow-sm'>
                <p className='font-medium'>Tau could not load this project.</p>
                <p className='mt-2 text-sm text-muted-foreground'>
                  {error.message || 'An unexpected error prevented the project from loading.'}
                </p>
              </div>

              <div className='flex flex-col gap-3 sm:flex-row'>
                <Button variant='outline' className='flex-1' onClick={onReload}>
                  <RefreshCw className='mr-2 size-4' />
                  Reload
                </Button>
                <Button
                  variant='outline'
                  className='flex-1'
                  onClick={() => {
                    void navigate(-1);
                  }}
                >
                  <ArrowLeft className='mr-2 size-4' />
                  Go Back
                </Button>
                <Link to='/' className={cn(buttonVariants(), 'flex-1')}>
                  <Home className='mr-2 size-4' />
                  Home
                </Link>
              </div>
            </div>
          </FloatingPanelContentBody>
        </FloatingPanelContent>
      </FloatingPanel>
    </div>
  );
}
