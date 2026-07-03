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

    expect(packageJson.main).toBe('./dist/index.js');
    expect(packageJson.types).toBe('./dist/index.d.ts');
    expect(packageJson.module).toBeUndefined();
    expect(packageJson.publishConfig?.exports?.['.']).toEqual({
      types: './dist/index.d.ts',
      import: './dist/index.js',
      default: './dist/index.js',
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
});
