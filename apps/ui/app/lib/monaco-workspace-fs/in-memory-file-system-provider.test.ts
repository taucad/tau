import { describe, it, expect, afterEach } from 'vitest';
import * as monaco from 'monaco-editor';
import { createInMemoryFileSystemProvider } from '#lib/monaco-workspace-fs/in-memory-file-system-provider.js';

import { drainMonacoPostTestWork } from '#lib/testing/monaco-async-drain.js';

describe('createInMemoryFileSystemProvider', () => {
  afterEach(async () => {
    for (const model of monaco.editor.getModels()) {
      model.dispose();
    }
    await drainMonacoPostTestWork();
  });

  it('readText and peekText round-trip seeded files', async () => {
    const provider = createInMemoryFileSystemProvider(monaco, 'mem');
    provider.seedForTests('a/b.txt', 'hi');
    const uri = monaco.Uri.parse('mem:/a/b.txt');
    expect(provider.peekText!(uri)).toBe('hi');
    await expect(provider.readText(uri)).resolves.toBe('hi');
  });

  it('onDidChange notifies listeners when writeForTests updates a path', () => {
    const provider = createInMemoryFileSystemProvider(monaco, 'mem');
    provider.seedForTests('c.txt', 'v1');
    const uri = monaco.Uri.parse('mem:/c.txt');
    const seen: string[] = [];
    provider.onDidChange(uri, () => {
      seen.push(provider.peekText!(uri) ?? '');
    });
    provider.writeForTests('c.txt', 'v2');
    expect(seen).toEqual(['v2']);
  });
});
