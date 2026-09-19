import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing.js';
import type { FileChange } from '@nx/devkit';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { pluginGenerator } from '#generators/plugin/generator.js';

const repositoryRoot = resolve(import.meta.dirname, '../../../../..');
const nxTreeModule = join(repositoryRoot, 'node_modules/nx/dist/src/generators/tree.js');

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

const copy = (source: string, target: string): void => {
  mkdirSync(dirname(target), { recursive: true });
  cpSync(resolve(repositoryRoot, source), target);
};

const compileGeneratedPlugins = async (): Promise<void> => {
  const root = mkdtempSync(join(tmpdir(), 'tau-plugin-generator-'));
  try {
    const fixtureChanges = await Promise.all(
      [
        { name: 'compiled-job', capabilities: 'job' },
        { name: 'compiled-machine', capabilities: 'machine' },
        { name: 'compiled-mixed', capabilities: 'kernel,job,machine' },
      ].map(async (fixture) => {
        const tree = createTreeWithEmptyWorkspace();
        await pluginGenerator(tree, { ...fixture, hostTarget: 'daemon' });
        return tree.listChanges();
      }),
    );
    const changes = fixtureChanges.flat();
    copy('tsconfig.base.json', join(root, 'tsconfig.base.json'));
    symlinkSync(join(repositoryRoot, 'node_modules'), join(root, 'node_modules'));
    const treeModule = (await import(nxTreeModule)) as {
      flushChanges: (root_: string, changes: FileChange[]) => void;
    };
    treeModule.flushChanges(root, changes);

    for (const name of ['compiled-job', 'compiled-machine', 'compiled-mixed']) {
      execFileSync(
        join(repositoryRoot, 'node_modules/.bin/tsgo'),
        [
          '--noEmit',
          '--composite',
          'false',
          '--incremental',
          'false',
          '--skipLibCheck',
          'true',
          '-p',
          join(root, 'packages/plugins', name, 'tsconfig.spec.json'),
        ],
        { cwd: root, encoding: 'utf8', stdio: 'pipe' },
      );
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
};

describe('plugin generator', () => {
  it('creates a browser-safe named image plugin with a required runtime peer', async () => {
    const tree = createTreeWithEmptyWorkspace();

    await pluginGenerator(tree, { name: 'image-fixture', capabilities: 'transcoder' });

    const manifest = readJson<{
      name?: string;
      sideEffects?: boolean;
      repository?: { directory?: string };
      imports?: Record<string, string>;
      peerDependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      taucad?: { hostTarget?: string };
    }>(tree, 'packages/plugins/image-fixture/package.json');
    expect(manifest.name).toBe('@taucad/image-fixture');
    // Exactly two keys: every package-specific alias is drift the pkgcheck
    // `tau-internal-imports-shape` rule rejects.
    expect(manifest.imports).toEqual({ '#*.js': './src/*.ts', '#*': './src/*' });
    expect(manifest.sideEffects).toBe(false);
    expect(manifest.repository?.directory).toBe('packages/plugins/image-fixture');
    // Exhaustive on purpose: the templates emit no zod, because nothing they
    // generate imports it, and `tau-peer-dependency-shape` rejects a peer no
    // emitted file witnesses. A capability that adds an `optionsSchema` adds the
    // peer with it.
    expect(manifest.peerDependencies).toEqual({ '@taucad/runtime': '^0.1.0-beta.0' });
    expect(manifest.devDependencies).toEqual({ '@taucad/runtime': 'workspace:*' });
    expect(manifest.taucad?.hostTarget).toBe('browser');
    expect(readText(tree, 'packages/plugins/image-fixture/LICENSE')).toContain('Apache License');

    const index = readText(tree, 'packages/plugins/image-fixture/src/index.ts');
    const plugin = readText(tree, 'packages/plugins/image-fixture/src/image-fixture.plugin.ts');
    expect(index).toContain('export { imageFixture, imageFixture as plugin }');
    expect(index).toContain("from '#image-fixture.plugin.js'");
    expect(index).toContain('imageFixtureTranscoder');
    expect(plugin).toContain('export const imageFixture = definePlugin({');
    expect(plugin).toContain("default: ['transcoders.default']");
    expect(plugin).not.toContain('packageJson');
    expect(plugin).not.toContain('namespace:');
    expect(plugin).not.toContain('version:');
    expect(index).not.toContain('export default');
    expect(plugin).not.toContain('export default');
    expect(tree.exists('packages/plugins/image-fixture/src/image-fixture.transcoder.ts')).toBe(true);
    expect(tree.exists('packages/plugins/image-fixture/src/image-fixture.kernel.ts')).toBe(false);
    expect(readText(tree, 'packages/plugins/image-fixture/src/image-fixture.transcoder.ts')).toContain(
      "version: '1.0.0'",
    );

    // Rule 8 of npm-policy: the README is the npm landing page, so the template emits
    // every required section and a quick start that imports the alias, not `plugin`.
    const readme = readText(tree, 'packages/plugins/image-fixture/README.md');
    for (const heading of ['## Install', '## Quick start', '## API', '## License']) {
      expect(readme, heading).toContain(heading);
    }
    expect(readme).toContain("import { imageFixture } from '@taucad/image-fixture';");
    expect(readme).toContain("import { defineRuntime } from '@taucad/runtime/worker';");
    expect(readme).toContain('defineRuntime({ plugins: [imageFixture()] })');
    expect(readme).not.toContain('import { plugin }');
    expect(readme).toContain('| `imageFixtureTranscoder` | transcoder factory |');
    expect(readme).toContain('Apache-2.0 — see [LICENSE](./LICENSE)');

    const tests = readText(tree, 'packages/plugins/image-fixture/src/image-fixture.plugin.test.ts');
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

    const instructions = readText(tree, 'packages/plugins/image-fixture/AGENTS.md');
    expect(instructions).toContain('# @taucad/image-fixture');
    expect(instructions).toContain('Capabilities: `transcoder`');
    expect(instructions).toContain('Host target: `browser`');
    expect(instructions).toContain('`src/image-fixture.plugin.ts`');
    expect(instructions).toContain('`src/image-fixture.transcoder.ts`');
    expect(instructions).not.toContain('src/image-fixture.kernel.ts');
    expect(instructions).toContain('[root AGENTS](../../../AGENTS.md)');
    expect(instructions).toContain('[packages AGENTS](../../AGENTS.md)');
    expect(instructions).toContain('[packages/plugins AGENTS](../AGENTS.md)');
    expect(instructions).toContain('../../../.agents/skills/create-plugin/SKILL.md');
    expect(instructions).not.toContain('.agents/skills/create-kernel/SKILL.md');
    expect(instructions).toContain('../../../docs/policy/runtime-architecture-policy.md');
    expect(instructions).not.toMatch(/<%|__tmpl__/);
    expect(readText(tree, 'packages/plugins/image-fixture/CLAUDE.md')).toBe('@AGENTS.md\n');
  });

  it('keeps the emitted scaffold file set aligned with the image reference package', async () => {
    const tree = createTreeWithEmptyWorkspace();
    await pluginGenerator(tree, { name: 'image-fixture', capabilities: 'transcoder' });

    const prefix = 'packages/plugins/image-fixture/';
    const emitted = tree
      .listChanges()
      .map(({ path }) => path.replace(/^\//, ''))
      .filter((path) => path.startsWith(prefix))
      .map((path) => path.slice(prefix.length))
      .filter((path) => path !== 'AGENTS.md' && path !== 'CLAUDE.md')
      .map((path) => path.replaceAll('image-fixture', 'image'))
      .sort();
    const referenceRoot = resolve(repositoryRoot, 'packages/plugins/image');
    const packageSpecific = new Set([
      '.DS_Store',
      '.gitignore',
      'copy-files-from-to.cjson',
      'src/asset-ownership.test.ts',
      'src/camera-public-surface.test.ts',
      'src/fonts/Geist-Regular.ttf',
      'src/gltf-scene-bounds.test.ts',
      'src/gltf-scene-bounds.ts',
      'src/image-backend.ts',
      'src/image-export-options.test.ts',
      'src/image-export-options.ts',
      'src/image-import-failure.test.ts',
      'src/image-label.test.ts',
      'src/image-label.ts',
      'src/image.transcoder.test-d.ts',
      'src/image.transcoder.test.ts',
      'src/image.vite-build.test.ts',
      'src/label.ts',
      'src/nanoraster-camera.test.ts',
      'src/nanoraster-camera.ts',
      'src/svg-backend-failure.test.ts',
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
      name: 'assimp-fixture',
      capabilities: 'transcoder,kernel',
    });

    const source = readText(tree, 'packages/plugins/assimp-fixture/src/assimp-fixture.plugin.ts');
    expect(source.indexOf('kernels:')).toBeLessThan(source.indexOf('transcoders:'));
    expect(source).not.toContain('namespace:');
    expect(source).toContain("default: ['kernels.default', 'transcoders.default']");
    expect(tree.exists('packages/plugins/assimp-fixture/src/assimp-fixture.kernel.ts')).toBe(true);
    expect(tree.exists('packages/plugins/assimp-fixture/src/assimp-fixture.transcoder.ts')).toBe(true);

    expect(readText(tree, 'packages/plugins/assimp-fixture/src/assimp-fixture.kernel.ts')).toContain(
      "id: 'assimp-fixture'",
    );
    expect(readText(tree, 'packages/plugins/assimp-fixture/src/assimp-fixture.kernel.ts')).toContain(
      "version: '1.0.0'",
    );
    expect(readText(tree, 'packages/plugins/assimp-fixture/src/assimp-fixture.transcoder.ts')).toContain(
      "id: 'assimp-fixture'",
    );

    const typeTest = readText(tree, 'packages/plugins/assimp-fixture/src/assimp-fixture.plugin.test-d.ts');
    expect(typeTest).toContain('ExpandPluginKernels');
    expect(typeTest).toContain('ExpandPluginTranscoders');

    const instructions = readText(tree, 'packages/plugins/assimp-fixture/AGENTS.md');
    expect(instructions).toContain('Capabilities: `kernel, transcoder`');
    expect(instructions).toContain('`src/assimp-fixture.kernel.ts`');
    expect(instructions).toContain('`src/assimp-fixture.transcoder.ts`');
    expect(instructions).toContain('../../../.agents/skills/create-kernel/SKILL.md');
    expect(instructions).not.toContain('src/assimp-fixture.middleware.ts');
    expect(instructions).not.toContain('src/assimp-fixture.bundler.ts');
  });

  it('generates one six-role toolkit with correlated job and machine factories', async () => {
    const tree = createTreeWithEmptyWorkspace();

    await pluginGenerator(tree, {
      name: 'manufacturing-fixture',
      capabilities: 'machine,job,kernel',
      hostTarget: 'daemon',
    });

    const root = 'packages/plugins/manufacturing-fixture';
    const source = readText(tree, `${root}/src/manufacturing-fixture.plugin.ts`);
    expect(source.indexOf('kernels:')).toBeLessThan(source.indexOf('jobs:'));
    expect(source.indexOf('jobs:')).toBeLessThan(source.indexOf('machines:'));
    expect(source).toContain("default: ['kernels.default', 'jobs.default', 'machines.default']");
    expect(source).toContain('default: manufacturingFixtureJob');
    expect(source).toContain('default: manufacturingFixtureMachine');

    const job = readText(tree, `${root}/src/manufacturing-fixture.job.ts`);
    expect(job).toContain("from '@taucad/runtime/configuration'");
    expect(job).toContain("from '@taucad/runtime/job'");
    expect(job).toContain("from 'zod'");
    expect(job).toContain('input.configuration.enabled');
    expect(job).toContain('TODO: implement manufacturing-fixture job execution');

    const machine = readText(tree, `${root}/src/manufacturing-fixture.machine.ts`);
    expect(machine).toContain("from '@taucad/runtime/configuration'");
    expect(machine).toContain("from '@taucad/runtime/machine'");
    expect(machine).toContain("from 'zod'");
    expect(machine).toContain('input.configuration.logicalId');
    expect(machine).toContain('TODO: implement manufacturing-fixture machine connection');

    const readme = readText(tree, `${root}/README.md`);
    expect(readme).toContain("import { defineRuntime } from '@taucad/runtime/host';");
    expect(readme).toContain('separate `cad`, `jobs`, and `machines` capabilities');
    expect(readme).not.toContain('Hand the definition to a client');

    const typeTest = readText(tree, `${root}/src/manufacturing-fixture.plugin.test-d.ts`);
    expect(typeTest).toContain('ExpandPluginKernels');
    expect(typeTest).toContain('ExpandPluginJobs');
    expect(typeTest).toContain('ExpandPluginMachines');
    expect(typeTest).toContain('ReturnType<typeof manufacturingFixtureJob>');
    expect(typeTest).toContain('ReturnType<typeof manufacturingFixtureMachine>');

    const runtimeTest = readText(tree, `${root}/src/manufacturing-fixture.plugin.test.ts`);
    for (const bucket of ['kernels', 'middleware', 'bundlers', 'transcoders', 'jobs', 'machines']) {
      expect(runtimeTest).toContain(`capabilities.${bucket}.map`);
    }

    const manifest = readJson<{
      peerDependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    }>(tree, `${root}/package.json`);
    expect(manifest.peerDependencies).toEqual({ '@taucad/runtime': '^0.1.0-beta.0', zod: '^4.0.0' });
    expect(manifest.devDependencies).toEqual({ '@taucad/runtime': 'workspace:*', zod: 'catalog:' });
  });

  it.each([
    { role: 'job', factory: 'jobFixtureJob', projection: 'ExpandPluginJobs', schemaField: 'enabled' },
    { role: 'machine', factory: 'machineFixtureMachine', projection: 'ExpandPluginMachines', schemaField: 'logicalId' },
  ] as const)(
    'generates a callable schema-bearing $role-only toolkit',
    async ({ role, factory, projection, schemaField }) => {
      const tree = createTreeWithEmptyWorkspace();
      const name = `${role}-fixture`;

      await pluginGenerator(tree, { name, capabilities: role, hostTarget: 'daemon' });

      const root = `packages/plugins/${name}`;
      const roleSource = readText(tree, `${root}/src/${name}.${role}.ts`);
      const plugin = readText(tree, `${root}/src/${name}.plugin.ts`);
      const typeTest = readText(tree, `${root}/src/${name}.plugin.test-d.ts`);
      expect(roleSource).toContain(`export const ${factory} = define`);
      expect(roleSource).toContain(schemaField);
      expect(plugin).toContain(`default: ${factory}`);
      expect(plugin).toContain(`'${role}s.default'`);
      expect(typeTest).toContain(projection);
      expect(typeTest).toContain(`ReturnType<typeof ${factory}>`);
      expect(typeTest).toContain(role === 'job' ? 'invalidJobConfiguration' : 'invalidMachineBinding');
      const readme = readText(tree, `${root}/README.md`);
      expect(readme).toContain("import { defineRuntime } from '@taucad/runtime/host';");
      expect(readme).not.toContain('createRuntimeWorker');
      expect(tree.exists(`${root}/src/${name}.${role === 'job' ? 'machine' : 'job'}.ts`)).toBe(false);
    },
  );

  it.each([
    {
      name: 'middleware-fixture',
      capability: 'middleware',
      expectedFactory: 'middlewareFixtureMiddleware',
      expectedAlias: 'middlewareFixture',
    },
    {
      name: 'opencascade-native-fixture',
      capability: 'kernel',
      expectedFactory: 'opencascadeNativeFixtureKernel',
      expectedAlias: 'opencascadeNativeFixture',
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
      const instructions = readText(tree, `${root}/AGENTS.md`);
      expect(instructions).toContain(`Capabilities: \`${capability}\``);
      expect(instructions).toContain('Host target: `native`');
      expect(instructions).toContain(`src/${name}.${capability}.ts`);
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

  it('typechecks emitted job-only, machine-only, and mixed packages with negative schema witnesses', async () => {
    await compileGeneratedPlugins();
  }, 30_000);

  it('fails a full creation collision before changing existing bytes', async () => {
    const tree = createTreeWithEmptyWorkspace();
    await pluginGenerator(tree, { name: 'collision-plugin', capabilities: 'transcoder' });
    tree.write('packages/plugins/collision-plugin/AGENTS.md', '# Authored plugin notes\n');
    const before = snapshotChanges(tree);

    await expect(pluginGenerator(tree, { name: 'collision-plugin', capabilities: 'kernel' })).rejects.toThrow(
      'already exists',
    );
    expect(snapshotChanges(tree)).toEqual(before);
  });
});
