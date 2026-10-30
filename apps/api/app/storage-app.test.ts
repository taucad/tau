import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { storageEnvironmentSchema } from '#config/storage-environment.config.js';
import { commitDeadlineMilliseconds } from '#api/git/store/limits.js';
import { receiptRoutePath } from '#api/git/worker/receipt-channel.js';
import { apiRoot } from '#testing/module-graph.js';

/**
 * North star DC1: `tau-storage` is a private app built from the API's
 * Dockerfile. These tests tie its deployable pieces to one another and to the
 * package's acceptance: the `storage` target runs the storage worker with the
 * pinned git and no git-lfs (FR16), its Fly config is Flycast-only in `syd`
 * with no database or Redis, both apps set the proxy's `idle_timeout` past the
 * commit deadline (FR11), and CI deploys storage, the grant verifier, before
 * the API (FR12).
 */

const read = (file: string): string => readFileSync(path.join(apiRoot, file), 'utf8');
const repositoryRoot = path.join(apiRoot, '../..');
const readRepository = (file: string): string => readFileSync(path.join(repositoryRoot, file), 'utf8');

type Stage = { from: string; instructions: string[] };

/** The Dockerfile's stages by name, each with its base and its instructions (continuations joined). */
const dockerStages = (): Map<string, Stage> => {
  const stages = new Map<string, Stage>();
  let current: Stage | undefined;
  for (const line of read('Dockerfile').replaceAll('\\\n', ' ').split('\n')) {
    const from = /^FROM\s+(\S+)\s+AS\s+(\S+)/iu.exec(line);
    if (from) {
      current = { from: from[1] ?? '', instructions: [] };
      stages.set(from[2] ?? '', current);
    } else if (current !== undefined && /^[A-Z]+\s/u.test(line)) {
      current.instructions.push(line);
    }
  }
  return stages;
};

/** A stage's instructions followed by those of every stage it builds on, nearest first. */
const inherited = (stages: Map<string, Stage>, name: string): string[] => {
  const instructions: string[] = [];
  for (let stage = stages.get(name); stage !== undefined; stage = stages.get(stage.from)) {
    instructions.push(...stage.instructions);
  }
  return instructions;
};

/**
 * A Fly config's tables, each a map of its keys to their raw values. Enough of
 * TOML for these files: `[table]`, `[[array]]` (each entry its own table, keyed
 * by its name and index) and `key = value` lines.
 */
const flyTables = (file: string): Map<string, Map<string, string>> => {
  const tables = new Map<string, Map<string, string>>([['', new Map()]]);
  const counts = new Map<string, number>();
  let current = tables.get('') ?? new Map<string, string>();
  for (const raw of readRepository(file).split('\n')) {
    const line = raw.replace(/\s+#.*$/u, '').trim();
    if (line === '' || line.startsWith('#')) {
      continue;
    }
    const array = /^\[\[([^\]]+)\]\]$/u.exec(line);
    const table = /^\[([^\]]+)\]$/u.exec(line);
    if (array) {
      const name = array[1] ?? '';
      const index = counts.get(name) ?? 0;
      counts.set(name, index + 1);
      current = new Map();
      tables.set(`${name}#${String(index)}`, current);
    } else if (table) {
      current = new Map();
      tables.set(table[1] ?? '', current);
    } else {
      const pair = /^([\w-]+)\s*=\s*(.+)$/u.exec(line);
      if (pair) {
        current.set(pair[1] ?? '', (pair[2] ?? '').replaceAll(/^['"]|['"]$/gu, ''));
      }
    }
  }
  return tables;
};

const value = (tables: Map<string, Map<string, string>>, table: string, key: string): string | undefined =>
  tables.get(table)?.get(key);

/** The commit deadline plus at least half a minute of margin, in seconds. */
const idleFloorSeconds = commitDeadlineMilliseconds / 1000 + 30;

describe('the Dockerfile storage target (DC1)', () => {
  const stages = dockerStages();

  it('should run the storage worker bundle that vite.storage-worker.config.ts builds from app/storage-worker.ts', () => {
    const command = inherited(stages, 'storage').find((line) => line.startsWith('CMD '));
    expect(command).toBe('CMD ["node", "/app/dist/storage-worker.js"]');
    const config = read('vite.storage-worker.config.ts');
    expect(config).toContain("entryFileNames: 'storage-worker.js'");
    expect(config).toContain("ssr: 'app/storage-worker.ts'");
  });

  it('should install no git-lfs anywhere the storage image inherits from, and the pinned git', () => {
    const lines = inherited(stages, 'storage');
    expect(lines.filter((line) => /git-lfs[=\s"]/u.test(line) && line.startsWith('RUN apt-get'))).toEqual([]);
    expect(lines.some((line) => line.includes(`"git=\${GIT_VERSION}"`))).toBe(true);
  });

  it('should assert at build that git is the pinned Debian package and that git-lfs is absent', () => {
    const assertion = stages.get('storage')?.instructions.find((line) => line.startsWith('RUN test '));
    expect(assertion).toContain(`dpkg-query -W -f='\${Version}' git)" = "\${GIT_VERSION}"`);
    expect(assertion).toContain(`test "$(git --version)" = "git version \${upstream%%-*}"`);
    expect(assertion).toContain('! command -v git-lfs');
  });

  it('should listen on the port the Fly config forwards to and name its telemetry tau-storage', () => {
    const own = stages.get('storage')?.instructions ?? [];
    expect(own.some((line) => line.startsWith('ENV ') && line.includes('PORT="3100"'))).toBe(true);
    expect(own.some((line) => line.includes('OTEL_SERVICE_NAME="tau-storage"'))).toBe(true);
  });

  it('should keep the API as the last stage, so a build without --target is still the API', () => {
    const names = [...stages.keys()];
    expect(names.at(-1)).toBe('runtime');
    expect(inherited(stages, 'runtime').find((line) => line.startsWith('CMD '))).toBe(
      'CMD ["node", "/app/dist/main.js"]',
    );
  });
});

describe('the tau-storage Fly config (DC1)', () => {
  const tables = flyTables('apps/storage/fly.staging.toml');

  it('should build the storage target of the API Dockerfile for tau-storage-staging in syd', () => {
    expect(value(tables, '', 'app')).toBe('tau-storage-staging');
    expect(value(tables, '', 'primary_region')).toBe('syd');
    expect(value(tables, 'build', 'dockerfile')).toBe('../api/Dockerfile');
    expect(value(tables, 'build', 'build-target')).toBe('storage');
  });

  it('should serve one HTTP service on the worker port, over plain Flycast, with no other service or mount', () => {
    expect(value(tables, 'http_service', 'internal_port')).toBe('3100');
    expect(value(tables, 'env', 'PORT')).toBe('3100');
    expect(value(tables, 'http_service', 'force_https')).toBe('false');
    const names = [...tables.keys()];
    expect(names.filter((name) => /^(?:services|mounts)\b/u.test(name))).toEqual([]);
    expect(value(tables, 'deploy', 'release_command')).toBeUndefined();
  });

  it('should set the proxy idle timeout past the commit deadline (FR11)', () => {
    expect(Number(value(tables, 'http_service.http_options', 'idle_timeout'))).toBeGreaterThanOrEqual(idleFloorSeconds);
  });

  it('should set only variables the storage schema reads, and never a database or Redis URL', () => {
    const environment = [...(tables.get('env')?.keys() ?? [])];
    const known = new Set([...Object.keys(storageEnvironmentSchema.shape), 'OTEL_SERVICE_NAME', 'OTEL_METRICS_PORT']);
    expect(environment.filter((name) => !known.has(name))).toEqual([]);
    expect(environment).not.toContain('DATABASE_URL');
    expect(environment).not.toContain('REDIS_URL');
  });

  it('should post receipts to the API receipt route', () => {
    expect(new URL(value(tables, 'env', 'TAU_STORAGE_RECEIPT_URL') ?? 'http://invalid').pathname).toBe(
      receiptRoutePath,
    );
  });
});

describe('the API Fly configs and the deploy order (DC1)', () => {
  it.each(['apps/api/fly.staging.toml', 'apps/api/fly.prod.toml'])(
    'should set the proxy idle timeout past the commit deadline in %s (FR11)',
    (file) => {
      expect(Number(value(flyTables(file), 'http_service.http_options', 'idle_timeout'))).toBeGreaterThanOrEqual(
        idleFloorSeconds,
      );
    },
  );

  it('should forward the staging API to tau-storage-staging over Flycast', () => {
    expect(value(flyTables('apps/api/fly.staging.toml'), 'env', 'TAU_STORAGE_URL')).toBe(
      'http://tau-storage-staging.flycast',
    );
  });

  it('should deploy the storage app, the grant verifier, before the API on staging (FR12)', () => {
    const staging = readRepository('.github/workflows/staging.yml');
    const apiJob = /\n {2}deploy-api-staging:\n([\s\S]*?)\n {2}[\w-]+:\n/u.exec(staging)?.[1] ?? '';
    expect(apiJob).toMatch(/needs: \[[^\]]*\bdeploy-storage-staging\b[^\]]*\]/u);
    expect(apiJob).toContain("needs.deploy-storage-staging.result == 'skipped'");
    const storageJob = /\n {2}deploy-storage-staging:\n([\s\S]*?)\n {2}[\w-]+:\n/u.exec(staging)?.[1] ?? '';
    expect(storageJob).toContain('app: storage');
    expect(/needs: \[([^\]]*)\]/u.exec(storageJob)?.[1]).not.toContain('deploy-api-staging');
  });

  it('should deploy storage with its own token and verify it left the API Machines untouched', () => {
    const deploy = readRepository('.github/workflows/deploy.yml');
    expect(deploy).toContain('FLY_STORAGE_API_TOKEN');
    expect(deploy).toContain('Snapshot the API Machines before a storage deploy');
    expect(deploy).toContain('Verify the storage app is private and the API untouched');
  });

  it('should give the storage deploy unit a target and the staging deploy tag', () => {
    const project = JSON.parse(readRepository('apps/storage/project.json')) as {
      tags: string[];
      implicitDependencies: string[];
      targets: Record<string, unknown>;
    };
    expect(project.tags).toContain('deploy:staging');
    expect(project.implicitDependencies).toEqual(['api']);
    expect(Object.keys(project.targets)).toContain('deploy');
  });
});
