import { AlertCircle, RotateCcw } from 'lucide-react';
import { Button } from '@taucad/ui/components/button';

type ImportErrorViewProperties = {
  readonly error: Error | undefined;
  readonly onRetry: () => void;
};

/**
 * Shared error view for import failures.
 */
export function ImportErrorView({ error, onRetry }: ImportErrorViewProperties): React.JSX.Element {
  return (
    <div className='flex min-h-full flex-col items-center justify-start px-4 pt-6 pb-16 md:justify-center md:pt-8'>
      <div className='w-full max-w-md space-y-4'>
        <div className='flex items-start gap-3 rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-destructive'>
          <AlertCircle className='size-5 shrink-0' />
          <div className='flex flex-col gap-1'>
            <div className='font-semibold'>Import Failed</div>
            <div className='text-sm'>{error?.message ?? 'Unknown error occurred'}</div>
          </div>
        </div>

        <div className='flex gap-2'>
          <Button variant='default' className='flex-1' onClick={onRetry}>
            <RotateCcw className='mr-2 size-4' />
            Try Again
          </Button>
          <Button asChild variant='outline' className='flex-1'>
            <a href='/'>Back to Home</a>
          </Button>
        </div>
      </div>
    </div>
  );
}
