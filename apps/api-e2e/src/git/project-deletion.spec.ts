/* eslint-disable @typescript-eslint/naming-convention -- environment and S3 wire fields retain their spelling. */
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { promisify } from 'node:util';
import { beforeAll, describe, expect, it } from 'vitest';
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

const execFileAsync = promisify(execFile);
const workspaceRoot = resolve(import.meta.dirname, '../../../..');
let artifacts: string;
let owner: TauCloudOwner;

/** Run the installed AWS CLI only against the owned MinIO; credentials never enter argv. */
const aws = async (args: readonly string[]): Promise<string> => {
  const { stdout } = await execFileAsync('aws', ['--endpoint-url', gitE2EStore.endpoint, ...args], {
    encoding: 'utf8',
    env: {
      ...process.env,
      AWS_ACCESS_KEY_ID: gitE2EStore.accessKeyId,
      AWS_SECRET_ACCESS_KEY: gitE2EStore.secretAccessKey,
      AWS_DEFAULT_REGION: gitE2EStore.region,
    },
  });
  return stdout;
};

const git = async (cwd: string, args: readonly string[]): Promise<string> => {
  const result = await runGit(args, cwd);
  expect(result.code, result.stderr).toBe(0);
  return result.stdout.trim();
};

/** The actual built CLI, with an acceptance-owned config and no operator Git settings. */
const cli = async (args: readonly string[]): Promise<{ code: number; stdout: string; stderr: string }> => {
  try {
    const { stdout, stderr } = await execFileAsync(
      process.execPath,
      [resolve(workspaceRoot, 'packages/cli/dist/bin/tau.mjs'), ...args],
      {
        cwd: artifacts,
        encoding: 'utf8',
        timeout: 120_000,
        env: {
          ...process.env,
          TAU_API_URL: gitE2ESecondaryApiUrl,
          TAU_AUTH_TOKEN: owner.token,
          TAU_CONFIG_DIR: join(artifacts, 'cli-config'),
          TAU_SECRET_VAULT: 'file',
          GIT_CONFIG_GLOBAL: '/dev/null',
          GIT_CONFIG_SYSTEM: '/dev/null',
          GIT_TERMINAL_PROMPT: '0',
        },
      },
    );
    return { code: 0, stdout, stderr };
  } catch (error) {
    const result = error as { code?: number; stdout?: string; stderr?: string };
    return {
      code: typeof result.code === 'number' ? result.code : 1,
      stdout: result.stdout ?? '',
      stderr: result.stderr ?? 'CLI execution failed',
    };
  }
};

const register = async (projectId: string): Promise<void> => {
  const response = await fetch(`${gitE2EApiUrl}/v1/projects/${projectId}`, {
    method: 'PUT',
    headers: { authorization: `Bearer ${owner.token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Cloud deletion acceptance' }),
  });
  expect(response.status, await response.text()).toBe(200);
};

const remote = (base: string, projectId: string): string => `${base}/v1/git/${projectId}.git`;
const authGit = (): string[] => ['-c', `http.extraHeader=Authorization: ${basicAuthorization(owner.token)}`];

/** Content and worktree evidence, without credentials or volatile Git timestamps. */
const snapshot = async (
  directory: string,
): Promise<{ head: string; status: string; source: string; manifest: string }> => ({
  head: await git(directory, ['rev-parse', 'HEAD']),
  status: await git(directory, ['status', '--porcelain=v1']),
  source: await readFile(join(directory, 'main.scad'), 'utf8'),
  manifest: await readFile(join(directory, 'tau.json'), 'utf8'),
});

describe('cloud deletion across built API processes and the built CLI', () => {
  beforeAll(async () => {
    if (
      !process.env['CPD_ACCEPTANCE_POSTGRES_CONTAINER'] ||
      !process.env['CPD_ACCEPTANCE_MINIO_CONTAINER'] ||
      process.env['TAU_PROJECT_DELETION_ENABLED'] !== 'true'
    ) {
      throw new Error('Deletion E2E requires the owned acceptance services and enabled deletion.');
    }
    const output = resolve(
      workspaceRoot,
      'out/research/cloud-project-deletion-blueprint/2026-10-24-implementation/acceptance/api-e2e',
    );
    await mkdir(output, { recursive: true });
    artifacts = await mkdtemp(join(output, 'run-'));
    owner = await seedTauCloudOwner('deletion');
    await seedProPlan(owner);
    // Deliberately retain this disposable account, object namespace and every local working copy.
  });

  it('should fence a second replica and stale Git/CLI writes while preserving dirty copies and neighboring repository bytes', async () => {
    const projectId = gitE2EProjectId();
    const neighborId = gitE2EProjectId();
    await register(projectId);
    await register(neighborId);
    await writeFile(
      join(artifacts, 'identities.json'),
      JSON.stringify(
        { ownerId: owner.userId, projectId, neighborId, primary: gitE2EApiUrl, secondary: gitE2ESecondaryApiUrl },
        null,
        2,
      ),
    );
    const source = join(artifacts, 'source');
    await mkdir(source);
    await git(source, ['init', '--initial-branch=main']);
    await git(source, ['config', 'user.name', 'Deletion acceptance']);
    await git(source, ['config', 'user.email', 'deletion@example.invalid']);
    await writeFile(
      join(source, 'tau.json'),
      JSON.stringify({
        $schema: 'https://tau.new/schemas/tau-v1.json',
        name: 'Deletion acceptance',
        assets: { main: { entryPath: 'main.scad' } },
      }),
    );
    await writeFile(join(source, 'main.scad'), 'cube(4);\n');
    await git(source, ['add', '.']);
    await git(source, ['commit', '-m', 'Retained source history']);
    await git(source, [...authGit(), 'push', remote(gitE2EApiUrl, projectId), 'HEAD:refs/heads/main']);
    await git(source, [...authGit(), 'push', remote(gitE2EApiUrl, neighborId), 'HEAD:refs/heads/main']);
    const cliCopy = join(artifacts, 'cli-copy');
    const cloned = await cli(['clone', projectId, '--into', cliCopy, '--json']);
    expect(cloned.code, cloned.stderr).toBe(0);
    expect(await readFile(join(cliCopy, 'main.scad'), 'utf8')).toBe('cube(4);\n');
    await git(cliCopy, ['config', 'user.name', 'Deletion acceptance']);
    await git(cliCopy, ['config', 'user.email', 'deletion@example.invalid']);
    await writeFile(join(cliCopy, 'notes.txt'), 'Backed up through the actual CLI before deletion.\n');
    const backedUp = await cli(['revisions', 'save', '--project', cliCopy, '--json']);
    expect(backedUp.code, backedUp.stderr).toBe(0);
    expect(JSON.parse(backedUp.stdout)).toMatchObject({ kind: 'revision-save', status: 'saved', backup: 'backedUp' });
    const offline = join(artifacts, 'offline-copy');
    await git(artifacts, [...authGit(), 'clone', remote(gitE2ESecondaryApiUrl, projectId), offline]);
    await writeFile(join(cliCopy, 'main.scad'), 'cube(7); // unsaved local work\n');
    await writeFile(join(offline, 'main.scad'), 'sphere(9); // offline work\n');
    const cliBefore = await snapshot(cliCopy);
    const offlineBefore = await snapshot(offline);
    const namespace = `tenants/${owner.userId}/repos/${neighborId}/`;
    const neighborBefore = await aws([
      's3api',
      'list-objects-v2',
      '--bucket',
      gitE2EStore.privateBucket,
      '--prefix',
      namespace,
    ]);
    // Warm the second process's positive authorization cache immediately before deletion.
    const warmed = await fetch(`${remote(gitE2ESecondaryApiUrl, projectId)}/info/refs?service=git-upload-pack`, {
      headers: { authorization: basicAuthorization(owner.token) },
    });
    expect(warmed.status).toBe(200);
    await warmed.arrayBuffer();
    const deleted = await fetch(`${gitE2EApiUrl}/v1/projects/${projectId}`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${owner.token}` },
    });
    expect(deleted.status).toBe(200);
    const receipt = (await deleted.json()) as { projectId: string; state: string; deletedAt: string };
    expect(receipt).toMatchObject({ projectId, state: 'deleted' });
    const status = await fetch(`${gitE2ESecondaryApiUrl}/v1/projects/${projectId}/deletion`, {
      headers: { authorization: `Bearer ${owner.token}` },
    });
    expect(status.status).toBe(200);
    expect(await status.json()).toEqual(receipt);
    const stale = await fetch(`${remote(gitE2ESecondaryApiUrl, projectId)}/info/refs?service=git-receive-pack`, {
      headers: { authorization: basicAuthorization(owner.token) },
    });
    expect(stale.status).toBe(410);
    const refusedRegistration = await fetch(`${gitE2ESecondaryApiUrl}/v1/projects/${projectId}`, {
      method: 'PUT',
      headers: { authorization: `Bearer ${owner.token}`, 'content-type': 'application/json' },
      body: '{}',
    });
    expect(refusedRegistration.status).toBe(410);
    const refusedPush = await runGit(
      [...authGit(), 'push', remote(gitE2ESecondaryApiUrl, projectId), 'HEAD:refs/heads/main'],
      offline,
    );
    expect(refusedPush.code).not.toBe(0);
    expect(refusedPush.stderr).toMatch(/410|deleted/iu);
    const refusedClone = await cli(['clone', projectId, '--into', join(artifacts, 'refused-clone'), '--json']);
    expect(refusedClone.code).not.toBe(0);
    expect(`${refusedClone.stdout}\n${refusedClone.stderr}`).toMatch(/NO_SUCH_PROJECT|has no project/iu);
    expect(await snapshot(cliCopy)).toEqual(cliBefore);
    expect(await snapshot(offline)).toEqual(offlineBefore);
    // A deliberate local save still works after cloud deletion, but must not recreate the remote.
    const localSave = await cli(['revisions', 'save', '--project', cliCopy, '--json']);
    expect(localSave.code, localSave.stderr).toBe(0);
    const saved = JSON.parse(localSave.stdout) as { status: string; backup?: string; reason?: string };
    expect(saved.status).toBe('saved');
    expect(saved.backup).not.toBe('backedUp');
    expect(saved.backup).not.toBe('noRemote');
    expect(saved.reason).toMatch(/deleted|not found|410/iu);
    expect(await readFile(join(cliCopy, 'main.scad'), 'utf8')).toBe(cliBefore.source);
    expect(await git(cliCopy, ['merge-base', '--is-ancestor', cliBefore.head, 'HEAD'])).toBe('');
    const neighborAfter = await aws([
      's3api',
      'list-objects-v2',
      '--bucket',
      gitE2EStore.privateBucket,
      '--prefix',
      namespace,
    ]);
    expect(JSON.parse(neighborAfter)).toEqual(JSON.parse(neighborBefore));
    const neighborClone = await cli(['clone', neighborId, '--into', join(artifacts, 'neighbor-copy'), '--json']);
    expect(neighborClone.code, neighborClone.stderr).toBe(0);
    expect(await readFile(join(artifacts, 'neighbor-copy/main.scad'), 'utf8')).toBe('cube(4);\n');
    const tombstonePath = join(artifacts, 'tombstone.json');
    await aws([
      's3api',
      'get-object',
      '--bucket',
      gitE2EStore.privateBucket,
      '--key',
      `tenants/${owner.userId}/repos/${projectId}/manifest.json`,
      tombstonePath,
    ]);
    const manifest = JSON.parse(await readFile(tombstonePath, 'utf8')) as {
      tombstone: { tombstonedAt: string; purgeAfter: string };
      refs: Record<string, { oid: string }>;
    };
    expect(manifest.tombstone.tombstonedAt).toBe(receipt.deletedAt);
    expect(manifest.refs['refs/heads/main']?.oid).toBe(cliBefore.head);
    expect(Date.parse(manifest.tombstone.purgeAfter) - Date.parse(receipt.deletedAt)).toBe(30 * 24 * 60 * 60 * 1000);
    expect(
      await queryDatabase(
        `SELECT count(*) FROM project_deletion WHERE project_id = '${projectId}' AND deleted_at IS NOT NULL;`,
      ),
    ).toBe('1');
    await writeFile(
      join(artifacts, 'preserved-copies.json'),
      JSON.stringify({ cliBefore, offlineBefore, receipt }, null, 2),
    );
  });

  it('should serialize concurrent replica deletion of a never-pushed legacy project into one stable receipt', async () => {
    const projectId = `legacy-${randomUUID()}`;
    await register(projectId);
    const headers = { authorization: `Bearer ${owner.token}` };
    const [first, repeated] = await Promise.all([
      fetch(`${gitE2EApiUrl}/v1/projects/${projectId}`, { method: 'DELETE', headers }),
      fetch(`${gitE2ESecondaryApiUrl}/v1/projects/${projectId}`, { method: 'DELETE', headers }),
    ]);
    expect(first.status).toBe(200);
    const receipt: unknown = await first.json();
    expect(repeated.status).toBe(200);
    expect(await repeated.json()).toEqual(receipt);
    expect(await queryDatabase(`SELECT count(*) FROM project_deletion WHERE project_id = '${projectId}';`)).toBe('1');
  });
});
