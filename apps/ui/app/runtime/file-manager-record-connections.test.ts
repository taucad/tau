import { describe, expect, it, vi } from 'vitest';
import type { FileSystemBridgeConnection } from '@taucad/fs-bridge';
import type { FileManagerRef } from '#machines/file-manager.machine.types.js';
import { recordConnectionsOf } from '#runtime/file-manager-record-connections.js';
import type { RecordBridgeOpener } from '#runtime/file-manager-record-connections.js';

/* A connection's handshake is the bridge's own subject: here each proxy is ready at once and answers `stat`. */
vi.mock('@taucad/fs-bridge', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  createFileSystemBridgeProxy: () => ({
    ready: Promise.resolve(),
    dispose: () => undefined,
    stat: async () => ({ type: 'file', size: 0, mtimeMs: 0 }),
  }),
}));

describe('record connections', () => {
  /* Fast path FW4: a background record client's connections declare the lane when they open. */
  it('should open a background client’s connection with the lane, and an interactive one without it', async () => {
    const connection: FileSystemBridgeConnection = { port: new MessageChannel().port1, dispose: () => undefined };
    const opener = vi.fn<RecordBridgeOpener>(() => connection);
    const fallback = vi.fn<RecordBridgeOpener>(() => connection);
    const connections = recordConnectionsOf({} as FileManagerRef, fallback, async () => undefined);
    const owner = connections.ownerFor(opener);

    await owner.files('working-copy', { lane: 'background' }).stat('/projects/proj_a/tau.json');
    await owner.files('working-copy').stat('/projects/proj_a/tau.json');

    expect(opener.mock.calls).toEqual([
      ['/projects/proj_a', 'working-copy', { lane: 'background' }],
      ['/projects/proj_a', 'working-copy'],
    ]);
    expect(fallback).not.toHaveBeenCalled();
    owner.dispose();
  });
});
