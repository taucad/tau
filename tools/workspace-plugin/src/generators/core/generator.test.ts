import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing.js';
import { describe, expect, it } from 'vitest';

import { coreGenerator } from '#generators/core/generator.js';

const readText = (tree: ReturnType<typeof createTreeWithEmptyWorkspace>, path: string): string => {
  const content = tree.read(path, 'utf8');
  if (!content) {
    throw new Error(`Expected ${path} to exist`);
  }
  return content;
};

const readJson = <T>(tree: ReturnType<typeof createTreeWithEmptyWorkspace>, path: string): T =>
  JSON.parse(readText(tree, path)) as T;

describe('core generator', () => {
  it('creates a lightweight published core package without plugin exports', async () => {
    const tree = createTreeWithEmptyWorkspace();

    await coreGenerator(tree, { name: 'occt', packageName: '@taucad/occt-core' });

    const root = 'packages/core/occt';
    const manifest = readJson<{
      name?: string;
      sideEffects?: boolean;
      repository?: { directory?: string };
      peerDependencies?: Record<string, string>;
    }>(tree, `${root}/package.json`);
    const project = readJson<{ name?: string; sourceRoot?: string; tags?: string[] }>(tree, `${root}/project.json`);
    expect(manifest.name).toBe('@taucad/occt-core');
    expect(manifest.sideEffects).toBe(false);
    expect(manifest.repository?.directory).toBe(root);
    expect(manifest.peerDependencies).toEqual({ '@taucad/runtime': '^0.1.0' });
    expect(project).toMatchObject({
      name: 'occt-core',
      sourceRoot: root,
      tags: ['scope:shared', 'type:package-root'],
    });
    expect(readText(tree, `${root}/src/index.ts`).trim()).toBe('export {};');
    expect(readText(tree, `${root}/src/index.ts`)).not.toContain('plugin');
    expect(readText(tree, `${root}/src/index.test.ts`)).toContain('builtinModules');
    expect(readText(tree, `${root}/LICENSE`)).toContain('Apache License');
  });

  it('requires a scoped package name and published placement', async () => {
    const tree = createTreeWithEmptyWorkspace();

    await expect(coreGenerator(tree, { name: 'bad', packageName: 'bad-core' })).rejects.toThrow('@taucad/');
    await expect(
      coreGenerator(tree, { name: 'private', packageName: '@taucad/private-core', publishable: false }),
    ).rejects.toThrow('publishable by placement');
  });
});
