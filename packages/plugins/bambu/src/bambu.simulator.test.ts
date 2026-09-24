import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MessageChannel } from 'node:worker_threads';

import { createHostAdmissionAuthority } from '@taucad/runtime/host';
import type { HostRouteGrant } from '@taucad/runtime/host';
import { createNodeMachineHost } from '@taucad/runtime/host/node';
import type { NodeMachineHost, NodeMachineRuntime } from '@taucad/runtime/host/node';
import { connectMachineChannel } from '@taucad/runtime/machine';
import type { MachineArtifactReference, MachineCandidate, MachineClient } from '@taucad/runtime/machine';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createBambuSimulator, defineBambuSimulatorMachine } from '#bambu.simulator.js';
import type { BambuSimulator } from '#bambu.simulator.js';

const { signal } = new AbortController();
// oxlint-disable-next-line typescript-eslint/consistent-type-assertions -- closed static fixture supplies opaque runtime identities.
const artifact = {
  revision: {
    authorityId: 'authority',
    workspaceId: 'workspace',
    revisionId: 'r1',
    treeDigest: `sha256:${'1'.repeat(64)}`,
  },
  path: 'fixture.gcode.3mf',
  digest: `sha256:${'2'.repeat(64)}`,
  length: 4,
  mediaType: 'application/vnd.bambulab.gcode-3mf',
  contract: { id: 'manufacturing.toolpath.bambu-gcode-3mf', version: 1 },
  selectedMember: 'Metadata/plate_1.gcode',
} as MachineArtifactReference;
const configuration = {
  amsMapping: [0],
  bedLeveling: true,
  expectedBedType: 'textured-pei',
  expectedFilamentDiameter: {
    value: 1.75,
    unit: 'mm',
    kind: 'http://qudt.org/vocab/quantitykind/Diameter',
    space: 'linear',
  },
  expectedMaterials: [{ slot: 0, materialId: 'pla' }],
  expectedModel: 'X1C',
  expectedNozzleDiameter: {
    value: 0.4,
    unit: 'mm',
    kind: 'http://qudt.org/vocab/quantitykind/Diameter',
    space: 'linear',
  },
  flowCalibration: true,
  timelapse: false,
} as const;
const operationInput = {
  operationId: 'prepared-1',
  expectedMachineId: 'simulated-x1c',
  artifact,
  configuration,
  signal,
} as const;
const agent = { kind: 'agent', id: 'agent-1', label: 'Tau agent' } as const;
const operator = { kind: 'user', id: 'operator', label: 'Operator' } as const;
const grants: readonly HostRouteGrant[] = (
  [
    'discover',
    'beginBinding',
    'list',
    'get',
    'requestPrint',
    'listPrintRequests',
    'watchPrintRequests',
    'resolvePrintRequest',
    'withdrawPrintRequest',
    'controlRun',
    'reconcileOperation',
  ] as const
).map((operation) => ({ route: 'machines', operation: `machines.${operation}` }));

const temporaryDirectories: string[] = [];
const hosts: NodeMachineHost[] = [];
const closers: Array<() => void> = [];

afterEach(async () => {
  for (const close of closers.splice(0)) {
    close();
  }
  await Promise.allSettled(hosts.splice(0).map(async (host) => host.close()));
  await Promise.all(temporaryDirectories.splice(0).map(async (path) => rm(path, { recursive: true, force: true })));
});

/** Bind one simulator through the real Node host and hand back its admitted client. */
const bindSimulator = async (simulator: BambuSimulator): Promise<MachineClient> => {
  const authorityRoot = await mkdtemp(join(tmpdir(), 'tau-bambu-simulator-host-'));
  temporaryDirectories.push(authorityRoot);
  const clock = { now: () => new Date().toISOString() };
  const runtime: NodeMachineRuntime = {
    discovery: {
      clock,
      async *listenDatagrams() {
        yield* [];
      },
    },
    connection: () => ({
      clock,
      log: async () => undefined,
      connectStream: async () => {
        throw new Error('The simulator never opens sockets.');
      },
      async *readArtifact() {
        yield* [];
      },
      resolveSecret: async () => 'unused',
    }),
  };
  const admission = createHostAdmissionAuthority({ hostId: 'host' });
  const host = await createNodeMachineHost({
    authorityRoot,
    hostId: 'host',
    authorityId: 'authority',
    generation: 'generation-1',
    admission,
    providers: [defineBambuSimulatorMachine({ simulator })()],
    runtime,
    onError: vi.fn(),
  });
  hosts.push(host);
  const session = admission.issueTrustedSession({
    actor: { kind: 'user', id: 'operator' },
    authorityId: 'authority',
    workspaceId: 'workspace',
    grants,
  });
  const ports = new MessageChannel();
  const server = host.serve({ port: ports.port1, session, workspaceId: 'workspace' });
  const client = connectMachineChannel(ports.port2);
  closers.push(() => {
    client.close();
    server.dispose();
  });
  await client.ready;
  let candidate: MachineCandidate | undefined;
  for await (const event of client.discover({ providerId: 'bambu-simulator', configuration: { logicalId: 'sim' } })) {
    if (event.type !== 'lost') {
      candidate = event.candidate;
    }
  }
  if (!candidate) {
    throw new Error('expected one simulated candidate');
  }
  const ceremony = await client.beginBinding({ candidate, name: 'simulated-x1c' });
  if (ceremony.status !== 'operator-action-required') {
    throw new Error('expected a binding ceremony');
  }
  await expect(
    host.completeBinding({ ceremonyId: ceremony.ceremonyId, secretRef: 'simulator', serviceTrust: {} }),
  ).resolves.toEqual({ status: 'bound', machineId: 'simulated-x1c' });
  await vi.waitFor(async () => {
    await expect(client.get({ machineId: 'simulated-x1c' })).resolves.toMatchObject({
      freshness: 'current',
      snapshot: { connection: 'connected', readiness: 'idle' },
    });
  });
  return client;
};

describe('Bambu simulator fault matrix', () => {
  it.each([
    ['certificate-changed', 'BAMBU_CERTIFICATE_CHANGED'],
    ['wrong-credential', 'BAMBU_AUTHENTICATION'],
    ['protected-mode', 'BAMBU_PROTECTED_MODE'],
    ['timeout', 'BAMBU_TIMEOUT'],
  ] as const)('should refuse the %s handshake', async (fault, code) => {
    const simulator = createBambuSimulator({ faults: [fault] });
    await expect(simulator.session.getDescriptor({ signal })).rejects.toThrow(code);
  });

  it('should prepare without writing anything to the device', async () => {
    const simulator = createBambuSimulator();
    await expect(simulator.session.preparePrint(operationInput)).resolves.toMatchObject({
      status: 'ready',
      remoteName: 'tau-prepared-1.gcode.3mf',
      digest: artifact.digest,
      length: artifact.length,
    });
    expect(simulator.writes()).toEqual([]);
    expect(simulator.uploadedNames()).toEqual([]);
  });

  it.each([
    ['storage-full', 'STORAGE_FULL'],
    ['partial-transfer', 'TRANSFER_PARTIAL'],
  ] as const)('should fail closed on %s without retaining an uploaded name', async (fault, code) => {
    const simulator = createBambuSimulator({ faults: [fault] });
    const prepared = await simulator.session.preparePrint(operationInput);
    if (prepared.status !== 'ready') {
      throw new Error('expected simulator preparation');
    }
    const receipt = await simulator.session.uploadPrint({
      ...operationInput,
      operationId: 'upload-1',
      remoteName: prepared.remoteName,
      providerData: prepared.providerData,
    });
    expect(receipt).toMatchObject({ status: 'rejected', code });
    expect(simulator.uploadedNames()).toEqual([]);
    expect(simulator.writes()).toEqual([]);
  });

  it('should refuse a start whose transfer never happened', async () => {
    const simulator = createBambuSimulator();
    await expect(
      simulator.session.submit({
        ...operationInput,
        operationId: 'start-1',
        remoteName: 'tau-prepared-1.gcode.3mf',
        transferId: 'tau-prepared-1.gcode.3mf',
        providerData: { memberMd5: '00000000000000000000000000000000' },
      }),
    ).resolves.toMatchObject({ status: 'rejected', code: 'PREPARATION_MISSING' });
    expect(simulator.writes()).toEqual([]);
  });

  it('should never replay a physical write on reconnect or a lost reply', async () => {
    const simulator = createBambuSimulator({
      faults: ['reply-lost-after-accept'],
    });
    const prepared = await simulator.session.preparePrint(operationInput);
    if (prepared.status !== 'ready') {
      throw new Error('expected simulator preparation');
    }
    const transfer = await simulator.session.uploadPrint({
      ...operationInput,
      operationId: 'upload-1',
      remoteName: prepared.remoteName,
      providerData: prepared.providerData,
    });
    if (transfer.status !== 'transferred') {
      throw new Error('expected simulator transfer');
    }
    const receipt = await simulator.session.submit({
      ...operationInput,
      operationId: 'operation-1',
      remoteName: prepared.remoteName,
      transferId: transfer.transferId,
      providerData: prepared.providerData,
    });
    expect(receipt).toMatchObject({ status: 'unknown' });
    expect(simulator.writes()).toEqual(['upload:tau-prepared-1.gcode.3mf', 'start:operation-1']);
    expect(simulator.uploadedNames()).toEqual(['tau-prepared-1.gcode.3mf']);
    const writes = simulator.writes();
    simulator.reconnect();
    expect(simulator.writes()).toEqual(writes);
    await expect(
      simulator.session.reconcile({ operationId: 'operation-1', command: 'project_file', signal }),
    ).resolves.toMatchObject({ status: 'accepted' });
  });

  it('should isolate camera failure from machine state', async () => {
    const simulator = createBambuSimulator({ faults: ['camera-unavailable'] });
    const before = await simulator.session.getSnapshot({ signal });
    const capability = simulator.session.stillCapture;
    if (capability.type !== 'supported') {
      throw new Error('expected simulator camera');
    }
    await expect(capability.capture({ signal })).rejects.toThrow('BAMBU_CAMERA_UNAVAILABLE');
    expect(await simulator.session.getSnapshot({ signal })).toEqual(before);
  });
});

describe.runIf(process.platform === 'darwin' || process.platform === 'linux')(
  'Simulated X1C through the Node host',
  () => {
    it('runs request, approval, upload, start, observed printing and urgent stop with the exact write sequence', async () => {
      const simulator = createBambuSimulator();
      const client = await bindSimulator(simulator);

      const request = await client.requestPrint({
        requestId: 'request-1',
        machineId: 'simulated-x1c',
        artifact,
        configuration,
        requestedBy: agent,
      });
      expect(request).toMatchObject({
        state: 'awaiting-approval',
        requestedBy: agent,
        summary: { fileName: 'fixture.gcode.3mf' },
        prepared: { machineId: 'simulated-x1c', physicalMachineId: 'simulated-x1c' },
      });
      const remoteName = request.prepared?.remoteName;
      expect(remoteName).toBe(`tau-${request.prepared?.preparedId ?? ''}.gcode.3mf`);
      expect(simulator.writes()).toEqual([]);
      expect(simulator.uploadedNames()).toEqual([]);

      const resolved = await client.resolvePrintRequest({
        requestId: 'request-1',
        decision: 'approve',
        resolvedBy: operator,
        uploadOperationId: 'upload-1',
        startOperationId: 'start-1',
      });
      expect(resolved).toMatchObject({
        state: 'started',
        resolvedBy: operator,
        uploadOperationId: 'upload-1',
        startOperationId: 'start-1',
        transferId: remoteName,
        receipt: { kind: 'start', status: 'accepted', providerRunId: 'start-1' },
      });
      expect(simulator.writes()).toEqual([`upload:${remoteName ?? ''}`, 'start:start-1']);
      expect(simulator.uploadedNames()).toEqual([remoteName]);

      await vi.waitFor(async () => {
        await expect(client.get({ machineId: 'simulated-x1c' })).resolves.toMatchObject({
          snapshot: { readiness: 'busy', activeRunId: 'start-1', run: { state: 'printing', progress: 42 } },
        });
      });
      await expect(
        client.controlRun({
          machineId: 'simulated-x1c',
          operationId: 'stop-1',
          command: 'urgent-stop',
          expectedProviderRunId: 'start-1',
        }),
      ).resolves.toMatchObject({ kind: 'urgent-stop', status: 'accepted' });
      expect(simulator.writes()).toEqual([`upload:${remoteName ?? ''}`, 'start:start-1', 'urgent-stop:stop-1']);
      await vi.waitFor(async () => {
        await expect(client.get({ machineId: 'simulated-x1c' })).resolves.toMatchObject({
          snapshot: { readiness: 'idle', run: { state: 'idle' } },
        });
      });
      await expect(client.listPrintRequests({ machineId: 'simulated-x1c' })).resolves.toMatchObject([
        { requestId: 'request-1', state: 'started' },
      ]);
      await expect(
        client.resolvePrintRequest({ requestId: 'request-1', decision: 'approve', resolvedBy: operator }),
      ).rejects.toThrow('MACHINE_PRINT_REQUEST_NOT_AWAITING');
      expect(simulator.writes()).toHaveLength(3);
    });

    it('sends nothing to the device before approval (approval-required-not-honored guard)', async () => {
      const simulator = createBambuSimulator({ faults: ['approval-required-not-honored'] });
      const client = await bindSimulator(simulator);

      const request = await client.requestPrint({
        requestId: 'request-guard',
        machineId: 'simulated-x1c',
        artifact,
        configuration,
        requestedBy: agent,
      });
      expect(request.state).toBe('awaiting-approval');
      expect(simulator.writes()).toEqual([]);
      await expect(
        client.resolvePrintRequest({ requestId: 'request-guard', decision: 'deny', resolvedBy: operator }),
      ).resolves.toMatchObject({ state: 'denied', resolvedBy: operator });
      const withdrawn = await client.requestPrint({
        requestId: 'request-withdrawn',
        machineId: 'simulated-x1c',
        artifact,
        configuration,
        requestedBy: agent,
      });
      expect(withdrawn.state).toBe('awaiting-approval');
      await expect(
        client.withdrawPrintRequest({ requestId: 'request-withdrawn', resolvedBy: agent }),
      ).resolves.toMatchObject({ state: 'withdrawn' });
      expect(simulator.writes()).toEqual([]);
      expect(simulator.uploadedNames()).toEqual([]);
      await expect(client.get({ machineId: 'simulated-x1c' })).resolves.toMatchObject({
        snapshot: { readiness: 'idle' },
      });
    });
  },
);
