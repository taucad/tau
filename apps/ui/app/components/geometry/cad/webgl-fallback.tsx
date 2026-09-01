import { AlertCircle, MonitorX, RotateCcw, RefreshCcw } from 'lucide-react';
import { Button } from '@taucad/ui/components/button';
import type { WebglErrorFallbackProps } from '#components/geometry/cad/webgl-error-boundary.js';

type WebglLimitFallbackProps = {
  readonly onRetry: () => void;
};

/**
 * Shown proactively when the WebGL context limit has been reached.
 * Instructs the user to close a viewer tab to free a context slot,
 * with a Retry button that re-evaluates the limit.
 */
export function WebglLimitFallback({ onRetry }: WebglLimitFallbackProps): React.JSX.Element {
  return (
    <div className='flex h-full flex-col items-center justify-center gap-4 p-6 text-muted-foreground'>
      <MonitorX className='size-12 stroke-1' />
      <div className='flex max-w-xs flex-col items-center gap-1 text-center'>
        <p className='text-sm font-medium text-foreground'>Too many viewers open</p>
        <p className='text-xs'>Close an existing viewer tab to enable 3D rendering in this panel.</p>
      </div>
      <Button variant='default' size='sm' className='gap-2' onClick={onRetry}>
        <RotateCcw className='size-4' />
        Retry
      </Button>
    </div>
  );
}

/**
 * Shown reactively when the WebGL context failed (GPU error, context lost,
 * postprocessing crash, etc.).  Provides retry and reload actions.
 */
export function WebglErrorFallback({ error, onRetry, onReload }: WebglErrorFallbackProps): React.JSX.Element {
  return (
    <div className='flex h-full flex-col items-center justify-center gap-4 p-6'>
      <div className='flex size-12 items-center justify-center rounded-full bg-destructive/10'>
        <AlertCircle className='size-6 text-destructive' />
      </div>
      <div className='flex max-w-xs flex-col items-center gap-1 text-center'>
        <p className='text-sm font-medium text-foreground'>3D rendering failed</p>
        <p className='text-xs text-muted-foreground'>
          {error?.message ?? 'The WebGL context could not be created. Try closing other viewer tabs.'}
        </p>
      </div>
      <div className='flex items-center gap-2'>
        <Button variant='default' size='sm' className='gap-2' onClick={onRetry}>
          <RotateCcw className='size-4' />
          Retry
        </Button>
        <Button variant='outline' size='sm' className='gap-2' onClick={onReload}>
          <RefreshCcw className='size-4' />
          Reload Page
        </Button>
      </div>
    </div>
  );
}
