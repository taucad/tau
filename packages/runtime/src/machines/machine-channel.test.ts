import { MessageChannel } from 'node:worker_threads';

import { describe, expect, it, vi } from 'vitest';

import { createHostAdmissionAuthority, hostAdmissionOperations } from '#host/host-admission.js';
import type { HostRouteGrant } from '#host/host-admission.js';
import { connectMachineChannel, exposeMachineChannel, machineAdmissionScope } from '#machines/machine-channel.js';
import type { MachineChannelHostOperations } from '#machines/machine-channel.js';
import type { MachineDirectory, MachineDirectoryFrame, MachineDirectorySnapshot } from '#machines/machine-directory.js';
import type { MachineJob, MachinePreparedJob } from '#machines/machine-jobs.js';
import type { MachineArtifactReference, MachineCandidate } from '#machines/machine.js';
import { fixtureProvider } from '#machines/machine-session.fixture.js';

const provider = fixtureProvider();

const candidate: MachineCandidate = {
  id: 'candidate-1',
  name: 'Printer',
  endpoint: { address: 'printer.local', interface: 'manual' },
  claimedIdentity: { model: 'X1C' },
  observedAt: '2026-09-14T00:00:00Z',
  expiresAt: '2026-09-14T00:01:00Z',
};
const projectId = 'proj_0123456789abcdefghijK';
const digest = (digit: string) => `sha256:${digit.repeat(64)}` as MachinePreparedJob['preparedDigest'];
const artifact: MachineArtifactReference = {
  projectId,
  path: '.tau/artifacts/2222/part.gcode.3mf',
  digest: digest('2'),
  length: 128,
  mediaType: 'application/vnd.bambulab.gcode-3mf',
  contract: { id: 'manufacturing.toolpath.bambu-gcode-3mf', version: 1 },
  selectedMember: 'Metadata/plate_1.gcode',
};
const prepared: MachinePreparedJob = {
  preparedId: 'prepared-1',
  preparedDigest: digest('3'),
  configurationDigest: digest('4'),
  providerDataDigest: digest('6'),
  setupDigest: digest('5'),
  machineId: 'machine-1',
  physicalMachineId: 'physical-1',
  artifact,
  remoteName: 'tau-prepared-1.gcode.3mf',
  parser: { id: 'fixture-parser', version: '1' },
  preparedAt: '2026-09-14T00:00:00Z',
  expiresAt: '2026-09-14T00:10:00Z',
};
const job: MachineJob = {
  version: 1,
  jobId: 'job-1',
  machineId: 'machine-1',
  artifact,
  configuration: {},
  requestedBy: { kind: 'agent', id: 'agent-1', label: 'Tau agent' },
  state: 'awaiting-approval',
  createdAt: '2026-09-14T00:00:00Z',
  updatedAt: '2026-09-14T00:00:00Z',
  program: {
    name: 'part.gcode.3mf',
    producer: { name: 'Bambu Studio', version: '99.0.0.0' },
    facts: { process: 'fff', layers: 120 },
  },
  checks: [{ id: 'plate', label: 'Plate', state: 'passed', source: 'observed' }],
  prepared,
};

const snapshot: MachineDirectorySnapshot = {
  cursor: {
    hostId: 'host',
    authorityId: 'authority',
    generation: 'generation',
    position: 0,
    revision: 0,
  },
  entries: [],
};

const grants: readonly HostRouteGrant[] = hostAdmissionOperations
  .filter((operation) => operation.startsWith('machines.'))
  .map((operation) => ({ route: 'machines', operation }));
const observedAt = '2026-09-14T00:00:01Z';

const open = ({
  grants: selectedGrants = grants,
  directory: directoryOverride = {},
  operations: operationsOverride = {},
  scope = machineAdmissionScope,
}: Readonly<{
  grants?: readonly HostRouteGrant[];
  directory?: Partial<MachineDirectory>;
  operations?: Partial<MachineChannelHostOperations>;
  scope?: string;
}> = {}) => {
  const admission = createHostAdmissionAuthority({ hostId: 'host' });
  const session = admission.issueTrustedSession({
    actor: { kind: 'user', id: 'user' },
    authorityId: 'authority',
    workspaceId: scope,
    grants: selectedGrants,
  });
  const directory: MachineDirectory = {
    attach: async () => undefined,
    remove: async () => undefined,
    snapshot: vi.fn(async () => snapshot),
    update: async () => undefined,
    async *watch() {
      yield { type: 'snapshot', snapshot } satisfies MachineDirectoryFrame;
    },
    close: async () => undefined,
    ...directoryOverride,
  };
  const operations: MachineChannelHostOperations = {
    async *discover() {
      yield { type: 'found', candidate };
    },
    beginBinding: vi.fn<MachineChannelHostOperations['beginBinding']>(async () => ({
      status: 'bound',
      machineId: 'machine-1',
    })),
    removeBinding: vi.fn<MachineChannelHostOperations['removeBinding']>(async (input) => ({
      status: 'removed',
      machineId: input.machineId,
    })),
    checkJob: vi.fn<MachineChannelHostOperations['checkJob']>(async () => ({
      status: 'ready',
      program: job.program,
      checks: job.checks,
      configuration: job.configuration,
    })),
    requestJob: vi.fn<MachineChannelHostOperations['requestJob']>(async (input) => ({
      ...job,
      jobId: input.jobId,
      requestedBy: input.requestedBy,
    })),
    listJobs: vi.fn<MachineChannelHostOperations['listJobs']>(async () => [job]),
    async *watchJobs() {
      yield job;
    },
    resolveJob: vi.fn<MachineChannelHostOperations['resolveJob']>(async (input) => ({
      ...job,
      state: input.decision === 'approve' ? 'started' : 'denied',
      resolvedBy: input.resolvedBy,
    })),
    withdrawJob: vi.fn<MachineChannelHostOperations['withdrawJob']>(async (input) => ({
      ...job,
      state: 'withdrawn',
      resolvedBy: input.resolvedBy,
    })),
    approveAction: vi.fn<MachineChannelHostOperations['approveAction']>(async (input) => ({
      status: 'approved',
      operationId: input.operationId,
      expiresAt: '2026-09-06T00:10:00Z',
    })),
    applyAction: vi.fn<MachineChannelHostOperations['applyAction']>(async (input) => ({
      operationId: input.operationId,
      machineId: input.machineId,
      kind: 'action',
      status: 'accepted',
      observedAt,
    })),
    stop: vi.fn<MachineChannelHostOperations['stop']>(async (input) => ({
      operationId: input.operationId ?? 'stop-1',
      machineId: input.machineId,
      kind: 'stop',
      status: 'accepted',
      observedAt,
    })),
    beginHold: vi.fn<MachineChannelHostOperations['beginHold']>(async (input) => ({
      status: 'held',
      holdId: input.operationId,
      lease: 200,
    })),
    renewHold: vi.fn<MachineChannelHostOperations['renewHold']>(async () => ({ status: 'held' })),
    endHold: vi.fn<MachineChannelHostOperations['endHold']>(async (input) => ({
      operationId: input.holdId,
      machineId: 'machine-1',
      kind: 'hold',
      status: 'accepted',
      observedAt,
    })),
    reconcileOperation: vi.fn<MachineChannelHostOperations['reconcileOperation']>(async (input) => ({
      operationId: input.operationId,
      machineId: input.machineId,
      kind: 'start',
      inputDigest: digest('7'),
      state: 'accepted',
      updatedAt: observedAt,
    })),
    setTesting: vi.fn<MachineChannelHostOperations['setTesting']>(async () => {
      throw new Error('MACHINE_DIRECTORY_UNKNOWN_MACHINE');
    }),
    captureStill: vi.fn<MachineChannelHostOperations['captureStill']>(async () => ({
      bytes: Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]),
      mediaType: 'image/jpeg',
      capturedAt: '2026-09-14T00:00:02Z',
      expiresAt: '2026-09-14T00:00:17Z',
    })),
    ...operationsOverride,
  };
  const ports = new MessageChannel();
  const server = exposeMachineChannel({
    port: ports.port1,
    admission,
    session,
    authorityId: 'authority',
    directory,
    providers: [provider],
    operations,
  });
  const client = connectMachineChannel(ports.port2);
  return { admission, client, directory, operations, server, session };
};

describe('machine channel', () => {
  it('serves the typed discovery, binding and directory contract', async () => {
    const fixture = open();
    try {
      await fixture.client.ready;
      await expect(fixture.client.listProviders({})).resolves.toMatchObject([{ id: 'fixture-provider' }]);
      await expect(fixture.client.list({})).resolves.toEqual(snapshot);
      await expect(fixture.client.get({ machineId: 'unknown' })).rejects.toThrow('MACHINE_DIRECTORY_UNKNOWN_MACHINE');
      await expect(fixture.client.beginBinding({ candidate, name: 'Workshop printer' })).resolves.toEqual({
        status: 'bound',
        machineId: 'machine-1',
      });
      await expect(fixture.client.removeBinding({ machineId: 'machine-1' })).resolves.toEqual({
        status: 'removed',
        machineId: 'machine-1',
      });
      expect(fixture.operations.removeBinding).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ machineId: 'machine-1' }),
      );
      const requester = { kind: 'user', id: 'user', label: 'Operator' } as const;
      await expect(fixture.client.checkJob({ machineId: 'machine-1', artifact, configuration: {} })).resolves.toEqual({
        status: 'ready',
        program: job.program,
        checks: job.checks,
        configuration: job.configuration,
      });
      await expect(
        fixture.client.requestJob({
          jobId: 'job-2',
          machineId: 'machine-1',
          artifact,
          configuration: {},
          requestedBy: requester,
          program: { name: 'part' },
        }),
      ).resolves.toEqual({ ...job, jobId: 'job-2', requestedBy: requester });
      await expect(fixture.client.listJobs({})).resolves.toEqual([job]);
      await expect(
        fixture.client.resolveJob({
          jobId: 'job-1',
          decision: 'approve',
          resolvedBy: requester,
          attestations: ['plate-clear'],
          attended: true,
          transferOperationId: 'transfer-1',
          startOperationId: 'start-1',
        }),
      ).resolves.toEqual({ ...job, state: 'started', resolvedBy: requester });
      await expect(fixture.client.withdrawJob({ jobId: 'job-1', resolvedBy: requester })).resolves.toEqual({
        ...job,
        state: 'withdrawn',
        resolvedBy: requester,
      });
      const watched = fixture.client.watchJobs({ machineId: 'machine-1' });
      await expect(watched[Symbol.asyncIterator]().next()).resolves.toEqual({ done: false, value: job });
      await expect(
        fixture.client.applyAction({
          machineId: 'machine-1',
          componentId: 'chamber-light',
          capabilityRevision: digest('8'),
          operationId: 'light-1',
          action: 'switch.set',
          version: 1,
          expectedRunId: null,
          parameters: { on: true },
          requestedBy: { kind: 'agent', id: 'agent-1', label: 'Tau agent' },
        }),
      ).resolves.toMatchObject({ status: 'accepted', kind: 'action' });
      expect(fixture.operations.applyAction).toHaveBeenCalledWith(
        expect.objectContaining({ parameters: { on: true } }),
      );
      const intent = { componentId: 'chamber-light', action: 'switch.set', version: 1, parameters: { on: true } };
      await expect(
        fixture.client.approveAction({ machineId: 'machine-1', operationId: 'light-1', intent, decision: 'approve' }),
      ).resolves.toEqual({ status: 'approved', operationId: 'light-1', expiresAt: '2026-09-06T00:10:00Z' });
      expect(fixture.operations.approveAction).toHaveBeenCalledWith(
        expect.objectContaining({ operationId: 'light-1', intent, decision: 'approve' }),
      );
      await expect(fixture.client.stop({ machineId: 'machine-1', requestedBy: requester })).resolves.toMatchObject({
        status: 'accepted',
        kind: 'stop',
      });
      await expect(
        fixture.client.beginHold({
          machineId: 'machine-1',
          componentId: 'motion',
          capabilityRevision: digest('8'),
          operationId: 'jog-1',
          hold: 'motion.jog',
          version: 1,
          parameters: { axis: 'x', direction: 1, feed: 600 },
          requestedBy: requester,
          attended: true,
        }),
      ).resolves.toEqual({ status: 'held', holdId: 'jog-1', lease: 200 });
      await expect(fixture.client.renewHold({ holdId: 'jog-1' })).resolves.toEqual({ status: 'held' });
      await expect(fixture.client.endHold({ holdId: 'jog-1' })).resolves.toMatchObject({ kind: 'hold' });
      await expect(
        fixture.client.reconcileOperation({ machineId: 'machine-1', operationId: 'start-1' }),
      ).resolves.toMatchObject({ state: 'accepted', kind: 'start' });
      await expect(
        fixture.client.setTesting({ machineId: 'machine-1', enabled: true, requestedBy: requester }),
      ).rejects.toThrow('MACHINE_DIRECTORY_UNKNOWN_MACHINE');
      await expect(fixture.client.captureStill({ machineId: 'machine-1' })).resolves.toMatchObject({
        mediaType: 'image/jpeg',
        capturedAt: '2026-09-14T00:00:02Z',
      });
      const discovery = fixture.client.discover({ providerId: 'fixture-provider', configuration: {} });
      await expect(discovery[Symbol.asyncIterator]().next()).resolves.toEqual({
        done: false,
        value: { type: 'found', candidate },
      });
    } finally {
      fixture.client.close();
      fixture.server.dispose();
    }
  });

  it('should carry the saved-credential flag on discovery frames and accept it back on beginBinding', async () => {
    const saved: MachineCandidate = { ...candidate, credential: 'saved' };
    const fixture = open({
      operations: {
        async *discover() {
          yield { type: 'found', candidate: saved };
        },
      },
    });
    try {
      const discovery = fixture.client.discover({ providerId: 'fixture-provider', configuration: {} });
      await expect(discovery[Symbol.asyncIterator]().next()).resolves.toEqual({
        done: false,
        value: { type: 'found', candidate: saved },
      });
      await expect(fixture.client.beginBinding({ candidate: saved, name: 'Workshop printer' })).resolves.toEqual({
        status: 'bound',
        machineId: 'machine-1',
      });
      expect(fixture.operations.beginBinding).toHaveBeenCalledWith(expect.objectContaining({ candidate: saved }));
    } finally {
      fixture.client.close();
      fixture.server.dispose();
    }
  });

  it('should refuse removeBinding without its exact grant before host work', async () => {
    const fixture = open({ grants: grants.filter(({ operation }) => operation !== 'machines.removeBinding') });
    try {
      await expect(fixture.client.removeBinding({ machineId: 'machine-1' })).rejects.toThrow('ROUTE_DENIED');
      expect(fixture.operations.removeBinding).not.toHaveBeenCalled();
    } finally {
      fixture.client.close();
      fixture.server.dispose();
    }
  });

  it('refuses missing exact grants before provider work', async () => {
    const discover = vi.fn(async function* () {
      yield { type: 'found', candidate } as const;
    });
    const captureStill = vi.fn<MachineChannelHostOperations['captureStill']>(async () => ({
      bytes: Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]),
      mediaType: 'image/jpeg',
      capturedAt: '2026-09-14T00:00:02Z',
      expiresAt: '2026-09-14T00:00:17Z',
    }));
    const fixture = open({
      grants: [{ route: 'machines', operation: 'machines.list' }],
      operations: { discover, captureStill },
    });
    try {
      const iterator = fixture.client
        .discover({ providerId: 'fixture-provider', configuration: {} })
        [Symbol.asyncIterator]();
      await expect(iterator.next()).rejects.toThrow('ROUTE_DENIED');
      expect(discover).not.toHaveBeenCalled();
      await expect(fixture.client.captureStill({ machineId: 'machine-1' })).rejects.toThrow('ROUTE_DENIED');
      expect(captureStill).not.toHaveBeenCalled();
    } finally {
      fixture.client.close();
      fixture.server.dispose();
    }
  });

  it('should refuse an artifact reference outside a project before host work', async () => {
    const fixture = open();
    const requester = { kind: 'user', id: 'user', label: 'Operator' } as const;
    try {
      for (const invalid of [
        { ...artifact, projectId: 'project-1' },
        { ...artifact, projectId: `${projectId}x` },
        { ...artifact, path: '../secret.gcode.3mf' },
        { ...artifact, path: 'parts/../../secret.gcode.3mf' },
        { ...artifact, path: '/etc/part.gcode.3mf' },
        { ...artifact, path: 'parts//part.gcode.3mf' },
        { ...artifact, path: './part.gcode.3mf' },
        { ...artifact, path: '' },
      ]) {
        // oxlint-disable-next-line eslint/no-await-in-loop -- each reference is refused on its own.
        await expect(
          fixture.client.requestJob({
            jobId: 'job-invalid',
            machineId: 'machine-1',
            artifact: invalid,
            configuration: {},
            requestedBy: requester,
          }),
        ).rejects.toThrow();
        // oxlint-disable-next-line eslint/no-await-in-loop -- each reference is refused on its own.
        await expect(
          fixture.client.checkJob({ machineId: 'machine-1', artifact: invalid, configuration: {} }),
        ).rejects.toThrow();
      }
      expect(fixture.operations.requestJob).not.toHaveBeenCalled();
      expect(fixture.operations.checkJob).not.toHaveBeenCalled();
    } finally {
      fixture.client.close();
      fixture.server.dispose();
    }
  });

  it('should pass the project filter of job reads and watches to the host', async () => {
    const watchJobs = vi.fn(async function* () {
      yield job;
    });
    const fixture = open({ operations: { watchJobs } });
    try {
      await expect(fixture.client.listJobs({ projectId })).resolves.toEqual([job]);
      expect(fixture.operations.listJobs).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ projectId }));
      const watched = fixture.client.watchJobs({ machineId: 'machine-1', projectId })[Symbol.asyncIterator]();
      await expect(watched.next()).resolves.toEqual({ done: false, value: job });
      expect(watchJobs).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ machineId: 'machine-1', projectId }));
      await watched.return?.();
      await expect(fixture.client.listJobs({ projectId: 'project-1' })).rejects.toThrow();
      expect(fixture.operations.listJobs).toHaveBeenCalledOnce();
    } finally {
      fixture.client.close();
      fixture.server.dispose();
    }
  });

  it('should refuse an action whose host reply is not a receipt', async () => {
    const malformed: unknown = { status: 'accepted' };
    const fixture = open({
      operations: {
        applyAction: vi.fn(async () => malformed) as unknown as MachineChannelHostOperations['applyAction'],
      },
    });
    try {
      await expect(
        fixture.client.applyAction({
          machineId: 'machine-1',
          componentId: 'chamber-light',
          capabilityRevision: digest('8'),
          operationId: 'light-1',
          action: 'switch.set',
          version: 1,
          expectedRunId: null,
          parameters: { on: true },
          requestedBy: { kind: 'user', id: 'user', label: 'Operator' },
        }),
      ).rejects.toThrow();
    } finally {
      fixture.client.close();
      fixture.server.dispose();
    }
  });

  it('should refuse a session issued under any scope but the machines scope', async () => {
    const fixture = open({ scope: 'workspace' });
    try {
      await expect(fixture.client.list({})).rejects.toThrow('WORKSPACE_MISMATCH');
      expect(fixture.directory.snapshot).not.toHaveBeenCalled();
    } finally {
      fixture.client.close();
      fixture.server.dispose();
    }
  });

  it('settles an awaiting operation when its trusted session is revoked', async () => {
    const pending = Promise.withResolvers<MachineDirectorySnapshot>();
    const read = vi.fn(async () => pending.promise);
    const fixture = open({ directory: { snapshot: read } });
    const result = fixture.client.list({});
    await vi.waitFor(() => {
      expect(read).toHaveBeenCalledOnce();
    });
    fixture.admission.revoke(fixture.session);
    await expect(result).rejects.toThrow(/SESSION_REVOKED|aborted|Channel closed/u);
    pending.resolve(snapshot);
    fixture.client.close();
    fixture.server.dispose();
  });
});
