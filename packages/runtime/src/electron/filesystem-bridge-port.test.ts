/**
 * The Electron utility's filesystem bridge runs a caller's regex grep on a
 * `worker_threads` matcher by default (charter D14, W10): a utility process
 * has no web `Worker`, and a regex grep there must answer, never `ENOTSUP`.
 */
import { MessageChannel } from 'node:worker_threads';

import { describe, expect, it } from 'vitest';
import { createTransferredFileSystemBridgeProxy } from '@taucad/fs-bridge';
import type { FileSystemBridgeRuntimeService } from '@taucad/fs-bridge';
import type { MessagePortLike, MessagePortMainLike } from '@taucad/rpc';
import type { FileStatEntry } from '@taucad/types';
import { serveElectronFileSystemBridgePort } from '#electron/filesystem-bridge-port.js';

const content = 'const needle = 1;\n';

const row: FileStatEntry = {
  path: 'a.ts',
  name: 'a.ts',
  type: 'file',
  size: content.length,
  mtimeMs: 0,
  contentKind: 'text',
  lineCount: 2,
};

const handlers = {
  capabilities: { persistent: false, writable: false, quotaBased: false, durability: 'ephemeral' },
  readFile: async () => new TextEncoder().encode(content),
  statTree: async () => [row],
} as unknown as FileSystemBridgeRuntimeService;

type GrepProxy = {
  readonly ready: Promise<unknown>;
  grep(pattern: string): Promise<{ readonly matches: ReadonlyArray<{ readonly path: string }> }>;
  dispose(): void;
};

describe('serveElectronFileSystemBridgePort', () => {
  it('answers a regex grep on its worker_threads matcher', async () => {
    const ports = new MessageChannel();
    const server = serveElectronFileSystemBridgePort(handlers, ports.port1 as unknown as MessagePortMainLike);
    const proxy = createTransferredFileSystemBridgeProxy(
      ports.port2 as unknown as MessagePortLike,
    ) as unknown as GrepProxy;
    try {
      await proxy.ready;
      const result = await proxy.grep('ne+dle');
      expect(result.matches.map((match) => match.path)).toEqual(['a.ts']);
    } finally {
      proxy.dispose();
      server.dispose();
    }
  });
});
