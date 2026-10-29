import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { apiRoot, importChain, moduleGraph, moduleGraphExcept } from '#testing/module-graph.js';

/**
 * DC1's boundary between tau-api and tau-storage, held statically over the
 * module graphs of the two entry points (`main.ts`, `storage-worker.ts`).
 *
 * tau-api, on its forwarded path: no code path reachable from its image issues
 * a write verb under `repos/` (W9 Finding 2 as amended by review FR1: R2
 * tokens scope to buckets, not prefixes, so this test is the separation until
 * the repository bucket of its own), and it holds no lease and no repository
 * `git` child. The one exception is the in-process fallback an API without
 * `TAU_STORAGE_URL` runs (`forwarding/in-process-executor.ts`), which keeps
 * production's git working until a production tau-storage exists. Flipping
 * production means deleting that module and this exception, and dropping git
 * from the API image.
 * tau-storage: no database, no Redis and no Nest application.
 *
 * The graph over-approximates (see `module-graph.ts`), which is the safe
 * direction for "not reachable".
 */

/** The API's only route to the worker: the fallback while production has no tau-storage. */
const inProcessFallback = 'app/api/git/forwarding/in-process-executor.ts';

const fullApiGraph = moduleGraph('app/main.ts');
/** What main.ts reaches when it forwards: everything except the fallback. */
const apiGraph = moduleGraphExcept(new Set([inProcessFallback]), 'app/main.ts');
const storageGraph = moduleGraph('app/storage-worker.ts');

/** Source without comments, so a sentence that mentions `repos/` is not code that writes there. */
const code = (module: string): string =>
  readFileSync(path.join(apiRoot, module), 'utf8')
    .replaceAll(/\/\*[\s\S]*?\*\//gu, '')
    .replaceAll(/(^|[^:])\/\/.*$/gmu, '$1');

/** The repository store port's write verbs (`store/port.ts`). */
const repositoryWriteVerbs = /\.(?:commitManifest|putObject|deleteObjects)\(/u;

/** The object-store driver's write verbs (`storage/object-storage.service.ts`), presigned writes included. */
const objectWriteVerbs =
  /\.(?:putBlob|putBlobStream|deleteBlob|deleteBlobs|copyBlob|createMultipartUpload|uploadPart|completeMultipartUpload|presignPut|presignUploadPart|deleteEntirePrefixForPurgeJob)\(/u;

/** What names a key under a repository's prefix. */
const repositoryKey = /repos\/|projectPreviewKey\(|repositoryPrefix\(/u;

/** The drivers that define the verbs; whoever calls them is what is checked. */
const drivers = new Set(['app/storage/object-storage.service.ts', 'app/api/git/store/s3-repository-store.ts']);

const reached = (graph: ReturnType<typeof moduleGraph>, modules: readonly string[]): string[] =>
  modules.filter((module) => graph.modules.has(module)).map((module) => importChain(graph, module));

describe('tau-api writes nothing under repos/ on its forwarded path (DC1)', () => {
  it('should reach no repository committer, sweeper, fence or tombstone writer from main.ts', () => {
    expect(
      reached(apiGraph, [
        'app/api/git/store/commit.ts',
        'app/api/git/store/compaction.ts',
        'app/api/git/store/sweep.ts',
        'app/api/git/store/fence.ts',
        'app/api/git/store/tombstone-fence.ts',
        'app/api/projects/project-preview-store.ts',
        'app/api/git/maintenance/purge.ts',
      ]),
    ).toEqual([]);
  });

  it('should call no repository store write verb from any module main.ts reaches', () => {
    const writers = [...apiGraph.modules].filter(
      (module) => !drivers.has(module) && repositoryWriteVerbs.test(code(module)),
    );
    expect(writers.map((module) => importChain(apiGraph, module))).toEqual([]);
  });

  it('should name no repository key in any module main.ts reaches that writes to the object store', () => {
    const writers = [...apiGraph.modules].filter((module) => {
      if (drivers.has(module)) {
        return false;
      }
      const source = code(module);
      return objectWriteVerbs.test(source) && repositoryKey.test(source);
    });
    expect(writers.map((module) => importChain(apiGraph, module))).toEqual([]);
  });

  it('should hold no lease and spawn no repository git child from main.ts', () => {
    expect(
      reached(apiGraph, [
        'app/api/git/store/lease.ts',
        'app/api/git/lease-host.ts',
        'app/api/git/advertisement-probe.ts',
        'app/api/git/lfs-references.ts',
        'app/api/git/worker/storage-git.service.ts',
        'app/api/git/worker/storage-server.ts',
      ]),
    ).toEqual([]);
  });
});

/** A `git` child spawned by name, through any `node:child_process` entry. */
const gitSpawn = /\b(?:spawn|spawnSync|execFile|execFileSync|exec|execSync|fork)\w*\(\s*['"`]git['"`]/u;

describe('tau-api runs no git on its forwarded path (DC3)', () => {
  it('should spawn no git child from any module main.ts reaches', () => {
    const spawners = [...apiGraph.modules].filter((module) => gitSpawn.test(code(module)));
    expect(spawners.map((module) => importChain(apiGraph, module))).toEqual([]);
  });

  it('should still find the git children tau-storage spawns, so the pattern is not blind', () => {
    const spawners = [...storageGraph.modules].filter((module) => gitSpawn.test(code(module)));
    expect(spawners).toContain('app/api/git/store/lease.ts');
  });
});

describe('the in-process fallback (DC1, until production has tau-storage)', () => {
  it('should be the only module through which main.ts reaches the storage worker', () => {
    expect(fullApiGraph.modules.has(inProcessFallback)).toBe(true);
    expect(fullApiGraph.modules.has('app/api/git/worker/storage-git.service.ts')).toBe(true);
    expect(apiGraph.modules.has('app/api/git/worker/storage-git.service.ts')).toBe(false);
  });
});

describe('tau-storage holds no database, Redis or Nest application (DC1)', () => {
  it('should reach no database or Redis module from storage-worker.ts', () => {
    const forbidden = [...storageGraph.modules].filter((module) => /^app\/(?:database|redis)\//u.test(module));
    expect(forbidden.map((module) => importChain(storageGraph, module))).toEqual([]);
  });

  it('should import no database, Redis or Nest application package', () => {
    const forbidden = ['postgres', 'drizzle-orm', 'ioredis', '@nestjs/core', '@nestjs/platform-fastify', 'pg'];
    expect(forbidden.filter((name) => storageGraph.packages.has(name))).toEqual([]);
  });

  it('should still reach the committer, which is what it is for', () => {
    expect(storageGraph.modules.has('app/api/git/store/commit.ts')).toBe(true);
  });
});
