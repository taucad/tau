import { describe, expect, it } from 'vitest';
import ts from 'typescript';
import { TypeScriptProjectService } from '@taucad/lsp/typescript-worker/typescript-service';
import { declarationPath, loadDeclarationGraph } from '#lib/typescript-language/declaration-graph.js';

const declarationImports = async (text: string) =>
  ts
    .preProcessFile(text, true, true)
    .importedFiles.map((ref) => ({ name: ref.fileName, from: ref.pos + 1, to: ref.end + 1 }));

describe('declaration graph', () => {
  it('preserves a cyclic multi-file declaration graph without flattening its modules', async () => {
    const root = 'https://esm.sh/pkg@1/a.d.ts';
    const other = 'https://esm.sh/pkg@1/b.d.ts';
    const files = new Map([
      [root, "export type { B } from './b.d.ts'; export type A = number;"],
      [other, "import type { A } from './a.d.ts'; export type B = A;"],
    ]);
    const reads: string[] = [];
    const graph = await loadDeclarationGraph({
      entry: root,
      imports: declarationImports,
      read: async (url) => {
        reads.push(url);
        return files.get(url)!;
      },
      resolve: async (name, parent) => new URL(name, parent).href,
    });
    expect(reads).toEqual([root, other]);
    expect(graph.get(declarationPath(root))).toContain(declarationPath(other).replace(/\.d\.ts$/u, ''));
    expect(graph.get(declarationPath(other))).toContain('export type B = A');
  });
  it('recognizes type-only exports and dynamic import type references', async () => {
    const references = await declarationImports("export type { A } from 'a'; type B = import('b').B;");
    expect(references.map((item) => item.name)).toEqual(['a', 'b']);
  });
  it('rejects incomplete graphs without publishing a partial success', async () => {
    await expect(
      loadDeclarationGraph({
        entry: 'https://esm.sh/a.d.ts',
        imports: declarationImports,
        read: async () => {
          throw new Error('offline');
        },
        resolve: async (name) => name,
      }),
    ).rejects.toThrow('offline');
  });
});

it('should preserve usable types across rewritten declaration imports', async () => {
  const service = new TypeScriptProjectService({
    syncFs: {
      readFileText: () => undefined,
      fileExists: () => false,
      directoryExists: () => false,
      getDirectories: () => [],
      getScriptVersionForPath: () => '0',
    },
    standardLibraries: {},
  });
  const root = 'https://esm.sh/pkg@1/index.d.ts';
  const files = new Map([
    [root, "export { size } from './size.d.ts';"],
    ['https://esm.sh/pkg@1/size.d.ts', 'export declare const size: number;'],
  ]);
  const graph = await loadDeclarationGraph({
    entry: root,
    imports: async (text) => service.declarationImports(text),
    read: async (url) => files.get(url)!,
    resolve: async (name, parent) => new URL(name, parent).href,
  });
  for (const [path, text] of graph) {
    service.setExtraLib(`file://${path}`, text);
  }
  service.setModuleAlias('pkg', `file://${declarationPath(root)}`);
  service.open('file:///main.ts', "import {size} from 'pkg'; export const value: string = size;", 1);
  const diagnostics = service.getDiagnostics('file:///main.ts');
  expect(diagnostics.map((row) => row.code)).toContain(2322);
  expect(diagnostics.map((row) => row.code)).not.toContain(2307);
  expect(diagnostics.map((row) => row.code)).not.toContain(2305);
  service.dispose();
});

it('preserves triple-slash declaration references and type exports', async () => {
  const service = new TypeScriptProjectService({
    syncFs: {
      readFileText: () => undefined,
      fileExists: () => false,
      directoryExists: () => false,
      getDirectories: () => [],
      getScriptVersionForPath: () => '0',
    },
    standardLibraries: {},
  });
  const root = 'https://esm.sh/pkg@1/index.d.ts';
  const files = new Map([
    [root, '/// <reference path="./globals.d.ts" />\nexport declare const value: GlobalSize;'],
    ['https://esm.sh/pkg@1/globals.d.ts', 'type GlobalSize = number;'],
  ]);
  try {
    const graph = await loadDeclarationGraph({
      entry: root,
      imports: async (text) => service.declarationImports(text),
      read: async (url) => files.get(url)!,
      resolve: async (name, parent) => new URL(name, parent).href,
    });
    for (const [path, text] of graph) {
      service.setExtraLib(`file://${path}`, text);
    }
    service.setModuleAlias('pkg', `file://${declarationPath(root)}`);
    service.open('file:///main.ts', "import {value} from 'pkg'; export const bad: string = value;", 1);
    expect(service.getDiagnostics('file:///main.ts').map((row) => row.code)).toEqual([2322]);
  } finally {
    service.dispose();
  }
});

it('invalidates a previously missing alias without changing the source or declaration bytes', async () => {
  const service = new TypeScriptProjectService({
    syncFs: {
      readFileText: () => undefined,
      fileExists: () => false,
      directoryExists: () => false,
      getDirectories: () => [],
      getScriptVersionForPath: () => '0',
    },
    standardLibraries: {},
  });
  try {
    service.setExtraLib('file:///declarations/value.d.ts', 'export declare const value: number;');
    service.open('file:///main.ts', "import {value} from 'pkg'; export const bad: string = value;", 1);
    expect(service.getDiagnostics('file:///main.ts').map((row) => row.code)).toEqual([2307]);
    service.setModuleAlias('pkg', 'file:///declarations/value.d.ts');
    expect(service.getDiagnostics('file:///main.ts').map((row) => row.code)).toEqual([2322]);
  } finally {
    service.dispose();
  }
});
