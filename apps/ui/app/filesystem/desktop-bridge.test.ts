// @vitest-environment jsdom

/**
 * The renderer half of the shell seam: `desktopBridge()` builds the
 * `DesktopBridge` contract out of the plain values `contextBridge` can carry,
 * and `connect()` claims the relayed `MessagePort` through the runtime's one
 * relay-acceptance guard. The preload half is `apps/desktop/src/preload`.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as DesktopBridgeModule from '#filesystem/desktop-bridge.js';

const homeRoot = '/Users/tester/Library/Application Support/Tau/home';
const relayTag = 'tau:services-port';

/**
 * Stub the object preload exposes, and answer `requestServicesPort` the way
 * main plus `relayElectronPorts` do: a same-window `message` carrying the port.
 *
 * @param options - `foreign` posts the relay from another frame instead.
 * @returns The stub's captured calls and the port it relays.
 */
const installShellGlobal = (options: { foreign?: boolean } = {}) => {
  const port = new MessageChannel().port1;
  const requestServicesPort = vi.fn((requestId: string, _concern: string, _context?: Record<string, string>) => {
    globalThis.dispatchEvent(
      new MessageEvent('message', {
        data: { taucadRelay: relayTag, requestId },
        origin: globalThis.location.origin,
        ports: [port],
        /* A `MessagePort` is a legal `MessageEvent.source` and is emphatically
         * not this window — the cheapest stand-in for a foreign frame. */
        source: options.foreign ? new MessageChannel().port2 : globalThis.window,
      }),
    );
  });
  const selectDirectory = vi.fn(async () => '/Users/tester/Projects');
  const setAppIconTheme = vi.fn();
  vi.stubEnv('TAU_TARGET', 'desktop');
  vi.stubGlobal('tau', {
    relayTag,
    requestServicesPort,
    nodeFs: { homeRoot },
    appIcon: { setTheme: setAppIconTheme },
    dialog: { selectDirectory },
  });
  return { port, requestServicesPort, selectDirectory, setAppIconTheme };
};

/** Fresh module graph per case: the build-target flag is read once at module scope. */
const loadBridge = async (): Promise<typeof DesktopBridgeModule> => {
  vi.resetModules();
  return import('#filesystem/desktop-bridge.js');
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('desktopBridge', () => {
  it('is undefined on the web build', async () => {
    const { desktopBridge, isDesktopTarget } = await loadBridge();
    expect(isDesktopTarget).toBe(false);
    expect(desktopBridge()).toBeUndefined();
  });

  it('builds the contract from the preload-exposed object and memoises it', async () => {
    const { selectDirectory } = installShellGlobal();
    const { desktopBridge, nodeHomeRoot } = await loadBridge();

    const bridge = desktopBridge();
    expect(bridge?.nodeFs.homeRoot).toBe(homeRoot);
    expect(nodeHomeRoot()).toBe(homeRoot);
    expect(desktopBridge()).toBe(bridge);

    await expect(bridge?.dialog.selectDirectory({ id: 'projects' })).resolves.toBe('/Users/tester/Projects');
    expect(selectDirectory).toHaveBeenCalledExactlyOnceWith({ id: 'projects' });
  });

  it('forwards the resolved local theme to the native app icon', async () => {
    const { setAppIconTheme } = installShellGlobal();
    const { setDesktopAppIconTheme } = await loadBridge();

    setDesktopAppIconTheme('dark');

    expect(setAppIconTheme).toHaveBeenCalledExactlyOnceWith('dark');
  });

  it('connects by listening for the relay before asking for the port', async () => {
    const { port, requestServicesPort } = installShellGlobal();
    const { desktopBridge } = await loadBridge();

    /* The stub relays synchronously inside `requestServicesPort`, so a
     * connect that asked before listening would never see its own port. */
    await expect(desktopBridge()?.nodeFs.connect()).resolves.toBe(port);
    const [requestId, concern] = requestServicesPort.mock.calls[0] as [string, string];
    expect(concern).toBe('nodeFs');
    expect(requestId).toEqual(expect.any(String));
  });

  it('connects the agent host by naming the workspace root main must vouch for', async () => {
    const { port, requestServicesPort } = installShellGlobal();
    const { desktopBridge } = await loadBridge();

    /* Ruling C3's launcher 2: the far end is `serveAgentChannel(port, launcher)`
     * in the services utility, and the root is what main checks before minting
     * anything. Same listener-before-request order as `nodeFs`. */
    await expect(desktopBridge()?.agentHost.connect('/Users/tester/Projects/widget')).resolves.toBe(port);
    expect(requestServicesPort).toHaveBeenCalledExactlyOnceWith(expect.any(String), 'agentHost', {
      workspaceRoot: '/Users/tester/Projects/widget',
    });
  });

  it('gives each connect its own request id', async () => {
    const { requestServicesPort } = installShellGlobal();
    const { desktopBridge } = await loadBridge();
    const bridge = desktopBridge();

    await Promise.all([bridge?.nodeFs.connect(), bridge?.agentHost.connect('/Users/tester/Projects/widget')]);

    const [first] = requestServicesPort.mock.calls[0] as [string, string];
    const [second] = requestServicesPort.mock.calls[1] as [string, string];
    expect(first).not.toBe(second);
  });

  it('ignores a relay posted by another frame', async () => {
    installShellGlobal({ foreign: true });
    const { desktopBridge } = await loadBridge();

    const settlement = await Promise.race([
      desktopBridge()
        ?.nodeFs.connect()
        .then(() => 'resolved'),
      new Promise((resolve) => {
        setTimeout(resolve, 0);
      }).then(() => 'pending'),
    ]);

    expect(settlement).toBe('pending');
  });
});
