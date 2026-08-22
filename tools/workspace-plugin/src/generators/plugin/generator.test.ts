import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing.js';
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
      peerDependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      taucad?: { hostTarget?: string };
    }>(tree, 'packages/plugins/image/package.json');
    expect(manifest.name).toBe('@taucad/image');
    expect(manifest.sideEffects).toBe(false);
    expect(manifest.repository?.directory).toBe('packages/plugins/image');
    expect(manifest.peerDependencies).toEqual({ '@taucad/runtime': '^0.1.0' });
    expect(manifest.devDependencies).toEqual({ '@taucad/runtime': 'workspace:*' });
    expect(manifest.taucad?.hostTarget).toBe('browser');
    expect(readText(tree, 'packages/plugins/image/LICENSE')).toContain('Apache License');

    const index = readText(tree, 'packages/plugins/image/src/index.ts');
    const plugin = readText(tree, 'packages/plugins/image/src/plugin.ts');
    expect(index).toContain('export { plugin }');
    expect(index).not.toContain('plugin as image');
    expect(index).toContain('imageTranscoder');
    expect(plugin).toContain('export const plugin = definePlugin({');
    expect(plugin).toContain("default: ['transcoders.default']");
    expect(index).not.toContain('export default');
    expect(plugin).not.toContain('export default');
    expect(tree.exists('packages/plugins/image/src/image-transcoder.ts')).toBe(true);
    expect(tree.exists('packages/plugins/image/src/image-kernel.ts')).toBe(false);

    const readme = readText(tree, 'packages/plugins/image/README.md');
    expect(readme).toContain('import { plugin, imageTranscoder }');
    expect(readme).not.toContain('plugin as image');
    expect(readme).not.toContain('image()');

    const tests = readText(tree, 'packages/plugins/image/src/plugin.test.ts');
    expect(tests).toContain('builtinModules');
    expect(tests).toContain("'-native'");
    expect(tests).toContain("'-python'");
    expect(tests).toContain("await import('#index.js')");
  });

  it('normalizes multi-capability input into deterministic bucket order', async () => {
    const tree = createTreeWithEmptyWorkspace();

    await pluginGenerator(tree, {
      name: 'assimp',
      capabilities: 'transcoder,kernel',
      namespace: 'assimp-tools',
    });

    const source = readText(tree, 'packages/plugins/assimp/src/plugin.ts');
    expect(source.indexOf('kernels:')).toBeLessThan(source.indexOf('transcoders:'));
    expect(source).toContain("namespace: 'assimp-tools'");
    expect(source).toContain("default: ['kernels.default', 'transcoders.default']");
    expect(tree.exists('packages/plugins/assimp/src/assimp-kernel.ts')).toBe(true);
    expect(tree.exists('packages/plugins/assimp/src/assimp-transcoder.ts')).toBe(true);

    const typeTest = readText(tree, 'packages/plugins/assimp/src/plugin.test-d.ts');
    expect(typeTest).toContain('ExpandPluginKernels');
    expect(typeTest).toContain('ExpandPluginTranscoders');
  });

  it.each([
    { name: 'middleware', capability: 'middleware', expectedFactory: 'middlewareMiddleware' },
    { name: 'opencascade-native', capability: 'kernel', expectedFactory: 'opencascadeNativeKernel' },
  ])('creates the $name toolkit without role-suffix package naming', async ({ name, capability, expectedFactory }) => {
    const tree = createTreeWithEmptyWorkspace();

    await pluginGenerator(tree, { name, capabilities: capability, hostTarget: 'native' });

    const root = `packages/plugins/${name}`;
    const manifest = readJson<{ name?: string }>(tree, `${root}/package.json`);
    expect(manifest.name).toBe(`@taucad/${name}`);
    expect(readText(tree, `${root}/src/index.ts`)).toContain(expectedFactory);
    expect(readText(tree, `${root}/src/plugin.test.ts`)).not.toContain('builtinModules');
  });

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
