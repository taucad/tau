import { afterEach, describe, expect, it } from 'vitest';
import { TypeScriptWorkerClient } from '#typescript-worker/client.js';
import type { TypeScriptLocation } from '#typescript-worker/typescript-service.js';

const clients: TypeScriptWorkerClient[] = [];
afterEach(() => {
  for (const client of clients) {
    client.dispose();
  }
  clients.length = 0;
});

describe('real browser TypeScript worker', () => {
  it('starts a real worker, serves standard libs and edits open files', async () => {
    const client = new TypeScriptWorkerClient();
    clients.push(client);
    const source = 'const value: number = 1;\nvalue.toFixed(2);\n';
    await client.open('file:///main.ts', source, 1);
    const offset = source.indexOf('toFixed');
    const target = await client.request<readonly TypeScriptLocation[]>({
      kind: 'definitionLocations',
      uri: 'file:///main.ts',
      position: offset,
    });
    expect(target.some((location) => location.uri.includes('lib.es5.d.ts'))).toBe(true);
    const builtin = target.find((location) => location.uri.includes('lib.es5.d.ts'));
    const declaration = await client.request<string | undefined>({ kind: 'readDeclaration', uri: builtin?.uri });
    expect(declaration).toContain('toFixed');
    await client.change({
      uri: 'file:///main.ts',
      previousVersion: 1,
      version: 2,
      changes: [{ from: 0, to: 5, insert: 'let' }],
    });
    const diagnostics = await client.request<ReadonlyArray<{ code: number }>>({
      kind: 'diagnostics',
      uri: 'file:///main.ts',
    });
    expect(diagnostics.some((diagnostic) => diagnostic.code === 2304)).toBe(false);
  });
});
