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
      main?: string;
      module?: string;
      types?: string;
      publishConfig?: {
        exports?: {
          '.'?: {
            types?: string;
            import?: string;
            default?: string;
            require?: unknown;
          };
        };
      };
      imports?: Record<string, string>;
    }>(tree, 'packages/example/package.json');

    expect(packageJson.main).toBe('./dist/index.mjs');
    expect(packageJson.types).toBe('./dist/index.d.mts');
    expect(packageJson.module).toBeUndefined();
    expect(packageJson.publishConfig?.exports?.['.']).toEqual({
      types: './dist/index.d.mts',
      import: './dist/index.mjs',
      default: './dist/index.mjs',
    });
    expect(packageJson.imports?.['#*.js']).toBe('./src/*.ts');
    expect(packageJson.imports?.['#*']).toBe('./src/*');
    expect(packageJson.publishConfig?.exports?.['.']?.require).toBeUndefined();
    expect(JSON.stringify(packageJson)).not.toMatch(/dist\/esm|dist\/cjs|\.cjs|\.d\.cts/);

    const tsdownConfig = readText(tree, 'packages/example/tsdown.config.ts');

    expect(tsdownConfig).toContain("format: 'esm'");
    expect(tsdownConfig).toContain("outDir: 'dist'");
    expect(tsdownConfig).toContain('export default defineConfig(packageConfig);');
    expect(tsdownConfig).not.toMatch(/cjsConfig|format: 'cjs'|dist\/esm|dist\/cjs|defineConfig\(\[/);
  });

  it.each([
    {
      scope: 'packages',
      isPrivate: false,
      license: 'Apache-2.0',
      tags: ['scope:shared', 'type:package-veneer'],
    },
    {
      scope: 'libs',
      isPrivate: true,
      license: 'Apache-2.0',
      tags: ['scope:shared', 'type:lib'],
    },
    {
      scope: 'apps/libs',
      isPrivate: true,
      license: 'AGPL-3.0-only',
      tags: ['scope:shared', 'type:app-lib'],
    },
  ] as const)('derives layering, privacy, and license from the $scope placement', async (placement) => {
    const tree = createTreeWithEmptyWorkspace();

    await packageGenerator(tree, { name: 'example', scope: placement.scope });

    const root = `${placement.scope}/example`;
    const packageJson = readJson<{ private?: boolean; license?: string }>(tree, `${root}/package.json`);
    const projectJson = readJson<{ tags?: string[] }>(tree, `${root}/project.json`);

    expect(packageJson.private).toBe(placement.isPrivate);
    expect(packageJson.license).toBe(placement.license);
    expect(projectJson.tags).toStrictEqual(placement.tags);
    expect(readText(tree, `${root}/LICENSE`)).toContain(
      placement.license === 'Apache-2.0' ? 'Apache License' : 'GNU AFFERO GENERAL PUBLIC LICENSE',
    );
  });
});
