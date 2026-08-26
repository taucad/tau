/**
 * Fatal-FM-error leaf for the `ProjectUnavailableOverlay`.
 *
 * Renders when the FM machine reaches the terminal `error` state
 * (worker crash, IndexedDB unavailable, structured-clone failure, etc.).
 * Mirrors the `ProjectNotFound` full-shell aesthetic so the broken
 * editor underneath is fully covered (Audit R8).
 */

import { ArrowLeft, Home, AlertOctagon, RefreshCw } from 'lucide-react';
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

type FileManagerErrorProps = {
  readonly error: Error;
  readonly className?: string;
};

export function FileManagerError({ error, className }: FileManagerErrorProps): React.JSX.Element {
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
                <p className='font-medium'>The file manager failed to initialize.</p>
                <p className='mt-2 text-sm text-muted-foreground'>
                  {error.message || 'An unexpected error prevented the project from loading.'}
                </p>
              </div>

              <div className='flex flex-col gap-3 sm:flex-row'>
                <Button
                  variant='outline'
                  className='flex-1'
                  onClick={() => {
                    globalThis.location.reload();
                  }}
                >
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
