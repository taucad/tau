import { describe, expect, it, vi } from 'vitest';
import type { TauViewerListFilesResult } from '@taucad/mcp/viewer-protocol';
import type { HostBridge } from '#app/host-bridge.js';
import { createFilesSource } from '#app/sources/files-source.js';

const listing = (filesVersion: number, names: readonly string[]): TauViewerListFilesResult => ({
  entries: names.map((name) => ({ name, path: name, isFolder: false, size: 1, renderable: name.endsWith('.ts') })),
  truncated: false,
  filesVersion,
});

const bridgeOf = (answer: HostBridge['callTool']) => {
  const callTool = vi.fn<HostBridge['callTool']>(answer);
  return { bridge: { callTool } as unknown as HostBridge, callTool };
};

describe('createFilesSource', () => {
  it("should list a folder and search in the shown model's project", async () => {
    const { bridge, callTool } = bridgeOf(async () => listing(1, ['main.ts', 'README.md']));
    const source = createFilesSource(bridge, { modelId: () => 'model-1', openFile: vi.fn() });

    expect(await source.loadDirectory('')).toEqual(listing(1, ['main.ts', 'README.md']).entries);
    await source.searchFiles('main');

    expect(callTool.mock.calls).toEqual([
      ['app_list_files', { modelId: 'model-1', path: '' }],
      ['app_list_files', { modelId: 'model-1', query: 'main' }],
    ]);
  });

  it('should tell the pane to list again only when a sync carries a newer filesVersion', async () => {
    const { bridge } = bridgeOf(async () => listing(3, ['main.ts']));
    const source = createFilesSource(bridge, { modelId: () => undefined, openFile: vi.fn() });
    const changed = vi.fn();
    const stop = source.subscribe?.(changed);

    /* Before a listing, a sync's version is only remembered. */
    source.setFilesVersion(2);
    await source.loadDirectory('');
    source.setFilesVersion(3);
    expect(changed).not.toHaveBeenCalled();

    source.setFilesVersion(4);
    expect(changed).toHaveBeenCalledTimes(1);
    stop?.();
    source.setFilesVersion(5);
    expect(changed).toHaveBeenCalledTimes(1);
  });

  it('should say why a listing failed', async () => {
    const { bridge } = bridgeOf(async () => ({ unexpected: true }));
    const source = createFilesSource(bridge, { modelId: () => undefined, openFile: vi.fn() });

    await expect(source.loadDirectory('')).rejects.toThrow('This Tau server did not list the project files.');
  });
});
