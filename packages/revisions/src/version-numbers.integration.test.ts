/**
 * Two devices that each make a version offline end with two numbers (blueprint
 * B6) — both legs, over a real wire.
 *
 * The witness is `git http-backend` (`#test/git-http-backend.js`) with a
 * `pre-receive` that refuses a version tag whose number another tag holds,
 * printing the taken-number marker first, as Tau Cloud's hook does
 * (`versionNumberCheckScript` in `apps/libs/api-git-core/src/git.constants.ts`,
 * which this package cannot import; its own suites test it). What is proved is
 * the device's half: the scheduler's push hears the refusal, gives its own
 * version that is not backed up the next free number, pushes again, and says
 * so once; the version already backed up keeps its number on both devices.
 */

import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { NodeFsProvider } from '@taucad/filesystem/backend/node';
import { createActor, toPromise } from 'xstate';
import { afterAll, describe, expect, it, vi } from 'vitest';

import { ImmutableRevisionTree, revisionId } from '#algorithms/index.js';
import { createRevisionHttpClient } from '#http-client.js';
import { createIsomorphicGitRevisionPort } from '#isomorphic-git-adapter.js';
import { createNativeGitRevisionPort } from '#native-git-port.js';
import { versionNumberTakenMarker } from '#refusal-markers.js';
import { createRevisionActors } from '#revision-effects.js';
import type { RevisionFileSystem } from '#revision-effects.js';
import type { RevisionPort } from '#revision-port.js';
import { selectSyncFacet, syncMachine } from '#sync.machine.js';
import type { SyncMachineEmitted } from '#sync.machine.js';
import { startGitHttpBackend } from '#test/git-http-backend.js';
import { recordedBy, testIdentity } from '#test/identity.js';
import { gitToolchainOnPath } from '#test/native-git-harness.js';

const projectId = 'proj_b6versionnumbers0000001';
const author = { name: 'Tau', email: 'noreply@tau.new' };
const mainRef = 'refs/heads/main';
const encoder = new TextEncoder();

const temporaryRoots: string[] = [];

afterAll(async () => {
  await Promise.all(temporaryRoots.map(async (root) => rm(root, { recursive: true, force: true })));
});

const temporaryRoot = async (label: string): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), `tau-b6-${label}-`));
  temporaryRoots.push(root);
  return root;
};

/*
 * Tau Cloud's rule, in a test's words: only a version — an annotated tag with
 * a `Tau-Tag` record carrying its id — may hold `refs/tags/v<n>`, and a push
 * that creates a number the remote already holds, or replaces its tag with
 * another version (another id), is refused behind the marker the client
 * matches. A rename keeps the id, so it passes.
 */
const versionNumberHook = `#!${process.execPath}
'use strict';
const { execFileSync } = require('node:child_process');
const git = (args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const zero = /^0+$/;
const pushed = require('node:fs').readFileSync(0, 'utf8').split('\\n').filter(Boolean).map((line) => line.split(' '));
const held = new Set(git(['for-each-ref', '--format=%(refname)', 'refs/tags/']).split('\\n').filter(Boolean));
const idOf = (oid) => {
  if (git(['cat-file', '-t', oid]) !== 'tag') return null;
  const line = git(['cat-file', 'tag', oid]).split('\\n').findLast((candidate) => candidate.startsWith('Tau-Tag: '));
  try {
    const record = JSON.parse(line.slice('Tau-Tag: '.length));
    return record.version === 2 && /^[0-9a-f]{32}$/.test(record.id) && record.name ? record.id : null;
  } catch {
    return null;
  }
};
let refused = false;
for (const [old, now, ref] of pushed) {
  const match = /^refs\\/tags\\/v([1-9][0-9]*)$/.exec(ref);
  if (match === null || zero.test(now)) continue;
  if (idOf(now) === null) {
    process.stderr.write('Tau: refused ' + ref + ' — a version tag must be an annotated tag with its Tau-Tag record.\\n');
    refused = true;
    continue;
  }
  const taken = match[1] === '1' || (zero.test(old) ? held.has(ref) : idOf(old) === null || idOf(old) !== idOf(now));
  if (taken) {
    process.stderr.write(${JSON.stringify(versionNumberTakenMarker)} + ' — ' + ref + ' names V' + match[1] + ': another version already holds its number.\\n');
    refused = true;
  }
}
process.exitCode = refused ? 1 : 0;
`;

type Leg = Readonly<{
  name: string;
  port: (root: string, filesystem: RevisionFileSystem, remoteUrl: string) => RevisionPort;
}>;

const legs: readonly Leg[] = [
  {
    name: 'isomorphic-git',
    port: (_root, filesystem) =>
      createIsomorphicGitRevisionPort({
        filesystem,
        http: createRevisionHttpClient({ authorization: () => 'Bearer session-token' }),
        checkouts: { projectId, root: () => filesystem },
      }),
  },
  {
    name: 'native git',
    port: (root, _filesystem, remoteUrl) =>
      createNativeGitRevisionPort({
        repositoryPath: root,
        remoteCredential: () => ({ repositoryUrl: remoteUrl, authorization: 'Bearer session-token' }),
      }),
  },
];

/**
 * One device: a project directory, a port over it, and a scheduler factory
 * that records what the scheduler said.
 *
 * @param leg - The port this device speaks through.
 * @param label - Names its temporary directory and its device id.
 * @param remoteUrl - The remote every device backs up to.
 * @returns The device.
 */
const device = async (leg: Leg, label: string, remoteUrl: string) => {
  const root = await temporaryRoot(label);
  const filesystem: RevisionFileSystem = new NodeFsProvider(root);
  const leggedPort = leg.port(root, filesystem, remoteUrl);
  /* Every ref each push offered, in order, so a row can say what a retry carried. */
  const offers: string[][] = [];
  const port: RevisionPort = {
    ...leggedPort,
    push: async (input) => {
      offers.push(input.refs.map((ref) => ref.name));
      return leggedPort.push(input);
    },
  };
  await port.init({ author });
  await port.setRemote({ name: 'tau', url: remoteUrl });
  const actors = createRevisionActors({
    port,
    projectId,
    filesystem: () => filesystem,
    deviceId: () => `device-${label}`,
    identity: testIdentity,
  });
  const said: Array<Extract<SyncMachineEmitted, { type: 'versionsRenumbered' }>> = [];
  /**
   * Run the scheduler until it reports the project backed up, with one push asked for.
   *
   * @param head - The revision `main` names, which the push request carries.
   */
  const sync = async (head: string | undefined): Promise<void> => {
    const scheduler = createActor(syncMachine.provide({ actors: actors.sync }), {
      input: {
        projectId,
        debounceMilliseconds: 5,
        retryMilliseconds: 30_000,
        pullRenderMilliseconds: 20,
        pullDeadlineMilliseconds: 25_000,
      },
    });
    scheduler.on('versionsRenumbered', (event) => said.push(event));
    scheduler.start();
    try {
      if (head !== undefined) {
        scheduler.send({
          type: 'revisionMinted',
          checkoutId: 'live',
          trigger: 'save',
          revisionId: head,
          branch: 'main',
        });
      }
      await vi.waitFor(
        () => {
          expect(selectSyncFacet(scheduler.getSnapshot()).state).toBe('backedUp');
        },
        { timeout: 30_000 },
      );
    } finally {
      scheduler.stop();
    }
  };
  const numbers = async (): Promise<Record<string, number | undefined>> => {
    const tags = await port.listTags();
    return Object.fromEntries(tags.map((tag) => [tag.name, tag.number]));
  };
  return { port, actors, sync, said, numbers, offers };
};

describe.runIf(gitToolchainOnPath).each(legs)('version numbers across two devices — $name', (leg) => {
  it('gives two versions made offline on two devices two numbers, says so once on the device that moved, and backs up a rename at the same number', async () => {
    const remoteRoot = await temporaryRoot('remote');
    const remote = await startGitHttpBackend({ root: remoteRoot });
    const hook = join(remote.repositoryPath, 'hooks', 'pre-receive');
    await writeFile(hook, versionNumberHook);
    await chmod(hook, 0o755);
    try {
      const one = await device(leg, 'a', remote.url);
      const receipt = await one.port.writeRevision({
        parents: [],
        tree: new ImmutableRevisionTree([['lid.scad', encoder.encode('cube(10);\n')]]),
        provenance: { source: 'user', ...recordedBy('actor-b6'), createdAt: Date.UTC(2026, 10, 11, 9, 0, 0) },
        summary: { generated: 'Lid' },
      });
      const head = receipt.commitId;
      await one.port.updateRef({ name: mainRef, expectedHead: undefined, head: revisionId(head) });
      await one.sync(head);

      /* Device B has the project too, then both go offline and each names a version. */
      const two = await device(leg, 'b', remote.url);
      await two.sync(undefined);
      expect(await two.port.readRef(mainRef)).toBe(head);
      const hinge = await one.port.tag({
        name: 'Hinge pin',
        revisionId: revisionId(head),
        note: 'Hinge',
        createdAt: 1000,
      });
      /* The same entry in the same second: only the id tells the two versions apart (R1). */
      const lid = await two.port.tag({
        name: 'Lid fit',
        revisionId: revisionId(head),
        note: 'Lid fit',
        createdAt: 1000,
      });
      expect(lid.id).not.toBe(hinge.id);
      expect([hinge.number, lid.number]).toStrictEqual([2, 2]);

      /* A backs up first and keeps V2. */
      await one.sync(head);
      expect(one.said).toStrictEqual([]);

      /* B's V2 is refused as taken: it becomes V3, is backed up, and B says so once. */
      const offeredBefore = two.offers.length;
      await two.sync(head);
      /* The retry offers the moved version at V3 and no longer offers its old ref (R5). */
      const retry = two.offers.slice(offeredBefore).find((names) => names.includes('refs/tags/v3'));
      expect(retry).toBeDefined();
      expect(retry).not.toContain('refs/tags/v2');
      expect(two.said).toStrictEqual([
        { type: 'versionsRenumbered', renumbered: [{ name: 'Lid fit', from: 2, to: 3 }] },
      ]);
      expect(await two.numbers()).toStrictEqual({ 'Hinge pin': 2, 'Lid fit': 3 });

      /* A's next sync brings B's version with its new number; nothing A backed up moved. */
      await one.sync(undefined);
      expect(await one.numbers()).toStrictEqual({ 'Hinge pin': 2, 'Lid fit': 3 });
      expect(one.said).toStrictEqual([]);

      /* Another sync on B says nothing more: the number stays where its backup put it. */
      await two.sync(head);
      expect(two.said).toHaveLength(1);
      expect(await two.numbers()).toStrictEqual({ 'Hinge pin': 2, 'Lid fit': 3 });
      expect(await remote.git(['for-each-ref', '--format=%(refname)', 'refs/tags/'])).toBe(
        'refs/tags/v2\nrefs/tags/v3',
      );

      /* A renames its backed-up V2: the tag is rewritten at the same ref, backed up as an
       * update the remote accepts, and B reads the new name under the same number. */
      await one.port.tag({ number: 2, name: 'Hinge pin, final', revisionId: revisionId(head) });
      await one.sync(head);
      expect(one.said).toStrictEqual([]);
      expect(await remote.git(['cat-file', 'tag', 'refs/tags/v2'])).toContain('"name":"Hinge pin, final"');
      await two.sync(undefined);
      expect(await two.numbers()).toStrictEqual({ 'Hinge pin, final': 2, 'Lid fit': 3 });
      expect(two.said).toHaveLength(1);

      /* Both rename V2 at once, and A backs up first: B's rename is refused, the remote's name
       * wins on B, and B never offers its own again under the lease it then holds (R4). */
      await one.port.tag({ number: 2, name: 'Hinge pin, A', revisionId: revisionId(head) });
      await two.port.tag({ number: 2, name: 'Hinge pin, B', revisionId: revisionId(head) });
      await one.sync(head);
      await two.sync(head);
      expect(await two.numbers()).toStrictEqual({ 'Hinge pin, A': 2, 'Lid fit': 3 });
      await two.sync(head);
      expect(await remote.git(['cat-file', 'tag', 'refs/tags/v2'])).toContain('"name":"Hinge pin, A"');
      expect(await two.numbers()).toStrictEqual({ 'Hinge pin, A': 2, 'Lid fit': 3 });
      expect(two.said).toHaveLength(1);
    } finally {
      await remote.close();
    }
  }, 180_000);

  it.each([
    { tag: 'v2', next: 3 },
    { tag: 'v1', next: 2 },
  ])(
    'backs up main past a local $tag that is not a version, never offers it, and numbers the next version V$next',
    async ({ tag, next }) => {
      const remoteRoot = await temporaryRoot(`remote-foreign-${tag}`);
      const remote = await startGitHttpBackend({ root: remoteRoot });
      const hook = join(remote.repositoryPath, 'hooks', 'pre-receive');
      await writeFile(hook, versionNumberHook);
      await chmod(hook, 0o755);
      try {
        const one = await device(leg, `foreign-${tag}`, remote.url);
        const first = await one.port.writeRevision({
          parents: [],
          tree: new ImmutableRevisionTree([['lid.scad', encoder.encode('cube(10);\n')]]),
          provenance: { source: 'user', ...recordedBy('actor-b6'), createdAt: Date.UTC(2026, 10, 11, 9, 0, 0) },
          summary: { generated: 'Lid' },
        });
        await one.port.updateRef({ name: mainRef, expectedHead: undefined, head: revisionId(first.commitId) });
        await one.sync(first.commitId);

        /* What `git tag <tag>` in the project's folder leaves: a lightweight tag at the head. */
        const foreign = `refs/tags/${tag}`;
        await one.port.updateRef({ name: foreign, expectedHead: undefined, head: revisionId(first.commitId) });
        const second = await one.port.writeRevision({
          parents: [revisionId(first.commitId)],
          tree: new ImmutableRevisionTree([['lid.scad', encoder.encode('cube(20);\n')]]),
          provenance: { source: 'user', ...recordedBy('actor-b6'), createdAt: Date.UTC(2026, 10, 11, 10, 0, 0) },
          summary: { generated: 'Bigger lid' },
        });
        await one.port.updateRef({
          name: mainRef,
          expectedHead: revisionId(first.commitId),
          head: revisionId(second.commitId),
        });
        const offeredBefore = one.offers.length;
        await one.sync(second.commitId);
        expect(await remote.git(['rev-parse', mainRef])).toBe(second.commitId);
        expect(one.offers.slice(offeredBefore).flat()).not.toContain(foreign);

        /* The tag stays on the device and keeps its number (T1); the next version is numbered above it. */
        expect(await one.port.readRef(foreign)).toBe(first.commitId);
        const version = await one.port.tag({ name: 'Ready for print', revisionId: revisionId(second.commitId) });
        expect(version.number).toBe(next);
        await one.sync(second.commitId);
        expect(await remote.git(['for-each-ref', '--format=%(refname)', 'refs/tags/'])).toBe(`refs/tags/v${next}`);
      } finally {
        await remote.close();
      }
    },
    120_000,
  );

  it('finishes a move that stopped after its new tag was written, and takes no other number (R6)', async () => {
    const remoteRoot = await temporaryRoot('remote-r6');
    const remote = await startGitHttpBackend({ root: remoteRoot });
    const hook = join(remote.repositoryPath, 'hooks', 'pre-receive');
    await writeFile(hook, versionNumberHook);
    await chmod(hook, 0o755);
    try {
      const one = await device(leg, 'r6a', remote.url);
      const receipt = await one.port.writeRevision({
        parents: [],
        tree: new ImmutableRevisionTree([['lid.scad', encoder.encode('cube(10);\n')]]),
        provenance: { source: 'user', ...recordedBy('actor-b6'), createdAt: Date.UTC(2026, 10, 11, 9, 0, 0) },
        summary: { generated: 'Lid' },
      });
      const head = receipt.commitId;
      await one.port.updateRef({ name: mainRef, expectedHead: undefined, head: revisionId(head) });
      await one.sync(head);
      const two = await device(leg, 'r6b', remote.url);
      await two.sync(undefined);

      /* B names V2 offline; A backs up its own V2 first. */
      const lid = await two.port.tag({ name: 'Lid fit', revisionId: revisionId(head), createdAt: 2000 });
      await one.port.tag({ name: 'Hinge pin', revisionId: revisionId(head), createdAt: 1000 });
      await one.sync(head);
      /* B's earlier move to V3 wrote the new tag and stopped before V2 was let go. */
      await two.port.tag({
        id: lid.id,
        number: 3,
        name: lid.name,
        revisionId: lid.revisionId,
        createdAt: lid.createdAt,
      });

      await two.sync(head);
      expect(await two.numbers()).toStrictEqual({ 'Hinge pin': 2, 'Lid fit': 3 });
      const listed = await two.port.listTags();
      expect(listed.find((tag) => tag.number === 3)?.id).toBe(lid.id);
      expect(await remote.git(['for-each-ref', '--format=%(refname)', 'refs/tags/'])).toBe(
        'refs/tags/v2\nrefs/tags/v3',
      );
      expect(two.said).toStrictEqual([
        { type: 'versionsRenumbered', renumbered: [{ name: 'Lid fit', from: 2, to: 3 }] },
      ]);
    } finally {
      await remote.close();
    }
  }, 180_000);

  it('gives a rename the remote refused back to the remote, and never offers it again (R4)', async () => {
    const remoteRoot = await temporaryRoot('remote-r4');
    const remote = await startGitHttpBackend({ root: remoteRoot });
    const hook = join(remote.repositoryPath, 'hooks', 'pre-receive');
    await writeFile(hook, versionNumberHook);
    await chmod(hook, 0o755);
    try {
      const one = await device(leg, 'r4a', remote.url);
      const receipt = await one.port.writeRevision({
        parents: [],
        tree: new ImmutableRevisionTree([['lid.scad', encoder.encode('cube(10);\n')]]),
        provenance: { source: 'user', ...recordedBy('actor-b6'), createdAt: Date.UTC(2026, 10, 11, 9, 0, 0) },
        summary: { generated: 'Lid' },
      });
      const head = receipt.commitId;
      await one.port.updateRef({ name: mainRef, expectedHead: undefined, head: revisionId(head) });
      await one.port.tag({ name: 'Base cut', revisionId: revisionId(head) });
      await one.sync(head);
      const two = await device(leg, 'r4b', remote.url);
      await two.sync(undefined);
      expect(await two.numbers()).toStrictEqual({ 'Base cut': 2 });

      /* A renames V2 and backs it up; B renames it too and pushes without fetching first. */
      await one.port.tag({ number: 2, name: 'From A', revisionId: revisionId(head) });
      await one.sync(head);
      await two.port.tag({ number: 2, name: 'From B', revisionId: revisionId(head) });
      const offeredBefore = two.offers.length;
      const pushed = await toPromise(
        createActor(two.actors.sync.push, {
          input: { remote: 'tau', branch: 'main', leases: { [mainRef]: head } },
        }).start(),
      );

      /* The remote's name won on B, nothing B renamed reached the remote, and the retry did not offer V2. */
      expect(pushed.refs).toContainEqual(expect.objectContaining({ name: 'refs/tags/v2', status: 'upToDate' }));
      expect(await two.numbers()).toStrictEqual({ 'From A': 2 });
      expect(await remote.git(['cat-file', 'tag', 'refs/tags/v2'])).toContain('"name":"From A"');
      const offered = two.offers.slice(offeredBefore);
      expect(offered[0]).toContain('refs/tags/v2');
      for (const retry of offered.slice(1)) {
        expect(retry).not.toContain('refs/tags/v2');
      }

      /* And a later sync on B leaves A's name alone. */
      await two.sync(head);
      expect(await remote.git(['cat-file', 'tag', 'refs/tags/v2'])).toContain('"name":"From A"');
      expect(two.said).toStrictEqual([]);
    } finally {
      await remote.close();
    }
  }, 180_000);

  it('keeps a rename the remote did not touch when only another ref of the atomic push moved (N3)', async () => {
    const remote = await startGitHttpBackend({
      root: await temporaryRoot('remote-n3'),
      /* Moves `main` after the advertisement, inside the receive, before its compare-and-set. */
      preReceive: [
        'if [ -f tau-move-main ]; then',
        '  env -u GIT_QUARANTINE_PATH git update-ref refs/heads/main "$(cat tau-move-main)"',
        '  rm tau-move-main',
        'fi',
      ],
    });
    try {
      const one = await device(leg, 'n3a', remote.url);
      const write = async (body: string, parents: readonly string[], second: number): Promise<string> => {
        const receipt = await one.port.writeRevision({
          parents: parents.map((parent) => revisionId(parent)),
          tree: new ImmutableRevisionTree([['lid.scad', encoder.encode(body)]]),
          provenance: { source: 'user', ...recordedBy('actor-b6'), createdAt: Date.UTC(2026, 10, 11, 9, 0, second) },
          summary: { generated: 'Lid' },
        });
        return receipt.commitId;
      };
      const head = await write('cube(10);\n', [], 0);
      await one.port.updateRef({ name: mainRef, expectedHead: undefined, head: revisionId(head) });
      await one.port.tag({ name: 'Base cut', revisionId: revisionId(head) });
      await one.sync(head);

      /* A renames V2 and records a new entry; another writer moves the remote's `main` inside the receive. */
      await one.port.tag({ number: 2, name: 'Renamed on A', revisionId: revisionId(head) });
      const next = await write('cube(12);\n', [head], 1);
      await one.port.updateRef({ name: mainRef, expectedHead: revisionId(head), head: revisionId(next) });
      const other = await remote.git([
        '-c',
        'user.name=Another writer',
        '-c',
        'user.email=another@example.test',
        'commit-tree',
        await remote.git(['rev-parse', `${head}^{tree}`]),
        '-p',
        head,
        '-m',
        'Another writer',
      ]);
      await writeFile(join(remote.repositoryPath, 'tau-move-main'), `${other}\n`);
      const pushed = await toPromise(
        createActor(one.actors.sync.push, {
          input: { remote: 'tau', branch: 'main', leases: { [mainRef]: head } },
        }).start(),
      );

      /* Nothing landed, the remote never renamed V2, so A keeps its rename to offer again. */
      expect(pushed.refs).toContainEqual(expect.objectContaining({ name: mainRef, status: 'rejected' }));
      expect(pushed.refs).toContainEqual(
        expect.objectContaining({ name: 'refs/tags/v2', status: 'rejected', reason: 'leaseLost' }),
      );
      await expect(remote.git(['rev-parse', mainRef])).resolves.toBe(other);
      expect(await remote.git(['cat-file', 'tag', 'refs/tags/v2'])).toContain('"name":"Base cut"');
      expect(await one.numbers()).toStrictEqual({ 'Renamed on A': 2 });
    } finally {
      await remote.close();
    }
  }, 180_000);
});
