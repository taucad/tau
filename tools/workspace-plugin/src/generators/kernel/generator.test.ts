import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing.js';
import { describe, expect, it } from 'vitest';

import { kernelGenerator } from '#generators/kernel/generator.js';

const readText = (tree: ReturnType<typeof createTreeWithEmptyWorkspace>, path: string): string => {
  const content = tree.read(path, 'utf8');
  if (!content) {
    throw new Error(`Expected ${path} to exist`);
  }

  return content;
};

const readJson = <T>(tree: ReturnType<typeof createTreeWithEmptyWorkspace>, path: string): T =>
  JSON.parse(readText(tree, path)) as T;

describe('kernel generator', () => {
  it('scaffolds a kernel package under kernels/ with the ./kernel subpath export', async () => {
    const tree = createTreeWithEmptyWorkspace();

    await kernelGenerator(tree, {
      name: 'example',
      description: 'Example kernel',
    });

    const packageJson = readJson<{
      name?: string;
      license?: string;
      exports?: Record<string, unknown>;
      publishConfig?: { exports?: Record<string, { types?: string; import?: string; default?: string }> };
      dependencies?: Record<string, string>;
    }>(tree, 'kernels/example/package.json');

    expect(packageJson.name).toBe('@taucad/example');
    expect(packageJson.license).toBe('MIT');
    expect(packageJson.exports?.['./kernel']).toBe('./src/example.kernel.ts');
    expect(packageJson.publishConfig?.exports?.['./kernel']).toEqual({
      types: './dist/example.kernel.d.mts',
      import: './dist/example.kernel.mjs',
      default: './dist/example.kernel.mjs',
    });
    expect(packageJson.dependencies?.['@taucad/runtime']).toBe('workspace:*');
    expect(packageJson.dependencies?.['zod']).toBe('catalog:');
  });

  it('scaffolds a defineKernel stub, a matching test, and the barrel', async () => {
    const tree = createTreeWithEmptyWorkspace();

    await kernelGenerator(tree, { name: 'my-engine' });

    const kernelSource = readText(tree, 'kernels/my-engine/src/my-engine.kernel.ts');
    expect(kernelSource).toContain("from '@taucad/runtime/kernel'");
    expect(kernelSource).toContain('export const myEngine');
    // Explicit factory annotation keeps the emitted .d.ts portable (no TS2742).
    expect(kernelSource).toContain('KernelPluginFactory<');
    expect(kernelSource).toContain('defineKernel({');
    expect(kernelSource).toContain("id: 'my-engine'");
    expect(kernelSource).toContain('async createGeometry()');

    const barrel = readText(tree, 'kernels/my-engine/src/index.ts');
    expect(barrel).toContain('myEngine');
    expect(barrel).toContain("from '#my-engine.kernel.js'");

    const test = readText(tree, 'kernels/my-engine/src/my-engine.kernel.test.ts');
    expect(test).toContain("from '@taucad/runtime/testing'");
    expect(test).toContain("expect(plugin.id).toBe('my-engine')");

    const tsdown = readText(tree, 'kernels/my-engine/tsdown.config.ts');
    expect(tsdown).toContain("entry: ['src/index.ts', 'src/my-engine.kernel.ts']");
  });

  it('reuses the shared package config templates (tsconfig, vitest, project.json)', async () => {
    const tree = createTreeWithEmptyWorkspace();

    await kernelGenerator(tree, { name: 'example' });

    expect(tree.exists('kernels/example/tsconfig.json')).toBe(true);
    expect(tree.exists('kernels/example/tsconfig.lib.json')).toBe(true);
    expect(tree.exists('kernels/example/tsconfig.spec.json')).toBe(true);
    expect(tree.exists('kernels/example/tsconfig.build.json')).toBe(true);

    const project = readJson<{ sourceRoot?: string }>(tree, 'kernels/example/project.json');
    expect(project.sourceRoot).toBe('kernels/example');

    const vitest = readText(tree, 'kernels/example/vitest.config.ts');
    expect(vitest).toContain('coverage/kernels/example');
  });
});
