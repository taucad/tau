import type { IpcMain } from 'electron';
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

/**
 * Drive one `requestRuntimePort` IPC message into the registered broker.
 *
 * @param sender - Renderer `webContents` stub used for lifecycle listeners.
 * @param senderFrame - Frame stub that receives the relayed port and host-exit messages.
 * @returns The frame stub, so a caller can observe what the broker posted to it.
 */
const requestRuntimePort = <Frame extends { postMessage: ReturnType<typeof vi.fn> }>(
  sender: { once: ReturnType<typeof vi.fn> },
  senderFrame?: Frame,
): Frame => {
  const frame = senderFrame ?? ({ postMessage: vi.fn() } as unknown as Frame);
  listeners.get('taucad:connect-runtime')?.({ sender, senderFrame: frame });
  return frame;
};

/**
 * Read the `'exit'` listener the broker installed on the most recent utility.
 *
 * @returns The exit handler Electron would invoke with the process exit code.
 */
const lastUtilityExitHandler = (): ((code: number) => void) => {
  const utility = liveUtilities.at(-1);
  const call = utility?.on.mock.calls.find(([event]) => event === 'exit');
  if (!call) {
    throw new Error('The broker registered no utility exit listener');
  }
  return call[1] as (code: number) => void;
};

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
  it('releases the utility when the renderer process is gone', async () => {
    const { registerElectronRuntimeMain } = await import('#electron/main.js');
    const senderOnce = vi.fn<(event: string, handler: () => void) => void>();
    const handle = registerElectronRuntimeMain({ utilityEntry: '/dist/main/kernel-host.js' });

    requestRuntimePort({ once: senderOnce });

    expect(senderOnce).toHaveBeenCalledWith('render-process-gone', expect.any(Function));
    const utility = liveUtilities.at(-1);
    const handlerFor = (event: string): (() => void) => senderOnce.mock.calls.find(([name]) => name === event)![1];

    handlerFor('render-process-gone')();
    expect(utility?.kill).toHaveBeenCalledTimes(1);

    handlerFor('destroyed')();
    expect(utility?.kill).toHaveBeenCalledTimes(1);

    handle.dispose();
  });

  it('forwards execArgv to the utility fork and omits the key when unset', async () => {
    const { registerElectronRuntimeMain } = await import('#electron/main.js');
    const { utilityProcess } = await import('electron');
    const fork = vi.mocked(utilityProcess.fork);
    const execArgv = ['--max-old-space-size=8192'];

    const tuned = registerElectronRuntimeMain({ execArgv, utilityEntry: '/dist/main/kernel-host.js' });
    requestRuntimePort({ once: vi.fn() });
    const tunedOptions = fork.mock.calls.at(-1)?.[2];
    expect(tunedOptions).toMatchObject({ execArgv: ['--max-old-space-size=8192'] });
    expect(tunedOptions?.execArgv).not.toBe(execArgv);
    tuned.dispose();

    const untuned = registerElectronRuntimeMain({ utilityEntry: '/dist/main/kernel-host.js' });
    requestRuntimePort({ once: vi.fn() });
    expect(fork.mock.calls.at(-1)?.[2]).not.toHaveProperty('execArgv');
    untuned.dispose();
  });

  it('honours a filtering ipcMain view', async () => {
    const { registerElectronRuntimeMain } = await import('#electron/main.js');
    const { utilityProcess } = await import('electron');
    const fork = vi.mocked(utilityProcess.fork);
    const forkCallsBefore = fork.mock.calls.length;
    const allowedSender = { once: vi.fn() };
    const gated = new Map<string, Handler>();
    const filteringIpcMain = {
      on: vi.fn((channel: string, handler: Handler) => {
        gated.set(channel, (event) => {
          if ((event as { sender?: unknown }).sender !== allowedSender) {
            return;
          }
          handler(event);
        });
      }),
      off: vi.fn((channel: string) => {
        gated.delete(channel);
      }),
    };

    const handle = registerElectronRuntimeMain({
      ipcMain: filteringIpcMain as unknown as IpcMain,
      utilityEntry: '/dist/main/kernel-host.js',
    });
    gated.get('taucad:connect-runtime')?.({ sender: { once: vi.fn() }, senderFrame: { postMessage: vi.fn() } });

    expect(fork).toHaveBeenCalledTimes(forkCallsBefore);

    gated.get('taucad:connect-runtime')?.({ sender: allowedSender, senderFrame: { postMessage: vi.fn() } });
    expect(fork).toHaveBeenCalledTimes(forkCallsBefore + 1);
    handle.dispose();
  });

  it('relays the utility exit code to the owning renderer frame', async () => {
    const { registerElectronRuntimeMain } = await import('#electron/main.js');
    const postMessage = vi.fn<(channel: string, payload: { readonly hostId: string }, ports?: unknown[]) => void>();
    const handle = registerElectronRuntimeMain({ utilityEntry: '/dist/main/kernel-host.js' });

    const senderFrame = requestRuntimePort({ once: vi.fn() }, { postMessage });
    const { hostId } = senderFrame.postMessage.mock.calls[0]![1] as { hostId: string };

    lastUtilityExitHandler()(7);

    expect(postMessage).toHaveBeenLastCalledWith('taucad:connect-runtime:host-exit', { hostId, exitCode: 7 });
    handle.dispose();
  });

  it('survives a destroyed frame on utility exit', async () => {
    const { registerElectronRuntimeMain } = await import('#electron/main.js');
    const onError = vi.fn();
    const postMessage = vi.fn((channel: string) => {
      if (channel.endsWith(':host-exit')) {
        throw new Error('Render frame was disposed before host-exit');
      }
    });
    const handle = registerElectronRuntimeMain({ onError, utilityEntry: '/dist/main/kernel-host.js' });

    requestRuntimePort({ once: vi.fn() }, { postMessage });
    const utility = liveUtilities.at(-1);

    lastUtilityExitHandler()(3);

    expect(onError).toHaveBeenCalledOnce();
    /* The record is gone, so disposing the broker has nothing left to kill. */
    handle.dispose();
    expect(utility?.kill).not.toHaveBeenCalled();
  });
});
