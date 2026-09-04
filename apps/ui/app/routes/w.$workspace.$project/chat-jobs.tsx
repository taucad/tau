import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Ban,
  CheckCircle2,
  CircleAlert,
  Clock3,
  FileOutput,
  Hourglass,
  LoaderCircle,
  PauseCircle,
  Play,
  RotateCcw,
  ServerCog,
  StopCircle,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { ENV } from '#environment.config.js';
import { useProject } from '#hooks/use-project.js';
import { useFileManager } from '#hooks/use-file-manager.js';
import { digestBytes, fetchJobArtifact, useJobs } from '#hooks/use-jobs.js';
import type { JobArtifact, JobProjection, JobState } from '#lib/jobs-projection.js';
import { isTerminalJobState } from '#lib/jobs-projection.js';
import { formatFileSize } from '#components/geometry/converter/converter-utils.js';
import { Badge } from '@taucad/ui/components/badge';
import { Button } from '@taucad/ui/components/button';
import { PanelEmptyState } from '#components/ui/panel-empty-state.js';
import { Progress } from '@taucad/ui/components/progress';
import { cn } from '@taucad/ui/utils/cn';

type StatePresentation = {
  readonly label: string;
  readonly icon: LucideIcon;
  readonly rail: string;
  readonly tone: string;
};

const statePresentation: Readonly<Record<JobState, StatePresentation>> = {
  queued: {
    label: 'Queued',
    icon: Clock3,
    rail: 'before:bg-muted-foreground/45',
    tone: 'border-border bg-muted/50 text-muted-foreground',
  },
  assigned: {
    label: 'Assigned',
    icon: ServerCog,
    rail: 'before:bg-information',
    tone: 'border-information/30 bg-information/10 text-information',
  },
  running: {
    label: 'Running',
    icon: Play,
    rail: 'before:bg-information',
    tone: 'border-information/30 bg-information/10 text-information',
  },
  waiting: {
    label: 'Waiting',
    icon: PauseCircle,
    rail: 'before:bg-warning',
    tone: 'border-warning/30 bg-warning/10 text-warning',
  },
  // eslint-disable-next-line @typescript-eslint/naming-convention -- API job-state wire value
  cancel_requested: {
    label: 'Cancellation requested',
    icon: Hourglass,
    rail: 'before:bg-warning',
    tone: 'border-warning/30 bg-warning/10 text-warning',
  },
  completed: {
    label: 'Completed',
    icon: CheckCircle2,
    rail: 'before:bg-success',
    tone: 'border-success/30 bg-success/10 text-success',
  },
  failed: {
    label: 'Failed',
    icon: CircleAlert,
    rail: 'before:bg-destructive',
    tone: 'border-destructive/30 bg-destructive/10 text-destructive',
  },
  cancelled: {
    label: 'Cancelled',
    icon: Ban,
    rail: 'before:bg-muted-foreground/45',
    tone: 'border-border bg-muted/50 text-muted-foreground',
  },
};

const titleForJob = (job: JobProjection): string =>
  `${job.snapshot.definition.type} · ${job.snapshot.definition.version}`;

export const JobsPanelBody = (): React.JSX.Element => {
  const { jobs, isLoading, error, retry, cancel, cancellingJobIds, cancellationErrors } = useJobs();
  return (
    <div data-slot='jobs-panel-body' className='flex size-full min-h-0 flex-col overflow-hidden bg-sidebar'>
      <JobsOverview jobs={jobs} />
      <div className='min-h-0 flex-1 scroll-shadows-y overflow-y-auto p-2 [--scroll-fade-end:transparent] [--scroll-fade-size:28px]'>
        {isLoading && jobs.length === 0 ? (
          <div role='status' className='grid min-h-full place-items-center text-sm text-muted-foreground'>
            <span className='flex items-center gap-2'>
              <LoaderCircle aria-hidden className='size-4 animate-spin motion-reduce:animate-none' />
              Loading jobs
            </span>
          </div>
        ) : null}
        {error && jobs.length === 0 ? (
          <PanelEmptyState
            icon={CircleAlert}
            iconClassName='text-destructive'
            title='Jobs unavailable'
            description={error}
            role='alert'
            aria-label='Jobs unavailable'
            className='m-0 min-h-full rounded-xl border bg-card'
          >
            <Button type='button' size='sm' variant='outline' onClick={retry}>
              Retry
            </Button>
          </PanelEmptyState>
        ) : null}
        {!isLoading && !error && jobs.length === 0 ? (
          <PanelEmptyState
            icon={ServerCog}
            title='No jobs yet'
            description='Project compute jobs will appear here.'
            className='m-0 min-h-full rounded-xl border bg-card'
          />
        ) : null}
        {error && jobs.length > 0 ? (
          <div
            role='alert'
            className='mb-2 flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/10 p-2 text-xs text-warning'
          >
            <CircleAlert aria-hidden className='size-3.5 shrink-0' />
            <span className='min-w-0 flex-1'>{error}</span>
            <Button type='button' size='sm' variant='ghost' className='h-7 px-2' onClick={retry}>
              Retry
            </Button>
          </div>
        ) : null}
        {jobs.length > 0 ? (
          <JobList
            jobs={jobs}
            cancellingJobIds={cancellingJobIds}
            cancellationErrors={cancellationErrors}
            onCancel={cancel}
          />
        ) : null}
      </div>
    </div>
  );
};

const JobsOverview = ({ jobs }: { readonly jobs: readonly JobProjection[] }): React.JSX.Element => {
  const active = jobs.filter(({ snapshot }) => !isTerminalJobState(snapshot.state)).length;
  const failed = jobs.filter(({ snapshot }) => snapshot.state === 'failed').length;
  return (
    <div
      aria-label='Job overview'
      aria-live='polite'
      className='flex min-h-10 shrink-0 items-center gap-3 border-b border-border/70 px-3 text-xs text-muted-foreground'
    >
      <span className='flex min-w-0 items-center gap-1.5'>
        <ServerCog aria-hidden className='size-3.5' />
        <strong className='font-medium text-foreground'>{jobs.length}</strong>
        <span>{jobs.length === 1 ? 'job' : 'jobs'}</span>
      </span>
      <span>{active} active</span>
      {failed > 0 ? <span className='ml-auto text-destructive'>{failed} failed</span> : null}
    </div>
  );
};

export const JobList = ({
  jobs,
  cancellingJobIds,
  cancellationErrors,
  onCancel,
}: {
  readonly jobs: readonly JobProjection[];
  readonly cancellingJobIds: ReadonlySet<string>;
  readonly cancellationErrors: Readonly<Record<string, string>>;
  readonly onCancel: (jobId: string) => Promise<void>;
}): React.JSX.Element => (
  <ol aria-label='Jobs' className='flex list-none flex-col gap-2'>
    {jobs.map((job) => (
      <li key={job.snapshot.jobId}>
        <JobCard
          job={job}
          isCancelling={cancellingJobIds.has(job.snapshot.jobId)}
          cancellationError={cancellationErrors[job.snapshot.jobId]}
          onCancel={onCancel}
        />
      </li>
    ))}
  </ol>
);

const JobCard = ({
  job,
  isCancelling,
  cancellationError,
  onCancel,
}: {
  readonly job: JobProjection;
  readonly isCancelling: boolean;
  readonly cancellationError?: string;
  readonly onCancel: (jobId: string) => Promise<void>;
}): React.JSX.Element => {
  const { snapshot } = job;
  const state = statePresentation[snapshot.state];
  const StateIcon = state.icon;
  const canCancel = !isTerminalJobState(snapshot.state) && snapshot.state !== 'cancel_requested';
  const percentage = snapshot.progress
    ? Math.min(100, Math.max(0, (snapshot.progress.completed / snapshot.progress.total) * 100))
    : undefined;
  return (
    <article
      aria-label={`${titleForJob(job)}, ${state.label}`}
      data-job-id={snapshot.jobId}
      data-state={snapshot.state}
      className={cn(
        'relative overflow-hidden rounded-xl border border-border/70 bg-card px-3 py-3',
        'before:absolute before:inset-y-0 before:left-0 before:w-0.5',
        state.rail,
      )}
    >
      <div className='flex min-w-0 items-start gap-2'>
        <div className='min-w-0 flex-1'>
          <div className='flex min-w-0 items-center gap-2'>
            <h3 className='min-w-0 flex-1 truncate text-sm font-medium text-foreground'>{titleForJob(job)}</h3>
            <Badge role='status' variant='outline' className={cn('h-5 gap-1 px-1.5 text-[10px]', state.tone)}>
              <StateIcon
                aria-hidden
                className={cn('size-2.5', snapshot.state === 'running' && 'animate-pulse motion-reduce:animate-none')}
              />
              {state.label}
            </Badge>
          </div>
          <div className='mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground'>
            <span>
              Attempt {snapshot.currentAttempt} of {snapshot.definition.maxAttempts}
            </span>
            <time dateTime={snapshot.updatedAt} title={new Date(snapshot.updatedAt).toLocaleString()}>
              Updated {new Date(snapshot.updatedAt).toLocaleTimeString()}
            </time>
          </div>
        </div>
      </div>

      {snapshot.progress && percentage !== undefined ? (
        <section aria-label='Job progress' className='mt-3'>
          <div className='mb-1 flex items-center justify-between gap-2 text-xs'>
            <span className='truncate font-medium text-foreground'>{snapshot.progress.phase}</span>
            <span className='shrink-0 font-mono text-muted-foreground'>{Math.round(percentage)}%</span>
          </div>
          <Progress
            aria-label={`${snapshot.progress.phase} progress`}
            aria-valuetext={`${snapshot.progress.completed} of ${snapshot.progress.total}`}
            value={percentage}
          />
          {snapshot.progress.message ? (
            <p className='mt-1.5 text-xs text-muted-foreground'>{snapshot.progress.message}</p>
          ) : null}
        </section>
      ) : null}

      <JobOutcome job={job} />

      {snapshot.artifacts && snapshot.artifacts.length > 0 ? (
        <section aria-label='Artifact manifest' className='mt-3 border-t border-border/70 pt-2.5'>
          <h4 className='mb-2 flex items-center gap-1.5 text-xs font-medium text-foreground'>
            <FileOutput aria-hidden className='size-3.5' />
            Artifacts
          </h4>
          <ul className='flex flex-col gap-2'>
            {snapshot.artifacts.map((artifact) => (
              <li key={artifact.artifactId}>
                <ArtifactManifestEntry jobId={snapshot.jobId} artifact={artifact} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {job.activity.length > 0 ? (
        <details className='mt-3 border-t border-border/70 pt-2 text-xs'>
          <summary className='cursor-pointer text-muted-foreground select-none'>
            Recent activity · {job.activity.length}
          </summary>
          <ol aria-label='Recent job activity' className='mt-2 flex list-none flex-col gap-1.5'>
            {job.activity.map((activity) => (
              <li key={activity.eventId} className='flex gap-2 text-muted-foreground'>
                <span className='shrink-0 font-mono'>#{activity.sequence}</span>
                <span className='min-w-0 break-words'>
                  {activity.type}
                  {activity.message ? ` · ${activity.message}` : ''}
                </span>
              </li>
            ))}
          </ol>
        </details>
      ) : null}

      {job.syncState === 'failed' ? (
        <p role='alert' className='mt-3 flex items-start gap-1.5 text-xs text-destructive'>
          <CircleAlert aria-hidden className='mt-0.5 size-3 shrink-0' />
          Updates stopped: {job.syncError}
        </p>
      ) : null}
      {job.syncState === 'reconnecting' ? (
        <p role='status' className='mt-3 flex items-center gap-1.5 text-xs text-warning'>
          <RotateCcw aria-hidden className='size-3' />
          Reconnecting to durable updates
        </p>
      ) : null}
      {cancellationError ? (
        <p role='alert' className='mt-3 text-xs text-destructive'>
          {cancellationError}
        </p>
      ) : null}
      {canCancel ? (
        <div className='mt-3 flex justify-end border-t border-border/70 pt-2'>
          <Button
            type='button'
            size='sm'
            variant='outline'
            disabled={isCancelling}
            aria-label={`Cancel ${titleForJob(job)}`}
            onClick={() => void onCancel(snapshot.jobId)}
          >
            <StopCircle aria-hidden className='size-3.5' />
            {isCancelling ? 'Requesting…' : 'Cancel'}
          </Button>
        </div>
      ) : null}
    </article>
  );
};

const JobOutcome = ({ job }: { readonly job: JobProjection }): ReactNode => {
  const { snapshot } = job;
  if (snapshot.state === 'failed' && snapshot.failure) {
    return (
      <div role='alert' className='mt-3 rounded-lg border border-destructive/25 bg-destructive/5 p-2 text-xs'>
        <p className='font-medium text-destructive'>
          {snapshot.failure.code}
          {snapshot.failure.retryable ? ' · retryable' : ''}
        </p>
        <p className='mt-1 text-muted-foreground'>{snapshot.failure.message}</p>
      </div>
    );
  }
  if ((snapshot.state === 'cancel_requested' || snapshot.state === 'cancelled') && snapshot.cancellationReason) {
    return <p className='mt-3 text-xs text-muted-foreground'>{snapshot.cancellationReason}</p>;
  }
  return null;
};

const ArtifactManifestEntry = ({
  jobId,
  artifact,
}: {
  readonly jobId: string;
  readonly artifact: JobArtifact;
}): React.JSX.Element => {
  const { editorRef } = useProject();
  const { exists, readFile, writeFile } = useFileManager();
  const projectPath = `.tau/artifacts/${artifact.digest.slice('sha256:'.length)}/${artifact.logicalPath}`;
  const provenancePath = `.tau/artifacts/${artifact.digest.slice('sha256:'.length)}/provenance/${encodeURIComponent(jobId)}-${encodeURIComponent(artifact.artifactId)}.json`;
  const [pathState, setPathState] = useState<'checking' | 'available' | 'missing' | 'corrupt'>('checking');
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState<string>();

  useEffect(() => {
    let active = true;
    const checkPath = async (): Promise<void> => {
      try {
        const available = await exists(projectPath);
        if (active) {
          if (!available) {
            setPathState('missing');
            return;
          }
          const bytes = await readFile(projectPath);
          setPathState(
            bytes.byteLength === artifact.size && (await digestBytes(bytes)) === artifact.digest
              ? 'available'
              : 'corrupt',
          );
        }
      } catch {
        if (active) {
          setPathState('missing');
        }
      }
    };
    // async-iife: bootstrap. Path availability is presentation-only and guarded by this effect's lifetime.
    void checkPath();
    return () => {
      active = false;
    };
  }, [artifact.digest, artifact.size, exists, projectPath, readFile]);

  const importArtifact = async (): Promise<void> => {
    setIsImporting(true);
    setImportError(undefined);
    try {
      const bytes = await fetchJobArtifact({
        apiBaseUrl: ENV.TAU_API_URL,
        jobId,
        artifact,
        signal: AbortSignal.timeout(15 * 60_000),
      });
      await writeFile(projectPath, bytes, { source: 'machine' });
      const stored = await readFile(projectPath);
      if (stored.byteLength !== artifact.size || (await digestBytes(stored)) !== artifact.digest) {
        throw new Error('Imported artifact failed filesystem verification.');
      }
      await writeFile(provenancePath, new TextEncoder().encode(JSON.stringify({ version: 1, projectPath, artifact })), {
        source: 'machine',
      });
      setPathState('available');
    } catch (error) {
      setImportError(error instanceof Error ? error.message : 'Could not import artifact.');
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className='rounded-lg border border-border/70 bg-background/60 p-2 text-xs'>
      <div className='flex min-w-0 items-center gap-2'>
        {pathState === 'available' ? (
          <button
            type='button'
            className='min-w-0 flex-1 truncate text-left font-mono text-primary underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none'
            aria-label={`Open artifact ${artifact.logicalPath}`}
            onClick={() => {
              editorRef.send({ type: 'openFile', path: projectPath, source: 'user' });
            }}
          >
            {artifact.logicalPath}
          </button>
        ) : (
          <span className='min-w-0 flex-1 truncate font-mono text-foreground'>{artifact.logicalPath}</span>
        )}
        <Badge variant='outline' className='h-5 px-1.5 text-[10px]'>
          {artifact.role}
        </Badge>
        {pathState === 'missing' || pathState === 'corrupt' ? (
          <Button
            type='button'
            size='sm'
            variant='outline'
            disabled={isImporting}
            onClick={() => void importArtifact()}
          >
            {isImporting ? 'Importing…' : pathState === 'corrupt' ? 'Repair import' : 'Import'}
          </Button>
        ) : null}
      </div>
      <p className='mt-1 text-muted-foreground'>
        {artifact.mediaType} · {formatFileSize(artifact.size)}
        {pathState === 'missing' ? ' · storage reference only' : ''}
        {pathState === 'corrupt' ? ' · imported copy failed integrity verification' : ''}
      </p>
      {pathState === 'available' ? (
        <p className='mt-1 truncate font-mono text-muted-foreground'>{projectPath}</p>
      ) : null}
      {importError ? (
        <p role='alert' className='mt-1 text-destructive'>
          {importError}
        </p>
      ) : null}
      <details className='mt-1.5 text-muted-foreground'>
        <summary className='cursor-pointer select-none'>Provenance</summary>
        <dl className='mt-1 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 font-mono text-[10px]'>
          <dt>Provider</dt>
          <dd className='min-w-0 break-all'>
            {artifact.provenance.providerId}@{artifact.provenance.providerVersion}
          </dd>
          <dt>Runner</dt>
          <dd className='min-w-0 break-all'>{artifact.provenance.runnerId}</dd>
          <dt>Attempt</dt>
          <dd className='min-w-0 break-all'>
            {artifact.provenance.attempt} · {artifact.provenance.attemptId}
          </dd>
          <dt>Input</dt>
          <dd className='min-w-0 break-all'>{artifact.provenance.inputDigest}</dd>
          <dt>Storage</dt>
          <dd className='min-w-0 break-all'>{artifact.storageKey}</dd>
        </dl>
      </details>
    </div>
  );
};
