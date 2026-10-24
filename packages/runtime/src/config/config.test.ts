import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { defineConfig } from '#config/index.js';
import { loadTauConfig } from '#config/node.js';

const pluginModule = pathToFileURL(join(import.meta.dirname, '../plugins/plugin.ts')).href;

const project = async (files: Record<string, string>): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), 'tau-config-'));
  await Promise.all(
    Object.entries(files).map(async ([name, content]) => {
      await mkdir(join(root, name, '..'), { recursive: true });
      await writeFile(join(root, name), content, 'utf8');
    }),
  );
  return root;
};

const plugin = `import { definePlugin } from ${JSON.stringify(pluginModule)};
const example = definePlugin({ meta: { name: '@test/example' }, presets: { default: [] } });
`;

describe('defineConfig', () => {
  it('should return the config it is given', () => {
    const config = { plugins: [] };

    expect(defineConfig(config)).toBe(config);
  });
});

describe('loadTauConfig', () => {
  it('should return an empty config when the project has none', async () => {
    const projectPath = await project({ 'tau.json': '{}' });

    await expect(loadTauConfig({ projectPath })).resolves.toStrictEqual({ config: {} });
  });

  it('should load the one tau.config file it finds, keeping invoked plugin instances in order', async () => {
    const projectPath = await project({
      'tau.config.mjs': `${plugin}export default { plugins: [example()] };\n`,
    });

    const loaded = await loadTauConfig({ projectPath });

    expect(loaded.configPath).toMatch(/tau\.config\.mjs$/u);
    expect(loaded.config.plugins?.map(({ meta }) => meta.name)).toStrictEqual(['@test/example']);
  });

  it('should load an explicit configPath and accept a config with no plugins', async () => {
    const projectPath = await project({ 'configs/runtime.mjs': 'export default {};\n' });

    const loaded = await loadTauConfig({ projectPath, configPath: 'configs/runtime.mjs' });

    expect(loaded.config).toStrictEqual({});
  });

  it('should refuse several discoverable configs', async () => {
    const projectPath = await project({
      'tau.config.mjs': 'export default {};\n',
      'tau.config.js': 'export default {};\n',
    });

    await expect(loadTauConfig({ projectPath })).rejects.toThrow(/Multiple Tau configs/u);
  });

  it.each([
    ['an uninvoked factory', `${plugin}export default { plugins: [example] };\n`, /invoked plugin instance/u],
    ['a runner field', 'export default { plugins: [], geospec: {} };\n', /unknown field "geospec"/u],
    ['plugins that are not an array', 'export default { plugins: {} };\n', /must be an array/u],
    ['no default export', 'export const plugins = [];\n', /must default-export/u],
  ])('should refuse %s', async (_name, source, message) => {
    const projectPath = await project({ 'tau.config.mjs': source });

    await expect(loadTauConfig({ projectPath })).rejects.toThrow(message);
  });

  it('should refuse a configPath outside the project or of another kind', async () => {
    const projectPath = await project({ 'tau.config.json': '{}' });

    await expect(loadTauConfig({ projectPath, configPath: '../elsewhere.mjs' })).rejects.toThrow();
    await expect(loadTauConfig({ projectPath, configPath: 'tau.config.json' })).rejects.toThrow(/\.ts, \.mts/u);
  });

  it('should resolve @taucad/runtime/config to its own copy when the project cannot', async () => {
    const projectPath = await project({
      'tau.config.mjs': "import { defineConfig } from '@taucad/runtime/config';\nexport default defineConfig({});\n",
    });
    const loader = pathToFileURL(join(import.meta.dirname, 'node.ts')).href;
    const script = `const { loadTauConfig } = await import(${JSON.stringify(loader)});
const loaded = await loadTauConfig({ projectPath: ${JSON.stringify(projectPath)} });
process.stdout.write(JSON.stringify(loaded.config));`;

    const child = spawnSync(process.execPath, ['--input-type=module', '--eval', script], {
      cwd: projectPath,
      encoding: 'utf8',
    });

    expect(child.stderr).toBe('');
    expect(child.stdout).toBe('{}');
  });
});
