import { describe, expect, it } from 'vitest';

import { createBundlerSourceHost } from '#bundler-source-host.js';
import { createTestFileSystem } from '#testing.fixture.js';

describe('createBundlerSourceHost', () => {
  it('resolves, probes, loads, and observes an operation independently', async () => {
    const host = createBundlerSourceHost({
      filesystem: createTestFileSystem({
        'src/main.ts': "import { value } from './value.js';\nconst main = () => value;",
        'src/value.ts': 'export const value = 42;',
      }),
      autoExportNames: ['main'],
    });
    const session = host.beginSession({
      mode: 'bundle',
      signal: new AbortController().signal,
      entryPath: 'src/main.ts',
    });
    const entry = await session.resolve({ specifier: 'src/main.ts' });
    const entrySource = await session.load(entry);
    const dependency = await session.resolve({ specifier: './value.js', importer: 'src/main.ts' });
    await session.load(dependency);

    expect(entrySource.text).toContain('export { main }');
    expect(dependency).toMatchObject({ kind: 'project', path: 'src/value.ts' });
    expect(session.complete()).toEqual({
      dependencies: ['src/main.ts', 'src/value.ts'],
      detectedModules: [],
      unresolvedPaths: [],
    });
    expect(() => session.complete()).toThrow('already completed');

    const next = host.beginSession({ mode: 'detect', signal: new AbortController().signal, entryPath: 'src/main.ts' });
    await next.resolve({ specifier: 'replicad', importer: 'src/main.ts' });
    expect(next.complete()).toEqual({ dependencies: [], detectedModules: ['replicad'], unresolvedPaths: [] });
  });

  it('rejects paths that escape the virtual root', async () => {
    const host = createBundlerSourceHost({ filesystem: createTestFileSystem({ 'main.ts': '' }) });
    const session = host.beginSession({ mode: 'bundle', signal: new AbortController().signal, entryPath: 'main.ts' });
    await expect(session.resolve({ specifier: '../../secret.ts', importer: 'main.ts' })).rejects.toThrow('escapes');
  });

  it('probes a directory import to its index file on real filesystem semantics', async () => {
    const base = createTestFileSystem({ 'lib/features/index.ts': 'export const value = 1;' });
    const host = createBundlerSourceHost({
      filesystem: {
        ...base,
        exists: async (path) => path === 'lib/features' || base.exists(path),
        stat: async (path) => ({ type: path === 'lib/features' ? 'dir' : 'file' }),
      },
    });
    const session = host.beginSession({
      mode: 'bundle',
      signal: new AbortController().signal,
      entryPath: 'main.ts',
    });

    await expect(session.resolve({ specifier: '/lib/features' })).resolves.toMatchObject({
      kind: 'project',
      path: 'lib/features/index.ts',
    });
  });

  it('uses operation-local cancellation', async () => {
    const controller = new AbortController();
    const host = createBundlerSourceHost({ filesystem: createTestFileSystem({ 'main.ts': '' }) });
    const aborted = host.beginSession({ mode: 'bundle', signal: controller.signal, entryPath: 'main.ts' });
    controller.abort();
    await expect(aborted.resolve({ specifier: 'main.ts' })).rejects.toThrow();

    const successor = host.beginSession({
      mode: 'bundle',
      signal: new AbortController().signal,
      entryPath: 'main.ts',
    });
    await expect(successor.resolve({ specifier: 'main.ts' })).resolves.toMatchObject({ kind: 'project' });
  });
});
