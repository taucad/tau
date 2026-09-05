import { ResourceQueue } from '@taucad/filesystem';
import { MemoryProvider } from '@taucad/filesystem/backend';
import { beforeEach, describe, expect, it } from 'vitest';

import { createProviderRpcFileSystem } from '#registry/provider-file-system.js';

const decoder = new TextDecoder();

let provider: MemoryProvider;

const fileSystemFor = (signal?: AbortSignal) =>
  createProviderRpcFileSystem({ provider, mutations: new ResourceQueue(), ...(signal ? { signal } : {}) });

beforeEach(async () => {
  provider = new MemoryProvider();
  await provider.writeFile('main.ts', 'export const main = 1;\n');
});

describe('createProviderRpcFileSystem', () => {
  it('reads and writes text through the provider', async () => {
    const fileSystem = fileSystemFor();

    expect(await fileSystem.readFile('main.ts')).toBe('export const main = 1;\n');
    await fileSystem.writeFile('notes.md', '# notes\n');
    expect(await fileSystem.readFile('notes.md')).toBe('# notes\n');
    expect(await fileSystem.exists('notes.md')).toBe(true);
    expect(await fileSystem.exists('absent.md')).toBe(false);
  });

  it('appends to a missing file as if it were empty', async () => {
    const fileSystem = fileSystemFor();

    await fileSystem.appendFile('log.txt', 'first\n');
    await fileSystem.appendFile('log.txt', 'second\n');
    expect(await fileSystem.readFile('log.txt')).toBe('first\nsecond\n');
  });

  it('writes binary bytes verbatim', async () => {
    const fileSystem = fileSystemFor();

    await fileSystem.writeBinaryFile('blob.bin', new Uint8Array([1, 2, 3]));
    expect([...(await provider.readFile('blob.bin'))]).toStrictEqual([1, 2, 3]);
  });

  it('reports text stat metadata the RPC layer needs', async () => {
    const stat = await fileSystemFor().stat('main.ts');

    /* The provider counts the trailing newline's empty line, so a one-statement
     * file is two lines; the RPC layer passes that count through unchanged. */
    expect(stat).toMatchObject({ isDirectory: false, contentKind: 'text', lineCount: 2 });
    expect(new Date(stat.modifiedAt).getTime()).toBeGreaterThan(0);
  });

  it('lists a directory as typed entries with basenames only', async () => {
    await provider.writeFile('src/a.ts', 'a\n');
    await provider.mkdir('src/nested', { recursive: true });

    const entries = await fileSystemFor().readdir('src');
    expect(entries.map((entry) => entry.name).toSorted()).toStrictEqual(['a.ts', 'nested']);
    expect(entries.find((entry) => entry.name === 'nested')).toMatchObject({ type: 'dir' });
    expect(entries.find((entry) => entry.name === 'a.ts')).toMatchObject({ type: 'file', contentKind: 'text' });
  });

  it('edits a file by exact replacement and reports the occurrence count', async () => {
    const fileSystem = fileSystemFor();

    const result = await fileSystem.editFile('main.ts', 'main = 1', 'main = 2');
    expect(result.occurrences).toBe(1);
    expect(await fileSystem.readFile('main.ts')).toBe('export const main = 2;\n');
  });

  it('refuses an edit whose old string is not present', async () => {
    await expect(fileSystemFor().editFile('main.ts', 'nope', 'yes')).rejects.toThrow();
  });

  it('deletes a file, and surfaces ENOTEMPTY rather than deleting a subtree', async () => {
    const fileSystem = fileSystemFor();
    await provider.writeFile('doomed/child.ts', 'x\n');

    await fileSystem.deleteFile('main.ts');
    expect(await provider.exists('main.ts')).toBe(false);

    await expect(fileSystem.deleteFile('doomed')).rejects.toThrow();
    expect(await provider.exists('doomed/child.ts')).toBe(true);
  });

  it('refuses a mutation once its invocation is aborted', async () => {
    const controller = new AbortController();
    const fileSystem = fileSystemFor(controller.signal);
    controller.abort(new Error('cancelled mid-run'));

    await expect(fileSystem.writeFile('late.md', 'x')).rejects.toThrow('cancelled mid-run');
    /* Reads are not gated: the abort only has to stop the tool from writing. */
    expect(decoder.decode(await provider.readFile('main.ts'))).toBe('export const main = 1;\n');
  });
});
