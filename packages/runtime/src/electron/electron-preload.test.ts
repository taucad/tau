import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type IpcRelayListener = (event: { ports: readonly unknown[] }, payload: unknown) => void;

const tauElectronDebugEnvName = 'TAU_ELECTRON_DEBUG';
const exposedGlobals = new Map<string, unknown>();
const ipcListeners = new Map<string, IpcRelayListener>();

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: vi.fn((name: string, value: unknown) => {
      exposedGlobals.set(name, value);
    }),
  },
  ipcRenderer: {
    on: vi.fn((channel: string, listener: IpcRelayListener) => {
      ipcListeners.set(channel, listener);
    }),
    send: vi.fn(),
  },
}));

describe('Electron preload bridge', () => {
  beforeEach(() => {
    exposedGlobals.clear();
    ipcListeners.clear();
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('exposes both globals under a sandbox-shaped process', async () => {
    /* Exactly what Electron's sandboxed bootstrap hands a preload: an
     * object carrying `env` and nothing else the preload may reach for. */
    vi.stubGlobal('process', { env: { [tauElectronDebugEnvName]: '1' } });
    const { exposeElectronRuntime } = await import('#electron/preload.js');

    const bridge = exposeElectronRuntime();

    expect(exposedGlobals.get('__TAU_ELECTRON_DEBUG')).toBe(true);
    expect(exposedGlobals.get('taucad')).toBe(bridge);
    expect([...ipcListeners.keys()]).toEqual(['taucad:connect-runtime:port', 'taucad:connect-runtime:host-exit']);
    expect(bridge.relayTag).toEqual({
      hostExit: 'taucad:connect-runtime:host-exit',
      runtime: 'taucad:connect-runtime:port',
    });
  });

  it('relays the runtime port to this document only', async () => {
    vi.stubGlobal('process', { env: {} });
    const postMessage = vi.fn();
    vi.stubGlobal('window', { postMessage });
    const { exposeElectronRuntime } = await import('#electron/preload.js');
    exposeElectronRuntime();
    const port = { id: 'renderer-port' };

    ipcListeners.get('taucad:connect-runtime:port')?.({ ports: [port] }, { hostId: 'host-1' });
    ipcListeners.get('taucad:connect-runtime:host-exit')?.({ ports: [] }, { hostId: 'host-1', exitCode: 7 });

    expect(postMessage.mock.calls).toEqual([
      [{ taucadRelay: 'taucad:connect-runtime:port', hostId: 'host-1' }, '/', [port]],
      [{ taucadRelay: 'taucad:connect-runtime:host-exit', hostId: 'host-1', exitCode: 7 }, '/'],
    ]);
  });

  it('does not read process at module evaluation', async () => {
    /* `process` cannot simply be stubbed away: vitest's own module runner reads
     * `process.platform` while importing, so the observation is made on an
     * instrumented `env` accessor rather than on an absent global. */
    const readEnv = vi.fn(() => ({}));
    vi.stubGlobal('process', {
      ...process,
      get env() {
        return readEnv();
      },
    });

    const { exposeElectronRuntime } = await import('#electron/preload.js');
    expect(readEnv).not.toHaveBeenCalled();

    vi.stubGlobal('window', { postMessage: vi.fn() });
    exposeElectronRuntime();
    expect(readEnv).toHaveBeenCalled();
  });
});
