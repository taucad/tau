import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { addProjectConfiguration } from '@nx/devkit';
import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing.js';
import { unansweredEvents, unreachedStates } from '@taucad/xstate-testing/paths';
import { afterAll, describe, expect, it } from 'vitest';
import type { AnyMachineSnapshot, AnyStateMachine } from 'xstate';

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
    tree.write('packages/camera/AGENTS.md', '# Authored camera instructions\n');
    tree.write('packages/camera/CLAUDE.md', '@AGENTS.md\n');

    await machineGenerator(tree, { name: 'camera', project: 'camera', subpath: 'machine' });

    expect(readText(tree, 'packages/camera/AGENTS.md')).toBe('# Authored camera instructions\n');
    expect(readText(tree, 'packages/camera/CLAUDE.md')).toBe('@AGENTS.md\n');
    expect(tree.exists('packages/camera/src/machines/AGENTS.md')).toBe(false);

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
    expect(manifest.peerDependencies['xstate']).toBe('^6.0.0-alpha.59');
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
        "entry: 'src/index.ts',",
      ),
    );
    const beforeDriftFailure = snapshotChanges(driftedTree);

    await expect(
      machineGenerator(driftedTree, { name: 'camera', project: 'camera', subpath: 'machine' }),
    ).rejects.toThrow('canonical tsdown entry array');
    expect(snapshotChanges(driftedTree)).toEqual(beforeDriftFailure);
  });

  it('should append a second machine to a package that already has several tsdown entries', async () => {
    const tree = createTreeWithEmptyWorkspace();
    await packageGenerator(tree, { name: 'camera' });
    tree.write(
      'packages/camera/tsdown.config.ts',
      readText(tree, 'packages/camera/tsdown.config.ts').replace(
        "entry: ['src/index.ts'],",
        "entry: ['src/index.ts', 'src/node/index.ts'],",
      ),
    );

    await machineGenerator(tree, { name: 'orbit', project: 'camera', subpath: 'orbit-machine' });
    await machineGenerator(tree, { name: 'dolly', project: 'camera', subpath: 'dolly-machine' });

    const entries = [...readText(tree, 'packages/camera/tsdown.config.ts').matchAll(/'(src\/[^']+)'/gu)].map(
      (match) => match[1],
    );
    expect(entries).toEqual(['src/index.ts', 'src/node/index.ts', 'src/orbit.machine.ts', 'src/dolly.machine.ts']);
    const manifest = readJson<{ exports: Record<string, string> }>(tree, 'packages/camera/package.json');
    expect(manifest.exports['./orbit-machine']).toBe('./src/orbit.machine.ts');
    expect(manifest.exports['./dolly-machine']).toBe('./src/dolly.machine.ts');
  });

  describe('the generated machine contract', () => {
    // Generated sources import only `xstate`, which resolves from the root node_modules (tool-output location policy).
    const scratch = resolve(
      import.meta.dirname,
      '../../../../../node_modules/.cache/workspace-plugin/machine-generator',
    );
    afterAll(() => {
      rmSync(scratch, { recursive: true, force: true });
    });

    const generateAndLoad = async (): Promise<Record<string, unknown>> => {
      const tree = createTreeWithEmptyWorkspace();
      await packageGenerator(tree, { name: 'camera' });
      await machineGenerator(tree, { name: 'orbit', project: 'camera', subpath: 'orbit-machine' });
      mkdirSync(scratch, { recursive: true });
      const path = join(scratch, `orbit-${Date.now()}.machine.ts`);
      writeFileSync(path, readText(tree, 'packages/camera/src/orbit.machine.ts'));
      return (await import(path)) as Record<string, unknown>;
    };

    it('should generate a machine with no unanswered public event', async () => {
      const module = await generateAndLoad();
      const machine = module['orbitMachine'] as AnyStateMachine;
      const ignore = (module['orbitIgnoredEvents'] ?? []) as ReadonlyArray<readonly [string, string]>;
      const options = {
        input: {},
        events: [{ type: 'reset' }, { type: 'xstate.error.execution' }],
        limit: 100,
        serializeState: (snapshot: AnyMachineSnapshot) => JSON.stringify(snapshot.value),
      };

      expect(unansweredEvents(machine, { ...options, ignore })).toEqual([]);
      expect(unreachedStates(machine, options)).toEqual([]);
    });

    it('should generate a root onError, a version and a factory', async () => {
      const tree = createTreeWithEmptyWorkspace();
      await packageGenerator(tree, { name: 'camera' });
      await machineGenerator(tree, { name: 'orbit', project: 'camera', subpath: 'orbit-machine' });

      const source = readText(tree, 'packages/camera/src/orbit.machine.ts');
      const test = readText(tree, 'packages/camera/src/orbit.machine.test.ts');
      const manifest = readJson<{ devDependencies: Record<string, string> }>(tree, 'packages/camera/package.json');
      expect(source).toContain("version: '1',");
      expect(source).toMatch(/^ {2}onError: /mu);
      expect(source).toContain('export const createOrbitActor = (');
      expect(source).toContain('export const orbitIgnoredEvents');
      expect(test).toContain("from '@taucad/xstate-testing/inspect'");
      expect(test).toContain('unansweredEvents(orbitMachine');
      expect(manifest.devDependencies['@taucad/xstate-testing']).toBe('workspace:*');
    });
  });
});
