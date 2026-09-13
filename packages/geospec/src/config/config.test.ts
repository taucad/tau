import { readdir, realpath, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadGeoSpecConfig } from '#config/node/index.js';
import { resolveGeoSpecConfig } from '#config/validate.js';
import { createConfigFixture } from '#config/fixtures.test-support.js';
import type { GeoSpecConfig } from '#config/index.js';
import type { GeoSpecDiscoveryFileSystem } from '#runner/discovery.js';
import { discoverGeoSpecFiles } from '#runner/discovery.js';
// oxlint-disable-next-line no-restricted-imports -- Read the literal JSON fixture without a TypeScript source alias.
import expected from './__fixtures__/expected.json' with { type: 'json' };
// oxlint-disable-next-line no-restricted-imports -- Read the same project-relative JSON data as native config fixtures.
import manifest from './__fixtures__/tau.json' with { type: 'json' };

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

  it('should import Tau data and replace whole fields without mutating either input', async () => {
    const projectPath = await createConfigFixture(['mjs']);
    const configPath = await realpath(join(projectPath, 'geospec.config.mjs'));
    const imported = (await import(pathToFileURL(configPath).href)) as { default: unknown };
    const before = structuredClone(imported.default);
    const overrides: GeoSpecConfig = {
      include: [],
      exclude: [],
      testNamePattern: undefined,
      testTimeout: 600,
      matcherWallBackstop: undefined,
      bail: false,
      forensic: false,
      cache: false,
      cacheDirectory: '.tau/overridden',
      subjects: { alternate: { kind: 'tau-project', manifestPath: 'tau.json', manifest, format: 'glb' } },
    };
    const beforeOverrides = structuredClone(overrides);
    expect(await loadGeoSpecConfig({ projectPath })).toStrictEqual({ configPath, options: expected.configured });
    expect(await loadGeoSpecConfig({ projectPath, overrides })).toStrictEqual({
      configPath,
      options: expected.resolved,
    });
    expect(imported.default).toStrictEqual(before);
    expect(overrides).toStrictEqual(beforeOverrides);
    const emptySubjects = await loadGeoSpecConfig({ projectPath, overrides: { subjects: {} } });
    expect(emptySubjects.options.subjects).toStrictEqual({});
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
    { value: { testTimeout: 0 }, message: 'GeoSpec testTimeout must be positive finite milliseconds.' },
    { value: { bail: 'yes' }, message: 'GeoSpec bail must be a boolean.' },
    { value: { include: 'cases' }, message: 'GeoSpec include must be an array of strings.' },
  ])('should reject an ordinary invalid setting: $message', ({ value, message }) => {
    expect(() => resolveGeoSpecConfig(value)).toThrow(TypeError);
    expect(() => resolveGeoSpecConfig(value)).toThrow(message);
  });

  it('should validate descriptor data without claiming Tau manifest schema admission', () => {
    const data = {
      subjects: {
        part: { kind: 'tau-project', manifestPath: 'tau.json', manifest: { unvalidated: true }, format: 'step' },
      },
    };
    expect(resolveGeoSpecConfig(data)).toStrictEqual(data);
    const wrongManifest = { subjects: { part: { ...data.subjects.part, manifest: [] } } };
    expect(() => resolveGeoSpecConfig(wrongManifest)).toThrow(TypeError);
    expect(() => resolveGeoSpecConfig(wrongManifest)).toThrow('GeoSpec manifest must be a plain object.');
    const wrongFormat = { subjects: { part: { ...data.subjects.part, format: 'stl' } } };
    expect(() => resolveGeoSpecConfig(wrongFormat)).toThrow(TypeError);
    expect(() => resolveGeoSpecConfig(wrongFormat)).toThrow("GeoSpec Tau descriptor format must be 'step' or 'glb'.");
  });
});
