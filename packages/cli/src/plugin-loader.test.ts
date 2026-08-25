import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadTauPlugin, loadTauPluginConfig } from '#plugin-loader.js';

const runtimePluginEntryUrl = new URL('../../runtime/src/plugins/plugin-entry.ts', import.meta.url).href;

const pluginSource = (name: string): string => `
  import { definePlugin } from ${JSON.stringify(runtimePluginEntryUrl)};
  export const plugin = definePlugin({
    meta: { name: ${JSON.stringify(name)} },
    presets: { default: [] },
  });
`;

describe('Tau plugin loading', () => {
  let projectRoot: string | undefined;

  afterEach(async () => {
    vi.restoreAllMocks();
    if (projectRoot) {
      await rm(projectRoot, { recursive: true, force: true });
      projectRoot = undefined;
    }
  });

  const createProject = async (): Promise<string> => {
    projectRoot = await mkdtemp(join(tmpdir(), 'taucad-cli-plugin-'));
    return projectRoot;
  };

  const installFixture = async (
    name: string,
    source: string,
    manifest: Record<string, unknown> = {},
  ): Promise<string> => {
    const root = projectRoot ?? (await createProject());
    const packageRoot = join(root, 'node_modules', name);
    await mkdir(packageRoot, { recursive: true });
    await writeFile(
      join(packageRoot, 'package.json'),
      JSON.stringify({
        name,
        type: 'module',
        exports: { '.': './index.mjs', './package.json': './package.json' },
        ...manifest,
      }),
      'utf8',
    );
    await writeFile(join(packageRoot, 'index.mjs'), source, 'utf8');
    return root;
  };

  const writeProjectModule = async (name: string, source: string): Promise<string> => {
    const root = projectRoot ?? (await createProject());
    await writeFile(join(root, name), source, 'utf8');
    return root;
  };

  it('resolves a real definePlugin factory installed only in the invoking project', async () => {
    const root = await installFixture('fixture-plugin', pluginSource('fixture-plugin'));
    const plugin = await loadTauPlugin('fixture-plugin', root);

    expect(plugin().meta.name).toBe('fixture-plugin');
  });

  it('names the searched project root when resolution fails', async () => {
    const root = await createProject();

    await expect(loadTauPlugin('missing-plugin', root)).rejects.toThrow(
      `Could not resolve Tau plugin "missing-plugin" from project root "${root}"`,
    );
  });

  it('names the resolved path when the named plugin export is missing', async () => {
    const root = await installFixture('invalid-plugin', 'export const other = true;');

    await expect(loadTauPlugin('invalid-plugin', root)).rejects.toThrow(
      /invalid-plugin.*resolved to.*index\.mjs.*named "plugin"/u,
    );
  });

  it('rejects an unbranded callable-with-meta impostor', async () => {
    const root = await installFixture(
      'invalid-factory',
      `export const plugin = Object.assign(() => undefined, { meta: { name: 'invalid-factory' } });`,
    );

    await expect(loadTauPlugin('invalid-factory', root)).rejects.toThrow(
      /named "plugin" must be a callable Tau plugin factory created by definePlugin/u,
    );
  });

  it('distinguishes an incompatible plugin ABI', async () => {
    const root = await installFixture(
      'old-factory',
      `
        const plugin = Object.assign(() => undefined, { meta: { name: 'old-factory' } });
        Object.defineProperty(plugin, Symbol.for('@taucad/runtime/plugin-factory'), { value: 2 });
        export { plugin };
      `,
    );

    await expect(loadTauPlugin('old-factory', root)).rejects.toThrow(
      'uses runtime plugin ABI 2, but this CLI requires 1. Align @taucad/runtime versions.',
    );
  });

  it('wraps module-evaluation failures with the specifier and resolved path', async () => {
    const root = await installFixture('throwing-plugin', `throw new Error('fixture evaluation failed');`);

    await expect(loadTauPlugin('throwing-plugin', root)).rejects.toThrow(
      /Tau plugin "throwing-plugin" resolved to ".*index\.mjs" but failed during module evaluation: fixture evaluation failed/u,
    );
  });

  it('loads a config module containing real invoked plugin instances', async () => {
    const root = await writeProjectModule(
      'taucad.config.mjs',
      `
        import { definePlugin } from ${JSON.stringify(runtimePluginEntryUrl)};
        const plugin = definePlugin({ meta: { name: '@example/configured' }, presets: { default: [] } });
        export const plugins = [plugin()];
      `,
    );

    const plugins = await loadTauPluginConfig('./taucad.config.mjs', root);
    expect(plugins.map(({ meta }) => meta.name)).toEqual(['@example/configured']);
  });

  it('rejects a config without a named plugins array', async () => {
    const root = await writeProjectModule('taucad.config.mjs', 'export const plugin = true;');

    await expect(loadTauPluginConfig('./taucad.config.mjs', root)).rejects.toThrow(
      'must export a named "plugins" array',
    );
  });

  it('rejects an unbranded value in a config plugins array', async () => {
    const root = await writeProjectModule('taucad.config.mjs', 'export const plugins = [{}];');

    await expect(loadTauPluginConfig('./taucad.config.mjs', root)).rejects.toThrow(
      'entry 0 must be an invoked Tau plugin instance such as plugin().',
    );
  });

  it('rejects an incompatible config entry ABI distinctly', async () => {
    const root = await writeProjectModule(
      'taucad.config.mjs',
      `
        const plugin = { meta: { name: '@example/old' }, preset: 'default', capabilities: {} };
        Object.defineProperty(plugin, Symbol.for('@taucad/runtime/plugin-instance'), { value: 2 });
        export const plugins = [plugin];
      `,
    );

    await expect(loadTauPluginConfig('./taucad.config.mjs', root)).rejects.toThrow(
      'entry 0 uses runtime plugin ABI 2, but this CLI requires 1. Align @taucad/runtime versions.',
    );
  });

  it('accepts prerelease peer ranges using includePrerelease semantics', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const root = await installFixture('prerelease-plugin', pluginSource('prerelease-plugin'), {
      peerDependencies: { '@taucad/runtime': '^0.1.0-beta.0' },
    });

    await loadTauPlugin('prerelease-plugin', root);
    expect(warn).not.toHaveBeenCalled();
  });

  it('warns when the bundled runtime misses the plugin peer range', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const root = await installFixture('future-plugin', pluginSource('future-plugin'), {
      peerDependencies: { '@taucad/runtime': '^0.2.0-beta.0' },
    });

    await loadTauPlugin('future-plugin', root);
    expect(warn).toHaveBeenCalledWith(
      'Tau plugin "future-plugin" declares @taucad/runtime peer "^0.2.0-beta.0", but this CLI bundles 0.1.0-beta.1.',
    );
  });

  it('checks configured plugin instances against their installed package manifests', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const root = await installFixture('@example/configured', pluginSource('@example/configured'), {
      peerDependencies: { '@taucad/runtime': '^0.2.0-beta.0' },
    });
    await writeProjectModule(
      'taucad.config.mjs',
      `
        import { definePlugin } from ${JSON.stringify(runtimePluginEntryUrl)};
        const plugin = definePlugin({ meta: { name: '@example/configured' }, presets: { default: [] } });
        export const plugins = [plugin()];
      `,
    );

    await loadTauPluginConfig('./taucad.config.mjs', root);
    expect(warn).toHaveBeenCalledWith(
      'Tau plugin "@example/configured" declares @taucad/runtime peer "^0.2.0-beta.0", but this CLI bundles 0.1.0-beta.1.',
    );
  });

  it('silently skips a path-loaded plugin with no package manifest', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const root = await writeProjectModule('path-plugin.mjs', pluginSource('@example/path-plugin'));

    await loadTauPlugin('./path-plugin.mjs', root);
    expect(warn).not.toHaveBeenCalled();
  });
});
