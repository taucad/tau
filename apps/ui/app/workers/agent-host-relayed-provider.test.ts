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
  it('should relay pendingPaths, and know of none on a bridge that predates it', async () => {
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

    /* The relayed provider always carries the call; the port type leaves it optional. */
    const relayedPendingPaths = (bridge: RelayedBridge): ((paths: readonly string[]) => Promise<readonly string[]>) => {
      const relayed = createRelayedFileSystemProvider(bridge).pendingPaths;
      if (relayed === undefined) {
        throw new Error('The relayed provider does not carry pendingPaths.');
      }
      return relayed;
    };

    await expect(relayedPendingPaths(bridgeWith(pendingPaths))(['main.scad', 'models/part.step'])).resolves.toEqual([
      'models/part.step',
    ]);
    const old = vi.fn(async () => {
      throw new Error('Unknown method: pendingPaths');
    });
    await expect(relayedPendingPaths(bridgeWith(old))(['models/part.step'])).resolves.toEqual([]);
  });
});
