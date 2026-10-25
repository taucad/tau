import { createEsbuildModuleVm } from '@taucad/esbuild/vm';
import { runGeoSpecModule } from 'geospec/runner';
import type { GeoSpecModuleVmModule, RunGeoSpecModuleOptions, VmFileSystem } from 'geospec/runner';
import { describe, expect, it } from 'vitest';
import { moduleVmModuleUrl } from '#commands/test.js';

const memoryFileSystem = (initial: Readonly<Record<string, string>>): VmFileSystem => {
  const files = new Map(Object.entries(initial));
  async function readFile(path: string): Promise<Uint8Array<ArrayBuffer>>;
  async function readFile(path: string, encoding: 'utf8'): Promise<string>;
  async function readFile(path: string, encoding?: 'utf8'): Promise<string | Uint8Array<ArrayBuffer>> {
    const value = files.get(path);
    if (value === undefined) {
      throw new Error(`ENOENT: ${path}`);
    }
    return encoding === 'utf8' ? value : new TextEncoder().encode(value);
  }
  return {
    exists: async (path) => files.has(path),
    readFile,
    writeFile: async (path, content) => {
      files.set(path, content);
    },
    ensureDir: async () => undefined,
  };
};

const dependencies = { 'esm-pkg': '^1.0.0' };

/** A project with one locked, installed package and a spec that imports it. */
const lockedProject = (): VmFileSystem =>
  memoryFileSystem({
    'package.json': JSON.stringify({ name: 'model', dependencies }),
    'package-lock.json': JSON.stringify({
      lockfileVersion: 3,
      requires: true,
      packages: { '': { name: 'model', dependencies }, 'node_modules/esm-pkg': { version: '1.0.0' } },
    }),
    'node_modules/esm-pkg/package.json': JSON.stringify({
      name: 'esm-pkg',
      version: '1.0.0',
      type: 'module',
      exports: './index.js',
    }),
    'node_modules/esm-pkg/index.js': 'export const answer = 42;',
    'main.geospec.ts': [
      "import { describe, it } from 'geospec';",
      "import { answer } from 'esm-pkg';",
      "describe('package import', () => {",
      "  it('sees the installed package', () => {",
      "    if (answer !== 42) throw new Error('wrong package');",
      '  });',
      '});',
    ].join('\n'),
  });

const nativeAssertions = { engine: {} } as unknown as RunGeoSpecModuleOptions['nativeAssertions'];

describe('tau test module VM', () => {
  it('should hand each pool worker Tau esbuild VM by URL', async () => {
    const module = (await import(moduleVmModuleUrl())) as GeoSpecModuleVmModule;
    expect(module.default).toBe(createEsbuildModuleVm);
  });

  it('should resolve a bare npm import in a spec through the injected VM', async () => {
    const { default: createModuleVm } = (await import(moduleVmModuleUrl())) as GeoSpecModuleVmModule;
    const result = await runGeoSpecModule({
      filesystem: lockedProject(),
      entryPath: 'main.geospec.ts',
      nativeAssertions,
      createModuleVm,
    });
    expect(result).toMatchObject({ success: true, passed: true, tests: [{ status: 'passed' }] });
  });

  it('should refuse the same import on GeoSpec plain default', async () => {
    const result = await runGeoSpecModule({
      filesystem: lockedProject(),
      entryPath: 'main.geospec.ts',
      nativeAssertions,
    });
    expect(result).toMatchObject({
      success: false,
      issues: [{ code: 'BUNDLER_FAILED', message: expect.stringContaining("Cannot import 'esm-pkg'") as string }],
    });
  });
});
