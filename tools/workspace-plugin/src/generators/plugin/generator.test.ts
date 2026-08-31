import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing.js';
import { readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { pluginGenerator } from '#generators/plugin/generator.js';

const readText = (tree: ReturnType<typeof createTreeWithEmptyWorkspace>, path: string): string => {
  const content = tree.read(path, 'utf8');
  if (!content) {
    throw new Error(`Expected ${path} to exist`);
  }
  return content;
};

const readJson = <T>(tree: ReturnType<typeof createTreeWithEmptyWorkspace>, path: string): T =>
  JSON.parse(readText(tree, path)) as T;

describe('plugin generator', () => {
  it('creates a browser-safe named image plugin with a required runtime peer', async () => {
    const tree = createTreeWithEmptyWorkspace();

    await pluginGenerator(tree, { name: 'image', capabilities: 'transcoder' });

    const manifest = readJson<{
      name?: string;
      sideEffects?: boolean;
      repository?: { directory?: string };
      imports?: Record<string, string>;
      peerDependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      taucad?: { hostTarget?: string };
    }>(tree, 'packages/plugins/image/package.json');
    expect(manifest.name).toBe('@taucad/image');
    // Exactly two keys: every package-specific alias is drift the pkgcheck
    // `tau-internal-imports-shape` rule rejects.
    expect(manifest.imports).toEqual({ '#*.js': './src/*.ts', '#*': './src/*' });
    expect(manifest.sideEffects).toBe(false);
    expect(manifest.repository?.directory).toBe('packages/plugins/image');
    // Exhaustive on purpose: the templates emit no zod, because nothing they
    // generate imports it, and `tau-peer-dependency-shape` rejects a peer no
    // emitted file witnesses. A capability that adds an `optionsSchema` adds the
    // peer with it.
    expect(manifest.peerDependencies).toEqual({ '@taucad/runtime': '^0.1.0-beta.0' });
    expect(manifest.devDependencies).toEqual({ '@taucad/runtime': 'workspace:*' });
    expect(manifest.taucad?.hostTarget).toBe('browser');
    expect(readText(tree, 'packages/plugins/image/LICENSE')).toContain('Apache License');

    const index = readText(tree, 'packages/plugins/image/src/index.ts');
    const plugin = readText(tree, 'packages/plugins/image/src/image.plugin.ts');
    expect(index).toContain('export { image, image as plugin }');
    expect(index).toContain("from '#image.plugin.js'");
    expect(index).toContain('imageTranscoder');
    expect(plugin).toContain('export const image = definePlugin({');
    expect(plugin).toContain("default: ['transcoders.default']");
    expect(plugin).not.toContain('packageJson');
    expect(plugin).not.toContain('namespace:');
    expect(plugin).not.toContain('version:');
    expect(index).not.toContain('export default');
    expect(plugin).not.toContain('export default');
    expect(tree.exists('packages/plugins/image/src/image.transcoder.ts')).toBe(true);
    expect(tree.exists('packages/plugins/image/src/image.kernel.ts')).toBe(false);
    expect(readText(tree, 'packages/plugins/image/src/image.transcoder.ts')).toContain("version: '1.0.0'");

    // Rule 8 of npm-policy: the README is the npm landing page, so the template emits
    // every required section and a quick start that imports the alias, not `plugin`.
    const readme = readText(tree, 'packages/plugins/image/README.md');
    for (const heading of ['## Install', '## Quick start', '## API', '## License']) {
      expect(readme, heading).toContain(heading);
    }
    expect(readme).toContain("import { image } from '@taucad/image';");
    expect(readme).toContain('defineRuntime({ plugins: [image()] })');
    expect(readme).not.toContain('import { plugin }');
    expect(readme).toContain('| `imageTranscoder` | transcoder factory |');
    expect(readme).toContain('Apache-2.0 — see [LICENSE](./LICENSE)');

    const tests = readText(tree, 'packages/plugins/image/src/image.plugin.test.ts');
    expect(tests).toContain('builtinModules');
    expect(tests).toContain("'-native'");
    expect(tests).toContain("'-python'");
    expect(tests).toContain("await import('#index.js')");
    // The guard walks every nested source file and knows the node-only packages that
    // `builtinModules` alone cannot catch.
    expect(tests).toContain('recursive: true');
    expect(tests).toContain("'ws'");
    // `import type … from 'node:fs'` is erased at emit, so it is not payload.
    expect(tests).toContain(String.raw`.replaceAll(/^\s*(?:import|export)\s+type\s[^;]*;/gm, '')`);
    expect(tests).not.toContain('packageJson');
  });

  it('keeps the emitted scaffold file set aligned with the image reference package', async () => {
    const tree = createTreeWithEmptyWorkspace();
    await pluginGenerator(tree, { name: 'image', capabilities: 'transcoder' });

    const prefix = 'packages/plugins/image/';
    const emitted = tree
      .listChanges()
      .map(({ path }) => path.replace(/^\//, ''))
      .filter((path) => path.startsWith(prefix))
      .map((path) => path.slice(prefix.length))
      .sort();
    const referenceRoot = resolve(import.meta.dirname, '../../../../../packages/plugins/image');
    const packageSpecific = new Set([
      '.gitignore',
      'copy-files-from-to.cjson',
      'src/asset-ownership.test.ts',
      'src/fonts/Geist-Regular.ttf',
      'src/image-backend.ts',
      'src/image-export-options.test.ts',
      'src/image-export-options.ts',
      'src/image-import-failure.test.ts',
      'src/image-label.test.ts',
      'src/image-label.ts',
      'src/image.transcoder.test-d.ts',
      'src/image.transcoder.test.ts',
      'src/label.ts',
      'src/svg.transcoder.test.ts',
      'src/svg.transcoder.ts',
      'src/svg.ts',
      'src/svg.vite-build.test.ts',
    ]);
    const reference = readdirSync(referenceRoot, { encoding: 'utf8', recursive: true })
      .filter((path) => !path.startsWith('dist/') && !path.startsWith('node_modules/') && !path.startsWith('out-tsc/'))
      .filter((path) => statSync(join(referenceRoot, path)).isFile() && !packageSpecific.has(path))
      .sort();

    expect(emitted).toEqual(reference);
  });

  it('normalizes multi-capability input into deterministic bucket order', async () => {
    const tree = createTreeWithEmptyWorkspace();

    await pluginGenerator(tree, {
      name: 'assimp',
      capabilities: 'transcoder,kernel',
    });

    const source = readText(tree, 'packages/plugins/assimp/src/assimp.plugin.ts');
    expect(source.indexOf('kernels:')).toBeLessThan(source.indexOf('transcoders:'));
    expect(source).not.toContain('namespace:');
    expect(source).toContain("default: ['kernels.default', 'transcoders.default']");
    expect(tree.exists('packages/plugins/assimp/src/assimp.kernel.ts')).toBe(true);
    expect(tree.exists('packages/plugins/assimp/src/assimp.transcoder.ts')).toBe(true);

    expect(readText(tree, 'packages/plugins/assimp/src/assimp.kernel.ts')).toContain("id: 'assimp'");
    expect(readText(tree, 'packages/plugins/assimp/src/assimp.kernel.ts')).toContain("version: '1.0.0'");
    expect(readText(tree, 'packages/plugins/assimp/src/assimp.transcoder.ts')).toContain("id: 'assimp'");

    const typeTest = readText(tree, 'packages/plugins/assimp/src/assimp.plugin.test-d.ts');
    expect(typeTest).toContain('ExpandPluginKernels');
    expect(typeTest).toContain('ExpandPluginTranscoders');
  });

  it.each([
    {
      name: 'middleware',
      capability: 'middleware',
      expectedFactory: 'middlewareMiddleware',
      expectedAlias: 'middleware',
    },
    {
      name: 'opencascade-native',
      capability: 'kernel',
      expectedFactory: 'opencascadeNativeKernel',
      expectedAlias: 'opencascadeNative',
    },
  ])(
    'creates the $name toolkit without role-suffix package naming',
    async ({ name, capability, expectedFactory, expectedAlias }) => {
      const tree = createTreeWithEmptyWorkspace();

      await pluginGenerator(tree, { name, capabilities: capability, hostTarget: 'native' });

      const root = `packages/plugins/${name}`;
      const manifest = readJson<{ name?: string }>(tree, `${root}/package.json`);
      expect(manifest.name).toBe(`@taucad/${name}`);
      const index = readText(tree, `${root}/src/index.ts`);
      expect(index).toContain(expectedFactory);
      expect(index).toContain(`${expectedAlias} as plugin`);
      const tests = readText(tree, `${root}/src/${name}.plugin.test.ts`);
      expect(tests).not.toContain('builtinModules');
      expect(tests).not.toContain('packageJson');
    },
  );

  it('rejects missing, duplicate, and unknown capability selections', async () => {
    const tree = createTreeWithEmptyWorkspace();

    await expect(pluginGenerator(tree, { name: 'empty', capabilities: '' })).rejects.toThrow(
      'At least one plugin capability',
    );
    await expect(pluginGenerator(tree, { name: 'duplicate', capabilities: 'kernel,kernel' })).rejects.toThrow(
      'must be unique',
    );
    await expect(pluginGenerator(tree, { name: 'unknown', capabilities: 'renderer' })).rejects.toThrow(
      'Unknown plugin capabilities',
    );
  });
});
