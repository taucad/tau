import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MetricsService } from '#telemetry/metrics.js';
import { developmentSigningKeyJson } from '#api/git/forwarding/contract/development-keys.js';
import { mintGrant, storagePath } from '#api/git/forwarding/contract/grant.js';
import type { StorageGrant } from '#api/git/forwarding/contract/grant.js';
import { parseSigningKey } from '#api/git/forwarding/contract/keys.js';
import { StorageGitService } from '#api/git/worker/storage-git.service.js';
import { createMemoryRepositoryStore, seedLease } from '#testing/publication-lease.fixture.js';

/**
 * DC2 on the worker: tau-storage's leases draw their packs from the pack cache
 * once one is configured, and the API's in-process worker, configured without
 * one, still reads the store every time.
 */
describe('StorageGitService pack cache (DC2)', () => {
  const scratch = mkdtempSync(path.join(tmpdir(), 'tau-dc2-worker-'));
  const owner = 'user-dc2-worker';
  const project = 'proj-dc2-worker';
  const store = createMemoryRepositoryStore();
  let reads = 0;
  const counted = {
    ...store,
    getObject: async (...args: Parameters<typeof store.getObject>) => {
      reads += 1;
      return store.getObject(...args);
    },
  };
  const key = parseSigningKey(developmentSigningKeyJson('grant'), 'grant');
  const grant = (): StorageGrant =>
    mintGrant(
      {
        method: 'POST',
        path: storagePath(project, 'git-read'),
        owner,
        project,
        callerId: owner,
        committedBy: owner,
        remainingBytes: 1024 ** 3,
        storageLimitBytes: 1024 ** 3,
        recordedGeneration: 1,
        route: { store: 'r2', authoritative: true },
      },
      { key },
    ).grant;
  const receipts = { sign: () => 'receipt', post: async () => undefined };

  beforeAll(async () => {
    const source = path.join(scratch, 'source');
    mkdirSync(source);
    const git = (...args: string[]): void => {
      execFileSync('git', args, { cwd: source, stdio: 'ignore' });
    };
    git('init', '--quiet', '--initial-branch=main');
    writeFileSync(path.join(source, 'model.ts'), 'export const w = 1;\n');
    git('add', '.');
    git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '--quiet', '-m', 'one');
    const lease = await seedLease({ store, ownerId: owner, projectId: project, source });
    await lease.dispose();
  });

  afterAll(() => {
    rmSync(scratch, { recursive: true, force: true });
  });

  const readTwice = async (service: StorageGitService): Promise<string[]> => {
    const answers: string[] = [];
    for (let index = 0; index < 2; index += 1) {
      // oxlint-disable-next-line no-await-in-loop -- the second read is the one the first one warmed
      const output = await service.gitRead(grant(), {
        args: ['cat-file', '--batch'],
        stdin: 'main:model.ts\n',
        generation: 1,
      });
      answers.push(new TextDecoder().decode(output));
    }
    await service.settled();
    return answers;
  };

  it('should hydrate the second lease of a repository from the cache, with no store read', async () => {
    const metrics = new MetricsService();
    const sources: string[] = [];
    const record = metrics.gitHydrateBytes.record.bind(metrics.gitHydrateBytes);
    /* Without a provider every histogram is one no-op instance, so only the hydrate's records are kept. */
    metrics.gitHydrateBytes.record = (value, attributes) => {
      const source = attributes?.['tau.git.hydrate.source'];
      if (source !== undefined) {
        sources.push(String(source));
      }
      record(value, attributes);
    };
    const service = new StorageGitService({ store: counted, receipts, metrics, packCacheFraction: 0.5 });
    reads = 0;
    const answers = await readTwice(service);
    expect(answers[0]).toContain('export const w = 1;');
    expect(answers[1]).toBe(answers[0]);
    expect(reads).toBe(2);
    expect(sources).toEqual(['object_store', 'cache']);
    expect(service.packCache?.bytes).toBeGreaterThan(0);
    await service.packCache?.clear();
  });

  it('should read the store for every lease without a cache, as the in-process worker does', async () => {
    const service = new StorageGitService({ store: counted, receipts });
    reads = 0;
    await readTwice(service);
    expect(reads).toBe(4);
    expect(service.packCache).toBeUndefined();
  });
});
