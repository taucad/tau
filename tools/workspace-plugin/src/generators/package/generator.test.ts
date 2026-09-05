import { addProjectConfiguration } from '@nx/devkit';
import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing.js';
import { describe, expect, it } from 'vitest';

import { packageGenerator } from '#generators/package/generator.js';
import { writeProjectInstructions } from '#generators/write-project-instructions.js';

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

describe('package generator', () => {
  it('scaffolds ESM-only publish metadata and tsdown config', async () => {
    const tree = createTreeWithEmptyWorkspace();

    await packageGenerator(tree, {
      name: 'example',
      description: 'Example package',
    });

    const packageJson = readJson<{
      bugs?: { url?: string };
      engines?: { node?: string };
      files?: string[];
      homepage?: string;
      main?: string;
      module?: string;
      sideEffects?: boolean;
      types?: string;
      exports?: Record<string, unknown>;
      publishConfig?: {
        exports?: {
          '.'?: {
            types?: string;
            import?: string;
            default?: string;
            require?: unknown;
          };
          './package.json'?: string;
        };
        imports?: Record<string, string>;
      };
      imports?: Record<string, string>;
    }>(tree, 'packages/example/package.json');

    expect(packageJson.main).toBe('./dist/index.mjs');
    expect(packageJson.types).toBe('./dist/index.d.mts');
    expect(packageJson.module).toBeUndefined();
    expect(packageJson.sideEffects).toBe(false);
    expect(packageJson.engines?.node).toBe('>=24.0.0');
    expect(packageJson.homepage).toContain('/packages/example#readme');
    expect(packageJson.bugs?.url).toBe('https://github.com/taucad/tau/issues');
    expect(packageJson.files).toContain('LICENSE');
    expect(packageJson.publishConfig?.exports?.['.']).toEqual({
      types: './dist/index.d.mts',
      import: './dist/index.mjs',
      default: './dist/index.mjs',
    });
    // Exactly two keys: every package-specific alias is drift the pkgcheck
    // `tau-internal-imports-shape` rule rejects.
    expect(packageJson.imports).toEqual({ '#*.js': './src/*.ts', '#*': './src/*' });
    expect(packageJson.exports?.['./package.json']).toBe('./package.json');
    expect(packageJson.publishConfig?.exports?.['./package.json']).toBe('./package.json');
    // The source subpath-import map must never reach the registry — see R14/R15.
    expect(packageJson.publishConfig?.imports).toEqual({});
    expect(packageJson.publishConfig?.exports?.['.']?.require).toBeUndefined();
    expect(JSON.stringify(packageJson)).not.toMatch(/dist\/esm|dist\/cjs|\.cjs|\.d\.cts/);

    const tsdownConfig = readText(tree, 'packages/example/tsdown.config.ts');

    expect(tsdownConfig).toContain("format: 'esm'");
    expect(tsdownConfig).toContain("outDir: 'dist'");
    expect(tsdownConfig).toContain('export default defineConfig(packageConfig);');
    expect(tsdownConfig).not.toMatch(/cjsConfig|format: 'cjs'|dist\/esm|dist\/cjs|defineConfig\(\[/);

    const tsconfig = readJson<{ compilerOptions: { lib?: string[] } }>(tree, 'packages/example/tsconfig.lib.json');
    expect(tsconfig.compilerOptions.lib).toEqual(['ES2024', 'DOM', 'DOM.Iterable']);
    expect(tree.exists('packages/example/vitest.setup.ts')).toBe(false);
    expect(readText(tree, 'packages/example/.size-limit.json')).toContain('measure before release');

    const vitestConfig = readText(tree, 'packages/example/vitest.config.ts');
    expect(vitestConfig).toContain("exclude: ['src/**/*.{test,spec,test-d}.ts']");
    expect(vitestConfig).not.toContain('thresholds:');

    const instructions = readText(tree, 'packages/example/AGENTS.md');
    expect(instructions).toContain('# @taucad/example');
    expect(instructions).toContain('Nx project: `example`');
    expect(instructions).toContain('Build mode: tsdown ESM build enabled');
    expect(instructions).toContain('React mode: disabled with Node test environment');
    expect(instructions).toContain('`src/index.ts`');
    expect(instructions).toContain('pnpm nx build example');
    expect(instructions).toContain('pnpm nx pkgcheck example');
    expect(instructions).toContain('pnpm nx size example');
    expect(instructions).toContain('[project README](./README.md)');
    expect(instructions).toContain('[root AGENTS](../../AGENTS.md)');
    expect(instructions).toContain('[packages AGENTS](../AGENTS.md)');
    expect(instructions).toContain('../../.agents/skills/create-package/SKILL.md');
    expect(instructions).toContain('../../.agents/skills/update-agent-memory/SKILL.md');
    expect(instructions).toContain('../../docs/policy/workspace-project-policy.md');
    expect(instructions).not.toMatch(/<%|__tmpl__/);
    expect(readText(tree, 'packages/example/CLAUDE.md')).toBe('@AGENTS.md\n');
  });

  it.each([
    {
      scope: 'packages',
      layer: undefined,
      isPrivate: false,
      tags: ['scope:shared', 'type:package'],
      ancestorLinks: ['[root AGENTS](../../AGENTS.md)', '[packages AGENTS](../AGENTS.md)'],
    },
    {
      scope: 'libs',
      layer: undefined,
      isPrivate: true,
      tags: ['scope:shared', 'type:lib'],
      ancestorLinks: ['[root AGENTS](../../AGENTS.md)', '[libs AGENTS](../AGENTS.md)'],
    },
    {
      scope: 'apps/libs',
      layer: 'feature',
      isPrivate: true,
      tags: ['scope:shared', 'type:app-lib', 'layer:feature'],
      ancestorLinks: [
        '[root AGENTS](../../../AGENTS.md)',
        '[apps AGENTS](../../AGENTS.md)',
        '[apps/libs AGENTS](../AGENTS.md)',
      ],
    },
    {
      scope: 'tools',
      layer: undefined,
      isPrivate: true,
      tags: ['scope:shared', 'type:tool'],
      ancestorLinks: ['[root AGENTS](../../AGENTS.md)', '[tools AGENTS](../AGENTS.md)'],
    },
  ] as const)('derives architecture from $scope and always uses Apache-2.0', async (placement) => {
    const tree = createTreeWithEmptyWorkspace();

    await packageGenerator(tree, { name: 'example', scope: placement.scope, layer: placement.layer });

    const root = `${placement.scope}/example`;
    const packageJson = readJson<{ private?: boolean; license?: string }>(tree, `${root}/package.json`);
    const projectJson = readJson<{ tags?: string[] }>(tree, `${root}/project.json`);

    expect(packageJson.private).toBe(placement.isPrivate);
    expect(packageJson.license).toBe('Apache-2.0');
    expect(projectJson.tags).toStrictEqual(placement.tags);
    expect(readText(tree, `${root}/LICENSE`)).toContain('Apache License');
    expect(tree.exists(`${root}/AGENTS.md`)).toBe(true);
    expect(readText(tree, `${root}/CLAUDE.md`)).toBe('@AGENTS.md\n');
    const instructions = readText(tree, `${root}/AGENTS.md`);
    expect(instructions).toContain(`Project root: \`${root}\``);
    for (const link of placement.ancestorLinks) {
      expect(instructions).toContain(link);
    }
  });

  it('scaffolds a source-consumed React app-lib', async () => {
    const tree = createTreeWithEmptyWorkspace();

    await packageGenerator(tree, {
      name: 'example',
      scope: 'apps/libs',
      scopeTag: 'ui',
      layer: 'data-access',
      react: true,
    });

    const root = 'apps/libs/example';
    const packageJson = readJson<{
      main?: string;
      types?: string;
      publishConfig?: unknown;
      peerDependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    }>(tree, `${root}/package.json`);
    const projectJson = readJson<{ tags: string[] }>(tree, `${root}/project.json`);
    const tsconfig = readJson<{
      compilerOptions: { jsx?: string; lib?: string[] };
      include: string[];
    }>(tree, `${root}/tsconfig.lib.json`);

    expect(projectJson.tags).toStrictEqual(['scope:ui', 'type:app-lib', 'layer:data-access']);
    expect(tree.exists(`${root}/tsdown.config.ts`)).toBe(false);
    expect(tree.exists(`${root}/tsconfig.build.json`)).toBe(false);
    expect(tree.exists(`${root}/.size-limit.json`)).toBe(false);
    expect(packageJson.main).toBeUndefined();
    expect(packageJson.types).toBeUndefined();
    expect(packageJson.publishConfig).toBeUndefined();
    expect(packageJson.peerDependencies).toEqual({
      react: '^18.0.0 || ^19.0.0',
      'react-dom': '^18.0.0 || ^19.0.0',
    });
    expect(packageJson.devDependencies?.['@testing-library/react']).toBe('catalog:');
    expect(packageJson.devDependencies?.['@testing-library/jest-dom']).toBe('catalog:');
    const vitestConfig = readText(tree, `${root}/vitest.config.ts`);
    expect(vitestConfig).toContain("environment: 'jsdom'");
    expect(vitestConfig).toContain("setupFiles: ['./vitest.setup.ts']");
    expect(vitestConfig).toContain("exclude: ['src/**/*.{test,spec,test-d}.ts']");
    expect(vitestConfig).not.toContain('thresholds:');
    expect(readText(tree, `${root}/vitest.setup.ts`)).toContain('@testing-library/jest-dom/vitest');
    expect(tsconfig.compilerOptions).toMatchObject({
      jsx: 'react-jsx',
      lib: ['ES2024', 'DOM', 'DOM.Iterable'],
    });
    expect(tsconfig.include).toContain('src/**/*.tsx');
    const instructions = readText(tree, `${root}/AGENTS.md`);
    expect(instructions).toContain('Build mode: source-consumed; no build target');
    expect(instructions).toContain('React mode: enabled with jsdom test setup');
    expect(instructions).toContain('../../../.agents/skills/create-package/SKILL.md');
    expect(instructions).not.toContain('pnpm nx build example');
    expect(instructions).not.toContain('pnpm nx pkgcheck example');
    expect(instructions).not.toContain('pnpm nx size example');
  });

  it.each([
    {
      label: 'a missing app-lib layer',
      schema: { name: 'example', scope: 'apps/libs' } as const,
      message: '--layer is required when --scope=apps/libs',
    },
    {
      label: 'a layer outside app-libs',
      schema: { name: 'example', scope: 'packages', layer: 'feature' } as const,
      message: '--layer is only supported when --scope=apps/libs',
    },
    {
      label: 'a built app-lib',
      schema: { name: 'example', scope: 'apps/libs', layer: 'util', build: true } as const,
      message: '--build=true conflicts with the fixed apps/libs build mode (false)',
    },
    {
      label: 'an unbuilt public package',
      schema: { name: 'example', scope: 'packages', build: false } as const,
      message: '--build=false conflicts with the fixed packages build mode (true)',
    },
    {
      label: 'React outside app-libs',
      schema: { name: 'example', scope: 'libs', react: true } as const,
      message: '--react is only supported when --scope=apps/libs',
    },
    {
      label: 'a non-shared published scope',
      schema: { name: 'example', scope: 'packages', scopeTag: 'ui' } as const,
      message: '--scopeTag=ui is not supported when --scope=packages',
    },
    {
      label: 'an unsupported API-only app-lib scope',
      schema: { name: 'example', scope: 'apps/libs', layer: 'util', scopeTag: 'api' } as const,
      message: '--scopeTag=api is not supported when --scope=apps/libs',
    },
  ])('rejects $label before changing the Tree', async ({ schema, message }) => {
    const tree = createTreeWithEmptyWorkspace();
    tree.write('sentinel.txt', 'unchanged\n');
    const before = snapshotChanges(tree);

    await expect(packageGenerator(tree, schema)).rejects.toThrow(message);
    expect(snapshotChanges(tree)).toEqual(before);
  });

  it.each([
    {
      label: 'Nx project name',
      prepare: (tree: ReturnType<typeof createTreeWithEmptyWorkspace>) => {
        addProjectConfiguration(tree, 'example', { root: 'packages/different-root' });
      },
      message: 'Nx project already exists: example',
    },
    {
      label: 'nonempty project root',
      prepare: (tree: ReturnType<typeof createTreeWithEmptyWorkspace>) => {
        tree.write('packages/example/sentinel.txt', 'owned root\n');
      },
      message: 'Project root already exists: packages/example',
    },
    {
      label: 'regular file at the exact project root',
      prepare: (tree: ReturnType<typeof createTreeWithEmptyWorkspace>) => {
        tree.write('packages/example', 'owned file\n');
      },
      message: 'Project root already exists: packages/example',
    },
  ])('rejects an existing $label before changing existing bytes', async ({ prepare, message }) => {
    const tree = createTreeWithEmptyWorkspace();
    prepare(tree);
    const before = snapshotChanges(tree);

    await expect(packageGenerator(tree, { name: 'example' })).rejects.toThrow(message);
    expect(snapshotChanges(tree)).toEqual(before);
  });

  it('keeps authored instruction bytes and fills only a missing pair member', async () => {
    const tree = createTreeWithEmptyWorkspace();
    const options = {
      projectName: 'example',
      projectRoot: 'packages/example',
      packageName: '@taucad/example',
      description: 'Example package',
      rootOffset: '../../',
      facts: ['Placement: `packages`'],
      entrypoints: ['src/index.ts'],
      commands: ['pnpm nx lint example'],
      owners: [{ label: 'Testing policy', path: 'docs/policy/testing-policy.md' }],
    };
    tree.write('packages/example/AGENTS.md', '# Authored\nKeep this byte-for-byte.\n');
    tree.write('packages/example/CLAUDE.md', 'custom adapter\n');

    writeProjectInstructions(tree, options);
    expect(readText(tree, 'packages/example/AGENTS.md')).toBe('# Authored\nKeep this byte-for-byte.\n');
    expect(readText(tree, 'packages/example/CLAUDE.md')).toBe('custom adapter\n');

    tree.delete('packages/example/CLAUDE.md');
    writeProjectInstructions(tree, options);
    expect(readText(tree, 'packages/example/AGENTS.md')).toBe('# Authored\nKeep this byte-for-byte.\n');
    expect(readText(tree, 'packages/example/CLAUDE.md')).toBe('@AGENTS.md\n');

    const afterMissingFill = snapshotChanges(tree);
    writeProjectInstructions(tree, options);
    expect(snapshotChanges(tree)).toEqual(afterMissingFill);
  });
});
