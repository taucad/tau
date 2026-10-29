import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { TypeScriptProjectService } from '@taucad/lsp/typescript-worker/typescript-service';
import { declarationEntry, installedDeclarations } from '#lib/typescript-language/installed-declarations.js';

const imports = async (text: string) =>
  ts
    .preProcessFile(text, true, true)
    .importedFiles.map((ref) => ({ name: ref.fileName, from: ref.pos + 1, to: ref.end + 1 }));

describe('installed declaration exports', () => {
  it('selects exact and conditional wildcard subpaths without root fallback', () => {
    const manifest = {
      exports: {
        '.': { types: './index.d.ts' },
        './tools/*': { import: { types: './dist/*.d.mts' }, require: './cjs/*.cjs' },
      },
    };
    expect(declarationEntry(manifest, '')).toBe('./index.d.ts');
    expect(declarationEntry(manifest, '/tools/math')).toBe('./dist/math.d.mts');
    expect(declarationEntry(manifest, '/private')).toBeUndefined();
  });
  it('preserves default and CommonJS exports across multi-file declaration graphs', async () => {
    const files = new Map([
      ['node_modules/pkg/index.d.cts', "import value = require('./value.cjs'); export = value;"],
      ['node_modules/pkg/value.d.cts', 'declare const value: {size: number}; export = value;'],
    ]);
    const graph = await installedDeclarations({
      packageName: 'pkg',
      subpath: '',
      manifest: { types: 'index.d.cts' },
      read: async (path) => files.get(path),
      imports,
    });
    expect(graph?.files.size).toBe(2);
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
      for (const [path, text] of graph!.files) {
        service.setExtraLib(`file://${path}`, text);
      }
      service.setModuleAlias('pkg', graph!.uri);
      service.open('file:///main.ts', "import value from 'pkg'; export const size: string = value.size;", 1);
      expect(service.getDiagnostics('file:///main.ts').map((row) => row.code)).toEqual([2322]);
    } finally {
      service.dispose();
    }
  });
  it('rejects missing siblings instead of marking an incomplete graph ready', async () => {
    await expect(
      installedDeclarations({
        packageName: 'pkg',
        subpath: '',
        manifest: { types: 'index.d.ts' },
        read: async (path) => (path === 'node_modules/pkg/index.d.ts' ? "export * from './missing.js';" : undefined),
        imports,
      }),
    ).rejects.toThrow('Missing installed declaration');
  });
});
