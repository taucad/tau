/**
 * The jobs ledger: how a job moves from preparation through approval, transfer and start, how its state follows the
 * operations recorded for it and the runs the machine reports, and the job operations the machines channel serves.
 * Every transition commits the whole job, so a watcher never needs a cursor.
 *
 * @module
 */

import { randomUUID } from 'node:crypto';

import { canonicalizeCacheValue, digestContent } from '@taucad/cache-core';
import type { CacheValue, ContentDigest } from '@taucad/cache-core';

import { cloneBoundedJson } from '@taucad/parameters/json';
import { identity, receiptMessage } from '#host/node-machine-context.js';
import type { NodeMachineHostContext } from '#host/node-machine-context.js';
import type { NodeMachineOperations } from '#host/node-machine-actions.js';
import { machineError, requesterOf } from '#host/node-machine-operations.js';
import type { NodeMachineOperationState } from '#host/node-machine-operations.js';
import type { AdmittedHostOperation } from '#host/host-admission.js';
import { isMachineJobFailureCode, machineFailureCodes } from '#machines/machine-actions.js';
import type { MachineFailure } from '#machines/machine-actions.js';
import { parseMachineProgramSummary } from '#machines/machine-channel.js';
import type { MachineChannelHostOperations } from '#machines/machine-channel.js';
import type { MachineDirectoryEntry } from '#machines/machine-directory.js';
import type { MachineJob, MachinePreparedJob } from '#machines/machine-jobs.js';
import { componentValue } from '#machines/machine-observation.js';
import type { MachineRun } from '#machines/machine-observation.js';
import type { MachineArtifactReference, MachinePreparation, MachineSession } from '#machines/machine.js';

/** Job states nothing moves on from, except a started job's run outcome. @internal */
export const terminalJobStates: ReadonlySet<MachineJob['state']> = new Set([
  'denied',
  'failed',
  'rejected',
  'started',
  'withdrawn',
]);

/** Job states whose host work still needs the binding; removal is refused until they settle. @internal */
export const bindingBusyStates: ReadonlySet<MachineJob['state']> = new Set([
  'preparing',
  'awaiting-approval',
  'approved',
  'transferring',
  'starting',
  'confirming',
]);

const encoder = new TextEncoder();
const configurationLimits = {
  code: 'NODE_MACHINE_PREPARATION_CONFIGURATION',
  maximumDepth: 20,
  maximumNodes: 2048,
  maximumCharacters: 65_536,
};
const digestOf = async (value: unknown, code: string): Promise<ContentDigest> =>
  digestContent({
    bytes: encoder.encode(
      canonicalizeCacheValue({
        value: cloneBoundedJson(value, { code, maximumDepth: 24, maximumNodes: 8192, maximumCharacters: 262_144 }),
      }),
    ),
  });

/**
 * The digest a start is fenced with: the provider's setup facts, the firmware and the installed capabilities, so a
 * changed setup refuses the start until it is approved again.
 * @internal
 */
const setupDigestOf = async (entry: MachineDirectoryEntry, setup: CacheValue): Promise<ContentDigest> =>
  digestOf(
    { firmware: entry.descriptor.firmware, revision: entry.descriptor.capabilities.revision, setup },
    'NODE_MACHINE_PREPARATION_SETUP',
  );

const runOutcome = (state: MachineRun['state']): NonNullable<MachineJob['run']>['outcome'] =>
  state === 'completed' || state === 'cancelled' || state === 'failed' || state === 'unknown' ? state : 'running';

/**
 * The first interlock a job's start names that is not `safe`, refused as `checkMachineAction` refuses an action's.
 * @param entry - The machine as last observed.
 * @param interlocks - The interlock components the job's safety names.
 * @returns The refusal, or undefined when every interlock is safe.
 */
const interlockRefusal = (entry: MachineDirectoryEntry, interlocks: readonly string[]): MachineFailure | undefined => {
  for (const interlock of interlocks) {
    if (componentValue(entry.snapshot.components, interlock, 'interlock')?.state !== 'safe') {
      const label =
        entry.descriptor.capabilities.components.find((component) => component.id === interlock)?.label ?? interlock;
      return {
        code: 'MACHINE_ACTION_INTERLOCK',
        message: `${label} is not safe. Make the ${label.toLowerCase()} safe at the machine.`,
      };
    }
  }
  return undefined;
};

/** Why a job failed, or why its check refused. */
type JobFailure = NonNullable<MachineJob['failure']>;

// A thrown job code (host or provider `MACHINE_JOB_*`/`MACHINE_TRANSFER_*`) is kept; anything else is a failed preparation.
const failureOf = (error: unknown): JobFailure => {
  const code = error !== null && typeof error === 'object' && 'code' in error ? error.code : undefined;
  const message = error instanceof Error ? error.message : 'MACHINE_PREPARATION_FAILED';
  if (typeof code === 'string' && isMachineJobFailureCode(code)) {
    return { code, message: receiptMessage.parse(message.slice(0, 1024) || code) };
  }
  return {
    code: isMachineJobFailureCode(message) ? message : 'MACHINE_PREPARATION_FAILED',
    message: receiptMessage.parse(message.slice(0, 1024) || 'MACHINE_PREPARATION_FAILED'),
  };
};

/**
 * Fold a job's transfer and start operations into its state. An unproven transfer (`confirming`, `attention`) keeps
 * the job `transferring` until the journal settles it; a start follows only a proven transfer, so a job settled
 * `starting` after its approver's call returned is driven by a person approving it again, admitted as the first
 * approval was (attendance and attestations included).
 * @internal
 * @param job - Any job.
 * @param operations - Every recorded operation, by id.
 * @returns The next job, or `undefined` when nothing moved.
 */
export const advanceJob = (
  job: MachineJob,
  operations: ReadonlyMap<string, NodeMachineOperationState>,
): MachineJob | undefined => {
  const transfer = job.transferOperationId === undefined ? undefined : operations.get(job.transferOperationId);
  const start = job.startOperationId === undefined ? undefined : operations.get(job.startOperationId);
  if (job.state === 'transferring' && transfer?.receipt) {
    const { receipt } = transfer;
    if (receipt.status === 'rejected') {
      return { ...job, state: 'failed', receipt, failure: { code: receipt.code, message: receipt.message } };
    }
    if (transfer.state === 'accepted' && receipt.status === 'accepted' && receipt.kind === 'transfer') {
      return { ...job, state: 'starting', transferId: receipt.transferId, receipt };
    }
    // Unproven: the machine's reports or a provider lookup settle it later; nothing was started.
    return undefined;
  }
  if (!['starting', 'confirming', 'unknown'].includes(job.state) || !start?.receipt) {
    return undefined;
  }
  const { receipt } = start;
  if (start.state === 'rejected' && receipt.status === 'rejected') {
    return { ...job, state: 'rejected', receipt, failure: { code: receipt.code, message: receipt.message } };
  }
  if (start.state === 'confirming' || start.state === 'attention') {
    const state = start.state === 'confirming' ? 'confirming' : 'unknown';
    return state === job.state ? undefined : { ...job, state, receipt };
  }
  if (start.state !== 'accepted') {
    return undefined;
  }
  const atMachine = (start.planned.intent as Readonly<Record<string, unknown>>)['start'] === 'at-machine';
  const runId = receipt.status === 'accepted' && receipt.kind === 'start' ? receipt.runId : undefined;
  return {
    ...job,
    state: atMachine ? 'awaiting-start' : 'started',
    receipt,
    ...(runId === undefined || job.run ? {} : { run: { runId, outcome: 'running' } }),
  };
};

/**
 * Follow a job's run in one report: a run that names the job (or the run its start reported) moves an awaiting or
 * confirming job to `started` and records the run's outcome, kept after the machine forgets it.
 * @internal
 * @param job - Any job.
 * @param entry - The job's machine as last observed.
 * @returns The next job, or `undefined` when nothing a person would see moved.
 */
export const observeJobRun = (job: MachineJob, entry: MachineDirectoryEntry): MachineJob | undefined => {
  const { run } = entry.snapshot;
  if (
    !run ||
    entry.machineId !== job.machineId ||
    !['awaiting-start', 'confirming', 'unknown', 'started'].includes(job.state) ||
    (run.jobId !== job.jobId && run.runId !== job.run?.runId) ||
    // A run this host stopped feeding is over; no later report restarts it.
    job.run?.outcome === 'interrupted'
  ) {
    return undefined;
  }
  const outcome = runOutcome(run.state);
  if (job.state === 'started' && job.run?.runId === run.runId && job.run.outcome === outcome) {
    return undefined;
  }
  return {
    ...job,
    state: 'started',
    run: {
      runId: run.runId,
      outcome,
      ...(run.endedAt === undefined ? {} : { endedAt: run.endedAt }),
      progress: run.progress,
    },
  };
};

type Admitted = Readonly<{ admitted: AdmittedHostOperation; signal: AbortSignal }>;
type Prepared = Readonly<{
  session: MachineSession;
  entry: MachineDirectoryEntry;
  physicalId: string;
  providerId: string;
  configuration: CacheValue;
  preparation: Extract<MachinePreparation, { status: 'ready' | 'blocked' }>;
}>;

/** What the jobs ledger serves. @internal */
export type NodeMachineJobs = Readonly<{
  operations: Pick<
    MachineChannelHostOperations,
    'checkJob' | 'requestJob' | 'listJobs' | 'watchJobs' | 'resolveJob' | 'withdrawJob'
  >;
  /** Follow one recorded transfer or start into its job. */
  sync(operation: NodeMachineOperationState): Promise<void>;
  /** Follow every job's run from the machines' latest reports. */
  observe(): Promise<void>;
  /** Record every running streamed job of a machine as interrupted: the session that fed it is gone. */
  interrupt(machineId: string): Promise<void>;
}>;

/**
 * Serve the jobs ledger over the host's shared state.
 * @internal
 * @param context - The host's shared state.
 * @param journal - The operation journal a job transfers and starts through.
 * @returns The job operations.
 */
export const createNodeMachineJobs = (
  context: NodeMachineHostContext,
  journal: NodeMachineOperations,
): NodeMachineJobs => {
  const {
    commitJob,
    connectedSessions,
    currentEntry,
    definitionOf,
    effectQueue,
    jobCommits,
    jobs,
    machines,
    now,
    preparations,
  } = context;
  const listJobs = (machineId: string | undefined, projectId: string | undefined): readonly MachineJob[] =>
    [...jobs.values()]
      .filter(
        (job) =>
          (machineId === undefined || job.machineId === machineId) &&
          (projectId === undefined || job.artifact.projectId === projectId),
      )
      .toSorted((left, right) => right.createdAt.localeCompare(left.createdAt) || right.jobId.localeCompare(left.jobId))
      .slice(0, 1024);

  // Read-only: everything a job needs to know before anything is recorded or sent.
  const prepare = async (
    input: Readonly<{
      machineId: string;
      artifact: MachineArtifactReference;
      configuration: CacheValue;
      signal: AbortSignal;
    }>,
  ): Promise<Readonly<{ refusal: JobFailure }> | Prepared> => {
    const machine = machines.get(input.machineId);
    const entry = await currentEntry(input.machineId);
    const session = connectedSessions.get(input.machineId);
    if (!machine || !entry || !session || entry.snapshot.connection !== 'connected') {
      return { refusal: { code: 'MACHINE_UNAVAILABLE', message: 'This machine is not connected.' } };
    }
    const facts = entry.descriptor.capabilities.jobs;
    if (facts.type === 'unsupported' || session.jobs.type === 'unsupported') {
      return { refusal: { code: 'MACHINE_JOB_UNSUPPORTED', message: 'This machine does not run programs from Tau.' } };
    }
    const { artifact } = input;
    if (
      !facts.accepts.some(
        (accepted) =>
          accepted.contract.id === artifact.contract.id &&
          accepted.contract.version === artifact.contract.version &&
          accepted.mediaType === artifact.mediaType &&
          (accepted.requiredMembers.length === 0 || accepted.requiredMembers.includes(artifact.selectedMember)),
      )
    ) {
      return {
        refusal: { code: 'MACHINE_JOB_UNSUPPORTED', message: 'This machine does not accept this kind of program.' },
      };
    }
    const definition = await definitionOf(machine.record.providerId);
    // The provider fills what a partial start form leaves out from what the machine reports; the host validates it all.
    let configuration: unknown = input.configuration;
    if (session.jobs.completeConfiguration) {
      try {
        configuration = await session.jobs.completeConfiguration({
          expectedMachineId: machine.record.physicalId,
          artifact,
          configuration: input.configuration,
          signal: input.signal,
        });
      } catch (error) {
        return { refusal: failureOf(error) };
      }
    }
    const validated = await definition.submissionConfiguration.schema['~standard'].validate(configuration);
    if (validated.issues) {
      return { refusal: { code: 'MACHINE_ACTION_PARAMETERS_INVALID', message: 'The start settings are not valid.' } };
    }
    let preparation: MachinePreparation;
    try {
      preparation = await session.jobs.prepare({
        operationId: randomUUID(),
        expectedMachineId: machine.record.physicalId,
        artifact,
        configuration: validated.value,
        signal: input.signal,
      });
    } catch (error) {
      return { refusal: failureOf(error) };
    }
    if (preparation.status === 'refused') {
      return { refusal: { code: preparation.code, message: preparation.message } };
    }
    return {
      session,
      entry,
      physicalId: machine.record.physicalId,
      providerId: machine.record.providerId,
      configuration: cloneBoundedJson(validated.value, configurationLimits),
      preparation,
    };
  };

  // Prepare one job for approval: the provider's read-only preflight, then the prepared record its transfer and start
  // are fenced with. Nothing is sent; a refusal fails the job.
  const prepareJob = async (job: MachineJob, signal: AbortSignal): Promise<MachineJob> => {
    const { machineId, artifact } = job;
    const checked = await prepare({ machineId, artifact, configuration: job.configuration, signal });
    if ('refusal' in checked) {
      return { ...job, state: 'failed', failure: checked.refusal };
    }
    try {
      const { entry, preparation, session } = checked;
      // Only a stored delivery names a file on the machine, and it must.
      if (
        preparation.remoteName === undefined &&
        session.jobs.type === 'supported' &&
        session.jobs.delivery === 'stored'
      ) {
        return {
          ...job,
          state: 'failed',
          failure: {
            code: 'MACHINE_PREPARATION_FAILED',
            message: 'The machine did not name the program it would store.',
          },
        };
      }
      const providerData = cloneBoundedJson(preparation.providerData, {
        code: 'NODE_MACHINE_PROVIDER_PREPARATION',
        maximumDepth: 12,
        maximumNodes: 1024,
        maximumCharacters: 65_536,
      });
      const preparedAt = now();
      const body = {
        preparedId: randomUUID(),
        machineId,
        physicalMachineId: checked.physicalId,
        artifact,
        ...(preparation.remoteName === undefined ? {} : { remoteName: identity.parse(preparation.remoteName) }),
        parser: preparation.parser,
        configurationDigest: await digestOf(checked.configuration, 'NODE_MACHINE_PREPARATION_CONFIGURATION'),
        providerDataDigest: await digestOf(providerData, 'NODE_MACHINE_PROVIDER_PREPARATION'),
        setupDigest: await setupDigestOf(entry, preparation.setup),
        preparedAt,
        expiresAt: new Date(Date.parse(preparedAt) + 10 * 60_000).toISOString(),
      };
      const prepared: MachinePreparedJob = {
        ...body,
        preparedDigest: await digestOf(body, 'NODE_MACHINE_PREPARED_JOB'),
      };
      const record = await context.store.writePreparation({
        version: 2,
        prepared,
        providerId: checked.providerId,
        configuration: checked.configuration,
        providerData,
      });
      preparations.set(prepared.preparedId, record);
      // The host's own parse wins where both exist.
      const program = parseMachineProgramSummary({ ...job.program, ...preparation.program });
      return { ...job, state: 'awaiting-approval', program, checks: preparation.checks, prepared };
    } catch (error) {
      return { ...job, state: 'failed', failure: failureOf(error) };
    }
  };
  // Whether a job's preparation is still held: one a restart purged, or older than its window, is made again.
  const isPrepared = (job: MachineJob): boolean =>
    job.prepared !== undefined &&
    preparations.has(job.prepared.preparedId) &&
    Date.parse(job.prepared.expiresAt) > Date.parse(now());

  const sync = async (operation: NodeMachineOperationState): Promise<void> => {
    const { operationId } = operation.planned;
    for (const job of jobs.values()) {
      if (job.transferOperationId !== operationId && job.startOperationId !== operationId) {
        continue;
      }
      const next = advanceJob(job, context.operations);
      if (next) {
        // oxlint-disable-next-line eslint/no-await-in-loop -- job transitions follow the journal in order.
        await commitJob(next);
      }
    }
  };

  const refusal = (failure: MachineFailure): Error => machineError(failure);
  const hostClosing: MachineFailure = {
    code: 'MACHINE_HOST_CLOSING',
    message: 'Tau is closing and starts nothing new. Approve the job again once Tau carries on.',
  };
  // Refused at the moment of sending: nothing was started, and the job fails rather than wait at `starting`, which no
  // consumer offers a way forward from. Requesting it again costs a new transfer.
  const hostClosingAtStart: MachineFailure = {
    code: 'MACHINE_HOST_CLOSING',
    message: 'Tau was closing, so the job did not start. Request it again.',
  };

  // Transfer (for a stored delivery) and start, each once, through the journal. Never resends.
  const drive = async (job: MachineJob, input: Admitted): Promise<MachineJob> => {
    const latest = (): MachineJob => jobs.get(job.jobId) ?? job;
    let current = job;
    const { prepared } = current;
    const preparation = prepared ? preparations.get(prepared.preparedId) : undefined;
    const fail = async (failure: JobFailure): Promise<MachineJob> =>
      commitJob({ ...latest(), state: 'failed', failure: { code: failure.code, message: failure.message } });
    // The setup digest, not a clock, fences the start: only a preparation a restart purged is missing here.
    if (!prepared || !preparation) {
      return fail({
        code: 'MACHINE_JOB_PREPARATION_EXPIRED',
        message: 'The preparation is gone. Request the job again.',
      });
    }
    if (current.state === 'transferring' && current.transferOperationId !== undefined) {
      const receipt = await journal.run({
        machineId: current.machineId,
        kind: 'transfer',
        operationId: current.transferOperationId,
        intent: { jobId: current.jobId, preparedId: prepared.preparedId, preparedDigest: prepared.preparedDigest },
        requestedBy: current.resolvedBy ?? current.requestedBy,
        machineQueue: true,
        ...input,
        async admit() {
          const session = connectedSessions.get(current.machineId);
          const entry = await currentEntry(current.machineId);
          if (!session || !entry || session.jobs.type === 'unsupported' || session.jobs.delivery !== 'stored') {
            return { refusal: { code: 'MACHINE_UNAVAILABLE', message: 'This machine is not connected.' } };
          }
          const { remoteName } = prepared;
          if (remoteName === undefined) {
            return {
              refusal: { code: 'MACHINE_PREPARATION_FAILED', message: 'This job was prepared for another delivery.' },
            };
          }
          const { jobs: facet } = session;
          return {
            send: async () =>
              facet.transfer({
                operationId: current.transferOperationId ?? '',
                expectedMachineId: prepared.physicalMachineId,
                artifact: prepared.artifact,
                configuration: preparation.configuration,
                remoteName,
                providerData: preparation.providerData,
                signal: input.signal,
              }),
          };
        },
      });
      current = latest();
      if (current.state === 'transferring') {
        return receipt.status === 'rejected' ? fail({ code: receipt.code, message: receipt.message }) : current;
      }
    }
    if (current.state !== 'starting' || current.startOperationId === undefined) {
      return current;
    }
    const { startOperationId, transferId } = current;
    const startEntry = await currentEntry(current.machineId);
    const facts = startEntry?.descriptor.capabilities.jobs;
    // Journaled with the start, so whoever settles it later knows an at-machine start waits for the person.
    const start = facts?.type === 'supported' ? facts.start : 'remote';
    const starting = journal.run({
      machineId: current.machineId,
      kind: 'start',
      operationId: startOperationId,
      intent: {
        jobId: current.jobId,
        preparedId: prepared.preparedId,
        preparedDigest: prepared.preparedDigest,
        ...(transferId === undefined ? {} : { transferId }),
        start,
      },
      requestedBy: current.resolvedBy ?? current.requestedBy,
      ...(current.attended === undefined ? {} : { attended: current.attended }),
      machineQueue: true,
      ...input,
      async admit() {
        const checked = await prepare({
          machineId: current.machineId,
          artifact: prepared.artifact,
          configuration: current.configuration,
          signal: input.signal,
        });
        if ('refusal' in checked) {
          // A provider's own job code has no receipt form; its message still says what happened.
          const code = machineFailureCodes.find((known) => known === checked.refusal.code);
          return { refusal: { code: code ?? 'MACHINE_PREPARATION_FAILED', message: checked.refusal.message } };
        }
        const { entry, session } = checked;
        if (
          entry.snapshot.run !== undefined &&
          !['completed', 'cancelled', 'failed'].includes(entry.snapshot.run.state)
        ) {
          return {
            refusal: { code: 'MACHINE_ACTION_RUN_ACTIVE', message: 'The machine is already running something.' },
          };
        }
        // The setup and the completed configuration (e.g. which slot feeds which filament) as they are now must be
        // what was approved; the approved configuration is what is sent.
        if (
          (await setupDigestOf(entry, checked.preparation.setup)) !== prepared.setupDigest ||
          (await digestOf(checked.configuration, 'NODE_MACHINE_PREPARATION_CONFIGURATION')) !==
            prepared.configurationDigest
        ) {
          return {
            refusal: {
              code: 'MACHINE_JOB_SETUP_CHANGED',
              message: 'The machine’s setup changed since this job was approved. Request the job again.',
            },
          };
        }
        if (checked.preparation.status === 'blocked') {
          return { refusal: { code: 'MACHINE_JOB_CHECK_BLOCKED', message: 'Something this job needs is not ready.' } };
        }
        const { jobs: facet } = session;
        const startFacts = entry.descriptor.capabilities.jobs;
        if (facet.type === 'unsupported' || startFacts.type === 'unsupported') {
          return {
            refusal: { code: 'MACHINE_JOB_UNSUPPORTED', message: 'This machine does not run programs from Tau.' },
          };
        }
        // Checked again at the moment of sending, as an action's interlocks are.
        const interlock = interlockRefusal(entry, startFacts.safety.interlocks);
        if (interlock) {
          return { refusal: interlock };
        }
        // Checked again after every wait above, at the moment of sending: quiescing may have begun after the
        // approval. A start past this point is in `startsInFlight`, which quiescing waits for.
        if (context.isQuiescing()) {
          return { refusal: hostClosingAtStart };
        }
        const step = {
          operationId: startOperationId,
          expectedMachineId: prepared.physicalMachineId,
          artifact: prepared.artifact,
          configuration: preparation.configuration,
          providerData: preparation.providerData,
          ...(transferId === undefined ? {} : { transferId }),
          signal: input.signal,
        };
        if (facet.delivery === 'streamed') {
          return { send: async () => facet.start(step) };
        }
        const { remoteName } = prepared;
        if (remoteName === undefined) {
          return {
            refusal: { code: 'MACHINE_PREPARATION_FAILED', message: 'This job was prepared for another delivery.' },
          };
        }
        return { send: async () => facet.start({ ...step, remoteName }) };
      },
    });
    context.startsInFlight.add(starting);
    let receipt: Awaited<typeof starting>;
    try {
      receipt = await starting;
    } finally {
      context.startsInFlight.delete(starting);
    }
    current = latest();
    if (current.state === 'starting' && receipt.status === 'rejected') {
      // Refused before anything was sent: the start op was never journaled.
      return fail({ code: receipt.code, message: receipt.message });
    }
    return current;
  };

  return {
    sync,
    async observe() {
      // ponytail: visits every job kept (terminal ones return at once); index the jobs a run can still move if a store
      // ever keeps thousands.
      const listed = await context.directory.snapshot();
      const entries = new Map(listed.entries.map((entry) => [entry.machineId, entry]));
      for (const job of jobs.values()) {
        const entry = entries.get(job.machineId);
        const next = entry === undefined ? undefined : observeJobRun(job, entry);
        if (next) {
          // oxlint-disable-next-line eslint/no-await-in-loop -- runs commit in order.
          await commitJob(next);
        }
      }
    },
    async interrupt(machineId) {
      const listed = await context.directory.snapshot();
      const facts =
        listed.entries.find((entry) => entry.machineId === machineId)?.descriptor.capabilities.jobs ??
        machines.get(machineId)?.record.last?.descriptor.capabilities.jobs;
      if (facts?.type !== 'supported' || facts.delivery !== 'streamed') {
        return;
      }
      for (const job of jobs.values()) {
        if (job.machineId === machineId && job.state === 'started' && job.run?.outcome === 'running') {
          // The session fed this run; without it the run is over, and the next start needs a person.
          // oxlint-disable-next-line eslint/no-await-in-loop -- interrupted runs commit in order.
          await commitJob({ ...job, run: { ...job.run, outcome: 'interrupted', endedAt: now() } });
        }
      }
    },
    operations: {
      async checkJob(input) {
        const machineId = identity.parse(input.machineId);
        const checked = await prepare({ ...input, machineId });
        if ('refusal' in checked) {
          return { status: 'refused', ...checked.refusal };
        }
        const { preparation, configuration } = checked;
        return { status: preparation.status, program: preparation.program, checks: preparation.checks, configuration };
      },
      async requestJob(input) {
        if (!context.runtime) {
          throw new Error('MACHINE_OPERATION_UNAVAILABLE');
        }
        const jobId = identity.parse(input.jobId);
        const machineId = identity.parse(input.machineId);
        return effectQueue.queueFor(`job:${jobId}`, async () => {
          input.signal.throwIfAborted();
          input.admitted.assertCurrent();
          const configuration = cloneBoundedJson(input.configuration, configurationLimits);
          const existing = jobs.get(jobId);
          if (existing) {
            if (
              existing.machineId !== machineId ||
              canonicalizeCacheValue({ value: existing.artifact }) !==
                canonicalizeCacheValue({ value: input.artifact }) ||
              canonicalizeCacheValue({ value: existing.configuration }) !==
                canonicalizeCacheValue({ value: configuration })
            ) {
              throw machineError({
                code: 'MACHINE_OPERATION_ID_CONFLICT',
                message: 'This job id was already used for another program.',
              });
            }
            return existing;
          }
          // A job lives in its machine's directory, so an unbound machine gets none.
          context.usableMachine(machineId, 'MACHINE_UNAVAILABLE');
          const createdAt = now();
          const requested = parseMachineProgramSummary({
            name: input.artifact.path.split('/').at(-1) ?? 'program',
            facts: { process: 'other' },
            ...input.program,
          });
          const job = await commitJob({
            version: 1,
            jobId,
            machineId,
            artifact: input.artifact,
            configuration,
            requestedBy: requesterOf(input.admitted.actor, input.requestedBy),
            state: 'preparing',
            createdAt,
            updatedAt: createdAt,
            program: requested,
            checks: [],
          });
          return commitJob(await prepareJob(job, input.signal));
        });
      },
      async listJobs(input) {
        const machineId = input.machineId === undefined ? undefined : identity.parse(input.machineId);
        return listJobs(machineId, input.projectId);
      },
      async *watchJobs(input) {
        const { signal, projectId } = input;
        const machineId = input.machineId === undefined ? undefined : identity.parse(input.machineId);
        // Ponytail: every frame is a whole record, so pending updates coalesce by job id and never need a cursor.
        const pending = new Map<string, MachineJob>();
        let wake = Promise.withResolvers<void>();
        const off = jobCommits.subscribe(
          (job) => {
            if (
              (machineId === undefined || job.machineId === machineId) &&
              (projectId === undefined || job.artifact.projectId === projectId)
            ) {
              pending.set(job.jobId, job);
              wake.resolve();
            }
          },
          { signal },
        );
        const onAbort = (): void => {
          wake.resolve();
        };
        signal.addEventListener('abort', onAbort, { once: true });
        try {
          for (const job of listJobs(machineId, projectId)) {
            signal.throwIfAborted();
            yield pending.get(job.jobId) ?? job;
          }
          while (!signal.aborted) {
            if (pending.size === 0) {
              // oxlint-disable-next-line eslint/no-await-in-loop -- one wake per committed transition.
              await wake.promise;
              wake = Promise.withResolvers<void>();
              continue;
            }
            const batch = [...pending.values()];
            pending.clear();
            for (const job of batch) {
              signal.throwIfAborted();
              yield job;
            }
          }
        } finally {
          off();
          signal.removeEventListener('abort', onAbort);
        }
      },
      async resolveJob(input) {
        if (!context.runtime) {
          throw new Error('MACHINE_OPERATION_UNAVAILABLE');
        }
        const jobId = identity.parse(input.jobId);
        const { admitted } = input;
        const resolvedBy = requesterOf(admitted.actor, input.resolvedBy);
        return effectQueue.queueFor(`job:${jobId}`, async () => {
          input.signal.throwIfAborted();
          admitted.assertCurrent();
          const job = jobs.get(jobId);
          if (!job) {
            throw new Error('MACHINE_JOB_UNKNOWN');
          }
          // A job is resolved on a person's session: an agent neither approves nor denies one, and never drives a
          // start, whatever the machine declares (a start is never on the low-risk list).
          if (resolvedBy.kind === 'agent') {
            throw refusal(
              input.attended === true
                ? { code: 'MACHINE_ACTION_PERSON_REQUIRED', message: 'Only a person can say they are at the machine.' }
                : input.decision === 'deny'
                  ? { code: 'MACHINE_ACTION_PERSON_REQUIRED', message: 'Only a person can deny a job.' }
                  : { code: 'MACHINE_ACTION_APPROVAL_REQUIRED', message: 'A person must approve this job in Tau.' },
            );
          }
          if (input.decision === 'deny') {
            if (job.state !== 'awaiting-approval') {
              throw new Error('MACHINE_JOB_NOT_AWAITING');
            }
            return commitJob({ ...job, state: 'denied', resolvedBy });
          }
          // Refused before anything is recorded, so the job waits to be approved once Tau carries on.
          if (context.isQuiescing()) {
            throw refusal(hostClosing);
          }
          const isFirst = job.state === 'awaiting-approval';
          if (!isFirst && job.state !== 'approved' && job.state !== 'transferring' && job.state !== 'starting') {
            if (job.state !== 'awaiting-start' && !terminalJobStates.has(job.state)) {
              throw new Error('MACHINE_JOB_NOT_AWAITING');
            }
            return job;
          }
          if (
            !isFirst &&
            ((input.transferOperationId !== undefined && input.transferOperationId !== job.transferOperationId) ||
              (input.startOperationId !== undefined && input.startOperationId !== job.startOperationId))
          ) {
            throw refusal({
              code: 'MACHINE_OPERATION_ID_CONFLICT',
              message: 'This job already uses other operation ids.',
            });
          }
          // An approval moves toward the machine; a machine whose journal is unreadable could not record it.
          context.usableMachine(job.machineId, 'MACHINE_UNAVAILABLE');
          const entry = await currentEntry(job.machineId);
          const facts = entry?.descriptor.capabilities.jobs;
          if (!entry || !facts) {
            throw refusal({ code: 'MACHINE_UNAVAILABLE', message: 'This machine is not connected.' });
          }
          if (facts.type === 'unsupported') {
            throw refusal({ code: 'MACHINE_JOB_UNSUPPORTED', message: 'This machine does not run programs from Tau.' });
          }
          // Approving again (a job whose transfer was proven after its approver's call returned) drives a start just
          // as the first approval does, so it is admitted the same way: attendance and attestations, again.
          if (facts.safety.attended && input.attended !== true) {
            throw refusal({ code: 'MACHINE_ACTION_ATTENDANCE_REQUIRED', message: 'Say you are at the machine first.' });
          }
          const declared = new Set(facts.attestations.map(({ id }) => id));
          const made = new Set(input.attestations ?? []);
          const missing = facts.attestations.find(({ id }) => !made.has(id));
          if ([...made].some((id) => !declared.has(id)) || missing) {
            throw refusal({
              code: 'MACHINE_JOB_ATTESTATION_REQUIRED',
              message: missing ? `Confirm first: ${missing.label}` : 'Confirm only what this machine asks for.',
            });
          }
          let current = job;
          if (isFirst && !isPrepared(current)) {
            // Older than its window, or purged by a restart: made again, not refused, since the setup digest fences
            // the start.
            current = await commitJob(await prepareJob(current, input.signal));
            if (current.state !== 'awaiting-approval') {
              return current;
            }
          }
          if (isFirst) {
            const blocked = current.checks.find((check) => check.state === 'blocked');
            if (blocked) {
              throw refusal({ code: 'MACHINE_JOB_CHECK_BLOCKED', message: `${blocked.label}: not ready.` });
            }
            const interlock = interlockRefusal(entry, facts.safety.interlocks);
            if (interlock) {
              throw refusal(interlock);
            }
          }
          const at = now();
          const stored = facts.delivery === 'stored';
          current = await commitJob({
            ...current,
            ...(isFirst
              ? {
                  state: stored ? 'transferring' : 'starting',
                  ...(stored ? { transferOperationId: identity.parse(input.transferOperationId ?? randomUUID()) } : {}),
                  startOperationId: identity.parse(input.startOperationId ?? randomUUID()),
                }
              : {}),
            resolvedBy,
            attestations: [...made].map((id) => ({ id, by: resolvedBy, at })),
            attended: input.attended === true,
          });
          try {
            // The approval is durable: the transfer and start answer to the host, not to the caller's wait.
            return await drive(current, { admitted, signal: admitted.signal });
          } catch (error) {
            const latest = jobs.get(jobId) ?? current;
            return terminalJobStates.has(latest.state)
              ? latest
              : commitJob({ ...latest, state: 'failed', failure: failureOf(error) });
          }
        });
      },
      async withdrawJob(input) {
        const jobId = identity.parse(input.jobId);
        const resolvedBy = requesterOf(input.admitted.actor, input.resolvedBy);
        return effectQueue.queueFor(`job:${jobId}`, async () => {
          input.signal.throwIfAborted();
          input.admitted.assertCurrent();
          const job = jobs.get(jobId);
          if (!job) {
            throw new Error('MACHINE_JOB_UNKNOWN');
          }
          // A loaded program the machine still waits to start can be withdrawn too; a start pressed after that is
          // the machine's own run, which no job follows.
          if (job.state !== 'awaiting-approval' && job.state !== 'awaiting-start') {
            throw new Error('MACHINE_JOB_NOT_AWAITING');
          }
          // An agent withdraws only its own request; a person withdraws any.
          if (
            resolvedBy.kind === 'agent' &&
            (job.requestedBy.kind !== 'agent' || job.requestedBy.id !== resolvedBy.id)
          ) {
            throw refusal({ code: 'MACHINE_ACTION_PERSON_REQUIRED', message: 'Only a person can withdraw this job.' });
          }
          return commitJob({ ...job, state: 'withdrawn', resolvedBy });
        });
      },
    },
  };
};
