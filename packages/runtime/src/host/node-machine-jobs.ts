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
import { machineError } from '#host/node-machine-operations.js';
import type { NodeMachineOperationState } from '#host/node-machine-operations.js';
import type { AdmittedHostOperation } from '#host/host-admission.js';
import type { MachineFailure } from '#machines/machine-actions.js';
import { parseMachineProgramSummary } from '#machines/machine-channel.js';
import type { MachineChannelHostOperations } from '#machines/machine-channel.js';
import type { MachineDirectoryEntry } from '#machines/machine-directory.js';
import type { MachineJob, MachinePreparedJob } from '#machines/machine-jobs.js';
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

const failureOf = (error: unknown): NonNullable<MachineJob['failure']> => {
  const code = error !== null && typeof error === 'object' && 'code' in error ? error.code : undefined;
  const message = error instanceof Error ? error.message : 'MACHINE_PREPARATION_FAILED';
  if (typeof code === 'string' && identity.safeParse(code).success) {
    return { code, message: receiptMessage.parse(message.slice(0, 1024) || code) };
  }
  return {
    code: /^[A-Z][A-Z0-9_]{0,255}$/u.test(message) ? message : 'MACHINE_PREPARATION_FAILED',
    message: receiptMessage.parse(message.slice(0, 1024) || 'MACHINE_PREPARATION_FAILED'),
  };
};

/**
 * Fold a job's transfer and start operations into its state.
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
    if (transfer.state !== 'accepted' || receipt.status !== 'accepted' || receipt.kind !== 'transfer') {
      // A start follows only a proven transfer, so an unproven one started nothing and the job can be sent again.
      return {
        ...job,
        state: 'failed',
        receipt,
        failure: {
          code: 'MACHINE_TRANSFER_UNCONFIRMED',
          message: 'The program did not finish reaching the machine, so nothing was started. Send it again.',
        },
      };
    }
    return { ...job, state: 'starting', transferId: receipt.transferId, receipt };
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
    (run.jobId !== job.jobId && run.runId !== job.run?.runId)
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
  const { commitJob, connectedSessions, currentEntry, definitionOf, effectQueue, jobCommits, jobs, machines, now } =
    context;
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
  ): Promise<Readonly<{ refusal: Readonly<{ code: string; message: string }> }> | Prepared> => {
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
    const validated = await definition.submissionConfiguration.schema['~standard'].validate(input.configuration);
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

  // Transfer (for a stored delivery) and start, each once, through the journal. Never resends.
  const drive = async (job: MachineJob, input: Admitted): Promise<MachineJob> => {
    const latest = (): MachineJob => jobs.get(job.jobId) ?? job;
    let current = job;
    const { prepared } = current;
    const preparation = prepared ? context.preparations.get(prepared.preparedId) : undefined;
    const fail = async (failure: Readonly<{ code: string; message: string }>): Promise<MachineJob> =>
      commitJob({ ...latest(), state: 'failed', failure: { code: failure.code, message: failure.message } });
    if (!prepared || !preparation) {
      return fail({ code: 'MACHINE_PREPARATION_EXPIRED', message: 'The preparation expired. Request the job again.' });
    }
    const expired = (): boolean => Date.parse(prepared.expiresAt) <= Date.parse(now());
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
          if (expired()) {
            return {
              refusal: {
                code: 'MACHINE_JOB_SETUP_CHANGED',
                message: 'The preparation expired. Request the job again.',
              },
            };
          }
          if (!session || !entry || session.jobs.type === 'unsupported' || session.jobs.delivery !== 'stored') {
            return { refusal: { code: 'MACHINE_UNAVAILABLE', message: 'This machine is not connected.' } };
          }
          const { jobs: facet } = session;
          return {
            send: async () =>
              facet.transfer({
                operationId: current.transferOperationId ?? '',
                expectedMachineId: prepared.physicalMachineId,
                artifact: prepared.artifact,
                configuration: preparation.configuration,
                remoteName: prepared.remoteName,
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
    const startOperationId = current.startOperationId;
    const transferId = current.transferId;
    const facts = (await currentEntry(current.machineId))?.descriptor.capabilities.jobs;
    // Journaled with the start, so whoever settles it later knows an at-machine start waits for the person.
    const start = facts?.type === 'supported' ? facts.start : 'remote';
    const receipt = await journal.run({
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
        if (expired()) {
          return {
            refusal: { code: 'MACHINE_JOB_SETUP_CHANGED', message: 'The preparation expired. Request the job again.' },
          };
        }
        const checked = await prepare({
          machineId: current.machineId,
          artifact: prepared.artifact,
          configuration: current.configuration,
          signal: input.signal,
        });
        if ('refusal' in checked) {
          return { refusal: { code: 'MACHINE_UNAVAILABLE', message: checked.refusal.message } };
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
        if ((await setupDigestOf(entry, checked.preparation.setup)) !== prepared.setupDigest) {
          return {
            refusal: {
              code: 'MACHINE_JOB_SETUP_CHANGED',
              message: 'The machine’s setup changed since this job was approved. Approve it again.',
            },
          };
        }
        if (checked.preparation.status === 'blocked') {
          return { refusal: { code: 'MACHINE_JOB_CHECK_BLOCKED', message: 'Something this job needs is not ready.' } };
        }
        const { jobs: facet } = session;
        if (facet.type === 'unsupported') {
          return {
            refusal: { code: 'MACHINE_JOB_UNSUPPORTED', message: 'This machine does not run programs from Tau.' },
          };
        }
        return {
          send: async () =>
            facet.start({
              operationId: startOperationId,
              expectedMachineId: prepared.physicalMachineId,
              artifact: prepared.artifact,
              configuration: preparation.configuration,
              remoteName: prepared.remoteName,
              providerData: preparation.providerData,
              ...(transferId === undefined ? {} : { transferId }),
              signal: input.signal,
            }),
        };
      },
    });
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
    operations: {
      async checkJob(input) {
        const machineId = identity.parse(input.machineId);
        const checked = await prepare({ ...input, machineId });
        if ('refusal' in checked) {
          return { status: 'refused', ...checked.refusal };
        }
        const { preparation } = checked;
        return { status: preparation.status, program: preparation.program, checks: preparation.checks };
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
          let job = await commitJob({
            version: 1,
            jobId,
            machineId,
            artifact: input.artifact,
            configuration,
            requestedBy: input.requestedBy,
            state: 'preparing',
            createdAt,
            updatedAt: createdAt,
            program: requested,
            checks: [],
          });
          const checked = await prepare({ machineId, artifact: input.artifact, configuration, signal: input.signal });
          if ('refusal' in checked) {
            return commitJob({ ...job, state: 'failed', failure: checked.refusal });
          }
          try {
            const { entry, preparation } = checked;
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
              artifact: input.artifact,
              remoteName: identity.parse(preparation.remoteName),
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
              version: 1,
              prepared,
              providerId: checked.providerId,
              configuration: checked.configuration,
              providerData,
            });
            context.preparations.set(prepared.preparedId, record);
            // The host's own parse wins where both exist.
            const program = parseMachineProgramSummary({ ...requested, ...preparation.program });
            job = await commitJob({
              ...job,
              state: 'awaiting-approval',
              program,
              checks: preparation.checks,
              prepared,
            });
          } catch (error) {
            job = await commitJob({ ...job, state: 'failed', failure: failureOf(error) });
          }
          return job;
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
        return effectQueue.queueFor(`job:${jobId}`, async () => {
          input.signal.throwIfAborted();
          admitted.assertCurrent();
          const job = jobs.get(jobId);
          if (!job) {
            throw new Error('MACHINE_JOB_UNKNOWN');
          }
          if (input.decision === 'deny') {
            if (job.state !== 'awaiting-approval') {
              throw new Error('MACHINE_JOB_NOT_AWAITING');
            }
            return commitJob({ ...job, state: 'denied', resolvedBy: input.resolvedBy });
          }
          // An approval moves toward the machine; a machine whose journal is unreadable could not record it.
          context.usableMachine(job.machineId, 'MACHINE_UNAVAILABLE');
          let current = job;
          if (current.state === 'awaiting-approval') {
            const entry = await currentEntry(current.machineId);
            const facts = entry?.descriptor.capabilities.jobs;
            if (!entry || !facts) {
              throw refusal({ code: 'MACHINE_UNAVAILABLE', message: 'This machine is not connected.' });
            }
            if (facts.type === 'unsupported') {
              throw refusal({
                code: 'MACHINE_JOB_UNSUPPORTED',
                message: 'This machine does not run programs from Tau.',
              });
            }
            const isAgent = admitted.actor.kind === 'agent' || input.resolvedBy.kind === 'agent';
            if (isAgent && input.attended === true) {
              throw refusal({
                code: 'MACHINE_ACTION_PERSON_REQUIRED',
                message: 'Only a person can say they are at the machine.',
              });
            }
            if (isAgent && (facts.safety.authority !== 'agent' || facts.safety.attended)) {
              throw refusal({
                code: 'MACHINE_ACTION_APPROVAL_REQUIRED',
                message: 'A person must approve this job in Tau.',
              });
            }
            if (facts.safety.attended && input.attended !== true) {
              throw refusal({
                code: 'MACHINE_ACTION_ATTENDANCE_REQUIRED',
                message: 'Say you are at the machine first.',
              });
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
            const blocked = current.checks.find((check) => check.state === 'blocked');
            if (blocked) {
              throw refusal({ code: 'MACHINE_JOB_CHECK_BLOCKED', message: `${blocked.label}: not ready.` });
            }
            const at = now();
            const stored = facts.delivery === 'stored';
            current = await commitJob({
              ...current,
              state: stored ? 'transferring' : 'starting',
              resolvedBy: input.resolvedBy,
              attestations: [...made].map((id) => ({ id, by: input.resolvedBy, at })),
              ...(isAgent ? {} : { attended: input.attended === true }),
              ...(stored ? { transferOperationId: identity.parse(input.transferOperationId ?? randomUUID()) } : {}),
              startOperationId: identity.parse(input.startOperationId ?? randomUUID()),
            });
          } else if (current.state === 'approved' || current.state === 'transferring' || current.state === 'starting') {
            if (
              (input.transferOperationId !== undefined && input.transferOperationId !== current.transferOperationId) ||
              (input.startOperationId !== undefined && input.startOperationId !== current.startOperationId)
            ) {
              throw refusal({
                code: 'MACHINE_OPERATION_ID_CONFLICT',
                message: 'This job already uses other operation ids.',
              });
            }
          } else if (current.state !== 'awaiting-start' && !terminalJobStates.has(current.state)) {
            throw new Error('MACHINE_JOB_NOT_AWAITING');
          } else {
            return current;
          }
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
        return effectQueue.queueFor(`job:${jobId}`, async () => {
          input.signal.throwIfAborted();
          input.admitted.assertCurrent();
          const job = jobs.get(jobId);
          if (!job) {
            throw new Error('MACHINE_JOB_UNKNOWN');
          }
          if (job.state !== 'awaiting-approval') {
            throw new Error('MACHINE_JOB_NOT_AWAITING');
          }
          return commitJob({ ...job, state: 'withdrawn', resolvedBy: input.resolvedBy });
        });
      },
    },
  };
};
