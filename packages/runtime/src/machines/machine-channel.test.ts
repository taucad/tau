import { MessageChannel } from 'node:worker_threads';

import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { defineConfiguration } from '#configuration/index.js';
import { createHostAdmissionAuthority } from '#host/host-admission.js';
import type { HostRouteGrant } from '#host/host-admission.js';
import { connectMachineChannel, exposeMachineChannel } from '#machines/machine-channel.js';
import type { MachineChannelHostOperations } from '#machines/machine-channel.js';
import type { MachinePreparedPrint } from '#machines/machine-client.js';
import type { MachineDirectory, MachineDirectoryFrame, MachineDirectorySnapshot } from '#machines/machine-directory.js';
import { defineMachine } from '#machines/machine.js';
import type { MachineArtifactReference, MachineCandidate } from '#machines/machine.js';
import { machineManifestFixture } from '#machines/machine-manifest.fixture.js';
import type { PrintRequest } from '#machines/print-request.js';

const configuration = defineConfiguration({
  id: 'fixture.configuration',
  version: '1',
  schema: z.strictObject({}),
  ui: { version: 1, rjsf: {} },
});

const provider = defineMachine({
  id: 'fixture-provider',
  name: 'Fixture provider',
  version: '1',
  protocolVersion: 1,
  vendor: 'fixture',
  technologies: ['additive.fff'],
  accepts: [
    {
      contract: { id: 'fixture.gcode', version: 1 },
      mediaType: 'text/x.gcode',
      requiredMembers: [],
      payloadSelection: 'single',
      technology: 'additive.fff',
    },
  ],
  manifest: machineManifestFixture,
  bindingConfiguration: configuration,
  submissionConfiguration: configuration,
  async *discover() {
    yield* [];
  },
  async connect() {
    throw new Error('Fixture does not connect');
  },
})();

const candidate: MachineCandidate = {
  id: 'candidate-1',
  name: 'Printer',
  endpoint: { address: 'printer.local', interface: 'manual' },
  claimedIdentity: { model: 'X1C' },
  observedAt: '2026-09-14T00:00:00Z',
  expiresAt: '2026-09-14T00:01:00Z',
};
const artifact: MachineArtifactReference = {
  revision: {
    authorityId: 'authority',
    workspaceId: 'workspace',
    revisionId: 'revision-1' as MachineArtifactReference['revision']['revisionId'],
    treeDigest: `sha256:${'1'.repeat(64)}` as MachineArtifactReference['digest'],
  },
  path: 'part.gcode.3mf',
  digest: `sha256:${'2'.repeat(64)}` as MachineArtifactReference['digest'],
  length: 128,
  mediaType: 'application/vnd.bambulab.gcode-3mf',
  contract: { id: 'manufacturing.toolpath.bambu-gcode-3mf', version: 1 },
  selectedMember: 'Metadata/plate_1.gcode',
};
const prepared: MachinePreparedPrint = {
  preparedId: 'prepared-1',
  preparedDigest: `sha256:${'3'.repeat(64)}` as MachinePreparedPrint['preparedDigest'],
  configurationDigest: `sha256:${'4'.repeat(64)}` as MachinePreparedPrint['configurationDigest'],
  providerDataDigest: `sha256:${'6'.repeat(64)}` as MachinePreparedPrint['providerDataDigest'],
  setupDigest: `sha256:${'5'.repeat(64)}` as MachinePreparedPrint['setupDigest'],
  machineId: 'machine-1',
  physicalMachineId: 'physical-1',
  artifact,
  remoteName: 'tau-prepared-1.gcode.3mf',
  parser: { id: 'fixture-parser', version: '1' },
  preparedAt: '2026-09-14T00:00:00Z',
  expiresAt: '2026-09-14T00:10:00Z',
};

const request: PrintRequest = {
  requestId: 'request-1',
  machineId: 'machine-1',
  artifact,
  configuration: {},
  requestedBy: { kind: 'agent', id: 'agent-1', label: 'Tau agent' },
  summary: { fileName: 'part.gcode.3mf', producer: { name: 'Bambu Studio', version: '99.0.0.0' } },
  state: 'awaiting-approval',
  createdAt: '2026-09-14T00:00:00Z',
  updatedAt: '2026-09-14T00:00:00Z',
  prepared,
};

const snapshot: MachineDirectorySnapshot = {
  cursor: {
    hostId: 'host',
    authorityId: 'authority',
    workspaceId: 'workspace',
    generation: 'generation',
    position: 0,
    revision: 0,
  },
  entries: [],
};

const grants: readonly HostRouteGrant[] = [
  { route: 'machines', operation: 'machines.listProviders' },
  { route: 'machines', operation: 'machines.discover' },
  { route: 'machines', operation: 'machines.beginBinding' },
  { route: 'machines', operation: 'machines.preparePrint' },
  { route: 'machines', operation: 'machines.uploadPrint' },
  { route: 'machines', operation: 'machines.startPrint' },
  { route: 'machines', operation: 'machines.requestPrint' },
  { route: 'machines', operation: 'machines.listPrintRequests' },
  { route: 'machines', operation: 'machines.watchPrintRequests' },
  { route: 'machines', operation: 'machines.resolvePrintRequest' },
  { route: 'machines', operation: 'machines.withdrawPrintRequest' },
  { route: 'machines', operation: 'machines.reconcileOperation' },
  { route: 'machines', operation: 'machines.controlRun' },
  { route: 'machines', operation: 'machines.captureStill' },
  { route: 'machines', operation: 'machines.list' },
  { route: 'machines', operation: 'machines.get' },
  { route: 'machines', operation: 'machines.watch' },
];

const open = (
  selectedGrants = grants,
  directoryOverride: Partial<MachineDirectory> = {},
  operationsOverride: Partial<MachineChannelHostOperations> = {},
) => {
  const admission = createHostAdmissionAuthority({ hostId: 'host' });
  const session = admission.issueTrustedSession({
    actor: { kind: 'user', id: 'user' },
    authorityId: 'authority',
    workspaceId: 'workspace',
    grants: selectedGrants,
  });
  const directory: MachineDirectory = {
    attach: async () => undefined,
    remove: async () => undefined,
    snapshot: vi.fn(async () => snapshot),
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
    preparePrint: vi.fn<MachineChannelHostOperations['preparePrint']>(async () => prepared),
    uploadPrint: vi.fn<MachineChannelHostOperations['uploadPrint']>(async (input) => ({
      operationId: input.operationId,
      machineId: input.machineId,
      kind: 'upload',
      status: 'accepted',
      evidence: { transferId: 'transfer-1' },
      observedAt: '2026-09-14T00:00:01Z',
    })),
    startPrint: vi.fn<MachineChannelHostOperations['startPrint']>(async (input) => ({
      operationId: input.operationId,
      machineId: input.machineId,
      kind: 'start',
      status: 'accepted',
      providerRunId: 'run-1',
      observedAt: '2026-09-14T00:00:01Z',
    })),
    requestPrint: vi.fn<MachineChannelHostOperations['requestPrint']>(async (input) => ({
      ...request,
      requestId: input.requestId,
      requestedBy: input.requestedBy,
    })),
    listPrintRequests: vi.fn<MachineChannelHostOperations['listPrintRequests']>(async () => [request]),
    async *watchPrintRequests() {
      yield request;
    },
    resolvePrintRequest: vi.fn<MachineChannelHostOperations['resolvePrintRequest']>(async (input) => ({
      ...request,
      state: input.decision === 'approve' ? 'started' : 'denied',
      resolvedBy: input.resolvedBy,
    })),
    withdrawPrintRequest: vi.fn<MachineChannelHostOperations['withdrawPrintRequest']>(async (input) => ({
      ...request,
      state: 'withdrawn',
      resolvedBy: input.resolvedBy,
    })),
    reconcileOperation: vi.fn<MachineChannelHostOperations['reconcileOperation']>(async (input) => ({
      operationId: input.operationId,
      machineId: input.machineId,
      kind: 'start',
      inputDigest: `sha256:${'7'.repeat(64)}` as MachinePreparedPrint['preparedDigest'],
      status: 'accepted',
      updatedAt: '2026-09-14T00:00:01Z',
    })),
    controlRun: vi.fn<MachineChannelHostOperations['controlRun']>(async (input) => ({
      operationId: input.operationId,
      machineId: input.machineId,
      kind: input.command,
      status: 'accepted',
      observedAt: '2026-09-14T00:00:02Z',
    })),
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
    workspaceId: 'workspace',
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
      await expect(
        fixture.client.preparePrint({ machineId: 'machine-1', artifact, configuration: {} }),
      ).resolves.toEqual(prepared);
      await expect(
        fixture.client.uploadPrint({
          machineId: 'machine-1',
          preparedId: prepared.preparedId,
          preparedDigest: prepared.preparedDigest,
          operationId: 'upload-1',
        }),
      ).resolves.toEqual({
        operationId: 'upload-1',
        machineId: 'machine-1',
        kind: 'upload',
        status: 'accepted',
        evidence: { transferId: 'transfer-1' },
        observedAt: '2026-09-14T00:00:01Z',
      });
      await expect(
        fixture.client.startPrint({
          machineId: 'machine-1',
          preparedId: prepared.preparedId,
          preparedDigest: prepared.preparedDigest,
          transferId: 'transfer-1',
          expectedSetupDigest: prepared.setupDigest,
          operationId: 'start-1',
        }),
      ).resolves.toMatchObject({ status: 'accepted', providerRunId: 'run-1' });
      const requester = { kind: 'user', id: 'user', label: 'Operator' } as const;
      await expect(
        fixture.client.requestPrint({
          requestId: 'request-2',
          machineId: 'machine-1',
          artifact,
          configuration: {},
          requestedBy: requester,
        }),
      ).resolves.toEqual({ ...request, requestId: 'request-2', requestedBy: requester });
      await expect(fixture.client.listPrintRequests({})).resolves.toEqual([request]);
      await expect(
        fixture.client.resolvePrintRequest({ requestId: 'request-1', decision: 'deny', resolvedBy: requester }),
      ).resolves.toEqual({ ...request, state: 'denied', resolvedBy: requester });
      await expect(
        fixture.client.withdrawPrintRequest({ requestId: 'request-1', resolvedBy: requester }),
      ).resolves.toEqual({ ...request, state: 'withdrawn', resolvedBy: requester });
      const watched = fixture.client.watchPrintRequests({ machineId: 'machine-1' });
      await expect(watched[Symbol.asyncIterator]().next()).resolves.toEqual({ done: false, value: request });
      await expect(
        fixture.client.controlRun({
          machineId: 'machine-1',
          operationId: 'pause-1',
          command: 'pause',
          expectedProviderRunId: 'run-1',
        }),
      ).resolves.toMatchObject({ status: 'accepted', kind: 'pause' });
      await expect(
        fixture.client.reconcileOperation({ machineId: 'machine-1', operationId: 'start-1' }),
      ).resolves.toMatchObject({ status: 'accepted', kind: 'start' });
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
    const fixture = open([{ route: 'machines', operation: 'machines.list' }], {}, { discover, captureStill });
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

  it('settles an awaiting operation when its trusted session is revoked', async () => {
    const pending = Promise.withResolvers<MachineDirectorySnapshot>();
    const read = vi.fn(async () => pending.promise);
    const fixture = open(undefined, { snapshot: read });
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
