/* oxlint-disable no-await-in-loop -- One git child after another. */
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { gitE2EApiUrl, gitE2ESecondaryApiUrl } from '#git/config.js';
import {
  basicAuthorization,
  deleteTauCloudOwner,
  gitE2EProjectId,
  queryDatabase,
  registerProject,
  runGit,
  seedProPlan,
  seedTauCloudOwner,
} from '#git/tau-cloud-fixture.js';
import type { TauCloudOwner } from '#git/tau-cloud-fixture.js';

/**
 * Charter D13 in the deployed shape: a push committed by one API process wakes
 * a long poll parked on the other, across Redis pub/sub, and the entry says
 * only which generation committed and which refs moved.
 */

type StreamPage = {
  readonly events: ReadonlyArray<{ readonly sequence: number; readonly payload: Record<string, unknown> }>;
  readonly nextSequence: number;
};

const scratchPaths: string[] = [];
const owners: TauCloudOwner[] = [];

const scratch = async (label: string): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), `tau-git-revision-stream-${label}-`));
  scratchPaths.push(directory);
  return directory;
};

const expectGit = async (args: readonly string[], cwd: string): Promise<void> => {
  const outcome = await runGit(args, cwd);
  expect(outcome.code, `git ${args.join(' ')}: ${outcome.stderr}`).toBe(0);
};

const push = async (target: Readonly<{ base: string; projectId: string; token: string }>, cwd: string) =>
  runGit(
    [
      '-c',
      `http.extraHeader=Authorization: ${basicAuthorization(target.token)}`,
      'push',
      `${target.base}/v1/git/${target.projectId}.git`,
      'HEAD:refs/heads/main',
    ],
    cwd,
  );

const poll = async (
  args: Readonly<{ base: string; projectId: string; token: string; afterSequence: number; longPollDuration: number }>,
): Promise<Response> => {
  const url = new URL(`${args.base}/v1/streams/${encodeURIComponent(`revision:${args.projectId}`)}/events`);
  url.searchParams.set('afterSequence', String(args.afterSequence));
  url.searchParams.set('longPollDuration', String(args.longPollDuration));
  return fetch(url, { headers: { authorization: `Bearer ${args.token}` } });
};

describe('the revision stream (D13)', () => {
  let owner: TauCloudOwner;
  let reader: TauCloudOwner;
  let stranger: TauCloudOwner;

  beforeAll(async () => {
    owner = await seedTauCloudOwner('d13-owner');
    owners.push(owner);
    await seedProPlan(owner);
    reader = await seedTauCloudOwner('d13-reader');
    owners.push(reader);
    stranger = await seedTauCloudOwner('d13-stranger');
    owners.push(stranger);
  }, 600_000);

  afterAll(async () => {
    for (const account of owners) {
      await deleteTauCloudOwner(account);
    }
    for (const directory of scratchPaths) {
      await rm(directory, { recursive: true, force: true });
    }
  }, 600_000);

  it('wakes a read collaborator on the other process within 5 s, and nobody else', async () => {
    const projectId = gitE2EProjectId();
    await registerProject(owner, projectId);
    await queryDatabase(
      `INSERT INTO project_collaborator (project_id, user_id, role, invited_by) ` +
        `VALUES ('${projectId}', '${reader.userId}', 'read', '${owner.userId}');`,
    );

    const stranded = await poll({
      base: gitE2ESecondaryApiUrl,
      projectId,
      token: stranger.token,
      afterSequence: 0,
      longPollDuration: 0,
    });
    expect(stranded.status).toBe(404);

    /* Parked on the secondary before anything is pushed to the primary. */
    const parked = poll({
      base: gitE2ESecondaryApiUrl,
      projectId,
      token: reader.token,
      afterSequence: 0,
      longPollDuration: 20_000,
    });

    const tree = await scratch('owner');
    await expectGit(['init', '-q', '--initial-branch=main', '.'], tree);
    await expectGit(['config', 'user.email', owner.email], tree);
    await expectGit(['config', 'user.name', 'D13 Owner'], tree);
    await writeFile(join(tree, 'model.scad'), 'cube([1, 1, 1]);\n', 'utf8');
    await expectGit(['add', '.'], tree);
    await expectGit(['commit', '-qm', 'owner revision'], tree);
    const pushed = await push({ base: gitE2EApiUrl, projectId, token: owner.token }, tree);
    expect(pushed.code, pushed.stderr).toBe(0);
    const acknowledged = Date.now();

    const woken = await parked;
    const latency = Date.now() - acknowledged;
    expect(woken.status).toBe(200);
    const page = (await woken.json()) as StreamPage;
    expect(page.events).toEqual([
      expect.objectContaining({ sequence: 1, payload: { generation: 1, refs: ['refs/heads/main'] } }),
    ]);
    expect(latency, 'B6: the second device hears of the push within 5 s').toBeLessThan(5000);

    /* A refused push commits nothing, so nothing is announced. */
    await writeFile(join(tree, 'model.scad'), 'cube([2, 2, 2]);\n', 'utf8');
    await expectGit(['commit', '-aqm', 'reader revision'], tree);
    const refused = await push({ base: gitE2EApiUrl, projectId, token: reader.token }, tree);
    expect(refused.code, 'a read collaborator must not be able to push').not.toBe(0);
    const after = await poll({
      base: gitE2EApiUrl,
      projectId,
      token: reader.token,
      afterSequence: page.nextSequence,
      longPollDuration: 0,
    });
    expect(((await after.json()) as StreamPage).events).toEqual([]);
  }, 900_000);
});
