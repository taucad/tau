import { describe, expect, it, vi } from 'vitest';
import type { GeoSpecRunnerResult, GeoSpecRunnerRunOptions } from 'geospec/runner/worker';
import type { GeoSpecDiscoveryFileSystem } from 'geospec/runner';

import { createGeoSpecConfigSession } from '#geospec/config-session.js';
import { runGeoSpecTests } from '#geospec/run-tests.js';

const notApplied = {
  status: 'not-applied',
  configPath: 'geospec.config.ts',
  reason: 'unresolved-import',
  message: "The GeoSpec config imports 'geospec/model/node', which this host does not provide.",
} as const;

describe('createGeoSpecConfigSession', () => {
  it('should report an applied config on every call with its data fields as defaults', () => {
    const session = createGeoSpecConfigSession();
    const applied = { status: 'applied', configPath: 'geospec.config.ts', options: { bail: true } } as const;

    expect(session(applied)).toStrictEqual({
      defaults: { bail: true },
      report: { status: 'applied', path: 'geospec.config.ts' },
    });
    expect(session(applied)).toStrictEqual(session(applied));
  });

  it('should report a config it cannot apply once, then again only when it changes', () => {
    const session = createGeoSpecConfigSession();
    const report = {
      status: 'not-applied',
      path: 'geospec.config.ts',
      code: 'GEOSPEC_CONFIG_NOT_APPLIED',
      reason: 'unresolved-import',
      message: notApplied.message,
    };

    expect(session(notApplied)).toStrictEqual({ report });
    expect(session(notApplied)).toStrictEqual({});
    expect(session({ ...notApplied, reason: 'invalid', message: 'Unexpected token' })).toMatchObject({
      report: { reason: 'invalid', message: 'Unexpected token' },
    });
    expect(session({ status: 'absent' })).toStrictEqual({});
    expect(session(notApplied)).toStrictEqual({ report });
  });
});

describe('runGeoSpecTests with a project config', () => {
  const tree: Record<string, readonly string[]> = { '': ['a.geospec.ts', 'slow'], slow: ['b.geospec.ts'] };
  const discovery: GeoSpecDiscoveryFileSystem = {
    readdir: async (path: string) => tree[path] ?? [],
    stat: async (path: string) => ({ kind: path in tree ? 'directory' : 'file' }),
  };
  const runner = () => ({
    run: vi.fn(
      async ({ files }: GeoSpecRunnerRunOptions): Promise<GeoSpecRunnerResult> => ({
        success: true,
        passed: 0,
        failed: 0,
        selectedTests: 0,
        files: files.map((file) => ({
          file,
          result: {
            success: true,
            passed: true,
            tests: [],
            bundle: { code: '', issues: [], success: true, dependencies: [], unresolvedPaths: [] },
          },
        })),
      }),
    ),
  });
  const defaults = { exclude: ['slow/**'], testNamePattern: 'envelope', testTimeout: 4500, bail: true };

  it("should run with the config's data fields where the input leaves them out, and report the file", async () => {
    const fake = runner();
    const output = await runGeoSpecTests({
      discovery,
      runner: fake,
      args: {},
      config: { defaults, report: { status: 'applied', path: 'geospec.config.ts' } },
    });

    expect(fake.run).toHaveBeenCalledWith({
      files: ['a.geospec.ts'],
      testNamePattern: 'envelope',
      testTimeout: 4500,
      bail: true,
    });
    expect(output.config).toStrictEqual({ status: 'applied', path: 'geospec.config.ts' });
  });

  it('should let an input field replace the config field of the same name', async () => {
    const fake = runner();
    await runGeoSpecTests({
      discovery,
      runner: fake,
      args: { exclude: ['a.geospec.ts'], testNamePattern: 'closure', testTimeout: 100 },
      config: { defaults },
    });

    expect(fake.run).toHaveBeenCalledWith({
      files: ['slow/b.geospec.ts'],
      testNamePattern: 'closure',
      testTimeout: 100,
      bail: true,
    });
  });

  it('should run without the config and carry its not-applied report', async () => {
    const fake = runner();
    const session = createGeoSpecConfigSession();
    const output = await runGeoSpecTests({ discovery, runner: fake, args: {}, config: session(notApplied) });

    expect(fake.run).toHaveBeenCalledWith({ files: ['a.geospec.ts', 'slow/b.geospec.ts'] });
    expect(output.config).toMatchObject({ status: 'not-applied', code: 'GEOSPEC_CONFIG_NOT_APPLIED' });
  });
});
