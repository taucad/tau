/**
 * A Node host's regex grep (charter D14, W10): the pattern runs on a
 * `worker_threads` matcher, so it answers rather than `ENOTSUP`, and a
 * catastrophic pattern is stopped with `ETIMEDOUT` instead of wedging the host.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { createFileSystemBridgePort, createFileSystemBridgeProxy } from '@taucad/fs-bridge';
import type { FileSystemBridgeRuntimeService } from '@taucad/fs-bridge';
import type { FileStatEntry } from '@taucad/types';
import { nodeGrepMatcherWorker } from '#filesystem/node-grep-matcher-worker.js';

const encoder = new TextEncoder();

const files: Record<string, string> = {
  'lib/a.ts': 'const needle = 1;\nconst other = 2;\n',
  'lib/b.ts': 'neeeedle here\n',
  'catastrophic.txt': `${'a'.repeat(40)}!\n`,
};

const row = (path: string): FileStatEntry => ({
  path,
  name: path.split('/').at(-1)!,
  type: 'file',
  size: files[path]!.length,
  mtimeMs: 0,
  contentKind: 'text',
  lineCount: files[path]!.split('\n').length,
});

type GrepProxy = {
  readonly ready: Promise<unknown>;
  grep(
    pattern: string,
    options?: Record<string, unknown>,
  ): Promise<{ readonly matches: ReadonlyArray<{ readonly path: string }> }>;
  dispose(): void;
};

const opened: GrepProxy[] = [];

afterEach(() => {
  for (const proxy of opened.splice(0)) {
    proxy.dispose();
  }
});

const open = async (): Promise<GrepProxy> => {
  const handlers = {
    capabilities: { persistent: false, writable: false, quotaBased: false, durability: 'ephemeral' },
    readFile: async (path: string) => encoder.encode(files[path] ?? ''),
    statTree: async () => Object.keys(files).map((path) => row(path)),
  };
  const proxy = createFileSystemBridgeProxy(
    createFileSystemBridgePort(handlers as unknown as FileSystemBridgeRuntimeService, {
      grepMatcherWorker: nodeGrepMatcherWorker,
    }),
  ) as unknown as GrepProxy;
  opened.push(proxy);
  await proxy.ready;
  return proxy;
};

describe('nodeGrepMatcherWorker', () => {
  it('answers a regex grep on a Node host', async () => {
    const proxy = await open();
    const result = await proxy.grep('ne+dle');
    expect(result.matches.map((match) => match.path).toSorted()).toEqual(['lib/a.ts', 'lib/b.ts']);
  });

  it('stops a catastrophic pattern with ETIMEDOUT', async () => {
    const proxy = await open();
    await expect(proxy.grep('^(a+)+$')).rejects.toMatchObject({ code: 'ETIMEDOUT' });
  }, 15_000);
});
