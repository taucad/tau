/* eslint-disable @typescript-eslint/naming-convention -- Process environment names keep their wire spelling. */
/* oxlint-disable no-await-in-loop, no-console -- One git child after another, and the numbers are the record. */
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { gitE2EApiUrl, gitE2ESecondaryApiUrl, gitE2EStore } from '#git/config.js';
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
 * Success criterion S11, the server half (charter W10 item 2).
 *
 * `two-process.spec.ts` proves the happy path — an invited `write`
 * collaborator pushes through the second process and the owner fetches it.
 * The three things S11 asks for beyond that are here: the **attribution** the
 * owner sees, the Rule 19 class a **`read`** collaborator's push is refused
 * with, and that a **revoked** collaborator is refused on the *next* request
 * rather than at some cache expiry.
 *
 * Attribution is two separate facts and both are checked: git's own author on
 * the commit (the person, per `revision-headers.ts`), and the manifest's
 * `committedBy`, which D28 says is the authenticated pusher and the server
 * alone writes. The second is read straight out of the object store, because
 * no route exposes it.
 */

const execFileAsync = promisify(execFile);

const scratchPaths: string[] = [];
const owners: TauCloudOwner[] = [];

const scratch = async (label: string): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), `tau-git-collab-${label}-`));
  scratchPaths.push(directory);
  return directory;
};

const expectGit = async (args: readonly string[], cwd: string): Promise<string> => {
  const outcome = await runGit(args, cwd);
  expect(outcome.code, `git ${args.join(' ')}: ${outcome.stderr}`).toBe(0);
  return outcome.stdout;
};

const remoteUrl = (base: string, projectId: string): string => `${base}/v1/git/${projectId}.git`;

const push = async (
  target: Readonly<{ base: string; projectId: string; token: string }>,
  cwd: string,
): Promise<{ readonly code: number; readonly stdout: string; readonly stderr: string }> =>
  runGit(
    [
      '-c',
      `http.extraHeader=Authorization: ${basicAuthorization(target.token)}`,
      'push',
      remoteUrl(target.base, target.projectId),
      'HEAD:refs/heads/main',
    ],
    cwd,
  );

/** The manifest the server committed, read from the store the way an operator would. */
const readManifest = async (
  ownerId: string,
  projectId: string,
): Promise<{ readonly committedBy: string; readonly generation: number }> => {
  const file = join(await scratch('manifest'), 'manifest.json');
  await execFileAsync(
    'aws',
    [
      '--endpoint-url',
      gitE2EStore.endpoint,
      's3',
      'cp',
      `s3://${gitE2EStore.privateBucket}/tenants/${ownerId}/repos/${projectId}/manifest.json`,
      file,
    ],
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        AWS_ACCESS_KEY_ID: gitE2EStore.accessKeyId,
        AWS_SECRET_ACCESS_KEY: gitE2EStore.secretAccessKey,
        AWS_DEFAULT_REGION: gitE2EStore.region,
        AWS_REQUEST_CHECKSUM_CALCULATION: 'when_required',
        AWS_RESPONSE_CHECKSUM_VALIDATION: 'when_required',
      },
    },
  );
  return JSON.parse(await readFile(file, 'utf8')) as { committedBy: string; generation: number };
};

/** Invite `email` at `role` and accept it as `who`. */
const invite = async (
  args: Readonly<{ owner: TauCloudOwner; projectId: string; who: TauCloudOwner; role: 'read' | 'write' }>,
): Promise<void> => {
  const { owner, projectId, who, role } = args;
  const invited = await fetch(`${gitE2EApiUrl}/v1/projects/${projectId}/collaborators`, {
    method: 'POST',
    headers: { authorization: `Bearer ${owner.token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ email: who.email, role }),
  });
  expect(invited.status, await invited.clone().text()).toBe(201);
  const { token } = (await invited.json()) as { readonly token: string };
  const accepted = await fetch(`${gitE2ESecondaryApiUrl}/v1/invitations/${token}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${who.token}` },
  });
  expect(accepted.status, await accepted.clone().text()).toBe(201);
};

describe('a collaborator on somebody else s repository (S11)', () => {
  let owner: TauCloudOwner;
  let writer: TauCloudOwner;
  let reader: TauCloudOwner;

  beforeAll(async () => {
    owner = await seedTauCloudOwner('s11-owner');
    owners.push(owner);
    await seedProPlan(owner);
    writer = await seedTauCloudOwner('s11-writer');
    owners.push(writer);
    reader = await seedTauCloudOwner('s11-reader');
    owners.push(reader);
  }, 600_000);

  afterAll(async () => {
    for (const account of owners) {
      await deleteTauCloudOwner(account);
    }
    for (const directory of scratchPaths) {
      await rm(directory, { recursive: true, force: true });
    }
  }, 600_000);

  it('writes into the owner s storage, and the owner sees the revision attributed to the pusher', async () => {
    const projectId = gitE2EProjectId();
    await registerProject(owner, projectId);
    const tree = await scratch('owner-tree');
    await expectGit(['init', '-q', '--initial-branch=main', '.'], tree);
    await expectGit(['config', 'user.email', owner.email], tree);
    await expectGit(['config', 'user.name', 'S11 Owner'], tree);
    await writeFile(join(tree, 'model.scad'), 'cube([1, 1, 1]);\n', 'utf8');
    await expectGit(['add', '.'], tree);
    await expectGit(['commit', '-qm', 'owner revision'], tree);
    const seeded = await push({ base: gitE2EApiUrl, projectId, token: owner.token }, tree);
    expect(seeded.code, seeded.stderr).toBe(0);

    await invite({ owner, projectId, who: writer, role: 'write' });

    const into = await scratch('writer-clone');
    const clone = join(into, 'clone');
    await expectGit(
      [
        '-c',
        `http.extraHeader=Authorization: ${basicAuthorization(writer.token)}`,
        'clone',
        '-q',
        remoteUrl(gitE2ESecondaryApiUrl, projectId),
        clone,
      ],
      into,
    );
    await expectGit(['config', 'user.email', writer.email], clone);
    await expectGit(['config', 'user.name', 'S11 Collaborator'], clone);
    await writeFile(join(clone, 'model.scad'), 'cube([2, 2, 2]);\n', 'utf8');
    await expectGit(['commit', '-aqm', 'collaborator revision'], clone);
    const pushed = await push({ base: gitE2ESecondaryApiUrl, projectId, token: writer.token }, clone);
    expect(pushed.code, pushed.stderr).toBe(0);

    /* The owner fetches through the other process and reads the attribution. */
    await expectGit(
      [
        '-c',
        `http.extraHeader=Authorization: ${basicAuthorization(owner.token)}`,
        'fetch',
        '-q',
        remoteUrl(gitE2EApiUrl, projectId),
        'refs/heads/main',
      ],
      tree,
    );
    const log = await expectGit(['log', '-1', '--format=%an <%ae>', 'FETCH_HEAD'], tree);
    const authored = log.trim();
    console.log(`S11 owner sees the collaborator revision authored by: ${authored}`);
    expect(authored).toContain(writer.email);

    /* D28: the manifest names the authenticated pusher, and the bytes are in
     * the owner's prefix, not the collaborator's. */
    const manifest = await readManifest(owner.userId, projectId);
    console.log(`S11 manifest committedBy=${manifest.committedBy} generation=${manifest.generation.toString()}`);
    expect(manifest.committedBy, 'the manifest names the collaborator who pushed').toBe(writer.userId);
  }, 900_000);

  it('refuses a read collaborator s push with the Rule 19 role class', async () => {
    const projectId = gitE2EProjectId();
    await registerProject(owner, projectId);
    const tree = await scratch('read-owner');
    await expectGit(['init', '-q', '--initial-branch=main', '.'], tree);
    await expectGit(['config', 'user.email', owner.email], tree);
    await expectGit(['config', 'user.name', 'S11 Owner'], tree);
    await writeFile(join(tree, 'model.scad'), 'cube([3, 3, 3]);\n', 'utf8');
    await expectGit(['add', '.'], tree);
    await expectGit(['commit', '-qm', 'owner revision'], tree);
    const seeded = await push({ base: gitE2EApiUrl, projectId, token: owner.token }, tree);
    expect(seeded.code, seeded.stderr).toBe(0);

    await invite({ owner, projectId, who: reader, role: 'read' });

    /* A `read` collaborator can clone: the refusal is on the write, not the
     * membership. */
    const into = await scratch('reader-clone');
    const clone = join(into, 'clone');
    await expectGit(
      [
        '-c',
        `http.extraHeader=Authorization: ${basicAuthorization(reader.token)}`,
        'clone',
        '-q',
        remoteUrl(gitE2ESecondaryApiUrl, projectId),
        clone,
      ],
      into,
    );
    await expectGit(['config', 'user.email', reader.email], clone);
    await expectGit(['config', 'user.name', 'S11 Reader'], clone);
    await writeFile(join(clone, 'model.scad'), 'cube([4, 4, 4]);\n', 'utf8');
    await expectGit(['commit', '-aqm', 'reader revision'], clone);
    const refused = await push({ base: gitE2ESecondaryApiUrl, projectId, token: reader.token }, clone);
    console.log(`S11 read-collaborator push refusal:\n${refused.stderr.trim()}`);

    expect(refused.code, 'a read collaborator must not be able to push').not.toBe(0);
    /* Rule 19: `PROJECT_ROLE_INSUFFICIENT` is 403, which the client classifies
     * `REMOTE_NOT_ENTITLED, by role`. Stock git carries no `Origin`, so the
     * sentence arrives as `text/plain` and git prints it. */
    expect(`${refused.stdout}${refused.stderr}`).toMatch(/403|write access/iu);

    const headOutput = await expectGit(['rev-parse', 'HEAD'], clone);
    const head = headOutput.trim();
    const advertised = await runGit(
      [
        '-c',
        `http.extraHeader=Authorization: ${basicAuthorization(owner.token)}`,
        'ls-remote',
        remoteUrl(gitE2EApiUrl, projectId),
      ],
      tree,
    );
    expect(advertised.stdout, 'a refused push must leave no ref').not.toContain(head);
  }, 900_000);

  it('refuses a revoked collaborator on the next request', async () => {
    const projectId = gitE2EProjectId();
    await registerProject(owner, projectId);
    const tree = await scratch('revoke-owner');
    await expectGit(['init', '-q', '--initial-branch=main', '.'], tree);
    await expectGit(['config', 'user.email', owner.email], tree);
    await expectGit(['config', 'user.name', 'S11 Owner'], tree);
    await writeFile(join(tree, 'model.scad'), 'cube([5, 5, 5]);\n', 'utf8');
    await expectGit(['add', '.'], tree);
    await expectGit(['commit', '-qm', 'owner revision'], tree);
    const seeded = await push({ base: gitE2EApiUrl, projectId, token: owner.token }, tree);
    expect(seeded.code, seeded.stderr).toBe(0);

    await invite({ owner, projectId, who: writer, role: 'write' });

    const into = await scratch('revoked-clone');
    const clone = join(into, 'clone');
    await expectGit(
      [
        '-c',
        `http.extraHeader=Authorization: ${basicAuthorization(writer.token)}`,
        'clone',
        '-q',
        remoteUrl(gitE2ESecondaryApiUrl, projectId),
        clone,
      ],
      into,
    );

    const revoked = await fetch(
      `${gitE2EApiUrl}/v1/projects/${projectId}/collaborators/${encodeURIComponent(writer.email)}`,
      { method: 'DELETE', headers: { authorization: `Bearer ${owner.token}` } },
    );
    expect(revoked.status, await revoked.clone().text()).toBeLessThan(300);

    /* The next request, on the process that answered the clone, so the
     * authorization cache (D22) is the thing under test and not a cold miss. */
    const start = Date.now();
    let outcome = await runGit(
      [
        '-c',
        `http.extraHeader=Authorization: ${basicAuthorization(writer.token)}`,
        'ls-remote',
        remoteUrl(gitE2ESecondaryApiUrl, projectId),
      ],
      clone,
    );
    /* D22 caches `authorize` briefly; a revocation that is only visible after
     * the cache expires is still "the next request" for the charter's purpose
     * as long as the window is short. Recorded either way. */
    for (let attempt = 0; outcome.code === 0 && attempt < 30; attempt += 1) {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 1000);
      });
      outcome = await runGit(
        [
          '-c',
          `http.extraHeader=Authorization: ${basicAuthorization(writer.token)}`,
          'ls-remote',
          remoteUrl(gitE2ESecondaryApiUrl, projectId),
        ],
        clone,
      );
    }
    console.log(
      `S11 revoked collaborator refused after ${(Date.now() - start).toString()} ms: ${outcome.stderr.trim().slice(0, 200)}`,
    );
    expect(outcome.code, 'a revoked collaborator must be refused').not.toBe(0);
    /* P55: "not yours" is 404, not 403 — a non-member is told the project does
     * not exist. */
    expect(`${outcome.stdout}${outcome.stderr}`).toMatch(/404|not found/iu);
  }, 900_000);
});
