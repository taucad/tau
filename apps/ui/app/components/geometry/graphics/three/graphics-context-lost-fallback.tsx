import { AlertTriangle, RotateCcw } from 'lucide-react';
import { Button } from '#components/ui/button.js';

type GraphicsContextLostFallbackProps = {
  readonly onRetry: () => void;
};

/**
 * Lightweight DOM-only fallback shown when the GPU rendering backend loses its
 * context or device mid-session (e.g. GPU reset, driver crash, or browser
 * reclaiming resources).
 */
export function GraphicsContextLostFallback({ onRetry }: GraphicsContextLostFallbackProps): React.JSX.Element {
  return (
    <div className='flex h-full flex-col items-center justify-center gap-4 p-6 text-muted-foreground'>
      <AlertTriangle className='size-12 stroke-1' />
      <div className='flex max-w-xs flex-col items-center gap-1 text-center'>
        <p className='text-sm font-medium text-foreground'>Graphics context lost</p>
        <p className='text-xs'>
          The renderer lost its GPU context or device (WebGL/WebGPU). This can happen when too many viewers are open or
          after a GPU reset.
        </p>
      </div>
      <Button variant='default' size='sm' className='gap-2' onClick={onRetry}>
        <RotateCcw className='size-4' />
        Retry
      </Button>
    </div>
  );
}
