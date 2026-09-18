/* eslint-disable @typescript-eslint/naming-convention -- Process environment names keep their wire spelling. */
/* oxlint-disable no-await-in-loop, no-console -- The operator commands run in order, and their output is this suite's product. */
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { gitE2EApiUrl, gitE2EFrontendUrl, gitE2EStore } from '#git/config.js';
import {
  basicAuthorization,
  gitE2EProjectId,
  queryDatabase,
  registerProject,
  runGit,
  seedProPlan,
  seedTauCloudOwner,
} from '#git/tau-cloud-fixture.js';
import type { TauCloudOwner } from '#git/tau-cloud-fixture.js';

/**
 * Charter W10 item 7, success criteria S5, S6 and S10: purge and restore, end
 * to end, driven the way an operator drives them — the built
 * `dist/maintenance-command.js`, against the real MinIO the API just pushed
 * into.
 *
 * `apps/api/app/api/git/maintenance/{purge,restore}.test.ts` (W6) prove the
 * functions. This proves the *sequence*: a real push puts real packs in the
 * tenant prefix, deleting the account through Better Auth writes the tombstone
 * D10 asks for, `mark-erasure` collapses the thirty-day window, `purge
 * --dry-run` plans without deleting, `purge` empties the prefixes, and
 * `restore` rolls the primary forward from the second bucket alone — after
 * which the repository is rebuilt from its packs and a manifest with stock git
 * and no Tau at all, which is what S6 says.
 *
 * **The copy into the second bucket is this suite's, not the product's.** W7 is
 * deferred to DG1, so nothing writes `tau-content-restore` yet; the `aws s3
 * sync` below stands in for the copy job exactly as W6's `restore.test.ts`
 * seeds its source by hand. DG1 replaces that one command and nothing else.
 *
 * Kept off CI by `TAU_E2E_GIT_LOCAL`.
 */

const local = process.env['TAU_E2E_GIT_LOCAL'] === 'true';
const execFileAsync = promisify(execFile);
const workspaceRoot = resolve(import.meta.dirname, '../../../..');
const apiRoot = join(workspaceRoot, 'apps/api');
const maintenanceCommand = join(apiRoot, 'dist/maintenance-command.js');

const awsEnvironment = {
  ...process.env,
  AWS_ACCESS_KEY_ID: gitE2EStore.accessKeyId,
  AWS_SECRET_ACCESS_KEY: gitE2EStore.secretAccessKey,
  AWS_DEFAULT_REGION: gitE2EStore.region,
  AWS_REQUEST_CHECKSUM_CALCULATION: 'when_required',
  AWS_RESPONSE_CHECKSUM_VALIDATION: 'when_required',
};

/**
 * `aws s3` / `aws s3api` against the local MinIO.
 *
 * `aws s3 ls` exits 1 on an empty prefix with nothing on either stream, which
 * is the answer S5 is *looking* for, so an empty result is a result and only a
 * command that said something on stderr is a failure.
 */
const aws = async (args: readonly string[]): Promise<string> => {
  try {
    const { stdout } = await execFileAsync('aws', ['--endpoint-url', gitE2EStore.endpoint, ...args], {
      encoding: 'utf8',
      env: awsEnvironment,
      maxBuffer: 64 * 1024 * 1024,
    });
    return stdout;
  } catch (error) {
    const failure = error as { stdout?: string; stderr?: string };
    if ((failure.stderr ?? '') === '') {
      return failure.stdout ?? '';
    }
    throw error;
  }
};

/** The built maintenance command, with the restore source pointed at the second bucket. */
const maintenance = async (
  args: readonly string[],
): Promise<{ readonly stdout: string; readonly stderr: string; readonly milliseconds: number }> => {
  const started = Date.now();
  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, ['--env-file=.env', maintenanceCommand, ...args], {
      cwd: apiRoot,
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
      env: {
        ...process.env,
        TAU_S3_RESTORE_ENDPOINT: gitE2EStore.endpoint,
        TAU_S3_RESTORE_BUCKET: gitE2EStore.restoreBucket,
        TAU_S3_RESTORE_ACCESS_KEY_ID: gitE2EStore.accessKeyId,
        TAU_S3_RESTORE_SECRET_ACCESS_KEY: gitE2EStore.secretAccessKey,
        TAU_S3_RESTORE_REGION: gitE2EStore.region,
      },
    });
    return { stdout, stderr, milliseconds: Date.now() - started };
  } catch (error) {
    const failure = error as { stdout?: string; stderr?: string };
    return {
      stdout: failure.stdout ?? '',
      stderr: failure.stderr ?? String(error),
      milliseconds: Date.now() - started,
    };
  }
};

const scratchPaths: string[] = [];

const scratch = async (label: string): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), `tau-git-life-${label}-`));
  scratchPaths.push(directory);
  return directory;
};

const expectGit = async (args: readonly string[], cwd: string): Promise<string> => {
  const outcome = await runGit(args, cwd);
  expect(outcome.code, `git ${args.join(' ')}: ${outcome.stderr}`).toBe(0);
  return outcome.stdout;
};

describe.skipIf(!local)('purge and restore, end to end (W10 item 7; S5, S6, S10)', () => {
  let owner: TauCloudOwner;
  let projectId: string;
  let tenantPrefix: string;

  beforeAll(async () => {
    /* `global-setup.ts` runs `vite build` in `apps/api`, which rewrites `dist`
     * and leaves only `main.js` behind, so the operator command has to be built
     * *after* the tier booted rather than before it. */
    const built = await execFileAsync(
      resolve(workspaceRoot, 'node_modules/.bin/vite'),
      ['build', '--config', 'vite.maintenance-command.config.ts'],
      { cwd: apiRoot, encoding: 'utf8' },
    );
    console.log(`built dist/maintenance-command.js: ${built.stdout.trim().split('\n').at(-1) ?? ''}`);

    owner = await seedTauCloudOwner('life-owner');
    await seedProPlan(owner);
    projectId = gitE2EProjectId();
    await registerProject(owner, projectId);
    tenantPrefix = `tenants/${owner.userId}/`;
  }, 300_000);

  afterAll(async () => {
    for (const directory of scratchPaths) {
      await rm(directory, { recursive: true, force: true });
    }
    /* The account is deleted by the case itself; sweep any byte the purge or a
     * failed case left under this tenant so the next run starts clean. */
    await aws(['s3', 'rm', `s3://${gitE2EStore.privateBucket}/${tenantPrefix}`, '--recursive']).catch(() => '');
    await aws(['s3', 'rm', `s3://${gitE2EStore.restoreBucket}/${tenantPrefix}`, '--recursive']).catch(() => '');
  }, 300_000);

  it('purges a tombstoned tenant and restores it from the second bucket alone', async () => {
    /* 1. A real repository: two commits and an annotated tag, so the manifest
     *    carries a peeled ref and `for-each-ref` has something to compare. */
    const tree = await scratch('source');
    await expectGit(['init', '-q', '--initial-branch=main', '.'], tree);
    await expectGit(['config', 'user.email', 'w10@example.test'], tree);
    await expectGit(['config', 'user.name', 'W10 Lifecycle'], tree);
    await writeFile(join(tree, 'model.scad'), 'cube([1, 1, 1]);\n', 'utf8');
    await expectGit(['add', '.'], tree);
    await expectGit(['commit', '-q', '-m', 'first revision'], tree);
    await expectGit(['tag', '-a', 'v1', '-m', 'published'], tree);
    await writeFile(join(tree, 'model.scad'), 'cube([2, 2, 2]);\n', 'utf8');
    await expectGit(['add', '.'], tree);
    await expectGit(['commit', '-q', '-m', 'second revision'], tree);

    const remote = `${gitE2EApiUrl}/v1/git/${projectId}.git`;
    const authorization = `http.extraHeader=Authorization: ${basicAuthorization(owner.token)}`;
    await expectGit(['-c', authorization, 'push', remote, 'HEAD:refs/heads/main', 'refs/tags/v1'], tree);

    const lsRemote = await expectGit(['-c', authorization, 'ls-remote', remote], tree);
    const advertised = lsRemote.trim();
    console.log(`S6 refs before purge:\n${advertised}`);
    expect(advertised).toMatch(/refs\/heads\/main/u);
    expect(advertised).toMatch(/refs\/tags\/v1/u);

    const repositoryPrefix = `${tenantPrefix}repos/${projectId}/`;
    const beforeListing = await aws([
      's3',
      'ls',
      `s3://${gitE2EStore.privateBucket}/${repositoryPrefix}`,
      '--recursive',
    ]);
    console.log(`S5 objects under ${repositoryPrefix} before purge:\n${beforeListing}`);
    expect(beforeListing).toContain('manifest.json');

    /* 2. The copy DG1 defers, performed by hand into the second bucket. */
    const copyStarted = Date.now();
    await aws([
      's3',
      'sync',
      `s3://${gitE2EStore.privateBucket}/${tenantPrefix}`,
      `s3://${gitE2EStore.restoreBucket}/${tenantPrefix}`,
    ]);
    console.log(`S6 copy into ${gitE2EStore.restoreBucket} took ${(Date.now() - copyStarted).toString()} ms`);

    /* 3. Deleting the account is what writes the tombstone (D10). */
    const deleted = await fetch(`${gitE2EApiUrl}/v1/auth/delete-user`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: gitE2EFrontendUrl,
        authorization: `Bearer ${owner.token}`,
      },
      body: JSON.stringify({ password: owner.password }),
    });
    expect(deleted.status, `delete-user: ${await deleted.clone().text()}`).toBe(200);

    const tombstone = await queryDatabase(
      `SELECT purge_after FROM storage_tombstone WHERE owner_id = '${owner.userId}';`,
    );
    console.log(`S5 tombstone purge_after: ${tombstone}`);
    expect(tombstone, 'deleting the account must write a tombstone').not.toBe('');

    /* 4. A verified erasure collapses the thirty-day window (D10). */
    const marked = await maintenance(['mark-erasure', '--owner', owner.userId]);
    console.log(`S5 mark-erasure (${marked.milliseconds.toString()} ms): ${marked.stdout.trim()}`);
    expect(marked.stdout, marked.stderr).toContain(owner.userId);

    /* 5. The plan, which deletes nothing (D31). */
    const planned = await maintenance(['purge', '--dry-run']);
    console.log(`S10 purge --dry-run (${planned.milliseconds.toString()} ms):\n${planned.stdout.trim()}`);
    expect(planned.stdout, planned.stderr).toContain(owner.userId);
    const stillThere = await aws(['s3', 'ls', `s3://${gitE2EStore.privateBucket}/${repositoryPrefix}`, '--recursive']);
    expect(stillThere, 'a dry run must delete nothing').toContain('manifest.json');

    /* 6. The purge itself. Below the 10 000-object bound, so no `--confirm`;
     *    the refusal above it is `purge.test.ts`'s row. */
    const purged = await maintenance(['purge']);
    console.log(`S5 purge (${purged.milliseconds.toString()} ms):\n${purged.stdout.trim()}`);
    expect(purged.stderr).not.toMatch(/refusing/u);
    const emptied = await aws(['s3', 'ls', `s3://${gitE2EStore.privateBucket}/${tenantPrefix}`, '--recursive']);
    expect(emptied.trim(), 'every tenant prefix must be empty after the purge').toBe('');

    /* 7. Restore from the second bucket alone. */
    const restored = await maintenance([
      'restore',
      '--owner',
      owner.userId,
      '--project',
      projectId,
      '--operator',
      'w10-proof',
    ]);
    console.log(`S6 restore (${restored.milliseconds.toString()} ms):\n${restored.stdout.trim()}`);
    expect(restored.stderr, restored.stderr).not.toMatch(/Error|refus/u);

    const manifestPath = join(await scratch('manifest'), 'manifest.json');
    await aws(['s3', 'cp', `s3://${gitE2EStore.privateBucket}/${repositoryPrefix}manifest.json`, manifestPath]);
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as {
      readonly incarnation: string;
      readonly generation: number;
      readonly committedBy: string;
      readonly refs: Readonly<Record<string, { readonly oid: string; readonly peeled?: string }>>;
      readonly packs: ReadonlyArray<{ readonly key: string; readonly indexStored: boolean }>;
      readonly tombstone: unknown;
    };
    console.log(
      `S6 restored manifest: ${JSON.stringify({
        generation: manifest.generation,
        incarnation: manifest.incarnation,
        committedBy: manifest.committedBy,
        packs: manifest.packs.length,
        refs: Object.keys(manifest.refs),
      })}`,
    );
    expect(manifest.tombstone, 'a restore must clear the tombstone').toBeNull();
    expect(manifest.generation, 'a restore rolls the generation forward').toBeGreaterThan(1);

    /* S6 asks for a *fresh* incarnation, so the source's own is read back out
     * of the second bucket and compared rather than assumed. */
    const sourcePath = join(await scratch('source-manifest'), 'manifest.json');
    await aws(['s3', 'cp', `s3://${gitE2EStore.restoreBucket}/${repositoryPrefix}manifest.json`, sourcePath]);
    const source = JSON.parse(await readFile(sourcePath, 'utf8')) as {
      readonly incarnation: string;
      readonly generation: number;
    };
    console.log(
      `S6 incarnations: source=${source.incarnation} (generation ${source.generation.toString()}) restored=${manifest.incarnation} (generation ${manifest.generation.toString()})`,
    );
    expect(manifest.incarnation, 'a restore mints a fresh incarnation').not.toBe(source.incarnation);

    /* 8. S6 itself: rebuild the repository from its packs and this manifest
     *    with stock git and nothing of Tau's. */
    const bare = join(await scratch('rebuilt'), 'repo.git');
    await mkdir(join(bare, 'objects/pack'), { recursive: true });
    await expectGit(['init', '-q', '--bare', bare], tmpdir());
    for (const pack of manifest.packs) {
      const file = pack.key.split('/').pop() ?? pack.key;
      await aws([
        's3',
        'cp',
        `s3://${gitE2EStore.privateBucket}/${repositoryPrefix}${pack.key}`,
        join(bare, 'objects/pack', file),
      ]);
      if (pack.indexStored) {
        const index = `${file.slice(0, -'.pack'.length)}.idx`;
        await aws([
          's3',
          'cp',
          `s3://${gitE2EStore.privateBucket}/${repositoryPrefix}${pack.key.slice(0, -'.pack'.length)}.idx`,
          join(bare, 'objects/pack', index),
        ]);
      } else {
        await expectGit(['index-pack', join(bare, 'objects/pack', file)], bare);
      }
    }
    const packedReferences = [
      '# pack-refs with: peeled fully-peeled sorted ',
      ...Object.entries(manifest.refs).flatMap(([name, value]) => [
        `${value.oid} ${name}`,
        ...(value.peeled === undefined ? [] : [`^${value.peeled}`]),
      ]),
      '',
    ].join('\n');
    await writeFile(join(bare, 'packed-refs'), packedReferences, 'utf8');

    const fsck = await runGit(['fsck', '--strict'], bare);
    console.log(`S6 fsck --strict on the rebuilt repository: code ${fsck.code.toString()} ${fsck.stderr.trim()}`);
    expect(fsck.code, fsck.stderr).toBe(0);

    const forEachRef = await expectGit(['for-each-ref', '--format=%(objectname) %(refname)'], bare);
    const rebuiltReferences = forEachRef.trim();
    console.log(`S6 for-each-ref on the rebuilt repository:\n${rebuiltReferences}`);
    for (const [name, value] of Object.entries(manifest.refs)) {
      expect(rebuiltReferences, `${name} must be reachable in the rebuild`).toContain(`${value.oid} ${name}`);
    }
    const headOutput = await expectGit(['rev-parse', 'refs/heads/main'], bare);
    const head = headOutput.trim();
    expect(advertised, 'the rebuilt head must be the head the client was acknowledged for').toContain(head);
  }, 900_000);
});
