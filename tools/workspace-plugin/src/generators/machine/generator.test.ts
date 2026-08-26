import { addProjectConfiguration } from '@nx/devkit';
import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing.js';
import { describe, expect, it } from 'vitest';

import { machineGenerator } from '#generators/machine/generator.js';
import { packageGenerator } from '#generators/package/generator.js';

const readText = (tree: ReturnType<typeof createTreeWithEmptyWorkspace>, path: string): string => {
  const content = tree.read(path, 'utf8');
  if (!content) {
    throw new Error(`Expected ${path} to exist`);
  }
  return content;
};

const readJson = <T>(tree: ReturnType<typeof createTreeWithEmptyWorkspace>, path: string): T =>
  JSON.parse(readText(tree, path)) as T;

const snapshotChanges = (tree: ReturnType<typeof createTreeWithEmptyWorkspace>): unknown =>
  tree.listChanges().map(({ path, type, content }) => ({ path, type, content: content?.toString('utf8') }));

describe('machine generator', () => {
  it('adds one public machine subpath to an explicit package owner', async () => {
    const tree = createTreeWithEmptyWorkspace();
    await packageGenerator(tree, { name: 'camera' });

    await machineGenerator(tree, { name: 'camera', project: 'camera', subpath: 'machine' });

    expect(tree.exists('packages/camera/src/camera.machine.ts')).toBe(true);
    expect(tree.exists('packages/camera/src/camera.machine.test.ts')).toBe(true);
    expect(tree.exists('packages/camera/src/camera.machine.test-d.ts')).toBe(true);

    const manifest = readJson<{
      exports: Record<string, unknown>;
      publishConfig: { exports: Record<string, unknown> };
      peerDependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    }>(tree, 'packages/camera/package.json');
    expect(manifest.exports).toMatchObject({
      '.': './src/index.ts',
      './machine': './src/camera.machine.ts',
    });
    expect(manifest.exports['.']).toBe('./src/index.ts');
    expect(manifest.publishConfig.exports['./machine']).toEqual({
      types: './dist/camera.machine.d.mts',
      import: './dist/camera.machine.mjs',
      default: './dist/camera.machine.mjs',
    });
    expect(manifest.peerDependencies['xstate']).toBe('^5.0.0');
    expect(manifest.devDependencies['xstate']).toBe('catalog:');
    expect(readText(tree, 'packages/camera/tsdown.config.ts')).toContain(
      "entry: ['src/index.ts', 'src/camera.machine.ts']",
    );

    const source = readText(tree, 'packages/camera/src/camera.machine.ts');
    const test = readText(tree, 'packages/camera/src/camera.machine.test.ts');
    expect(source).toContain('export const cameraMachine = setup({');
    expect(source).not.toContain('export default');
    expect(test).toContain("from '#camera.machine.js'");
    expect(test).toContain('Object.values(machineModule).filter((value) => isMachine(value))');
  });

  it('works for a different package owner and subpath', async () => {
    const tree = createTreeWithEmptyWorkspace();
    await packageGenerator(tree, { name: 'navigation' });

    await machineGenerator(tree, { name: 'orbit', project: 'navigation', subpath: 'orbit' });

    expect(readText(tree, 'packages/navigation/src/orbit.machine.test.ts')).toContain("from '#orbit.machine.js'");
  });

  it('adds an application-local machine without a public export', async () => {
    const tree = createTreeWithEmptyWorkspace();
    addProjectConfiguration(tree, 'viewer', {
      root: 'apps/viewer',
      sourceRoot: 'apps/viewer',
      projectType: 'application',
      tags: ['scope:ui', 'type:app', 'layer:feature'],
    });
    tree.write('apps/viewer/app/root.tsx', 'export {};\n');
    tree.write('apps/viewer/package.json', '{"name":"@taucad/viewer","private":true}\n');

    await machineGenerator(tree, { name: 'selection', project: 'viewer' });

    expect(tree.exists('apps/viewer/app/machines/selection.machine.ts')).toBe(true);
    expect(readText(tree, 'apps/viewer/app/machines/selection.machine.test.ts')).toContain(
      "from './selection.machine.js'",
    );
    const manifest = readJson<{ dependencies: Record<string, string>; exports?: unknown }>(
      tree,
      'apps/viewer/package.json',
    );
    expect(manifest.dependencies['xstate']).toBe('catalog:');
    expect(manifest.exports).toBeUndefined();
  });

  it.each([
    {
      label: 'an unknown project',
      schema: { name: 'camera', project: 'missing', subpath: 'machine' },
      message: 'Unknown Nx project',
    },
    {
      label: 'a missing public subpath',
      schema: { name: 'camera', project: 'camera' },
      message: 'require --subpath',
    },
    {
      label: 'a nested public subpath',
      schema: { name: 'camera', project: 'camera', subpath: 'camera/machine' },
      message: 'direct kebab-case segment',
    },
  ])('rejects $label before writing', async ({ schema, message }) => {
    const tree = createTreeWithEmptyWorkspace();
    await packageGenerator(tree, { name: 'camera' });
    const before = snapshotChanges(tree);

    await expect(machineGenerator(tree, schema)).rejects.toThrow(message);

    expect(snapshotChanges(tree)).toEqual(before);
  });

  it('rejects collisions and drift without partial output', async () => {
    const tree = createTreeWithEmptyWorkspace();
    await packageGenerator(tree, { name: 'camera' });
    await machineGenerator(tree, { name: 'camera', project: 'camera', subpath: 'machine' });
    const afterFirstRun = snapshotChanges(tree);

    await expect(machineGenerator(tree, { name: 'camera', project: 'camera', subpath: 'machine' })).rejects.toThrow(
      'already exists',
    );
    expect(snapshotChanges(tree)).toEqual(afterFirstRun);

    const driftedTree = createTreeWithEmptyWorkspace();
    await packageGenerator(driftedTree, { name: 'camera' });
    driftedTree.write(
      'packages/camera/tsdown.config.ts',
      readText(driftedTree, 'packages/camera/tsdown.config.ts').replace(
        "entry: ['src/index.ts'],",
        "entry: ['src/index.ts', 'src/other.ts'],",
      ),
    );
    const beforeDriftFailure = snapshotChanges(driftedTree);

    await expect(
      machineGenerator(driftedTree, { name: 'camera', project: 'camera', subpath: 'machine' }),
    ).rejects.toThrow('canonical single-entry tsdown shape');
    expect(snapshotChanges(driftedTree)).toEqual(beforeDriftFailure);
  });
});
