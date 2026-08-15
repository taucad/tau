import { globSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '..');
const source = readFileSync(resolve(ROOT, 'src/index.ts'), 'utf8');
const file = ts.createSourceFile('index.ts', source, ts.ScriptTarget.Latest, true);
const exported = file.statements.flatMap((statement) => {
  if (!ts.isExportDeclaration(statement) || !statement.exportClause || !ts.isNamedExports(statement.exportClause))
    return [];
  return statement.exportClause.elements.map((element) => element.name.text);
});
const pages = globSync('content/docs/**/*.mdx', { cwd: import.meta.dirname })
  .map((path) => readFileSync(resolve(import.meta.dirname, path), 'utf8'))
  .join('\n');

describe('API documentation coverage', () => {
  it('should mention every public export in an API tag or prose page', () => {
    expect(exported.filter((name) => !pages.includes(name))).toEqual([]);
  });
});
