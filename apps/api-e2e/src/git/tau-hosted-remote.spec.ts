/* eslint-disable @typescript-eslint/naming-convention -- Git configuration keys and HTTP header names keep their own spelling. */
/* oxlint-disable no-await-in-loop -- Every loop here drives one `git` child or one database statement after another on purpose. */
import { randomFillSync } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { gitE2EApiUrl } from '#git/config.js';
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
 * The Tau Hosted Remote, in a real process (charter W18, AC10/AC16/AC18).
 *
 * `apps/api/app/api/git/git.http.integration.test.ts` drives every route
 * in-process with the database, the object store and the caller's identity
 * stubbed. This tier exists for what that cannot reach: a real Nest process, a
 * real Postgres deciding ownership and plan, real MinIO issuing presigned LFS
 * transfers, the hooks as they are actually written to disk, and git's own
 * `receive.maxInputSize` on a real child. Every case here is one of those; a
 * case that would pass against the stub belongs in the in-process harness.
 */

const workspaceKeeper: string[] = [];
const owners: TauCloudOwner[] = [];

/** A throwaway working tree, removed with the suite. */
const scratch = async (label: string): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), `tau-git-e2e-${label}-`));
  workspaceKeeper.push(directory);
  return directory;
};

/** The remote URL stock git is pointed at, credential in a header. */
const remoteUrlFor = (projectId: string): string => `${gitE2EApiUrl}/v1/git/${projectId}.git`;

/**
 * The same URL with the credential in its userinfo.
 *
 * `git-lfs` runs its own HTTP client and takes the remote's credential from the
 * URL, which is the form a git credential helper hands it; the plain-git cases
 * keep the header form so the middleware's Basic-to-Bearer translation stays
 * under test on its own.
 */
const credentialUrlFor = (projectId: string, token: string): string => {
  const url = new URL(`${gitE2EApiUrl}/v1/git/${projectId}.git`);
  url.username = 'tau';
  url.password = token;
  return url.toString();
};

/** Run `git` and assert it succeeded, naming its stderr when it did not. */
const expectGit = async (
  args: readonly string[],
  cwd: string,
): Promise<{ readonly code: number; readonly stdout: string; readonly stderr: string }> => {
  const outcome = await runGit(args, cwd);
  expect(outcome.code, `git ${args.join(' ')}: ${outcome.stderr}`).toBe(0);
  return outcome;
};

/** Seed one commit in a fresh repository and return its path. */
const seedWorkingTree = async (label: string, files: Readonly<Record<string, string>>): Promise<string> => {
  const tree = await scratch(label);
  await expectGit(['init', '-q', '--initial-branch=main', '.'], tree);
  await expectGit(['config', 'user.email', 'w18@example.test'], tree);
  await expectGit(['config', 'user.name', 'W18 E2E'], tree);
  for (const [path, content] of Object.entries(files)) {
    await writeFile(join(tree, path), content, 'utf8');
  }
  await expectGit(['add', '.'], tree);
  await expectGit(['commit', '-m', 'first revision'], tree);
  return tree;
};

/** Push `main` with the owner's bearer, the way stock git carries it. */
const pushMain = async (
  tree: string,
  owner: TauCloudOwner,
  projectId: string,
): Promise<{ readonly code: number; readonly stdout: string; readonly stderr: string }> =>
  runGit(
    [
      '-c',
      `http.extraHeader=Authorization: ${basicAuthorization(owner.token)}`,
      'push',
      remoteUrlFor(projectId),
      'HEAD:refs/heads/main',
    ],
    tree,
  );

/** Set the storage this project has already spent, so the plan headroom is a known number. */
const spendStorage = async (projectId: string, bytes: number): Promise<void> => {
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  await promisify(execFile)('docker', [
    'exec',
    'tau-postgres',
    'psql',
    '-qtAX',
    '-v',
    'ON_ERROR_STOP=1',
    '-U',
    'dev_user',
    '-d',
    'tau_dev',
    '-c',
    `INSERT INTO project_git (project_id, storage_bytes, lfs_bytes) VALUES ('${projectId}', ${String(bytes)}, 0) ` +
      `ON CONFLICT (project_id) DO UPDATE SET storage_bytes = ${String(bytes)}, lfs_bytes = 0;`,
  ]);
};

const proLimitBytes = 10 * 1024 ** 3;

let owner: TauCloudOwner;

beforeAll(async () => {
  owner = await seedTauCloudOwner('remote');
  owners.push(owner);
  await seedProPlan(owner);
}, 300_000);

afterAll(async () => {
  for (const seeded of owners) {
    await deleteTauCloudOwner(seeded);
  }
  for (const directory of workspaceKeeper) {
    await rm(directory, { force: true, recursive: true });
  }
}, 300_000);

describe('Tau Hosted Remote, real process', () => {
  describe('project registration', () => {
    /* W18 defect DEF-1, owner W11a (server).
     *
     * Nothing in the product registers a project on the Tau Hosted Remote.
     * `GitRepositoryService.authorize` needs a `project` row and the only
     * production writer of that table is `PublicationsService`, which runs
     * *after* a successful push — so *Connect Tau Cloud* on a project that has
     * never been published can never take. Remove `.fails` when a connect path
     * creates the row; the rest of this file seeds it explicitly and says so. */
    it.fails('should accept a signed-in owner connecting a project that was never published', async () => {
      const projectId = gitE2EProjectId();
      const response = await fetch(`${remoteUrlFor(projectId)}/info/refs?service=git-receive-pack`, {
        headers: { authorization: `Bearer ${owner.token}` },
      });
      expect(response.status).toBe(200);
    });

    it('should answer an unregistered project with 404 and the not-found code', async () => {
      const projectId = gitE2EProjectId();
      const response = await fetch(`${remoteUrlFor(projectId)}/info/refs?service=git-upload-pack`, {
        headers: { authorization: `Bearer ${owner.token}` },
      });
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual(
        expect.objectContaining({ code: 'GIT_REPOSITORY_NOT_FOUND', statusCode: 404 }),
      );
    });
  });

  describe('plan entitlements, decided by real Postgres', () => {
    it('should refuse a push from a free-tier owner and still serve the read advertisement', async () => {
      const free = await seedTauCloudOwner('free');
      owners.push(free);
      const projectId = gitE2EProjectId();
      await registerProject(free, projectId);

      const read = await fetch(`${remoteUrlFor(projectId)}/info/refs?service=git-upload-pack`, {
        headers: { authorization: `Bearer ${free.token}` },
      });
      expect(read.status).toBe(200);

      const write = await fetch(`${remoteUrlFor(projectId)}/info/refs?service=git-receive-pack`, {
        headers: { authorization: `Bearer ${free.token}` },
      });
      expect(write.status).toBe(403);
      expect(await write.json()).toEqual(expect.objectContaining({ code: 'GIT_SYNC_NOT_ENTITLED' }));
    }, 300_000);

    it('should answer another owner’s project with 404 rather than 403', async () => {
      const stranger = await seedTauCloudOwner('stranger');
      owners.push(stranger);
      const projectId = gitE2EProjectId();
      await registerProject(owner, projectId);

      const response = await fetch(`${remoteUrlFor(projectId)}/info/refs?service=git-upload-pack`, {
        headers: { authorization: `Bearer ${stranger.token}` },
      });
      expect(response.status).toBe(404);
    }, 300_000);
  });

  describe('stock git against the installed hooks', () => {
    it('should round-trip a push and a clone byte-for-byte', async () => {
      const projectId = gitE2EProjectId();
      await registerProject(owner, projectId);
      const tree = await seedWorkingTree('roundtrip', {
        'model.scad': 'cube([10, 10, 10]);\n',
        'README.md': '# W18\n',
      });

      const pushed = await pushMain(tree, owner, projectId);
      expect(pushed.code, pushed.stderr).toBe(0);
      expect(pushed.stderr).toContain('[new branch]');

      const into = await scratch('roundtrip-clone');
      const cloned = await runGit(
        [
          '-c',
          `http.extraHeader=Authorization: ${basicAuthorization(owner.token)}`,
          'clone',
          '-q',
          remoteUrlFor(projectId),
          join(into, 'clone'),
        ],
        into,
      );
      expect(cloned.code).toBe(0);

      const source = await runGit(['rev-parse', 'HEAD'], tree);
      const target = await runGit(['rev-parse', 'HEAD'], join(into, 'clone'));
      expect(target.stdout.trim()).toBe(source.stdout.trim());
      const sourceTree = await runGit(['ls-tree', '-r', '--format=%(objectname) %(path)', 'HEAD'], tree);
      const targetTree = await runGit(['ls-tree', '-r', '--format=%(objectname) %(path)', 'HEAD'], join(into, 'clone'));
      expect(targetTree.stdout).toBe(sourceTree.stdout);
    }, 300_000);

    it('should refuse a host-local ref by name in the pre-receive hook it installed', async () => {
      const projectId = gitE2EProjectId();
      await registerProject(owner, projectId);
      const tree = await seedWorkingTree('host-local', { 'model.scad': 'sphere(5);\n' });
      await expectGit(['update-ref', 'refs/tau/owners/owner_1', 'HEAD'], tree);
      await expectGit(['update-ref', 'refs/tau/chats/chat_1', 'HEAD'], tree);

      const refused = await runGit(
        [
          '-c',
          `http.extraHeader=Authorization: ${basicAuthorization(owner.token)}`,
          'push',
          remoteUrlFor(projectId),
          'refs/tau/owners/owner_1',
        ],
        tree,
      );
      expect(refused.code).not.toBe(0);
      expect(refused.stderr).toContain('host-local refs never leave a host');

      const allowed = await runGit(
        [
          '-c',
          `http.extraHeader=Authorization: ${basicAuthorization(owner.token)}`,
          'push',
          remoteUrlFor(projectId),
          'refs/tau/chats/chat_1',
        ],
        tree,
      );
      expect(allowed.code).toBe(0);
    }, 300_000);

    it('should keep the dumb-HTTP layout current so stock git clones it without the smart service', async () => {
      const projectId = gitE2EProjectId();
      await registerProject(owner, projectId);
      const tree = await seedWorkingTree('dumb', { 'model.scad': 'cylinder(h=4, r=2);\n' });
      const pushed = await pushMain(tree, owner, projectId);
      expect(pushed.code, pushed.stderr).toBe(0);

      /* The dumb protocol reads `info/refs` off disk, which only `post-receive`
       * keeps current — the assertion is that the hook ran on this push. */
      const dumb = await fetch(`${remoteUrlFor(projectId)}/info/refs`, {
        headers: { authorization: `Bearer ${owner.token}` },
      });
      expect(dumb.status).toBe(200);
      const head = await expectGit(['rev-parse', 'HEAD'], tree);
      expect(await dumb.text()).toContain(`${head.stdout.trim()}\trefs/heads/main`);
    }, 300_000);
  });

  describe('plan headroom', () => {
    it('should refuse an over-quota LFS batch with 413 and the objects it refused', async () => {
      const projectId = gitE2EProjectId();
      await registerProject(owner, projectId);
      await spendStorage(projectId, proLimitBytes - 1024);

      const response = await fetch(`${remoteUrlFor(projectId)}/info/lfs/objects/batch`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${owner.token}`,
          'content-type': 'application/vnd.git-lfs+json',
        },
        body: JSON.stringify({
          operation: 'upload',
          transfers: ['basic'],
          objects: [{ oid: 'a'.repeat(64), size: 5 * 1024 * 1024 }],
        }),
      });
      expect(response.status).toBe(413);
      expect(await response.json()).toEqual(
        expect.objectContaining({
          code: 'GIT_LFS_QUOTA_EXCEEDED',
          files: [expect.objectContaining({ oid: 'a'.repeat(64), size: 5 * 1024 * 1024 })],
        }),
      );
    }, 300_000);

    /* W18 defect DEF-4, owner W11a (server).
     *
     * A push whose pack is ~70 MB lands on a project with 1024 bytes of plan
     * headroom left. Both guards that should stop it are inert through the API:
     *
     *  - `receive.maxInputSize` (`git.controller.ts:282`) is only honoured by
     *    `index-pack`; a push below `receive.unpackLimit` (100 objects — this
     *    one has three) is unpacked by `unpack-objects`, which ignores it. The
     *    objects land loose, which is exactly what the repository shows.
     *  - `pre-receive`'s `du` backstop (`git.constants.ts`) does not fire
     *    either. The same hook file, copied byte-for-byte into a plain
     *    `git http-backend` fixture and given `TAU_GIT_PUSH_ADMITTED=1` and
     *    `TAU_GIT_QUOTA_REMAINING_BYTES=1024`, refuses the same shape of push
     *    with `Tau: storage quota exceeded` — so the hook is right and
     *    something about how the API spawns `git receive-pack --stateless-rpc`
     *    is not. The hook does run through the API: the host-local-ref case
     *    above passes on its refusal message.
     *
     * The row is read at push time (a project at exactly the limit answers
     * `413 GIT_QUOTA_EXCEEDED` on the advertisement), so this is not a stale
     * usage figure. Remove `.fails` when the backstop refuses. */
    it.fails('should refuse a pack that does not fit in what is left of the plan', async () => {
      const projectId = gitE2EProjectId();
      await registerProject(owner, projectId);
      /* 1024 bytes of headroom and a pack that clears the 64 MiB
       * `quotaOverrunSlackBytes`, so both guards are in range. */
      await spendStorage(projectId, proLimitBytes - 1024);
      const tree = await scratch('oversized');
      await expectGit(['init', '-q', '--initial-branch=main', '.'], tree);
      await expectGit(['config', 'user.email', 'w18@example.test'], tree);
      await expectGit(['config', 'user.name', 'W18 E2E'], tree);
      const noise = Buffer.alloc(68 * 1024 * 1024);
      randomFillSync(noise);
      await writeFile(join(tree, 'noise.bin'), noise);
      await expectGit(['add', '.'], tree);
      await expectGit(['commit', '-m', 'oversized'], tree);

      const pushed = await pushMain(tree, owner, projectId);
      expect(pushed.code, `push stderr: ${pushed.stderr}`).not.toBe(0);
      expect(pushed.stderr).toMatch(/maximum allowed size|quota/iu);

      const advertisement = await fetch(`${remoteUrlFor(projectId)}/info/refs?service=git-upload-pack`, {
        headers: { authorization: `Bearer ${owner.token}` },
      });
      /* Nothing of a refused push is fetchable (AC10). */
      expect(await advertisement.text()).not.toContain('refs/heads/main');
    }, 600_000);
  });

  describe('large objects through real object storage', () => {
    it('should round-trip a 5 MiB file as an LFS object with stock git-lfs', async () => {
      const projectId = gitE2EProjectId();
      await registerProject(owner, projectId);
      const tree = await scratch('lfs');
      await expectGit(['init', '-q', '--initial-branch=main', '.'], tree);
      await expectGit(['config', 'user.email', 'w18@example.test'], tree);
      await expectGit(['config', 'user.name', 'W18 E2E'], tree);
      await expectGit(['lfs', 'install', '--local'], tree);
      await writeFile(join(tree, '.gitattributes'), '*.step filter=lfs diff=lfs merge=lfs -text\n', 'utf8');
      const large = Buffer.alloc(5 * 1024 * 1024);
      randomFillSync(large);
      await writeFile(join(tree, 'part.step'), large);
      await expectGit(['add', '.'], tree);
      await expectGit(['commit', '-m', 'large object'], tree);

      const credentialUrl = credentialUrlFor(projectId, owner.token);
      const pushed = await runGit(['push', credentialUrl, 'HEAD:refs/heads/main'], tree);
      expect(pushed.code, pushed.stderr).toBe(0);

      const into = await scratch('lfs-clone');
      const clone = join(into, 'clone');
      const cloned = await runGit(['clone', '-q', credentialUrl, clone], into);
      expect(cloned.code, cloned.stderr).toBe(0);
      await expectGit(['lfs', 'install', '--local'], clone);
      const pulled = await runGit(['lfs', 'pull'], clone);
      expect(pulled.code, pulled.stderr).toBe(0);
      const { readFile } = await import('node:fs/promises');
      expect(Buffer.compare(await readFile(join(clone, 'part.step')), large)).toBe(0);
    }, 600_000);
  });

  describe('CORS proxy', () => {
    it('should refuse a loopback git remote, which is why the browser leg cannot proxy a local fixture', async () => {
      const response = await fetch(
        `${gitE2EApiUrl}/v1/git/proxy?url=${encodeURIComponent('http://127.0.0.1:9418/remote.git/info/refs?service=git-upload-pack')}`,
        { headers: { authorization: `Bearer ${owner.token}` } },
      );
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual(expect.objectContaining({ code: 'GIT_PROXY_URL_INVALID' }));
    });

    it('should refuse an https loopback host by name', async () => {
      const response = await fetch(
        `${gitE2EApiUrl}/v1/git/proxy?url=${encodeURIComponent('https://127.0.0.1/remote.git/info/refs?service=git-upload-pack')}`,
        { headers: { authorization: `Bearer ${owner.token}` } },
      );
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual(expect.objectContaining({ code: 'GIT_PROXY_HOST_REFUSED' }));
    });

    it('should refuse a credential in the query string', async () => {
      const response = await fetch(
        `${gitE2EApiUrl}/v1/git/proxy?url=${encodeURIComponent('https://example.test/remote.git/info/refs?service=git-upload-pack&access_token=secret')}`,
        { headers: { authorization: `Bearer ${owner.token}` } },
      );
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual(expect.objectContaining({ code: 'GIT_PROXY_CREDENTIAL_IN_URL' }));
    });
  });
});
