import { describe, expect, it, vi } from 'vitest';

type Handler = (...args: unknown[]) => void;
type HeadersReceivedHandler = (
  details: { responseHeaders?: Record<string, string[]> },
  callback: (result: unknown) => void,
) => void;

const listeners = new Map<string, Handler>();
const existingHeaderName = 'Existing';
const messageChannelMainExportName = 'MessageChannelMain';
const tauElectronDebugEnvName = 'TAU_ELECTRON_DEBUG';
const liveUtilities: Array<{
  readonly kill: ReturnType<typeof vi.fn>;
  readonly on: ReturnType<typeof vi.fn>;
  readonly postMessage: ReturnType<typeof vi.fn>;
}> = [];
const headerHandlers: HeadersReceivedHandler[] = [];

vi.mock('electron', () => {
  class MessageChannelMain {
    public readonly port1 = { id: 'renderer-port' };
    public readonly port2 = { id: 'utility-port' };
  }

  return {
    ipcMain: {
      on: vi.fn((channel: string, handler: Handler) => {
        listeners.set(channel, handler);
      }),
      off: vi.fn((channel: string, handler: Handler) => {
        if (listeners.get(channel) === handler) {
          listeners.delete(channel);
        }
      }),
    },
    [messageChannelMainExportName]: MessageChannelMain,
    session: {
      defaultSession: {
        webRequest: {
          onHeadersReceived: vi.fn((handler: HeadersReceivedHandler) => {
            headerHandlers.push(handler);
          }),
        },
      },
    },
    utilityProcess: {
      fork: vi.fn(() => {
        const utility = {
          kill: vi.fn(),
          on: vi.fn(),
          postMessage: vi.fn(),
        };
        liveUtilities.push(utility);
        return utility;
      }),
    },
  };
});

describe('Electron main runtime helpers', () => {
  it('installs cross-origin isolation headers while preserving existing headers', async () => {
    const { installElectronRuntimeHeaders } = await import('#electron/main.js');

    installElectronRuntimeHeaders();

    const result: unknown[] = [];
    headerHandlers[0]?.({ responseHeaders: { [existingHeaderName]: ['kept'] } }, (value) => result.push(value));

    expect(result).toEqual([
      {
        responseHeaders: {
          [existingHeaderName]: ['kept'],
          'Cross-Origin-Embedder-Policy': ['require-corp'],
          'Cross-Origin-Opener-Policy': ['same-origin'],
        },
      },
    ]);
  });

  it('registers the IPC bridge, relays ports, and tears down utility processes', async () => {
    const { registerElectronRuntimeMain } = await import('#electron/main.js');
    const senderOnce = vi.fn<(event: string, handler: () => void) => void>();
    const postMessage = vi.fn<(channel: string, payload: { readonly hostId: string }, ports: unknown[]) => void>();
    const sender = { once: senderOnce };

    const handle = registerElectronRuntimeMain({
      // eslint-disable-next-line @typescript-eslint/naming-convention -- Node defines this environment variable name.
      env: { NODE_ENV: 'test', [tauElectronDebugEnvName]: '1' },
      serviceName: 'tau-kernel-host',
      utilityEntry: '/dist/main/kernel-host.js',
    });

    listeners.get('taucad:connect-runtime')?.({
      sender,
      senderFrame: { postMessage },
    });

    expect(liveUtilities[0]?.postMessage).toHaveBeenCalledWith({ taucadRuntime: true }, [{ id: 'utility-port' }]);
    expect(postMessage).toHaveBeenCalledOnce();
    const [relayChannel, relayPayload, relayPorts] = postMessage.mock.calls[0]!;
    expect(relayChannel).toBe('taucad:connect-runtime:port');
    expect(relayPayload.hostId).toBeTypeOf('string');
    expect(relayPorts).toEqual([{ id: 'renderer-port' }]);
    expect(senderOnce).toHaveBeenCalledWith('destroyed', expect.any(Function));

    const [, destroyedHandler] = senderOnce.mock.calls[0] as ['destroyed', () => void];
    destroyedHandler();
    expect(liveUtilities[0]?.kill).toHaveBeenCalledTimes(1);

    handle.dispose();
    expect(listeners.has('taucad:connect-runtime')).toBe(false);
    expect(listeners.has('taucad:connect-runtime:release')).toBe(false);
    expect(liveUtilities[0]?.kill).toHaveBeenCalledTimes(1);
  });

  it('kills only the utility process addressed by a renderer release', async () => {
    const { registerElectronRuntimeMain } = await import('#electron/main.js');
    const sender = { once: vi.fn() };
    const postMessage = vi.fn();
    const handle = registerElectronRuntimeMain({ utilityEntry: '/dist/main/kernel-host.js' });

    listeners.get('taucad:connect-runtime')?.({ sender, senderFrame: { postMessage } });
    listeners.get('taucad:connect-runtime')?.({ sender, senderFrame: { postMessage } });
    const firstPayload = postMessage.mock.calls[0]?.[1] as { hostId: string };

    listeners.get('taucad:connect-runtime:release')?.(
      { sender },
      { hostId: firstPayload.hostId, reason: 'render-timeout' },
    );

    const first = liveUtilities.at(-2);
    const second = liveUtilities.at(-1);
    expect(first?.kill).toHaveBeenCalledOnce();
    expect(second?.kill).not.toHaveBeenCalled();
    handle.dispose();
    expect(first?.kill).toHaveBeenCalledOnce();
    expect(second?.kill).toHaveBeenCalledOnce();
  });
});
