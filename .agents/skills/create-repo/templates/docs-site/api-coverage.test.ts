import { globSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '..');
const sourcePath = resolve(ROOT, 'src/index.ts');
const program = ts.createProgram([sourcePath], {
  module: ts.ModuleKind.NodeNext,
  moduleResolution: ts.ModuleResolutionKind.NodeNext,
  target: ts.ScriptTarget.ESNext,
});
const checker = program.getTypeChecker();
const file = program.getSourceFile(sourcePath);
if (!file) throw new Error(`missing public entrypoint: ${sourcePath}`);
const moduleSymbol = checker.getSymbolAtLocation(file);
if (!moduleSymbol) throw new Error(`public entrypoint has no module symbol: ${sourcePath}`);
const exported = checker.getExportsOfModule(moduleSymbol).map(({ name }) => name);
const pages = globSync('content/docs/**/*.mdx', { cwd: import.meta.dirname })
  .map((path) => readFileSync(resolve(import.meta.dirname, path), 'utf8'))
  .join('\n');
const hasWholeToken = (content: string, name: string): boolean => {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  return new RegExp(`(?:^|[^$\\p{ID_Continue}])${escaped}(?:$|[^$\\p{ID_Continue}])`, 'u').test(content);
};

describe('API documentation coverage', () => {
  it('should require whole export-name tokens', () => {
    expect(hasWholeToken('RenderedImages', 'RenderedImage')).toBe(false);
    expect(hasWholeToken('The RenderedImage result.', 'RenderedImage')).toBe(true);
  });

  it('should mention every public export in an API tag or prose page', () => {
    expect(exported.filter((name) => !hasWholeToken(pages, name))).toEqual([]);
  });
});
