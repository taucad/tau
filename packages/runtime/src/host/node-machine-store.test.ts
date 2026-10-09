import { execFileSync } from 'node:child_process';
import { lstat, mkdir, mkdtemp, readFile, readdir, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MessageChannel } from 'node:worker_threads';

import { afterEach, describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { z } from 'zod';

import type { CacheValue, ContentDigest } from '@taucad/cache-core';
import { cloneBoundedJson } from '@taucad/parameters/json';

import { createHostAdmissionAuthority } from '#host/host-admission.js';
import { createNodeMachineEventLog } from '#host/node-machine-event-log.js';
import {
  machineIdCandidate,
  machineSlug,
  machineStoreFileName,
  openNodeMachineStore,
} from '#host/node-machine-store.js';
import type { NewMachineBindingRecord, NodeMachineStore } from '#host/node-machine-store.js';
import { createNodeMachineHost } from '#host/node.js';
import { connectMachineChannel } from '#machines/machine-channel.js';
import type { MachineChannelHostOperations } from '#machines/machine-channel.js';
import type { MachineJob, MachinePreparedJob } from '#machines/machine-jobs.js';
import type { MachineSnapshot } from '#machines/machine-observation.js';
import { fixtureDescriptor, fixtureReport } from '#machines/machine-session.fixture.js';
import type { MachineArtifactReference, MachineCandidate, MachineDescriptor } from '#machines/machine.js';

const temporaryDirectories: string[] = [];
const stores: Array<NodeMachineStore<Operation>> = [];

afterEach(async () => {
  await Promise.allSettled(stores.splice(0).map(async (store) => store.close()));
  await Promise.all(temporaryDirectories.splice(0).map(async (path) => rm(path, { recursive: true, force: true })));
});

const temporaryDirectory = async (): Promise<string> => {
  const path = await mkdtemp(join(tmpdir(), 'tau-machine-store-'));
  temporaryDirectories.push(path);
  return path;
};

const operationSchema = z.strictObject({ type: z.literal('fixture'), value: z.string() });
type Operation = z.infer<typeof operationSchema>;
const observedAt = '2026-09-14T00:00:00.000Z';
const digest = (digit: string): ContentDigest => `sha256:${digit.repeat(64)}` as ContentDigest;
const descriptorFor = (physicalId: string): MachineDescriptor => {
  const reported = fixtureDescriptor(physicalId);
  return {
    ...reported,
    name: 'Fixture X1C',
    capabilities: { ...reported.capabilities, revision: digest('9'), incarnation: 'incarnation-1' },
  };
};
const snapshot: MachineSnapshot = { ...fixtureReport({ observedAt }), operations: [] };
const candidateFor = (id: string, serial: string, seenAt = observedAt): MachineCandidate => ({
  id,
  name: `Printer ${id}`,
  endpoint: { transport: 'network', address: `${id}.local`, interface: 'manual' },
  claimedIdentity: { serial, model: 'X1C' },
  observedAt: seenAt,
  expiresAt: '2026-09-14T00:01:00.000Z',
});
const bindingFor = (name: string, physicalId: string): NewMachineBindingRecord => ({
  name,
  providerId: 'bambu',
  physicalId,
  candidate: candidateFor(`candidate-${physicalId}`, physicalId),
  configuration: {},
  connection: {
    secretRef: `vault:machine/bambu/${physicalId}`,
    serviceTrust: { mqtt: { type: 'pinned', digest: digest('1') } },
  },
  boundAt: observedAt,
  last: { descriptor: descriptorFor(physicalId), snapshot, observedAt },
});
const artifact: MachineArtifactReference = {
  projectId: 'proj_0123456789abcdefghijK',
  path: '.tau/artifacts/2222/part.gcode.3mf',
  digest: digest('2'),
  length: 128,
  mediaType: 'application/vnd.bambulab.gcode-3mf',
  contract: { id: 'manufacturing.toolpath.bambu-gcode-3mf', version: 1 },
  selectedMember: 'Metadata/plate_1.gcode',
};
const preparedFor = (machineId: string, preparedId: string, expiresAt: string): MachinePreparedJob => ({
  preparedId,
  preparedDigest: digest('3'),
  configurationDigest: digest('4'),
  providerDataDigest: digest('6'),
  setupDigest: digest('5'),
  machineId,
  physicalMachineId: 'physical-1',
  artifact,
  remoteName: `tau-${preparedId}.gcode.3mf`,
  parser: { id: 'fixture-parser', version: '1' },
  preparedAt: observedAt,
  expiresAt,
});
const jobFor = (machineId: string, jobId: string, state: MachineJob['state'] = 'awaiting-approval'): MachineJob => ({
  version: 1,
  jobId,
  machineId,
  artifact,
  configuration: {},
  requestedBy: { kind: 'agent', id: 'agent-1', label: 'Tau agent' },
  state,
  createdAt: observedAt,
  updatedAt: observedAt,
  program: { name: 'part.gcode.3mf', facts: { process: 'fff' } },
  checks: [],
});

const openStore = async (
  storeRoot: string,
  options: Readonly<{ now?: string; legacyStoreRoots?: readonly string[] }> = {},
) => {
  const onError = vi.fn();
  const store = await openNodeMachineStore<Operation>({
    storeRoot,
    legacyStoreRoots: options.legacyStoreRoots ?? [],
    parseOperation: (value) => operationSchema.parse(value),
    now: () => options.now ?? observedAt,
    onError,
  });
  stores.push(store);
  const close = async (): Promise<void> => {
    stores.splice(stores.indexOf(store), 1);
    await store.close();
  };
  return { store, onError, close };
};

// Fixture journals hold plain JSON; the bounded clone is the parser an older host's replay applied.
const plainJson = (value: unknown): CacheValue =>
  cloneBoundedJson(value, {
    code: 'FIXTURE_JSON',
    maximumDepth: 64,
    maximumNodes: 100_000,
    maximumCharacters: 1_000_000,
  });

/** Write a legacy journal as an older host did, in the event log's frame format. */
const writeLegacyJournal = async (root: string, events: readonly CacheValue[]): Promise<string> => {
  const directory = join(root, 'authority');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const log = await createNodeMachineEventLog({
    directory,
    fileName: 'machine-events.jsonl',
    owner: {
      assertCurrent() {
        /* The fixture writes the legacy journal before any host owns the store. */
      },
    },
    parse: plainJson,
  });
  for (const event of events) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- the journal is written in order.
    await log.append(event);
  }
  await log.close();
  return join(directory, 'machine-events.jsonl');
};

/**
 * Two legacy journals with D10's cases: host and project scopes, a removed binding, one printer bound twice, a torn
 * tail, and requests and effects still in flight.
 */
const writeMigrationJournals = async (
  root: string,
  desktop: string,
): Promise<Readonly<{ storeJournal: string; desktopJournal: string }>> => {
  const hostScope = 'a'.repeat(64);
  const projectScope = 'b'.repeat(64);
  const binding = ({
    workspaceId,
    machineId,
    physicalId,
    seenAt = observedAt,
  }: Readonly<{ workspaceId: string; machineId: string; physicalId: string; seenAt?: string }>) => ({
    type: 'machine-binding-committed',
    workspaceId,
    machineId,
    providerId: 'bambu',
    physicalId,
    candidate: candidateFor(`candidate-${machineId}`, physicalId, seenAt),
    configuration: {},
    connection: { secretRef: `vault:machine/bambu/${physicalId}`, serviceTrust: {} },
  });
  const upsert = (workspaceId: string, machineId: string, physicalId: string): CacheValue =>
    plainJson({
      type: 'machine-directory-upserted',
      hostId: 'host',
      authorityId: 'authority',
      workspaceId,
      revision: 1,
      entry: { machineId, providerId: 'bambu', descriptor: descriptorFor(physicalId), snapshot, freshness: 'current' },
    });
  const effect = (type: string, operationId: string): CacheValue => ({ type, operationId });
  const result = (operationId: string, status: string): CacheValue => ({
    type: 'machine-effect-result',
    operationId,
    receipt: { status },
  });
  const storeJournal = await writeLegacyJournal(root, [
    { type: 'host-authority-initialized', hostId: 'host', authorityId: 'authority', generation: 'generation-1' },
    binding({ workspaceId: hostScope, machineId: 'Workshop X1C', physicalId: 'physical-host' }),
    upsert(hostScope, 'Workshop X1C', 'physical-host'),
    binding({ workspaceId: projectScope, machineId: 'studio-x1c', physicalId: 'physical-project' }),
    binding({ workspaceId: projectScope, machineId: 'Old X1C', physicalId: 'physical-removed' }),
    { type: 'machine-binding-removed', workspaceId: projectScope, machineId: 'Old X1C' },
    binding({
      workspaceId: projectScope,
      machineId: 'Twice early',
      physicalId: 'physical-twice',
      seenAt: '2026-09-13T00:00:00.000Z',
    }),
    binding({
      workspaceId: hostScope,
      machineId: 'Twice late',
      physicalId: 'physical-twice',
      seenAt: '2026-09-14T00:00:00.000Z',
    }),
    {
      type: 'machine-print-request',
      workspaceId: projectScope,
      request: { requestId: 'request-1', state: 'awaiting-approval' },
    },
    {
      type: 'machine-print-request',
      workspaceId: projectScope,
      request: { requestId: 'request-2', state: 'started' },
    },
    effect('machine-effect-intent', 'upload-1'),
    effect('machine-effect-sending', 'upload-1'),
    effect('machine-effect-intent', 'start-1'),
    effect('machine-effect-sending', 'start-1'),
    result('start-1', 'unknown'),
    effect('machine-effect-intent', 'start-2'),
    effect('machine-effect-sending', 'start-2'),
    result('start-2', 'accepted'),
    effect('machine-effect-intent', 'pause-1'),
  ]);
  const desktopJournal = await writeLegacyJournal(desktop, [
    binding({ workspaceId: projectScope, machineId: 'Desk X1C', physicalId: 'physical-desktop' }),
  ]);
  // A torn tail is ignored, never repaired, and drops nothing that was committed.
  await writeFile(desktopJournal, `${await readFile(desktopJournal, 'utf8')}{"partial":`);
  return { storeJournal, desktopJournal };
};

/** One legacy binding of a printer to the fixture provider. */
const legacyBinding = (machineId: string, physicalId: string): CacheValue => ({
  type: 'machine-binding-committed',
  workspaceId: 'workspace',
  machineId,
  providerId: 'bambu',
  physicalId,
  candidate: candidateFor(`candidate-${physicalId}`, physicalId),
  configuration: {},
  connection: { secretRef: `vault:machine/bambu/${physicalId}`, serviceTrust: {} },
});

const mode = async (path: string): Promise<number> => {
  const status = await stat(path);
  // oxlint-disable-next-line eslint/no-bitwise -- POSIX permission bits are a bit mask.
  return status.mode & 0o777;
};

const sortedEntries = async (path: string): Promise<string[]> => {
  const names = await readdir(path);
  return names.toSorted();
};

/** Open and close a store once, as a host start that ends cleanly. */
const initializeStore = async (root: string): Promise<void> => {
  const { close } = await openStore(root);
  await close();
};

const invalidPaths = (onError: ReturnType<typeof vi.fn>): string[] =>
  onError.mock.calls.flatMap(([error]: unknown[]) =>
    error instanceof Error && error.message === 'MACHINE_STORE_RECORD_INVALID'
      ? [String((error.cause as { path: unknown }).path)]
      : [],
  );

describe.runIf(process.platform === 'darwin' || process.platform === 'linux')('machine store', () => {
  it('should write every record 0600 in a 0700 directory and read each back after a restart', async () => {
    const root = await temporaryDirectory();
    const first = await openStore(root);
    const { record, log } = await first.store.createMachine(bindingFor('Workshop X1C', 'physical-1'));
    expect(record).toMatchObject({ version: 1, id: 'workshop-x1c', name: 'Workshop X1C', physicalId: 'physical-1' });
    await log.append({ type: 'fixture', value: 'effect' });
    const preparation = await first.store.writePreparation({
      version: 1,
      prepared: preparedFor('workshop-x1c', 'prepared-1', '2026-09-14T00:10:00.000Z'),
      providerId: 'bambu',
      configuration: { plate: 1 },
      providerData: { memberMd5: 'fixture' },
    });
    const job = await first.store.writeJob(jobFor('workshop-x1c', 'request-1'));
    await first.close();

    const machine = join(root, 'workshop-x1c');
    expect(await mode(machine)).toBe(0o700);
    expect(await mode(join(machine, 'preparations'))).toBe(0o700);
    expect(await mode(join(machine, 'jobs'))).toBe(0o700);
    for (const file of [
      join(root, 'store.json'),
      join(machine, 'machine.json'),
      join(machine, 'journal.jsonl'),
      join(machine, 'preparations', 'prepared-1.json'),
      join(machine, 'jobs', 'request-1.json'),
    ]) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- each file is checked on its own.
      expect(await mode(file), file).toBe(0o600);
    }
    expect(JSON.parse(await readFile(join(root, 'store.json'), 'utf8'))).toEqual({ version: 1 });
    expect(JSON.parse(await readFile(join(machine, 'machine.json'), 'utf8'))).toMatchObject({
      version: 1,
      id: 'workshop-x1c',
      name: 'Workshop X1C',
      connection: { secretRef: 'vault:machine/bambu/physical-1' },
      last: { descriptor: { id: 'physical-1' }, observedAt },
    });
    expect(JSON.parse(await readFile(join(machine, 'jobs', 'request-1.json'), 'utf8'))).toEqual(job);
    const leftovers = await readdir(machine);
    expect(leftovers.filter((name) => name.endsWith('.tmp'))).toEqual([]);

    const second = await openStore(root);
    expect(second.store.machines).toHaveLength(1);
    const [loaded] = second.store.machines;
    expect(loaded?.record).toEqual(record);
    expect(loaded?.preparations).toEqual([preparation]);
    expect(loaded?.jobs).toEqual([job]);
    expect(loaded?.operations.status).toBe('open');
    if (loaded?.operations.status === 'open') {
      await expect(loaded.operations.log.replay({ cursor: 0, limit: 10 })).resolves.toMatchObject({
        records: [{ event: { type: 'fixture', value: 'effect' } }],
      });
    }
    expect(second.onError).not.toHaveBeenCalled();
    const testing = await second.store.writeMachine({ ...record, testing: true });
    await second.close();
    const third = await openStore(root);
    expect(third.store.machines[0]?.record).toEqual(testing);
    expect(testing.testing).toBe(true);
  });

  it('should give each new machine the first free slug of its name and keep the name', async () => {
    expect(machineSlug('Workshop X1C')).toBe('workshop-x1c');
    expect(machineSlug('  Café Ünïcode!! ')).toBe('cafe-unicode');
    expect(machineSlug('X1C — Garage')).toBe('x1c-garage');
    expect(machineSlug('???')).toBe('machine');
    expect(machineSlug('a'.repeat(80))).toBe('a'.repeat(63));
    expect(machineIdCandidate('a'.repeat(63), 12)).toBe(`${'a'.repeat(60)}-12`);
    expect(machineIdCandidate(`${'a'.repeat(59)}-bcd`, 2)).toBe(`${'a'.repeat(59)}-b-2`);

    const root = await temporaryDirectory();
    const { store } = await openStore(root);
    const created = [];
    for (const [name, physicalId] of [
      ['Workshop X1C', 'physical-1'],
      ['workshop x1c', 'physical-2'],
      ['Authority', 'physical-3'],
      ['???', 'physical-4'],
      ['a'.repeat(80), 'physical-5'],
      ['a'.repeat(70), 'physical-6'],
    ] as const) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- ids are claimed one at a time.
      const { record } = await store.createMachine(bindingFor(name, physicalId));
      created.push([record.id, record.name]);
    }
    expect(created).toEqual([
      ['workshop-x1c', 'Workshop X1C'],
      ['workshop-x1c-2', 'workshop x1c'],
      ['authority-2', 'Authority'],
      ['machine', '???'],
      ['a'.repeat(63), 'a'.repeat(80)],
      [`${'a'.repeat(61)}-2`, 'a'.repeat(70)],
    ]);
  });

  it('should name a record file by its id only when the id is path-safe', async () => {
    expect(machineStoreFileName('request-1')).toBe('request-1.json');
    expect(machineStoreFileName('a_b-9')).toBe('a_b-9.json');
    // Upper case would share a file with lower case on a case-insensitive volume, and a hashed name is never an id.
    for (const unsafe of ['../escape', 'a.b', 'a/b', 'a'.repeat(129), 'ünïcode', 'A_b-9', `sha256-${'0'.repeat(32)}`]) {
      expect(machineStoreFileName(unsafe)).toMatch(/^sha256-[\da-f]{32}\.json$/u);
    }
    expect(machineStoreFileName('../escape')).not.toBe(machineStoreFileName('../escapf'));

    const root = await temporaryDirectory();
    const first = await openStore(root);
    await first.store.createMachine(bindingFor('Workshop X1C', 'physical-1'));
    const escaping = jobFor('workshop-x1c', '../../escape');
    await first.store.writeJob(escaping);
    await first.close();
    expect(await readdir(join(root, 'workshop-x1c', 'jobs'))).toEqual([machineStoreFileName('../../escape')]);
    expect(await sortedEntries(root)).toEqual(['authority', 'store.json', 'workshop-x1c']);
    const second = await openStore(root);
    expect(second.store.machines[0]?.jobs).toEqual([escaping]);
  });

  it('should keep two job ids that differ only in case apart', async () => {
    const root = await temporaryDirectory();
    const first = await openStore(root);
    await first.store.createMachine(bindingFor('Workshop X1C', 'physical-1'));
    const upper = await first.store.writeJob(jobFor('workshop-x1c', 'job-A', 'started'));
    const lower = await first.store.writeJob(jobFor('workshop-x1c', 'job-a'));
    await first.close();
    expect(await sortedEntries(join(root, 'workshop-x1c', 'jobs'))).toHaveLength(2);
    const second = await openStore(root);
    expect(second.store.machines[0]?.jobs).toEqual(expect.arrayContaining([upper, lower]));
    expect(second.store.machines[0]?.jobs).toHaveLength(2);
    expect(second.onError).not.toHaveBeenCalled();
  });

  it('should report each unreadable record, skip it and never write over its bytes', async () => {
    const root = await temporaryDirectory();
    const outside = await temporaryDirectory();
    const first = await openStore(root);
    await first.store.createMachine(bindingFor('Printer A', 'physical-a'));
    await first.store.createMachine(bindingFor('Printer B', 'physical-b'));
    await first.store.writeJob(jobFor('printer-a', 'request-1'));
    await first.store.writePreparation({
      version: 1,
      prepared: preparedFor('printer-a', 'prepared-1', '2026-09-14T00:10:00.000Z'),
      providerId: 'bambu',
      configuration: {},
      providerData: {},
    });
    await first.close();
    const requests = join(root, 'printer-a', 'jobs');
    await writeFile(join(requests, 'request-1.json'), 'not json');
    await writeFile(join(root, 'printer-b', 'machine.json'), '{"version":2}');
    await writeFile(join(root, 'printer-a', 'preparations', 'prepared-1.json'), '{"version":1}');
    // A valid record reached through a link is refused like any other.
    await writeFile(join(outside, 'request-2.json'), JSON.stringify(jobFor('printer-a', 'request-2')));
    await symlink(join(outside, 'request-2.json'), join(requests, 'request-2.json'));
    // A job filed under the wrong name is refused too: its file name is not its id.
    await writeFile(join(requests, 'request-9.json'), JSON.stringify(jobFor('printer-a', 'request-3')));

    const second = await openStore(root);
    expect(second.store.machines.map(({ record }) => record.id)).toEqual(['printer-a']);
    expect(second.store.machines[0]?.jobs).toEqual([]);
    expect(second.store.machines[0]?.preparations).toEqual([]);
    expect(invalidPaths(second.onError).toSorted()).toEqual([
      'printer-a/jobs/request-1.json',
      'printer-a/jobs/request-2.json',
      'printer-a/jobs/request-9.json',
      'printer-a/preparations/prepared-1.json',
      'printer-b/machine.json',
    ]);
    await expect(second.store.writeJob(jobFor('printer-a', 'request-1'))).rejects.toThrow(
      'MACHINE_STORE_RECORD_INVALID',
    );
    await expect(second.store.writeJob(jobFor('printer-b', 'request-4'))).rejects.toThrow(
      'MACHINE_STORE_UNKNOWN_MACHINE',
    );
    await second.store.writeJob(jobFor('printer-a', 'request-5'));
    expect(await readFile(join(requests, 'request-1.json'), 'utf8')).toBe('not json');
    expect(await readFile(join(root, 'printer-b', 'machine.json'), 'utf8')).toBe('{"version":2}');
    const link = await lstat(join(requests, 'request-2.json'));
    expect(link.isSymbolicLink()).toBe(true);
  });

  it('should drop a last-known identity with an unknown key or an out-of-bounds value and keep its binding', async () => {
    const root = await temporaryDirectory();
    const first = await openStore(root);
    await first.store.createMachine(bindingFor('Printer A', 'physical-a'));
    await first.store.createMachine(bindingFor('Printer B', 'physical-b'));
    await first.close();
    const edit = async (id: string, from: string, to: string): Promise<string> => {
      const path = join(root, id, 'machine.json');
      const text = await readFile(path, 'utf8');
      expect(text).toContain(from);
      const edited = text.replace(from, to);
      await writeFile(path, edited);
      return edited;
    };
    const unknownKey = await edit('printer-a', '"firmware": ', '"extra": true,\n      "firmware": ');
    const oversized = await edit('printer-b', '"name": "Fixture X1C"', `"name": "${'x'.repeat(257)}"`);
    const second = await openStore(root);
    expect(second.store.machines.map(({ record }) => [record.id, record.last])).toEqual([
      ['printer-a', undefined],
      ['printer-b', undefined],
    ]);
    expect(second.onError).not.toHaveBeenCalled();
    expect(await readFile(join(root, 'printer-a', 'machine.json'), 'utf8')).toBe(unknownKey);
    expect(await readFile(join(root, 'printer-b', 'machine.json'), 'utf8')).toBe(oversized);
  });

  it('should read a binding stored before endpoints named their transport as a network one', async () => {
    const root = await temporaryDirectory();
    const first = await openStore(root);
    await first.store.createMachine(bindingFor('Printer A', 'physical-a'));
    await first.close();
    const path = join(root, 'printer-a', 'machine.json');
    const stored = JSON.parse(await readFile(path, 'utf8')) as { candidate: { endpoint: Record<string, unknown> } };
    delete stored.candidate.endpoint['transport'];
    await writeFile(path, JSON.stringify(stored, undefined, 2));
    const second = await openStore(root);
    expect(second.store.machines.map(({ record }) => record.candidate.endpoint)).toEqual([
      { transport: 'network', address: 'candidate-physical-a.local', interface: 'manual' },
    ]);
    expect(second.onError).not.toHaveBeenCalled();
  });

  it("should refuse a FIFO in a record's place without waiting on it", async () => {
    const root = await temporaryDirectory();
    const first = await openStore(root);
    await first.store.createMachine(bindingFor('Workshop X1C', 'physical-1'));
    await first.store.writeJob(jobFor('workshop-x1c', 'request-1'));
    await first.close();
    execFileSync('mkfifo', [join(root, 'workshop-x1c', 'jobs', 'request-2.json')]);
    const second = await openStore(root);
    expect(second.store.machines[0]?.jobs.map(({ jobId }) => jobId)).toEqual(['request-1']);
    expect(invalidPaths(second.onError)).toEqual(['workshop-x1c/jobs/request-2.json']);
  });

  it('should delete expired preparations when it opens', async () => {
    const root = await temporaryDirectory();
    const first = await openStore(root);
    await first.store.createMachine(bindingFor('Workshop X1C', 'physical-1'));
    for (const [preparedId, expiresAt] of [
      ['prepared-expired', '2026-09-14T00:10:00.000Z'],
      ['prepared-current', '2026-09-14T01:00:00.000Z'],
    ] as const) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- preparations are written one at a time.
      await first.store.writePreparation({
        version: 1,
        prepared: preparedFor('workshop-x1c', preparedId, expiresAt),
        providerId: 'bambu',
        configuration: {},
        providerData: {},
      });
    }
    await first.close();
    const second = await openStore(root, { now: '2026-09-14T00:30:00.000Z' });
    expect(second.store.machines[0]?.preparations.map(({ prepared }) => prepared.preparedId)).toEqual([
      'prepared-current',
    ]);
    expect(await readdir(join(root, 'workshop-x1c', 'preparations'))).toEqual(['prepared-current.json']);
  });

  it('should refuse a store from a newer version without keeping its lock', async () => {
    const root = await temporaryDirectory();
    await initializeStore(root);
    await writeFile(join(root, 'store.json'), '{"version":2}');
    await expect(openStore(root)).rejects.toThrow('MACHINE_STORE_RECORD_INVALID');
    expect(await readFile(join(root, 'store.json'), 'utf8')).toBe('{"version":2}');
    await writeFile(join(root, 'store.json'), '{"version":1}');
    await expect(openStore(root)).resolves.toMatchObject({ store: { machines: [] } });
  });

  it('should let one host own a store at a time', async () => {
    const root = await temporaryDirectory();
    const owner = await openStore(root);
    await expect(openStore(root)).rejects.toMatchObject({ code: 'AUTHORITY_ALREADY_OWNED' });
    await owner.close();
    await expect(openStore(root)).resolves.toMatchObject({ store: { machines: [] } });
  });

  it('should move a removed machine aside with its history and free its id', async () => {
    const root = await temporaryDirectory();
    const removedAt = Date.parse(observedAt);
    const first = await openStore(root);
    await first.store.createMachine(bindingFor('Workshop X1C', 'physical-1'));
    await first.store.writeJob(jobFor('workshop-x1c', 'request-1', 'started'));
    await first.store.removeMachine('workshop-x1c');
    const history = join(root, `workshop-x1c.removed-${removedAt}`);
    expect(await sortedEntries(history)).toEqual(['jobs', 'journal.jsonl', 'machine.json']);
    expect(await readdir(join(history, 'jobs'))).toEqual(['request-1.json']);
    await expect(first.store.writeJob(jobFor('workshop-x1c', 'request-2'))).rejects.toThrow(
      'MACHINE_STORE_UNKNOWN_MACHINE',
    );
    // The id is free again, and a second removal in the same millisecond keeps both histories.
    const { record } = await first.store.createMachine(bindingFor('Workshop X1C', 'physical-2'));
    expect(record.id).toBe('workshop-x1c');
    await first.store.removeMachine('workshop-x1c');
    await first.close();
    expect(await sortedEntries(root)).toEqual([
      'authority',
      'store.json',
      `workshop-x1c.removed-${removedAt}`,
      `workshop-x1c.removed-${removedAt}-2`,
    ]);
    const second = await openStore(root);
    expect(second.store.machines).toEqual([]);
    expect(second.onError).not.toHaveBeenCalled();
  });

  it('should release an empty machine directory a crash left and report one without its binding', async () => {
    const root = await temporaryDirectory();
    await initializeStore(root);
    await mkdir(join(root, 'half-bound'), { mode: 0o700 });
    // The crash came mid-write: only the temporary file of the first `machine.json` is there.
    await writeFile(join(root, 'half-bound', '.machine.json.00000000-0000-4000-8000-000000000000.tmp'), '{"version":1');
    await mkdir(join(root, 'orphan'), { mode: 0o700 });
    await writeFile(join(root, 'orphan', 'journal.jsonl'), '');
    const { store, onError } = await openStore(root);
    expect(store.machines).toEqual([]);
    expect(invalidPaths(onError)).toEqual(['orphan/machine.json']);
    expect(await sortedEntries(root)).toEqual(['authority', 'orphan', 'store.json']);
    const { record } = await store.createMachine(bindingFor('Half bound', 'physical-1'));
    expect(record.id).toBe('half-bound');
  });

  it('should open every readable operations log and mark only an unreadable one', async () => {
    const root = await temporaryDirectory();
    const first = await openStore(root);
    for (const [name, physicalId] of [
      ['Printer A', 'physical-a'],
      ['Printer B', 'physical-b'],
    ] as const) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- machines are created one at a time.
      const { log } = await first.store.createMachine(bindingFor(name, physicalId));
      // oxlint-disable-next-line eslint/no-await-in-loop -- one append per machine.
      await log.append({ type: 'fixture', value: name });
    }
    await first.close();
    const corrupt = join(root, 'printer-a', 'journal.jsonl');
    const bytes = `not a frame\n${await readFile(corrupt, 'utf8')}`;
    await writeFile(corrupt, bytes);
    const second = await openStore(root);
    const [printerA, printerB] = second.store.machines;
    expect(printerA?.operations).toMatchObject({
      status: 'corrupt',
      error: { message: 'MACHINE_OPERATIONS_LOG_CORRUPT' },
    });
    expect(printerB?.operations.status).toBe('open');
    expect(await readFile(corrupt, 'utf8')).toBe(bytes);
  });

  it('should import the latest binding of each printer from every legacy journal once and count what it drops', async () => {
    const root = await temporaryDirectory();
    const desktop = await temporaryDirectory();
    const { storeJournal, desktopJournal } = await writeMigrationJournals(root, desktop);
    const before = [await readFile(storeJournal), await readFile(desktopJournal)];

    const first = await openStore(root, { legacyStoreRoots: [desktop, root], now: '2026-09-26T08:00:00.000Z' });
    const imported = first.store.machines.map(({ record, jobs }) => ({
      id: record.id,
      name: record.name,
      physicalId: record.physicalId,
      last: record.last?.descriptor.id,
      jobs: jobs.length,
    }));
    expect(imported).toEqual([
      { id: 'desk-x1c', name: 'Desk X1C', physicalId: 'physical-desktop', last: undefined, jobs: 0 },
      { id: 'studio-x1c', name: 'studio-x1c', physicalId: 'physical-project', last: undefined, jobs: 0 },
      { id: 'twice-late', name: 'Twice late', physicalId: 'physical-twice', last: undefined, jobs: 0 },
      { id: 'workshop-x1c', name: 'Workshop X1C', physicalId: 'physical-host', last: 'physical-host', jobs: 0 },
    ]);
    expect(first.store.machines.find(({ record }) => record.id === 'workshop-x1c')?.record).toMatchObject({
      boundAt: observedAt,
      connection: { secretRef: 'vault:machine/bambu/physical-host' },
      last: { snapshot, observedAt: '2026-09-26T08:00:00.000Z' },
    });
    expect(JSON.parse(await readFile(join(root, 'store.json'), 'utf8'))).toEqual({
      version: 1,
      migrated: { at: '2026-09-26T08:00:00.000Z', journals: 2, machines: 4, droppedRequests: 1, droppedEffects: 2 },
    });
    expect(first.onError).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        message: 'MACHINE_STORE_MIGRATION_DROPPED',
        cause: { requests: 1, effects: 2, journals: 0 },
      }),
    );
    expect([await readFile(storeJournal), await readFile(desktopJournal)]).toEqual(before);
    await first.close();

    // With `store.json` written, the legacy journals are never read again.
    const second = await openStore(root, { legacyStoreRoots: [desktop] });
    expect(second.store.machines).toHaveLength(4);
    expect(second.onError).not.toHaveBeenCalled();
  });

  it('should list every migrated binding, stale until its printer reports', async () => {
    const root = await temporaryDirectory();
    const desktop = await temporaryDirectory();
    await writeMigrationJournals(root, desktop);
    const host = await createNodeMachineHost({
      storeRoot: root,
      legacyStoreRoots: [desktop],
      hostId: 'host',
      authorityId: 'authority',
      admission: createHostAdmissionAuthority({ hostId: 'host' }),
      providers: [],
      operations: mock<MachineChannelHostOperations>(),
      onError: vi.fn(),
    });
    const ports = new MessageChannel();
    host.serve({
      port: ports.port1,
      session: host.issueSession({
        actor: { kind: 'user', id: 'operator' },
        grants: [{ route: 'machines', operation: 'machines.list' }],
      }),
    });
    const client = connectMachineChannel(ports.port2);
    try {
      const { entries } = await client.list({});
      // Only the printer with a usable legacy entry shows it; the others show their binding until they connect.
      expect(
        entries.map(({ machineId, name, freshness, descriptor, snapshot: reported }) => ({
          machineId,
          name,
          freshness,
          id: descriptor.id,
          firmware: descriptor.firmware,
          actions: descriptor.capabilities.actions.length,
          connection: reported.connection,
        })),
      ).toEqual([
        {
          machineId: 'desk-x1c',
          name: 'Desk X1C',
          freshness: 'stale',
          id: 'physical-desktop',
          firmware: 'unknown',
          actions: 0,
          connection: 'disconnected',
        },
        {
          machineId: 'studio-x1c',
          name: 'studio-x1c',
          freshness: 'stale',
          id: 'physical-project',
          firmware: 'unknown',
          actions: 0,
          connection: 'disconnected',
        },
        {
          machineId: 'twice-late',
          name: 'Twice late',
          freshness: 'stale',
          id: 'physical-twice',
          firmware: 'unknown',
          actions: 0,
          connection: 'disconnected',
        },
        {
          machineId: 'workshop-x1c',
          name: 'Workshop X1C',
          freshness: 'stale',
          id: 'physical-host',
          firmware: '01.00.00.00',
          actions: 4,
          connection: 'connected',
        },
      ]);
    } finally {
      client.close();
      await host.close();
    }
  });

  it('should report a legacy journal whose bad frame hides the records after it', async () => {
    const root = await temporaryDirectory();
    const journal = await writeLegacyJournal(root, [
      legacyBinding('Workshop X1C', 'physical-1'),
      legacyBinding('Garage X1C', 'physical-2'),
      legacyBinding('Studio X1C', 'physical-3'),
    ]);
    const frames = await readFile(journal, 'utf8');
    const [first = '', second = '', third = ''] = frames.split('\n');
    const damaged = `${first}\n${second.replace('Garage', 'Garaje')}\n${third}\n`;
    await writeFile(journal, damaged);
    const { store, onError } = await openStore(root);
    expect(store.machines.map(({ record }) => record.id)).toEqual(['workshop-x1c']);
    expect(onError).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        message: 'MACHINE_STORE_MIGRATION_DROPPED',
        cause: { requests: 0, effects: 0, journals: 1 },
      }),
    );
    expect(await readFile(journal, 'utf8')).toBe(damaged);
  });

  it('should refuse a legacy journal reached through a link', async () => {
    const root = await temporaryDirectory();
    const elsewhere = await temporaryDirectory();
    const journal = await writeLegacyJournal(elsewhere, [legacyBinding('Linked X1C', 'physical-1')]);
    await mkdir(join(root, 'authority'), { mode: 0o700 });
    await symlink(journal, join(root, 'authority', 'machine-events.jsonl'));
    const { store, onError } = await openStore(root);
    expect(store.machines).toEqual([]);
    expect(onError).toHaveBeenCalledOnce();
    expect(onError.mock.calls[0]?.[0]).toMatchObject({
      message: 'MACHINE_STORE_RECORD_INVALID',
      cause: { path: 'authority/machine-events.jsonl', error: { code: 'ELOOP' } },
    });
  });

  it('should re-import after a crash before store.json under the same ids, keeping each machine already written', async () => {
    const root = await temporaryDirectory();
    await writeLegacyJournal(root, [
      legacyBinding('Workshop X1C', 'physical-1'),
      plainJson({
        type: 'machine-directory-upserted',
        hostId: 'host',
        authorityId: 'authority',
        workspaceId: 'workspace',
        revision: 1,
        entry: {
          machineId: 'Workshop X1C',
          providerId: 'bambu',
          descriptor: descriptorFor('physical-1'),
          snapshot,
          freshness: 'current',
        },
      }),
      legacyBinding('Garage X1C', 'physical-2'),
    ]);
    await initializeStore(root);
    const written = await readFile(join(root, 'workshop-x1c', 'machine.json'));
    // A crash before `store.json`, mid-write of the second machine: its directory holds only the temporary file.
    await rm(join(root, 'store.json'));
    await rm(join(root, 'garage-x1c'), { recursive: true });
    await mkdir(join(root, 'garage-x1c'), { mode: 0o700 });
    await writeFile(join(root, 'garage-x1c', '.machine.json.00000000-0000-4000-8000-000000000000.tmp'), '{"version":1');
    // A later clock would change a rewritten record's `last.observedAt`: the written machine is kept as it is.
    const second = await openStore(root, { now: '2026-09-26T08:00:00.000Z' });
    expect(second.store.machines.map(({ record }) => [record.id, record.physicalId])).toEqual([
      ['garage-x1c', 'physical-2'],
      ['workshop-x1c', 'physical-1'],
    ]);
    expect(await readFile(join(root, 'workshop-x1c', 'machine.json'))).toEqual(written);
    expect(await sortedEntries(join(root, 'garage-x1c'))).toEqual(['journal.jsonl', 'machine.json']);
    expect(second.onError).not.toHaveBeenCalled();
    await second.close();
    const third = await openStore(root);
    expect(third.store.machines).toHaveLength(2);
    expect(third.onError).not.toHaveBeenCalled();
  });
});
