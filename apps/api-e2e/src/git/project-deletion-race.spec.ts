/* eslint-disable @typescript-eslint/naming-convention -- Environment and S3 names are external wire fields. */
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import process from 'node:process';
import { promisify } from 'node:util';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { gitE2EApiUrl, gitE2ESecondaryApiUrl, gitE2EStore } from '#git/config.js';
import {
  basicAuthorization,
  gitE2EProjectId,
  queryDatabase,
  runGit,
  seedProPlan,
  seedTauCloudOwner,
} from '#git/tau-cloud-fixture.js';
import type { TauCloudOwner } from '#git/tau-cloud-fixture.js';
import { startProjectDeletionRaceApi } from '#git/project-deletion-race-process.js';
import {
  createProjectDeletionRaceRedisProxy,
  createProjectDeletionRaceStoreProxy,
} from '#git/project-deletion-race-proxy.js';

const execFileAsync = promisify(execFile);
let artifacts: string;
let owner: TauCloudOwner;
let storeProxy: Awaited<ReturnType<typeof createProjectDeletionRaceStoreProxy>> | undefined;
let redisProxy: Awaited<ReturnType<typeof createProjectDeletionRaceRedisProxy>> | undefined;
const apis: Array<Awaited<ReturnType<typeof startProjectDeletionRaceApi>>> = [];

const git = async (directory: string, args: readonly string[]): Promise<string> => {
  const result = await runGit(args, directory);
  expect(result.code, result.stderr).toBe(0);
  return result.stdout.trim();
};
const authGit = (): string[] => ['-c', `http.extraHeader=Authorization: ${basicAuthorization(owner.token)}`];
const remote = (origin: string, projectId: string): string => `${origin}/v1/git/${projectId}.git`;

const register = async (projectId: string): Promise<void> => {
  const response = await fetch(`${gitE2ESecondaryApiUrl}/v1/projects/${projectId}`, {
    method: 'PUT',
    headers: { authorization: `Bearer ${owner.token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Admitted HTTP race' }),
  });
  expect(response.status, await response.text()).toBe(200);
};
const remove = async (projectId: string): Promise<unknown> => {
  const response = await fetch(`${gitE2ESecondaryApiUrl}/v1/projects/${projectId}`, {
    method: 'DELETE',
    headers: { authorization: `Bearer ${owner.token}` },
    signal: AbortSignal.timeout(15_000),
  });
  expect(response.status).toBe(200);
  const receipt: unknown = await response.json();
  expect(receipt).toMatchObject({ projectId, state: 'deleted' });
  return receipt;
};

/** Read actual durable bytes through MinIO's S3 interface, outside the pause proxy. */
const manifest = async (
  projectId: string,
  label: string,
): Promise<{
  generation: number;
  refs: Record<string, { oid: string }>;
  tombstone?: { tombstonedAt: string; purgeAfter: string };
}> => {
  const target = join(artifacts, `${projectId}-${label}.json`);
  await execFileAsync(
    'aws',
    [
      '--endpoint-url',
      gitE2EStore.endpoint,
      's3api',
      'get-object',
      '--bucket',
      gitE2EStore.privateBucket,
      '--key',
      `tenants/${owner.userId}/repos/${projectId}/manifest.json`,
      target,
    ],
    {
      env: {
        ...process.env,
        AWS_ACCESS_KEY_ID: gitE2EStore.accessKeyId,
        AWS_SECRET_ACCESS_KEY: gitE2EStore.secretAccessKey,
        AWS_DEFAULT_REGION: gitE2EStore.region,
      },
    },
  );
  return JSON.parse(await readFile(target, 'utf8')) as Awaited<ReturnType<typeof manifest>>;
};

/** Read-only SQL observations, never a SQL race barrier or lifecycle mutation. */
const accounting = async (projectId: string): Promise<string> =>
  queryDatabase(`SELECT json_build_object(
  'git', (SELECT row_to_json(g) FROM project_git g WHERE project_id='${projectId}'),
  'deletion', (SELECT row_to_json(d) FROM project_deletion d WHERE project_id='${projectId}'),
  'charged', (SELECT COALESCE(sum(g.storage_bytes + g.lfs_bytes),0) FROM project_git g
    WHERE g.project_id='${projectId}' AND NOT EXISTS
      (SELECT 1 FROM project_deletion d WHERE d.project_id=g.project_id AND d.deleted_at IS NOT NULL))
);`);

const localSnapshot = async (directory: string) => ({
  head: await git(directory, ['rev-parse', 'HEAD']),
  status: await git(directory, ['status', '--porcelain=v1']),
  source: await readFile(join(directory, 'main.scad'), 'utf8'),
});

describe('admitted deletion races through two built HTTP API processes', () => {
  beforeAll(async () => {
    const output = process.env['CPD_API_RACE_OUTPUT'];
    const databaseUrl = new URL(process.env['DATABASE_URL'] ?? 'http://invalid');
    if (
      !output ||
      !output.endsWith('/acceptance/api-races') ||
      !/^\/cpd_api_race_[a-f\d]{12}$/u.test(databaseUrl.pathname) ||
      databaseUrl.hostname !== '127.0.0.1' ||
      !databaseUrl.port ||
      databaseUrl.port === '5432' ||
      databaseUrl.username !== 'cpd_acceptance' ||
      process.env['TAU_E2E_POSTGRES_DATABASE'] !== databaseUrl.pathname.slice(1) ||
      process.env['CPD_ACCEPTANCE_POSTGRES_CONTAINER'] !== process.env['TAU_E2E_POSTGRES_CONTAINER'] ||
      !process.env['CPD_ACCEPTANCE_POSTGRES_CONTAINER']?.startsWith('cpd07-acceptance-') ||
      !process.env['CPD_ACCEPTANCE_MINIO_CONTAINER']?.startsWith('cpd07-acceptance-') ||
      !gitE2EStore.privateBucket.startsWith('cpd07-race-') ||
      process.env['TAU_PROJECT_DELETION_ENABLED'] !== 'true'
    ) {
      throw new Error('Race suite requires its fresh owned database, buckets and private environment.');
    }
    artifacts = await mkdtemp(join(output, 'run-'));
    storeProxy = await createProjectDeletionRaceStoreProxy(gitE2EStore.endpoint);
    redisProxy = await createProjectDeletionRaceRedisProxy(process.env['REDIS_URL'] ?? '');
    apis.push(
      await startProjectDeletionRaceApi(gitE2EApiUrl, join(artifacts, 'api-a.private.log'), {
        TAU_S3_ENDPOINT: storeProxy.endpoint,
        REDIS_URL: redisProxy.endpoint,
      }),
    );
    apis.push(await startProjectDeletionRaceApi(gitE2ESecondaryApiUrl, join(artifacts, 'api-b.private.log'), {}));
    expect(apis[0]?.pid).not.toBe(apis[1]?.pid);
    owner = await seedTauCloudOwner('race');
    await seedProPlan(owner);
    await writeFile(
      join(artifacts, 'processes.json'),
      JSON.stringify(
        {
          pids: apis.map((api) => api.pid),
          primary: gitE2EApiUrl,
          secondary: gitE2ESecondaryApiUrl,
          ownerId: owner.userId,
        },
        null,
        2,
      ),
    );
  });

  afterAll(async () => {
    // Stop only children and transports owned here. Keep databases, buckets and all working copies.
    await Promise.all(apis.map(async (api) => api.close()));
    await storeProxy?.close();
    await redisProxy?.close();
    if (artifacts && storeProxy) {
      await writeFile(join(artifacts, 's3-http.json'), JSON.stringify(storeProxy.observations, null, 2));
    }
  });

  it.each(['before', 'after'] as const)(
    'should preserve deletion when an admitted push resumes %s manifest CAS',
    async (phase) => {
      if (!storeProxy) {
        throw new Error('Store proxy was not initialized.');
      }
      const projectId = gitE2EProjectId();
      await register(projectId);
      const directory = join(artifacts, projectId);
      await mkdir(directory);
      await git(directory, ['init', '--initial-branch=main']);
      await git(directory, ['config', 'user.name', 'Deletion race']);
      await git(directory, ['config', 'user.email', 'race@example.invalid']);
      await writeFile(
        join(directory, 'tau.json'),
        JSON.stringify({ name: 'Race', assets: { main: { entryPath: 'main.scad' } } }),
      );
      await writeFile(join(directory, 'main.scad'), 'cube(4);\n');
      await git(directory, ['add', '.']);
      await git(directory, ['commit', '-m', 'Before race']);
      await git(directory, [...authGit(), 'push', remote(gitE2ESecondaryApiUrl, projectId), 'HEAD:refs/heads/main']);
      const original = await manifest(projectId, 'original');
      await writeFile(join(directory, 'main.scad'), 'sphere(8);\n');
      await git(directory, ['commit', '-am', 'Admitted competing push']);
      const nextHead = await git(directory, ['rev-parse', 'HEAD']);
      await writeFile(join(directory, 'main.scad'), 'sphere(9); // retained dirty work\n');
      const localBefore = await localSnapshot(directory);
      const gate = storeProxy.arm(projectId, phase);
      const pushing = runGit(
        [...authGit(), 'push', remote(gitE2EApiUrl, projectId), 'HEAD:refs/heads/main'],
        directory,
      );
      try {
        const upstreamStatus = await gate.wait();
        if (phase === 'after') {
          expect(upstreamStatus).toBe(200);
        }
        const admitted = await manifest(projectId, 'paused');
        expect(admitted.refs['refs/heads/main']?.oid).toBe(
          phase === 'before' ? original.refs['refs/heads/main']?.oid : nextHead,
        );
        const receipt = await remove(projectId);
        const deleted = await manifest(projectId, 'deleted');
        expect(deleted.tombstone?.tombstonedAt).toEqual(expect.any(String));
        expect(deleted.tombstone?.purgeAfter).toEqual(expect.any(String));
        expect(deleted.refs).toEqual(admitted.refs);
        const accounted = await accounting(projectId);
        expect(JSON.parse(accounted) as unknown).toMatchObject({ charged: 0 });
        gate.release();
        const result = await pushing;
        if (phase === 'before') {
          expect(result.code).not.toBe(0);
          expect(result.stderr).toMatch(/410|deleted/iu);
        } else {
          // Its CAS linearized before DELETE; a successful push acknowledgement is legitimate.
          expect(result.code, result.stderr).toBe(0);
        }
        expect(await manifest(projectId, 'resumed')).toEqual(deleted);
        expect(await accounting(projectId)).toBe(accounted);
        expect(await localSnapshot(directory)).toEqual(localBefore);
        const stale = await fetch(`${remote(gitE2EApiUrl, projectId)}/info/refs?service=git-receive-pack`, {
          headers: { authorization: basicAuthorization(owner.token) },
        });
        expect(stale.status).toBe(410);
        await writeFile(
          join(artifacts, `${projectId}-witness.json`),
          JSON.stringify(
            {
              phase,
              projectId,
              upstreamStatus,
              receipt,
              originalHead: original.refs['refs/heads/main']?.oid,
              nextHead,
              resultCode: result.code,
              accounting: JSON.parse(accounted) as unknown,
              localBefore,
            },
            null,
            2,
          ),
        );
      } finally {
        gate.release();
        await pushing;
      }
    },
  );

  it('should refuse an invitation admitted before another API deletes the project', async () => {
    if (!redisProxy) {
      throw new Error('Redis proxy was not initialized.');
    }
    const projectId = gitE2EProjectId();
    await register(projectId);
    const gate = redisProxy.arm(owner.userId);
    const inviting = fetch(`${gitE2EApiUrl}/v1/projects/${projectId}/collaborators`, {
      method: 'POST',
      headers: { authorization: `Bearer ${owner.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'race-invitee@example.test', role: 'write' }),
      signal: AbortSignal.timeout(45_000),
    });
    try {
      await gate.wait();
      const receipt = await remove(projectId);
      gate.release();
      const response = await inviting;
      expect(response.status).toBe(410);
      const body: unknown = await response.json();
      expect(body).toMatchObject({ code: 'PROJECT_DELETED' });
      expect(await queryDatabase(`SELECT count(*) FROM project_invitation WHERE project_id='${projectId}';`)).toBe('0');
      await writeFile(
        join(artifacts, `${projectId}-invite-witness.json`),
        JSON.stringify({ projectId, receipt, resumedHttpStatus: response.status, body, invitationRows: 0 }, null, 2),
      );
    } finally {
      gate.release();
      await inviting.catch(() => undefined);
    }
  });

  it('should reject an already resolved invitation when HTTP deletion wins the queued PostgreSQL lock', async () => {
    const invitee = await seedTauCloudOwner('race-invitee');
    const projectId = gitE2EProjectId();
    await register(projectId);
    const invited = await fetch(`${gitE2ESecondaryApiUrl}/v1/projects/${projectId}/collaborators`, {
      method: 'POST',
      headers: { authorization: `Bearer ${owner.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ email: invitee.email, role: 'write' }),
    });
    expect(invited.status).toBe(201);
    const invitation = (await invited.json()) as { token: string };
    expect(invitation.token).toEqual(expect.any(String));
    const client = postgres(process.env['DATABASE_URL']!, { max: 2 });
    const acquired = Promise.withResolvers<number>();
    const release = Promise.withResolvers<void>();
    const holding = client.begin(async (transaction) => {
      await transaction`SELECT pg_advisory_xact_lock(hashtextextended(${projectId}, 0))`;
      const rows = await transaction<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`;
      acquired.resolve(rows[0]!.pid);
      await release.promise;
    });
    let deleting: Promise<unknown> | undefined;
    let accepting: Promise<Response> | undefined;
    try {
      const blocker = await acquired.promise;
      const waiter = async (origin: string): Promise<number | undefined> => {
        const application = `cpd-race-${new URL(origin).port}`;
        const rows = await client<Array<{ pid: number }>>`SELECT pid FROM pg_stat_activity
          WHERE datname = current_database() AND application_name = ${application}
          AND wait_event_type = 'Lock' AND ${blocker} = ANY(pg_blocking_pids(pid))`;
        return rows[0]?.pid;
      };
      // Queue real DELETE first. It cannot retire the still-valid invitation until this SQL barrier releases.
      deleting = remove(projectId);
      await expect
        .poll(async () => waiter(gitE2ESecondaryApiUrl), { timeout: 3000, interval: 20 })
        .toEqual(expect.any(Number));
      const deletingPid = await waiter(gitE2ESecondaryApiUrl);
      accepting = fetch(`${gitE2EApiUrl}/v1/invitations/${invitation.token}`, {
        method: 'POST',
        headers: { authorization: `Bearer ${invitee.token}` },
        signal: AbortSignal.timeout(15_000),
      });
      await expect.poll(async () => waiter(gitE2EApiUrl), { timeout: 3000, interval: 20 }).toEqual(expect.any(Number));
      const acceptingPid = await waiter(gitE2EApiUrl);
      expect(
        await queryDatabase(
          `SELECT count(*) FROM project_invitation WHERE project_id='${projectId}' AND revoked_at IS NULL;`,
        ),
      ).toBe('1');
      release.resolve();
      await holding;
      const receipt = await deleting;
      const response = await accepting;
      expect(response.status).toBe(404);
      expect(await queryDatabase(`SELECT count(*) FROM project_collaborator WHERE project_id='${projectId}';`)).toBe(
        '0',
      );
      expect(
        await queryDatabase(
          `SELECT count(*) FROM project_invitation WHERE project_id='${projectId}' AND revoked_at IS NULL;`,
        ),
      ).toBe('0');
      await writeFile(
        join(artifacts, `${projectId}-accept-witness.json`),
        JSON.stringify(
          {
            projectId,
            barrier: 'PostgreSQL advisory lock; both operations are real HTTP',
            blocker,
            deletingPid,
            acceptingPid,
            receipt,
            resumedHttpStatus: response.status,
            memberships: 0,
            activeInvitations: 0,
          },
          null,
          2,
        ),
      );
    } finally {
      release.resolve();
      await Promise.allSettled([holding, deleting, accepting]);
      await client.end();
    }
  });
});
