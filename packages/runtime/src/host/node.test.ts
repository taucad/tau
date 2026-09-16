import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MessageChannel } from 'node:worker_threads';

import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import type { ContentDigest } from '@taucad/cache-core';

import { defineConfiguration } from '#configuration/index.js';
import { createHostAdmissionAuthority } from '#host/host-admission.js';
import { createNodeMachineHost } from '#host/node.js';
import type { NodeMachineHost, NodeMachineRuntime } from '#host/node.js';
import { connectMachineChannel } from '#machines/machine-channel.js';
import type { MachineChannelHostOperations } from '#machines/machine-channel.js';
import { defineMachine } from '#machines/machine.js';
import type {
  MachineArtifactReference,
  MachineCandidate,
  MachineConnectionRuntime,
  MachineCommandReceipt,
  MachineSession,
  MachineSnapshot,
  MachineStill,
  MachineSubmissionReceipt,
} from '#machines/machine.js';

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
  bindingConfiguration: configuration,
  submissionConfiguration: configuration,
  async *discover() {
    yield* [];
  },
  async connect(): Promise<MachineSession> {
    throw new Error('Node host must not autoconnect');
  },
})();
const operations: MachineChannelHostOperations = {
  async *discover() {
    yield* [];
  },
  async beginBinding() {
    return { status: 'operator-action-required', ceremonyId: 'fixture' };
  },
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
  Pick<MachineSession, 'getSnapshot' | 'observe' | 'submit' | 'control' | 'reconcile' | 'stillCapture'>
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
      status: 'transferred',
      remoteName: `tau-${input.operationId}.gcode.3mf`,
      digest: input.artifact.digest,
      length: input.artifact.length,
      parser: { id: 'fixture-parser', version: '1' },
      providerData: { memberMd5: 'fixture' },
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
  ...(behavior.reconcile ? { reconcile: behavior.reconcile } : {}),
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
    const acceptedInput = {
      machineId: 'workshop-x1c',
      preparedId: prepared.preparedId,
      preparedDigest: prepared.preparedDigest,
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
    await expect(
      client.startPrint({
        ...acceptedInput,
        preparedId: secondPrepared.preparedId,
        preparedDigest: secondPrepared.preparedDigest,
      }),
    ).rejects.toThrow('MACHINE_OPERATION_ID_CONFLICT');
    const lateInput = {
      ...acceptedInput,
      preparedId: secondPrepared.preparedId,
      preparedDigest: secondPrepared.preparedDigest,
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
    expect(paused).toMatchObject({ status: 'accepted', kind: 'pause' });
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
    restartClient.close();
    restartServer.dispose();
  });
});
