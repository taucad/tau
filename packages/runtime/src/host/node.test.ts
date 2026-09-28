import { cp, mkdir, mkdtemp, readFile, readdir, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MessageChannel } from 'node:worker_threads';

import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import type { CacheValue, ContentDigest } from '@taucad/cache-core';
import { cloneBoundedJson } from '@taucad/parameters/json';

import { defineConfiguration } from '#configuration/index.js';
import { createHostAdmissionAuthority } from '#host/host-admission.js';
import type { HostRouteGrant } from '#host/host-admission.js';
import { createNodeMachineEventLog } from '#host/node-machine-event-log.js';
import { createNodeMachineHost } from '#host/node.js';
import type { NodeMachineHost, NodeMachineRuntime } from '#host/node.js';
import { connectMachineChannel } from '#machines/machine-channel.js';
import type { MachineChannelClient, MachineChannelHostOperations } from '#machines/machine-channel.js';
import { machineCredentialReference } from '#machines/machine-credential.js';
import { defineMachine } from '#machines/machine.js';
import { machineManifestFixture } from '#machines/machine-manifest.fixture.js';
import type {
  MachineArtifactReference,
  MachineCandidate,
  MachineConnectionRuntime,
  MachineCommandReceipt,
  MachinePreparationReceipt,
  MachineSession,
  MachineSnapshot,
  MachineStill,
  MachineSubmissionReceipt,
  MachineTransferReceipt,
} from '#machines/machine.js';
import type { PrintRequest } from '#machines/print-request.js';

/** Machine directories whose operations log refuses every append, as a full log or a failing disk would. */
const { refusedAppends } = vi.hoisted(() => ({ refusedAppends: new Set<string>() }));
vi.mock('#host/node-machine-event-log.js', async (importOriginal) => {
  const actual = await importOriginal<Readonly<{ createNodeMachineEventLog: typeof createNodeMachineEventLog }>>();
  return {
    ...actual,
    async createNodeMachineEventLog(input: Parameters<typeof createNodeMachineEventLog>[0]) {
      const log = await actual.createNodeMachineEventLog(input);
      return refusedAppends.has(input.directory)
        ? {
            ...log,
            append: async () => {
              throw new Error('FIXTURE_APPEND_REFUSED');
            },
          }
        : log;
    },
  };
});

const temporaryDirectories: string[] = [];
const hosts: NodeMachineHost[] = [];

afterEach(async () => {
  await Promise.allSettled(hosts.splice(0).map(async (host) => host.close()));
  await Promise.all(temporaryDirectories.splice(0).map(async (path) => rm(path, { recursive: true, force: true })));
});

const storeRoot = async (): Promise<string> => {
  const path = await mkdtemp(join(tmpdir(), 'tau-node-machine-host-'));
  temporaryDirectories.push(path);
  return path;
};

/** Every file in a store, for checks that hold across all of them. */
const storeFiles = async (root: string): Promise<string[]> => {
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  return entries.filter((entry) => entry.isFile()).map((entry) => join(entry.parentPath, entry.name));
};

const sortedEntries = async (path: string): Promise<string[]> => {
  const names = await readdir(path);
  return names.toSorted();
};

// Fixture journals hold plain JSON; the bounded clone is the parser an older host's replay applied.
const plainJson = (value: unknown): CacheValue =>
  cloneBoundedJson(value, {
    code: 'FIXTURE_JSON',
    maximumDepth: 64,
    maximumNodes: 100_000,
    maximumCharacters: 1_000_000,
  });

const storeBytes = async (root: string): Promise<number> => {
  let total = 0;
  for (const file of await storeFiles(root)) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- sizes are summed one file at a time.
    const { size } = await stat(file);
    total += size;
  }
  return total;
};

/** A legacy journal writer, as an older host left one; the fixture owns no lock. */
const legacyJournal = async (root: string) => {
  const directory = join(root, 'authority');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  return createNodeMachineEventLog({
    directory,
    fileName: 'machine-events.jsonl',
    owner: {
      assertCurrent() {
        /* No host owns the store while the fixture writes. */
      },
    },
    parse: plainJson,
  });
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
  removeBinding: unavailable,
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
  Pick<
    MachineSession,
    'getSnapshot' | 'observe' | 'preparePrint' | 'uploadPrint' | 'submit' | 'control' | 'reconcile' | 'stillCapture'
  >
>;
const readyPreparation = (input: Parameters<MachineSession['preparePrint']>[0]): MachinePreparationReceipt => ({
  status: 'ready',
  remoteName: `tau-${input.operationId}.gcode.3mf`,
  digest: input.artifact.digest,
  length: input.artifact.length,
  parser: { id: 'fixture-parser', version: '1' },
  providerData: { memberMd5: 'fixture' },
  observedAt,
});

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
    if (behavior.preparePrint) {
      return behavior.preparePrint(input);
    }
    return readyPreparation(input);
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

const openHost = async (root: string) => {
  const admission = createHostAdmissionAuthority({ hostId: 'host-1' });
  const host = await createNodeMachineHost({
    storeRoot: root,
    hostId: 'host-1',
    authorityId: 'authority-1',
    admission,
    providers: [provider],
    operations,
    onError: vi.fn(),
  });
  hosts.push(host);
  return { admission, host };
};

const printArtifact: MachineArtifactReference = {
  projectId: 'proj_0123456789abcdefghijK',
  path: '.tau/artifacts/3333/pyramid.gcode.3mf',
  digest: `sha256:${'3'.repeat(64)}` as ContentDigest,
  length: 128,
  mediaType: 'application/vnd.bambulab.gcode-3mf',
  contract: { id: 'manufacturing.toolpath.bambu-gcode-3mf', version: 1 },
  selectedMember: 'Metadata/plate_1.gcode',
};

describe.runIf(process.platform === 'darwin' || process.platform === 'linux')('createNodeMachineHost', () => {
  it('serves an admitted channel, closes it on revocation, and lets one host own the store at a time', async () => {
    const root = await storeRoot();
    const first = await openHost(root);
    const session = first.host.issueSession({
      actor: { kind: 'user', id: 'user-1' },
      grants: [{ route: 'machines', operation: 'machines.listProviders' }],
    });
    const ports = new MessageChannel();
    const server = first.host.serve({ port: ports.port1, session });
    const client = connectMachineChannel(ports.port2);
    await expect(client.listProviders({})).resolves.toMatchObject([{ id: 'fixture-provider' }]);
    first.admission.revoke(session);
    await server.closed;
    client.close();
    // A session issued for a workspace is not a machines session.
    const foreign = first.admission.issueTrustedSession({
      actor: { kind: 'user', id: 'user-1' },
      authorityId: 'authority-1',
      workspaceId: 'workspace-1',
      grants: [{ route: 'machines', operation: 'machines.listProviders' }],
    });
    expect(() => first.host.admitRoute({ session: foreign })).toThrow('WORKSPACE_MISMATCH');
    // Holding the host mints machines sessions only.
    expect(() =>
      first.host.issueSession({
        actor: { kind: 'user', id: 'user-1' },
        grants: [
          { route: 'machines', operation: 'machines.list' },
          { route: 'jobs', operation: 'jobs.list' },
        ],
      }),
    ).toThrow('INVALID_HOST_GRANT');
    await expect(openHost(root)).rejects.toMatchObject({ code: 'AUTHORITY_ALREADY_OWNED' });
    await first.host.close();
    hosts.splice(hosts.indexOf(first.host), 1);

    const second = await openHost(root);
    await second.host.close();
    hosts.splice(hosts.indexOf(second.host), 1);
    expect(() => second.host.issueSession({ actor: { kind: 'user', id: 'user-1' }, grants: [] })).toThrow(
      'NODE_MACHINE_HOST_CLOSED',
    );
  });

  it('persists an opaque binding, reconnects it once, and refuses a second controller for one printer', async () => {
    const root = await storeRoot();
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
        storeRoot: root,
        hostId: 'host-1',
        authorityId: 'authority-1',
        admission,
        providers: [provider_],
        runtime,
        onError: vi.fn(),
      });
      hosts.push(host);
      return { admission, host };
    };
    const first = await openBoundHost();
    const admitted = first.host.issueSession({
      actor: { kind: 'user', id: 'operator' },
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
    const server = first.host.serve({ port: ports.port1, session: admitted });
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
      name: 'Workshop X1C',
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
          name: 'Workshop X1C',
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
    const artifact: MachineArtifactReference = { ...printArtifact, path: 'parts/part.gcode.3mf' };
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

    // The refused binding left nothing behind; the bound printer is one directory of plain files.
    expect(await sortedEntries(root)).toEqual(['authority', 'store.json', 'workshop-x1c']);
    const machine = join(root, 'workshop-x1c');
    const operationsPath = join(machine, 'operations.jsonl');
    const operationsLog = await readFile(operationsPath, 'utf8');
    const { mode } = await stat(operationsPath);
    // oxlint-disable-next-line eslint/no-bitwise -- POSIX permission bits are a bit mask.
    expect(mode & 0o777).toBe(0o600);
    expect(JSON.parse(await readFile(join(machine, 'machine.json'), 'utf8'))).toMatchObject({
      version: 1,
      id: 'workshop-x1c',
      name: 'Workshop X1C',
      providerId: 'binding-provider',
      physicalId: 'physical-1',
      connection: { secretRef: 'vault:bambu-x1c', serviceTrust: { mqtt: { type: 'pinned', digest: pinned } } },
      last: { descriptor: { id: 'physical-1' } },
    });
    expect(await readdir(join(machine, 'preparations'))).toHaveLength(2);
    expect(operationsLog.indexOf('machine-effect-intent')).toBeLessThan(
      operationsLog.indexOf('machine-effect-sending'),
    );
    expect(operationsLog.indexOf('machine-effect-sending')).toBeLessThan(
      operationsLog.indexOf('machine-effect-result'),
    );
    for (const file of await storeFiles(root)) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- each store file is checked on its own.
      expect(await readFile(file, 'utf8'), file).not.toContain('credential-must-not-be-serialized');
    }

    const second = await openBoundHost();
    expect(connections).toHaveBeenCalledTimes(3);
    const restartSession = second.host.issueSession({
      actor: { kind: 'user', id: 'operator' },
      grants: [
        { route: 'machines', operation: 'machines.list' },
        { route: 'machines', operation: 'machines.startPrint' },
        { route: 'machines', operation: 'machines.uploadPrint' },
      ],
    });
    const restartPorts = new MessageChannel();
    const restartServer = second.host.serve({ port: restartPorts.port1, session: restartSession });
    const restartClient = connectMachineChannel(restartPorts.port2);
    await expect(restartClient.list({})).resolves.toMatchObject({
      entries: [{ machineId: 'workshop-x1c', name: 'Workshop X1C', freshness: 'current' }],
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
/** Remove a log's last frame, as a crash between that append and the one before it leaves the file. */
const dropLastFrame = async (path: string): Promise<void> => {
  const text = await readFile(path, 'utf8');
  const frames = text.split('\n').filter((line) => line.length > 0);
  await writeFile(
    path,
    frames
      .slice(0, -1)
      .map((line) => `${line}\n`)
      .join(''),
  );
};

describe.runIf(process.platform === 'darwin' || process.platform === 'linux')('print request ledger', () => {
  let currentTime = Date.parse(observedAt);
  const currentTimestamp = (): string => new Date(currentTime).toISOString();
  /** Runs as each device call begins, before the device answers. */
  let beforeDevice = async (_call: 'prepare' | 'start' | 'upload'): Promise<void> => undefined;
  const preparePrint = vi.fn(
    async (input: Parameters<MachineSession['preparePrint']>[0]): Promise<MachinePreparationReceipt> => {
      await beforeDevice('prepare');
      return readyPreparation(input);
    },
  );
  const uploadPrint = vi.fn(
    async (input: Parameters<MachineSession['uploadPrint']>[0]): Promise<MachineTransferReceipt> => {
      await beforeDevice('upload');
      return {
        status: 'transferred',
        transferId: `transfer-${input.operationId}`,
        digest: input.artifact.digest,
        length: input.artifact.length,
        observedAt: currentTimestamp(),
      };
    },
  );
  const submit = vi.fn(async (input: Parameters<MachineSession['submit']>[0]): Promise<MachineSubmissionReceipt> => {
    await beforeDevice('start');
    return input.operationId.startsWith('start-unknown')
      ? { status: 'unknown', reason: 'reply-lost-after-possible-acceptance', observedAt: currentTimestamp() }
      : { status: 'accepted', providerRunId: `run-${input.operationId}`, observedAt: currentTimestamp() };
  });
  const reconcile = vi.fn(
    async (input: Parameters<MachineSession['reconcile']>[0]): Promise<MachineCommandReceipt> =>
      input.command === 'project_file'
        ? { status: 'accepted', providerRunId: 'run-late', observedAt: currentTimestamp() }
        : { status: 'unknown', reason: 'no-correlated-provider-reply', observedAt: currentTimestamp() },
  );
  /** Reports every bound session streams once resolved; each session idles until its signal aborts. */
  let telemetry = Promise.withResolvers<Iterable<MachineSnapshot>>();
  const provider_ = bindingProvider(() => undefined, {
    preparePrint,
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
    const onError = vi.fn();
    const host = await createNodeMachineHost({
      storeRoot: root,
      hostId: 'host-1',
      authorityId: 'authority-1',
      admission,
      providers: [provider_],
      runtime,
      onError,
    });
    hosts.push(host);
    const session = host.issueSession({ actor: { kind: 'user', id: 'operator' }, grants: printRequestGrants });
    const ports = new MessageChannel();
    const server = host.serve({ port: ports.port1, session });
    const client = connectMachineChannel(ports.port2);
    await client.ready;
    const close = async (): Promise<void> => {
      client.close();
      server.dispose();
      await host.close();
      hosts.splice(hosts.indexOf(host), 1);
    };
    return { client, host, onError, close };
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
  const request = async (
    client: MachineChannelClient,
    requestId: string,
    {
      configuration = {},
      artifact = printArtifact,
    }: Readonly<{ configuration?: CacheValue; artifact?: MachineArtifactReference }> = {},
  ) => {
    currentTime += 1000;
    return client.requestPrint({
      requestId,
      machineId: 'workshop-x1c',
      artifact,
      configuration,
      requestedBy: agent,
    });
  };

  it('gates upload and start behind approval, dedupes ids and reconciles an unknown start without resending', async () => {
    uploadPrint.mockClear();
    submit.mockClear();
    const root = await storeRoot();
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
    await expect(request(client, 'request-1', { configuration: { changed: true } })).rejects.toThrow(
      'MACHINE_PRINT_REQUEST_ID_CONFLICT',
    );
    // A request lives in its machine's directory, so one for an unbound machine is refused and never written.
    await expect(
      client.requestPrint({
        requestId: 'request-elsewhere',
        machineId: 'unbound-x1c',
        artifact: printArtifact,
        configuration: {},
        requestedBy: agent,
      }),
    ).rejects.toThrow('MACHINE_PREPARATION_UNAVAILABLE');
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
      // oxlint-disable-next-line eslint/no-await-in-loop -- the watch yields one recorded transition at a time.
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
    // Each request is one whole record in its machine's directory.
    expect(await sortedEntries(join(root, 'workshop-x1c', 'requests'))).toEqual([
      'request-1.json',
      'request-2.json',
      'request-3.json',
      'request-4.json',
      'request-5.json',
    ]);
    expect(JSON.parse(await readFile(join(root, 'workshop-x1c', 'requests', 'request-5.json'), 'utf8'))).toEqual({
      version: 1,
      request: listed[0],
    });
    await watched.return?.();
    await close();
  });

  it('should list and watch print requests by project', async () => {
    const root = await storeRoot();
    const { client, host, close } = await openLedgerHost(root);
    await bind(host, client);
    const otherProject = 'proj_ZYXWVUTSRQPONMLKJIHGF';
    const watched = client.watchPrintRequests({ projectId: otherProject })[Symbol.asyncIterator]();
    await request(client, 'request-1');
    await request(client, 'request-2', { artifact: { ...printArtifact, projectId: otherProject } });
    const ids = async (projectId?: string): Promise<string[]> => {
      const listed = await client.listPrintRequests(projectId === undefined ? {} : { projectId });
      return listed.map(({ requestId }) => requestId);
    };
    await expect(ids()).resolves.toEqual(['request-2', 'request-1']);
    await expect(ids(printArtifact.projectId)).resolves.toEqual(['request-1']);
    await expect(ids(otherProject)).resolves.toEqual(['request-2']);
    await expect(ids('proj_000000000000000000000')).resolves.toEqual([]);
    const seen: string[] = [];
    for (;;) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- the watch yields one recorded transition at a time.
      const frame = await watched.next();
      if (frame.done) {
        throw new Error('watch ended early');
      }
      seen.push(frame.value.requestId);
      if (frame.value.state === 'awaiting-approval') {
        break;
      }
    }
    expect(new Set(seen)).toEqual(new Set(['request-2']));
    await watched.return?.();
    await close();
  });

  it('recovers the exact request state from every crash point and never re-sends', async () => {
    uploadPrint.mockClear();
    submit.mockClear();
    const root = await storeRoot();
    const first = await openLedgerHost(root);
    await bind(first.host, first.client);
    // Copy the store while each device call is out: each copy is what a crash at that point leaves on disk.
    const crashes = new Map<string, string>();
    const crashCopy = async (name: string): Promise<void> => {
      const copy = join(await storeRoot(), 'store');
      await cp(root, copy, { recursive: true });
      crashes.set(name, copy);
    };
    beforeDevice = async (call) => crashCopy(`${call}-sending`);
    try {
      await request(first.client, 'request-1');
      await crashCopy('awaiting-approval');
      await expect(
        first.client.resolvePrintRequest({
          requestId: 'request-1',
          decision: 'approve',
          resolvedBy: operator,
          uploadOperationId: 'upload-1',
          startOperationId: 'start-1',
        }),
      ).resolves.toMatchObject({ state: 'started' });
    } finally {
      beforeDevice = async () => undefined;
    }
    await first.close();
    await crashCopy('complete');
    // The crash after the upload's intent but before its send was recorded.
    await crashCopy('upload-planned');
    const uploadSending = crashes.get('upload-sending');
    const uploadPlanned = crashes.get('upload-planned');
    if (!uploadSending || !uploadPlanned) {
      throw new Error('crash copies missing');
    }
    await cp(uploadSending, uploadPlanned, { recursive: true, force: true });
    await dropLastFrame(join(uploadPlanned, 'workshop-x1c', 'operations.jsonl'));
    const at = (name: string): string => {
      const copy = crashes.get(name);
      if (!copy) {
        throw new Error(`no crash copy ${name}`);
      }
      return copy;
    };
    const approve = async (client: MachineChannelClient) =>
      client.resolvePrintRequest({ requestId: 'request-1', decision: 'approve', resolvedBy: operator });
    const state = async (client: MachineChannelClient): Promise<PrintRequest> => {
      const [record] = await client.listPrintRequests({ machineId: 'workshop-x1c' });
      if (!record) {
        throw new Error('request missing after restart');
      }
      return record;
    };
    const restart = async (name: string) => {
      uploadPrint.mockClear();
      submit.mockClear();
      const fixture = await openLedgerHost(at(name));
      await vi.waitFor(async () => {
        await expect(fixture.client.get({ machineId: 'workshop-x1c' })).resolves.toMatchObject({
          freshness: 'current',
        });
      });
      return fixture;
    };

    const preparing = await restart('prepare-sending');
    expect(await state(preparing.client)).toMatchObject({
      state: 'failed',
      failure: { code: 'HOST_RESTARTED', message: 'The host restarted before preparation completed.' },
    });
    await expect(approve(preparing.client)).rejects.toThrow('MACHINE_PRINT_REQUEST_NOT_AWAITING');
    await preparing.close();

    const awaiting = await restart('awaiting-approval');
    const recoveredAwaiting = await state(awaiting.client);
    expect(recoveredAwaiting.state).toBe('awaiting-approval');
    expect(recoveredAwaiting).not.toHaveProperty('uploadOperationId');
    expect(uploadPrint).not.toHaveBeenCalled();
    await expect(approve(awaiting.client)).resolves.toMatchObject({ state: 'started' });
    expect(uploadPrint).toHaveBeenCalledOnce();
    expect(submit).toHaveBeenCalledOnce();
    await awaiting.close();

    const planned = await restart('upload-planned');
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

    const sent = await restart('upload-sending');
    const recoveredSent = await state(sent.client);
    // A start is planned only after a transferred upload, so an unconfirmed upload settles as nothing started.
    expect(recoveredSent).toMatchObject({
      state: 'failed',
      failure: { code: 'MACHINE_UPLOAD_UNCONFIRMED' },
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
    // The restart recorded that `unknown` durably, once: a second restart replays it and appends nothing.
    const sentLog = join(at('upload-sending'), 'workshop-x1c', 'operations.jsonl');
    const recorded = await readFile(sentLog, 'utf8');
    expect(recorded.match(/"source":"recovery"/gu)).toHaveLength(1);
    const again = await restart('upload-sending');
    await again.close();
    expect(await readFile(sentLog, 'utf8')).toBe(recorded);

    const starting = await restart('start-sending');
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

    const complete = await restart('complete');
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
    'should store no telemetry from four hours of 1 Hz reports and recover bindings, operations and requests',
    { timeout: 120_000 },
    async () => {
      uploadPrint.mockClear();
      submit.mockClear();
      telemetry = Promise.withResolvers();
      const root = await storeRoot();
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
      const ledgerBytes = await storeBytes(root);
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
      // Every report differs, yet the store holds only the binding, operations and print requests.
      expect(await storeBytes(root)).toBe(ledgerBytes);
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
      expect(await storeBytes(root)).toBe(ledgerBytes);
      await restarted.close();
    },
  );
});

describe.runIf(process.platform === 'darwin' || process.platform === 'linux')('binding credentials and removal', () => {
  const candidateFor = (id: string, serial?: string): MachineCandidate => ({
    id,
    name: `Printer ${id}`,
    endpoint: { address: `${id}.local`, interface: 'manual' },
    claimedIdentity: serial === undefined ? { model: 'X1C' } : { serial, model: 'X1C' },
    observedAt,
    expiresAt,
  });
  const printerA = candidateFor('candidate-a', 'physical-a');
  const printerB = candidateFor('candidate-b', 'physical-b');
  const unclaimed = candidateFor('candidate-c');
  const connects = vi.fn((_candidateId: string): void => undefined);
  const closes = vi.fn(async (): Promise<void> => undefined);
  const provider_ = defineMachine({
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
      for (const candidate of [printerA, printerB, unclaimed]) {
        yield { type: 'found', candidate };
      }
    },
    async connect({ candidate }) {
      connects(candidate.id);
      const base = session(closes);
      return {
        ...base,
        // Each fixture printer reports the physical identity its candidate claims.
        async getDescriptor(descriptorInput) {
          return {
            ...(await base.getDescriptor(descriptorInput)),
            id: candidate.claimedIdentity.serial ?? 'physical-unclaimed',
          };
        },
      };
    },
  })();
  const saved = new Set<string>();
  const has = vi.fn(async (reference: string): Promise<boolean> => saved.has(reference));
  const forget = vi.fn(async (reference: string): Promise<void> => {
    saved.delete(reference);
  });
  const runtime: NodeMachineRuntime = {
    discovery: {
      clock: { now: () => observedAt },
      async *listenDatagrams() {
        yield* [];
      },
    },
    connection: () => ({
      clock: { now: () => observedAt },
      log: async () => undefined,
      connectStream: async () => {
        throw new Error('fixture does not open sockets');
      },
      async *readArtifact() {
        yield* [];
      },
      resolveSecret: async () => 'credential-must-not-be-serialized',
    }),
    credentials: { has, forget },
  };
  const removalGrants: readonly HostRouteGrant[] = (
    [
      'discover',
      'beginBinding',
      'removeBinding',
      'list',
      'get',
      'preparePrint',
      'controlRun',
      'reconcileOperation',
      'requestPrint',
      'withdrawPrintRequest',
    ] as const
  ).map((operation) => ({ route: 'machines', operation: `machines.${operation}` }));
  const openCredentialHost = async (root: string) => {
    const admission = createHostAdmissionAuthority({ hostId: 'host-1' });
    const onError = vi.fn();
    const host = await createNodeMachineHost({
      storeRoot: root,
      hostId: 'host-1',
      authorityId: 'authority-1',
      admission,
      providers: [provider_],
      runtime,
      onError,
    });
    hosts.push(host);
    const operatorSession = host.issueSession({ actor: { kind: 'user', id: 'operator' }, grants: removalGrants });
    const ports = new MessageChannel();
    const server = host.serve({ port: ports.port1, session: operatorSession });
    const client = connectMachineChannel(ports.port2);
    await client.ready;
    const close = async (): Promise<void> => {
      client.close();
      server.dispose();
      await host.close();
      hosts.splice(hosts.indexOf(host), 1);
    };
    return { client, host, onError, close };
  };
  const discoverAll = async (client: MachineChannelClient): Promise<Map<string, MachineCandidate>> => {
    const found = new Map<string, MachineCandidate>();
    for await (const event of client.discover({ providerId: 'binding-provider', configuration: {} })) {
      if (event.type !== 'lost') {
        found.set(event.candidate.id, event.candidate);
      }
    }
    return found;
  };
  const beginCeremony = async (client: MachineChannelClient, candidateId: string, name: string): Promise<string> => {
    const found = await discoverAll(client);
    const ceremony = await client.beginBinding({ candidate: found.get(candidateId)!, name });
    if (ceremony.status !== 'operator-action-required') {
      throw new Error('expected binding ceremony');
    }
    return ceremony.ceremonyId;
  };
  const bindAs = async (
    fixture: Readonly<{ client: MachineChannelClient; host: NodeMachineHost }>,
    binding: Readonly<{ candidateId: string; name: string; secretRef: string }>,
  ): Promise<string> => {
    const ceremonyId = await beginCeremony(fixture.client, binding.candidateId, binding.name);
    const outcome = await fixture.host.completeBinding({ ceremonyId, secretRef: binding.secretRef, serviceTrust: {} });
    if (outcome.status !== 'bound') {
      throw new Error('expected a bound machine');
    }
    await vi.waitFor(async () => {
      await expect(fixture.client.get({ machineId: outcome.machineId })).resolves.toMatchObject({
        name: binding.name,
        freshness: 'current',
      });
    });
    return outcome.machineId;
  };

  it('should flag a candidate whose claimed identity has a saved credential without persisting the flag', async () => {
    saved.clear();
    has.mockClear();
    const reference = machineCredentialReference('binding-provider', 'physical-a');
    saved.add(reference);
    const root = await storeRoot();
    const fixture = await openCredentialHost(root);
    const found = await discoverAll(fixture.client);
    expect(found.get('candidate-a')).toEqual({ ...printerA, credential: 'saved' });
    expect(found.get('candidate-b')).toEqual(printerB);
    expect(found.get('candidate-c')).toEqual(unclaimed);
    // A candidate that claims no serial is never looked up.
    expect(has.mock.calls).toEqual([[reference], [machineCredentialReference('binding-provider', 'physical-b')]]);

    has.mockRejectedValueOnce(new Error('SECRET_VAULT_UNAVAILABLE'));
    const unmarked = await discoverAll(fixture.client);
    expect(unmarked.get('candidate-a')).toEqual(printerA);
    expect(fixture.onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'SECRET_VAULT_UNAVAILABLE' }));

    // The flag is a projection: the ceremony, its description and the store keep the provider's own candidate.
    const ceremony = await fixture.client.beginBinding({ candidate: found.get('candidate-a')!, name: 'workshop-x1c' });
    if (ceremony.status !== 'operator-action-required') {
      throw new Error('expected binding ceremony');
    }
    expect(fixture.host.describeBinding(ceremony.ceremonyId)).toEqual({
      providerId: 'binding-provider',
      candidate: printerA,
    });
    await fixture.host.completeBinding({ ceremonyId: ceremony.ceremonyId, secretRef: reference, serviceTrust: {} });
    await fixture.close();
    for (const file of await storeFiles(root)) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- each store file is checked on its own.
      expect(await readFile(file, 'utf8'), file).not.toContain('"credential"');
    }
  });

  it('should describe only a pending ceremony', async () => {
    const fixture = await openCredentialHost(await storeRoot());
    const ceremonyId = await beginCeremony(fixture.client, 'candidate-b', 'studio-x1c');
    expect(fixture.host.describeBinding(ceremonyId)).toEqual({ providerId: 'binding-provider', candidate: printerB });
    expect(fixture.host.describeBinding('unknown-ceremony')).toBeUndefined();
    await fixture.host.completeBinding({ ceremonyId, secretRef: 'none', serviceTrust: {} });
    expect(fixture.host.describeBinding(ceremonyId)).toBeUndefined();
    await fixture.close();
  });

  it('should give a binding the free slug of its name and keep the name to show', async () => {
    const fixture = await openCredentialHost(await storeRoot());
    await expect(
      bindAs(fixture, { candidateId: 'candidate-a', name: 'Workshop X1C', secretRef: 'vault:a' }),
    ).resolves.toBe('workshop-x1c');
    await expect(
      bindAs(fixture, { candidateId: 'candidate-b', name: 'workshop x1c', secretRef: 'vault:b' }),
    ).resolves.toBe('workshop-x1c-2');
    await expect(fixture.client.list({})).resolves.toMatchObject({
      entries: [
        { machineId: 'workshop-x1c', name: 'Workshop X1C', descriptor: { id: 'physical-a' } },
        { machineId: 'workshop-x1c-2', name: 'workshop x1c', descriptor: { id: 'physical-b' } },
      ],
    });
    // A name is the person's text: blank or longer than 128 characters is refused before any ceremony.
    await expect(beginCeremony(fixture.client, 'candidate-c', '   ')).rejects.toThrow('MACHINE_BINDING_NAME_INVALID');
    await expect(beginCeremony(fixture.client, 'candidate-c', 'x'.repeat(129))).rejects.toThrow(
      'MACHINE_BINDING_NAME_INVALID',
    );
    // A candidate that is already bound answers with its machine, whatever name is asked for.
    const found = await discoverAll(fixture.client);
    await expect(fixture.client.beginBinding({ candidate: found.get('candidate-a')!, name: 'Other' })).resolves.toEqual(
      {
        status: 'bound',
        machineId: 'workshop-x1c',
      },
    );
    await fixture.close();
  });

  it('should remove a binding, forget its credential and keep its history after a restart', async () => {
    saved.clear();
    forget.mockClear();
    closes.mockClear();
    const root = await storeRoot();
    const reference = machineCredentialReference('binding-provider', 'physical-a');
    saved.add(reference);
    const first = await openCredentialHost(root);
    await bindAs(first, { candidateId: 'candidate-a', name: 'workshop-x1c', secretRef: reference });
    expect(closes).not.toHaveBeenCalled();
    await expect(first.client.removeBinding({ machineId: 'workshop-x1c' })).resolves.toEqual({
      status: 'removed',
      machineId: 'workshop-x1c',
    });
    expect(closes).toHaveBeenCalledOnce();
    expect(forget).toHaveBeenCalledExactlyOnceWith(reference);
    expect(saved.has(reference)).toBe(false);
    await expect(first.client.list({})).resolves.toMatchObject({ entries: [] });
    await expect(first.client.removeBinding({ machineId: 'workshop-x1c' })).rejects.toThrow(
      'MACHINE_DIRECTORY_UNKNOWN_MACHINE',
    );
    await first.close();
    const history = `workshop-x1c.removed-${Date.parse(observedAt)}`;
    expect(await sortedEntries(root)).toEqual(['authority', 'store.json', history]);
    expect(JSON.parse(await readFile(join(root, history, 'machine.json'), 'utf8'))).toMatchObject({
      id: 'workshop-x1c',
      connection: { secretRef: reference },
    });

    connects.mockClear();
    const second = await openCredentialHost(root);
    expect(connects).not.toHaveBeenCalled();
    await expect(second.client.list({})).resolves.toMatchObject({ entries: [] });
    // The printer is free again: a new binding for it is not a physical-identity conflict.
    await bindAs(second, { candidateId: 'candidate-a', name: 'studio-x1c', secretRef: reference });
    await expect(second.client.list({})).resolves.toMatchObject({
      entries: [{ machineId: 'studio-x1c', descriptor: { id: 'physical-a' } }],
    });
    await second.close();
  });

  it('should refuse removal while a print request still needs the binding', async () => {
    forget.mockClear();
    const fixture = await openCredentialHost(await storeRoot());
    await bindAs(fixture, { candidateId: 'candidate-a', name: 'workshop-x1c', secretRef: 'vault:busy' });
    await expect(
      fixture.client.requestPrint({
        requestId: 'request-1',
        machineId: 'workshop-x1c',
        artifact: printArtifact,
        configuration: {},
        requestedBy: agent,
      }),
    ).resolves.toMatchObject({ state: 'awaiting-approval' });
    await expect(fixture.client.removeBinding({ machineId: 'workshop-x1c' })).rejects.toThrow('MACHINE_BINDING_BUSY');
    expect(forget).not.toHaveBeenCalled();
    await expect(fixture.client.get({ machineId: 'workshop-x1c' })).resolves.toMatchObject({ freshness: 'current' });
    await fixture.client.withdrawPrintRequest({ requestId: 'request-1', resolvedBy: agent });
    await expect(fixture.client.removeBinding({ machineId: 'workshop-x1c' })).resolves.toEqual({
      status: 'removed',
      machineId: 'workshop-x1c',
    });
    expect(forget).toHaveBeenCalledExactlyOnceWith('vault:busy');
    await fixture.close();
  });

  it('should forget a credential only once no binding uses it, never "none", and report a failed forget', async () => {
    forget.mockClear();
    const fixture = await openCredentialHost(await storeRoot());
    await bindAs(fixture, { candidateId: 'candidate-a', name: 'printer-a', secretRef: 'vault:shared' });
    await bindAs(fixture, { candidateId: 'candidate-b', name: 'printer-b', secretRef: 'vault:shared' });
    await fixture.client.removeBinding({ machineId: 'printer-a' });
    expect(forget).not.toHaveBeenCalled();
    // The trusted host object removes too, e.g. to roll back a binding whose credential could not be saved.
    await expect(fixture.host.removeBinding({ machineId: 'printer-b' })).resolves.toEqual({
      status: 'removed',
      machineId: 'printer-b',
    });
    expect(forget).toHaveBeenCalledExactlyOnceWith('vault:shared');

    await bindAs(fixture, { candidateId: 'candidate-a', name: 'simulator', secretRef: 'none' });
    await fixture.client.removeBinding({ machineId: 'simulator' });
    expect(forget).toHaveBeenCalledOnce();

    await bindAs(fixture, { candidateId: 'candidate-b', name: 'printer-b', secretRef: 'vault:b' });
    forget.mockRejectedValueOnce(new Error('SECRET_VAULT_UNAVAILABLE'));
    await expect(fixture.client.removeBinding({ machineId: 'printer-b' })).resolves.toEqual({
      status: 'removed',
      machineId: 'printer-b',
    });
    expect(fixture.onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'SECRET_VAULT_UNAVAILABLE' }));
    await expect(fixture.client.list({})).resolves.toMatchObject({ entries: [] });
    await fixture.close();
  });

  it("should keep every other printer working when one printer's operations log is unreadable", async () => {
    const root = await storeRoot();
    const first = await openCredentialHost(root);
    await bindAs(first, { candidateId: 'candidate-a', name: 'printer-a', secretRef: 'vault:a' });
    await bindAs(first, { candidateId: 'candidate-b', name: 'printer-b', secretRef: 'vault:b' });
    await first.close();
    // A well-formed frame that breaks the replay rules: a send for an effect that was never planned.
    const log = await createNodeMachineEventLog({
      directory: join(root, 'printer-a'),
      fileName: 'operations.jsonl',
      owner: {
        assertCurrent() {
          /* No host owns the store while the fixture writes. */
        },
      },
      parse: plainJson,
    });
    await log.append({ type: 'machine-effect-sending', operationId: 'orphan', observedAt });
    await log.close();
    const damaged = await readFile(join(root, 'printer-a', 'operations.jsonl'));

    connects.mockClear();
    const second = await openCredentialHost(root);
    expect(connects.mock.calls).toEqual([['candidate-b']]);
    expect(second.onError).toHaveBeenCalledOnce();
    expect(second.onError.mock.calls[0]?.[0]).toMatchObject({
      message: 'MACHINE_OPERATIONS_LOG_CORRUPT',
      cause: { message: 'NODE_MACHINE_EFFECT_ORPHAN_TRANSITION' },
    });
    await vi.waitFor(async () => {
      await expect(second.client.list({})).resolves.toMatchObject({
        entries: [
          { machineId: 'printer-a', name: 'printer-a', freshness: 'stale' },
          { machineId: 'printer-b', freshness: 'current' },
        ],
      });
    });
    await expect(
      second.client.preparePrint({ machineId: 'printer-a', artifact: printArtifact, configuration: {} }),
    ).rejects.toThrow('MACHINE_OPERATIONS_LOG_CORRUPT');
    await expect(
      second.client.controlRun({
        machineId: 'printer-a',
        operationId: 'pause-1',
        command: 'pause',
        expectedProviderRunId: 'run-1',
      }),
    ).rejects.toThrow('MACHINE_OPERATIONS_LOG_CORRUPT');
    await expect(second.client.reconcileOperation({ machineId: 'printer-a', operationId: 'orphan' })).rejects.toThrow(
      'MACHINE_OPERATIONS_LOG_CORRUPT',
    );
    await expect(
      second.client.requestPrint({
        requestId: 'request-a',
        machineId: 'printer-a',
        artifact: printArtifact,
        configuration: {},
        requestedBy: agent,
      }),
    ).rejects.toThrow('MACHINE_OPERATIONS_LOG_CORRUPT');
    await expect(
      second.client.requestPrint({
        requestId: 'request-b',
        machineId: 'printer-b',
        artifact: printArtifact,
        configuration: {},
        requestedBy: agent,
      }),
    ).resolves.toMatchObject({ state: 'awaiting-approval' });
    expect(await readdir(join(root, 'printer-a'))).not.toContain('requests');
    // The unreadable printer can still be removed; its log goes with its history, byte for byte.
    await expect(second.client.removeBinding({ machineId: 'printer-a' })).resolves.toEqual({
      status: 'removed',
      machineId: 'printer-a',
    });
    await second.close();
    expect(await readFile(join(root, `printer-a.removed-${Date.parse(observedAt)}`, 'operations.jsonl'))).toEqual(
      damaged,
    );
  });

  it('should keep every other printer working when one printer cannot record its possible send at restart', async () => {
    const root = await storeRoot();
    const first = await openCredentialHost(root);
    await bindAs(first, { candidateId: 'candidate-a', name: 'printer-a', secretRef: 'vault:a' });
    await bindAs(first, { candidateId: 'candidate-b', name: 'printer-b', secretRef: 'vault:b' });
    await first.close();
    // A pause that may have left when the host stopped: recovery owes it a durable `unknown` before anything reconnects.
    const log = await createNodeMachineEventLog({
      directory: join(root, 'printer-a'),
      fileName: 'operations.jsonl',
      owner: {
        assertCurrent() {
          /* No host owns the store while the fixture writes. */
        },
      },
      parse: plainJson,
    });
    await log.append({
      type: 'machine-effect-intent',
      machineId: 'printer-a',
      providerId: 'binding-provider',
      physicalMachineId: 'physical-a',
      operationId: 'pause-1',
      inputDigest: `sha256:${'0'.repeat(64)}`,
      intent: { kind: 'pause', expectedProviderRunId: 'run-1' },
      plannedAt: observedAt,
    });
    await log.append({ type: 'machine-effect-sending', operationId: 'pause-1', observedAt });
    await log.close();
    const pending = await readFile(join(root, 'printer-a', 'operations.jsonl'));

    connects.mockClear();
    refusedAppends.add(join(await realpath(root), 'printer-a'));
    try {
      const second = await openCredentialHost(root);
      expect(connects.mock.calls).toEqual([['candidate-b']]);
      expect(second.onError).toHaveBeenCalledOnce();
      expect(second.onError.mock.calls[0]?.[0]).toMatchObject({
        message: 'MACHINE_OPERATIONS_LOG_CORRUPT',
        cause: { message: 'FIXTURE_APPEND_REFUSED' },
      });
      await vi.waitFor(async () => {
        await expect(second.client.list({})).resolves.toMatchObject({
          entries: [
            { machineId: 'printer-a', freshness: 'stale' },
            { machineId: 'printer-b', freshness: 'current' },
          ],
        });
      });
      // The possible send is neither settled nor sent again.
      await expect(
        second.client.reconcileOperation({ machineId: 'printer-a', operationId: 'pause-1' }),
      ).rejects.toThrow('MACHINE_OPERATIONS_LOG_CORRUPT');
      await second.close();
    } finally {
      refusedAppends.clear();
    }
    expect(await readFile(join(root, 'printer-a', 'operations.jsonl'))).toEqual(pending);
  });

  it('should import a legacy binding once and reconnect it as an ordinary printer', async () => {
    connects.mockClear();
    const root = await storeRoot();
    const legacy = await legacyJournal(root);
    await legacy.append({
      type: 'host-authority-initialized',
      hostId: 'host-1',
      authorityId: 'authority-1',
      generation: 'generation-1',
    });
    await legacy.append({
      type: 'machine-binding-committed',
      workspaceId: 'c'.repeat(64),
      machineId: 'Workshop X1C',
      providerId: 'binding-provider',
      physicalId: 'physical-a',
      candidate: printerA,
      configuration: {},
      connection: { secretRef: 'vault:legacy', serviceTrust: {} },
    });
    await legacy.close();
    const fixture = await openCredentialHost(root);
    expect(connects.mock.calls).toEqual([['candidate-a']]);
    await vi.waitFor(async () => {
      await expect(fixture.client.get({ machineId: 'workshop-x1c' })).resolves.toMatchObject({
        name: 'Workshop X1C',
        freshness: 'current',
        descriptor: { id: 'physical-a' },
      });
    });
    await fixture.close();
    expect(JSON.parse(await readFile(join(root, 'store.json'), 'utf8'))).toMatchObject({
      version: 1,
      migrated: { journals: 1, machines: 1, droppedRequests: 0, droppedEffects: 0 },
    });
    expect(fixture.onError).not.toHaveBeenCalled();
  });
});

describe.runIf(process.platform === 'darwin' || process.platform === 'linux')('reconnect supervision', () => {
  type Loss = 'disconnected' | 'end' | 'throw';
  /** What the next connect does; with nothing queued the bound printer answers. */
  type Outcome = Error | 'another-printer' | 'hang';
  type Connection = Readonly<{ close: () => Promise<void>; observing: Promise<void>; lose(loss: Loss): void }>;
  const outcomes: Outcome[] = [];
  const connects = vi.fn((_signal: AbortSignal): void => undefined);
  const observed = vi.fn();
  const connections: Connection[] = [];
  const submit = vi.fn<MachineSession['submit']>();
  /** Idle until the test loses the session: report it disconnected, end the observation, or fail it. */
  const lossyObserve = (loss: Promise<Loss>, observing: () => void): NonNullable<SessionBehavior['observe']> =>
    async function* ({ signal }) {
      observing();
      if (signal.aborted) {
        return;
      }
      const aborted = new Promise<undefined>((resolve) => {
        signal.addEventListener(
          'abort',
          () => {
            resolve(undefined);
          },
          { once: true },
        );
      });
      const lost = await Promise.race([loss, aborted]);
      if (lost === 'throw') {
        throw new Error('FIXTURE_STREAM_FAILED');
      }
      if (lost === 'disconnected') {
        yield {
          type: 'snapshot',
          snapshot: { connection: 'disconnected', readiness: 'unknown', observedAt, setup: { materials: [] } },
        };
        await aborted;
      }
    };
  const provider_ = defineMachine({
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
      yield { type: 'found', candidate: bindingCandidates[0]! };
    },
    async connect({ signal }) {
      connects(signal);
      const outcome = outcomes.shift();
      if (outcome instanceof Error) {
        throw outcome;
      }
      if (outcome === 'hang') {
        return new Promise<never>((_resolve, reject) => {
          signal.addEventListener(
            'abort',
            () => {
              reject(new Error('FIXTURE_CONNECT_ABORTED'));
            },
            { once: true },
          );
        });
      }
      const loss = Promise.withResolvers<Loss>();
      const observing = Promise.withResolvers<void>();
      const close = vi.fn(async () => undefined);
      const base = session(close, {
        submit,
        observe: lossyObserve(loss.promise, () => {
          observed();
          observing.resolve();
        }),
      });
      connections.push({ close, observing: observing.promise, lose: loss.resolve });
      return {
        ...base,
        async getDescriptor(descriptorInput) {
          const descriptor = await base.getDescriptor(descriptorInput);
          return outcome === 'another-printer' ? { ...descriptor, id: 'physical-2' } : descriptor;
        },
      };
    },
  })();
  const runtime: NodeMachineRuntime = {
    discovery: {
      clock: { now: () => observedAt },
      async *listenDatagrams() {
        yield* [];
      },
    },
    connection: () => ({
      clock: { now: () => observedAt },
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
  const grants: readonly HostRouteGrant[] = (
    ['discover', 'beginBinding', 'get', 'preparePrint', 'uploadPrint', 'startPrint', 'reconcileOperation'] as const
  ).map((operation) => ({ route: 'machines', operation: `machines.${operation}` }));
  const openSupervised = async (root: string) => {
    const admission = createHostAdmissionAuthority({ hostId: 'host-1' });
    const onError = vi.fn();
    const host = await createNodeMachineHost({
      storeRoot: root,
      hostId: 'host-1',
      authorityId: 'authority-1',
      admission,
      providers: [provider_],
      runtime,
      onError,
    });
    hosts.push(host);
    const close = async (): Promise<void> => {
      await host.close();
      hosts.splice(hosts.indexOf(host), 1);
    };
    return { admission, host, onError, close };
  };
  const openServed = async (root: string) => {
    const fixture = await openSupervised(root);
    const ports = new MessageChannel();
    const server = fixture.host.serve({
      port: ports.port1,
      session: fixture.host.issueSession({ actor: { kind: 'user', id: 'operator' }, grants }),
    });
    const client = connectMachineChannel(ports.port2);
    await client.ready;
    const close = async (): Promise<void> => {
      client.close();
      server.dispose();
      await fixture.close();
    };
    return { ...fixture, client, close };
  };
  /** Bind the printer through a first host and close it, so the next host recovers the binding at start. */
  const bindOnce = async (root: string): Promise<void> => {
    const fixture = await openServed(root);
    let candidate: MachineCandidate | undefined;
    for await (const event of fixture.client.discover({ providerId: 'binding-provider', configuration: {} })) {
      if (event.type !== 'lost') {
        candidate = event.candidate;
      }
    }
    const ceremony = await fixture.client.beginBinding({ candidate: candidate!, name: 'workshop-x1c' });
    if (ceremony.status !== 'operator-action-required') {
      throw new Error('expected binding ceremony');
    }
    await fixture.host.completeBinding({ ceremonyId: ceremony.ceremonyId, secretRef: 'vault:x1c', serviceTrust: {} });
    await fixture.close();
    connects.mockClear();
    observed.mockClear();
    connections.length = 0;
  };
  /** Wait for a condition across real event-loop turns without moving fake time. */
  const until = async (check: () => boolean): Promise<void> => {
    while (!check()) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- polls between real turns; fake time stays put.
      await new Promise<void>((resolve) => {
        setImmediate(resolve);
      });
    }
  };
  /** Advance to a millisecond before the next attempt is due, check it has not started, then let it start. */
  const expectAttemptAfter = async (retryDelay: number): Promise<void> => {
    const before = connects.mock.calls.length;
    await vi.advanceTimersByTimeAsync(retryDelay - 1);
    expect(connects).toHaveBeenCalledTimes(before);
    await vi.advanceTimersByTimeAsync(1);
    await until(() => connects.mock.calls.length === before + 1);
  };
  const useFakeTimers = (): void => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  };
  const machine = { machineId: 'workshop-x1c' } as const;

  afterEach(() => {
    outcomes.length = 0;
    vi.useRealTimers();
  });

  it('should connect a printer that was off at start, retrying after 2 s, 5 s, 10 s, 30 s, then every 60 s', async () => {
    const root = await storeRoot();
    await bindOnce(root);
    outcomes.push(...Array.from({ length: 6 }, () => new Error('FIXTURE_OFFLINE')));
    useFakeTimers();
    const fixture = await openServed(root);
    expect(connects).toHaveBeenCalledOnce();
    await expect(fixture.client.get(machine)).resolves.toMatchObject({ freshness: 'stale' });
    for (const retryDelay of [2000, 5000, 10_000, 30_000, 60_000, 60_000]) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- attempts are due one after another.
      await expectAttemptAfter(retryDelay);
    }
    await connections[0]!.observing;
    await expect(fixture.client.get(machine)).resolves.toMatchObject({
      freshness: 'current',
      snapshot: { connection: 'connected' },
    });
    expect(fixture.onError.mock.calls.map(([error]: unknown[]) => (error as Error).message)).toEqual(
      Array.from({ length: 6 }, () => 'FIXTURE_OFFLINE'),
    );
    // Nothing is scheduled while the session is live.
    expect(vi.getTimerCount()).toBe(0);
    vi.useRealTimers();
    await fixture.close();
  });

  it.each(['disconnected', 'end', 'throw'] as const)(
    'should replace a session whose observation reports %s and start the backoff over once it connects',
    async (loss) => {
      const root = await storeRoot();
      await bindOnce(root);
      useFakeTimers();
      const fixture = await openServed(root);
      const [first] = connections;
      await first!.observing;
      first!.lose(loss);
      outcomes.push(new Error('FIXTURE_OFFLINE'), new Error('FIXTURE_OFFLINE'));
      await expectAttemptAfter(2000);
      await expectAttemptAfter(5000);
      await expectAttemptAfter(10_000);
      const [, second] = connections;
      await second!.observing;
      expect(first!.close).toHaveBeenCalled();
      await expect(fixture.client.get(machine)).resolves.toMatchObject({
        freshness: 'current',
        snapshot: { connection: 'connected' },
      });
      // A good connect starts the backoff over: the next loss is retried after 2 s, not 30 s.
      second!.lose(loss);
      await expectAttemptAfter(2000);
      await connections[2]!.observing;
      await expect(fixture.client.get(machine)).resolves.toMatchObject({ freshness: 'current' });
      vi.useRealTimers();
      await fixture.close();
    },
  );

  it.each([
    ['another printer answers at its address', 'another-printer', 'NODE_MACHINE_HOST_PHYSICAL_IDENTITY_CHANGED'],
    [
      'its certificate no longer matches the pin',
      new Error('FIXTURE_CERTIFICATE_CHANGED'),
      'FIXTURE_CERTIFICATE_CHANGED',
    ],
  ] as const)('should stop retrying and leave the machine stale when %s', async (_case, refusal, code) => {
    const root = await storeRoot();
    await bindOnce(root);
    useFakeTimers();
    const fixture = await openServed(root);
    await connections[0]!.observing;
    connections[0]!.lose('end');
    outcomes.push(refusal);
    await expectAttemptAfter(2000);
    await until(() => fixture.onError.mock.calls.length === 1);
    expect(fixture.onError).toHaveBeenCalledWith(expect.objectContaining({ message: code }));
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(connects).toHaveBeenCalledTimes(2);
    await expect(fixture.client.get(machine)).resolves.toMatchObject({ freshness: 'stale' });
    vi.useRealTimers();
    await fixture.close();

    // The same refusal at the next start is not retried either.
    outcomes.push(refusal);
    useFakeTimers();
    const restarted = await openSupervised(root);
    expect(restarted.onError).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ message: code }));
    expect(vi.getTimerCount()).toBe(0);
    await restarted.close();
  });

  it('should cancel a pending retry and abandon an attempt in flight when the host closes', async () => {
    const root = await storeRoot();
    await bindOnce(root);
    outcomes.push(new Error('FIXTURE_OFFLINE'));
    useFakeTimers();
    const pending = await openSupervised(root);
    expect(vi.getTimerCount()).toBe(1);
    await pending.close();
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(connects).toHaveBeenCalledOnce();

    outcomes.push(new Error('FIXTURE_OFFLINE'), 'hang');
    const inFlight = await openSupervised(root);
    await expectAttemptAfter(2000);
    const [signal] = connects.mock.lastCall!;
    expect(signal.aborted).toBe(false);
    await inFlight.close();
    expect(signal.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    expect(inFlight.onError).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ message: 'FIXTURE_OFFLINE' }));
  });

  it('should never retry a removed binding and abandon its attempt in flight', async () => {
    const root = await storeRoot();
    await bindOnce(root);
    outcomes.push(new Error('FIXTURE_OFFLINE'), 'hang');
    useFakeTimers();
    const fixture = await openSupervised(root);
    await expectAttemptAfter(2000);
    const [signal] = connects.mock.lastCall!;
    await expect(fixture.host.removeBinding(machine)).resolves.toEqual({
      status: 'removed',
      ...machine,
    });
    expect(signal.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(connects).toHaveBeenCalledTimes(2);
    await fixture.close();
  });

  it('should never re-send a start whose reply was lost with the dropped session', async () => {
    submit.mockReset();
    const root = await storeRoot();
    await bindOnce(root);
    useFakeTimers();
    const fixture = await openServed(root);
    const [first] = connections;
    await first!.observing;
    const prepared = await fixture.client.preparePrint({ ...machine, artifact: printArtifact, configuration: {} });
    await expect(
      fixture.client.uploadPrint({
        ...machine,
        preparedId: prepared.preparedId,
        preparedDigest: prepared.preparedDigest,
        operationId: 'upload-1',
      }),
    ).resolves.toMatchObject({ status: 'accepted', evidence: { transferId: 'transfer-upload-1' } });
    const reply = Promise.withResolvers<MachineSubmissionReceipt>();
    submit.mockImplementationOnce(async () => reply.promise);
    const starting = fixture.client.startPrint({
      ...machine,
      preparedId: prepared.preparedId,
      preparedDigest: prepared.preparedDigest,
      transferId: 'transfer-upload-1',
      expectedSetupDigest: prepared.setupDigest,
      operationId: 'start-1',
    });
    await until(() => submit.mock.calls.length === 1);
    // The connection drops while the start is out; the new session waits until the start settles.
    first!.lose('disconnected');
    await expectAttemptAfter(2000);
    await vi.advanceTimersByTimeAsync(0);
    expect(observed).toHaveBeenCalledOnce();
    reply.resolve({ status: 'unknown', reason: 'reply-lost-after-possible-acceptance', observedAt });
    await expect(starting).resolves.toMatchObject({ operationId: 'start-1', status: 'unknown' });
    await connections[1]!.observing;
    await expect(fixture.client.get(machine)).resolves.toMatchObject({
      freshness: 'current',
      snapshot: { connection: 'connected' },
    });
    // The outcome stays unknown until the printer can say; nothing is sent again.
    await expect(fixture.client.reconcileOperation({ ...machine, operationId: 'start-1' })).resolves.toMatchObject({
      status: 'unknown',
    });
    expect(submit).toHaveBeenCalledOnce();
    vi.useRealTimers();
    await fixture.close();
    const operationsLog = await readFile(join(root, 'workshop-x1c', 'operations.jsonl'), 'utf8');
    const sendings = operationsLog
      .split('\n')
      .filter((line) => line.includes('"type":"machine-effect-sending"') && line.includes('"operationId":"start-1"'));
    expect(sendings).toHaveLength(1);
  });
});
