/**
 * The operation log (D15): which operations *Undo* may reverse, and one log per
 * actor form, each under a record device no other form shares (EQ10 (a)).
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NodeFsProvider } from '@taucad/filesystem/backend/node';
import { afterAll, describe, expect, it } from 'vitest';

import { ImmutableRevisionTree, revisionId } from '#algorithms/index.js';
import { createIsomorphicGitRevisionPort } from '#isomorphic-git-adapter.js';
import { createOpsLog, opsRefName, opsRefPrefix, undoCandidates } from '#ops-ref.js';
import type { OpsEntry } from '#ops-ref.js';
import type { RevisionUserActor } from '#revision-authority.js';

const roots: string[] = [];

afterAll(async () => {
  await Promise.all(roots.map(async (root) => rm(root, { recursive: true, force: true })));
});

const main = 'refs/heads/main';

const entry = (to: string, fields: Partial<OpsEntry> = {}): OpsEntry => ({
  v: 1,
  ref: main,
  to,
  kind: 'save',
  actor: 'user-1',
  at: 1,
  ...fields,
});

describe('undoCandidates', () => {
  it('offers the newest cut on the line first and passes over moves, undos, undone operations and the skipped cut', () => {
    const entries = [
      entry('r1'),
      entry('r2', { kind: 'restore' }),
      entry('r3', { kind: 'move' }),
      entry('r4'),
      entry('r5', { undoes: 'r4' }),
      entry('r6', { ref: 'refs/heads/feature' }),
      entry('r7', { kind: 'turn' }),
    ];

    expect(undoCandidates(entries, main).map((candidate) => candidate.to)).toEqual(['r7', 'r2', 'r1']);
    expect(undoCandidates(entries, main, 'r7').map((candidate) => candidate.to)).toEqual(['r2', 'r1']);
  });

  /* RV-W7 #7: a merge made here cannot be undone, and Undo never reaches past it. */
  it('ends the walk at the newest merge, offering it last so the caller can refuse there', () => {
    const entries = [entry('r1'), entry('r2', { kind: 'merge' }), entry('r3', { kind: 'move' }), entry('r4')];

    expect(undoCandidates(entries, main).map((candidate) => [candidate.to, candidate.kind])).toEqual([
      ['r4', 'save'],
      ['r2', 'merge'],
    ]);
  });

  it('treats D2’s Undo restore as the undo of the restore it reversed', () => {
    const entries = [entry('r1'), entry('r2', { kind: 'restore' }), entry('r3', { kind: 'restore', undoes: 'r2' })];

    expect(undoCandidates(entries, main).map((candidate) => candidate.to)).toEqual(['r1']);
  });
});

describe('createOpsLog', () => {
  const account: RevisionUserActor = { kind: 'user', id: 'user-1', name: 'Ada' };
  const pseudonym: RevisionUserActor = { kind: 'user', id: 'anon:3f2a', anonymous: true };

  const harness = async () => {
    const root = await mkdtemp(join(tmpdir(), 'tau-ops-ref-'));
    roots.push(root);
    const filesystem = new NodeFsProvider(root);
    const port = createIsomorphicGitRevisionPort({ filesystem });
    await port.init({ author: { name: 'Tau', email: 'noreply@tau.new' } });
    const open = () =>
      createOpsLog({ port, recordsFileSystem: async () => filesystem, now: () => 2, actorId: 'tau-host' });
    return { port, open, filesystem };
  };

  it('keeps one log per actor form, under record devices that are neither shared nor the host device id', async () => {
    const { port, open } = await harness();
    const log = open();

    await log.append(account, entry('r1', { actor: account.id }));
    await log.append(pseudonym, entry('r2', { actor: pseudonym.id }));
    await log.append(account, entry('r3', { actor: account.id }));

    const accountDevice = await log.deviceFor(account);
    const pseudonymDevice = await log.deviceFor(pseudonym);
    expect(accountDevice).not.toBe(pseudonymDevice);
    expect(accountDevice).toMatch(/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/u);
    const logs = await port.listRefs(opsRefPrefix);
    expect(logs.map((ref) => ref.name).toSorted()).toEqual(
      [opsRefName(accountDevice), opsRefName(pseudonymDevice)].toSorted(),
    );
    const accountLog = await log.read(account);
    const pseudonymLog = await log.read(pseudonym);
    expect(accountLog.map((line) => [line.to, line.actor])).toEqual([
      ['r1', account.id],
      ['r3', account.id],
    ]);
    expect(pseudonymLog.map((line) => [line.to, line.actor])).toEqual([['r2', pseudonym.id]]);

    /* The chat segment's shape: one append-only file per log, and each commit is by its own form. */
    const head = await port.readRef(opsRefName(pseudonymDevice));
    const tree = await port.readTree(head!);
    expect(tree?.entries().map((file) => file.path)).toEqual([`events/${pseudonymDevice}.jsonl`]);
    const commit = await port.readRevision(head!);
    expect(commit?.provenance.actorId).toBe(pseudonym.id);
  });

  it('reads the same record devices back in a new session', async () => {
    const { open } = await harness();
    const first = open();
    await first.append(account, entry('r1'));
    const device = await first.deviceFor(account);

    const second = open();

    await expect(second.deviceFor(account)).resolves.toBe(device);
    expect(await second.ownDevices()).toEqual(new Set([device]));
    const own = await second.read(account);
    expect(own.map((line) => line.to)).toEqual(['r1']);
  });

  /* RV-W7 #6: only a missing file is empty; one this host cannot read is never replaced. */
  it('refuses a device file it cannot read rather than replacing it', async () => {
    const { open, filesystem } = await harness();
    await filesystem.writeFile('.git/ops-devices.json', '{ not json');

    await expect(open().deviceFor(account)).rejects.toThrow();
    expect(await filesystem.readFile('.git/ops-devices.json', 'utf8')).toBe('{ not json');
  });

  /* RV-W7 #6: a second process's device is adopted inside the mint, never overwritten. */
  it('adopts the device another process minted for the same form', async () => {
    const { open } = await harness();
    const first = open();
    const second = open();
    /* Both have read the file before either minted. */
    expect(await first.ownDevices()).toEqual(new Set());
    expect(await second.ownDevices()).toEqual(new Set());

    const minted = await first.deviceFor(account);

    await expect(second.deviceFor(account)).resolves.toBe(minted);
  });

  /* RV-W7 #2: a full segment is sealed and never written again; the next line starts the next. */
  it('continues a full segment in the next one, leaving the sealed bytes as they were', async () => {
    const { port, open, filesystem } = await harness();
    const device = '1a2b3c4d-0000-4000-8000-000000000001';
    await filesystem.writeFile(
      '.git/ops-devices.json',
      JSON.stringify({ version: 1, devices: { [account.id]: device } }),
    );
    const sealed = Array.from({ length: 256 }, (_, index) => `${JSON.stringify(entry(`r${String(index)}`))}\n`).join(
      '',
    );
    const receipt = await port.writeRevision({
      parents: [],
      tree: new ImmutableRevisionTree([[`events/${device}.jsonl`, sealed]]),
      largeObjects: false,
      provenance: { source: 'user', actorId: account.id, createdAt: 1 },
      summary: { generated: 'Operation log' },
    });
    await port.updateRef({ name: opsRefName(device), expectedHead: undefined, head: revisionId(receipt.commitId) });
    const log = open();

    await log.append(account, entry('next'));

    const tree = await port.readTree((await port.readRef(opsRefName(device)))!);
    expect(tree?.entries().map((file) => file.path)).toEqual([`events/${device}.1.jsonl`, `events/${device}.jsonl`]);
    expect(new TextDecoder().decode(tree?.get(`events/${device}.jsonl`))).toBe(sealed);
    const read = await log.read(account);
    expect(read).toHaveLength(257);
    expect(read.at(-1)?.to).toBe('next');
  });

  /* RV-W7 #11: a refused device is retired; its form carries the log to a new one. */
  it('retires a device, carrying its log to a new one that stays this host’s own', async () => {
    const { port, open } = await harness();
    const log = open();
    await log.append(account, entry('r1'));
    await log.append(account, entry('r2'));
    const refused = await log.deviceFor(account);

    const successor = await log.retire(refused);

    expect(successor).toBeDefined();
    expect(successor).not.toBe(refused);
    await expect(log.deviceFor(account)).resolves.toBe(successor);
    expect(await log.currentDevices()).toEqual(new Set([successor]));
    expect(await log.ownDevices()).toEqual(new Set([refused, successor]));
    const carried = await log.read(account);
    expect(carried.map((line) => line.to)).toEqual(['r1', 'r2']);
    expect(await port.readRef(opsRefName(successor!))).toBeDefined();
    /* A new session reads the same answer back. */
    expect(await open().ownDevices()).toEqual(new Set([refused, successor]));
    await expect(log.retire('00000000-0000-4000-8000-000000000000')).resolves.toBeUndefined();
  });
});
