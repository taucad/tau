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
      imports?: Record<string, string>;
      peerDependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      taucad?: { hostTarget?: string };
    }>(tree, `${root}/package.json`);
    // Exactly two keys: every package-specific alias is drift the pkgcheck
    // `tau-internal-imports-shape` rule rejects.
    expect(manifest.imports).toEqual({ '#*.js': './src/*.ts', '#*': './src/*' });
    const project = readJson<{ name?: string; sourceRoot?: string; tags?: string[] }>(tree, `${root}/project.json`);
    expect(manifest.name).toBe('@taucad/occt-core');
    expect(manifest.sideEffects).toBe(false);
    expect(manifest.repository?.directory).toBe(root);
    // Exhaustive on purpose: the template emits no zod, because nothing it
    // generates imports it, and `tau-peer-dependency-shape` rejects a peer no
    // emitted file witnesses.
    expect(manifest.peerDependencies).toEqual({ '@taucad/runtime': '^0.1.0-beta.0' });
    expect(manifest.devDependencies).toEqual({ '@taucad/runtime': 'workspace:*' });
    expect(project).toMatchObject({
      name: 'occt-core',
      sourceRoot: root,
      tags: ['scope:shared', 'type:package'],
    });
    expect(readText(tree, `${root}/src/index.ts`).trim()).toBe('export {};');
    expect(readText(tree, `${root}/src/index.ts`)).not.toContain('plugin');
    // `tau-host-target` reads the declaration and requires the guard test beside it.
    expect(manifest.taucad?.hostTarget).toBe('browser');
    const tests = readText(tree, `${root}/src/index.test.ts`);
    expect(tests).toContain('builtinModules');
    expect(tests).toContain('recursive: true');
    expect(tests).toContain("'ws'");
    // `import type … from 'node:fs'` is erased at emit, so it is not payload.
    expect(tests).toContain(String.raw`.replaceAll(/^\s*(?:import|export)\s+type\s[^;]*;/gm, '')`);
    expect(readText(tree, `${root}/LICENSE`)).toContain('Apache License');
    expect(readText(tree, `${root}/.size-limit.json`)).toContain('measure before release');
    expect(tree.exists(`${root}/vitest.setup.ts`)).toBe(false);

    // Rule 8 of npm-policy: the README is the npm landing page, and a core package's
    // quick start imports from its own name — it exports no plugin to compose.
    const readme = readText(tree, `${root}/README.md`);
    for (const heading of ['## Install', '## Quick start', '## API', '## License']) {
      expect(readme, heading).toContain(heading);
    }
    expect(readme).toContain("from '@taucad/occt-core';");
    expect(readme).not.toContain('import { plugin }');
    expect(readme).toContain('Apache-2.0 — see [LICENSE](./LICENSE)');
  });

  it('requires a scoped package name and published placement', async () => {
    const tree = createTreeWithEmptyWorkspace();

    await expect(coreGenerator(tree, { name: 'bad', packageName: 'bad-core' })).rejects.toThrow('@taucad/');
    await expect(
      coreGenerator(tree, { name: 'private', packageName: '@taucad/private-core', publishable: false }),
    ).rejects.toThrow('publishable by placement');
  });
});
