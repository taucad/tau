import { describe, expect, it, vi } from 'vitest';
import { fetchDurableJobPage, fetchJobArtifact, pollJobStream, requestJobCancellation } from '#hooks/use-jobs.js';
import { createJobProjection } from '#lib/jobs-projection.js';
import type { DurableJobRead, JobArtifact, JobProjection, JobSnapshot } from '#lib/jobs-projection.js';

const digest = `sha256:${'a'.repeat(64)}`;
const timestamp = '2026-08-28T00:00:00.000Z';
const snapshot = (overrides: Partial<JobSnapshot> = {}): JobSnapshot => ({
  jobId: 'job-1',
  projectId: 'project-1',
  streamId: 'stream-1',
  idempotencyKey: 'job-key-1',
  definitionDigest: digest,
  definition: {
    type: 'openfoam',
    version: '1',
    input: { digest, size: 42, mediaType: 'application/json', storageKey: 'inputs/job-1.json' },
    requirements: [],
    slotCost: 1,
    maxAttempts: 3,
    options: {},
    outputs: [],
  },
  state: 'running',
  currentAttempt: 1,
  orchestratorRunId: 'run-1',
  runnerId: 'runner-1',
  leaseUntil: timestamp,
  createdAt: timestamp,
  updatedAt: timestamp,
  cancelRequestedAt: null,
  finishedAt: null,
  artifacts: [],
  ...overrides,
});

const terminalPage = (): DurableJobRead => ({
  found: true,
  snapshot: {
    streamId: 'stream-1',
    kind: 'job',
    subjectId: 'job-1',
    sequence: 1,
    data: snapshot({ state: 'completed', finishedAt: timestamp }),
  },
  events: [
    {
      streamId: 'stream-1',
      sequence: 1,
      eventId: 'event-1',
      type: 'job.completed',
      occurredAt: timestamp,
      payload: {},
    },
  ],
  nextSequence: 1,
});

describe('jobs HTTP transport', () => {
  it('requests cursor replay with authenticated long polling', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          found: true,
          snapshot: { streamId: 'stream-1', kind: 'job', subjectId: 'job-1', sequence: 4, data: {} },
          events: [],
          nextSequence: 4,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    const { signal } = new AbortController();
    await fetchDurableJobPage({
      apiBaseUrl: 'https://api.example/',
      streamId: 'stream / 1',
      afterSequence: 4,
      longPollDuration: 25_000,
      signal,
      fetcher,
    });

    const [request, options] = fetcher.mock.calls[0]!;
    expect(request).toBeInstanceOf(URL);
    const url = request as URL;
    expect(url.pathname).toBe('/v1/streams/stream%20%2F%201/events');
    expect(url.searchParams.get('afterSequence')).toBe('4');
    expect(url.searchParams.get('longPollDuration')).toBe('25000');
    expect(options).toMatchObject({ method: 'GET', credentials: 'include', signal });
  });

  it('posts cancellation intent without synthesising a job state', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ accepted: true }), {
        status: 202,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    await requestJobCancellation({
      apiBaseUrl: 'https://api.example',
      jobId: 'job-1',
      reason: 'Stop the solve.',
      signal: new AbortController().signal,
      fetcher,
    });

    const [request, options] = fetcher.mock.calls[0]!;
    expect(request).toBe('https://api.example/v1/jobs/job-1/cancel');
    expect(options).toMatchObject({
      method: 'POST',
      credentials: 'include',
      body: JSON.stringify({ reason: 'Stop the solve.' }),
    });
  });

  it('downloads an authorized artifact and verifies its immutable manifest before import', async () => {
    const bytes = new TextEncoder().encode('result');
    const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
    const artifactDigest: `sha256:${string}` = `sha256:${[...hash].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;
    const artifact: JobArtifact = {
      artifactId: 'artifact-1',
      digest: artifactDigest,
      size: bytes.byteLength,
      mediaType: 'text/plain',
      role: 'report',
      logicalPath: 'reports/result.txt',
      storageKey: 'jobs/owner/sha256/result',
      provenance: {
        jobId: 'job-1',
        attemptId: 'attempt-1',
        attempt: 1,
        runnerId: 'runner-1',
        providerId: 'provider-1',
        providerVersion: '1',
        inputDigest: digest,
      },
    };
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({
          digest: artifact.digest,
          mediaType: artifact.mediaType,
          size: artifact.size,
          storageKey: artifact.storageKey,
          downloadUrl: 'https://objects.example/result',
        }),
      )
      .mockResolvedValueOnce(new Response(bytes));

    await expect(
      fetchJobArtifact({
        apiBaseUrl: 'https://api.example',
        jobId: 'job-1',
        artifact,
        signal: new AbortController().signal,
        fetcher,
      }),
    ).resolves.toEqual(bytes);
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({ credentials: 'include' });
    expect(fetcher.mock.calls[1]).toEqual([
      'https://objects.example/result',
      expect.objectContaining({ credentials: 'omit' }),
    ]);
  });

  it('reconnects after transport failure and resumes with the unchanged cursor', async () => {
    const read = vi
      .fn<(cursor: number) => Promise<unknown>>()
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce(terminalPage());
    const published: JobProjection[] = [];
    const waitForReconnect = vi.fn(async () => undefined);

    const outcome = await pollJobStream({
      initial: createJobProjection(snapshot()),
      read,
      publish: (projection) => {
        published.push(projection);
      },
      signal: new AbortController().signal,
      waitForReconnect,
    });

    expect(outcome).toBe('terminal');
    expect(read.mock.calls.map(([cursor]) => cursor)).toEqual([0, 0]);
    expect(published.map(({ syncState }) => syncState)).toContain('reconnecting');
    expect(published.at(-1)?.syncState).toBe('complete');
    expect(waitForReconnect).toHaveBeenCalledWith(500, expect.any(AbortSignal));
  });

  it('stops an in-flight long poll when its owner aborts', async () => {
    const controller = new AbortController();
    const read = vi.fn(
      async (_cursor: number, signal: AbortSignal) =>
        new Promise<unknown>((_resolve, reject) => {
          signal.addEventListener(
            'abort',
            () => {
              reject(new DOMException('Aborted', 'AbortError'));
            },
            { once: true },
          );
        }),
    );
    const running = pollJobStream({
      initial: createJobProjection(snapshot()),
      read,
      publish: vi.fn(),
      signal: controller.signal,
    });
    controller.abort();
    await expect(running).resolves.toBe('aborted');
  });
});
