import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { project, projectDeletion, projectGit, projectGitLfsObject, user } from '@taucad/api-database/schema';
import * as schema from '@taucad/api-database/schema';
import { databaseReachable } from '@taucad/api-database/testing/database-reachable';
import { manifestFormat } from '@taucad/api-git-core/store/manifest';
import type { Manifest, PushRecord } from '@taucad/api-git-core/store/manifest';
import { auditProvenance } from '#api/git/provenance-audit.js';
import type { AuditSummaryLine, RepositoryAuditLine } from '#api/git/provenance-audit.js';

/**
 * WP11 end to end over a real PostgreSQL and real bare repositories (the lease is a local directory): a repository
 * line per active project with a committed push, the push log read across a spilled segment, nothing for a deleted
 * project, and the summary's orphans of a project whose push never committed. Nothing is written.
 *
 * Needs a migrated database (`pnpm infra:up`, `pnpm db:migrate`).
 */

const databaseUrl = process.env.DATABASE_URL;
const pusher = 'user_PusherAccountIdA12345';

describe.skipIf(!(await databaseReachable(databaseUrl)))('provenance audit (WP11)', () => {
  let client: postgres.Sql;
  let database: ReturnType<typeof drizzle<typeof schema>>;
  const owners: string[] = [];
  const roots: string[] = [];

  beforeAll(() => {
    client = postgres(databaseUrl, { max: 2 });
    database = drizzle(client, { schema });
  });

  afterAll(async () => {
    if (owners.length > 0) {
      await database.delete(projectDeletion).where(inArray(projectDeletion.ownerId, owners));
      await database.delete(user).where(inArray(user.id, owners));
    }
    await client.end();
    await Promise.all(roots.map(async (root) => rm(root, { recursive: true, force: true })));
  });

  const repository = async (): Promise<{ root: string; tips: string[] }> => {
    const root = await mkdtemp(path.join(tmpdir(), 'tau-audit-'));
    roots.push(root);
    const run = (args: string[]): string =>
      execFileSync(
        'git',
        [
          '-c',
          'author.name=Pusher',
          '-c',
          `author.email=${pusher}@users.noreply.tau.new`,
          '-c',
          'committer.name=Tau',
          '-c',
          'committer.email=noreply@tau.new',
          ...args,
        ],
        { cwd: root, encoding: 'utf8' },
      ).trim();
    run(['init', '--quiet', '--bare']);
    const tree = run(['mktree']);
    const first = run(['commit-tree', tree, '-m', 'Imported']);
    const second = run(['commit-tree', tree, '-p', first, '-m', 'Saved']);
    run(['update-ref', 'refs/heads/main', second]);
    return { root, tips: [first, second] };
  };

  const record = (generation: number, tip: string): PushRecord => ({
    generation,
    committedAt: '2026-11-27T00:00:00.000Z',
    committedBy: pusher,
    refs: [{ ref: 'refs/heads/main', tip }],
  });

  const newProject = async (generation: number | undefined, deleted = false): Promise<string> => {
    const ownerId = `user-wp11-${randomBytes(6).toString('hex')}`;
    const projectId = `proj-wp11-${randomBytes(6).toString('hex')}`;
    owners.push(ownerId);
    await database.insert(user).values({ id: ownerId, name: 'WP11', email: `${ownerId}@tau.test` });
    await database.insert(project).values({ id: projectId, ownerId, name: 'audit' });
    if (generation !== undefined) {
      await database.insert(projectGit).values({ projectId, generation });
    }
    if (deleted) {
      await database.insert(projectDeletion).values({ projectId, ownerId, requestedBy: ownerId });
    }
    return projectId;
  };

  it('should count each repository across a spilled push log and the orphans of an uncommitted project', async () => {
    const committed = await newProject(2);
    const orphaned = await newProject(undefined);
    const { root, tips } = await repository();
    await database.insert(projectGitLfsObject).values([
      { projectId: committed, oid: randomBytes(32).toString('hex'), sizeBytes: 5, finalizedAt: new Date() },
      { projectId: orphaned, oid: randomBytes(32).toString('hex'), sizeBytes: 7, finalizedAt: new Date() },
      { projectId: orphaned, oid: randomBytes(32).toString('hex'), sizeBytes: 9, finalizedAt: null },
    ]);
    const manifest: Manifest = {
      format: manifestFormat,
      incarnation: 'audit',
      generation: 2,
      committedAt: '2026-11-27T00:00:00.000Z',
      committedBy: pusher,
      refs: {},
      packs: [],
      pushes: [record(2, tips[1]!)],
      earlierPushes: 'pushes/1-1-segment.json',
      encryption: 'none',
      tombstone: null,
    };
    const segments: string[] = [];
    const hydrated: string[] = [];
    let released = 0;
    const lines: Array<RepositoryAuditLine | AuditSummaryLine> = [];
    for await (const line of auditProvenance(
      {
        database,
        hydrate: async (target) => {
          hydrated.push(target.projectId);
          return {
            directory: root,
            manifest,
            release: async () => {
              released += 1;
            },
          };
        },
        readSegment: async (_target, key) => {
          segments.push(key);
          return new TextEncoder().encode(JSON.stringify({ previous: null, pushes: [record(1, tips[0]!)] }));
        },
      },
      { projectId: committed },
    )) {
      lines.push(line);
    }

    expect(hydrated).toStrictEqual([committed]);
    expect(released).toBe(1);
    expect(segments).toStrictEqual(['pushes/1-1-segment.json']);
    expect(lines[0]).toStrictEqual({
      kind: 'repository',
      projectId: committed,
      generation: 2,
      commits: 2,
      shapes: { git: 2, 'tau/2': 0, 'tau/other': 0 },
      tauWritten: 2,
      pseudonymous: 0,
      namesAccount: 2,
      records: 2,
      recordsWithOmitted: 0,
      omittedRefs: 0,
      missingTips: 0,
      unlisted: 0,
      lfs: { live: 1, marked: 0 },
    });
    const summary = lines.at(-1) as AuditSummaryLine;
    expect(summary).toMatchObject({ kind: 'summary', repositories: 1, failed: 0, commits: 2, unlisted: 0 });
    /* Other suites share the database: the orphan totals include this project's one finalized object at least. */
    expect(summary.orphans.unmarked).toBeGreaterThanOrEqual(1);
    expect(summary.orphans.unmarkedBytes).toBeGreaterThanOrEqual(7);
  });

  it('should skip a deleted project and report a lease that fails by its error name alone', async () => {
    const deleted = await newProject(3, true);
    const failing = await newProject(1);
    const lines: Array<RepositoryAuditLine | AuditSummaryLine> = [];
    for (const projectId of [deleted, failing]) {
      // oxlint-disable-next-line no-await-in-loop -- one audit per project, in order
      for await (const line of auditProvenance(
        {
          database,
          hydrate: async () => {
            throw new TypeError(`no lease for ${projectId} at s3://bucket/secret-key`);
          },
          readSegment: async () => new Uint8Array(),
        },
        { projectId },
      )) {
        lines.push(line);
      }
    }

    expect(lines.filter((line) => line.kind === 'repository')).toStrictEqual([
      { kind: 'repository', projectId: failing, generation: 1, error: 'TypeError' },
    ]);
  });
});
