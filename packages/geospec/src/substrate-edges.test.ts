import { afterEach, describe, expect, it, vi } from 'vitest';
import type { VmFileSystem } from '@taucad/esbuild/vm';
import type { GeoSpecAssertionClientOptions } from '#assertion-client/index.js';
import { GeoSpecModelLoadError } from '#model/errors.js';
import { GeoSpecAssertionError } from '#runner/collector.js';
import { discoverGeoSpecFiles } from '#runner/discovery.js';
import type { GeoSpecDiscoveryFileSystem } from '#runner/discovery.js';
import { runGeoSpecModule } from '#runner/index.js';
import { createSerialGeoSpecRunner } from '#runner/worker/serial-runner.js';

afterEach(() => {
  vi.unstubAllEnvs();
});

const nativeAssertions = {
  engine: {
    evaluateClaim: (input: Uint8Array<ArrayBuffer>) => ({
      canonicalClaim: input,
      canonicalPlan: input,
      canonicalResult: input,
    }),
    processRequest: (input: Uint8Array<ArrayBuffer>) => input,
  },
} satisfies GeoSpecAssertionClientOptions;

/** A value structuredClone refuses: functions are not transferable. */
const unclonable = (): (() => void) => () => undefined;

describe('model-load diagnostics cloning', () => {
  it('should keep string details when the diagnostic itself cannot be cloned', () => {
    const error = new GeoSpecModelLoadError([
      { code: 'A', severity: 'error', message: 'x', suggestion: unclonable() as unknown as string, details: 'reason' },
    ]);

    expect(error.diagnostics[0]?.details).toBe('reason');
  });

  it('should mark details that JSON cannot serialize', () => {
    const error = new GeoSpecModelLoadError([{ code: 'A', severity: 'error', message: 'x', details: unclonable() }]);

    expect(error.diagnostics[0]?.details).toBe('[unserializable diagnostic details]');
  });

  it('should mark details that JSON refuses outright', () => {
    const circular: Record<string, unknown> = { fn: unclonable() };
    circular['self'] = circular;
    const error = new GeoSpecModelLoadError([{ code: 'A', severity: 'error', message: 'x', details: circular }]);

    expect(error.diagnostics[0]?.details).toBe('[unserializable diagnostic details]');
  });

  it('should omit absent details when the diagnostic cannot be cloned', () => {
    const error = new GeoSpecModelLoadError([
      { code: 'A', severity: 'error', message: 'x', suggestion: unclonable() as unknown as string },
    ]);

    expect(error.diagnostics[0]).not.toHaveProperty('details');
  });
});

describe('assertion error', () => {
  it('should default its message when constructed with no diagnostics', () => {
    expect(new GeoSpecAssertionError([]).message).toBe('GeoSpec assertion failed.');
  });
});

const filesystemOf = (paths: readonly string[]): GeoSpecDiscoveryFileSystem => {
  const files = new Set(paths);
  const directories = new Set<string>(['/']);
  for (const path of paths) {
    let current = '';
    for (const segment of path.split('/').slice(1, -1)) {
      current = `${current}/${segment}`;
      directories.add(current);
    }
  }
  return {
    async readdir(path) {
      const prefix = path === '/' ? '/' : `${path}/`;
      const entries = new Set<string>();
      for (const candidate of [...files, ...directories]) {
        if (candidate === path || !candidate.startsWith(prefix)) {
          continue;
        }
        entries.add(candidate.slice(prefix.length).split('/')[0] ?? '');
      }
      return [...entries];
    },
    async stat(path) {
      if (files.has(path)) {
        return { kind: 'file' };
      }
      if (directories.has(path)) {
        return { kind: 'directory' };
      }
      throw new Error(`ENOENT: ${path}`);
    },
  };
};

describe('discovery path edges', () => {
  it('should accept rooted paths at a host filesystem root', async () => {
    const result = await discoverGeoSpecFiles({
      filesystem: filesystemOf(['/specs/a.geospec.ts']),
      projectPath: '/',
      files: ['specs'],
    });

    expect(result.files).toStrictEqual(['specs/a.geospec.ts']);
  });

  it('should reject an absolute selection root before filesystem access', async () => {
    const filesystem = filesystemOf(['/outside/a.geospec.ts']);
    await expect(
      discoverGeoSpecFiles({ filesystem, projectPath: '/project', files: ['/outside'] }),
    ).rejects.toMatchObject({ name: 'VirtualPathError' });
  });

  it('should report an empty root as the dot root', async () => {
    const result = await discoverGeoSpecFiles({
      filesystem: filesystemOf(['/project/notes.md']),
      projectPath: '/project',
      files: [''],
    });

    expect(result.unmatchedRoots).toStrictEqual(['.']);
  });

  it('should reject a directory root with a trailing slash', async () => {
    await expect(
      discoverGeoSpecFiles({
        filesystem: filesystemOf(['/project/skipme/a.geospec.ts']),
        projectPath: '/project',
        files: ['skipme/'],
        ignoredDirectories: ['skipme'],
      }),
    ).rejects.toMatchObject({ name: 'VirtualPathError' });
  });
});

describe('concurrent module runs', () => {
  const module_ = "import { it } from 'geospec'; it('runs', () => {});";

  it('should share one run-binding registry and clean it up once', async () => {
    const run = async () =>
      runGeoSpecModule({
        filesystem: filesystemOf([]) as unknown as VmFileSystem,
        entryPath: 'spec.geospec.ts',
        nativeAssertions,
        builtinModules: {},
      });

    const filesystem = {
      async exists() {
        return true;
      },
      async readFile(_path: string, encoding?: 'utf8') {
        return encoding === 'utf8' ? module_ : new TextEncoder().encode(module_);
      },
      async writeFile() {
        return undefined;
      },
      async ensureDir() {
        return undefined;
      },
    };

    const [first, second] = await Promise.all([
      runGeoSpecModule({
        filesystem: filesystem as unknown as VmFileSystem,
        entryPath: 'a.geospec.ts',
        nativeAssertions,
      }),
      runGeoSpecModule({
        filesystem: filesystem as unknown as VmFileSystem,
        entryPath: 'b.geospec.ts',
        nativeAssertions,
      }),
    ]);

    expect(first.success).toBe(true);
    expect(second.success).toBe(true);
    expect(run).toBeTypeOf('function');
  });
});

describe('serial runner edges', () => {
  const module_ = "import { it } from 'geospec'; it('runs', () => {});";
  const filesystem = {
    async exists() {
      return true;
    },
    async readFile(_path: string, encoding?: 'utf8') {
      return encoding === 'utf8' ? module_ : new TextEncoder().encode(module_);
    },
    async writeFile() {
      return undefined;
    },
    async ensureDir() {
      return undefined;
    },
  } as unknown as VmFileSystem;

  it('should use the bare abort message for an empty reason', async () => {
    // oxlint-disable-next-line eslint/prefer-const -- the event handler closes over the runner it creates.
    let runner: ReturnType<typeof createSerialGeoSpecRunner>;
    runner = createSerialGeoSpecRunner({ filesystem, nativeAssertions });
    runner.on('file-complete', () => {
      runner.abort('');
    });

    const result = await runner.run({ files: ['a.geospec.ts', 'b.geospec.ts'] });

    expect(result.issues?.[0]?.message).toBe('GeoSpec run aborted.');
  });

  it('should forward builtin modules', async () => {
    const runner = createSerialGeoSpecRunner({
      filesystem,
      nativeAssertions,
      builtinModules: { extra: { version: '1', code: 'export const x = 1;' } },
    });

    const result = await runner.run({ files: ['a.geospec.ts'] });

    expect(result.success).toBe(true);
  });
});
