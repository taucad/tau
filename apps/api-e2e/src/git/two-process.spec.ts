/* oxlint-disable no-await-in-loop -- Every loop here drives one `git` child after another on purpose. */
import { randomFillSync } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { gitE2EApiUrl, gitE2ESecondaryApiUrl } from '#git/config.js';
import {
  basicAuthorization,
  deleteTauCloudOwner,
  gitE2EProjectId,
  registerProject,
  runGit,
  seedProPlan,
  seedTauCloudOwner,
} from '#git/tau-cloud-fixture.js';
import type { TauCloudOwner } from '#git/tau-cloud-fixture.js';

/**
 * Success criterion S2, across two operating-system processes.
 *
 * `global-setup.ts` boots two complete API processes on two ports. They share
 * one PostgreSQL and one MinIO and nothing else: no volume, no lease directory,
 * no lock, no cached manifest — each hydrates its own lease under its own
 * `os.tmpdir()`. That is the deployed shape (`fly.*.toml` carries no
 * `[[mounts]]` and `app` runs at two or more Machines), and it is the shape the
 * in-process S2 suite (`apps/api/app/api/git/git.two-process.integration.test.ts`)
 * cannot reach: two Nest applications in one process still share the heap.
 *
 * Three rows, because three things must survive the crossing: the pack bytes, an
 * LFS object's bytes, and the authorization decision for somebody who is not the
 * owner.
 */

const workspaceKeeper: string[] = [];
const owners: TauCloudOwner[] = [];

const scratch = async (label: string): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), `tau-git-two-${label}-`));
  workspaceKeeper.push(directory);
  return directory;
};

/** The remote URL stock git is pointed at, against whichever process is named. */
const remoteUrlFor = (base: string, projectId: string): string => `${base}/v1/git/${projectId}.git`;

/**
 * The same URL with the credential in its userinfo, which is the form
 * `git-lfs` takes its credential from (it runs its own HTTP client).
 */
const credentialUrlFor = (base: string, projectId: string, token: string): string => {
  const url = new URL(`${base}/v1/git/${projectId}.git`);
  url.username = 'tau';
  url.password = token;
  return url.toString();
};

const expectGit = async (
  args: readonly string[],
  cwd: string,
): Promise<{ readonly code: number; readonly stdout: string; readonly stderr: string }> => {
  const outcome = await runGit(args, cwd);
  expect(outcome.code, `git ${args.join(' ')}: ${outcome.stderr}`).toBe(0);
  return outcome;
};

/** A tree with one commit, ready to push. */
const seedWorkingTree = async (label: string, files: Readonly<Record<string, string>>): Promise<string> => {
  const tree = await scratch(label);
  await expectGit(['init', '-q', '--initial-branch=main', '.'], tree);
  await expectGit(['config', 'user.email', 'w8@example.test'], tree);
  await expectGit(['config', 'user.name', 'W8 Two Process'], tree);
  for (const [path, content] of Object.entries(files)) {
    await writeFile(join(tree, path), content, 'utf8');
  }
  await expectGit(['add', '.'], tree);
  await expectGit(['commit', '-m', 'first revision'], tree);
  return tree;
};

/** Push `main` to one of the two processes, with the bearer stock git carries. */
const pushMainTo = async (
  target: Readonly<{ base: string; projectId: string; token: string }>,
  tree: string,
): Promise<{ readonly code: number; readonly stdout: string; readonly stderr: string }> =>
  runGit(
    [
      '-c',
      `http.extraHeader=Authorization: ${basicAuthorization(target.token)}`,
      'push',
      remoteUrlFor(target.base, target.projectId),
      'HEAD:refs/heads/main',
    ],
    tree,
  );

describe('two API processes over one object store (S2)', () => {
  let owner: TauCloudOwner;

  beforeAll(async () => {
    owner = await seedTauCloudOwner('two-owner');
    owners.push(owner);
    await seedProPlan(owner);
  }, 300_000);

  afterAll(async () => {
    for (const account of owners) {
      await deleteTauCloudOwner(account);
    }
    for (const directory of workspaceKeeper) {
      await rm(directory, { recursive: true, force: true });
    }
  }, 300_000);

  it('serves through the second process what stock git pushed through the first', async () => {
    const projectId = gitE2EProjectId();
    await registerProject(owner, projectId);
    const tree = await seedWorkingTree('push', { 'model.scad': 'cube([10, 10, 10]);\n' });

    const pushed = await pushMainTo({ base: gitE2EApiUrl, projectId, token: owner.token }, tree);
    expect(pushed.code, pushed.stderr).toBe(0);

    /* The clone reaches the second process, which has never seen this
     * repository: everything it answers with it read from the object store. */
    const into = await scratch('clone');
    const clone = join(into, 'clone');
    const cloned = await runGit(
      [
        '-c',
        `http.extraHeader=Authorization: ${basicAuthorization(owner.token)}`,
        'clone',
        '-q',
        remoteUrlFor(gitE2ESecondaryApiUrl, projectId),
        clone,
      ],
      into,
    );
    expect(cloned.code, cloned.stderr).toBe(0);
    const source = await expectGit(['rev-parse', 'HEAD'], tree);
    const target = await expectGit(['rev-parse', 'HEAD'], clone);
    expect(target.stdout.trim()).toBe(source.stdout.trim());

    /* And back the other way, so neither process is merely the writer or
     * merely the reader. */
    await writeFile(join(clone, 'model.scad'), 'cube([20, 20, 20]);\n', 'utf8');
    await expectGit(['config', 'user.email', 'w8@example.test'], clone);
    await expectGit(['config', 'user.name', 'W8 Two Process'], clone);
    await expectGit(['commit', '-aqm', 'second revision'], clone);
    const pushedBack = await pushMainTo({ base: gitE2ESecondaryApiUrl, projectId, token: owner.token }, clone);
    expect(pushedBack.code, pushedBack.stderr).toBe(0);

    const fetched = await runGit(
      [
        '-c',
        `http.extraHeader=Authorization: ${basicAuthorization(owner.token)}`,
        'fetch',
        '-q',
        remoteUrlFor(gitE2EApiUrl, projectId),
        'refs/heads/main',
      ],
      tree,
    );
    expect(fetched.code, fetched.stderr).toBe(0);
    const head = await expectGit(['rev-parse', 'FETCH_HEAD'], tree);
    const pushedHead = await expectGit(['rev-parse', 'HEAD'], clone);
    expect(head.stdout.trim()).toBe(pushedHead.stdout.trim());
  }, 600_000);

  it('round-trips an LFS object pushed through one process and pulled through the other', async () => {
    const projectId = gitE2EProjectId();
    await registerProject(owner, projectId);
    const tree = await scratch('lfs');
    await expectGit(['init', '-q', '--initial-branch=main', '.'], tree);
    await expectGit(['config', 'user.email', 'w8@example.test'], tree);
    await expectGit(['config', 'user.name', 'W8 Two Process'], tree);
    await expectGit(['lfs', 'install', '--local'], tree);
    await writeFile(join(tree, '.gitattributes'), '*.step filter=lfs diff=lfs merge=lfs -text\n', 'utf8');
    /* Small enough to keep the tier quick, large enough to be a real transfer
     * rather than a pointer git would have inlined anyway. */
    const large = Buffer.alloc(2 * 1024 * 1024);
    randomFillSync(large);
    await writeFile(join(tree, 'part.step'), large);
    await expectGit(['add', '.'], tree);
    await expectGit(['commit', '-m', 'large object'], tree);

    const pushed = await runGit(
      ['push', credentialUrlFor(gitE2EApiUrl, projectId, owner.token), 'HEAD:refs/heads/main'],
      tree,
    );
    expect(pushed.code, pushed.stderr).toBe(0);

    /* The batch endpoint the clone talks to belongs to the *other* process, so
     * the reservation rows and the presigned transfers both cross. */
    const into = await scratch('lfs-clone');
    const clone = join(into, 'clone');
    const cloned = await runGit(
      ['clone', '-q', credentialUrlFor(gitE2ESecondaryApiUrl, projectId, owner.token), clone],
      into,
    );
    expect(cloned.code, cloned.stderr).toBe(0);
    await expectGit(['lfs', 'install', '--local'], clone);
    const pulled = await runGit(['lfs', 'pull'], clone);
    expect(pulled.code, pulled.stderr).toBe(0);
    expect(Buffer.compare(await readFile(join(clone, 'part.step')), large)).toBe(0);
  }, 600_000);

  it('lets an accepted collaborator push through the second process', async () => {
    const projectId = gitE2EProjectId();
    await registerProject(owner, projectId);
    const tree = await seedWorkingTree('collaborator', { 'model.scad': 'sphere(r=5);\n' });
    const seeded = await pushMainTo({ base: gitE2EApiUrl, projectId, token: owner.token }, tree);
    expect(seeded.code, seeded.stderr).toBe(0);

    const collaborator = await seedTauCloudOwner('two-collaborator');
    owners.push(collaborator);

    /* The invitation is minted on one process and accepted on the other: the
     * token and the membership it grants are rows, not process state. */
    const invited = await fetch(`${gitE2EApiUrl}/v1/projects/${projectId}/collaborators`, {
      method: 'POST',
      headers: { authorization: `Bearer ${owner.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ email: collaborator.email, role: 'write' }),
    });
    expect(invited.status, await invited.clone().text()).toBe(201);
    const { token: invitationToken } = (await invited.json()) as { readonly token: string };

    const accepted = await fetch(`${gitE2ESecondaryApiUrl}/v1/invitations/${invitationToken}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${collaborator.token}` },
    });
    expect(accepted.status, await accepted.clone().text()).toBe(201);
    expect(await accepted.json()).toEqual(expect.objectContaining({ projectId, role: 'write' }));

    /* The collaborator has no plan of their own: the allowance a push is
     * measured against is the project owner's. */
    const into = await scratch('collaborator-clone');
    const clone = join(into, 'clone');
    const cloned = await runGit(
      [
        '-c',
        `http.extraHeader=Authorization: ${basicAuthorization(collaborator.token)}`,
        'clone',
        '-q',
        remoteUrlFor(gitE2ESecondaryApiUrl, projectId),
        clone,
      ],
      into,
    );
    expect(cloned.code, cloned.stderr).toBe(0);

    await expectGit(['config', 'user.email', 'collaborator@example.test'], clone);
    await expectGit(['config', 'user.name', 'W8 Collaborator'], clone);
    await writeFile(join(clone, 'model.scad'), 'sphere(r=7);\n', 'utf8');
    await expectGit(['commit', '-aqm', 'collaborator revision'], clone);
    const pushed = await pushMainTo({ base: gitE2ESecondaryApiUrl, projectId, token: collaborator.token }, clone);
    expect(pushed.code, pushed.stderr).toBe(0);

    const fetched = await runGit(
      [
        '-c',
        `http.extraHeader=Authorization: ${basicAuthorization(owner.token)}`,
        'fetch',
        '-q',
        remoteUrlFor(gitE2EApiUrl, projectId),
        'refs/heads/main',
      ],
      tree,
    );
    expect(fetched.code, fetched.stderr).toBe(0);
    const collaboratorHead = await expectGit(['rev-parse', 'HEAD'], clone);
    const ownerSees = await expectGit(['rev-parse', 'FETCH_HEAD'], tree);
    expect(ownerSees.stdout.trim()).toBe(collaboratorHead.stdout.trim());
  }, 600_000);
});
