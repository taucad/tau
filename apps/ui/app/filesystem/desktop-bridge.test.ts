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
const installShellGlobal = (options: { foreign?: boolean; slicers?: unknown } = {}) => {
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
  const retainAgentHost = vi.fn(async () => undefined);
  const releaseAgentHost = vi.fn(async () => undefined);
  const completeMachineBinding = vi.fn(
    async (_input: unknown): Promise<unknown> => ({ status: 'bound', machineId: 'bambu:sim' }),
  );
  const setAppIconTheme = vi.fn();
  let quitHandler: (() => void) | undefined;
  const onQuitAsk = vi.fn((handler: () => void) => {
    quitHandler = handler;
    return () => {
      if (quitHandler === handler) {
        quitHandler = undefined;
      }
    };
  });
  const isQuitReady = (): boolean => quitHandler !== undefined;
  vi.stubEnv('TAU_TARGET', 'desktop');
  vi.stubGlobal('tau', {
    relayTag,
    requestServicesPort,
    agentHost: { retain: retainAgentHost, release: releaseAgentHost },
    machines: { completeBinding: completeMachineBinding },
    nodeFs: { homeRoot },
    appIcon: { setTheme: setAppIconTheme },
    quit: { isReady: isQuitReady, onAsk: onQuitAsk, reportQuiesced: vi.fn() },
    dialog: { selectDirectory },
    ...(options.slicers === undefined ? {} : { slicers: options.slicers }),
  });
  return {
    port,
    requestServicesPort,
    retainAgentHost,
    releaseAgentHost,
    completeMachineBinding,
    selectDirectory,
    setAppIconTheme,
    isQuitReady,
    onQuitAsk,
  };
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

  it('should install and remove the renderer quit subscription through the preload surface', async () => {
    const { isQuitReady, onQuitAsk } = installShellGlobal();
    const { onDesktopQuitRequested } = await loadBridge();

    expect(isQuitReady()).toBe(false);
    const unsubscribe = onDesktopQuitRequested(vi.fn());
    expect(onQuitAsk).toHaveBeenCalledOnce();
    expect(isQuitReady()).toBe(true);

    unsubscribe();
    expect(isQuitReady()).toBe(false);
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

  it('should connect native GeoSpec comparisons through their dedicated concern', async () => {
    const { port, requestServicesPort } = installShellGlobal();
    const { desktopBridge } = await loadBridge();
    await expect(desktopBridge()?.geoSpecPerformance.connect()).resolves.toBe(port);
    expect(requestServicesPort).toHaveBeenCalledExactlyOnceWith(expect.any(String), 'geospecPerformance', undefined);
  });

  it('connects the agent host by naming the workspace root main must vouch for', async () => {
    const { port, requestServicesPort } = installShellGlobal();
    const { desktopBridge } = await loadBridge();

    /* Ruling C3's launcher 2: the far end is `serveAgentChannel(port, launcher)`
     * in the services utility, and the root is what main checks before minting
     * anything. Same listener-before-request order as `nodeFs`. */
    await expect(
      desktopBridge()?.agentHost.connect({
        workspaceRoot: '/Users/tester/Projects/widget',
        projectId: 'proj_widget',
        computeMode: 'durable',
      }),
    ).resolves.toBe(port);
    expect(requestServicesPort).toHaveBeenCalledExactlyOnceWith(expect.any(String), 'agentHost', {
      workspaceRoot: '/Users/tester/Projects/widget',
      projectId: 'proj_widget',
      computeMode: 'durable',
    });
  });

  it('should connect the default compiled host without an engine choice', async () => {
    const { port, requestServicesPort } = installShellGlobal();
    const { desktopBridge } = await loadBridge();

    await expect(
      desktopBridge()?.agentHost.connect({
        workspaceRoot: '/Users/tester/Projects/widget',
        projectId: 'proj_widget',
        computeMode: 'durable',
      }),
    ).resolves.toBe(port);
    expect(requestServicesPort).toHaveBeenCalledExactlyOnceWith(expect.any(String), 'agentHost', {
      workspaceRoot: '/Users/tester/Projects/widget',
      projectId: 'proj_widget',
      computeMode: 'durable',
    });
  });

  it('should connect machines without naming a root, since printers belong to the computer', async () => {
    const { port, requestServicesPort } = installShellGlobal();
    const { desktopBridge } = await loadBridge();

    await expect(desktopBridge()?.machines.connect()).resolves.toBe(port);
    expect(requestServicesPort).toHaveBeenCalledOnce();
    const [, concern, context] = requestServicesPort.mock.calls[0] as [string, string, unknown];
    expect(concern).toBe('machines');
    expect(context).toBeUndefined();
  });

  it('should complete a binding through preload and accept only the host outcome shape', async () => {
    const { completeMachineBinding } = installShellGlobal();
    const { desktopBridge } = await loadBridge();

    await expect(
      desktopBridge()?.machines.completeBinding({ ceremonyId: 'ceremony-1', address: '10.0.0.5', accessCode: '1234' }),
    ).resolves.toEqual({ status: 'bound', machineId: 'bambu:sim' });
    expect(completeMachineBinding).toHaveBeenCalledExactlyOnceWith({
      ceremonyId: 'ceremony-1',
      address: '10.0.0.5',
      accessCode: '1234',
    });

    completeMachineBinding.mockResolvedValueOnce({ status: 'bound' });
    await expect(desktopBridge()?.machines.completeBinding({ ceremonyId: 'ceremony-2' })).rejects.toThrow();
  });

  it("should reject a failed ceremony with the host's message and typed code", async () => {
    const { completeMachineBinding } = installShellGlobal();
    const { desktopBridge } = await loadBridge();
    const message = 'The machine needs its access code.';

    completeMachineBinding.mockResolvedValueOnce({ status: 'failed', code: 'MACHINE_CREDENTIAL_REQUIRED', message });
    const coded = await desktopBridge()
      ?.machines.completeBinding({ ceremonyId: 'ceremony-3' })
      .catch((error: unknown) => error);
    expect(coded).toBeInstanceOf(Error);
    expect(coded).toMatchObject({ message, code: 'MACHINE_CREDENTIAL_REQUIRED' });

    // With no code, the message alone.
    completeMachineBinding.mockResolvedValueOnce({ status: 'failed', message });
    const plain = await desktopBridge()
      ?.machines.completeBinding({ ceremonyId: 'ceremony-4' })
      .catch((error: unknown) => error);
    expect(plain).toMatchObject({ message });
    expect(plain).not.toHaveProperty('code');
  });

  it('forwards project-session retain and release to the preload surface', async () => {
    const { retainAgentHost, releaseAgentHost } = installShellGlobal();
    const { desktopBridge } = await loadBridge();
    const agentHost = desktopBridge()?.agentHost;

    await agentHost?.retain('/projects/widget', 'project-widget', 'window-1');
    await agentHost?.release('/projects/widget', 'project-widget', 'window-1');

    expect(retainAgentHost).toHaveBeenCalledExactlyOnceWith('/projects/widget', 'project-widget', 'window-1');
    expect(releaseAgentHost).toHaveBeenCalledExactlyOnceWith('/projects/widget', 'project-widget', 'window-1');
  });

  it('gives each connect its own request id', async () => {
    const { requestServicesPort } = installShellGlobal();
    const { desktopBridge } = await loadBridge();
    const bridge = desktopBridge();

    await Promise.all([
      bridge?.nodeFs.connect(),
      bridge?.agentHost.connect({
        workspaceRoot: '/Users/tester/Projects/widget',
        projectId: 'proj_widget',
        computeMode: 'off',
      }),
    ]);

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

  describe('Bambu Studio', () => {
    const catalog = { installation: {}, printers: [], processes: [], filaments: [], plates: [] };
    const installBambuStudio = () => {
      const bambuStudio = {
        status: vi.fn(async () => ({ available: true, version: '02.08.02.61', executable: '/opt/BambuStudio' })),
        catalog: vi.fn(async (_filter?: unknown): Promise<unknown> => ({ ok: true, value: catalog })),
        resolveSelection: vi.fn(
          async (_input?: unknown): Promise<unknown> => ({
            ok: false,
            error: { code: 'BAMBU_STUDIO_PRESET_NOT_FOUND', message: 'No printer preset for "Z9".' },
          }),
        ),
        settings: vi.fn(
          async (_input?: unknown): Promise<unknown> => ({
            ok: false,
            error: { code: 'BAMBU_STUDIO_UNAVAILABLE', message: 'Bambu Studio was not found.' },
          }),
        ),
      };
      installShellGlobal({ slicers: { bambuStudio } });
      return bambuStudio;
    };

    it('should be absent when the shell exposes no slicers', async () => {
      installShellGlobal();
      const { desktopBridge } = await loadBridge();

      expect(desktopBridge()?.slicers).toBeUndefined();
    });

    it('should report status and unwrap answers from main', async () => {
      const calls = installBambuStudio();
      const { desktopBridge } = await loadBridge();
      const bambuStudio = desktopBridge()?.slicers?.bambuStudio;

      await expect(bambuStudio?.status()).resolves.toEqual({
        available: true,
        version: '02.08.02.61',
        executable: '/opt/BambuStudio',
      });
      await expect(bambuStudio?.catalog({ model: 'X1C' })).resolves.toBe(catalog);
      expect(calls.catalog).toHaveBeenCalledExactlyOnceWith({ model: 'X1C' });
    });

    it('should reject a refusal as an error that keeps the engine code', async () => {
      installBambuStudio();
      const { desktopBridge } = await loadBridge();
      const bambuStudio = desktopBridge()?.slicers?.bambuStudio;

      const refusal = bambuStudio?.resolveSelection({ hints: { model: 'Z9', materials: [] } });
      await expect(refusal).rejects.toThrow('No printer preset for "Z9".');
      await expect(refusal).rejects.toMatchObject({ name: 'BambuStudioError', code: 'BAMBU_STUDIO_PRESET_NOT_FOUND' });
      await expect(bambuStudio?.settings({ printer: 'p', process: 'q', filaments: [] })).rejects.toMatchObject({
        code: 'BAMBU_STUDIO_UNAVAILABLE',
      });
    });
  });
});
