import { createProviderRpcFileSystem } from '@taucad/agent-tools/registry';
import { ResourceQueue } from '@taucad/filesystem';
import { composeView } from '@taucad/filesystem/composed-view';
import { tauPathPolicy } from '@taucad/filesystem/path-registry';
import { describe, expect, it, vi } from 'vitest';
import { createRelayedFileSystemProvider } from '#workers/agent-host.impl.js';

type RelayedBridge = Parameters<typeof createRelayedFileSystemProvider>[0];

/*
 * W0.18, browser leg. The agent's conditional write compares and writes in one
 * step only through a provider's `writeFileChecked`; the relayed provider did
 * not pass it through, so browser chat still read, compared and wrote in
 * separate calls and a person's edit between them was overwritten.
 */
describe('createRelayedFileSystemProvider', () => {
  it('should relay the atomic checked write to the workspace bridge', async () => {
    const result = { status: 'committed', path: 'main.scad', content: new Uint8Array([1]) };
    const writeFileChecked = vi.fn(async () => result);
    const members: Record<PropertyKey, unknown> = {
      hello: { payload: { state: 'ready', capabilities: {} } },
      writeFileChecked,
    };
    // Every other bridge method is a stub; this row reads only the checked write.
    const bridge = new Proxy(members, {
      get: (target, property) => target[property] ?? vi.fn(),
    }) as unknown as RelayedBridge;
    const input = { path: 'main.scad', data: new Uint8Array([1]), preconditions: [] };

    const provider = createRelayedFileSystemProvider(bridge);

    await expect(provider.writeFileChecked?.(input)).resolves.toBe(result);
    expect(writeFileChecked).toHaveBeenCalledWith(input);
  });

  /* A bridge served over a bare provider has no checked write; its server's
   * `Unknown method` ran nothing, and the tool falls back only on this code. */
  it('should refuse a checked write the bridge does not serve as unsupported', async () => {
    const members: Record<PropertyKey, unknown> = {
      hello: { payload: { state: 'ready', capabilities: {} } },
      writeFileChecked: vi.fn(async () => {
        throw new Error('Unknown method: writeFileChecked');
      }),
    };
    const bridge = new Proxy(members, {
      get: (target, property) => target[property] ?? vi.fn(),
    }) as unknown as RelayedBridge;

    const provider = createRelayedFileSystemProvider(bridge);

    await expect(
      provider.writeFileChecked?.({ path: 'main.scad', data: new Uint8Array([1]), preconditions: [] }),
    ).rejects.toMatchObject({ code: 'CHECKED_WRITE_UNSUPPORTED', applicationState: 'known-not-applied' });
  });

  /* D9: the agent's grep and guard learn pending files from the root's index, never by a read that would fetch. */
  it('should relay pendingPaths, and say a bridge that predates it cannot answer', async () => {
    const pendingPaths = vi.fn(async () => ['models/part.step']);
    const bridgeWith = (call: unknown): RelayedBridge =>
      new Proxy(
        { hello: { payload: { state: 'ready', capabilities: {} } }, pendingPaths: call } as Record<
          PropertyKey,
          unknown
        >,
        {
          get: (target, property) => target[property] ?? vi.fn(),
        },
      ) as unknown as RelayedBridge;

    const relayedPendingPaths = (bridge: RelayedBridge): ((paths: readonly string[]) => Promise<readonly string[]>) =>
      createRelayedFileSystemProvider(bridge).pendingPaths;

    await expect(relayedPendingPaths(bridgeWith(pendingPaths))(['main.scad', 'models/part.step'])).resolves.toEqual([
      'models/part.step',
    ]);
    const old = vi.fn(async () => {
      throw new Error('Unknown method: pendingPaths');
    });
    /* Not "none": the guard then checks the file's bytes, which a pending read refuses. */
    await expect(relayedPendingPaths(bridgeWith(old))(['models/part.step'])).rejects.toMatchObject({
      code: 'PENDING_PATHS_UNSUPPORTED',
    });
  });

  /* D13: the agent's grep and glob read the root's index in one call; the view's mask, which cannot cross the wire, applies here. */
  it('should relay statTree with the mask applied to each row and its directories', async () => {
    const rows = [
      { path: 'main.ts', name: 'main.ts', type: 'file', size: 1, mtimeMs: 1 },
      { path: '.tau/project.json', name: 'project.json', type: 'file', size: 1, mtimeMs: 1 },
      { path: 'src/hidden/a.ts', name: 'a.ts', type: 'file', size: 1, mtimeMs: 1 },
    ];
    const statTree = vi.fn(async () => rows);
    const bridge = new Proxy(
      { hello: { payload: { state: 'ready', capabilities: {} } }, statTree } as Record<PropertyKey, unknown>,
      { get: (target, property) => target[property] ?? vi.fn() },
    ) as unknown as RelayedBridge;
    const admits = (path: string, kind: 'file' | 'dir'): boolean =>
      path !== '.tau/project.json' && !(kind === 'dir' && path === 'src/hidden');

    const listed = await createRelayedFileSystemProvider(bridge).statTree('', { admits });

    expect(listed.map((row) => row.path)).toEqual(['main.ts']);
    expect(statTree).toHaveBeenCalledWith('', undefined);
  });

  /* A bridge whose far end holds no index: the agent's search walks instead. */
  it('should refuse statTree and facts as unsupported where the bridge serves no index', async () => {
    const unknown = (method: string) =>
      vi.fn(async () => {
        throw new Error(`Unknown method: ${method}`);
      });
    const bridge = new Proxy(
      {
        hello: { payload: { state: 'ready', capabilities: {} } },
        statTree: unknown('statTree'),
        facts: unknown('facts'),
      } as Record<PropertyKey, unknown>,
      { get: (target, property) => target[property] ?? vi.fn() },
    ) as unknown as RelayedBridge;
    const provider = createRelayedFileSystemProvider(bridge);

    await expect(provider.statTree('')).rejects.toMatchObject({ code: 'ENOTSUP' });
    await expect(provider.facts(['main.ts'])).rejects.toMatchObject({ code: 'ENOTSUP' });
  });

  /* The relay always has `facts`, but only asking tells it the far end has no index: the view then measures itself. */
  it('should let a view over a relay with no index measure facts itself, so the agent stat still answers', async () => {
    const text = new TextEncoder().encode('one\ntwo');
    const unknown = (method: string) =>
      vi.fn(async () => {
        throw new Error(`Unknown method: ${method}`);
      });
    const bridge = new Proxy(
      {
        hello: { payload: { state: 'ready', capabilities: {} } },
        statTree: unknown('statTree'),
        facts: unknown('facts'),
        stat: vi.fn(async () => ({ type: 'file', size: text.byteLength, mtimeMs: 1 })),
        readFile: vi.fn(async () => new Uint8Array(text)),
      } as Record<PropertyKey, unknown>,
      { get: (target, property) => target[property] ?? vi.fn() },
    ) as unknown as RelayedBridge;
    const view = composeView(
      { filesystem: createRelayedFileSystemProvider(bridge) },
      { consumer: 'agent', policy: tauPathPolicy },
    );

    await expect(view.facts(['main.ts'], { lineCount: true })).resolves.toEqual(
      new Map([['main.ts', { contentKind: 'text', lineCount: 2 }]]),
    );
    const rpc = createProviderRpcFileSystem({ provider: view, mutations: new ResourceQueue() });
    await expect(rpc.stat('main.ts')).resolves.toMatchObject({ isDirectory: false, contentKind: 'text', lineCount: 2 });
  });
});
