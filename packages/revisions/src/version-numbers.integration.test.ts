/**
 * Two devices that each name a version offline end with two numbers (blueprint
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
import { createActor } from 'xstate';
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
 * Tau Cloud's rule, in a test's words: a pushed version tag whose number
 * another tag holds after the push is refused behind the marker the client
 * matches. A Node hook, so the trailer is read through `JSON.parse` as the
 * server reads it.
 */
const versionNumberHook = `#!${process.execPath}
'use strict';
const { execFileSync } = require('node:child_process');
const git = (args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const pushed = require('node:fs').readFileSync(0, 'utf8').split('\\n').filter(Boolean).map((line) => line.split(' '));
const held = new Map(git(['for-each-ref', '--format=%(refname) %(objectname)', 'refs/tags/']).split('\\n').filter(Boolean).map((line) => line.split(' ')));
for (const [, now, ref] of pushed) {
  if (ref.startsWith('refs/tags/')) held.set(ref, now);
}
const numberOf = (oid) => {
  if (git(['cat-file', '-t', oid]) !== 'tag') return undefined;
  const line = git(['cat-file', 'tag', oid]).split('\\n').findLast((candidate) => candidate.startsWith('Tau-Tag: '));
  return line === undefined ? undefined : JSON.parse(line.slice('Tau-Tag: '.length)).number;
};
const numbers = new Map([...held].map(([ref, oid]) => [ref, numberOf(oid)]));
let refused = false;
for (const [, , ref] of pushed) {
  const number = numbers.get(ref);
  if (number !== undefined && [...numbers].some(([other, held]) => other !== ref && held === number)) {
    process.stderr.write(${JSON.stringify(versionNumberTakenMarker)} + ' — ' + ref + ' names V' + number + ': another version already holds its number.\\n');
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
  const port = leg.port(root, filesystem, remoteUrl);
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
  return { port, sync, said, numbers };
};

describe.runIf(gitToolchainOnPath).each(legs)('version numbers across two devices — $name', (leg) => {
  it('gives two versions named offline on two devices two numbers, and the device that moved says so once', async () => {
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
      const hinge = await one.port.tag({ name: 'hinge', revisionId: revisionId(head), note: 'Hinge', createdAt: 1000 });
      const lid = await two.port.tag({
        name: 'lid-fit',
        revisionId: revisionId(head),
        note: 'Lid fit',
        createdAt: 2000,
      });
      expect([hinge.number, lid.number]).toStrictEqual([2, 2]);

      /* A backs up first and keeps V2. */
      await one.sync(head);
      expect(one.said).toStrictEqual([]);

      /* B's V2 is refused as taken: it becomes V3, is backed up, and B says so once. */
      await two.sync(head);
      expect(two.said).toStrictEqual([
        { type: 'versionsRenumbered', renumbered: [{ name: 'lid-fit', from: 2, to: 3 }] },
      ]);
      expect(await two.numbers()).toStrictEqual({ hinge: 2, 'lid-fit': 3 });

      /* A's next sync brings B's version with its new number; nothing A backed up moved. */
      await one.sync(undefined);
      expect(await one.numbers()).toStrictEqual({ hinge: 2, 'lid-fit': 3 });
      expect(one.said).toStrictEqual([]);

      /* Another sync on B says nothing more: the number stays where its backup put it. */
      await two.sync(head);
      expect(two.said).toHaveLength(1);
      expect(await two.numbers()).toStrictEqual({ hinge: 2, 'lid-fit': 3 });
      expect(await remote.git(['for-each-ref', '--format=%(refname)', 'refs/tags/'])).toBe(
        'refs/tags/hinge\nrefs/tags/lid-fit',
      );
    } finally {
      await remote.close();
    }
  }, 180_000);
});
