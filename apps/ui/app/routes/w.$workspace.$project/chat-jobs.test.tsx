// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { JobProjection, JobSnapshot } from '#lib/jobs-projection.js';
import type * as JobsHookModule from '#hooks/use-jobs.js';
import { useJobs } from '#hooks/use-jobs.js';
import { JobList, JobsPanelBody } from '#routes/w.$workspace.$project/chat-jobs.js';

vi.mock('#hooks/use-project.js', () => ({
  useProject: () => ({ editorRef: { send: mocks.openFile } }),
}));
vi.mock('#hooks/use-file-manager.js', () => ({
  useFileManager: () => ({ exists: mocks.exists, readFile: mocks.readFile, writeFile: mocks.writeFile }),
}));
vi.mock('#hooks/use-jobs.js', async (importOriginal) => {
  const original = await importOriginal<typeof JobsHookModule>();
  return { ...original, useJobs: vi.fn() };
});

const mocks = vi.hoisted(() => ({
  exists: vi.fn(async () => true),
  readFile: vi.fn(async () => new Uint8Array()),
  writeFile: vi.fn(async () => undefined),
  openFile: vi.fn(),
}));

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
    version: 'v2406',
    input: { digest, size: 42, mediaType: 'application/json', storageKey: 'inputs/job-1.json' },
    requirements: [],
    slotCost: 1,
    maxAttempts: 3,
    options: {},
    outputs: [],
  },
  state: 'running',
  currentAttempt: 2,
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

const projection = (overrides: Partial<JobProjection> = {}): JobProjection => ({
  snapshot: snapshot(),
  cursor: 2,
  activity: [],
  syncState: 'live',
  ...overrides,
});

beforeEach(() => {
  mocks.exists.mockReset();
  mocks.exists.mockResolvedValue(true);
  mocks.readFile.mockReset();
  mocks.writeFile.mockReset();
  mocks.openFile.mockReset();
  vi.mocked(useJobs).mockReturnValue({
    jobs: [],
    isLoading: false,
    error: undefined,
    retry: vi.fn(),
    cancel: vi.fn(async () => undefined),
    cancellingJobIds: new Set(),
    cancellationErrors: {},
  });
});

describe('Jobs workbench', () => {
  it('renders authoritative state, attempt, progress, artifact metadata, provenance, and project-file routing', async () => {
    const artifactBytes = new Uint8Array(2048);
    const artifactHash = new Uint8Array(await crypto.subtle.digest('SHA-256', artifactBytes));
    const artifactDigest = `sha256:${[...artifactHash].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;
    mocks.readFile.mockResolvedValue(artifactBytes);
    const artifact = {
      artifactId: 'artifact-1',
      digest: artifactDigest,
      size: 2048,
      mediaType: 'model/gltf-binary',
      role: 'visualization',
      logicalPath: 'results/bracket.glb',
      storageKey: 'jobs/job-1/artifacts/bracket.glb',
      provenance: {
        jobId: 'job-1',
        attemptId: 'attempt-2',
        attempt: 2,
        runnerId: 'runner-1',
        providerId: 'openfoam',
        providerVersion: 'v2406',
        inputDigest: digest,
      },
    };
    const cancel = vi.fn(async () => undefined);
    const job = projection({
      snapshot: snapshot({
        progress: { phase: 'Solving', completed: 25, total: 100, message: 'Pressure iteration 25' },
        artifacts: [artifact],
      }),
      activity: [
        {
          eventId: 'event-2',
          sequence: 2,
          type: 'job.progress',
          occurredAt: timestamp,
          message: 'Pressure iteration 25',
        },
      ],
    });

    render(<JobList jobs={[job]} cancellingJobIds={new Set()} cancellationErrors={{}} onCancel={cancel} />);

    expect(screen.getByRole('article', { name: 'openfoam · v2406, Running' })).not.toBeNull();
    expect(screen.getByText('Attempt 2 of 3')).not.toBeNull();
    expect(screen.getByRole('progressbar', { name: 'Solving progress' }).getAttribute('aria-valuetext')).toBe(
      '25 of 100',
    );
    expect(screen.getByText('Pressure iteration 25')).not.toBeNull();
    expect(screen.getByText('visualization')).not.toBeNull();
    expect(screen.getByText(/model\/gltf-binary · 2 KB/u)).not.toBeNull();
    expect(screen.getByText('openfoam@v2406')).not.toBeNull();
    expect(screen.getByText('jobs/job-1/artifacts/bracket.glb')).not.toBeNull();

    const open = await screen.findByRole('button', { name: 'Open artifact results/bracket.glb' });
    fireEvent.click(open);
    expect(mocks.openFile).toHaveBeenCalledWith({
      type: 'openFile',
      path: `.tau/artifacts/${artifactDigest.slice('sha256:'.length)}/results/bracket.glb`,
      source: 'user',
    });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel openfoam · v2406' }));
    expect(cancel).toHaveBeenCalledWith('job-1');
  });

  it('shows every lifecycle state without treating a transport error as completion', () => {
    const states: Array<JobSnapshot['state']> = [
      'queued',
      'assigned',
      'running',
      'waiting',
      'cancel_requested',
      'completed',
      'failed',
      'cancelled',
    ];
    const jobs = states.map((state, index) =>
      projection({
        snapshot: snapshot({
          jobId: `job-${index}`,
          streamId: `stream-${index}`,
          state,
          ...(state === 'failed'
            ? { failure: { code: 'SOLVER_DIVERGED', message: 'Residual increased.', retryable: false } }
            : {}),
          ...(state === 'cancel_requested' || state === 'cancelled'
            ? { cancellationReason: 'Stopped by operator.' }
            : {}),
        }),
        syncState: state === 'running' ? 'failed' : 'complete',
        ...(state === 'running' ? { syncError: 'Durable event sequence gap.' } : {}),
      }),
    );

    render(<JobList jobs={jobs} cancellingJobIds={new Set()} cancellationErrors={{}} onCancel={vi.fn()} />);

    for (const label of [
      'Queued',
      'Assigned',
      'Running',
      'Waiting',
      'Cancellation requested',
      'Completed',
      'Failed',
      'Cancelled',
    ]) {
      expect(screen.getByText(label)).not.toBeNull();
    }
    expect(screen.getByText('SOLVER_DIVERGED')).not.toBeNull();
    expect(screen.getAllByText('Stopped by operator.')).toHaveLength(2);
    expect(screen.getAllByRole('alert').every((alert) => !alert.textContent.includes('Completed'))).toBe(true);
    expect(screen.getByText(/Updates stopped: Durable event sequence gap\./u)).not.toBeNull();
  });

  it('provides labelled overview, list, statuses, retry, and cancellation errors', async () => {
    const retry = vi.fn();
    vi.mocked(useJobs).mockReturnValue({
      jobs: [projection()],
      isLoading: false,
      error: 'Snapshot refresh failed.',
      retry,
      cancel: vi.fn(async () => undefined),
      cancellingJobIds: new Set(['job-1']),
      cancellationErrors: { 'job-1': 'Cancellation request failed.' },
    });
    const populatedRender = render(<JobsPanelBody />);

    expect(screen.getByLabelText('Job overview').textContent).toContain('1job');
    expect(screen.getByRole('list', { name: 'Jobs' })).not.toBeNull();
    expect(screen.getByRole('status', { name: '' }).textContent).toBe('Running');
    expect(screen.getAllByRole('alert').map(({ textContent }) => textContent)).toEqual([
      'Snapshot refresh failed.Retry',
      'Cancellation request failed.',
    ]);
    expect(screen.getByRole('button', { name: 'Cancel openfoam · v2406' })).toBeDisabled();
    populatedRender.unmount();

    vi.mocked(useJobs).mockReturnValue({
      jobs: [],
      isLoading: false,
      error: 'Snapshot refresh failed.',
      retry,
      cancel: vi.fn(async () => undefined),
      cancellingJobIds: new Set(),
      cancellationErrors: {},
    });
    render(<JobsPanelBody />);
    expect(screen.getByRole('alert', { name: 'Jobs unavailable' })).toHaveTextContent(
      'Jobs unavailableSnapshot refresh failed.Retry',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => {
      expect(retry).toHaveBeenCalledOnce();
    });
  });
});
