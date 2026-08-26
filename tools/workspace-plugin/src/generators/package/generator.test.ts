import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing.js';
import { describe, expect, it } from 'vitest';

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
  });

  it.each([
    {
      scope: 'packages',
      layer: undefined,
      isPrivate: false,
      tags: ['scope:shared', 'type:package'],
    },
    {
      scope: 'libs',
      layer: undefined,
      isPrivate: true,
      tags: ['scope:shared', 'type:lib'],
    },
    {
      scope: 'apps/libs',
      layer: 'feature',
      isPrivate: true,
      tags: ['scope:shared', 'type:app-lib', 'layer:feature'],
    },
    {
      scope: 'tools',
      layer: undefined,
      isPrivate: true,
      tags: ['scope:shared', 'type:tool'],
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
  });

  it('supports overriding the placement build default', async () => {
    const tree = createTreeWithEmptyWorkspace();

    await packageGenerator(tree, { name: 'example', scope: 'apps/libs', layer: 'util', build: true });

    expect(tree.exists('apps/libs/example/tsdown.config.ts')).toBe(true);
    expect(tree.exists('apps/libs/example/.size-limit.json')).toBe(true);
    expect(readJson<{ publishConfig?: unknown }>(tree, 'apps/libs/example/package.json').publishConfig).toBeDefined();
  });

  it('validates layer placement', async () => {
    await expect(
      packageGenerator(createTreeWithEmptyWorkspace(), { name: 'example', scope: 'apps/libs' }),
    ).rejects.toThrow('--layer is required when --scope=apps/libs');
    await expect(
      packageGenerator(createTreeWithEmptyWorkspace(), { name: 'example', scope: 'packages', layer: 'feature' }),
    ).rejects.toThrow('--layer is only supported when --scope=apps/libs');
  });
});
