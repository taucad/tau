import { chmod, cp, mkdir, mkdtemp, readFile, readdir, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MessageChannel } from 'node:worker_threads';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { CacheValue, ContentDigest } from '@taucad/cache-core';
import { cloneBoundedJson } from '@taucad/parameters/json';

import { createHostAdmissionAuthority, hostAdmissionOperations } from '#host/host-admission.js';
import type { HostActor, HostRouteGrant } from '#host/host-admission.js';
import { createNodeMachineEventLog } from '#host/node-machine-event-log.js';
import { parseJournalEvent } from '#host/node-machine-operations.js';
import { openNodeMachineStore } from '#host/node-machine-store.js';
import { createNodeMachineHost, MachineHostStartInFlightError } from '#host/node.js';
import type { NodeMachineHost, NodeMachineRuntime } from '#host/node.js';
import { connectMachineChannel } from '#machines/machine-channel.js';
import type { MachineChannelClient, MachineChannelHostOperations } from '#machines/machine-channel.js';
import { machineCredentialReference } from '#machines/machine-credential.js';
import type { MachineApplyActionInput } from '#machines/machine-client.js';
import type { MachineResolveJobInput } from '#machines/machine-jobs.js';
import type { MachineObservation, MachineRun } from '#machines/machine-observation.js';
import { machineManifestDefinitionFixture } from '#machines/machine-manifest.fixture.js';
import { isSimulatedMachine } from '#machines/machine-manifest.js';
import {
  fixtureDescriptor,
  fixtureObservation,
  fixtureProvider,
  fixtureReport,
  fixtureSession,
} from '#machines/machine-session.fixture.js';
import type { FixtureSessionBehavior } from '#machines/machine-session.fixture.js';
import type {
  MachineArtifactReference,
  MachineCandidate,
  MachineCommandReceipt,
  MachineJobCapability,
  MachineManifestDefinition,
  MachinePreparation,
  MachineProviderDescriptor,
  MachineProviderHold,
  MachineSession,
  MachineStill,
} from '#machines/machine.js';

/** Machine directories whose journal refuses every append, as a full log or a failing disk would. */
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

/** A journal writer as a host left one; the fixture owns no lock. */
const journalAt = async (directory: string, fileName = 'journal.jsonl') =>
  createNodeMachineEventLog({
    directory,
    fileName,
    owner: {
      assertCurrent() {
        /* No host owns the store while the fixture writes. */
      },
    },
    parse: plainJson,
  });

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
  checkJob: unavailable,
  requestJob: unavailable,
  listJobs: unavailable,
  async *watchJobs() {
    yield await unavailable();
  },
  resolveJob: unavailable,
  withdrawJob: unavailable,
  applyAction: unavailable,
  approveAction: unavailable,
  stop: unavailable,
  beginHold: unavailable,
  renewHold: unavailable,
  endHold: unavailable,
  reconcileOperation: unavailable,
  setTesting: unavailable,
  captureStill: unavailable,
};
const observedAt = '2026-09-14T00:00:00.000Z';
const expiresAt = '2026-09-14T00:01:00.000Z';
const machineId = 'workshop-x1c';
const agent = { kind: 'agent', id: 'agent-1', label: 'Tau agent' } as const;
const operator = { kind: 'user', id: 'operator', label: 'Operator' } as const;
const agentActor: HostActor = { kind: 'agent', id: 'agent-1' };
const allGrants: readonly HostRouteGrant[] = hostAdmissionOperations
  .filter((operation) => operation.startsWith('machines.'))
  .map((operation) => ({ route: 'machines', operation }));

const candidateFor = (id: string, serial?: string): MachineCandidate => ({
  id,
  name: `Printer ${id}`,
  endpoint: { transport: 'network', address: `${id}.local`, interface: 'manual' },
  claimedIdentity: serial === undefined ? { model: 'X1C' } : { serial, model: 'X1C' },
  observedAt,
  expiresAt,
});
const candidateA = candidateFor('candidate-a', 'physical-1');
const candidateB = candidateFor('candidate-b', 'physical-1');

const artifact: MachineArtifactReference = {
  projectId: 'proj_0123456789abcdefghijK',
  path: '.tau/artifacts/3333/part.gcode',
  digest: `sha256:${'3'.repeat(64)}` as ContentDigest,
  length: 128,
  mediaType: 'text/x.gcode',
  contract: { id: 'fixture.gcode', version: 1 },
  selectedMember: 'part.gcode',
};

/** The light the fixture's agent may switch unattended. */
const lightOn = (
  capabilityRevision: string,
  operationId: string,
  overrides: Partial<MachineApplyActionInput> = {},
): MachineApplyActionInput => ({
  machineId,
  componentId: 'chamber-light',
  capabilityRevision,
  operationId,
  action: 'switch.set',
  version: 1,
  expectedRunId: null,
  parameters: { on: true },
  requestedBy: agent,
  ...overrides,
});

/** Reports a test pushes to every session that observes; each session idles until its signal aborts. */
const reportFeed = () => {
  const queue: MachineObservation[] = [];
  let wake = Promise.withResolvers<void>();
  return {
    push(...observations: MachineObservation[]): void {
      queue.push(...observations);
      wake.resolve();
    },
    async *observe({ signal }: Readonly<{ signal: AbortSignal }>): AsyncGenerator<MachineObservation> {
      const onAbort = (): void => {
        wake.resolve();
      };
      signal.addEventListener('abort', onAbort, { once: true });
      try {
        while (!signal.aborted) {
          const next = queue.shift();
          if (next) {
            yield next;
            continue;
          }
          // oxlint-disable-next-line eslint/no-await-in-loop -- the feed waits for each next report.
          await wake.promise;
          wake = Promise.withResolvers();
        }
      } finally {
        signal.removeEventListener('abort', onAbort);
      }
    },
  };
};

const readyPreparation = (input: Readonly<{ operationId: string }>, setup: CacheValue): MachinePreparation => ({
  status: 'ready',
  program: { name: 'part.gcode', facts: { process: 'fff', layers: 120 } },
  checks: [{ id: 'plate', label: 'Plate', state: 'passed', source: 'observed' }],
  setup,
  remoteName: `tau-${input.operationId}.gcode`,
  parser: { id: 'fixture-parser', version: '1' },
  providerData: { memberMd5: 'fixture' },
  observedAt,
});

/** A stored-delivery jobs facet whose calls a test counts. */
const storedJobs = () => {
  const prepare = vi.fn(async (input: Readonly<{ operationId: string }>) =>
    readyPreparation(input, { plate: 'smooth' }),
  );
  const transfer = vi.fn(
    async (input: Readonly<{ operationId: string }>): Promise<MachineCommandReceipt> => ({
      status: 'accepted',
      transferId: `transfer-${input.operationId}`,
      observedAt,
    }),
  );
  const start = vi.fn(
    async (input: Readonly<{ operationId: string }>): Promise<MachineCommandReceipt> => ({
      status: 'accepted',
      runId: `run-${input.operationId}`,
      observedAt,
    }),
  );
  const facet: MachineJobCapability<unknown> = { type: 'supported', delivery: 'stored', prepare, transfer, start };
  return { facet, prepare, transfer, start };
};

const runtimeAt = (clock: () => string, extra: Partial<NodeMachineRuntime> = {}): NodeMachineRuntime => ({
  discovery: {
    clock: { now: clock },
    async *listenDatagrams() {
      yield* [];
    },
  },
  connection: () => ({
    clock: { now: clock },
    log: async () => undefined,
    connectStream: async () => {
      throw new Error('fixture does not open sockets');
    },
    async *readArtifact() {
      yield* [];
    },
    resolveSecret: async () => 'credential-must-not-be-serialized',
  }),
  ...extra,
});

/** A fixture provider whose printers answer with `session`; `connects` sees each connect. */
const bindingProvider = (
  session: (candidate: MachineCandidate, signal: AbortSignal) => Promise<MachineSession> | MachineSession,
  candidates: readonly MachineCandidate[] = [candidateA, candidateB],
) =>
  fixtureProvider({
    id: 'binding-provider',
    candidates,
    async connect({ candidate, signal }) {
      return session(candidate, signal);
    },
  });

type Provider = ReturnType<typeof bindingProvider>;

/** A host on `root` with one operator channel and, on request, more channels for other actors. */
const openServedHost = async (root: string, provider: Provider, runtime: NodeMachineRuntime) => {
  const admission = createHostAdmissionAuthority({ hostId: 'host-1' });
  const onError = vi.fn();
  const host = await createNodeMachineHost({
    storeRoot: root,
    hostId: 'host-1',
    authorityId: 'authority-1',
    admission,
    providers: [provider],
    runtime,
    onError,
  });
  hosts.push(host);
  const clients: Array<() => void> = [];
  const serveAs = async (actor: HostActor, grants: readonly HostRouteGrant[] = allGrants) => {
    const ports = new MessageChannel();
    const server = host.serve({ port: ports.port1, session: host.issueSession({ actor, grants }) });
    const client = connectMachineChannel(ports.port2);
    clients.push(() => {
      client.close();
      server.dispose();
    });
    await client.ready;
    return client;
  };
  const client = await serveAs({ kind: 'user', id: 'operator' });
  const close = async (): Promise<void> => {
    for (const closeClient of clients.splice(0)) {
      closeClient();
    }
    await host.close();
    hosts.splice(hosts.indexOf(host), 1);
  };
  return { admission, host, client, onError, serveAs, close };
};

type Served = Awaited<ReturnType<typeof openServedHost>>;

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
  fixture: Pick<Served, 'client' | 'host'>,
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
const revisionOf = async (client: MachineChannelClient, id = machineId): Promise<string> => {
  const entry = await client.get({ machineId: id });
  return entry.descriptor.capabilities.revision;
};

describe.runIf(process.platform === 'darwin' || process.platform === 'linux')('createNodeMachineHost', () => {
  const openHost = async (root: string) => {
    const admission = createHostAdmissionAuthority({ hostId: 'host-1' });
    const host = await createNodeMachineHost({
      storeRoot: root,
      hostId: 'host-1',
      authorityId: 'authority-1',
      admission,
      providers: [fixtureProvider()],
      operations,
      onError: vi.fn(),
    });
    hosts.push(host);
    return { admission, host };
  };

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
    const connects = vi.fn();
    const captureStill = vi.fn(
      async (): Promise<MachineStill> => ({
        bytes: Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]),
        mediaType: 'image/jpeg',
        capturedAt: currentTimestamp(),
        expiresAt: new Date(currentTime + 15_000).toISOString(),
      }),
    );
    const provider = bindingProvider(() => {
      connects();
      return fixtureSession({ stillCapture: { type: 'supported', capture: captureStill } });
    });
    const runtime = runtimeAt(currentTimestamp);
    const first = await openServedHost(root, provider, runtime);
    const pinned = `sha256:${'1'.repeat(64)}` as ContentDigest;
    const ceremonyId = await beginCeremony(first.client, 'candidate-a', 'Workshop X1C');
    await expect(
      first.host.completeBinding({
        ceremonyId,
        secretRef: 'vault:bambu-x1c',
        serviceTrust: { mqtt: { type: 'pinned', digest: pinned }, camera: { type: 'pinned', digest: pinned } },
      }),
    ).resolves.toEqual({ status: 'bound', machineId });
    await vi.waitFor(async () => {
      await expect(first.client.list({})).resolves.toMatchObject({
        entries: [
          {
            machineId,
            name: 'Workshop X1C',
            freshness: 'current',
            descriptor: { id: 'physical-1', firmware: '01.00.00.00' },
            snapshot: { connection: 'connected', state: { status: 'ready' }, operations: [] },
          },
        ],
      });
    });
    const {
      entries: [entry],
    } = await first.client.list({});
    // The host derives the revision from what is installed and gives each session its own incarnation.
    expect(entry?.descriptor.capabilities.revision).toMatch(/^sha256:[0-9a-f]{64}$/u);
    expect(entry?.snapshot.components.find(({ group }) => group === 'accessories')).toMatchObject({
      validUntil: new Date(Date.parse(observedAt) + 15_000).toISOString(),
    });
    const beforeStill = await first.client.list({});
    await expect(first.client.captureStill({ machineId })).resolves.toMatchObject({
      mediaType: 'image/jpeg',
      capturedAt: observedAt,
    });
    /* The host's own refusal crosses the channel with its typed code. */
    await expect(first.client.captureStill({ machineId })).rejects.toMatchObject({
      code: 'MACHINE_STILL_RATE_LIMITED',
      message: 'MACHINE_STILL_RATE_LIMITED',
    });
    expect(captureStill).toHaveBeenCalledOnce();
    currentTime += 5000;
    captureStill.mockRejectedValueOnce(new Error('BAMBU_CAMERA_UNAVAILABLE'));
    await expect(first.client.captureStill({ machineId })).rejects.toThrow('BAMBU_CAMERA_UNAVAILABLE');
    currentTime += 5000;
    captureStill.mockResolvedValueOnce({
      bytes: Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]),
      mediaType: 'image/jpeg',
      capturedAt: currentTimestamp(),
      expiresAt: currentTimestamp(),
    });
    await expect(first.client.captureStill({ machineId })).rejects.toMatchObject({ code: 'MACHINE_STILL_INVALID' });
    expect(await first.client.list({})).toEqual(beforeStill);
    currentTime = Date.parse(observedAt);

    const secondCeremony = await beginCeremony(first.client, 'candidate-b', 'duplicate-x1c');
    await expect(
      first.host.completeBinding({
        ceremonyId: secondCeremony,
        secretRef: 'vault:bambu-x1c',
        serviceTrust: { mqtt: { type: 'pinned', digest: pinned } },
      }),
    ).rejects.toThrow('NODE_MACHINE_HOST_PHYSICAL_IDENTITY_CONFLICT');
    await first.close();

    // The refused binding left nothing behind; the bound printer is one directory of plain files.
    expect(await sortedEntries(root)).toEqual(['authority', 'store.json', machineId]);
    const machine = join(root, machineId);
    const { mode } = await stat(join(machine, 'journal.jsonl'));
    // oxlint-disable-next-line eslint/no-bitwise -- POSIX permission bits are a bit mask.
    expect(mode & 0o777).toBe(0o600);
    expect(JSON.parse(await readFile(join(machine, 'machine.json'), 'utf8'))).toMatchObject({
      version: 2,
      id: machineId,
      name: 'Workshop X1C',
      providerId: 'binding-provider',
      physicalId: 'physical-1',
      connection: { secretRef: 'vault:bambu-x1c', serviceTrust: { mqtt: { type: 'pinned', digest: pinned } } },
      last: { descriptor: { id: 'physical-1' } },
    });
    for (const file of await storeFiles(root)) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- each store file is checked on its own.
      expect(await readFile(file, 'utf8'), file).not.toContain('credential-must-not-be-serialized');
    }

    connects.mockClear();
    const second = await openServedHost(root, provider, runtime);
    expect(connects).toHaveBeenCalledOnce();
    await vi.waitFor(async () => {
      await expect(second.client.list({})).resolves.toMatchObject({
        entries: [{ machineId, name: 'Workshop X1C', freshness: 'current' }],
      });
    });
    // Same installation, same revision; a new session, a new incarnation.
    const {
      entries: [reconnected],
    } = await second.client.list({});
    expect(reconnected?.descriptor.capabilities.revision).toBe(entry?.descriptor.capabilities.revision);
    expect(reconnected?.descriptor.capabilities.incarnation).not.toBe(entry?.descriptor.capabilities.incarnation);
    await second.close();
  });
});

describe.runIf(process.platform === 'darwin' || process.platform === 'linux')('actions, holds and stop', () => {
  const currentTime = { value: Date.parse(observedAt) };
  const currentTimestamp = (): string => new Date(currentTime.value).toISOString();

  afterEach(() => {
    currentTime.value = Date.parse(observedAt);
  });

  /** Bind one printer whose session behaves as `behavior` says. */
  const boundPrinter = async (behavior: FixtureSessionBehavior = {}, root?: string) => {
    const directory = root ?? (await storeRoot());
    const provider = bindingProvider(() => fixtureSession(behavior));
    const fixture = await openServedHost(directory, provider, runtimeAt(currentTimestamp));
    await bindAs(fixture, { candidateId: 'candidate-a', name: machineId, secretRef: 'vault:x1c' });
    return { ...fixture, root: directory, provider, revision: await revisionOf(fixture.client) };
  };

  it("should let an agent switch the light unattended, once per operation id, and settle it from the printer's reports", async () => {
    let isOn = false;
    const apply = vi.fn(async (): Promise<MachineCommandReceipt> => ({ status: 'accepted', observedAt }));
    const fixture = await boundPrinter({
      actions: {
        type: 'supported',
        apply,
        confirm: () => (isOn ? { status: 'confirmed' } : { status: 'pending' }),
      },
    });
    const agentClient = await fixture.serveAs(agentActor);
    const receipt = await agentClient.applyAction(lightOn(fixture.revision, 'light-1'));
    expect(receipt).toMatchObject({ operationId: 'light-1', machineId, kind: 'action', status: 'accepted' });
    expect(apply).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ operationId: 'light-1', componentId: 'chamber-light', parameters: { on: true } }),
    );
    // Accepted by the printer, not yet shown by it: the operation waits for the printer's own report.
    await expect(fixture.client.reconcileOperation({ machineId, operationId: 'light-1' })).resolves.toMatchObject({
      state: 'confirming',
      kind: 'action',
    });
    await expect(agentClient.applyAction(lightOn(fixture.revision, 'light-1'))).resolves.toEqual(receipt);
    await expect(
      agentClient.applyAction(lightOn(fixture.revision, 'light-1', { parameters: { on: false } })),
    ).resolves.toMatchObject({ status: 'rejected', code: 'MACHINE_OPERATION_ID_CONFLICT' });
    expect(apply).toHaveBeenCalledOnce();

    isOn = true;
    await expect(fixture.client.reconcileOperation({ machineId, operationId: 'light-1' })).resolves.toMatchObject({
      state: 'accepted',
      requestedBy: agent,
      action: { componentId: 'chamber-light', id: 'switch.set', label: 'Chamber light' },
    });
    await expect(fixture.client.get({ machineId })).resolves.toMatchObject({
      snapshot: { operations: [{ operationId: 'light-1', state: 'accepted', kind: 'action' }] },
    });
    // The session says who asks: an agent naming a person is still recorded, and told to the printer, as the agent.
    await agentClient.applyAction(lightOn(fixture.revision, 'light-2', { requestedBy: operator }));
    expect(apply).toHaveBeenLastCalledWith(expect.objectContaining({ requestedBy: { kind: 'agent' } }));
    isOn = true;
    await expect(fixture.client.reconcileOperation({ machineId, operationId: 'light-2' })).resolves.toMatchObject({
      requestedBy: { kind: 'agent', id: 'agent-1', label: 'Operator' },
    });
    await fixture.close();
    const journal = await readFile(join(fixture.root, machineId, 'journal.jsonl'), 'utf8');
    expect(journal.indexOf('machine-operation-planned')).toBeLessThan(journal.indexOf('machine-operation-sending'));
    expect(journal.indexOf('machine-operation-sending')).toBeLessThan(journal.indexOf('machine-operation-result'));
    // One confirmation per operation (light-1, light-2).
    expect(journal.match(/"source":"confirmation"/gu)).toHaveLength(2);
  });

  it('should refuse a changed revision, an unknown version, invalid values and an agent at the machine, sending nothing', async () => {
    const apply = vi.fn(async (): Promise<MachineCommandReceipt> => ({ status: 'accepted', observedAt }));
    const fixture = await boundPrinter({
      actions: { type: 'supported', apply, confirm: () => ({ status: 'confirmed' }) },
    });
    const agentClient = await fixture.serveAs(agentActor);
    await expect(agentClient.applyAction(lightOn('sha256:stale', 'light-1'))).resolves.toMatchObject({
      status: 'rejected',
      code: 'MACHINE_ACTION_CAPABILITIES_CHANGED',
    });
    await expect(agentClient.applyAction(lightOn(fixture.revision, 'light-2', { version: 2 }))).resolves.toMatchObject({
      status: 'rejected',
      code: 'MACHINE_ACTION_VERSION_UNSUPPORTED',
    });
    await expect(
      agentClient.applyAction(lightOn(fixture.revision, 'light-3', { parameters: { on: 'yes' } })),
    ).resolves.toMatchObject({
      status: 'rejected',
      code: 'MACHINE_ACTION_PARAMETERS_INVALID',
      issues: [{ path: 'on' }],
    });
    await expect(
      agentClient.applyAction(lightOn(fixture.revision, 'light-4', { attended: true })),
    ).resolves.toMatchObject({ status: 'rejected', code: 'MACHINE_ACTION_PERSON_REQUIRED' });
    await expect(
      agentClient.applyAction(lightOn(fixture.revision, 'light-5', { componentId: 'laser' })),
    ).resolves.toMatchObject({ status: 'rejected', code: 'MACHINE_ACTION_UNDECLARED' });
    expect(apply).not.toHaveBeenCalled();
    // A refusal is an answer, not an operation: nothing was journaled under its id.
    await expect(fixture.client.reconcileOperation({ machineId, operationId: 'light-1' })).rejects.toThrow(
      'MACHINE_OPERATION_UNKNOWN',
    );
    await fixture.close();
  });

  it('should let only a person at the machine try a control in testing, and keep testing with the binding', async () => {
    const apply = vi.fn(async (): Promise<MachineCommandReceipt> => ({ status: 'accepted', observedAt }));
    const fixture = await boundPrinter({
      actions: { type: 'supported', apply, confirm: () => ({ status: 'confirmed' }) },
    });
    const agentClient = await fixture.serveAs(agentActor);
    const home = (operationId: string, overrides: Partial<MachineApplyActionInput> = {}): MachineApplyActionInput => ({
      ...lightOn(fixture.revision, operationId),
      componentId: 'motion',
      action: 'motion.home',
      parameters: {},
      requestedBy: operator,
      ...overrides,
    });
    await expect(fixture.client.applyAction(home('home-1', { attended: true }))).resolves.toMatchObject({
      status: 'rejected',
      code: 'MACHINE_ACTION_UNQUALIFIED',
    });
    await expect(agentClient.setTesting({ machineId, enabled: true, requestedBy: agent })).rejects.toThrow(
      'Only a person can let untested controls be tried.',
    );
    await expect(fixture.client.setTesting({ machineId, enabled: true, requestedBy: operator })).resolves.toMatchObject(
      { machineId, testing: true },
    );
    expect(JSON.parse(await readFile(join(fixture.root, machineId, 'machine.json'), 'utf8'))).toMatchObject({
      testing: true,
    });
    await expect(fixture.client.applyAction(home('home-2'))).resolves.toMatchObject({
      status: 'rejected',
      code: 'MACHINE_ACTION_ATTENDANCE_REQUIRED',
    });
    // Testing is the person's: an agent still sees the control as unqualified.
    await expect(agentClient.applyAction(home('home-3', { requestedBy: agent }))).resolves.toMatchObject({
      status: 'rejected',
      code: 'MACHINE_ACTION_UNQUALIFIED',
    });
    await expect(fixture.client.applyAction(home('home-4', { attended: true }))).resolves.toMatchObject({
      status: 'accepted',
    });
    await expect(fixture.client.reconcileOperation({ machineId, operationId: 'home-4' })).resolves.toMatchObject({
      state: 'accepted',
      attended: true,
    });
    expect(apply).toHaveBeenCalledOnce();
    await fixture.close();

    const restarted = await openServedHost(fixture.root, fixture.provider, runtimeAt(currentTimestamp));
    await vi.waitFor(async () => {
      await expect(restarted.client.get({ machineId })).resolves.toMatchObject({ freshness: 'current', testing: true });
    });
    await restarted.client.setTesting({ machineId, enabled: false, requestedBy: operator });
    await expect(restarted.client.get({ machineId })).resolves.not.toHaveProperty('testing');
    await restarted.close();
  });

  it("should send an agent's request that needs approval only once a person approved exactly that operation", async () => {
    const run: MachineRun = {
      runId: 'run-1',
      origin: 'tau',
      delivery: 'stored',
      state: 'running',
      progress: { basis: 'executed', counters: [] },
    };
    const apply = vi.fn(async (): Promise<MachineCommandReceipt> => ({ status: 'accepted', observedAt }));
    const feed = reportFeed();
    const fixture = await boundPrinter({
      getSnapshot: async () => fixtureReport({ state: { status: 'active' }, run }),
      observe: feed.observe,
      actions: { type: 'supported', apply, confirm: () => ({ status: 'confirmed' }) },
    });
    const agentClient = await fixture.serveAs(agentActor);
    const cancel = (operationId: string): MachineApplyActionInput => ({
      ...lightOn(fixture.revision, operationId),
      componentId: 'controller',
      action: 'run.cancel',
      expectedRunId: 'run-1',
      parameters: {},
    });
    const decide = async (
      client: MachineChannelClient,
      operationId: string,
      {
        decision = 'approve',
        parameters = {},
        action = 'run.cancel',
      }: Readonly<{ decision?: 'approve' | 'deny'; parameters?: unknown; action?: string }> = {},
    ) =>
      client.approveAction({
        machineId,
        operationId,
        intent: { componentId: 'controller', action, version: 1, expectedRunId: 'run-1', parameters },
        decision,
        approvedBy: operator,
      });
    const refused = { status: 'rejected', code: 'MACHINE_ACTION_APPROVAL_REQUIRED' } as const;
    await expect(agentClient.applyAction(cancel('cancel-1'))).resolves.toMatchObject(refused);
    // An agent approves nothing, its own request or another's.
    await expect(decide(agentClient, 'cancel-1')).resolves.toMatchObject({
      status: 'refused',
      code: 'MACHINE_ACTION_PERSON_REQUIRED',
    });
    // Nothing is recorded for a control an agent could never send, approved or not.
    await expect(decide(fixture.client, 'home-1', { action: 'motion.home' })).resolves.toMatchObject({
      status: 'refused',
    });
    await expect(agentClient.applyAction(cancel('cancel-1'))).resolves.toMatchObject(refused);
    // An approval of other values admits nothing, and is not used up by the attempt.
    await decide(fixture.client, 'cancel-1', { parameters: { reason: 'other' } });
    await expect(agentClient.applyAction(cancel('cancel-1'))).resolves.toMatchObject({
      ...refused,
      message: 'The approval of “Cancel” was for other values. Ask a person again.',
    });
    // An approval waits ten minutes, no longer.
    await decide(fixture.client, 'cancel-2');
    currentTime.value += 10 * 60_000;
    await expect(agentClient.applyAction(cancel('cancel-2'))).resolves.toMatchObject(refused);
    // A denial reaches the agent's next call.
    await expect(decide(fixture.client, 'cancel-3', { decision: 'deny' })).resolves.toEqual({
      status: 'denied',
      operationId: 'cancel-3',
    });
    await expect(agentClient.applyAction(cancel('cancel-3'))).resolves.toMatchObject({
      ...refused,
      message: 'A person declined “Cancel”.',
    });
    expect(apply).not.toHaveBeenCalled();

    await expect(decide(fixture.client, 'cancel-1')).resolves.toEqual({
      status: 'approved',
      operationId: 'cancel-1',
      expiresAt: new Date(currentTime.value + 10 * 60_000).toISOString(),
    });
    await expect(agentClient.applyAction(cancel('cancel-1'))).resolves.toMatchObject({ status: 'accepted' });
    // Confirmed by acknowledgement: accepted when the printer accepts. The record names who approved it.
    await expect(fixture.client.reconcileOperation({ machineId, operationId: 'cancel-1' })).resolves.toMatchObject({
      state: 'accepted',
      requestedBy: agent,
      approvedBy: operator,
    });
    // Used once: the next operation needs its own approval.
    await expect(agentClient.applyAction(cancel('cancel-4'))).resolves.toMatchObject(refused);
    // An approval is for the run the person saw: against the run that followed it admits nothing and stays unused.
    await decide(fixture.client, 'cancel-5');
    feed.push({
      type: 'snapshot',
      snapshot: fixtureReport({ state: { status: 'active' }, run: { ...run, runId: 'run-2' } }),
    });
    await vi.waitFor(async () => {
      await expect(fixture.client.get({ machineId })).resolves.toMatchObject({ snapshot: { run: { runId: 'run-2' } } });
    });
    await expect(agentClient.applyAction({ ...cancel('cancel-5'), expectedRunId: 'run-2' })).resolves.toMatchObject({
      ...refused,
      message: 'The approval of “Cancel” was for other values. Ask a person again.',
    });
    expect(apply).toHaveBeenCalledOnce();
    await fixture.close();
  });

  it("should record a person's denial of an agent's action even once the machine has disconnected", async () => {
    const run: MachineRun = {
      runId: 'run-1',
      origin: 'tau',
      delivery: 'stored',
      state: 'running',
      progress: { basis: 'executed', counters: [] },
    };
    const active = fixtureReport({ state: { status: 'active' }, run });
    const lose = Promise.withResolvers<void>();
    let isOffline = false;
    const provider = bindingProvider(() => {
      if (isOffline) {
        throw new Error('FIXTURE_OFFLINE');
      }
      return fixtureSession({
        getSnapshot: async () => active,
        async *observe() {
          yield { type: 'snapshot', snapshot: active };
          await lose.promise;
        },
      });
    });
    const fixture = await openServedHost(await storeRoot(), provider, runtimeAt(currentTimestamp));
    await bindAs(fixture, { candidateId: 'candidate-a', name: machineId, secretRef: 'vault:x1c' });
    isOffline = true;
    lose.resolve();
    await vi.waitFor(async () => {
      await expect(fixture.client.get({ machineId })).resolves.not.toMatchObject({ freshness: 'current' });
    });
    const decide = async (decision: 'approve' | 'deny') =>
      fixture.client.approveAction({
        machineId,
        operationId: 'cancel-1',
        intent: { componentId: 'controller', action: 'run.cancel', version: 1, expectedRunId: 'run-1', parameters: {} },
        decision,
        approvedBy: operator,
      });
    // Nothing is approved that the machine could not take now; a denial admits nothing, so it is always recorded.
    await expect(decide('approve')).resolves.toMatchObject({ status: 'refused', code: 'MACHINE_UNAVAILABLE' });
    await expect(decide('deny')).resolves.toEqual({ status: 'denied', operationId: 'cancel-1' });
    await fixture.close();
  });

  it("should keep a person's approval when the action it admits is refused before it is journaled", async () => {
    const run: MachineRun = {
      runId: 'run-1',
      origin: 'tau',
      delivery: 'stored',
      state: 'running',
      progress: { basis: 'executed', counters: [] },
    };
    // Declared by the manifest, but this session cannot apply actions: refused after admission, nothing journaled.
    const fixture = await boundPrinter({
      getSnapshot: async () => fixtureReport({ state: { status: 'active' }, run }),
      actions: { type: 'unsupported' },
    });
    const agentClient = await fixture.serveAs(agentActor);
    const cancel: MachineApplyActionInput = {
      ...lightOn(fixture.revision, 'cancel-1'),
      componentId: 'controller',
      action: 'run.cancel',
      expectedRunId: 'run-1',
      parameters: {},
    };
    await fixture.client.approveAction({
      machineId,
      operationId: 'cancel-1',
      intent: { componentId: 'controller', action: 'run.cancel', version: 1, expectedRunId: 'run-1', parameters: {} },
      decision: 'approve',
      approvedBy: operator,
    });
    const unsupported = { status: 'rejected', code: 'MACHINE_ACTION_UNSUPPORTED' } as const;
    await expect(agentClient.applyAction(cancel)).resolves.toMatchObject(unsupported);
    await expect(agentClient.applyAction(cancel)).resolves.toMatchObject(unsupported);
    await fixture.close();
  });

  it('should keep an unproven reply confirming, ask for attention after 180 s and settle on later proof without resending', async () => {
    let isProven = false;
    const apply = vi.fn(
      async (): Promise<MachineCommandReceipt> => ({ status: 'unknown', reason: 'reply lost', observedAt }),
    );
    const fixture = await boundPrinter({
      actions: {
        type: 'supported',
        apply,
        confirm: () => (isProven ? { status: 'confirmed' } : { status: 'pending' }),
      },
    });
    await expect(
      fixture.client.applyAction(lightOn(fixture.revision, 'light-1', { requestedBy: operator })),
    ).resolves.toMatchObject({ status: 'unknown' });
    await expect(fixture.client.reconcileOperation({ machineId, operationId: 'light-1' })).resolves.toMatchObject({
      state: 'confirming',
      confirmingSince: observedAt,
    });
    currentTime.value += 179_000;
    await expect(fixture.client.reconcileOperation({ machineId, operationId: 'light-1' })).resolves.toMatchObject({
      state: 'confirming',
    });
    currentTime.value += 1000;
    await expect(fixture.client.reconcileOperation({ machineId, operationId: 'light-1' })).resolves.toMatchObject({
      state: 'attention',
    });
    isProven = true;
    await expect(fixture.client.reconcileOperation({ machineId, operationId: 'light-1' })).resolves.toMatchObject({
      state: 'accepted',
      receipt: { status: 'accepted' },
    });
    await expect(
      fixture.client.applyAction(lightOn(fixture.revision, 'light-1', { requestedBy: operator })),
    ).resolves.toMatchObject({ status: 'accepted' });
    expect(apply).toHaveBeenCalledOnce();
    await fixture.close();
  });

  it('should stop for anyone, ahead of the queue, and end every hold', async () => {
    const stop = vi.fn(async (): Promise<MachineCommandReceipt> => ({ status: 'accepted', observedAt }));
    const release = vi.fn(async (): Promise<MachineCommandReceipt> => ({ status: 'accepted', observedAt }));
    const fixture = await boundPrinter({
      stop,
      holds: {
        type: 'supported',
        begin: async (): Promise<MachineProviderHold> => ({ extend: async () => undefined, release }),
      },
    });
    const agentClient = await fixture.serveAs(agentActor);
    await expect(
      fixture.client.beginHold({
        machineId,
        componentId: 'motion',
        capabilityRevision: fixture.revision,
        operationId: 'jog-1',
        hold: 'motion.jog',
        version: 1,
        parameters: { axis: 'x', direction: 1, feed: 600 },
        requestedBy: operator,
        attended: true,
      }),
    ).resolves.toEqual({ status: 'held', holdId: 'jog-1', lease: 200 });
    await expect(agentClient.stop({ machineId, operationId: 'stop-1', requestedBy: agent })).resolves.toMatchObject({
      operationId: 'stop-1',
      kind: 'stop',
      status: 'accepted',
    });
    expect(stop).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ operationId: 'stop-1' }));
    expect(release).toHaveBeenCalledOnce();
    await expect(fixture.client.renewHold({ holdId: 'jog-1' })).resolves.toEqual({ status: 'ended' });
    await expect(fixture.client.reconcileOperation({ machineId, operationId: 'stop-1' })).resolves.toMatchObject({
      state: 'accepted',
      kind: 'stop',
    });
    // A stop the machine took is not sent twice under its id.
    await expect(agentClient.stop({ machineId, operationId: 'stop-1', requestedBy: agent })).resolves.toMatchObject({
      operationId: 'stop-1',
      status: 'accepted',
    });
    expect(stop).toHaveBeenCalledOnce();
    // A retried stop whose reply was lost, or an id used before for something else, is sent again under a fresh id.
    stop.mockResolvedValueOnce({ status: 'unknown', reason: 'reply lost', observedAt });
    await expect(
      fixture.client.stop({ machineId, operationId: 'stop-2', requestedBy: operator }),
    ).resolves.toMatchObject({ operationId: 'stop-2', status: 'unknown' });
    const retried = await fixture.client.stop({ machineId, operationId: 'stop-2', requestedBy: operator });
    expect(retried).toMatchObject({ kind: 'stop', status: 'accepted' });
    expect(retried.operationId).not.toBe('stop-2');
    await expect(
      fixture.client.stop({ machineId, operationId: 'jog-1', requestedBy: operator }),
    ).resolves.toMatchObject({ kind: 'stop', status: 'accepted' });
    expect(stop).toHaveBeenCalledTimes(4);
    // A machine that is not bound here is told nothing, and the answer says so.
    await expect(fixture.client.stop({ machineId: 'elsewhere', requestedBy: operator })).resolves.toMatchObject({
      status: 'rejected',
      code: 'MACHINE_UNAVAILABLE',
    });
    await fixture.close();
  });

  /** A jog the operator holds at the machine. */
  const jogOf = (capabilityRevision: string) =>
    ({
      machineId,
      componentId: 'motion',
      capabilityRevision,
      operationId: 'jog-1',
      hold: 'motion.jog',
      version: 1,
      parameters: { axis: 'x', direction: 1, feed: 600 },
      requestedBy: operator,
      attended: true,
    }) as const;

  it('should refuse a hold while the machine runs a program', async () => {
    const begin = vi.fn(
      async (): Promise<MachineProviderHold> => ({
        extend: async () => undefined,
        release: async () => ({ status: 'accepted', observedAt }),
      }),
    );
    const feed = reportFeed();
    const fixture = await boundPrinter({ holds: { type: 'supported', begin }, observe: feed.observe });
    feed.push({
      type: 'snapshot',
      snapshot: fixtureReport({
        state: { status: 'active' },
        run: {
          runId: 'run-1',
          origin: 'external',
          delivery: 'stored',
          state: 'running',
          progress: { basis: 'executed', counters: [] },
        },
      }),
    });
    await vi.waitFor(async () => {
      await expect(fixture.client.get({ machineId })).resolves.toMatchObject({
        snapshot: { state: { status: 'active' } },
      });
    });
    await expect(fixture.client.beginHold(jogOf(fixture.revision))).resolves.toMatchObject({
      status: 'rejected',
      code: 'MACHINE_ACTION_PRECONDITION_FAILED',
    });
    expect(begin).not.toHaveBeenCalled();
    await fixture.close();
  });

  it('should release a hold when the session that carried it is lost', async () => {
    const lose = Promise.withResolvers<void>();
    const release = vi.fn(async (): Promise<MachineCommandReceipt> => ({ status: 'accepted', observedAt }));
    const fixture = await boundPrinter({
      holds: { type: 'supported', begin: async () => ({ extend: async () => undefined, release }) },
      async *observe() {
        yield { type: 'snapshot', snapshot: fixtureReport() };
        await lose.promise;
      },
    });
    await expect(fixture.client.beginHold(jogOf(fixture.revision))).resolves.toMatchObject({ status: 'held' });
    lose.resolve();
    await vi.waitFor(() => {
      expect(release).toHaveBeenCalledOnce();
    });
    await expect(fixture.client.renewHold({ holdId: 'jog-1' })).resolves.toEqual({ status: 'ended' });
    await fixture.close();
  });

  it('should still stop, hold and apply actions while the host quiesces', async () => {
    const stop = vi.fn(async (): Promise<MachineCommandReceipt> => ({ status: 'accepted', observedAt }));
    const apply = vi.fn(async (): Promise<MachineCommandReceipt> => ({ status: 'accepted', observedAt }));
    const release = vi.fn(async (): Promise<MachineCommandReceipt> => ({ status: 'accepted', observedAt }));
    const fixture = await boundPrinter({
      stop,
      actions: { type: 'supported', apply, confirm: () => ({ status: 'confirmed' }) },
      holds: { type: 'supported', begin: async () => ({ extend: async () => undefined, release }) },
    });
    const resume = await fixture.host.quiesce();
    await expect(
      fixture.client.applyAction(lightOn(fixture.revision, 'light-1', { requestedBy: operator })),
    ).resolves.toMatchObject({ status: 'accepted' });
    await expect(fixture.client.beginHold(jogOf(fixture.revision))).resolves.toMatchObject({ status: 'held' });
    await expect(
      fixture.client.stop({ machineId, operationId: 'stop-1', requestedBy: operator }),
    ).resolves.toMatchObject({ kind: 'stop', status: 'accepted' });
    expect(apply).toHaveBeenCalledOnce();
    expect(stop).toHaveBeenCalledOnce();
    resume();
    await fixture.close();
  });

  it('should stop a printer whose journal refuses every write, and report the refusal', async () => {
    const stop = vi.fn(async (): Promise<MachineCommandReceipt> => ({ status: 'accepted', observedAt }));
    const first = await boundPrinter({ stop });
    await first.close();
    refusedAppends.add(join(await realpath(first.root), machineId));
    try {
      const fixture = await openServedHost(first.root, first.provider, runtimeAt(currentTimestamp));
      await vi.waitFor(async () => {
        await expect(fixture.client.get({ machineId })).resolves.toMatchObject({ freshness: 'current' });
      });
      await expect(
        fixture.client.stop({ machineId, operationId: 'stop-1', requestedBy: operator }),
      ).resolves.toMatchObject({ operationId: 'stop-1', kind: 'stop', status: 'accepted' });
      expect(stop).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ operationId: 'stop-1' }));
      expect(fixture.onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'FIXTURE_APPEND_REFUSED' }));
      await fixture.close();
    } finally {
      refusedAppends.clear();
    }
  });

  it('should end a hold whose lease lapses and refuse a hold from an agent', async () => {
    const extend = vi.fn(async () => undefined);
    const release = vi.fn(async (): Promise<MachineCommandReceipt> => ({ status: 'accepted', observedAt }));
    const begin = vi.fn(async (): Promise<MachineProviderHold> => ({ extend, release }));
    const fixture = await boundPrinter({ holds: { type: 'supported', begin } });
    const agentClient = await fixture.serveAs(agentActor);
    const jog = {
      machineId,
      componentId: 'motion',
      capabilityRevision: fixture.revision,
      operationId: 'jog-1',
      hold: 'motion.jog',
      version: 1,
      parameters: { axis: 'x', direction: 1, feed: 600 },
      requestedBy: operator,
      attended: true,
    } as const;
    await expect(agentClient.beginHold({ ...jog, operationId: 'jog-agent', requestedBy: agent })).resolves.toEqual({
      status: 'rejected',
      code: 'MACHINE_ACTION_PERSON_REQUIRED',
      message: 'Only a person at the machine can hold a control.',
    });
    const someoneElse = await fixture.serveAs({ kind: 'user', id: 'someone-else' });
    await expect(fixture.client.beginHold(jog)).resolves.toEqual({ status: 'held', holdId: 'jog-1', lease: 200 });
    // The first segment goes out with the hold, not a lease later.
    expect(extend).toHaveBeenCalledOnce();
    // The lease is its beginner's: another session's renewal, or an agent's, keeps nothing moving.
    await expect(someoneElse.renewHold({ holdId: 'jog-1' })).resolves.toEqual({ status: 'ended' });
    await expect(agentClient.renewHold({ holdId: 'jog-1' })).resolves.toEqual({ status: 'ended' });
    await expect(fixture.client.renewHold({ holdId: 'jog-1' })).resolves.toEqual({ status: 'held' });
    expect(extend).toHaveBeenCalledTimes(2);
    // No renewal within the lease: the host tells the printer to release.
    await vi.waitFor(() => {
      expect(release).toHaveBeenCalledOnce();
    });
    await expect(fixture.client.renewHold({ holdId: 'jog-1' })).resolves.toEqual({ status: 'ended' });
    await expect(fixture.client.endHold({ holdId: 'jog-1' })).resolves.toMatchObject({
      operationId: 'jog-1',
      kind: 'hold',
      status: 'accepted',
    });
    expect(begin).toHaveBeenCalledOnce();
    await fixture.close();
  });

  it('should recover an operation a crash left in flight as confirming and never send it again', async () => {
    const root = await storeRoot();
    const crash = join(await storeRoot(), 'store');
    const apply = vi.fn(async (): Promise<MachineCommandReceipt> => {
      // What a crash while the command is out leaves on disk.
      await cp(root, crash, { recursive: true });
      return { status: 'accepted', observedAt };
    });
    const behavior: FixtureSessionBehavior = {
      actions: { type: 'supported', apply, confirm: () => ({ status: 'pending' }) },
    };
    const fixture = await boundPrinter(behavior, root);
    await fixture.client.applyAction(lightOn(fixture.revision, 'light-1', { requestedBy: operator }));
    await fixture.close();
    apply.mockClear();

    const recovered = await openServedHost(crash, fixture.provider, runtimeAt(currentTimestamp));
    await expect(recovered.client.reconcileOperation({ machineId, operationId: 'light-1' })).resolves.toMatchObject({
      state: 'confirming',
      receipt: { status: 'unknown' },
    });
    await vi.waitFor(async () => {
      await expect(recovered.client.get({ machineId })).resolves.toMatchObject({ freshness: 'current' });
    });
    const revision = await revisionOf(recovered.client);
    await expect(
      recovered.client.applyAction(lightOn(revision, 'light-1', { requestedBy: operator })),
    ).resolves.toMatchObject({ status: 'unknown' });
    expect(apply).not.toHaveBeenCalled();
    await recovered.close();
    // The restart recorded that `unknown` durably, once: a second restart replays it and appends nothing.
    const journalPath = join(crash, machineId, 'journal.jsonl');
    const recorded = await readFile(journalPath, 'utf8');
    expect(recorded.match(/"source":"recovery"/gu)).toHaveLength(1);
    const again = await openServedHost(crash, fixture.provider, runtimeAt(currentTimestamp));
    await again.close();
    expect(await readFile(journalPath, 'utf8')).toBe(recorded);
  });
});

describe.runIf(process.platform === 'darwin' || process.platform === 'linux')('jobs', () => {
  const currentTime = { value: Date.parse(observedAt) };
  const currentTimestamp = (): string => new Date(currentTime.value).toISOString();

  afterEach(() => {
    currentTime.value = Date.parse(observedAt);
    vi.useRealTimers();
  });

  const boundPrinter = async (
    jobs: MachineJobCapability<unknown>,
    behavior: FixtureSessionBehavior = {},
    root?: string,
  ) => {
    const directory = root ?? (await storeRoot());
    const provider = bindingProvider(() => fixtureSession({ jobs, ...behavior }));
    const fixture = await openServedHost(directory, provider, runtimeAt(currentTimestamp));
    await bindAs(fixture, { candidateId: 'candidate-a', name: machineId, secretRef: 'vault:x1c' });
    return { ...fixture, root: directory, provider };
  };
  const request = async (client: MachineChannelClient, jobId: string, configuration: CacheValue = {}) => {
    currentTime.value += 1000;
    return client.requestJob({ jobId, machineId, artifact, configuration, requestedBy: agent });
  };
  const approve = async (client: MachineChannelClient, jobId: string, suffix = jobId) =>
    client.resolveJob({
      jobId,
      decision: 'approve',
      resolvedBy: operator,
      attestations: ['work-area-clear'],
      transferOperationId: `transfer-${suffix}`,
      startOperationId: `start-${suffix}`,
    });

  it('should prepare a job, ask a person to clear the plate, then transfer and start it once', async () => {
    const jobs = storedJobs();
    const feed = reportFeed();
    const fixture = await boundPrinter(jobs.facet, { observe: feed.observe });
    const agentClient = await fixture.serveAs(agentActor);

    const first = await request(agentClient, 'job-1');
    expect(first).toMatchObject({
      version: 1,
      jobId: 'job-1',
      machineId,
      state: 'awaiting-approval',
      requestedBy: agent,
      program: { name: 'part.gcode', facts: { process: 'fff', layers: 120 } },
      checks: [{ id: 'plate', state: 'passed' }],
      prepared: { machineId, physicalMachineId: 'physical-1', artifact },
    });
    await expect(request(agentClient, 'job-1')).resolves.toEqual(first);
    await expect(request(agentClient, 'job-1', { changed: true })).rejects.toThrow(
      'This job id was already used for another program.',
    );
    await expect(
      agentClient.requestJob({
        jobId: 'job-elsewhere',
        machineId: 'elsewhere',
        artifact,
        configuration: {},
        requestedBy: agent,
      }),
    ).rejects.toThrow('MACHINE_UNAVAILABLE');
    await expect(
      agentClient.resolveJob({
        jobId: 'job-1',
        decision: 'approve',
        resolvedBy: agent,
        attestations: ['work-area-clear'],
      }),
    ).rejects.toThrow('A person must approve this job in Tau.');
    await expect(
      fixture.client.resolveJob({ jobId: 'job-1', decision: 'approve', resolvedBy: operator }),
    ).rejects.toThrow('Confirm first: The plate is clear.');
    expect(jobs.transfer).not.toHaveBeenCalled();
    expect(jobs.start).not.toHaveBeenCalled();

    const started = await approve(fixture.client, 'job-1');
    expect(started).toMatchObject({
      state: 'started',
      resolvedBy: operator,
      attended: false,
      attestations: [{ id: 'work-area-clear', by: operator }],
      transferOperationId: 'transfer-job-1',
      startOperationId: 'start-job-1',
      transferId: 'transfer-transfer-job-1',
      receipt: { operationId: 'start-job-1', kind: 'start', status: 'accepted', runId: 'run-start-job-1' },
      run: { runId: 'run-start-job-1', outcome: 'running' },
    });
    expect(jobs.transfer).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ operationId: 'transfer-job-1', remoteName: first.prepared?.remoteName }),
    );
    expect(jobs.start).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ operationId: 'start-job-1', transferId: 'transfer-transfer-job-1' }),
    );
    await expect(approve(fixture.client, 'job-1')).resolves.toMatchObject({ state: 'started' });
    expect(jobs.start).toHaveBeenCalledOnce();

    await request(agentClient, 'job-2');
    // A job is the person's to resolve: an agent denies nothing either.
    await expect(agentClient.resolveJob({ jobId: 'job-2', decision: 'deny', resolvedBy: agent })).rejects.toThrow(
      'Only a person can deny a job.',
    );
    await expect(
      fixture.client.resolveJob({ jobId: 'job-2', decision: 'deny', resolvedBy: operator }),
    ).resolves.toMatchObject({ state: 'denied', resolvedBy: operator });
    await expect(agentClient.withdrawJob({ jobId: 'job-2', resolvedBy: agent })).rejects.toThrow(
      'MACHINE_JOB_NOT_AWAITING',
    );
    await request(agentClient, 'job-3');
    await expect(agentClient.withdrawJob({ jobId: 'job-3', resolvedBy: agent })).resolves.toMatchObject({
      state: 'withdrawn',
    });
    await expect(
      fixture.client.resolveJob({ jobId: 'missing', decision: 'approve', resolvedBy: operator }),
    ).rejects.toThrow('MACHINE_JOB_UNKNOWN');

    // The job keeps what became of its run after the printer reports it ended.
    feed.push({
      type: 'snapshot',
      snapshot: fixtureReport({
        run: {
          runId: 'run-start-job-1',
          jobId: 'job-1',
          origin: 'tau',
          delivery: 'stored',
          state: 'completed',
          endedAt: observedAt,
          progress: { basis: 'executed', fraction: 1, counters: [] },
        },
      }),
    });
    await vi.waitFor(async () => {
      const listed = await fixture.client.listJobs({});
      const latest = listed.at(-1);
      expect(latest).toMatchObject({ jobId: 'job-1', run: { runId: 'run-start-job-1', outcome: 'completed' } });
    });
    const listed = await fixture.client.listJobs({});
    expect(listed.map(({ jobId, state }) => `${jobId}:${state}`)).toEqual([
      'job-3:withdrawn',
      'job-2:denied',
      'job-1:started',
    ]);
    // Each job is one whole record in its machine's directory.
    expect(await sortedEntries(join(fixture.root, machineId, 'jobs'))).toEqual([
      'job-1.json',
      'job-2.json',
      'job-3.json',
    ]);
    expect(JSON.parse(await readFile(join(fixture.root, machineId, 'jobs', 'job-3.json'), 'utf8'))).toEqual(listed[0]);
    await fixture.close();
  });

  it('should start no job while the host quiesces, and fail one it refuses at its start so it is requested again', async () => {
    const jobs = storedJobs();
    const fixture = await boundPrinter(jobs.facet);
    await request(fixture.client, 'job-1');
    const resume = await fixture.host.quiesce();
    await expect(approve(fixture.client, 'job-1')).rejects.toThrow('Tau is closing and starts nothing new.');
    await expect(fixture.client.listJobs({})).resolves.toMatchObject([{ jobId: 'job-1', state: 'awaiting-approval' }]);
    resume();
    resume();
    // Quiescing that begins after the approval, while the program transfers, still refuses the start. Nothing starts,
    // and the job fails with a typed code rather than wait at `starting`, where no consumer offers a way forward.
    let quiescing: Promise<() => void> | undefined;
    jobs.transfer.mockImplementationOnce(async (input) => {
      quiescing = fixture.host.quiesce();
      return { status: 'accepted', transferId: `transfer-${input.operationId}`, observedAt };
    });
    await expect(approve(fixture.client, 'job-1')).resolves.toMatchObject({
      jobId: 'job-1',
      state: 'failed',
      failure: {
        code: 'MACHINE_HOST_CLOSING',
        message: 'Tau was closing, so the job did not start. Request it again.',
      },
    });
    expect(jobs.start).not.toHaveBeenCalled();
    // The quit is refused: Tau carries on, and the job requested again starts.
    (await quiescing)?.();
    await request(fixture.client, 'job-2');
    await expect(approve(fixture.client, 'job-2')).resolves.toMatchObject({ state: 'started' });
    expect(jobs.transfer).toHaveBeenCalledTimes(2);
    expect(jobs.start).toHaveBeenCalledOnce();
    // Nothing the refusal left holds the binding.
    await expect(fixture.client.removeBinding({ machineId })).resolves.toEqual({ status: 'removed', machineId });
    await fixture.close();
  });

  it('should settle quiescing only once every start already admitted has settled', async () => {
    const jobs = storedJobs();
    const fixture = await boundPrinter(jobs.facet);
    // Whether a promise settles within 50 ms of real time.
    const isSettled = async (promise: Promise<unknown>): Promise<boolean> => {
      const waited = Promise.withResolvers<boolean>();
      setTimeout(() => {
        waited.resolve(false);
      }, 50);
      const settled = async (): Promise<boolean> => {
        await promise;
        return true;
      };
      return Promise.race([settled(), waited.promise]);
    };
    // A start suspended in its last check (the provider's prepare) when quiescing begins is refused once it resumes.
    await request(fixture.client, 'job-1');
    const preparing = Promise.withResolvers<void>();
    const prepared = Promise.withResolvers<void>();
    jobs.prepare.mockImplementationOnce(async (input) => {
      preparing.resolve();
      await prepared.promise;
      return readyPreparation(input, { plate: 'smooth' });
    });
    const refused = approve(fixture.client, 'job-1');
    await preparing.promise;
    const quiesced = fixture.host.quiesce();
    await expect(isSettled(quiesced)).resolves.toBe(false);
    prepared.resolve();
    const resume = await quiesced;
    await expect(refused).resolves.toMatchObject({ state: 'failed', failure: { code: 'MACHINE_HOST_CLOSING' } });
    expect(jobs.start).not.toHaveBeenCalled();
    resume();
    // A start already sending when quiescing begins is waited for, so its run is known before quiescing settles.
    await request(fixture.client, 'job-2');
    const sending = Promise.withResolvers<void>();
    const sent = Promise.withResolvers<void>();
    jobs.start.mockImplementationOnce(async (input) => {
      sending.resolve();
      await sent.promise;
      return { status: 'accepted', runId: `run-${input.operationId}`, observedAt };
    });
    const started = approve(fixture.client, 'job-2');
    await sending.promise;
    const waiting = fixture.host.quiesce();
    await expect(isSettled(waiting)).resolves.toBe(false);
    sent.resolve();
    const resumeAfterStart = await waiting;
    await expect(fixture.client.listJobs({})).resolves.toContainEqual(
      expect.objectContaining({
        jobId: 'job-2',
        state: 'started',
        run: { runId: 'run-start-job-2', outcome: 'running' },
      }),
    );
    await expect(started).resolves.toMatchObject({ state: 'started' });
    resumeAfterStart();
    // Bounded: a start that does not settle in time fails quiescing, but its gate stays up until the launcher that
    // calls its close off resumes.
    await request(fixture.client, 'job-3');
    await request(fixture.client, 'job-4');
    const hanging = Promise.withResolvers<void>();
    const unhang = Promise.withResolvers<void>();
    jobs.start.mockImplementationOnce(async (input) => {
      hanging.resolve();
      await unhang.promise;
      return { status: 'accepted', runId: `run-${input.operationId}`, observedAt };
    });
    const third = approve(fixture.client, 'job-3');
    await hanging.promise;
    const timedOut = await fixture.host.quiesce({ startTimeout: 10 }).then(
      () => undefined,
      (error: unknown) => error,
    );
    expect(timedOut).toBeInstanceOf(MachineHostStartInFlightError);
    await expect(approve(fixture.client, 'job-4')).rejects.toThrow('Tau is closing and starts nothing new.');
    unhang.resolve();
    await expect(third).resolves.toMatchObject({ state: 'started' });
    if (timedOut instanceof MachineHostStartInFlightError) {
      timedOut.resume();
    }
    await expect(approve(fixture.client, 'job-4')).resolves.toMatchObject({ state: 'started' });
    await fixture.close();
  });

  it('should refuse to confirm a binding again while a streamed run it feeds is running', async () => {
    const claimed = fixtureProvider({
      id: 'binding-provider',
      manifest: {
        ...machineManifestDefinitionFixture,
        connection: { ...machineManifestDefinitionFixture.connection, identity: 'claimed' },
      },
      candidates: [candidateA, candidateB],
      async connect() {
        const { prepare, start } = storedJobs();
        return fixtureSession({
          jobs: { type: 'supported', delivery: 'streamed', prepare, start },
          descriptor: withJobFacts(() => ({ delivery: 'streamed' })),
        });
      },
    });
    const fixture = await openServedHost(await storeRoot(), claimed, runtimeAt(currentTimestamp));
    await bindAs(fixture, { candidateId: 'candidate-a', name: machineId, secretRef: 'vault:x1c' });
    await request(fixture.client, 'job-1');
    await expect(approve(fixture.client, 'job-1')).resolves.toMatchObject({ run: { outcome: 'running' } });
    const ceremonyId = await beginCeremony(fixture.client, 'candidate-b', machineId);
    await expect(
      fixture.host.completeBinding({ ceremonyId, secretRef: 'vault:x1c', serviceTrust: {} }),
    ).rejects.toThrow('MACHINE_BINDING_BUSY');
    await expect(fixture.client.get({ machineId })).resolves.toMatchObject({ freshness: 'current' });
    await expect(fixture.client.listJobs({})).resolves.toMatchObject([{ jobId: 'job-1', run: { outcome: 'running' } }]);
    await fixture.close();
  });

  it('should refuse a start whose setup changed since approval and follow an unknown start to its proof', async () => {
    const jobs = storedJobs();
    let setup: CacheValue = { plate: 'smooth' };
    jobs.prepare.mockImplementation(async (input) => readyPreparation(input, setup));
    let isProven = false;
    const feed = reportFeed();
    const reconcile = vi.fn(
      async (input: Readonly<{ kind: string }>): Promise<MachineCommandReceipt> =>
        input.kind === 'start' && isProven
          ? { status: 'accepted', runId: 'run-late', observedAt }
          : { status: 'unknown', reason: 'no proof yet', observedAt },
    );
    // Only the escalation clock (held still here) or a person's look asks the printer.
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const fixture = await boundPrinter(jobs.facet, { reconcile, observe: feed.observe });
    await request(fixture.client, 'job-1');
    setup = { plate: 'textured' };
    await expect(approve(fixture.client, 'job-1')).resolves.toMatchObject({
      state: 'failed',
      failure: { code: 'MACHINE_JOB_SETUP_CHANGED' },
    });
    expect(jobs.start).not.toHaveBeenCalled();

    setup = { plate: 'smooth' };
    jobs.start.mockResolvedValueOnce({ status: 'unknown', reason: 'reply lost', observedAt });
    await request(fixture.client, 'job-2');
    await expect(approve(fixture.client, 'job-2')).resolves.toMatchObject({
      state: 'confirming',
      receipt: { operationId: 'start-job-2', status: 'unknown' },
    });
    await expect(approve(fixture.client, 'job-2')).rejects.toThrow('MACHINE_JOB_NOT_AWAITING');
    // Reports settle only what they show; they never ask the printer.
    const lit = fixtureObservation('chamber-light', 'accessories', { kind: 'switch', on: true });
    feed.push({ type: 'snapshot', snapshot: fixtureReport({ components: [lit] }) });
    await vi.waitFor(async () => {
      const entry = await fixture.client.get({ machineId });
      expect(entry.snapshot.components).toContainEqual(expect.objectContaining(lit));
    });
    expect(reconcile).not.toHaveBeenCalled();
    isProven = true;
    await expect(fixture.client.reconcileOperation({ machineId, operationId: 'start-job-2' })).resolves.toMatchObject({
      state: 'accepted',
      receipt: { runId: 'run-late' },
    });
    const [latest] = await fixture.client.listJobs({});
    expect(latest).toMatchObject({
      jobId: 'job-2',
      state: 'started',
      run: { runId: 'run-late', outcome: 'running' },
    });
    expect(jobs.start).toHaveBeenCalledOnce();
    await fixture.close();
  });

  it('should look up an operation waiting for attention once a minute, not on every tick', async () => {
    const jobs = storedJobs();
    const reconcile = vi.fn(
      async (): Promise<MachineCommandReceipt> => ({ status: 'unknown', reason: 'no proof yet', observedAt }),
    );
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const fixture = await boundPrinter(jobs.facet, { reconcile });
    jobs.start.mockResolvedValueOnce({ status: 'unknown', reason: 'reply lost', observedAt });
    await request(fixture.client, 'job-1');
    await expect(approve(fixture.client, 'job-1')).resolves.toMatchObject({ state: 'confirming' });
    const settled = async (): Promise<void> => {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 50);
      });
    };
    // Unproven: looked up on each 5 s tick, then escalated once 180 s have passed.
    await vi.advanceTimersByTimeAsync(5000);
    await vi.waitFor(() => {
      expect(reconcile).toHaveBeenCalledOnce();
    });
    currentTime.value += 180_000;
    await vi.advanceTimersByTimeAsync(5000);
    await vi.waitFor(async () => {
      await expect(fixture.client.listJobs({})).resolves.toMatchObject([{ state: 'unknown' }]);
    });
    reconcile.mockClear();
    // At attention a person is asked to look; the printer is asked again only on the minute.
    await vi.advanceTimersByTimeAsync(9 * 5000);
    await settled();
    expect(reconcile).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(5000);
    await vi.waitFor(() => {
      expect(reconcile).toHaveBeenCalledOnce();
    });
    await fixture.close();
  });

  it('should wait for the start button of a printer that starts at the machine', async () => {
    const jobs = storedJobs();
    const feed = reportFeed();
    const reported = fixtureDescriptor();
    const descriptor: MachineProviderDescriptor = {
      ...reported,
      capabilities: {
        ...reported.capabilities,
        jobs:
          reported.capabilities.jobs.type === 'supported'
            ? { ...reported.capabilities.jobs, start: 'at-machine' }
            : reported.capabilities.jobs,
      },
    };
    const fixture = await boundPrinter(jobs.facet, { descriptor, observe: feed.observe });
    // A loaded program nobody has started yet can still be withdrawn from Tau.
    await request(fixture.client, 'job-0');
    jobs.start.mockResolvedValueOnce({ status: 'accepted', observedAt });
    await expect(approve(fixture.client, 'job-0')).resolves.toMatchObject({ state: 'awaiting-start' });
    await expect(fixture.client.withdrawJob({ jobId: 'job-0', resolvedBy: operator })).resolves.toMatchObject({
      state: 'withdrawn',
    });
    await request(fixture.client, 'job-1');
    jobs.start.mockResolvedValueOnce({ status: 'accepted', observedAt });
    await expect(approve(fixture.client, 'job-1')).resolves.toMatchObject({ state: 'awaiting-start' });
    // Until a person presses start the binding is free to change; then the run names the job.
    feed.push({
      type: 'snapshot',
      snapshot: fixtureReport({
        state: { status: 'active' },
        run: {
          runId: 'run-9',
          jobId: 'job-1',
          origin: 'tau',
          delivery: 'stored',
          state: 'running',
          progress: { basis: 'executed', counters: [] },
        },
      }),
    });
    await vi.waitFor(async () => {
      const [latest] = await fixture.client.listJobs({});
      expect(latest).toMatchObject({ state: 'started', run: { runId: 'run-9', outcome: 'running' } });
    });
    await fixture.close();
  });

  /** The fixture printer's descriptor with its job facts changed. */
  type JobFacts = Extract<MachineProviderDescriptor['capabilities']['jobs'], { type: 'supported' }>;
  const withJobFacts = (
    change: (facts: JobFacts) => Partial<JobFacts>,
    components: MachineProviderDescriptor['capabilities']['components'] = [],
  ): MachineProviderDescriptor => {
    const reported = fixtureDescriptor();
    const facts = reported.capabilities.jobs;
    if (facts.type !== 'supported') {
      throw new Error('the fixture printer runs jobs');
    }
    return {
      ...reported,
      capabilities: {
        ...reported.capabilities,
        components: [...reported.capabilities.components, ...components],
        jobs: { ...facts, ...change(facts) },
      },
    };
  };

  it('should admit approving a job again as the first approval: a person, at the machine, never an agent', async () => {
    const jobs = storedJobs();
    let isProven = false;
    const reconcile = vi.fn(
      async (input: Readonly<{ kind: string }>): Promise<MachineCommandReceipt> =>
        input.kind === 'transfer' && isProven
          ? { status: 'accepted', transferId: 'transfer-late', observedAt }
          : { status: 'unknown', reason: 'no proof yet', observedAt },
    );
    // A machine whose start needs the person at it, as a CNC's does.
    const descriptor = withJobFacts((facts) => ({ safety: { ...facts.safety, attended: true } }));
    const fixture = await boundPrinter(jobs.facet, { descriptor, reconcile });
    const agentClient = await fixture.serveAs(agentActor);
    await request(agentClient, 'job-1');
    const resolve = async (client: MachineChannelClient, extra: Partial<MachineResolveJobInput> = {}) =>
      client.resolveJob({
        jobId: 'job-1',
        decision: 'approve',
        resolvedBy: operator,
        attestations: ['work-area-clear'],
        ...extra,
      });
    jobs.transfer.mockResolvedValueOnce({ status: 'unknown', reason: 'reply lost', observedAt });
    await expect(
      resolve(fixture.client, { attended: true, transferOperationId: 'transfer-1', startOperationId: 'start-1' }),
    ).resolves.toMatchObject({ state: 'transferring' });
    // The transfer is proven after the approver's call returned: the job waits to be approved again to start.
    isProven = true;
    await fixture.client.reconcileOperation({ machineId, operationId: 'transfer-1' });
    await expect(fixture.client.listJobs({})).resolves.toMatchObject([{ state: 'starting' }]);
    await expect(
      agentClient.resolveJob({
        jobId: 'job-1',
        decision: 'approve',
        resolvedBy: agent,
        attestations: ['work-area-clear'],
      }),
    ).rejects.toThrow('A person must approve this job in Tau.');
    await expect(resolve(fixture.client)).rejects.toThrow('Say you are at the machine first.');
    await expect(resolve(fixture.client, { attended: true, attestations: [] })).rejects.toThrow(
      'Confirm first: The plate is clear.',
    );
    expect(jobs.start).not.toHaveBeenCalled();
    await expect(resolve(fixture.client, { attended: true })).resolves.toMatchObject({
      state: 'started',
      resolvedBy: operator,
      attended: true,
    });
    expect(jobs.start).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ transferId: 'transfer-late' }));
    await fixture.close();
  });

  it('should refuse a start whose completed configuration changed since approval and send the approved one', async () => {
    const jobs = storedJobs();
    let slot = 'A1';
    // The provider maps the program's material to the slot the machine reports now.
    const completeConfiguration = vi.fn(async () => ({ slot }));
    const fixture = await boundPrinter({ ...jobs.facet, completeConfiguration });
    await request(fixture.client, 'job-1');
    slot = 'A2';
    await expect(approve(fixture.client, 'job-1')).resolves.toMatchObject({
      state: 'failed',
      failure: { code: 'MACHINE_JOB_SETUP_CHANGED' },
    });
    expect(jobs.start).not.toHaveBeenCalled();
    await request(fixture.client, 'job-2');
    await expect(approve(fixture.client, 'job-2')).resolves.toMatchObject({ state: 'started' });
    expect(jobs.start).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ configuration: { slot: 'A2' } }));
    await fixture.close();
  });

  it('should refuse to approve a job while an interlock it names is not safe', async () => {
    const jobs = storedJobs();
    const feed = reportFeed();
    const descriptor = withJobFacts(
      (facts) => ({ safety: { ...facts.safety, interlocks: ['cover'] } }),
      [{ id: 'cover', label: 'Cover', kind: 'interlock', guards: 'door' }],
    );
    const cover = (state: 'safe' | 'unsafe') =>
      fixtureReport({
        components: [...fixtureReport().components, fixtureObservation('cover', 'state', { kind: 'interlock', state })],
      });
    const fixture = await boundPrinter(jobs.facet, { descriptor, observe: feed.observe });
    feed.push({ type: 'snapshot', snapshot: cover('unsafe') });
    await request(fixture.client, 'job-1');
    await vi.waitFor(async () => {
      await expect(approve(fixture.client, 'job-1')).rejects.toThrow(
        'Cover is not safe. Make the cover safe at the machine.',
      );
    });
    expect(jobs.transfer).not.toHaveBeenCalled();
    feed.push({ type: 'snapshot', snapshot: cover('safe') });
    await vi.waitFor(async () => {
      await expect(approve(fixture.client, 'job-1')).resolves.toMatchObject({ state: 'started' });
    });
    await fixture.close();
  });

  it('should prepare a job again when it is approved after its preparation window', async () => {
    const jobs = storedJobs();
    const fixture = await boundPrinter(jobs.facet);
    const requested = await request(fixture.client, 'job-1');
    currentTime.value += 11 * 60_000;
    const started = await approve(fixture.client, 'job-1');
    expect(started).toMatchObject({ state: 'started' });
    expect(started.prepared?.preparedId).not.toBe(requested.prepared?.preparedId);
    // Requested, prepared again at approval, then checked once more by the start.
    expect(jobs.prepare).toHaveBeenCalledTimes(3);
    await fixture.close();
  });

  it('should list a streamed run as streaming until the session that fed it is lost, then record it interrupted', async () => {
    const lose = Promise.withResolvers<void>();
    const prepare = vi.fn(async (input: Readonly<{ operationId: string }>) =>
      readyPreparation(input, { plate: 'smooth' }),
    );
    const start = vi.fn(
      async (input: Readonly<{ operationId: string }>): Promise<MachineCommandReceipt> => ({
        status: 'accepted',
        runId: `run-${input.operationId}`,
        observedAt,
      }),
    );
    const fixture = await boundPrinter(
      { type: 'supported', delivery: 'streamed', prepare, start },
      {
        descriptor: withJobFacts(() => ({ delivery: 'streamed' })),
        async *observe() {
          yield { type: 'snapshot', snapshot: fixtureReport() };
          await lose.promise;
        },
      },
    );
    await request(fixture.client, 'job-1');
    await expect(fixture.host.streamingMachines()).resolves.toEqual([]);
    await expect(approve(fixture.client, 'job-1')).resolves.toMatchObject({
      state: 'started',
      run: { runId: 'run-start-job-1', outcome: 'running' },
    });
    /* The machine's report shows no run yet; the start recorded on the job is enough. */
    await expect(fixture.host.streamingMachines()).resolves.toEqual([{ machineId, name: machineId }]);
    lose.resolve();
    await vi.waitFor(async () => {
      const [latest] = await fixture.client.listJobs({});
      expect(latest).toMatchObject({ state: 'started', run: { runId: 'run-start-job-1', outcome: 'interrupted' } });
    });
    await expect(fixture.host.streamingMachines()).resolves.toEqual([]);
    expect(start).toHaveBeenCalledOnce();
    await fixture.close();
  });

  it('should list as streaming only a machine whose streamed run still has lines to send', async () => {
    const feed = reportFeed();
    const fixture = await boundPrinter(storedJobs().facet, { observe: feed.observe });
    const streaming = async (): Promise<readonly string[]> => {
      const machines = await fixture.host.streamingMachines();
      return machines.map(({ name }) => name);
    };
    /* A stored job runs on the machine by itself: nothing here feeds it. */
    await request(fixture.client, 'job-1');
    await expect(approve(fixture.client, 'job-1')).resolves.toMatchObject({ run: { outcome: 'running' } });
    await expect(streaming()).resolves.toEqual([]);
    const reported = [
      ['streamed', 'finishing', [machineId]],
      ['streamed', 'completed', []],
      ['streamed', 'paused', [machineId]],
      ['stored', 'running', []],
    ] as const;
    for (const [delivery, state, expected] of reported) {
      feed.push({
        type: 'snapshot',
        snapshot: fixtureReport({
          state: { status: 'active' },
          run: { runId: 'run-1', origin: 'external', delivery, state, progress: { basis: 'executed', counters: [] } },
        }),
      });
      // oxlint-disable-next-line eslint/no-await-in-loop -- each report is read before the next replaces it.
      await vi.waitFor(async () => {
        await expect(streaming()).resolves.toEqual(expected);
      });
    }
    await fixture.close();
  });

  it('should list and watch jobs by project', async () => {
    const fixture = await boundPrinter(storedJobs().facet);
    const otherProject = 'proj_ZYXWVUTSRQPONMLKJIHGF';
    const watched = fixture.client.watchJobs({ projectId: otherProject })[Symbol.asyncIterator]();
    await request(fixture.client, 'job-1');
    currentTime.value += 1000;
    await fixture.client.requestJob({
      jobId: 'job-2',
      machineId,
      artifact: { ...artifact, projectId: otherProject },
      configuration: {},
      requestedBy: agent,
    });
    const ids = async (projectId?: string): Promise<string[]> => {
      const listed = await fixture.client.listJobs(projectId === undefined ? {} : { projectId });
      return listed.map(({ jobId }) => jobId);
    };
    await expect(ids()).resolves.toEqual(['job-2', 'job-1']);
    await expect(ids(artifact.projectId)).resolves.toEqual(['job-1']);
    await expect(ids(otherProject)).resolves.toEqual(['job-2']);
    const seen: string[] = [];
    for (;;) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- the watch yields one recorded transition at a time.
      const frame = await watched.next();
      if (frame.done) {
        throw new Error('watch ended early');
      }
      seen.push(frame.value.jobId);
      if (frame.value.state === 'awaiting-approval') {
        break;
      }
    }
    expect(new Set(seen)).toEqual(new Set(['job-2']));
    await watched.return?.();
    await fixture.close();
  });

  it('should recover each job a crash interrupted to a state that sends nothing twice', async () => {
    const jobs = storedJobs();
    const root = await storeRoot();
    const crashes = new Map<string, string>();
    const crashCopy = async (name: string): Promise<void> => {
      const copy = join(await storeRoot(), 'store');
      await cp(root, copy, { recursive: true });
      crashes.set(name, copy);
    };
    const prepare = jobs.prepare.getMockImplementation()!;
    const transfer = jobs.transfer.getMockImplementation()!;
    const start = jobs.start.getMockImplementation()!;
    // The second preparation is the start's own check, before its operation is journaled.
    jobs.prepare.mockImplementation(async (input) => {
      if (jobs.prepare.mock.calls.length === 2) {
        await crashCopy('start-admitted');
      }
      return prepare(input);
    });
    jobs.transfer.mockImplementation(async (input) => {
      await crashCopy('transfer-sending');
      return transfer(input);
    });
    jobs.start.mockImplementation(async (input) => {
      await crashCopy('start-sending');
      return start(input);
    });
    const fixture = await boundPrinter(jobs.facet, {}, root);
    await request(fixture.client, 'job-1');
    await crashCopy('awaiting-approval');
    await expect(approve(fixture.client, 'job-1')).resolves.toMatchObject({ state: 'started' });
    await fixture.close();
    jobs.prepare.mockImplementation(prepare);
    jobs.transfer.mockImplementation(transfer);
    jobs.start.mockImplementation(start);

    const restart = async (name: string) => {
      jobs.transfer.mockClear();
      jobs.start.mockClear();
      const restarted = await openServedHost(crashes.get(name)!, fixture.provider, runtimeAt(currentTimestamp));
      await vi.waitFor(async () => {
        await expect(restarted.client.get({ machineId })).resolves.toMatchObject({ freshness: 'current' });
      });
      const [job] = await restarted.client.listJobs({});
      return { ...restarted, job: job! };
    };

    const awaiting = await restart('awaiting-approval');
    expect(awaiting.job.state).toBe('awaiting-approval');
    await expect(approve(awaiting.client, 'job-1')).resolves.toMatchObject({ state: 'started' });
    expect(jobs.transfer).toHaveBeenCalledOnce();
    await awaiting.close();

    // An unproven transfer keeps the job transferring until the journal settles it; nothing is sent again.
    const transferring = await restart('transfer-sending');
    expect(transferring.job).toMatchObject({ state: 'transferring', transferOperationId: 'transfer-job-1' });
    await expect(
      transferring.client.reconcileOperation({ machineId, operationId: 'transfer-job-1' }),
    ).resolves.toMatchObject({ state: 'confirming' });
    expect(jobs.transfer).not.toHaveBeenCalled();
    await transferring.close();

    // A start that was never sent is not left looking in flight: the person is told to send it again.
    const admitted = await restart('start-admitted');
    expect(admitted.job).toMatchObject({ state: 'failed', failure: { code: 'HOST_RESTARTED' } });
    expect(jobs.start).not.toHaveBeenCalled();
    await admitted.close();

    const starting = await restart('start-sending');
    expect(starting.job).toMatchObject({
      state: 'confirming',
      transferId: 'transfer-transfer-job-1',
      receipt: { operationId: 'start-job-1', kind: 'start', status: 'unknown' },
    });
    await expect(approve(starting.client, 'job-1')).rejects.toThrow('MACHINE_JOB_NOT_AWAITING');
    expect(jobs.start).not.toHaveBeenCalled();
    await starting.close();
  });

  it(
    'should store no telemetry from four hours of 1 Hz reports and recover bindings, operations and jobs',
    { timeout: 120_000 },
    async () => {
      const jobs = storedJobs();
      const feed = reportFeed();
      const fixture = await boundPrinter(jobs.facet, { observe: feed.observe });
      await request(fixture.client, 'job-1');
      await expect(approve(fixture.client, 'job-1')).resolves.toMatchObject({ state: 'started' });
      await request(fixture.client, 'job-2');
      const ledgerBytes = await storeBytes(fixture.root);
      const seconds = 4 * 60 * 60;
      const startedAt = currentTime.value;
      const reportedAt = (second: number): string => new Date(startedAt + second * 1000).toISOString();
      feed.push(
        ...Array.from(
          { length: seconds },
          (_, index): MachineObservation => ({
            type: 'snapshot',
            snapshot: fixtureReport({
              observedAt: reportedAt(index + 1),
              state: { status: 'active' },
              run: {
                runId: 'run-start-job-1',
                jobId: 'job-1',
                origin: 'tau',
                delivery: 'stored',
                state: 'running',
                progress: { basis: 'executed', fraction: (index + 1) / seconds, counters: [] },
              },
            }),
          }),
        ),
      );
      await vi.waitFor(
        async () => {
          await expect(fixture.client.get({ machineId })).resolves.toMatchObject({
            snapshot: { observedAt: reportedAt(seconds), run: { progress: { fraction: 1 } } },
          });
        },
        { timeout: 60_000 },
      );
      // Every report differs, yet the store holds only the binding, operations and jobs.
      expect(await storeBytes(fixture.root)).toBe(ledgerBytes);
      expect(ledgerBytes).toBeLessThan(1024 * 1024);
      await fixture.close();

      const restarted = await openServedHost(fixture.root, fixture.provider, runtimeAt(currentTimestamp));
      const recovered = await restarted.client.listJobs({});
      expect(recovered.map(({ jobId, state }) => `${jobId}:${state}`)).toEqual([
        'job-2:awaiting-approval',
        'job-1:started',
      ]);
      await expect(
        restarted.client.reconcileOperation({ machineId, operationId: 'start-job-1' }),
      ).resolves.toMatchObject({ state: 'accepted', receipt: { runId: 'run-start-job-1' } });
      expect(jobs.start).toHaveBeenCalledOnce();
      await restarted.close();
    },
  );
});

describe.runIf(process.platform === 'darwin' || process.platform === 'linux')('binding credentials and removal', () => {
  const printerA = candidateFor('candidate-a', 'physical-a');
  const printerB = candidateFor('candidate-b', 'physical-b');
  const unclaimed = candidateFor('candidate-c');
  const connects = vi.fn((_candidateId: string): void => undefined);
  const closes = vi.fn(async (): Promise<void> => undefined);
  const provider = bindingProvider(
    (candidate) => {
      connects(candidate.id);
      // Each fixture printer reports the physical identity its candidate claims.
      return fixtureSession({
        descriptor: fixtureDescriptor(candidate.claimedIdentity.serial ?? 'physical-unclaimed'),
        jobs: storedJobs().facet,
        close: closes,
      });
    },
    [printerA, printerB, unclaimed],
  );
  const saved = new Set<string>();
  const has = vi.fn(async (reference: string): Promise<boolean> => saved.has(reference));
  const forget = vi.fn(async (reference: string): Promise<void> => {
    saved.delete(reference);
  });
  const runtime = runtimeAt(() => observedAt, { credentials: { has, forget } });
  const openCredentialHost = async (root: string) => openServedHost(root, provider, runtime);

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
    const ceremony = await fixture.client.beginBinding({ candidate: found.get('candidate-a')!, name: machineId });
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
      { status: 'bound', machineId: 'workshop-x1c' },
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
    await bindAs(first, { candidateId: 'candidate-a', name: machineId, secretRef: reference });
    expect(closes).not.toHaveBeenCalled();
    await expect(first.client.removeBinding({ machineId })).resolves.toEqual({ status: 'removed', machineId });
    expect(closes).toHaveBeenCalledOnce();
    expect(forget).toHaveBeenCalledExactlyOnceWith(reference);
    expect(saved.has(reference)).toBe(false);
    await expect(first.client.list({})).resolves.toMatchObject({ entries: [] });
    await expect(first.client.removeBinding({ machineId })).rejects.toMatchObject({
      code: 'MACHINE_DIRECTORY_UNKNOWN_MACHINE',
    });
    await first.close();
    const history = `${machineId}.removed-${Date.parse(observedAt)}`;
    expect(await sortedEntries(root)).toEqual(['authority', 'store.json', history]);
    expect(JSON.parse(await readFile(join(root, history, 'machine.json'), 'utf8'))).toMatchObject({
      id: machineId,
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

  it('should refuse removal while a job still needs the binding', async () => {
    forget.mockClear();
    const fixture = await openCredentialHost(await storeRoot());
    await bindAs(fixture, { candidateId: 'candidate-a', name: machineId, secretRef: 'vault:busy' });
    await expect(
      fixture.client.requestJob({ jobId: 'job-1', machineId, artifact, configuration: {}, requestedBy: agent }),
    ).resolves.toMatchObject({ state: 'awaiting-approval' });
    await expect(fixture.client.removeBinding({ machineId })).rejects.toMatchObject({ code: 'MACHINE_BINDING_BUSY' });
    expect(forget).not.toHaveBeenCalled();
    await expect(fixture.client.get({ machineId })).resolves.toMatchObject({ freshness: 'current' });
    await fixture.client.withdrawJob({ jobId: 'job-1', resolvedBy: agent });
    await expect(fixture.client.removeBinding({ machineId })).resolves.toEqual({ status: 'removed', machineId });
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

  it("should keep every other printer working when one printer's journal is unreadable", async () => {
    const root = await storeRoot();
    const first = await openCredentialHost(root);
    await bindAs(first, { candidateId: 'candidate-a', name: 'printer-a', secretRef: 'vault:a' });
    await bindAs(first, { candidateId: 'candidate-b', name: 'printer-b', secretRef: 'vault:b' });
    await first.close();
    // A well-formed frame that breaks the replay rules: a send for an operation that was never planned.
    const log = await journalAt(join(root, 'printer-a'));
    await log.append({ version: 1, type: 'machine-operation-sending', operationId: 'orphan', observedAt });
    await log.close();
    const damaged = await readFile(join(root, 'printer-a', 'journal.jsonl'));

    connects.mockClear();
    const second = await openCredentialHost(root);
    expect(connects.mock.calls).toEqual([['candidate-b']]);
    expect(second.onError).toHaveBeenCalledOnce();
    expect(second.onError.mock.calls[0]?.[0]).toMatchObject({
      message: 'MACHINE_OPERATIONS_LOG_CORRUPT',
      cause: { message: 'NODE_MACHINE_OPERATION_ORPHAN' },
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
      second.client.requestJob({
        jobId: 'job-a',
        machineId: 'printer-a',
        artifact,
        configuration: {},
        requestedBy: agent,
      }),
    ).rejects.toThrow('MACHINE_OPERATIONS_LOG_CORRUPT');
    await expect(
      second.client.applyAction({ ...lightOn('sha256:any', 'light-a'), machineId: 'printer-a' }),
    ).rejects.toThrow('MACHINE_OPERATIONS_LOG_CORRUPT');
    await expect(second.client.reconcileOperation({ machineId: 'printer-a', operationId: 'orphan' })).rejects.toThrow(
      'MACHINE_OPERATIONS_LOG_CORRUPT',
    );
    // Stop is never gated on the journal; this printer is simply not connected.
    await expect(second.client.stop({ machineId: 'printer-a', requestedBy: operator })).resolves.toMatchObject({
      status: 'rejected',
      code: 'MACHINE_UNAVAILABLE',
    });
    await expect(
      second.client.requestJob({
        jobId: 'job-b',
        machineId: 'printer-b',
        artifact,
        configuration: {},
        requestedBy: agent,
      }),
    ).resolves.toMatchObject({ state: 'awaiting-approval' });
    expect(await readdir(join(root, 'printer-a'))).not.toContain('jobs');
    // The unreadable printer can still be removed; its journal goes with its history, byte for byte.
    await expect(second.client.removeBinding({ machineId: 'printer-a' })).resolves.toEqual({
      status: 'removed',
      machineId: 'printer-a',
    });
    await second.close();
    expect(await readFile(join(root, `printer-a.removed-${Date.parse(observedAt)}`, 'journal.jsonl'))).toEqual(damaged);
  });

  it('should keep every other printer working when one printer cannot record its possible send at restart', async () => {
    const root = await storeRoot();
    const first = await openCredentialHost(root);
    await bindAs(first, { candidateId: 'candidate-a', name: 'printer-a', secretRef: 'vault:a' });
    await bindAs(first, { candidateId: 'candidate-b', name: 'printer-b', secretRef: 'vault:b' });
    await first.close();
    // A light that may have left when the host stopped: recovery owes it a durable `unknown` before anything reconnects.
    const log = await journalAt(join(root, 'printer-a'));
    await log.append({
      version: 1,
      type: 'machine-operation-planned',
      machineId: 'printer-a',
      providerId: 'binding-provider',
      physicalMachineId: 'physical-a',
      operationId: 'light-1',
      kind: 'action',
      inputDigest: `sha256:${'0'.repeat(64)}`,
      intent: { componentId: 'chamber-light', action: 'switch.set', version: 1, expectedRunId: null, parameters: {} },
      plannedAt: observedAt,
    });
    await log.append({ version: 1, type: 'machine-operation-sending', operationId: 'light-1', observedAt });
    await log.close();
    const pending = await readFile(join(root, 'printer-a', 'journal.jsonl'));

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
        second.client.reconcileOperation({ machineId: 'printer-a', operationId: 'light-1' }),
      ).rejects.toThrow('MACHINE_OPERATIONS_LOG_CORRUPT');
      await second.close();
    } finally {
      refusedAppends.clear();
    }
    expect(await readFile(join(root, 'printer-a', 'journal.jsonl'))).toEqual(pending);
  });

  it.each([
    ['a newer record version', { version: 2, type: 'machine-operation-sending', operationId: 'later', observedAt }],
    [
      'a record type this Tau does not know',
      { version: 1, type: 'machine-operation-annotated', operationId: 'later', observedAt },
    ],
  ])('should keep a journal holding %s unreadable until a newer Tau reads it', async (_case, record) => {
    const root = await storeRoot();
    const first = await openCredentialHost(root);
    await bindAs(first, { candidateId: 'candidate-a', name: 'printer-a', secretRef: 'vault:a' });
    await first.close();
    const log = await journalAt(join(root, 'printer-a'));
    await log.append(record);
    await log.close();
    const second = await openCredentialHost(root);
    expect(second.onError).toHaveBeenCalledOnce();
    expect(second.onError.mock.calls[0]?.[0]).toMatchObject({
      message: 'MACHINE_OPERATIONS_LOG_CORRUPT',
      cause: { message: 'MACHINE_EVENT_LOG_CORRUPT_RECORD' },
    });
    await second.close();
  });

  it('should refuse only a provider it cannot read and list its printers stale with a remedy', async () => {
    const root = await storeRoot();
    const first = await openCredentialHost(root);
    await bindAs(first, { candidateId: 'candidate-a', name: 'printer-a', secretRef: 'vault:a' });
    await first.close();
    // A provider from a newer Tau: its protocol is one this host does not speak.
    const newer = { ...provider };
    Reflect.set(newer, 'protocolVersion', 3);
    const second = await openServedHost(root, newer, runtime);
    expect(second.onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'MACHINE_PROVIDER_REFUSED', providerId: 'binding-provider' }),
    );
    await expect(second.client.get({ machineId: 'printer-a' })).resolves.toMatchObject({
      freshness: 'stale',
      snapshot: {
        alerts: [{ code: 'MACHINE_PROVIDER_UNAVAILABLE', remedies: [{ type: 'person' }] }],
      },
    });
    await second.close();
  });

  it('should move a claimed printer to a new address only when a person binds it there again', async () => {
    const root = await storeRoot();
    const release = vi.fn(async (): Promise<MachineCommandReceipt> => ({ status: 'accepted', observedAt }));
    const claimed = fixtureProvider({
      id: 'binding-provider',
      manifest: {
        ...machineManifestDefinitionFixture,
        connection: { ...machineManifestDefinitionFixture.connection, identity: 'claimed' },
      },
      candidates: [candidateA, candidateB],
      async connect() {
        return fixtureSession({
          holds: { type: 'supported', begin: async () => ({ extend: async () => undefined, release }) },
        });
      },
    });
    const fixture = await openServedHost(root, claimed, runtime);
    const bound = await bindAs(fixture, { candidateId: 'candidate-a', name: machineId, secretRef: 'vault:x1c' });
    await expect(
      fixture.client.beginHold({
        machineId,
        componentId: 'motion',
        capabilityRevision: await revisionOf(fixture.client),
        operationId: 'jog-1',
        hold: 'motion.jog',
        version: 1,
        parameters: { axis: 'x', direction: 1, feed: 600 },
        requestedBy: operator,
        attended: true,
      }),
    ).resolves.toMatchObject({ status: 'held' });
    // The same claimed identity answering at another address is the same printer once a person confirms it.
    await expect(
      bindAs(fixture, { candidateId: 'candidate-b', name: machineId, secretRef: 'vault:x1c' }),
    ).resolves.toBe(bound);
    // The session it replaced is lost as any other: the hold it carried ends.
    await vi.waitFor(() => {
      expect(release).toHaveBeenCalledOnce();
    });
    await expect(fixture.client.renewHold({ holdId: 'jog-1' })).resolves.toEqual({ status: 'ended' });
    expect(JSON.parse(await readFile(join(root, machineId, 'machine.json'), 'utf8'))).toMatchObject({
      name: machineId,
      candidate: { endpoint: { address: 'candidate-b.local' } },
    });
    await expect(fixture.client.list({})).resolves.toMatchObject({ entries: [{ machineId }] });
    await fixture.close();
  });

  it('should import a legacy binding once and reconnect it as an ordinary printer', async () => {
    connects.mockClear();
    const root = await storeRoot();
    await mkdir(join(root, 'authority'), { mode: 0o700 });
    const legacy = await journalAt(join(root, 'authority'), 'machine-events.jsonl');
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
      await expect(fixture.client.get({ machineId })).resolves.toMatchObject({
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

describe.runIf(process.platform === 'darwin' || process.platform === 'linux')('discovery and providers', () => {
  const collect = async <Value>(stream: AsyncIterable<Value>): Promise<Value[]> => {
    const values: Value[] = [];
    for await (const value of stream) {
      values.push(value);
    }
    return values;
  };
  const serialManifest = (environment: 'hardware' | 'simulation'): MachineManifestDefinition => ({
    ...machineManifestDefinitionFixture,
    connection: { ...machineManifestDefinitionFixture.connection, transport: 'serial' },
    qualifications: machineManifestDefinitionFixture.qualifications.map((profile) => ({ ...profile, environment })),
  });

  it('should pass an addressed endpoint to the provider and refuse one in another transport', async () => {
    const seen: unknown[] = [];
    const provider = fixtureProvider({
      id: 'binding-provider',
      candidates: [candidateA],
      onDiscover: (input) => {
        seen.push(input.endpoint);
      },
    });
    const fixture = await openServedHost(
      await storeRoot(),
      provider,
      runtimeAt(() => observedAt),
    );
    const endpoint = { transport: 'network', address: '192.0.2.7', port: 8883 } as const;
    await expect(
      collect(fixture.client.discover({ providerId: 'binding-provider', configuration: {}, endpoint })),
    ).resolves.toMatchObject([
      { type: 'found', candidate: { endpoint: { transport: 'network', address: 'candidate-a.local' } } },
    ]);
    await discoverAll(fixture.client);
    expect(seen).toEqual([endpoint, undefined]);
    await expect(
      collect(
        fixture.client.discover({
          providerId: 'binding-provider',
          configuration: {},
          endpoint: { transport: 'serial', path: '/dev/ttyUSB0' },
        }),
      ),
    ).rejects.toThrow('MACHINE_DISCOVERY_ENDPOINT_INVALID');
    expect(seen).toHaveLength(2);
    await fixture.close();
  });

  it('should list a serial provider unavailable on a host without serial access, unless it only simulates', async () => {
    const root = await storeRoot();
    const network = fixtureProvider({ id: 'network-provider' });
    const providers = [
      fixtureProvider({ id: 'serial-provider', manifest: serialManifest('hardware') }),
      fixtureProvider({ id: 'serial-simulator', manifest: serialManifest('simulation') }),
      // A provider never says it is unavailable; the host does.
      { ...network, unavailable: { reason: 'Claimed by the provider.' } },
    ];
    const open = async (runtime: NodeMachineRuntime) => {
      const admission = createHostAdmissionAuthority({ hostId: 'host-1' });
      const onError = vi.fn();
      const host = await createNodeMachineHost({
        storeRoot: root,
        hostId: 'host-1',
        authorityId: 'authority-1',
        admission,
        providers,
        runtime,
        onError,
      });
      hosts.push(host);
      const ports = new MessageChannel();
      host.serve({
        port: ports.port1,
        session: host.issueSession({ actor: { kind: 'user', id: 'operator' }, grants: allGrants }),
      });
      const client = connectMachineChannel(ports.port2);
      const listed = await client.listProviders({});
      return { host, client, onError, listed: listed.map(({ id, unavailable }) => ({ id, unavailable })) };
    };
    const withoutSerial = await open(runtimeAt(() => observedAt));
    expect(withoutSerial.listed).toEqual([
      { id: 'serial-provider', unavailable: { reason: expect.stringContaining('serial ports') as string } },
      { id: 'serial-simulator', unavailable: undefined },
      { id: 'network-provider', unavailable: undefined },
    ]);
    expect(withoutSerial.onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'MACHINE_PROVIDER_UNAVAILABLE_CLAIMED', providerId: 'network-provider' }),
    );
    await expect(
      collect(withoutSerial.client.discover({ providerId: 'serial-provider', configuration: {} })),
    ).rejects.toThrow('MACHINE_PROVIDER_UNAVAILABLE');
    withoutSerial.client.close();
    await withoutSerial.host.close();
    const base = runtimeAt(() => observedAt);
    const withSerial = await open({
      ...base,
      discovery: { ...base.discovery, listSerialPorts: async () => [] },
    });
    expect(withSerial.listed.every(({ unavailable }) => unavailable === undefined)).toBe(true);
    withSerial.client.close();
  });

  it.each(['simulation', 'hardware'] as const)(
    "should serve the provider's qualifications on a machine's capabilities, live and recovered (%s)",
    async (environment) => {
      const root = await storeRoot();
      const provider = fixtureProvider({
        id: 'binding-provider',
        manifest: {
          ...machineManifestDefinitionFixture,
          qualifications: machineManifestDefinitionFixture.qualifications.map((profile) => ({
            ...profile,
            environment,
          })),
        },
        candidates: [candidateA],
        async connect() {
          return fixtureSession();
        },
      });
      const live = await openServedHost(
        root,
        provider,
        runtimeAt(() => observedAt),
      );
      await bindAs(live, { candidateId: 'candidate-a', name: machineId, secretRef: 'vault:x1c' });
      const entry = await live.client.get({ machineId });
      expect(entry.descriptor.capabilities.qualifications).toHaveLength(
        machineManifestDefinitionFixture.qualifications.length,
      );
      expect(isSimulatedMachine(entry.descriptor.capabilities)).toBe(environment === 'simulation');
      await live.close();
      const recovered = await openServedHost(
        root,
        provider,
        runtimeAt(() => observedAt),
      );
      const listed = await recovered.client.get({ machineId });
      expect(isSimulatedMachine(listed.descriptor.capabilities)).toBe(environment === 'simulation');
      await recovered.close();
    },
  );

  it('should read an older serial binding as serial, and list one this host cannot reach with how to reach it', async () => {
    const root = await storeRoot();
    const store = await openNodeMachineStore({
      storeRoot: root,
      legacyStoreRoots: [],
      parseOperation: parseJournalEvent,
      now: () => observedAt,
      onError: vi.fn(),
    });
    const { record } = await store.createMachine({
      name: 'Bench CNC',
      providerId: 'serial-provider',
      physicalId: 'physical-1',
      candidate: {
        id: 'bench',
        name: 'Bench CNC',
        endpoint: { transport: 'network', address: '/dev/tty.usbserial-1' },
        claimedIdentity: {},
        observedAt,
        expiresAt: observedAt,
      },
      configuration: {},
      connection: { secretRef: 'vault:cnc', serviceTrust: {} },
      boundAt: observedAt,
    });
    await store.close();
    // As an older Tau wrote it: version 1, and an endpoint that does not name its transport.
    const path = join(root, record.id, 'machine.json');
    const stored = JSON.parse(await readFile(path, 'utf8')) as { version: number; candidate: { endpoint: unknown } };
    stored.version = 1;
    stored.candidate.endpoint = { address: '/dev/tty.usbserial-1', interface: 'serial' };
    await writeFile(path, JSON.stringify(stored));
    const seen: unknown[] = [];
    const provider = fixtureProvider({
      id: 'serial-provider',
      manifest: serialManifest('hardware'),
      async connect({ candidate }) {
        seen.push(candidate.endpoint);
        return fixtureSession();
      },
    });
    const open = async (runtime: NodeMachineRuntime) => {
      const host = await createNodeMachineHost({
        storeRoot: root,
        hostId: 'host-1',
        authorityId: 'authority-1',
        admission: createHostAdmissionAuthority({ hostId: 'host-1' }),
        providers: [provider],
        runtime,
        onError: vi.fn(),
      });
      hosts.push(host);
      const ports = new MessageChannel();
      host.serve({
        port: ports.port1,
        session: host.issueSession({ actor: { kind: 'user', id: 'operator' }, grants: allGrants }),
      });
      return { host, client: connectMachineChannel(ports.port2) };
    };
    const base = runtimeAt(() => observedAt);
    const withSerial = await open({ ...base, discovery: { ...base.discovery, listSerialPorts: async () => [] } });
    expect(seen).toEqual([{ transport: 'serial', path: '/dev/tty.usbserial-1' }]);
    await expect(withSerial.client.get({ machineId: record.id })).resolves.toMatchObject({ freshness: 'current' });
    withSerial.client.close();
    await withSerial.host.close();
    // Without serial access the binding is listed with why and what a person can do, and never retried.
    const withoutSerial = await open(base);
    await expect(withoutSerial.client.get({ machineId: record.id })).resolves.toMatchObject({
      freshness: 'stale',
      snapshot: {
        alerts: [
          {
            code: 'MACHINE_PROVIDER_UNAVAILABLE',
            message: expect.stringContaining('serial ports') as string,
            remedies: [{ type: 'person', instruction: expect.stringContaining('serial support') as string }],
          },
        ],
      },
    });
    expect(seen).toHaveLength(1);
    withoutSerial.client.close();
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
  const apply = vi.fn<(input: unknown) => Promise<MachineCommandReceipt>>();
  /** Idle until the test loses the session: report it disconnected, end the observation, or fail it. */
  const lossyObserve = (loss: Promise<Loss>, observing: () => void): NonNullable<FixtureSessionBehavior['observe']> =>
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
          snapshot: fixtureReport({ connection: 'disconnected', state: { status: 'unknown' } }),
        };
        await aborted;
      }
    };
  const provider = bindingProvider(
    async (_candidate, signal) => {
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
      connections.push({ close, observing: observing.promise, lose: loss.resolve });
      return fixtureSession({
        close,
        descriptor: fixtureDescriptor(outcome === 'another-printer' ? 'physical-2' : 'physical-1'),
        actions: { type: 'supported', apply, confirm: () => ({ status: 'pending' }) },
        observe: lossyObserve(loss.promise, () => {
          observed();
          observing.resolve();
        }),
      });
    },
    [candidateA],
  );
  const runtime = runtimeAt(() => observedAt);
  const openSupervised = async (root: string) => {
    const admission = createHostAdmissionAuthority({ hostId: 'host-1' });
    const onError = vi.fn();
    const host = await createNodeMachineHost({
      storeRoot: root,
      hostId: 'host-1',
      authorityId: 'authority-1',
      admission,
      providers: [provider],
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
  /** Bind the printer through a first host and close it, so the next host recovers the binding at start. */
  const bindOnce = async (root: string): Promise<void> => {
    const fixture = await openServedHost(root, provider, runtime);
    const ceremonyId = await beginCeremony(fixture.client, 'candidate-a', machineId);
    await fixture.host.completeBinding({ ceremonyId, secretRef: 'vault:x1c', serviceTrust: {} });
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
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
  };
  const machine = { machineId } as const;

  afterEach(() => {
    outcomes.length = 0;
    vi.useRealTimers();
  });

  it('should connect a printer that was off at start, retrying after 2 s, 5 s, 10 s, 30 s, then every 60 s', async () => {
    const root = await storeRoot();
    await bindOnce(root);
    outcomes.push(...Array.from({ length: 6 }, () => new Error('FIXTURE_OFFLINE')));
    useFakeTimers();
    const fixture = await openServedHost(root, provider, runtime);
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
    // Nothing is scheduled while the session is live but the settlement clock.
    expect(vi.getTimerCount()).toBe(1);
    vi.useRealTimers();
    await fixture.close();
  });

  it.each(['disconnected', 'end', 'throw'] as const)(
    'should replace a session whose observation reports %s and start the backoff over once it connects',
    async (loss) => {
      const root = await storeRoot();
      await bindOnce(root);
      useFakeTimers();
      const fixture = await openServedHost(root, provider, runtime);
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
    const fixture = await openServedHost(root, provider, runtime);
    await connections[0]!.observing;
    connections[0]!.lose('end');
    outcomes.push(refusal);
    await expectAttemptAfter(2000);
    await until(() => fixture.onError.mock.calls.length === 1);
    expect(fixture.onError).toHaveBeenCalledWith(expect.objectContaining({ message: code }));
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(connects).toHaveBeenCalledTimes(2);
    // Stale with what a person does about it.
    await expect(fixture.client.get(machine)).resolves.toMatchObject({
      freshness: 'stale',
      snapshot: { alerts: [{ code: 'tau.rebind-required', remedies: [{ type: 'person' }] }] },
    });
    vi.useRealTimers();
    // The remedy works: binding the printer again where it is now confirms the same binding, not a second one.
    await expect(
      bindAs(fixture, { candidateId: 'candidate-a', name: machineId, secretRef: 'vault:x1c' }),
    ).resolves.toBe(machineId);
    await expect(fixture.client.get(machine)).resolves.toMatchObject({
      freshness: 'current',
      snapshot: { alerts: [] },
    });
    await expect(fixture.client.list({})).resolves.toMatchObject({ entries: [{ machineId }] });
    await fixture.close();

    // The same refusal at the next start is not retried either.
    outcomes.push(refusal);
    useFakeTimers();
    const restarted = await openSupervised(root);
    expect(restarted.onError).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ message: code }));
    expect(vi.getTimerCount()).toBe(1);
    await restarted.close();
  });

  it('should tell a person how to find a claimed machine that stops answering, and keep trying', async () => {
    const root = await storeRoot();
    let isOffline = false;
    const claimed = fixtureProvider({
      id: 'binding-provider',
      manifest: {
        ...machineManifestDefinitionFixture,
        connection: { ...machineManifestDefinitionFixture.connection, identity: 'claimed' },
      },
      candidates: [candidateA],
      async connect() {
        if (isOffline) {
          throw new Error('FIXTURE_OFFLINE');
        }
        return fixtureSession();
      },
    });
    const first = await openServedHost(root, claimed, runtime);
    await bindAs(first, { candidateId: 'candidate-a', name: machineId, secretRef: 'vault:x1c' });
    await first.close();
    isOffline = true;
    useFakeTimers();
    const fixture = await openServedHost(root, claimed, runtime);
    const alertCodes = async (): Promise<string[]> => {
      const entry = await fixture.client.get(machine);
      return entry.snapshot.alerts.map(({ code }) => code);
    };
    const isListed = async (code: string): Promise<boolean> => {
      const codes = await alertCodes();
      return codes.includes(code);
    };
    // The attempt at start, then 2 s, 5 s and 10 s later: not yet.
    await vi.advanceTimersByTimeAsync(2000 + 5000 + 10_000);
    await until(() => fixture.onError.mock.calls.length === 4);
    await expect(alertCodes()).resolves.toEqual([]);
    // The fourth retry fails too: the person is told, and the host keeps trying.
    await vi.advanceTimersByTimeAsync(30_000);
    await until(() => fixture.onError.mock.calls.length === 5);
    await vi.waitUntil(async () => isListed('tau.unreachable'));
    isOffline = false;
    await vi.advanceTimersByTimeAsync(60_000);
    await vi.waitUntil(async () => !(await isListed('tau.unreachable')));
    await expect(fixture.client.get(machine)).resolves.toMatchObject({ freshness: 'current' });
    vi.useRealTimers();
    await fixture.close();
  });

  /** A claimed-identity provider whose `connect` the test supplies, with candidates A and B. */
  const claimedProvider = (connect: (candidate: MachineCandidate) => Promise<MachineSession>) =>
    fixtureProvider({
      id: 'binding-provider',
      manifest: {
        ...machineManifestDefinitionFixture,
        connection: { ...machineManifestDefinitionFixture.connection, identity: 'claimed' },
      },
      candidates: [candidateA, candidateB],
      async connect({ candidate }) {
        return connect(candidate);
      },
    });

  it('should supervise a confirmed binding at its new address when the confirming session fails to attach', async () => {
    const seen: string[] = [];
    let isAttachFailing = false;
    const claimed = claimedProvider(async (candidate) => {
      seen.push(candidate.id);
      const session = fixtureSession();
      if (!isAttachFailing) {
        return session;
      }
      isAttachFailing = false;
      let reads = 0;
      // The ceremony reads the descriptor once to check identity; attaching reads it again, and that read fails.
      return {
        ...session,
        async getDescriptor(input) {
          reads += 1;
          if (reads > 1) {
            throw new Error('FIXTURE_ATTACH_FAILED');
          }
          return session.getDescriptor(input);
        },
      };
    });
    const fixture = await openServedHost(await storeRoot(), claimed, runtime);
    await bindAs(fixture, { candidateId: 'candidate-a', name: machineId, secretRef: 'vault:x1c' });
    const ceremonyId = await beginCeremony(fixture.client, 'candidate-b', machineId);
    useFakeTimers();
    isAttachFailing = true;
    await expect(
      fixture.host.completeBinding({ ceremonyId, secretRef: 'vault:x1c', serviceTrust: {} }),
    ).rejects.toThrow('FIXTURE_ATTACH_FAILED');
    expect(seen).toEqual(['candidate-a', 'candidate-b']);
    // Not left stale without a loop: the next attempt follows the backoff, at the confirmed address.
    await vi.advanceTimersByTimeAsync(2000);
    await until(() => seen.length === 3);
    expect(seen.at(-1)).toBe('candidate-b');
    await vi.waitFor(async () => {
      await expect(fixture.client.get(machine)).resolves.toMatchObject({ freshness: 'current' });
    });
    vi.useRealTimers();
    await fixture.close();
  });

  it('should never let a reconnect at the old address replace a session a person just confirmed', async () => {
    const lose = Promise.withResolvers<void>();
    const oldAttempt = Promise.withResolvers<void>();
    const oldSession = { close: vi.fn(async () => undefined), observe: vi.fn() };
    let attempts = 0;
    const claimed = claimedProvider(async (candidate) => {
      if (candidate.id === 'candidate-b') {
        const session = fixtureSession();
        let reads = 0;
        return {
          ...session,
          async getDescriptor(input) {
            reads += 1;
            if (reads > 1) {
              // Attaching the confirmed session: the old loop's attempt at the old address connects meanwhile.
              oldAttempt.resolve();
              for (let turn = 0; turn < 20; turn += 1) {
                // oxlint-disable-next-line eslint/no-await-in-loop -- real turns let the old attempt queue its attach.
                await new Promise<void>((resolve) => {
                  setImmediate(resolve);
                });
              }
            }
            return session.getDescriptor(input);
          },
        };
      }
      attempts += 1;
      if (attempts === 1) {
        return fixtureSession({
          async *observe() {
            yield { type: 'snapshot', snapshot: fixtureReport() };
            await lose.promise;
          },
        });
      }
      await oldAttempt.promise;
      return fixtureSession({
        close: oldSession.close,
        async *observe(input) {
          oldSession.observe(input);
          yield* [];
        },
      });
    });
    const fixture = await openServedHost(await storeRoot(), claimed, runtime);
    await bindAs(fixture, { candidateId: 'candidate-a', name: machineId, secretRef: 'vault:x1c' });
    const ceremonyId = await beginCeremony(fixture.client, 'candidate-b', machineId);
    useFakeTimers();
    lose.resolve();
    await vi.advanceTimersByTimeAsync(2000);
    await until(() => attempts === 2);
    vi.useRealTimers();
    await expect(
      fixture.host.completeBinding({ ceremonyId, secretRef: 'vault:x1c', serviceTrust: {} }),
    ).resolves.toEqual({
      status: 'bound',
      machineId,
    });
    await vi.waitFor(() => {
      expect(oldSession.close).toHaveBeenCalled();
    });
    expect(oldSession.observe).not.toHaveBeenCalled();
    await expect(fixture.client.get(machine)).resolves.toMatchObject({ freshness: 'current' });
    await fixture.close();
  });

  it('should keep watching the live session when confirming a binding cannot save its new address', async () => {
    const seen: string[] = [];
    const claimed = claimedProvider(async (candidate) => {
      seen.push(candidate.id);
      return fixtureSession();
    });
    const root = await storeRoot();
    const fixture = await openServedHost(root, claimed, runtime);
    await bindAs(fixture, { candidateId: 'candidate-a', name: machineId, secretRef: 'vault:x1c' });
    const ceremonyId = await beginCeremony(fixture.client, 'candidate-b', machineId);
    useFakeTimers();
    // `machine.json` cannot be replaced while its directory is read-only.
    await chmod(join(root, machineId), 0o500);
    try {
      await expect(
        fixture.host.completeBinding({ ceremonyId, secretRef: 'vault:x1c', serviceTrust: {} }),
      ).rejects.toThrow();
    } finally {
      await chmod(join(root, machineId), 0o700);
    }
    // The old session is still live and still watched: no reconnect over it, and no remedy for a working machine.
    await vi.advanceTimersByTimeAsync(2000 + 5000 + 10_000 + 30_000 + 60_000);
    expect(seen).toEqual(['candidate-a', 'candidate-b']);
    await expect(fixture.client.get(machine)).resolves.toMatchObject({ snapshot: { alerts: [] } });
    vi.useRealTimers();
    await fixture.close();
  });

  it('should tell a provider whether it connects for a binding or to keep one connected', async () => {
    const purposes: string[] = [];
    const lose = Promise.withResolvers<void>();
    const provider = fixtureProvider({
      id: 'binding-provider',
      candidates: [candidateA],
      async connect({ purpose }) {
        purposes.push(purpose);
        if (purposes.length > 1) {
          return fixtureSession();
        }
        return fixtureSession({
          async *observe() {
            yield { type: 'snapshot', snapshot: fixtureReport() };
            await lose.promise;
          },
        });
      },
    });
    const fixture = await openServedHost(await storeRoot(), provider, runtime);
    await bindAs(fixture, { candidateId: 'candidate-a', name: machineId, secretRef: 'vault:x1c' });
    useFakeTimers();
    lose.resolve();
    await vi.advanceTimersByTimeAsync(2000);
    await until(() => purposes.length === 2);
    expect(purposes).toEqual(['bind', 'reconnect']);
    vi.useRealTimers();
    await fixture.close();
  });

  it('should cancel a pending retry and abandon an attempt in flight when the host closes', async () => {
    const root = await storeRoot();
    await bindOnce(root);
    outcomes.push(new Error('FIXTURE_OFFLINE'));
    useFakeTimers();
    const pending = await openSupervised(root);
    expect(vi.getTimerCount()).toBe(2);
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
    await expect(fixture.host.removeBinding(machine)).resolves.toEqual({ status: 'removed', ...machine });
    expect(signal.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(connects).toHaveBeenCalledTimes(2);
    await fixture.close();
  });

  it('should leave a printer stale for a person when reconnecting would reset a controller that was running', async () => {
    const lose = Promise.withResolvers<void>();
    const resets = vi.fn();
    const running = fixtureReport({
      state: { status: 'active' },
      run: {
        runId: 'run-1',
        origin: 'external',
        delivery: 'streamed',
        state: 'running',
        progress: { basis: 'executed', counters: [] },
      },
    });
    const resetting = fixtureProvider({
      id: 'binding-provider',
      manifest: {
        ...machineManifestDefinitionFixture,
        connection: { ...machineManifestDefinitionFixture.connection, opening: 'resets-controller' },
      },
      candidates: [candidateA],
      async connect() {
        resets();
        return fixtureSession({
          getSnapshot: async () => running,
          async *observe() {
            yield { type: 'snapshot', snapshot: running };
            await lose.promise;
          },
        });
      },
    });
    const fixture = await openServedHost(await storeRoot(), resetting, runtime);
    await bindAs(fixture, { candidateId: 'candidate-a', name: machineId, secretRef: 'vault:x1c' });
    await expect(fixture.client.get(machine)).resolves.toMatchObject({ snapshot: { run: { state: 'running' } } });
    /* A streamed run the machine reports counts, with no job of this host behind it. */
    await expect(fixture.host.streamingMachines()).resolves.toEqual([{ machineId, name: machineId }]);
    useFakeTimers();
    lose.resolve();
    await until(() =>
      fixture.onError.mock.calls.some(
        ([error]: unknown[]) => (error as Error).message === 'MACHINE_RECONNECT_NEEDS_PERSON',
      ),
    );
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(resets).toHaveBeenCalledOnce();
    await expect(fixture.client.get(machine)).resolves.toMatchObject({
      freshness: 'stale',
      snapshot: { alerts: [{ code: 'tau.reconnect-required', remedies: [{ type: 'person' }] }] },
    });
    vi.useRealTimers();
    await fixture.close();
  });

  it('should never re-send an action whose reply was lost with the dropped session', async () => {
    apply.mockReset();
    const root = await storeRoot();
    await bindOnce(root);
    useFakeTimers();
    const fixture = await openServedHost(root, provider, runtime);
    const [first] = connections;
    await first!.observing;
    const revision = await revisionOf(fixture.client);
    const reply = Promise.withResolvers<MachineCommandReceipt>();
    apply.mockImplementationOnce(async () => reply.promise);
    const applying = fixture.client.applyAction(lightOn(revision, 'light-1', { requestedBy: operator }));
    await until(() => apply.mock.calls.length === 1);
    // The connection drops while the command is out; the new session waits until the command settles.
    first!.lose('disconnected');
    await expectAttemptAfter(2000);
    await vi.advanceTimersByTimeAsync(0);
    expect(observed).toHaveBeenCalledOnce();
    reply.resolve({ status: 'unknown', reason: 'reply-lost-after-possible-acceptance', observedAt });
    await expect(applying).resolves.toMatchObject({ operationId: 'light-1', status: 'unknown' });
    await connections[1]!.observing;
    await expect(fixture.client.get(machine)).resolves.toMatchObject({
      freshness: 'current',
      snapshot: { connection: 'connected' },
    });
    // The outcome stays unproven until the printer can say; nothing is sent again.
    await expect(fixture.client.reconcileOperation({ ...machine, operationId: 'light-1' })).resolves.toMatchObject({
      state: 'confirming',
    });
    expect(apply).toHaveBeenCalledOnce();
    vi.useRealTimers();
    await fixture.close();
    const journal = await readFile(join(root, machineId, 'journal.jsonl'), 'utf8');
    const sendings = journal
      .split('\n')
      .filter(
        (line) => line.includes('"type":"machine-operation-sending"') && line.includes('"operationId":"light-1"'),
      );
    expect(sendings).toHaveLength(1);
  });
});
