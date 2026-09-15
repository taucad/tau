/* oxlint-disable no-await-in-loop -- Every loop here drives one `git` child or one database statement after another on purpose. */
import { randomFillSync } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { gitE2EApiUrl, gitE2EFrontendUrl } from '#git/config.js';
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

/** *Connect Tau Cloud*, as the product's own verb rather than as a seeded row (P51). */
const connectProject = async (token: string, projectId: string, name = 'Git server E2E'): Promise<Response> =>
  fetch(`${gitE2EApiUrl}/v1/projects/${projectId}`, {
    method: 'PUT',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ name }),
  });

/**
 * Set the allowance this project has already spent, so the plan headroom is a
 * known number.
 *
 * **LFS bytes, not repository bytes.** `storage_bytes` is the repository as the
 * server last measured it, and the server re-measures it after *every*
 * `git-receive-pack` — including the empty one git sends first to authenticate
 * a chunked push — so a figure seeded there is overwritten before the pack
 * arrives. That is what W18 DEF-4 observed: both guards looked inert because
 * the headroom they read was the real one, not the seeded one.
 */
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
    `INSERT INTO project_git (project_id, storage_bytes, lfs_bytes) VALUES ('${projectId}', 0, ${String(bytes)}) ` +
      `ON CONFLICT (project_id) DO UPDATE SET lfs_bytes = ${String(bytes)};`,
  ]);
};

const proLimitBytes = 10 * 1024 ** 3;

let owner: TauCloudOwner;
/* One shared second account. Better Auth allows three sign-ups per ten
   seconds, so every case that needs "somebody else" reads this one. */
let stranger: TauCloudOwner;

beforeAll(async () => {
  owner = await seedTauCloudOwner('remote');
  owners.push(owner);
  await seedProPlan(owner);
  stranger = await seedTauCloudOwner('stranger');
  owners.push(stranger);
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
    /* W18 defect DEF-1, fixed under ruling P51: *Connect Tau Cloud* registers
     * the project.
     *
     * `GitRepositoryService.authorize` needs a `project` row, and before P51 the
     * only production writer of that table was `PublicationsService` — which
     * runs *after* a successful push, so a project that had never been published
     * answered `404` on both advertisements and could never be connected at all.
     * `PUT /v1/projects/:projectId` is the connect verb's own write; the rest of
     * this file still seeds the row directly, because those cases are about the
     * git server rather than about registration. */
    it('should accept a signed-in owner connecting a project that was never published', async () => {
      const projectId = gitE2EProjectId();
      const connected = await connectProject(owner.token, projectId, 'Never published');
      expect(connected.status, await connected.clone().text()).toBeLessThan(300);

      const response = await fetch(`${remoteUrlFor(projectId)}/info/refs?service=git-receive-pack`, {
        headers: { authorization: `Bearer ${owner.token}` },
      });
      expect(response.status).toBe(200);

      /* Idempotent: a retried *Connect* is one more request and no second row. */
      const again = await connectProject(owner.token, projectId, 'Never published');
      expect(again.status).toBeLessThan(300);
    }, 300_000);

    /* Ruling P55: one posture for "not yours" across both surfaces. The git
       routes answer `404` by a stated invariant — a client must not learn which
       project ids exist — and registration now answers the same rather than
       `403`, so no surface names another account or says "this id is taken".
       A create-if-absent verb still distinguishes a free id from a taken one by
       succeeding on the first; what P55 removes is the *shape* of the refusal
       diverging between two surfaces of the same product. */
    it('should answer a project id that belongs to another account with 404 on both surfaces', async () => {
      const projectId = gitE2EProjectId();
      const connected = await connectProject(owner.token, projectId);
      expect(connected.status).toBeLessThan(300);

      const refused = await connectProject(stranger.token, projectId);
      expect(refused.status).toBe(404);
      expect(await refused.json()).toEqual(expect.objectContaining({ code: 'PROJECT_NOT_FOUND' }));

      const advertisement = await fetch(`${remoteUrlFor(projectId)}/info/refs?service=git-upload-pack`, {
        headers: { authorization: `Bearer ${stranger.token}` },
      });
      expect(advertisement.status).toBe(404);
    }, 300_000);

    /* W18 defect DEF-5, in the real process: the CORS answer a browser page's
     * preflight gets, from the deployed allow-list rather than from a harness
     * that re-declares it. `isomorphic-git` asks for protocol v2 with
     * `git-protocol`, which is not CORS-safelisted; while it was missing here,
     * Chromium answered the preflight `204` and then dropped the request the
     * page made, with nothing in its console for the suite to see. */
    it('should allow the headers a browser git client sends on its preflight', async () => {
      const projectId = gitE2EProjectId();
      const response = await fetch(`${remoteUrlFor(projectId)}/info/refs?service=git-upload-pack`, {
        method: 'OPTIONS',
        headers: {
          origin: gitE2EFrontendUrl,
          'access-control-request-method': 'GET',
          'access-control-request-headers': 'git-protocol',
        },
      });
      expect(response.status).toBeLessThan(300);
      expect(response.headers.get('access-control-allow-origin')).toBe(gitE2EFrontendUrl);
      const allowed = (response.headers.get('access-control-allow-headers') ?? '')
        .split(',')
        .map((name) => name.trim().toLowerCase());
      expect(allowed).toEqual(
        expect.arrayContaining(['git-protocol', 'content-type', 'authorization', 'x-tau-proxy-authorization']),
      );
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

    /* W18 DEF-2 / W18-b review R8: how a second device *names* a project it has
       never held. This is the one route that answers with more than one project
       id, so its owner filter is proved here against real Postgres and over the
       wire rather than only against a stub. */
    it('should list a caller’s own projects and no other account’s', async () => {
      const mine = gitE2EProjectId();
      const theirs = gitE2EProjectId();
      const ourConnect = await connectProject(owner.token, mine, 'Mine');
      expect(ourConnect.status).toBeLessThan(300);
      const theirConnect = await connectProject(stranger.token, theirs, 'Theirs');
      expect(theirConnect.status).toBeLessThan(300);

      const listed = async (token: string): Promise<readonly string[]> => {
        const response = await fetch(`${gitE2EApiUrl}/v1/projects`, {
          headers: { authorization: `Bearer ${token}` },
        });
        expect(response.status, await response.clone().text()).toBe(200);
        const body = (await response.json()) as ReadonlyArray<{ id: string; name: string; updatedAt: string }>;
        expect(body.every((row) => typeof row.name === 'string' && typeof row.updatedAt === 'string')).toBe(true);
        return body.map((row) => row.id);
      };

      const ours = await listed(owner.token);
      expect(ours).toContain(mine);
      expect(ours).not.toContain(theirs);

      const others = await listed(stranger.token);
      expect(others).toContain(theirs);
      expect(others).not.toContain(mine);

      /* And a caller with no session is not a caller: `@UseAuth()` covers the
         listing exactly as it covers registration. */
      const anonymous = await fetch(`${gitE2EApiUrl}/v1/projects`);
      expect(anonymous.status).toBe(401);
    }, 300_000);
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

    /* W18 defect DEF-4, and the premise it was filed on is falsified.
     *
     * The report reads: a ~70 MB push lands on a project with 1024 bytes of
     * headroom, because `receive.maxInputSize` is only honoured by `index-pack`
     * and `pre-receive`'s `du` backstop does not fire through the API. Neither
     * half holds.
     *
     *  - `unpack-objects` takes `--max-input-size` too, and git 2.55 refuses an
     *    oversized pack on that path with `fatal: pack exceeds maximum allowed
     *    size`, including through `git receive-pack --stateless-rpc` spawned
     *    exactly as `git.service.ts` spawns it.
     *  - The backstop does fire. What did not survive was the *seeded row*: git
     *    authenticates a chunked push with an empty `git-receive-pack` POST
     *    first, the server accounts for that POST like any other push, and
     *    `accountAfterPush` overwrote `storage_bytes` with the repository's real
     *    size — so the second POST read ~10 GiB of headroom, not 1024 bytes, and
     *    both guards were correctly inert. The API's own log carried
     *    `remaining=1024` then `remaining=10737389509` for one push.
     *
     * So the headroom is now spent as LFS bytes, which nothing re-measures, and
     * the pack is sized to land between the two guards: larger than the plan
     * headroom, smaller than `quotaOverrunSlackBytes`, so `pre-receive` is what
     * has to refuse it. */
    it('should refuse a pack that does not fit in what is left of the plan', async () => {
      const projectId = gitE2EProjectId();
      await registerProject(owner, projectId);
      await spendStorage(projectId, proLimitBytes - 4 * 1024 * 1024);
      const tree = await scratch('oversized');
      await expectGit(['init', '-q', '--initial-branch=main', '.'], tree);
      await expectGit(['config', 'user.email', 'w18@example.test'], tree);
      await expectGit(['config', 'user.name', 'W18 E2E'], tree);
      const noise = Buffer.alloc(16 * 1024 * 1024);
      randomFillSync(noise);
      await writeFile(join(tree, 'noise.bin'), noise);
      await expectGit(['add', '.'], tree);
      await expectGit(['commit', '-m', 'oversized'], tree);

      const pushed = await pushMain(tree, owner, projectId);
      expect(pushed.code, `push stderr: ${pushed.stderr}`).not.toBe(0);
      /* `pre-receive`'s own sentence (review R3). The pack is larger than the
         headroom and smaller than `quotaOverrunSlackBytes`, so the hook is the
         guard under test; git's own `pack exceeds maximum allowed size` and
         `authorize`'s `Storage quota reached` are different guards and must not
         satisfy this row. */
      expect(pushed.stderr).toContain('Tau: storage quota exceeded');

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
