// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const sourceRoot = join(process.cwd(), 'src');
const deprecatedScopedClipper2Package = `@countertype/${'clipper2-ts'}`;
const allowedDirectPackageImportFiles = new Set([
  'graphics/three/utils/section-cap-polygon-boolean-clipper2-ts.ts',
  'graphics/three/utils/section-cap-polygon-boolean-clipper2-wasm.ts',
  'types/clipper2-wasm.d.ts',
]);

const sourceExtensions = new Set(['.ts', '.tsx', '.mts', '.cts']);

const collectSourceFiles = (directory: string): string[] => {
  const files: string[] = [];
  for (const entry of readdirSync(directory)) {
    const absolutePath = join(directory, entry);
    const stat = statSync(absolutePath);
    if (stat.isDirectory()) {
      files.push(...collectSourceFiles(absolutePath));
      continue;
    }

    if ([...sourceExtensions].some((extension) => entry.endsWith(extension))) {
      files.push(absolutePath);
    }
  }

  return files;
};

describe('section cap polygon boolean import boundaries', () => {
  it('should keep boolean engine package imports behind Tau-owned adapters', () => {
    const violations = collectSourceFiles(sourceRoot)
      .map((file) => ({
        relativePath: relative(sourceRoot, file),
        contents: readFileSync(file, 'utf8'),
      }))
      .filter(
        ({ contents, relativePath }) =>
          /from ["'](?:clipper2-ts|clipper2-wasm|clipper2-wasm\/|polygon-clipping)/.test(contents) &&
          !allowedDirectPackageImportFiles.has(relativePath) &&
          !relativePath.endsWith('.test.ts') &&
          !relativePath.endsWith('.test.tsx'),
      )
      .map(({ relativePath }) => relativePath);

    expect(violations).toEqual([]);
  });

  it('should not add the deprecated scoped clipper2-ts package anywhere in viewer code', () => {
    const references = collectSourceFiles(sourceRoot)
      .filter((file) => readFileSync(file, 'utf8').includes(deprecatedScopedClipper2Package))
      .map((file) => relative(sourceRoot, file));

    expect(references).toEqual([]);
  });
});
