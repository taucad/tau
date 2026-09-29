import { Check } from 'lucide-react';
import { PageContent } from '#components/layout/page-content.js';
import { PageHeader } from '#components/layout/page-header.js';
import { Loader } from '#components/ui/loader.js';
import { formatFileSize } from '#components/geometry/converter/converter-utils.js';
import { Progress } from '@taucad/ui/components/progress';
import { Button } from '@taucad/ui/components/button';
import { cn } from '@taucad/ui/utils/cn';

type ImportProcessingViewProperties = {
  readonly title: string;
  readonly phase: 'download' | 'extract' | 'read' | 'create';
  readonly source: 'github' | 'local';
  readonly localOperation?: 'read' | 'extract';
  readonly progress?: { processed: number; total: number };
  readonly downloadProgress?: { loaded: number; total: number };
  readonly isComplete?: boolean;
  readonly onCancel?: () => void;
};

function ProgressStep({
  state,
  label,
  detail,
  value,
}: {
  readonly state: 'done' | 'active' | 'todo';
  readonly label: string;
  readonly detail?: string;
  readonly value?: number;
}): React.JSX.Element {
  return (
    <li className='flex flex-col gap-2 py-3' aria-current={state === 'active' ? 'step' : undefined}>
      <div className='flex flex-wrap items-center justify-between gap-3 text-sm'>
        <span className='flex items-center gap-2'>
          {state === 'done' ? (
            <Check aria-hidden className='size-4' />
          ) : state === 'active' ? (
            <Loader className='size-4' />
          ) : (
            <span aria-hidden className='size-4 rounded-full border' />
          )}
          <span className={cn(state === 'todo' && 'text-muted-foreground')}>{label}</span>
        </span>
        {detail ? <span className='text-xs text-muted-foreground tabular-nums'>{detail}</span> : undefined}
      </div>
      {state === 'active' ? <Progress value={value} aria-label={label} className='h-1 bg-muted' /> : undefined}
    </li>
  );
}

function DownloadStep({
  isDownloading,
  progress,
}: {
  readonly isDownloading: boolean;
  readonly progress: { loaded: number; total: number };
}): React.JSX.Element {
  const detail =
    progress.loaded > 0
      ? isDownloading && progress.total > 0
        ? `${formatFileSize(progress.loaded)} / ${formatFileSize(progress.total)}`
        : formatFileSize(progress.loaded)
      : undefined;
  return (
    <ProgressStep
      state={isDownloading ? 'active' : 'done'}
      label={isDownloading ? 'Downloading…' : 'Downloaded'}
      detail={detail}
      value={progress.total > 0 ? (progress.loaded / progress.total) * 100 : undefined}
    />
  );
}

const fileStepLabels = {
  extract: { done: 'Extracted', active: 'Extracting files…', todo: 'Extract files' },
  read: { done: 'Files read', active: 'Reading files…', todo: 'Read files' },
};

/** Shows only progress reported by the import machines, with one active step. */
export function ImportProcessingView({
  title,
  phase,
  source,
  localOperation = 'read',
  progress = { processed: 0, total: 0 },
  downloadProgress = { loaded: 0, total: 0 },
  isComplete = false,
  onCancel,
}: ImportProcessingViewProperties): React.JSX.Element {
  const isExtracting = source === 'github' || localOperation === 'extract';
  const fileStepState = phase === 'download' ? 'todo' : phase === 'create' ? 'done' : 'active';
  const fileStepLabel = fileStepLabels[isExtracting ? 'extract' : 'read'][fileStepState];

  return (
    <PageContent className='space-y-6'>
      <PageHeader title='Import' />
      <section
        role='status'
        aria-label={isComplete ? 'Import complete' : 'Importing'}
        aria-busy={!isComplete}
        className='grid gap-4 border-y py-6 md:grid-cols-[12rem_minmax(0,1fr)]'
      >
        <h2 className='flex items-center gap-2 self-start text-sm font-medium'>
          {isComplete ? <Check aria-hidden className='size-4 shrink-0' /> : undefined}
          {isComplete ? 'Import complete' : 'Importing'}
        </h2>
        <div className='max-w-xl min-w-0 space-y-4'>
          <p className='font-mono text-sm break-all'>{title}</p>
          {isComplete ? (
            <p className='text-sm'>Opening project…</p>
          ) : (
            <>
              <ol className='divide-y'>
                {source === 'github' ? (
                  <DownloadStep isDownloading={phase === 'download'} progress={downloadProgress} />
                ) : undefined}
                <ProgressStep
                  state={fileStepState}
                  label={fileStepLabel}
                  detail={progress.total > 0 ? `${progress.processed} / ${progress.total} files` : undefined}
                  value={progress.total > 0 ? (progress.processed / progress.total) * 100 : undefined}
                />
                <ProgressStep
                  state={phase === 'create' ? 'active' : 'todo'}
                  label={phase === 'create' ? 'Creating project…' : 'Create project'}
                />
              </ol>
              {onCancel ? (
                <Button variant='outline' onClick={onCancel}>
                  Cancel import
                </Button>
              ) : undefined}
            </>
          )}
        </div>
      </section>
    </PageContent>
  );
}
