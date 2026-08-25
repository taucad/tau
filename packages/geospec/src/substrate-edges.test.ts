import { afterEach, describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { geoSpecEngineProtocolVersion } from '#engine/protocol.js';
import { clearGeoSpecEngine, registerGeoSpecEngine } from '#engine/seam.js';
import { createTestGeoSpecEngineProtocol } from '#engine/protocol.test-support.js';
import type { VmFileSystem } from '@taucad/esbuild/vm';
import type { GeometrySubject } from '#mesh/types.js';
import type { GeoSpecRunProfile } from '#runner/profile.js';
import { GeoSpecModelLoadError } from '#model/errors.js';
import { createCollector, GeoSpecAssertionError } from '#runner/collector.js';
import { discoverGeoSpecFiles } from '#runner/discovery.js';
import type { GeoSpecDiscoveryFileSystem } from '#runner/discovery.js';
import { chargeBudget, withMatcherBudget } from '#runner/matcher-budget.js';
import { runGeoSpecModule } from '#runner/index.js';
import { createSerialGeoSpecRunner } from '#runner/worker/serial-runner.js';

afterEach(() => {
  clearGeoSpecEngine();
  vi.unstubAllEnvs();
});

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

describe('async matcher success path', () => {
  it('should record a passing async assertion', async () => {
    registerGeoSpecEngine({
      protocolVersion: geoSpecEngineProtocolVersion,
      engine: 'edge-engine',
      version: '0.0.0',
      protocol: createTestGeoSpecEngineProtocol({ capabilities: ['toHaveSpatialRelationships'] }),
    });

    const collector = createCollector();
    collector.it('relationships', () => {
      collector.expectGeo({ subjectId: 'subject-1' }).toHaveSpatialRelationships({ relationships: [] });
    });
    await collector.waitForCompletion(1000);

    expect(collector.tests[0]?.status).toBe('passed');
    expect(collector.tests[0]?.assertions[0]?.passed).toBe(true);
  });

  it('should apply the deterministic work-unit budget while an async matcher starts', async () => {
    registerGeoSpecEngine({
      protocolVersion: geoSpecEngineProtocolVersion,
      engine: 'edge-engine',
      version: '0.0.0',
      protocol: createTestGeoSpecEngineProtocol({
        capabilities: ['toHaveSpatialRelationships'],
        submitClaims: () => {
          chargeBudget(8_000_001);
          throw new Error('unreachable');
        },
      }),
    });

    const collector = createCollector();
    collector.it('relationships', () => {
      collector.expectGeo({ subjectId: 'subject-1' }).toHaveSpatialRelationships({ relationships: [] });
    });
    await collector.waitForCompletion(1000);

    expect(collector.tests[0]?.diagnostics[0]?.code).toBe('MATCHER_TIMEOUT');
  });
});

describe('matcher budget private test controls', () => {
  it('should accept a private unit budget', () => {
    const diagnostics = withMatcherBudget({
      matcher: 'voidContinuity',
      workUnitBudget: 1,
      evaluate: () => {
        chargeBudget(2);
        return [];
      },
    });

    expect(diagnostics[0]?.code).toBe('MATCHER_TIMEOUT');
  });

  it('should accept a private wall backstop', () => {
    const diagnostics = withMatcherBudget({
      matcher: 'stalled',
      wallBackstop: 0.000_001,
      evaluate: () => {
        const start = Date.now();
        while (Date.now() <= start) {
          // Spin past the deadline
        }
        chargeBudget(1);
        return [];
      },
    });

    expect(diagnostics[0]?.code).toBe('MATCHER_STALLED');
  });

  it('should use canonical defaults when no private limit is supplied', () => {
    expect(
      withMatcherBudget({
        matcher: 'voidContinuity',
        evaluate: () => {
          chargeBudget(1);
          return [];
        },
      }),
    ).toStrictEqual([]);
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
  it('should accept roots at the filesystem root', async () => {
    const result = await discoverGeoSpecFiles({
      filesystem: filesystemOf(['/specs/a.geospec.ts']),
      projectPath: '/',
      files: ['specs'],
    });

    expect(result.files).toStrictEqual(['specs/a.geospec.ts']);
  });

  it('should accept an absolute root outside the project path', async () => {
    const result = await discoverGeoSpecFiles({
      filesystem: filesystemOf(['/outside/a.geospec.ts']),
      projectPath: '/project',
      files: ['/outside'],
    });

    expect(result.files).toStrictEqual(['/outside/a.geospec.ts']);
  });

  it('should report an empty root as the dot root', async () => {
    const result = await discoverGeoSpecFiles({
      filesystem: filesystemOf(['/project/notes.md']),
      projectPath: '/project',
      files: [''],
    });

    expect(result.unmatchedRoots).toStrictEqual(['.']);
  });

  it('should ignore a directory named with a trailing slash', async () => {
    const result = await discoverGeoSpecFiles({
      filesystem: filesystemOf(['/project/skipme/a.geospec.ts']),
      projectPath: '/project',
      files: ['skipme/'],
      ignoredDirectories: ['skipme'],
    });

    expect(result.files).toStrictEqual([]);
  });
});

describe('concurrent module runs', () => {
  const module_ = "import { it } from 'geospec'; it('runs', () => {});";

  it('should share one run-binding registry and clean it up once', async () => {
    const run = async () =>
      runGeoSpecModule({
        filesystem: filesystemOf([]) as unknown as VmFileSystem,
        entryPath: '/spec.geospec.ts',
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
        entryPath: '/a.geospec.ts',
      }),
      runGeoSpecModule({
        filesystem: filesystem as unknown as VmFileSystem,
        entryPath: '/b.geospec.ts',
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
    runner = createSerialGeoSpecRunner({ filesystem });
    runner.on('file-complete', () => {
      runner.abort('');
    });

    const result = await runner.run({ files: ['/a.geospec.ts', '/b.geospec.ts'] });

    expect(result.issues?.[0]?.message).toBe('GeoSpec run aborted.');
  });

  it('should forward step loaders, builtin modules, and an internal profile', async () => {
    const subject = { kind: 'geometry-subject' } as unknown as GeometrySubject;
    registerGeoSpecEngine({
      protocolVersion: geoSpecEngineProtocolVersion,
      engine: 'edge-engine',
      version: '0.0.0',
      protocol: createTestGeoSpecEngineProtocol(),
    });

    const runner = createSerialGeoSpecRunner({
      filesystem,
      modelLoader: async () => subject,
      stepLoader: async () => subject,
      builtinModules: { extra: { version: '1', code: 'export const x = 1;' } },
      internalProfile: mock<GeoSpecRunProfile>(),
    });

    const result = await runner.run({ files: ['/a.geospec.ts'] });

    expect(result.success).toBe(true);
  });
});
