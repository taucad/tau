import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ENV } from '#environment.config.js';
import { useProject } from '#hooks/use-project.js';
import {
  JobProjectionProtocolError,
  applyDurableJobRead,
  createJobProjection,
  isTerminalJobState,
  jobArtifactDownloadSchema,
  markJobProjectionSync,
  parseJobList,
  parseJobSnapshot,
} from '#lib/jobs-projection.js';
import type { JobArtifact, JobProjection, JobSnapshot } from '#lib/jobs-projection.js';

const durableLongPollDuration = 25_000;
const listRefreshDuration = 10_000;
const initialReconnectDelay = 500;
const maximumReconnectDelay = 10_000;

type FetchLike = typeof fetch;

export class JobsHttpError extends Error {
  public readonly status: number;

  public constructor(message: string, status: number) {
    super(message);
    this.name = 'JobsHttpError';
    this.status = status;
  }
}

const readJson = async (response: Response, label: string): Promise<unknown> => {
  if (!response.ok) {
    throw new JobsHttpError(`${label} failed with HTTP ${response.status}.`, response.status);
  }
  try {
    return await response.json();
  } catch (error) {
    throw new JobProjectionProtocolError(`${label} returned malformed JSON.`, { cause: error });
  }
};

const jobsUrl = (apiBaseUrl: string, suffix: string): string => `${apiBaseUrl.replace(/\/$/u, '')}/v1${suffix}`;

export const fetchProjectJobs = async ({
  apiBaseUrl,
  projectId,
  signal,
  fetcher = fetch,
}: {
  readonly apiBaseUrl: string;
  readonly projectId: string;
  readonly signal: AbortSignal;
  readonly fetcher?: FetchLike;
}): Promise<readonly JobSnapshot[]> => {
  const url = new URL(jobsUrl(apiBaseUrl, '/jobs'));
  url.searchParams.set('projectId', projectId);
  const response = await fetcher(url, {
    method: 'GET',
    credentials: 'include',
    headers: { accept: 'application/json' },
    signal,
  });
  return parseJobList(await readJson(response, 'Jobs snapshot'));
};

export const fetchJobSnapshot = async ({
  apiBaseUrl,
  jobId,
  signal,
  fetcher = fetch,
}: {
  readonly apiBaseUrl: string;
  readonly jobId: string;
  readonly signal: AbortSignal;
  readonly fetcher?: FetchLike;
}): Promise<JobSnapshot> => {
  const response = await fetcher(jobsUrl(apiBaseUrl, `/jobs/${encodeURIComponent(jobId)}`), {
    method: 'GET',
    credentials: 'include',
    headers: { accept: 'application/json' },
    signal,
  });
  return parseJobSnapshot(await readJson(response, 'Job snapshot'));
};

export const fetchDurableJobPage = async ({
  apiBaseUrl,
  streamId,
  afterSequence,
  signal,
  fetcher = fetch,
  longPollDuration = durableLongPollDuration,
}: {
  readonly apiBaseUrl: string;
  readonly streamId: string;
  readonly afterSequence: number;
  readonly signal: AbortSignal;
  readonly fetcher?: FetchLike;
  readonly longPollDuration?: number;
}): Promise<unknown> => {
  const url = new URL(jobsUrl(apiBaseUrl, `/streams/${encodeURIComponent(streamId)}/events`));
  url.searchParams.set('afterSequence', String(afterSequence));
  url.searchParams.set('longPollDuration', String(longPollDuration));
  const response = await fetcher(url, {
    method: 'GET',
    credentials: 'include',
    headers: { accept: 'application/json' },
    signal,
  });
  return readJson(response, 'Job event stream');
};

export const requestJobCancellation = async ({
  apiBaseUrl,
  jobId,
  reason,
  signal,
  fetcher = fetch,
}: {
  readonly apiBaseUrl: string;
  readonly jobId: string;
  readonly reason: string;
  readonly signal: AbortSignal;
  readonly fetcher?: FetchLike;
}): Promise<void> => {
  const response = await fetcher(jobsUrl(apiBaseUrl, `/jobs/${encodeURIComponent(jobId)}/cancel`), {
    method: 'POST',
    credentials: 'include',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify({ reason }),
    signal,
  });
  const body = await readJson(response, 'Job cancellation');
  if (
    typeof body !== 'object' ||
    body === null ||
    !('accepted' in body) ||
    body.accepted !== true ||
    Object.keys(body).length !== 1
  ) {
    throw new JobProjectionProtocolError('Malformed job cancellation response.');
  }
};

export const digestBytes = async (bytes: Uint8Array<ArrayBuffer>): Promise<`sha256:${string}`> => {
  const hash = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return `sha256:${[...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;
};

export const fetchJobArtifact = async ({
  apiBaseUrl,
  jobId,
  artifact,
  signal,
  fetcher = fetch,
}: {
  readonly apiBaseUrl: string;
  readonly jobId: string;
  readonly artifact: JobArtifact;
  readonly signal: AbortSignal;
  readonly fetcher?: FetchLike;
}): Promise<Uint8Array<ArrayBuffer>> => {
  const manifestResponse = await fetcher(
    jobsUrl(apiBaseUrl, `/jobs/${encodeURIComponent(jobId)}/artifacts/${encodeURIComponent(artifact.artifactId)}`),
    { method: 'GET', credentials: 'include', headers: { accept: 'application/json' }, signal },
  );
  const manifest = jobArtifactDownloadSchema.parse(await readJson(manifestResponse, 'Job artifact'));
  if (
    manifest.digest !== artifact.digest ||
    manifest.mediaType !== artifact.mediaType ||
    manifest.size !== artifact.size ||
    manifest.storageKey !== artifact.storageKey
  ) {
    throw new JobProjectionProtocolError('Job artifact metadata changed after terminal publication.');
  }
  const contentResponse = await fetcher(manifest.downloadUrl, { method: 'GET', credentials: 'omit', signal });
  if (!contentResponse.ok) {
    throw new JobsHttpError(
      `Job artifact download failed with HTTP ${contentResponse.status}.`,
      contentResponse.status,
    );
  }
  const bytes = new Uint8Array(await contentResponse.arrayBuffer());
  if (bytes.byteLength !== artifact.size || (await digestBytes(bytes)) !== artifact.digest) {
    throw new JobProjectionProtocolError('Job artifact bytes do not match the committed manifest.');
  }
  return bytes;
};

const isAbortError = (error: unknown): boolean => error instanceof Error && error.name === 'AbortError';

const abortError = (signal: AbortSignal): Error =>
  signal.reason instanceof Error ? signal.reason : new DOMException('Aborted', 'AbortError');

const abortableDelay = async (duration: number, signal: AbortSignal): Promise<void> => {
  await new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(abortError(signal));
      return;
    }
    const onAbort = (): void => {
      clearTimeout(reconnectTimeout);
      reject(abortError(signal));
    };
    const reconnectTimeout = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, duration);
    signal.addEventListener('abort', onAbort, { once: true });
  });
};

export type PollJobStreamOutcome = 'terminal' | 'aborted' | 'protocol-error';

export const pollJobStream = async ({
  initial,
  read,
  publish,
  signal,
  waitForReconnect = abortableDelay,
}: {
  readonly initial: JobProjection;
  readonly read: (cursor: number, signal: AbortSignal) => Promise<unknown>;
  readonly publish: (projection: JobProjection) => void;
  readonly signal: AbortSignal;
  readonly waitForReconnect?: (duration: number, signal: AbortSignal) => Promise<void>;
}): Promise<PollJobStreamOutcome> => {
  let projection = initial;
  let reconnectDelay = initialReconnectDelay;
  publish(markJobProjectionSync(projection, 'connecting'));

  /* oxlint-disable no-await-in-loop -- Each durable read must use the cursor produced by the preceding page. */
  while (!signal.aborted) {
    try {
      const raw = await read(projection.cursor, signal);
      projection = applyDurableJobRead({ current: projection, raw });
      publish(projection);
      reconnectDelay = initialReconnectDelay;
      if (isTerminalJobState(projection.snapshot.state)) {
        return 'terminal';
      }
    } catch (error) {
      if (isAbortError(error)) {
        return 'aborted';
      }
      if (error instanceof JobProjectionProtocolError) {
        publish(markJobProjectionSync(projection, 'failed', error.message));
        return 'protocol-error';
      }
      const message = error instanceof Error ? error.message : 'Job stream disconnected.';
      publish(markJobProjectionSync(projection, 'reconnecting', message));
      try {
        await waitForReconnect(reconnectDelay, signal);
      } catch {
        return 'aborted';
      }
      reconnectDelay = Math.min(maximumReconnectDelay, reconnectDelay * 2);
    }
  }
  /* oxlint-enable no-await-in-loop */
  return 'aborted';
};

export type JobsView = {
  readonly jobs: readonly JobProjection[];
  readonly isLoading: boolean;
  readonly error?: string;
  readonly retry: () => void;
  readonly cancel: (jobId: string) => Promise<void>;
  readonly cancellingJobIds: ReadonlySet<string>;
  readonly cancellationErrors: Readonly<Record<string, string>>;
};

const sortJobs = (jobs: Iterable<JobProjection>): readonly JobProjection[] =>
  [...jobs].sort((left, right) => {
    const byUpdatedAt = Date.parse(right.snapshot.updatedAt) - Date.parse(left.snapshot.updatedAt);
    return byUpdatedAt === 0 ? left.snapshot.jobId.localeCompare(right.snapshot.jobId) : byUpdatedAt;
  });

const canConnect = (): boolean => {
  return navigator.onLine && document.visibilityState !== 'hidden';
};

/** Project-wide durable job projection. Transport state never mutates the server-authoritative job state. */
export const useJobs = (): JobsView => {
  'use no memo';

  const { projectId } = useProject();
  const apiBaseUrl = ENV.TAU_API_URL;
  const projectionsRef = useRef(new Map<string, JobProjection>());
  const projectionProjectIdRef = useRef(projectId);
  const cancellationControllersRef = useRef(new Set<AbortController>());
  const [jobs, setJobs] = useState<readonly JobProjection[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [generation, setGeneration] = useState(0);
  const [cancellingJobIds, setCancellingJobIds] = useState<ReadonlySet<string>>(new Set());
  const [cancellationErrors, setCancellationErrors] = useState<Readonly<Record<string, string>>>({});

  const publish = useCallback((projection: JobProjection): void => {
    projectionsRef.current.set(projection.snapshot.jobId, projection);
    setJobs(sortJobs(projectionsRef.current.values()));
  }, []);

  const retry = useCallback(() => {
    setGeneration((current) => current + 1);
  }, []);

  useEffect(() => {
    const recover = (): void => {
      setGeneration((current) => current + 1);
    };
    globalThis.addEventListener('online', recover);
    globalThis.addEventListener('offline', recover);
    document.addEventListener('visibilitychange', recover);
    return () => {
      globalThis.removeEventListener('online', recover);
      globalThis.removeEventListener('offline', recover);
      document.removeEventListener('visibilitychange', recover);
    };
  }, []);

  useEffect(
    () => () => {
      for (const controller of cancellationControllersRef.current) {
        controller.abort();
      }
      cancellationControllersRef.current.clear();
    },
    [],
  );

  useEffect(() => {
    const controller = new AbortController();
    const streamControllers = new Map<string, AbortController>();
    const streamTasks = new Map<string, Promise<void>>();
    let refreshing = false;
    const isStopped = (): boolean => controller.signal.aborted;
    if (projectionProjectIdRef.current !== projectId) {
      projectionProjectIdRef.current = projectId;
      projectionsRef.current = new Map();
      setJobs([]);
    }
    // oxlint-disable-next-line react/set-state-in-effect -- This imperative polling lifecycle resets view state when its external transport subscription restarts.
    setError(undefined);
    setIsLoading(true);

    if (!canConnect()) {
      setIsLoading(false);
      const pausedMessage = navigator.onLine
        ? 'Job updates are paused while this tab is hidden.'
        : 'Job updates are paused offline.';
      setError(pausedMessage);
      for (const projection of projectionsRef.current.values()) {
        if (!isTerminalJobState(projection.snapshot.state)) {
          publish(markJobProjectionSync(projection, 'reconnecting', pausedMessage));
        }
      }
      return () => {
        controller.abort();
      };
    }

    const startStream = (projection: JobProjection): void => {
      if (
        streamControllers.has(projection.snapshot.streamId) ||
        (isTerminalJobState(projection.snapshot.state) && projection.cursor > 0) ||
        projection.syncState === 'failed'
      ) {
        return;
      }
      const streamController = new AbortController();
      const abortStream = (): void => {
        streamController.abort();
      };
      controller.signal.addEventListener('abort', abortStream, { once: true });
      streamControllers.set(projection.snapshot.streamId, streamController);
      const runStream = async (): Promise<void> => {
        try {
          await pollJobStream({
            initial: projection,
            signal: streamController.signal,
            read: async (cursor, signal) =>
              fetchDurableJobPage({
                apiBaseUrl,
                streamId: projection.snapshot.streamId,
                afterSequence: cursor,
                signal,
              }),
            publish,
          });
        } finally {
          controller.signal.removeEventListener('abort', abortStream);
          streamControllers.delete(projection.snapshot.streamId);
          streamTasks.delete(projection.snapshot.streamId);
        }
      };
      const streamTask = runStream();
      streamTasks.set(projection.snapshot.streamId, streamTask);
    };

    const refresh = async (): Promise<void> => {
      if (refreshing || isStopped()) {
        return;
      }
      refreshing = true;
      try {
        const snapshots = await fetchProjectJobs({ apiBaseUrl, projectId, signal: controller.signal });
        controller.signal.throwIfAborted();
        const serverIds = new Set(snapshots.map(({ jobId }) => jobId));
        for (const jobId of projectionsRef.current.keys()) {
          if (!serverIds.has(jobId)) {
            projectionsRef.current.delete(jobId);
          }
        }
        for (const snapshot of snapshots) {
          const projection = createJobProjection(snapshot, projectionsRef.current.get(snapshot.jobId));
          projectionsRef.current.set(snapshot.jobId, projection);
          startStream(projection);
        }
        setJobs(sortJobs(projectionsRef.current.values()));
        setError(undefined);
      } catch (error) {
        if (!isStopped()) {
          setError(error instanceof Error ? error.message : 'Could not read project jobs.');
        }
      } finally {
        if (!isStopped()) {
          setIsLoading(false);
        }
        refreshing = false;
      }
    };

    void refresh();
    const listRefreshInterval = setInterval(() => {
      void refresh();
    }, listRefreshDuration);
    return () => {
      clearInterval(listRefreshInterval);
      controller.abort();
      for (const streamController of streamControllers.values()) {
        streamController.abort();
      }
    };
  }, [apiBaseUrl, generation, projectId, publish]);

  const cancel = useCallback(
    async (jobId: string): Promise<void> => {
      const current = projectionsRef.current.get(jobId);
      if (!current || isTerminalJobState(current.snapshot.state) || current.snapshot.state === 'cancel_requested') {
        return;
      }
      const controller = new AbortController();
      cancellationControllersRef.current.add(controller);
      setCancellingJobIds((ids) => new Set(ids).add(jobId));
      setCancellationErrors((errors) => {
        return Object.fromEntries(Object.entries(errors).filter(([candidateJobId]) => candidateJobId !== jobId));
      });
      try {
        await requestJobCancellation({
          apiBaseUrl,
          jobId,
          reason: 'Cancelled from the Jobs workbench.',
          signal: controller.signal,
        });
        const snapshot = await fetchJobSnapshot({ apiBaseUrl, jobId, signal: controller.signal });
        publish(createJobProjection(snapshot, projectionsRef.current.get(jobId)));
      } catch (error) {
        setCancellationErrors((errors) => ({
          ...errors,
          [jobId]: error instanceof Error ? error.message : 'Could not request cancellation.',
        }));
      } finally {
        cancellationControllersRef.current.delete(controller);
        setCancellingJobIds((ids) => {
          const next = new Set(ids);
          next.delete(jobId);
          return next;
        });
      }
    },
    [apiBaseUrl, publish],
  );

  return useMemo(
    () => ({ jobs, isLoading, error, retry, cancel, cancellingJobIds, cancellationErrors }),
    [jobs, isLoading, error, retry, cancel, cancellingJobIds, cancellationErrors],
  );
};
