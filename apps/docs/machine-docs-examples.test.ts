import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { defineConfiguration } from '@taucad/runtime/configuration';
import { defineMachine } from '@taucad/runtime/machine';
import type { MachineManifestDefinition } from '@taucad/runtime/machine';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

const root = resolve(import.meta.dirname, '../..');
// Install-coupled scratch (tool output location policy): the blocks resolve `@taucad/runtime` and `zod` from here.
const cacheDirectory = resolve(root, 'node_modules/.cache/docs-snippets');
mkdirSync(cacheDirectory, { recursive: true });

/** Every `ts` code block of the machine reference pages, written out as a module. */
const blocks = ['machine-providers', 'machines'].flatMap((page) => {
  const source = readFileSync(resolve(import.meta.dirname, `content/docs/runtime/api/${page}.mdx`), 'utf8');
  return [...source.matchAll(/^```ts\n([\s\S]*?)^```$/gmu)].map(([, code = ''], index) => {
    const path = resolve(cacheDirectory, `${page}-${index}.mts`);
    writeFileSync(path, code);
    return { page, path };
  });
});

describe('machine docs code examples', () => {
  it('type-checks every code block against the current runtime', () => {
    const program = ts.createProgram(
      blocks.map(({ path }) => path),
      {
        strict: true,
        noEmit: true,
        skipLibCheck: true,
        module: ts.ModuleKind.NodeNext,
        moduleResolution: ts.ModuleResolutionKind.NodeNext,
        target: ts.ScriptTarget.ESNext,
        lib: ['lib.esnext.d.ts', 'lib.dom.d.ts'],
        types: [],
      },
    );
    const errors = blocks.flatMap(({ page, path }) => {
      const file = program.getSourceFile(path);
      return [...program.getSyntacticDiagnostics(file), ...program.getSemanticDiagnostics(file)].map(
        (diagnostic) => `${page}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')}`,
      );
    });

    expect(blocks.length).toBeGreaterThanOrEqual(2);
    expect(errors).toEqual([]);
  }, 60_000);

  it('defines a provider from the provider manifest example', async () => {
    const example = blocks.find(({ page }) => page === 'machine-providers');
    if (!example) {
      throw new Error('machine-providers.mdx has no ts code block.');
    }
    const { manifest, binding } = (await import(example.path)) as {
      manifest: MachineManifestDefinition;
      binding: ReturnType<typeof defineConfiguration>;
    };
    const provider = defineMachine({
      id: 'example.router',
      name: 'Example router',
      version: '1.0.0',
      protocolVersion: 2,
      vendor: 'Example',
      manifest,
      bindingConfiguration: binding,
      submissionConfiguration: defineConfiguration({
        id: 'example.router.submission',
        version: '1.0.0',
        schema: z.object({}),
        ui: { version: 1, rjsf: {} },
      }),
      async *discover() {
        yield* [];
      },
      async connect() {
        throw new Error('not connected in docs tests');
      },
    })();

    expect(provider.manifest.identity.typeId).toBe('example.router');
  });
});
