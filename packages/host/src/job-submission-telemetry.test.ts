import { afterEach, describe, expect, it, vi } from 'vitest';

import { createInMemoryJobCoordinator, digestJobDefinition } from '@taucad/jobs';
import type {
  DurableJobEvent,
  JobArtifactManifest,
  JobCoordinator,
  JobDefinition,
  JobJsonValue,
  JobSubmission,
  JobSubmitOutcome,
} from '@taucad/jobs';
import { parseRuntimeEntry } from '@taucad/telemetry';
import { createIngestReporter, createJobSnapshotObserver, reconcileEntry, submitEntry } from '@taucad/telemetry/client';
import type { IngestReporter, JobSubmitOutcomeInput, RuntimeEntryContext } from '@taucad/telemetry/client';

import { startHostJobAttemptHost } from '#job-attempt-host.js';
import type {
  HostJobAttemptHostEvent,
  HostJobAttemptHostHandle,
  HostJobCoordinatorPort,
  HostJobExecutor,
} from '#job-attempt-host.js';

/*
 * T20: job submission recovery joined to telemetry. The reference coordinator is the admission authority, the
 * host attempt host executes its leases, and every telemetry entry travels through the real ingest reporter into an
 * in-memory ingest endpoint, which is what these tests read back.
 */

type Port = HostJobCoordinatorPort<JobDefinition, JobArtifactManifest, JobJsonValue>;
type Executor = HostJobExecutor<JobDefinition, JobArtifactManifest, JobJsonValue>;
type PostedEntry = Readonly<{ name: string; detail: Record<string, unknown> }>;

const context: RuntimeEntryContext = {
  route: 'daemon',
  caller: 'host',
  release: '1.2.3',
  platform: 'node',
  os: 'linux',
};
const providerId = 'tau.calculix.container';
const inputDigest: `sha256:${string}` = `sha256:${'0'.repeat(64)}`;
const definition: JobDefinition = {
  type: 'conformance.echo',
  version: '1',
  input: { digest: inputDigest, size: 0, mediaType: 'application/vnd.tau.snapshot', storageKey: inputDigest },
  requirements: [{ key: 'executor', condition: 'equals', value: 'deterministic' }],
  slotCost: 1,
  maxAttempts: 2,
  options: { message: 'hello' },
  outputs: [],
};

const hosts: HostJobAttemptHostHandle[] = [];
afterEach(async () => {
  await Promise.all(hosts.splice(0).map(async (host) => host.close()));
});

/** The real reporter delivering to an in-memory ingest endpoint that keeps every posted batch. */
const createTelemetryExporter = (): Readonly<{
  reporter: IngestReporter;
  operations: () => Promise<PostedEntry[]>;
}> => {
  const posted: PostedEntry[] = [];
  const fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const batch = JSON.parse(init?.body as string) as { entries: PostedEntry[] };
    posted.push(...batch.entries);
    return Response.json({ recorded: batch.entries.length, rejected: 0, duplicate: 0, disabled: 0, policy: 'on' });
  });
  const reporter = createIngestReporter({
    endpoint: 'https://api.test/v1/telemetry/ingest',
    policyEndpoint: 'https://api.test/v1/telemetry/policy',
    route: context.route,
    identity: () => 'user-1',
    consent: () => 'granted',
    fetch: fetch as typeof globalThis.fetch,
    policyStore: { read: () => ({ policy: 'on', expiresAt: Date.now() + 60_000 }), write: vi.fn() },
  });
  return {
    reporter,
    async operations() {
      await reporter.flush({ reason: 'shutdown' });
      const operations = posted.filter(({ name }) => name === 'runtime.operation');
      for (const entry of operations) {
        expect(parseRuntimeEntry(entry)).toBeDefined();
      }
      return operations;
    },
  };
};

/** The job owner's snapshot observer, fed the authority's projection after every durable event. */
const observeJobs = (
  coordinator: JobCoordinator,
  reporter: IngestReporter,
): Readonly<{ settled: () => Promise<void> }> => {
  const observe = createJobSnapshotObserver({ record: reporter.record, context });
  const previous = new Map<string, Readonly<{ state: string }>>();
  const project = async (jobId: string, earlier: Promise<void>): Promise<void> => {
    await earlier;
    const found = await coordinator.get({ jobId });
    if (!found.found) {
      return;
    }
    const { state, submittedAt } = found.job;
    observe(previous.get(jobId), { jobId, state, providerId, queuedAt: submittedAt });
    previous.set(jobId, { state });
  };
  let chain: Promise<void> = Promise.resolve();
  coordinator.on('event', ({ jobId }: DurableJobEvent) => {
    chain = project(jobId, chain);
  });
  return { settled: async () => chain };
};

const toTelemetryOutcome = (outcome: JobSubmitOutcome): JobSubmitOutcomeInput =>
  outcome.accepted
    ? { type: 'accepted', deduplicated: outcome.deduplicated }
    : { type: 'refused', code: outcome.reason.toUpperCase().replaceAll('-', '_') };

/**
 * A client that records one `submit` per call; a lost reply is `unknown` and the retry with the same key is its
 * `reconcile`, per the telemetry model.
 */
const createSubmittingClient = (
  submit: (input: JobSubmission) => Promise<JobSubmitOutcome>,
  reporter: IngestReporter,
): ((input: JobSubmission) => Promise<JobSubmitOutcome>) => {
  return async (input) => {
    try {
      const outcome = await submit(input);
      reporter.record(submitEntry(toTelemetryOutcome(outcome), 0, context));
      return outcome;
    } catch {
      reporter.record(submitEntry({ type: 'unknown' }, 0, context));
      const outcome = await submit(input);
      reporter.record(reconcileEntry(toTelemetryOutcome(outcome), 0, context));
      return outcome;
    }
  };
};

const createCountingExecutor = (): Executor & { readonly runs: string[] } => {
  const runs: string[] = [];
  return {
    runs,
    async execute({ lease }) {
      runs.push(lease.jobId);
      return { status: 'completed', artifacts: [], result: { value: 'done' } };
    },
  };
};

const startHost = (
  coordinator: Port,
  executor: Executor,
  onEvent?: (event: HostJobAttemptHostEvent) => void,
): HostJobAttemptHostHandle => {
  const host = startHostJobAttemptHost({
    runner: { runnerId: 'runner-1', capabilities: { executor: 'deterministic' }, slots: 1 },
    coordinator,
    executor,
    pollInterval: 1,
    heartbeatInterval: 5,
    heartbeatTtl: 1000,
    leaseDuration: 1000,
    ...(onEvent === undefined ? {} : { onEvent }),
  });
  hosts.push(host);
  return host;
};

const waitForState = async (coordinator: JobCoordinator, jobId: string, states: readonly string[]): Promise<void> => {
  await vi.waitFor(
    async () => {
      const found = await coordinator.get({ jobId });
      expect(found.found && states.includes(found.job.state)).toBe(true);
    },
    { timeout: 5000, interval: 2 },
  );
};

const submission = async (idempotencyKey: string): Promise<JobSubmission> => ({
  idempotencyKey,
  definitionDigest: await digestJobDefinition(definition),
  definition,
});

const summarize = (entries: readonly PostedEntry[]) =>
  entries.map(({ detail }) => ({
    operation: detail['operation'],
    outcome: detail['outcome'],
    ...(detail['deduplicated'] === undefined ? {} : { deduplicated: detail['deduplicated'] }),
  }));

describe('T20: job submission recovery joined to telemetry', () => {
  it('T20: runs one job and records one operation when an admitted submit reply is dropped and retried', async () => {
    const coordinator = createInMemoryJobCoordinator();
    const { reporter, operations } = createTelemetryExporter();
    const jobs = observeJobs(coordinator, reporter);
    let dropNextReply = true;
    const lossyTransport = async (input: JobSubmission): Promise<JobSubmitOutcome> => {
      const reply = await coordinator.submit(input);
      if (dropNextReply) {
        dropNextReply = false;
        throw new Error('TRANSPORT_REPLY_LOST');
      }
      return reply;
    };
    const submit = createSubmittingClient(lossyTransport, reporter);
    const executor = createCountingExecutor();

    const outcome = await submit(await submission('submission-1'));
    expect(outcome).toMatchObject({ accepted: true, deduplicated: true });
    const jobId = outcome.accepted ? outcome.job.jobId : '';
    startHost(coordinator, executor);
    await waitForState(coordinator, jobId, ['completed']);
    await jobs.settled();

    expect(executor.runs).toEqual([jobId]);
    const records = await coordinator.readEvents({ jobId, afterSequence: 0 });
    expect(records.filter(({ event }) => event.type === 'job-submitted')).toHaveLength(1);
    expect(summarize(await operations())).toEqual([
      { operation: 'submit', outcome: 'unknown' },
      { operation: 'reconcile', outcome: 'succeeded', deduplicated: true },
      { operation: 'job', outcome: 'succeeded' },
    ]);
  });

  it('T20: keeps one job for one submission key across an attempt-host restart without double-counting', async () => {
    const coordinator = createInMemoryJobCoordinator();
    const { reporter, operations } = createTelemetryExporter();
    const jobs = observeJobs(coordinator, reporter);
    const submit = createSubmittingClient(async (input) => coordinator.submit(input), reporter);
    const executor = createCountingExecutor();
    const first = await submit(await submission('submission-restart'));
    const jobId = first.accepted ? first.job.jobId : '';

    const before = startHost(coordinator, executor);
    await waitForState(coordinator, jobId, ['completed']);
    await before.close();
    const after = startHost(coordinator, executor);
    await after.ready;
    const retried = await submit(await submission('submission-restart'));
    await jobs.settled();
    await after.close();

    expect(retried).toMatchObject({ accepted: true, deduplicated: true, job: { jobId, state: 'completed' } });
    expect(executor.runs).toEqual([jobId]);
    expect(summarize(await operations())).toEqual([
      { operation: 'submit', outcome: 'succeeded' },
      { operation: 'job', outcome: 'succeeded' },
      { operation: 'submit', outcome: 'succeeded', deduplicated: true },
    ]);
  });

  it.each([
    { name: 'completion first', order: 'complete-first', terminal: 'completed', outcome: 'succeeded' },
    { name: 'cancellation first', order: 'cancel-first', terminal: 'cancelled', outcome: 'cancelled' },
  ] as const)(
    'T20: settles a cancel racing completion ($name) into one terminal state and one job outcome',
    async ({ order, terminal, outcome }) => {
      let skew = 0;
      const coordinator = createInMemoryJobCoordinator({ now: () => Date.now() + skew });
      const { reporter, operations } = createTelemetryExporter();
      const jobs = observeJobs(coordinator, reporter);
      const submitted = await coordinator.submit(await submission(`submission-${order}`));
      const jobId = submitted.accepted ? submitted.job.jobId : '';
      let cancellation: ReturnType<JobCoordinator['requestCancellation']> | undefined;
      // The coordinator serializes calls in invocation order, so each ordering is exact rather than timed.
      const racingPort: Port = {
        ...coordinator,
        async completeAttempt(input) {
          if (order === 'complete-first') {
            const completed = coordinator.completeAttempt(input);
            cancellation = coordinator.requestCancellation({ jobId, reason: 'user' });
            return completed;
          }
          cancellation = coordinator.requestCancellation({ jobId, reason: 'user' });
          return coordinator.completeAttempt(input);
        },
      };
      const warnings: string[] = [];
      const executor = createCountingExecutor();
      const host = startHost(racingPort, executor, (event) => {
        if (event.type === 'warning') {
          warnings.push(event.message);
        }
      });
      await vi.waitFor(() => {
        expect(cancellation).toBeDefined();
      });
      const cancelled = await cancellation;
      await host.close();
      if (order === 'cancel-first') {
        // The rejected completion leaves the cancelled attempt to its lease; the authority settles it on expiry.
        expect(warnings).toEqual(['completeAttempt was rejected: invalid-state']);
        skew = 60_000;
        await expect(coordinator.expireLeases()).resolves.toMatchObject({ lostAttempts: 1 });
      }
      await jobs.settled();

      expect(cancelled).toMatchObject(
        order === 'complete-first' ? { accepted: false, reason: 'terminal' } : { accepted: true },
      );
      const found = await coordinator.get({ jobId });
      expect(found).toMatchObject({ found: true, job: { state: terminal, activeAttempt: undefined } });
      const records = await coordinator.readEvents({ jobId, afterSequence: 0 });
      const events = records.map(({ event }) => event.type);
      expect(events.filter((type) => type === 'attempt-completed' || type === 'job-cancelled')).toHaveLength(
        order === 'complete-first' ? 1 : 0,
      );
      expect(executor.runs).toEqual([jobId]);
      expect(summarize(await operations())).toEqual([{ operation: 'job', outcome }]);
    },
  );
});
