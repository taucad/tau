import { XCircle, Upload } from 'lucide-react';
import { Loader } from '#components/ui/loader.js';
import { Progress } from '@taucad/ui/components/progress';
import { Button } from '@taucad/ui/components/button';
import { SvgIcon } from '#components/icons/svg-icon.js';

type ImportProcessingViewProperties = {
  readonly title: string;
  readonly statusText: string;
  readonly progress: { processed: number; total: number };
  readonly variant: 'github' | 'disk';
  readonly onCancel?: () => void;
};

/**
 * Shared processing/loading view for imports.
 */
export function ImportProcessingView({
  title,
  statusText,
  progress,
  variant,
  onCancel,
}: ImportProcessingViewProperties): React.JSX.Element {
  return (
    <div className='flex min-h-full flex-col items-center justify-start px-4 pt-6 pb-16 md:justify-center md:pt-8'>
      <div className='w-full max-w-2xl space-y-6'>
        <div className='flex flex-col items-center gap-4'>
          <div className='flex size-16 items-center justify-center rounded-full bg-linear-to-br from-primary/20 to-primary/10'>
            {variant === 'github' ? (
              <SvgIcon id='github' className='size-8 text-primary' />
            ) : (
              <Upload className='size-8 text-primary' />
            )}
          </div>

          <div className='text-center'>
            <h1 className='text-2xl font-semibold'>{title}</h1>
            <p className='text-sm text-muted-foreground'>Please wait...</p>
          </div>
        </div>

        <div className='space-y-4'>
          <div className='space-y-2'>
            <div className='flex items-center justify-between text-sm'>
              <span className='flex items-center gap-2 font-medium'>
                <Loader />
                <span>{statusText}</span>
              </span>
              {progress.total > 0 ? (
                <span className='text-muted-foreground'>
                  {progress.processed} / {progress.total} files
                </span>
              ) : undefined}
            </div>
            <Progress
              value={progress.total > 0 ? (progress.processed / progress.total) * 100 : undefined}
              className='h-2'
            />
          </div>

          {onCancel ? (
            <Button variant='outline' className='w-full' onClick={onCancel}>
              <XCircle className='mr-2 size-4' />
              Cancel Import
            </Button>
          ) : undefined}
        </div>
      </div>
    </div>
  );
}
