import { readdir, realpath, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadGeoSpecConfig } from '#config/node/index.js';
import { resolveGeoSpecConfig } from '#config/validate.js';
import { createConfigFixture } from '#config/fixtures.test-support.js';
import { defineConfig } from '#config/index.js';
import type { GeoSpecConfig } from '#config/index.js';
import type { GeoSpecModelExporter } from '#model/types.js';
import type { GeoSpecDiscoveryFileSystem } from '#runner/discovery.js';
import { discoverGeoSpecFiles } from '#runner/discovery.js';
// oxlint-disable-next-line no-restricted-imports -- Read the literal JSON fixture without a TypeScript source alias.
import expected from './__fixtures__/expected.json' with { type: 'json' };

const filesystem: GeoSpecDiscoveryFileSystem = {
  readdir,
  async stat(path: string) {
    const entry = await stat(path);
    return { kind: entry.isDirectory() ? 'directory' : 'file' };
  },
};

describe('trusted Node GeoSpec configuration', () => {
  it('should leave defaults at their existing owners when no file exists', async () => {
    const projectPath = await createConfigFixture();
    expect(await loadGeoSpecConfig({ projectPath })).toStrictEqual({ options: expected.noConfig });
    expect(await loadGeoSpecConfig({ projectPath, overrides: { bail: false, include: [] } })).toStrictEqual({
      options: { bail: false, include: [] },
    });
  });

  it('should replace whole fields without mutating either input', async () => {
    const projectPath = await createConfigFixture(['mjs']);
    const configPath = await realpath(join(projectPath, 'geospec.config.mjs'));
    const imported = (await import(pathToFileURL(configPath).href)) as { default: unknown };
    const before = structuredClone(imported.default);
    const overrides: GeoSpecConfig = {
      include: [],
      exclude: [],
      testNamePattern: undefined,
      testTimeout: 600,
      bail: false,
    };
    const beforeOverrides = structuredClone(overrides);
    expect(await loadGeoSpecConfig({ projectPath })).toStrictEqual({ configPath, options: expected.configured });
    expect(await loadGeoSpecConfig({ projectPath, overrides })).toStrictEqual({
      configPath,
      options: expected.resolved,
    });
    expect(imported.default).toStrictEqual(before);
    expect(overrides).toStrictEqual(beforeOverrides);
  });

  it('should resolve a defineConfig import to this copy when the project has no geospec install', async () => {
    const projectPath = await createConfigFixture(['ts']);
    expect(await loadGeoSpecConfig({ projectPath })).toStrictEqual({
      configPath: await realpath(join(projectPath, 'geospec.config.ts')),
      options: expected.configured,
    });
  });

  it('should keep live exporters by identity', () => {
    const exporter: GeoSpecModelExporter = {
      id: 'fixture',
      extensions: ['py'],
      capabilities: { formats: ['step'] },
      export: async () => ({ bytes: new Uint8Array([1]), format: 'step' }),
    };
    const resolved = resolveGeoSpecConfig(defineConfig({ exporters: [exporter] }));
    expect(resolved.exporters?.[0]).toBe(exporter);
    expect(defineConfig({ bail: true })).toStrictEqual({ bail: true });
  });

  it('should reject multiple implicit files and honor an explicit selection', async () => {
    const projectPath = await createConfigFixture(['js', 'mjs']);
    const operation = loadGeoSpecConfig({ projectPath });
    await expect(operation).rejects.toThrow(TypeError);
    await expect(operation).rejects.toThrow(
      'Multiple GeoSpec configs found: geospec.config.js, geospec.config.mjs. Select configPath explicitly.',
    );
    expect(await loadGeoSpecConfig({ projectPath, configPath: 'geospec.config.mjs' })).toStrictEqual({
      configPath: await realpath(join(projectPath, 'geospec.config.mjs')),
      options: expected.configured,
    });
  });

  it('should pass resolved options to existing discovery without interpreting empty discovery as a run', async () => {
    const projectPath = await createConfigFixture(['mjs']);
    const configured = await loadGeoSpecConfig({ projectPath });
    const selected = await discoverGeoSpecFiles({ filesystem, projectPath, ...configured.options });
    expect(selected.files).toStrictEqual(expected.discoveryConfigured);
    const emptyInclude = await loadGeoSpecConfig({ projectPath, overrides: { include: [], exclude: [] } });
    expect(emptyInclude.options.include).toStrictEqual([]);
    const defaultSelection = await discoverGeoSpecFiles({ filesystem, projectPath, ...emptyInclude.options });
    expect(defaultSelection.files).toStrictEqual(expected.discoveryEmptyIncludeUsesExistingDefaults);
    const excluded = await loadGeoSpecConfig({ projectPath, overrides: { exclude: ['**/*'] } });
    const excludedSelection = await discoverGeoSpecFiles({ filesystem, projectPath, ...excluded.options });
    expect(excludedSelection.files).toStrictEqual(expected.discoveryExcludeAll);
  });

  it.each([
    { value: [], message: 'GeoSpec config must be a plain object.' },
    { value: { timeout: 1 }, message: "Unsupported GeoSpec config field 'timeout'." },
    { value: { forensic: true }, message: "Unsupported GeoSpec config field 'forensic'." },
    { value: { matcherWallBackstop: 1 }, message: "Unsupported GeoSpec config field 'matcherWallBackstop'." },
    { value: { testTimeout: 0 }, message: 'GeoSpec testTimeout must be positive finite milliseconds.' },
    { value: { bail: 'yes' }, message: 'GeoSpec bail must be a boolean.' },
    { value: { include: 'cases' }, message: 'GeoSpec include must be an array of strings.' },
    { value: { cache: true }, message: "Unsupported GeoSpec config field 'cache'." },
    { value: { cacheDirectory: '.tau' }, message: "Unsupported GeoSpec config field 'cacheDirectory'." },
    { value: { subjects: {} }, message: "Unsupported GeoSpec config field 'subjects'." },
    { value: { runtime: [] }, message: "Unsupported GeoSpec config field 'runtime'." },
    { value: { exporters: {} }, message: 'GeoSpec exporters must be an array of model exporters.' },
    { value: { exporters: [{ id: '' }] }, message: 'GeoSpec exporters[0] must have a non-empty string id.' },
    {
      value: { exporters: [{ id: 'x', extensions: ['py'], capabilities: { formats: ['step'] } }] },
      message: "GeoSpec exporter 'x' must have an export function.",
    },
  ])('should reject an ordinary invalid setting: $message', ({ value, message }) => {
    expect(() => resolveGeoSpecConfig(value)).toThrow(TypeError);
    expect(() => resolveGeoSpecConfig(value)).toThrow(message);
  });
});
