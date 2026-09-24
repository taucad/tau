import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MessageChannel } from 'node:worker_threads';

import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import type { ContentDigest } from '@taucad/cache-core';

import { defineConfiguration } from '#configuration/index.js';
import { createHostAdmissionAuthority } from '#host/host-admission.js';
import type { HostRouteGrant } from '#host/host-admission.js';
import { createNodeMachineHost } from '#host/node.js';
import type { NodeMachineHost, NodeMachineRuntime } from '#host/node.js';
import { connectMachineChannel } from '#machines/machine-channel.js';
import type { MachineChannelClient, MachineChannelHostOperations } from '#machines/machine-channel.js';
import { defineMachine } from '#machines/machine.js';
import { machineManifestFixture } from '#machines/machine-manifest.fixture.js';
import type {
  MachineArtifactReference,
  MachineCandidate,
  MachineConnectionRuntime,
  MachineCommandReceipt,
  MachineSession,
  MachineSnapshot,
  MachineStill,
  MachineSubmissionReceipt,
  MachineTransferReceipt,
} from '#machines/machine.js';
import type { PrintRequest } from '#machines/print-request.js';

const temporaryDirectories: string[] = [];
const hosts: NodeMachineHost[] = [];

afterEach(async () => {
  await Promise.allSettled(hosts.splice(0).map(async (host) => host.close()));
  await Promise.all(temporaryDirectories.splice(0).map(async (path) => rm(path, { recursive: true, force: true })));
});

const authorityRoot = async (): Promise<string> => {
  const path = await mkdtemp(join(tmpdir(), 'tau-node-machine-host-'));
  temporaryDirectories.push(path);
  return path;
};

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
  async connect(): Promise<MachineSession> {
    throw new Error('Node host must not autoconnect');
  },
})();
const unavailable = async (): Promise<never> => {
  throw new Error('MACHINE_OPERATION_UNAVAILABLE');
};
const operations: MachineChannelHostOperations = {
  async *discover() {
    yield* [];
  },
  async beginBinding() {
    return { status: 'operator-action-required', ceremonyId: 'fixture' };
  },
  preparePrint: unavailable,
  uploadPrint: unavailable,
  startPrint: unavailable,
  reconcileOperation: unavailable,
  controlRun: unavailable,
  captureStill: unavailable,
  requestPrint: unavailable,
  listPrintRequests: unavailable,
  async *watchPrintRequests() {
    yield await unavailable();
  },
  resolvePrintRequest: unavailable,
  withdrawPrintRequest: unavailable,
};
const observedAt = '2026-09-14T00:00:00.000Z';
const expiresAt = '2026-09-14T00:01:00.000Z';
const bindingCandidates: readonly MachineCandidate[] = [
  {
    id: 'candidate-a',
    name: 'Printer A',
    endpoint: { address: 'printer-a.local', interface: 'manual' },
    claimedIdentity: { serial: 'physical-1', model: 'X1C' },
    observedAt,
    expiresAt,
  },
  {
    id: 'candidate-b',
    name: 'Printer B',
    endpoint: { address: 'printer-b.local', interface: 'manual' },
    claimedIdentity: { serial: 'physical-1', model: 'X1C' },
    observedAt,
    expiresAt,
  },
];
type SessionBehavior = Partial<
  Pick<MachineSession, 'getSnapshot' | 'observe' | 'uploadPrint' | 'submit' | 'control' | 'reconcile' | 'stillCapture'>
>;

const session = (closed: () => Promise<void>, behavior: SessionBehavior = {}): MachineSession => ({
  stillCapture: behavior.stillCapture ?? { type: 'unsupported' },
  async getDescriptor() {
    return {
      id: 'physical-1',
      name: 'Fixture X1C',
      vendor: 'fixture',
      model: 'X1C',
      technology: 'additive.fff',
      firmware: '01.08.02.00',
      accepts: [
        {
          contract: {
            id: 'manufacturing.toolpath.bambu-gcode-3mf',
            version: 1,
          },
          mediaType: 'application/vnd.bambulab.gcode-3mf',
          requiredMembers: ['Metadata/plate_1.gcode'],
          payloadSelection: 'plate',
          technology: 'additive.fff',
        },
      ],
      operations: ['observe', ...(behavior.stillCapture?.type === 'supported' ? ['still'] : [])],
      ratedEnvelope: { width: 0.256, depth: 0.256, height: 0.256, unit: 'm' },
      printableEnvelope: {
        width: 0.256,
        depth: 0.256,
        height: 0.256,
        unit: 'm',
      },
      tools: [],
      materialSystem: { kind: 'ams', slotCount: 16 },
      bedTypes: ['textured-plate'],
    };
  },
  async getSnapshot(input) {
    if (behavior.getSnapshot) {
      return behavior.getSnapshot(input);
    }
    return {
      connection: 'connected',
      readiness: 'idle',
      observedAt,
      setup: { materials: [{ slot: 0, state: 'loaded', materialId: 'PLA' }] },
      run: { state: 'idle' },
    };
  },
  async *observe(input) {
    if (behavior.observe) {
      yield* behavior.observe(input);
      return;
    }
    await new Promise<void>((resolve) => {
      if (input.signal.aborted) {
        resolve();
      } else {
        input.signal.addEventListener(
          'abort',
          () => {
            resolve();
          },
          { once: true },
        );
      }
    });
    yield* [];
  },
  async preparePrint(input) {
    return {
      status: 'ready',
      remoteName: `tau-${input.operationId}.gcode.3mf`,
      digest: input.artifact.digest,
      length: input.artifact.length,
      parser: { id: 'fixture-parser', version: '1' },
      providerData: { memberMd5: 'fixture' },
      observedAt,
    };
  },
  async uploadPrint(input) {
    if (behavior.uploadPrint) {
      return behavior.uploadPrint(input);
    }
    return {
      status: 'transferred',
      transferId: `transfer-${input.operationId}`,
      digest: input.artifact.digest,
      length: input.artifact.length,
      observedAt,
    };
  },
  async submit(input) {
    if (behavior.submit) {
      return behavior.submit(input);
    }
    throw new Error('fixture is read-only');
  },
  async control(input) {
    if (behavior.control) {
      return behavior.control(input);
    }
    throw new Error('fixture is read-only');
  },
  async reconcile(input) {
    if (behavior.reconcile) {
      return behavior.reconcile(input);
    }
    return { status: 'unknown', reason: 'fixture-has-no-ledger', observedAt };
  },
  close: closed,
  dispose: closed,
});
const bindingProvider = (connections: (runtime: MachineConnectionRuntime) => void, behavior: SessionBehavior = {}) =>
  defineMachine({
    id: 'binding-provider',
    name: 'Binding provider',
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
      for (const candidate of bindingCandidates) {
        yield { type: 'found', candidate };
      }
    },
    async connect(_input, runtime) {
      connections(runtime);
      return session(
        vi.fn(async () => undefined),
        behavior,
      );
    },
  })();

const openHost = async (root: string, generation = 'generation-1') => {
  const admission = createHostAdmissionAuthority({ hostId: 'host-1' });
  const host = await createNodeMachineHost({
    authorityRoot: root,
    hostId: 'host-1',
    authorityId: 'authority-1',
    generation,
    admission,
    providers: [provider],
    operations,
    onError: vi.fn(),
  });
  hosts.push(host);
  return { admission, host };
};

describe.runIf(process.platform === 'darwin' || process.platform === 'linux')('createNodeMachineHost', () => {
  it('serves an admitted channel, closes it on revocation, and retains authority identity across restart', async () => {
    const root = await authorityRoot();
    const first = await openHost(root);
    const session = first.admission.issueTrustedSession({
      actor: { kind: 'user', id: 'user-1' },
      authorityId: 'authority-1',
      workspaceId: 'workspace-1',
      grants: [{ route: 'machines', operation: 'machines.listProviders' }],
    });
    const ports = new MessageChannel();
    const server = first.host.serve({
      port: ports.port1,
      session,
      workspaceId: 'workspace-1',
    });
    const client = connectMachineChannel(ports.port2);
    await expect(client.listProviders({})).resolves.toMatchObject([{ id: 'fixture-provider' }]);
    first.admission.revoke(session);
    await server.closed;
    client.close();
    await first.host.close();
    hosts.splice(hosts.indexOf(first.host), 1);

    const second = await openHost(root);
    await second.host.close();
    hosts.splice(hosts.indexOf(second.host), 1);
    await expect(openHost(root, 'other-generation')).rejects.toThrow('NODE_MACHINE_HOST_IDENTITY_MISMATCH');
  });

  it('persists an opaque binding, reconnects it once, and refuses a second controller for one printer', async () => {
    const root = await authorityRoot();
    let currentTime = Date.parse(observedAt);
    const currentTimestamp = (): string => new Date(currentTime).toISOString();
    const connections = vi.fn((_runtime: MachineConnectionRuntime): void => undefined);
    const captureStill = vi.fn(
      async (): Promise<MachineStill> => ({
        bytes: Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]),
        mediaType: 'image/jpeg',
        capturedAt: currentTimestamp(),
        expiresAt: new Date(currentTime + 15_000).toISOString(),
      }),
    );
    const submit = vi.fn(
      async (input: Parameters<MachineSession['submit']>[0]): Promise<MachineSubmissionReceipt> =>
        input.operationId === 'start-accepted'
          ? {
              status: 'accepted',
              providerRunId: 'run-1',
              observedAt,
            }
          : {
              status: 'unknown',
              reason: 'reply-lost-after-possible-acceptance',
              observedAt,
            },
    );
    const reconcile = vi.fn(
      async (): Promise<MachineSubmissionReceipt> => ({
        status: 'accepted',
        providerRunId: 'run-late',
        observedAt,
      }),
    );
    const control = vi.fn(
      async (): Promise<MachineCommandReceipt> => ({
        status: 'accepted',
        observedAt,
      }),
    );
    const manualRun = Promise.withResolvers<void>();
    const provider_ = bindingProvider(connections, {
      submit,
      reconcile,
      control,
      stillCapture: { type: 'supported', capture: captureStill },
      async *observe(input) {
        await Promise.race([
          manualRun.promise,
          new Promise<void>((resolve) => {
            input.signal.addEventListener(
              'abort',
              () => {
                resolve();
              },
              { once: true },
            );
          }),
        ]);
        if (input.signal.aborted) {
          return;
        }
        yield {
          type: 'snapshot',
          snapshot: {
            connection: 'connected',
            readiness: 'busy',
            activeRunId: 'manual-run',
            observedAt,
            setup: {
              materials: [{ slot: 0, state: 'loaded', materialId: 'PLA' }],
            },
            run: { state: 'printing' },
          } satisfies MachineSnapshot,
        };
        await new Promise<void>((resolve) => {
          input.signal.addEventListener(
            'abort',
            () => {
              resolve();
            },
            { once: true },
          );
        });
      },
    });
    const connection: MachineConnectionRuntime = {
      clock: { now: currentTimestamp },
      log: vi.fn(async () => undefined),
      connectStream: vi.fn(async () => {
        throw new Error('fixture does not open sockets');
      }),
      async *readArtifact() {
        yield* [];
      },
      resolveSecret: vi.fn(async () => 'credential-must-not-be-serialized'),
    };
    const runtime: NodeMachineRuntime = {
      discovery: {
        clock: { now: currentTimestamp },
        async *listenDatagrams() {
          yield* [];
        },
      },
      connection: () => connection,
    };
    const openBoundHost = async () => {
      const admission = createHostAdmissionAuthority({ hostId: 'host-1' });
      const host = await createNodeMachineHost({
        authorityRoot: root,
        hostId: 'host-1',
        authorityId: 'authority-1',
        generation: 'generation-1',
        admission,
        providers: [provider_],
        runtime,
        onError: vi.fn(),
      });
      hosts.push(host);
      return { admission, host };
    };
    const first = await openBoundHost();
    const admitted = first.admission.issueTrustedSession({
      actor: { kind: 'user', id: 'operator' },
      authorityId: 'authority-1',
      workspaceId: 'workspace-1',
      grants: [
        { route: 'machines', operation: 'machines.discover' },
        { route: 'machines', operation: 'machines.beginBinding' },
        { route: 'machines', operation: 'machines.list' },
        { route: 'machines', operation: 'machines.preparePrint' },
        { route: 'machines', operation: 'machines.uploadPrint' },
        { route: 'machines', operation: 'machines.startPrint' },
        { route: 'machines', operation: 'machines.reconcileOperation' },
        { route: 'machines', operation: 'machines.controlRun' },
        { route: 'machines', operation: 'machines.captureStill' },
      ],
    });
    const ports = new MessageChannel();
    const server = first.host.serve({
      port: ports.port1,
      session: admitted,
      workspaceId: 'workspace-1',
    });
    const client = connectMachineChannel(ports.port2);
    await client.ready;
    const discovered: MachineCandidate[] = [];
    for await (const event of client.discover({
      providerId: 'binding-provider',
      configuration: {},
    })) {
      if (event.type !== 'lost') {
        discovered.push(event.candidate);
      }
    }
    const firstCeremony = await client.beginBinding({
      candidate: discovered[0]!,
      name: 'workshop-x1c',
    });
    expect(firstCeremony.status).toBe('operator-action-required');
    if (firstCeremony.status !== 'operator-action-required') {
      throw new Error('expected binding ceremony');
    }
    const pinned = `sha256:${'1'.repeat(64)}` as ContentDigest;
    await expect(
      first.host.completeBinding({
        ceremonyId: firstCeremony.ceremonyId,
        secretRef: 'vault:bambu-x1c',
        serviceTrust: {
          mqtt: { type: 'pinned', digest: pinned },
          camera: { type: 'pinned', digest: pinned },
        },
      }),
    ).resolves.toEqual({ status: 'bound', machineId: 'workshop-x1c' });
    await expect(client.list({})).resolves.toMatchObject({
      entries: [
        {
          machineId: 'workshop-x1c',
          descriptor: { id: 'physical-1', firmware: '01.08.02.00' },
        },
      ],
    });
    const beforeStill = await client.list({});
    await expect(client.captureStill({ machineId: 'workshop-x1c' })).resolves.toMatchObject({
      mediaType: 'image/jpeg',
      capturedAt: observedAt,
    });
    await expect(client.captureStill({ machineId: 'workshop-x1c' })).rejects.toThrow('MACHINE_STILL_RATE_LIMITED');
    expect(captureStill).toHaveBeenCalledOnce();
    currentTime += 5000;
    captureStill.mockRejectedValueOnce(new Error('BAMBU_CAMERA_UNAVAILABLE'));
    await expect(client.captureStill({ machineId: 'workshop-x1c' })).rejects.toThrow('BAMBU_CAMERA_UNAVAILABLE');
    currentTime += 5000;
    captureStill.mockResolvedValueOnce({
      bytes: Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]),
      mediaType: 'image/jpeg',
      capturedAt: currentTimestamp(),
      expiresAt: currentTimestamp(),
    });
    await expect(client.captureStill({ machineId: 'workshop-x1c' })).rejects.toThrow('MACHINE_STILL_INVALID');
    expect(await client.list({})).toEqual(beforeStill);
    const artifact: MachineArtifactReference = {
      revision: {
        authorityId: 'authority-1',
        workspaceId: 'workspace-1',
        revisionId: 'revision-1' as MachineArtifactReference['revision']['revisionId'],
        treeDigest: `sha256:${'2'.repeat(64)}` as ContentDigest,
      },
      path: 'part.gcode.3mf',
      digest: `sha256:${'3'.repeat(64)}` as ContentDigest,
      length: 128,
      mediaType: 'application/vnd.bambulab.gcode-3mf',
      contract: { id: 'manufacturing.toolpath.bambu-gcode-3mf', version: 1 },
      selectedMember: 'Metadata/plate_1.gcode',
    };
    const prepared = await client.preparePrint({
      machineId: 'workshop-x1c',
      artifact,
      configuration: {},
    });
    expect(prepared).toMatchObject({
      machineId: 'workshop-x1c',
      physicalMachineId: 'physical-1',
      artifact,
    });
    await expect(
      client.startPrint({
        machineId: 'workshop-x1c',
        preparedId: prepared.preparedId,
        preparedDigest: prepared.preparedDigest,
        transferId: 'never-transferred',
        expectedSetupDigest: prepared.setupDigest,
        operationId: 'start-without-upload',
      }),
    ).rejects.toThrow('MACHINE_TRANSFER_MISMATCH');
    expect(submit).not.toHaveBeenCalled();
    const uploadInput = {
      machineId: 'workshop-x1c',
      preparedId: prepared.preparedId,
      preparedDigest: prepared.preparedDigest,
      operationId: 'upload-1',
    } as const;
    const uploaded = await client.uploadPrint(uploadInput);
    expect(uploaded).toEqual({
      operationId: 'upload-1',
      machineId: 'workshop-x1c',
      kind: 'upload',
      status: 'accepted',
      evidence: { transferId: 'transfer-upload-1' },
      observedAt,
    });
    await expect(client.uploadPrint(uploadInput)).resolves.toEqual(uploaded);
    const acceptedInput = {
      machineId: 'workshop-x1c',
      preparedId: prepared.preparedId,
      preparedDigest: prepared.preparedDigest,
      transferId: 'transfer-upload-1',
      expectedSetupDigest: prepared.setupDigest,
      operationId: 'start-accepted',
    } as const;
    const accepted = await client.startPrint(acceptedInput);
    expect(accepted).toMatchObject({
      status: 'accepted',
      providerRunId: 'run-1',
    });
    await expect(client.startPrint(acceptedInput)).resolves.toEqual(accepted);
    expect(submit).toHaveBeenCalledOnce();

    const secondPrepared = await client.preparePrint({
      machineId: 'workshop-x1c',
      artifact,
      configuration: {},
    });
    await client.uploadPrint({
      machineId: 'workshop-x1c',
      preparedId: secondPrepared.preparedId,
      preparedDigest: secondPrepared.preparedDigest,
      operationId: 'upload-2',
    });
    await expect(
      client.startPrint({
        ...acceptedInput,
        preparedId: secondPrepared.preparedId,
        preparedDigest: secondPrepared.preparedDigest,
        transferId: 'transfer-upload-2',
      }),
    ).rejects.toThrow('MACHINE_OPERATION_ID_CONFLICT');
    const lateInput = {
      ...acceptedInput,
      preparedId: secondPrepared.preparedId,
      preparedDigest: secondPrepared.preparedDigest,
      transferId: 'transfer-upload-2',
      operationId: 'start-late',
    };
    await expect(client.startPrint(lateInput)).resolves.toMatchObject({
      status: 'unknown',
    });
    await expect(
      client.reconcileOperation({
        machineId: 'workshop-x1c',
        operationId: 'start-late',
      }),
    ).resolves.toMatchObject({
      status: 'accepted',
      receipt: { providerRunId: 'run-late' },
    });
    const restartInput = { ...lateInput, operationId: 'start-restart' };
    await expect(client.startPrint(restartInput)).resolves.toMatchObject({
      status: 'unknown',
    });
    expect(submit).toHaveBeenCalledTimes(3);
    manualRun.resolve();
    await vi.waitFor(async () => {
      await expect(client.list({})).resolves.toMatchObject({
        entries: [{ snapshot: { activeRunId: 'manual-run', readiness: 'busy' } }],
      });
    });
    await expect(
      client.startPrint({
        ...lateInput,
        operationId: 'start-during-manual-run',
      }),
    ).rejects.toThrow('MACHINE_START_STALE_OR_BUSY');
    await expect(
      client.controlRun({
        machineId: 'workshop-x1c',
        operationId: 'pause-stale',
        command: 'pause',
        expectedProviderRunId: 'run-1',
      }),
    ).rejects.toThrow('MACHINE_CONTROL_STALE_RUN');
    expect(control).not.toHaveBeenCalled();
    const paused = await client.controlRun({
      machineId: 'workshop-x1c',
      operationId: 'pause-manual',
      command: 'pause',
      expectedProviderRunId: 'manual-run',
    });
    // The provider's reply names no run; the receipt names the one the preflight matched.
    expect(paused).toMatchObject({ status: 'accepted', kind: 'pause', providerRunId: 'manual-run' });
    await expect(
      client.controlRun({
        machineId: 'workshop-x1c',
        operationId: 'pause-manual',
        command: 'pause',
        expectedProviderRunId: 'manual-run',
      }),
    ).resolves.toEqual(paused);
    expect(control).toHaveBeenCalledOnce();

    const secondCeremony = await client.beginBinding({
      candidate: discovered[1]!,
      name: 'duplicate-x1c',
    });
    if (secondCeremony.status !== 'operator-action-required') {
      throw new Error('expected second binding ceremony');
    }
    await expect(
      first.host.completeBinding({
        ceremonyId: secondCeremony.ceremonyId,
        secretRef: 'vault:bambu-x1c',
        serviceTrust: { mqtt: { type: 'pinned', digest: pinned } },
      }),
    ).rejects.toThrow('NODE_MACHINE_HOST_PHYSICAL_IDENTITY_CONFLICT');
    client.close();
    server.dispose();
    await first.host.close();
    hosts.splice(hosts.indexOf(first.host), 1);

    const journalPath = join(root, 'machine-events.jsonl');
    const journal = await readFile(journalPath, 'utf8');
    const journalStats = await stat(journalPath);
    // oxlint-disable-next-line eslint/no-bitwise -- POSIX permission bits are a bit mask.
    expect(journalStats.mode & 0o777).toBe(0o600);
    expect(journal).toContain('vault:bambu-x1c');
    expect(journal).toContain('machine-print-prepared');
    expect(journal.indexOf('machine-effect-intent')).toBeLessThan(journal.indexOf('machine-effect-sending'));
    expect(journal.indexOf('machine-effect-sending')).toBeLessThan(journal.indexOf('machine-effect-result'));
    expect(journal).not.toContain('credential-must-not-be-serialized');

    const second = await openBoundHost();
    expect(connections).toHaveBeenCalledTimes(3);
    const restartSession = second.admission.issueTrustedSession({
      actor: { kind: 'user', id: 'operator' },
      authorityId: 'authority-1',
      workspaceId: 'workspace-1',
      grants: [
        { route: 'machines', operation: 'machines.list' },
        { route: 'machines', operation: 'machines.startPrint' },
        { route: 'machines', operation: 'machines.uploadPrint' },
      ],
    });
    const restartPorts = new MessageChannel();
    const restartServer = second.host.serve({
      port: restartPorts.port1,
      session: restartSession,
      workspaceId: 'workspace-1',
    });
    const restartClient = connectMachineChannel(restartPorts.port2);
    await expect(restartClient.list({})).resolves.toMatchObject({
      entries: [{ machineId: 'workshop-x1c', freshness: 'current' }],
    });
    await expect(restartClient.startPrint(restartInput)).resolves.toMatchObject({ status: 'unknown' });
    expect(submit).toHaveBeenCalledTimes(3);
    await expect(
      restartClient.uploadPrint({
        machineId: 'workshop-x1c',
        preparedId: secondPrepared.preparedId,
        preparedDigest: secondPrepared.preparedDigest,
        operationId: 'upload-2',
      }),
    ).resolves.toMatchObject({ status: 'accepted', evidence: { transferId: 'transfer-upload-2' } });
    restartClient.close();
    restartServer.dispose();
  });
});

const printRequestGrants: readonly HostRouteGrant[] = (
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
    'reconcileOperation',
  ] as const
).map((operation) => ({ route: 'machines', operation: `machines.${operation}` }));
const agent = { kind: 'agent', id: 'agent-1', label: 'Tau agent' } as const;
const operator = { kind: 'user', id: 'operator', label: 'Operator' } as const;
const printArtifact: MachineArtifactReference = {
  revision: {
    authorityId: 'authority-1',
    workspaceId: 'workspace-1',
    revisionId: 'revision-1' as MachineArtifactReference['revision']['revisionId'],
    treeDigest: `sha256:${'2'.repeat(64)}` as ContentDigest,
  },
  path: 'parts/pyramid.gcode.3mf',
  digest: `sha256:${'3'.repeat(64)}` as ContentDigest,
  length: 128,
  mediaType: 'application/vnd.bambulab.gcode-3mf',
  contract: { id: 'manufacturing.toolpath.bambu-gcode-3mf', version: 1 },
  selectedMember: 'Metadata/plate_1.gcode',
};
type JournalLine = Readonly<{ text: string; event: Readonly<Record<string, unknown>> }>;
const readJournal = async (root: string): Promise<JournalLine[]> => {
  const journal = await readFile(join(root, 'machine-events.jsonl'), 'utf8');
  return journal
    .split('\n')
    .filter((line) => line.length > 0)
    .map((text) => ({ text, event: (JSON.parse(text) as { event: Readonly<Record<string, unknown>> }).event }));
};
const journalIndex = (lines: readonly JournalLine[], predicate: (event: JournalLine['event']) => boolean): number => {
  const index = lines.findIndex((line) => predicate(line.event));
  if (index === -1) {
    throw new Error('journal record not found');
  }
  return index;
};
const requestRecord = (event: JournalLine['event']): PrintRequest | undefined =>
  event['type'] === 'machine-print-request' ? (event['request'] as PrintRequest) : undefined;
const effectRecord = (event: JournalLine['event'], type: string, operationId: string): boolean =>
  event['type'] === type && event['operationId'] === operationId;
const truncateJournal = async (root: string, lines: readonly JournalLine[], count: number): Promise<void> =>
  writeFile(
    join(root, 'machine-events.jsonl'),
    lines
      .slice(0, count)
      .map((line) => `${line.text}\n`)
      .join(''),
  );

describe.runIf(process.platform === 'darwin' || process.platform === 'linux')('print request ledger', () => {
  let currentTime = Date.parse(observedAt);
  const currentTimestamp = (): string => new Date(currentTime).toISOString();
  const uploadPrint = vi.fn(
    async (input: Parameters<MachineSession['uploadPrint']>[0]): Promise<MachineTransferReceipt> => ({
      status: 'transferred',
      transferId: `transfer-${input.operationId}`,
      digest: input.artifact.digest,
      length: input.artifact.length,
      observedAt: currentTimestamp(),
    }),
  );
  const submit = vi.fn(
    async (input: Parameters<MachineSession['submit']>[0]): Promise<MachineSubmissionReceipt> =>
      input.operationId.startsWith('start-unknown')
        ? { status: 'unknown', reason: 'reply-lost-after-possible-acceptance', observedAt: currentTimestamp() }
        : { status: 'accepted', providerRunId: `run-${input.operationId}`, observedAt: currentTimestamp() },
  );
  const reconcile = vi.fn(
    async (input: Parameters<MachineSession['reconcile']>[0]): Promise<MachineCommandReceipt> =>
      input.command === 'project_file'
        ? { status: 'accepted', providerRunId: 'run-late', observedAt: currentTimestamp() }
        : { status: 'unknown', reason: 'no-correlated-provider-reply', observedAt: currentTimestamp() },
  );
  /** Reports every bound session streams once resolved; each session idles until its signal aborts. */
  let telemetry = Promise.withResolvers<Iterable<MachineSnapshot>>();
  const provider_ = bindingProvider(() => undefined, {
    uploadPrint,
    submit,
    reconcile,
    async *observe({ signal }) {
      if (signal.aborted) {
        return;
      }
      const stopped = Promise.withResolvers<Iterable<MachineSnapshot>>();
      signal.addEventListener(
        'abort',
        () => {
          stopped.resolve([]);
        },
        { once: true },
      );
      for (const snapshot of await Promise.race([telemetry.promise, stopped.promise])) {
        yield { type: 'snapshot', snapshot };
      }
      await stopped.promise;
    },
  });
  const runtime: NodeMachineRuntime = {
    discovery: {
      clock: { now: currentTimestamp },
      async *listenDatagrams() {
        yield* [];
      },
    },
    connection: () => ({
      clock: { now: currentTimestamp },
      log: async () => undefined,
      connectStream: async () => {
        throw new Error('fixture does not open sockets');
      },
      async *readArtifact() {
        yield* [];
      },
      resolveSecret: async () => 'credential-must-not-be-serialized',
    }),
  };
  const openLedgerHost = async (root: string) => {
    const admission = createHostAdmissionAuthority({ hostId: 'host-1' });
    const host = await createNodeMachineHost({
      authorityRoot: root,
      hostId: 'host-1',
      authorityId: 'authority-1',
      generation: 'generation-1',
      admission,
      providers: [provider_],
      runtime,
      onError: vi.fn(),
    });
    hosts.push(host);
    const session = admission.issueTrustedSession({
      actor: { kind: 'user', id: 'operator' },
      authorityId: 'authority-1',
      workspaceId: 'workspace-1',
      grants: printRequestGrants,
    });
    const ports = new MessageChannel();
    const server = host.serve({ port: ports.port1, session, workspaceId: 'workspace-1' });
    const client = connectMachineChannel(ports.port2);
    await client.ready;
    const close = async (): Promise<void> => {
      client.close();
      server.dispose();
      await host.close();
      hosts.splice(hosts.indexOf(host), 1);
    };
    return { client, host, close };
  };
  const bind = async (host: NodeMachineHost, client: MachineChannelClient): Promise<void> => {
    let candidate: MachineCandidate | undefined;
    for await (const event of client.discover({ providerId: 'binding-provider', configuration: {} })) {
      if (event.type !== 'lost' && event.candidate.id === 'candidate-a') {
        candidate = event.candidate;
      }
    }
    const ceremony = await client.beginBinding({ candidate: candidate!, name: 'workshop-x1c' });
    if (ceremony.status !== 'operator-action-required') {
      throw new Error('expected binding ceremony');
    }
    await host.completeBinding({ ceremonyId: ceremony.ceremonyId, secretRef: 'vault:bambu-x1c', serviceTrust: {} });
    await vi.waitFor(async () => {
      await expect(client.get({ machineId: 'workshop-x1c' })).resolves.toMatchObject({ freshness: 'current' });
    });
  };
  const request = async (client: MachineChannelClient, requestId: string, configuration = {}) => {
    currentTime += 1000;
    return client.requestPrint({
      requestId,
      machineId: 'workshop-x1c',
      artifact: printArtifact,
      configuration,
      requestedBy: agent,
    });
  };

  it('gates upload and start behind approval, dedupes ids and reconciles an unknown start without resending', async () => {
    uploadPrint.mockClear();
    submit.mockClear();
    const root = await authorityRoot();
    const { client, host, close } = await openLedgerHost(root);
    await bind(host, client);

    const first = await request(client, 'request-1');
    expect(first).toMatchObject({
      requestId: 'request-1',
      machineId: 'workshop-x1c',
      state: 'awaiting-approval',
      requestedBy: agent,
      summary: { fileName: 'pyramid.gcode.3mf' },
      prepared: { machineId: 'workshop-x1c', physicalMachineId: 'physical-1', artifact: printArtifact },
    });
    expect(uploadPrint).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
    await expect(request(client, 'request-1')).resolves.toEqual(first);
    await expect(request(client, 'request-1', { changed: true })).rejects.toThrow('MACHINE_PRINT_REQUEST_ID_CONFLICT');
    const watched = client.watchPrintRequests({ machineId: 'workshop-x1c' })[Symbol.asyncIterator]();
    await expect(watched.next()).resolves.toEqual({ done: false, value: first });

    const denied = await request(client, 'request-2');
    await expect(
      client.resolvePrintRequest({ requestId: 'request-2', decision: 'deny', resolvedBy: operator }),
    ).resolves.toMatchObject({ state: 'denied', resolvedBy: operator, updatedAt: currentTimestamp() });
    await expect(client.withdrawPrintRequest({ requestId: 'request-2', resolvedBy: agent })).rejects.toThrow(
      'MACHINE_PRINT_REQUEST_NOT_AWAITING',
    );
    await request(client, 'request-3');
    await expect(client.withdrawPrintRequest({ requestId: 'request-3', resolvedBy: agent })).resolves.toMatchObject({
      state: 'withdrawn',
      resolvedBy: agent,
    });
    await expect(
      client.resolvePrintRequest({ requestId: 'request-3', decision: 'approve', resolvedBy: operator }),
    ).rejects.toThrow('MACHINE_PRINT_REQUEST_NOT_AWAITING');
    await expect(
      client.resolvePrintRequest({ requestId: 'missing', decision: 'approve', resolvedBy: operator }),
    ).rejects.toThrow('MACHINE_PRINT_REQUEST_UNKNOWN');
    expect(uploadPrint).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();

    const started = await client.resolvePrintRequest({
      requestId: 'request-1',
      decision: 'approve',
      resolvedBy: operator,
      uploadOperationId: 'upload-1',
      startOperationId: 'start-1',
    });
    expect(started).toMatchObject({
      state: 'started',
      resolvedBy: operator,
      uploadOperationId: 'upload-1',
      startOperationId: 'start-1',
      transferId: 'transfer-upload-1',
      receipt: { operationId: 'start-1', kind: 'start', status: 'accepted', providerRunId: 'run-start-1' },
    });
    expect(uploadPrint).toHaveBeenCalledOnce();
    expect(uploadPrint).toHaveBeenCalledWith(
      expect.objectContaining({ operationId: 'upload-1', remoteName: first.prepared?.remoteName }),
    );
    expect(submit).toHaveBeenCalledOnce();
    expect(submit).toHaveBeenCalledWith(
      expect.objectContaining({ operationId: 'start-1', transferId: 'transfer-upload-1' }),
    );
    const seen: string[] = [];
    for (;;) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- the watch yields one journaled transition at a time.
      const frame = await watched.next();
      if (frame.done) {
        throw new Error('watch ended early');
      }
      seen.push(`${frame.value.requestId}:${frame.value.state}`);
      if (frame.value.requestId === 'request-1' && frame.value.state === 'started') {
        expect(frame.value).toEqual(started);
        break;
      }
    }
    expect(seen).toContain('request-2:denied');
    expect(seen).toContain('request-3:withdrawn');
    expect(seen.filter((entry) => entry.startsWith('request-1:'))).toEqual(
      expect.arrayContaining(['request-1:started']),
    );
    await expect(
      client.resolvePrintRequest({ requestId: 'request-1', decision: 'approve', resolvedBy: operator }),
    ).rejects.toThrow('MACHINE_PRINT_REQUEST_NOT_AWAITING');

    await request(client, 'request-4');
    await expect(
      client.resolvePrintRequest({
        requestId: 'request-4',
        decision: 'approve',
        resolvedBy: operator,
        uploadOperationId: 'upload-1',
        startOperationId: 'start-4',
      }),
    ).resolves.toMatchObject({ state: 'failed', failure: { code: 'MACHINE_OPERATION_ID_CONFLICT' } });
    expect(uploadPrint).toHaveBeenCalledOnce();

    await request(client, 'request-5');
    const unknown = await client.resolvePrintRequest({
      requestId: 'request-5',
      decision: 'approve',
      resolvedBy: operator,
      uploadOperationId: 'upload-5',
      startOperationId: 'start-unknown-5',
    });
    expect(unknown).toMatchObject({
      state: 'unknown',
      transferId: 'transfer-upload-5',
      receipt: { operationId: 'start-unknown-5', kind: 'start', status: 'unknown' },
    });
    expect(submit).toHaveBeenCalledTimes(2);
    await expect(
      client.resolvePrintRequest({ requestId: 'request-5', decision: 'approve', resolvedBy: operator }),
    ).rejects.toThrow('MACHINE_PRINT_REQUEST_NOT_AWAITING');
    await expect(
      client.reconcileOperation({ machineId: 'workshop-x1c', operationId: 'start-unknown-5' }),
    ).resolves.toMatchObject({ status: 'accepted', receipt: { providerRunId: 'run-late' } });
    expect(submit).toHaveBeenCalledTimes(2);
    expect(uploadPrint).toHaveBeenCalledTimes(2);
    const listed = await client.listPrintRequests({});
    expect(listed.map(({ requestId, state }) => `${requestId}:${state}`)).toEqual([
      'request-5:started',
      'request-4:failed',
      'request-3:withdrawn',
      'request-2:denied',
      'request-1:started',
    ]);
    expect(listed[0]).toMatchObject({ receipt: { providerRunId: 'run-late' } });
    expect(denied.requestId).toBe('request-2');
    await watched.return?.();
    await close();
  });

  it('recovers the exact request state from every crash fence and never re-uploads', async () => {
    uploadPrint.mockClear();
    submit.mockClear();
    const root = await authorityRoot();
    const first = await openLedgerHost(root);
    await bind(first.host, first.client);
    await request(first.client, 'request-1');
    await expect(
      first.client.resolvePrintRequest({
        requestId: 'request-1',
        decision: 'approve',
        resolvedBy: operator,
        uploadOperationId: 'upload-1',
        startOperationId: 'start-1',
      }),
    ).resolves.toMatchObject({ state: 'started' });
    await first.close();
    const lines = await readJournal(root);
    const fences = {
      beforePreparation: journalIndex(lines, (event) => requestRecord(event)?.state === 'awaiting-approval'),
      beforeApproval: journalIndex(lines, (event) => requestRecord(event)?.state === 'approved'),
      afterUploadIntent: journalIndex(lines, (event) => effectRecord(event, 'machine-effect-sending', 'upload-1')),
      afterUploadSend: journalIndex(lines, (event) => effectRecord(event, 'machine-effect-result', 'upload-1')),
      afterStartSend: journalIndex(lines, (event) => effectRecord(event, 'machine-effect-result', 'start-1')),
      complete: lines.length,
    };
    expect(fences.beforePreparation).toBeLessThan(fences.beforeApproval);
    expect(fences.beforeApproval).toBeLessThan(fences.afterUploadIntent);
    expect(fences.afterUploadIntent).toBeLessThan(fences.afterUploadSend);
    expect(fences.afterUploadSend).toBeLessThan(fences.afterStartSend);
    const approve = async (client: MachineChannelClient) =>
      client.resolvePrintRequest({ requestId: 'request-1', decision: 'approve', resolvedBy: operator });
    const state = async (client: MachineChannelClient): Promise<PrintRequest> => {
      const [record] = await client.listPrintRequests({ machineId: 'workshop-x1c' });
      if (!record) {
        throw new Error('request missing after restart');
      }
      return record;
    };

    await truncateJournal(root, lines, fences.beforePreparation);
    uploadPrint.mockClear();
    submit.mockClear();
    const preparing = await openLedgerHost(root);
    expect(await state(preparing.client)).toMatchObject({
      state: 'failed',
      failure: { code: 'HOST_RESTARTED' },
    });
    await expect(approve(preparing.client)).rejects.toThrow('MACHINE_PRINT_REQUEST_NOT_AWAITING');
    await preparing.close();

    await truncateJournal(root, lines, fences.beforeApproval);
    const awaiting = await openLedgerHost(root);
    const recoveredAwaiting = await state(awaiting.client);
    expect(recoveredAwaiting.state).toBe('awaiting-approval');
    expect(recoveredAwaiting).not.toHaveProperty('uploadOperationId');
    expect(uploadPrint).not.toHaveBeenCalled();
    await expect(approve(awaiting.client)).resolves.toMatchObject({ state: 'started' });
    expect(uploadPrint).toHaveBeenCalledOnce();
    expect(submit).toHaveBeenCalledOnce();
    await awaiting.close();

    await truncateJournal(root, lines, fences.afterUploadIntent);
    uploadPrint.mockClear();
    submit.mockClear();
    const planned = await openLedgerHost(root);
    expect(await state(planned.client)).toMatchObject({ state: 'uploading', uploadOperationId: 'upload-1' });
    await expect(
      planned.client.reconcileOperation({ machineId: 'workshop-x1c', operationId: 'upload-1' }),
    ).resolves.toMatchObject({ kind: 'upload', status: 'planned' });
    expect(uploadPrint).not.toHaveBeenCalled();
    await expect(approve(planned.client)).resolves.toMatchObject({
      state: 'started',
      transferId: 'transfer-upload-1',
      receipt: { operationId: 'start-1', status: 'accepted' },
    });
    expect(uploadPrint).toHaveBeenCalledOnce();
    expect(submit).toHaveBeenCalledOnce();
    await planned.close();

    await truncateJournal(root, lines, fences.afterUploadSend);
    uploadPrint.mockClear();
    submit.mockClear();
    const sent = await openLedgerHost(root);
    const recoveredSent = await state(sent.client);
    expect(recoveredSent).toMatchObject({
      state: 'unknown',
      receipt: {
        operationId: 'upload-1',
        kind: 'upload',
        status: 'unknown',
        reason: 'host-restarted-after-possible-send',
      },
    });
    expect(recoveredSent).not.toHaveProperty('transferId');
    await expect(approve(sent.client)).rejects.toThrow('MACHINE_PRINT_REQUEST_NOT_AWAITING');
    await expect(
      sent.client.reconcileOperation({ machineId: 'workshop-x1c', operationId: 'upload-1' }),
    ).resolves.toMatchObject({ kind: 'upload', status: 'unknown' });
    expect(uploadPrint).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
    await sent.close();

    await truncateJournal(root, lines, fences.afterStartSend);
    const starting = await openLedgerHost(root);
    expect(await state(starting.client)).toMatchObject({
      state: 'unknown',
      transferId: 'transfer-upload-1',
      receipt: { operationId: 'start-1', kind: 'start', status: 'unknown' },
    });
    await expect(approve(starting.client)).rejects.toThrow('MACHINE_PRINT_REQUEST_NOT_AWAITING');
    await expect(
      starting.client.reconcileOperation({ machineId: 'workshop-x1c', operationId: 'start-1' }),
    ).resolves.toMatchObject({ status: 'accepted', receipt: { providerRunId: 'run-late' } });
    expect(await state(starting.client)).toMatchObject({
      state: 'started',
      receipt: { operationId: 'start-1', status: 'accepted', providerRunId: 'run-late' },
    });
    expect(uploadPrint).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
    await starting.close();

    await truncateJournal(root, lines, fences.complete);
    const complete = await openLedgerHost(root);
    expect(await state(complete.client)).toMatchObject({
      state: 'started',
      receipt: { operationId: 'start-1', status: 'accepted', providerRunId: 'run-start-1' },
    });
    await expect(approve(complete.client)).rejects.toThrow('MACHINE_PRINT_REQUEST_NOT_AWAITING');
    expect(uploadPrint).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
    await complete.close();
  });

  it(
    'should journal no telemetry from four hours of 1 Hz reports and recover bindings, operations and requests',
    { timeout: 120_000 },
    async () => {
      uploadPrint.mockClear();
      submit.mockClear();
      telemetry = Promise.withResolvers();
      const root = await authorityRoot();
      const journalPath = join(root, 'machine-events.jsonl');
      const first = await openLedgerHost(root);
      await bind(first.host, first.client);
      await request(first.client, 'request-1');
      await expect(
        first.client.resolvePrintRequest({
          requestId: 'request-1',
          decision: 'approve',
          resolvedBy: operator,
          uploadOperationId: 'upload-1',
          startOperationId: 'start-1',
        }),
      ).resolves.toMatchObject({ state: 'started' });
      await request(first.client, 'request-2');
      const { size: ledgerBytes } = await stat(journalPath);
      const seconds = 4 * 60 * 60;
      const startedAt = currentTime;
      const reportedAt = (second: number): string => new Date(startedAt + second * 1000).toISOString();
      const delivered = Promise.withResolvers<void>();
      const reports = function* (): Generator<MachineSnapshot> {
        for (let second = 1; second <= seconds; second += 1) {
          yield {
            connection: 'connected',
            readiness: 'busy',
            activeRunId: 'run-start-1',
            observedAt: reportedAt(second),
            setup: { materials: [{ slot: 0, state: 'loaded', materialId: 'PLA' }] },
            run: {
              state: 'printing',
              progress: Math.floor(second / 144),
              remainingSeconds: seconds - second,
              currentLayer: 1 + Math.floor(second / 60),
              totalLayers: 241,
            },
            fans: { part: 60 + (second % 5) },
            network: { wifiSignalDbm: -47 - (second % 3) },
          };
        }
        delivered.resolve();
      };
      telemetry.resolve(reports());
      await delivered.promise;
      await expect(first.client.get({ machineId: 'workshop-x1c' })).resolves.toMatchObject({
        freshness: 'current',
        snapshot: { observedAt: reportedAt(seconds), run: { state: 'printing', progress: 100, remainingSeconds: 0 } },
      });
      // Every report differs, yet the journal holds only the binding, operations and print requests.
      const { size: afterReports } = await stat(journalPath);
      expect(afterReports).toBe(ledgerBytes);
      expect(ledgerBytes).toBeLessThan(1024 * 1024);
      await first.close();

      const restarted = await openLedgerHost(root);
      await expect(restarted.client.get({ machineId: 'workshop-x1c' })).resolves.toMatchObject({
        freshness: 'current',
      });
      const recovered = await restarted.client.listPrintRequests({});
      expect(recovered.map(({ requestId, state }) => `${requestId}:${state}`)).toEqual([
        'request-2:awaiting-approval',
        'request-1:started',
      ]);
      await expect(
        restarted.client.reconcileOperation({ machineId: 'workshop-x1c', operationId: 'start-1' }),
      ).resolves.toMatchObject({ status: 'accepted', receipt: { providerRunId: 'run-start-1' } });
      expect(uploadPrint).toHaveBeenCalledOnce();
      expect(submit).toHaveBeenCalledOnce();
      const { size: afterRestart } = await stat(journalPath);
      expect(afterRestart).toBe(ledgerBytes);
      await restarted.close();
    },
  );
});
