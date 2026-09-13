import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import type { Environment } from '#config/environment.config.js';
import type { ObjectStorageService } from '#storage/object-storage.service.js';
import type { DatabaseService } from '#database/database.service.js';
import type { BillingService } from '#api/billing/billing.service.js';
import { GitBackupService } from '#api/git/git-backup.service.js';
import { GitRepositoryService } from '#api/git/git.service.js';

describe('GitBackupService', () => {
  let gitRoot: string;
  let workspace: string;
  let repositories: GitRepositoryService;
  let backups: GitBackupService;
  const stored = new Map<string, Uint8Array<ArrayBuffer>>();

  beforeAll(async () => {
    gitRoot = await mkdtemp(path.join(tmpdir(), 'tau-git-backup-root-'));
    workspace = await mkdtemp(path.join(tmpdir(), 'tau-git-backup-work-'));
    const configService = {
      get: (key: string): unknown => (key === 'TAU_GIT_ROOT' ? gitRoot : 24),
    } as unknown as ConfigService<Environment, true>;
    repositories = new GitRepositoryService(
      configService,
      {} as unknown as DatabaseService,
      {} as unknown as BillingService,
      {} as unknown as ObjectStorageService,
    );
    backups = new GitBackupService(configService, repositories, {
      putBlob: async (args: { key: string; body: Uint8Array<ArrayBuffer> }) => {
        stored.set(args.key, args.body);
        return { etag: '"x"', alreadyExisted: false };
      },
      headBlob: async (args: { key: string }) => {
        const body = stored.get(args.key);
        return body === undefined
          ? undefined
          : {
              contentType: 'application/x-git-bundle',
              size: body.byteLength,
              etag: '"x"',
              cacheControl: '',
            };
      },
    } as unknown as ObjectStorageService);
  });

  afterAll(async () => {
    await rm(gitRoot, { recursive: true, force: true });
    await rm(workspace, { recursive: true, force: true });
  });

  it('bundles every repository on the volume and skips the empty ones', async () => {
    const repositoryPath = await repositories.ensureRepository('proj_backup');
    await repositories.ensureRepository('proj_empty');

    // A commit through a temporary clone, so the bundle has something to hold.
    const clone = path.join(workspace, 'clone');
    await repositories.run(['clone', repositoryPath, clone], workspace);
    await writeFile(path.join(clone, 'part.ts'), 'export const depth = 4;\n', 'utf8');
    await repositories.run(['add', '.'], clone);
    await repositories.run(
      ['-c', 'user.email=test@tau.new', '-c', 'user.name=Tau Test', 'commit', '-m', 'first'],
      clone,
    );
    // The pre-receive hook is fail-closed: a push that did not come through
    // the API's admission check is refused, so the fixture sets the flag the
    // controller sets.
    await repositories.run(
      ['push', '--receive-pack=env TAU_GIT_PUSH_ADMITTED=1 git-receive-pack', 'origin', 'HEAD:refs/heads/main'],
      clone,
    );

    const snapshots = await backups.snapshotAll();

    expect(snapshots).toBe(1);
    const key = [...stored.keys()].find((candidate) => candidate.startsWith('git-backups/proj_backup/'));
    expect(key).toMatch(/^git-backups\/proj_backup\/\d{4}-\d{2}-\d{2}\.bundle$/u);
    expect(Buffer.from(stored.get(key ?? '') ?? new Uint8Array()).toString('utf8', 0, 15)).toContain('git bundle');
    expect([...stored.keys()].some((candidate) => candidate.startsWith('git-backups/proj_empty/'))).toBe(false);

    // The day's object is the durable marker: a second pass is a no-op, which
    // is what lets the first pass run 60 s after every boot (R9).
    expect(await backups.snapshotAll()).toBe(0);
  });

  /**
   * The charter's restore drill (risk row: "Fly volume is single-attach and
   * single-region | nightly `git bundle` snapshots to R2; restore drill in
   * W11's acceptance"). A snapshot nobody has restored is a belief, not a
   * backup: this clones the produced bundle with stock git and compares its
   * refs and commit ids against the repository it came from.
   */
  it('restores a repository from its bundle with stock git (charter restore drill)', async () => {
    const key = [...stored.keys()].find((candidate) => candidate.startsWith('git-backups/proj_backup/'));
    const bundle = stored.get(key ?? '');
    expect(bundle).toBeDefined();

    const bundlePath = path.join(workspace, 'restore.bundle');
    await writeFile(bundlePath, bundle ?? new Uint8Array());

    const restored = path.join(workspace, 'restored');
    await repositories.run(['clone', bundlePath, restored], workspace);

    // `git bundle verify` needs a repository to verify against; the restored
    // clone is the one the drill just produced. A non-zero exit rejects, so
    // reaching the assertion is itself the verification ("is okay" goes to
    // stderr; the ref listing is what git puts on stdout).
    const verified = await repositories.run(['bundle', 'verify', bundlePath], restored);
    expect(Buffer.from(verified).toString('utf8')).toContain('refs/heads/main');

    const sourceReferences = Buffer.from(
      await repositories.run(
        ['for-each-ref', '--format=%(refname) %(objectname)', 'refs/heads/'],
        repositories.repositoryPath('proj_backup'),
      ),
    ).toString('utf8');
    const restoredReferences = Buffer.from(
      await repositories.run(['for-each-ref', '--format=%(refname) %(objectname)', 'refs/heads/'], restored),
    ).toString('utf8');

    expect(sourceReferences.trim()).not.toBe('');
    expect(restoredReferences.trim()).toBe(sourceReferences.trim());
    expect(await readFile(path.join(restored, 'part.ts'), 'utf8')).toBe('export const depth = 4;\n');
  });
});
