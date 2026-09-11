import type { IpcMain, UtilityProcess } from 'electron';
import { describe, expect, it, vi } from 'vitest';
import { _registerComputeStore } from '#cache/kernel-compute-runtime.js';
import type { ComputeGeneration, ComputeStore, ComputeStoreControl } from '#types/runtime-compute.types.js';

type Handler = (...args: unknown[]) => void;
type HeadersReceivedHandler = (
  details: { responseHeaders?: Record<string, string[]> },
  callback: (result: unknown) => void,
) => void;

const listeners = new Map<string, Handler>();
const existingHeaderName = 'Existing';
const messageChannelMainExportName = 'MessageChannelMain';
const tauElectronDebugEnvName = 'TAU_ELECTRON_DEBUG';
type FakeStream = {
  readonly on: ReturnType<typeof vi.fn>;
  readonly resume: ReturnType<typeof vi.fn>;
  /** Deliver one chunk to whatever the broker attached as a `'data'` listener. */
  write(chunk: string): void;
  /** End the pipe, as Electron does once the dead child's stderr closes. */
  end(): void;
};
const liveUtilities: Array<{
  readonly kill: ReturnType<typeof vi.fn>;
  readonly on: ReturnType<typeof vi.fn>;
  readonly postMessage: ReturnType<typeof vi.fn>;
  readonly stdout?: FakeStream;
  readonly stderr?: FakeStream;
}> = [];
const headerHandlers: HeadersReceivedHandler[] = [];
const headerFilters: unknown[] = [];

vi.mock('electron', () => {
  class MessageChannelMain {
    public readonly port1 = {
      id: 'renderer-port',
      postMessage: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
      start: vi.fn(),
      close: vi.fn(),
    };
    public readonly port2 = {
      id: 'utility-port',
      postMessage: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
      start: vi.fn(),
      close: vi.fn(),
    };
  }

  /**
   * A piped standard stream, as Electron hands one back for `stdio: 'pipe'`.
   *
   * @returns The stream stub plus a `write` that drives its `'data'` listeners.
   */
  const createStream = (): FakeStream => {
    const dataListeners: Array<(chunk: unknown) => void> = [];
    const endListeners: Array<() => void> = [];
    return {
      on: vi.fn((event: string, listener: (chunk: unknown) => void) => {
        if (event === 'data') {
          dataListeners.push(listener);
        }
        if (event === 'end') {
          endListeners.push(listener as () => void);
        }
      }),
      resume: vi.fn(),
      write(chunk: string): void {
        for (const listener of dataListeners) {
          listener(Buffer.from(chunk));
        }
      },
      end(): void {
        for (const listener of endListeners) {
          listener();
        }
      },
    };
  };

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
          onHeadersReceived: vi.fn((filter: unknown, handler: HeadersReceivedHandler) => {
            headerFilters.push(filter);
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
          stdout: createStream(),
          stderr: createStream(),
        };
        liveUtilities.push(utility);
        return utility;
      }),
    },
  };
});

/**
 * Install the header handler and run one response through the freshly
 * registered listener (`headerHandlers` is module-scoped and accumulates one
 * entry per install).
 *
 * @param responseHeaders - Headers Electron delivers for the response.
 * @returns The headers the handler hands back to Electron.
 */
const applyRuntimeHeaders = async (responseHeaders: Record<string, string[]>): Promise<Record<string, string[]>> => {
  const { installElectronRuntimeHeaders } = await import('#electron/main.js');
  installElectronRuntimeHeaders();
  let applied: Record<string, string[]> | undefined;
  headerHandlers.at(-1)?.({ responseHeaders }, (value) => {
    applied = (value as { responseHeaders: Record<string, string[]> }).responseHeaders;
  });
  if (!applied) {
    throw new Error('installElectronRuntimeHeaders did not invoke its callback');
  }
  return applied;
};

/**
 * Drive one `requestRuntimePort` IPC message into the registered broker.
 *
 * @param sender - Renderer `webContents` stub used for lifecycle listeners.
 * @param senderFrame - Frame stub that receives the relayed port and host-exit messages.
 * @param request - Correlated request identity and optional fork context.
 * @returns The frame stub, so a caller can observe what the broker posted to it.
 */
const requestRuntimePort = <Frame extends { postMessage: ReturnType<typeof vi.fn> }>(
  sender: { once: ReturnType<typeof vi.fn> },
  senderFrame?: Frame,
  request: { readonly context?: unknown; readonly requestId?: string } = {},
): Frame => {
  const frame = senderFrame ?? ({ postMessage: vi.fn() } as unknown as Frame);
  listeners.get('taucad:connect-runtime')?.(
    { sender, senderFrame: frame },
    { context: request.context, requestId: request.requestId ?? 'request-1' },
  );
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

/**
 * Exit the most recent utility the way Electron does, then let the broker's
 * bounded stderr drain settle so the exit report has been posted.
 *
 * @param code - Process exit code Electron reports.
 * @param lateStderr - Bytes the pipe delivers *after* the exit, as the real race does.
 * @returns Nothing, once the broker has reported the exit.
 */
const exitLastUtility = async (code: number, lateStderr?: string): Promise<void> => {
  const stderr = liveUtilities.at(-1)?.stderr;
  lastUtilityExitHandler()(code);
  if (lateStderr !== undefined) {
    stderr?.write(lateStderr);
  }
  stderr?.end();
  await new Promise<void>((resolve) => {
    setImmediate(resolve);
  });
};

describe('Electron main runtime helpers', () => {
  it('resolves a distinct trusted compute binding for every admitted fork', async () => {
    const { registerElectronRuntimeMain } = await import('#electron/main.js');
    const generation = 1 as ComputeGeneration;
    const control: ComputeStoreControl = {
      inspect: async () => ({
        entries: 0,
        logicalBytes: 0,
        pinnedBytes: 0,
        pendingBytes: 0,
        generation,
        physicalBytes: { status: 'unsupported' },
      }),
      clear: async () => ({ status: 'cleared', generation, retained: 0 }),
      collect: async () => ({ status: 'complete', reclaimed: 0 }),
    };
    const register = (): ComputeStore =>
      _registerComputeStore({
        spec: Object.freeze({}) as ComputeStore,
        workspace: 'trusted',
        engine: { open: vi.fn() },
        control,
      });
    const first = register();
    const second = register();
    const forged = Object.freeze({}) as ComputeStore;
    const broker = registerElectronRuntimeMain({
      utilityEntry: '/runtime.js',
      resolveFork: (context) => ({
        compute:
          context['project'] === 'off'
            ? { mode: 'off' }
            : {
                mode: 'durable',
                store: context['project'] === 'first' ? first : context['project'] === 'second' ? second : forged,
              },
      }),
    });
    broker.connect({ purpose: 'main-process-client', context: { project: 'first' } });
    broker.connect({ purpose: 'main-process-client', context: { project: 'second' } });
    expect(liveUtilities.at(-2)?.postMessage.mock.calls[0]?.[1]).toHaveLength(2);
    expect(liveUtilities.at(-1)?.postMessage.mock.calls[0]?.[1]).toHaveLength(2);
    expect(liveUtilities.at(-2)?.postMessage.mock.calls[0]?.[1]?.[1]).not.toBe(
      liveUtilities.at(-1)?.postMessage.mock.calls[0]?.[1]?.[1],
    );
    expect(() => broker.connect({ purpose: 'main-process-client', context: { project: 'forged' } })).toThrow(
      /unregistered store capability/u,
    );
    broker.connect({ purpose: 'main-process-client', context: { project: 'off' } });
    expect(liveUtilities.at(-1)?.postMessage.mock.calls[0]?.[1]).toHaveLength(1);
    broker.dispose();
  });
  it('transfers a private durable compute port and refuses a forged capability', async () => {
    const { registerElectronRuntimeMain } = await import('#electron/main.js');
    const generation = 0 as ComputeGeneration;
    const control: ComputeStoreControl = {
      inspect: async () => ({
        entries: 0,
        logicalBytes: 0,
        pinnedBytes: 0,
        pendingBytes: 0,
        generation,
        physicalBytes: { status: 'unsupported' },
      }),
      clear: async () => ({ status: 'cleared', generation, retained: 0 }),
      collect: async () => ({ status: 'complete', reclaimed: 0 }),
    };
    const store = _registerComputeStore({
      spec: Object.freeze({}) as ComputeStore,
      workspace: 'test',
      engine: { open: vi.fn() },
      control,
    });
    const handle = registerElectronRuntimeMain({
      utilityEntry: '/dist/main/kernel-host.js',
      compute: { mode: 'durable', store },
    });
    handle.connect({ purpose: 'main-process-client' });
    expect(liveUtilities.at(-1)?.postMessage.mock.calls.at(-1)?.[1]).toHaveLength(2);
    handle.dispose();

    const forged = Object.freeze({}) as ComputeStore;
    const invalid = registerElectronRuntimeMain({
      utilityEntry: '/dist/main/kernel-host.js',
      compute: { mode: 'durable', store: forged },
    });
    expect(() => invalid.connect({ purpose: 'main-process-client' })).toThrow(/unregistered store capability/u);
    invalid.dispose();
    liveUtilities.length = 0;
  });
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
          'Cross-Origin-Resource-Policy': ['same-origin'],
        },
      },
    ]);
  });

  it('registers the IPC bridge, relays ports, and tears down utility processes', async () => {
    const { registerElectronRuntimeMain } = await import('#electron/main.js');
    const senderOnce = vi.fn<(event: string, handler: () => void) => void>();
    const postMessage =
      vi.fn<
        (channel: string, payload: { readonly hostId: string; readonly requestId: string }, ports: unknown[]) => void
      >();
    const sender = { once: senderOnce };

    const handle = registerElectronRuntimeMain({
      // eslint-disable-next-line @typescript-eslint/naming-convention -- Node defines this environment variable name.
      env: { NODE_ENV: 'test', [tauElectronDebugEnvName]: '1' },
      serviceName: 'tau-kernel-host',
      utilityEntry: '/dist/main/kernel-host.js',
    });

    listeners.get('taucad:connect-runtime')?.({ sender, senderFrame: { postMessage } }, { requestId: 'request-1' });

    expect(liveUtilities[0]?.postMessage).toHaveBeenCalledWith({ taucadRuntime: true }, [
      expect.objectContaining({ id: 'utility-port' }),
    ]);
    expect(postMessage).toHaveBeenCalledOnce();
    const [relayChannel, relayPayload, relayPorts] = postMessage.mock.calls[0]!;
    expect(relayChannel).toBe('taucad:connect-runtime:port');
    expect(relayPayload.hostId).toBeTypeOf('string');
    expect(relayPayload.requestId).toBe('request-1');
    expect(relayPorts).toEqual([expect.objectContaining({ id: 'renderer-port' })]);
    expect(senderOnce).toHaveBeenCalledWith('destroyed', expect.any(Function));

    const [, destroyedHandler] = senderOnce.mock.calls[0] as ['destroyed', () => void];
    destroyedHandler();
    expect(liveUtilities[0]?.kill).toHaveBeenCalledTimes(1);

    handle.dispose();
    expect(listeners.has('taucad:connect-runtime')).toBe(false);
    expect(listeners.has('taucad:connect-runtime:release')).toBe(false);
    expect(liveUtilities[0]?.kill).toHaveBeenCalledTimes(1);
  });

  it('refuses an absent or invalid request identity before forking', async () => {
    const { registerElectronRuntimeMain } = await import('#electron/main.js');
    const { utilityProcess } = await import('electron');
    const fork = vi.mocked(utilityProcess.fork);
    const forkCallsBefore = fork.mock.calls.length;
    const onError = vi.fn<(error: Error) => void>();
    const handle = registerElectronRuntimeMain({ onError, utilityEntry: '/dist/main/kernel-host.js' });
    const event = { sender: { once: vi.fn() }, senderFrame: { postMessage: vi.fn() } };

    for (const payload of [undefined, {}, { requestId: '' }, { requestId: 7 }, { requestId: 'x'.repeat(129) }]) {
      listeners.get('taucad:connect-runtime')?.(event, payload);
    }

    expect(fork).toHaveBeenCalledTimes(forkCallsBefore);
    expect(onError).toHaveBeenCalledTimes(5);
    handle.dispose();
  });

  it('kills only the utility process addressed by a renderer release', async () => {
    const { registerElectronRuntimeMain } = await import('#electron/main.js');
    const sender = { once: vi.fn() };
    const postMessage = vi.fn();
    const handle = registerElectronRuntimeMain({ utilityEntry: '/dist/main/kernel-host.js' });

    listeners.get('taucad:connect-runtime')?.({ sender, senderFrame: { postMessage } }, { requestId: 'request-1' });
    listeners.get('taucad:connect-runtime')?.({ sender, senderFrame: { postMessage } }, { requestId: 'request-2' });
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
  it('emits exactly one entry per managed header when input keys are lowercase', async () => {
    const applied = await applyRuntimeHeaders({
      'cross-origin-opener-policy': ['unsafe-none'],
      'cross-origin-embedder-policy': ['unsafe-none'],
    });

    const entriesFor = (name: string): Array<[string, string[]]> =>
      Object.entries(applied).filter(([key]) => key.toLowerCase() === name);
    expect(entriesFor('cross-origin-opener-policy')).toEqual([['Cross-Origin-Opener-Policy', ['same-origin']]]);
    expect(entriesFor('cross-origin-embedder-policy')).toEqual([['Cross-Origin-Embedder-Policy', ['require-corp']]]);
  });

  it('preserves unrelated headers and their casing', async () => {
    const applied = await applyRuntimeHeaders({ [existingHeaderName]: ['kept'], 'x-Tau-Trace': ['abc'] });

    expect(applied[existingHeaderName]).toEqual(['kept']);
    expect(applied['x-Tau-Trace']).toEqual(['abc']);
  });

  it('is idempotent across two applications', async () => {
    const once = await applyRuntimeHeaders({ [existingHeaderName]: ['kept'] });
    const twice = await applyRuntimeHeaders(once);

    expect(twice).toEqual(once);
  });

  it('stays in sync with the canonical documentHeaders', async () => {
    const { documentHeaders } = await import('#cross-origin-isolation/index.js');
    const applied = await applyRuntimeHeaders({});

    expect(applied).toEqual(
      Object.fromEntries(Object.entries(documentHeaders).map(([name, value]) => [name, [value]])),
    );
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

  it('registers a document-only web request filter', async () => {
    const { installElectronRuntimeHeaders } = await import('#electron/main.js');

    installElectronRuntimeHeaders();

    expect(headerFilters.at(-1)).toEqual({ urls: ['<all_urls>'], types: ['mainFrame', 'subFrame'] });
  });

  it('emits the complete documentHeaders set on a document response', async () => {
    const { documentHeaders } = await import('#cross-origin-isolation/index.js');
    const applied = await applyRuntimeHeaders({ 'cross-origin-resource-policy': ['cross-origin'] });

    for (const [name, value] of Object.entries(documentHeaders)) {
      expect(Object.entries(applied).filter(([key]) => key.toLowerCase() === name.toLowerCase())).toEqual([
        [name, [value]],
      ]);
    }
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
        gated.set(channel, (...args) => {
          const [event] = args;
          if ((event as { sender?: unknown }).sender !== allowedSender) {
            return;
          }
          handler(...args);
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
    gated.get('taucad:connect-runtime')?.(
      { sender: { once: vi.fn() }, senderFrame: { postMessage: vi.fn() } },
      { requestId: 'request-denied' },
    );

    expect(fork).toHaveBeenCalledTimes(forkCallsBefore);

    gated.get('taucad:connect-runtime')?.(
      { sender: allowedSender, senderFrame: { postMessage: vi.fn() } },
      { requestId: 'request-allowed' },
    );
    expect(fork).toHaveBeenCalledTimes(forkCallsBefore + 1);
    handle.dispose();
  });

  it('relays the utility exit code to the owning renderer frame', async () => {
    const { registerElectronRuntimeMain } = await import('#electron/main.js');
    const postMessage = vi.fn<(channel: string, payload: { readonly hostId: string }, ports?: unknown[]) => void>();
    const handle = registerElectronRuntimeMain({ utilityEntry: '/dist/main/kernel-host.js' });

    const senderFrame = requestRuntimePort({ once: vi.fn() }, { postMessage });
    const { hostId } = senderFrame.postMessage.mock.calls[0]![1] as { hostId: string };

    await exitLastUtility(7);

    expect(postMessage).toHaveBeenLastCalledWith('taucad:connect-runtime:host-exit', {
      hostId,
      exitCode: 7,
      released: false,
    });
    handle.dispose();
  });

  it('pipes utility output by default, drains stdout, and honours an explicit stdio', async () => {
    const { registerElectronRuntimeMain } = await import('#electron/main.js');
    const { utilityProcess } = await import('electron');
    const fork = vi.mocked(utilityProcess.fork);

    const piped = registerElectronRuntimeMain({ utilityEntry: '/dist/main/kernel-host.js' });
    requestRuntimePort({ once: vi.fn() });
    expect(fork.mock.calls.at(-1)?.[2]?.stdio).toBe('pipe');
    /* Draining is unconditional: an unread pipe stalls the child. */
    expect(liveUtilities.at(-1)?.stdout?.resume).toHaveBeenCalledOnce();
    expect(liveUtilities.at(-1)?.stderr?.on).toHaveBeenCalledWith('data', expect.any(Function));
    piped.dispose();

    const inherited = registerElectronRuntimeMain({ stdio: 'inherit', utilityEntry: '/dist/main/kernel-host.js' });
    requestRuntimePort({ once: vi.fn() });
    expect(fork.mock.calls.at(-1)?.[2]?.stdio).toBe('inherit');
    inherited.dispose();
  });

  it('forwards every stderr chunk and relays a bounded tail with the exit', async () => {
    const { registerElectronRuntimeMain } = await import('#electron/main.js');
    const onUtilityFork = vi.fn<(fork: { hostId: string; entry: string }) => void>();
    const onUtilityStderr = vi.fn<(output: { hostId: string; chunk: string }) => void>();
    const onUtilityExit = vi.fn<(exit: { hostId: string; exitCode: number; stderrTail?: string }) => void>();
    const postMessage = vi.fn<(channel: string, payload: Record<string, unknown>, ports?: unknown[]) => void>();
    const handle = registerElectronRuntimeMain({
      onUtilityExit,
      onUtilityFork,
      onUtilityStderr,
      utilityEntry: '/dist/main/kernel-host.js',
    });

    requestRuntimePort({ once: vi.fn() }, { postMessage });
    const { hostId } = postMessage.mock.calls[0]![1] as { hostId: string };
    expect(onUtilityFork).toHaveBeenCalledExactlyOnceWith({ hostId, entry: '/dist/main/kernel-host.js' });

    const overflow = 'x'.repeat(5000);
    liveUtilities.at(-1)?.stderr?.write(overflow);
    liveUtilities.at(-1)?.stderr?.write('Error: boot failed\n');
    expect(onUtilityStderr.mock.calls.map(([output]) => output.chunk)).toEqual([overflow, 'Error: boot failed\n']);

    await exitLastUtility(1);

    const [relayChannel, relayPayload] = postMessage.mock.calls.at(-1)!;
    expect(relayChannel).toBe('taucad:connect-runtime:host-exit');
    expect(relayPayload).toMatchObject({ hostId, exitCode: 1, released: false });
    const { stderrTail } = relayPayload as { stderrTail: string };
    expect(stderrTail).toHaveLength(4096);
    expect(stderrTail.endsWith('Error: boot failed\n')).toBe(true);
    expect(onUtilityExit).toHaveBeenCalledExactlyOnceWith({ hostId, exitCode: 1, released: false, stderrTail });
    handle.dispose();
  });

  it('waits for the stderr the pipe delivers after the exit', async () => {
    const { registerElectronRuntimeMain } = await import('#electron/main.js');
    const onUtilityExit = vi.fn<(exit: { hostId: string; stderrTail?: string }) => void>();
    const postMessage = vi.fn<(channel: string, payload: Record<string, unknown>, ports?: unknown[]) => void>();
    const handle = registerElectronRuntimeMain({ onUtilityExit, utilityEntry: '/dist/main/kernel-host.js' });

    requestRuntimePort({ once: vi.fn() }, { postMessage });
    const { hostId } = postMessage.mock.calls[0]![1] as { hostId: string };

    /* Electron's order for a boot death: `'exit'` first, the stack after. */
    const bootStack = "Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'nanoraster'\n";
    await exitLastUtility(1, bootStack);

    expect(postMessage).toHaveBeenLastCalledWith('taucad:connect-runtime:host-exit', {
      hostId,
      exitCode: 1,
      released: false,
      stderrTail: bootStack,
    });
    expect(onUtilityExit).toHaveBeenCalledExactlyOnceWith({
      hostId,
      exitCode: 1,
      released: false,
      stderrTail: bootStack,
    });
    handle.dispose();
  });

  it('relays the exit within the drain bound when the stream never ends', async () => {
    const { registerElectronRuntimeMain } = await import('#electron/main.js');
    const postMessage = vi.fn<(channel: string, payload: Record<string, unknown>, ports?: unknown[]) => void>();
    const handle = registerElectronRuntimeMain({ utilityEntry: '/dist/main/kernel-host.js' });

    requestRuntimePort({ once: vi.fn() }, { postMessage });
    const { hostId } = postMessage.mock.calls[0]![1] as { hostId: string };

    vi.useFakeTimers();
    try {
      lastUtilityExitHandler()(1);
      liveUtilities.at(-1)?.stderr?.write('never ends\n');
      expect(postMessage).toHaveBeenCalledOnce();

      await vi.advanceTimersByTimeAsync(250);

      expect(postMessage).toHaveBeenLastCalledWith('taucad:connect-runtime:host-exit', {
        hostId,
        exitCode: 1,
        released: false,
        stderrTail: 'never ends\n',
      });
    } finally {
      vi.useRealTimers();
    }
    handle.dispose();
  });

  it('marks every kill main initiated as released', async () => {
    const { registerElectronRuntimeMain } = await import('#electron/main.js');
    const handle = registerElectronRuntimeMain({ utilityEntry: '/dist/main/kernel-host.js' });
    const releasedFlags: boolean[] = [];

    /* Each of the four kill paths: renderer release, destroyed sender, gone
     * renderer process, broker dispose — plus a main-client lease dispose. */
    const senderOnce = vi.fn<(event: string, handler: () => void) => void>();
    const sender = { once: senderOnce };
    const postMessage = vi.fn<(channel: string, payload: Record<string, unknown>) => void>();
    const relayedRelease = async (): Promise<boolean> => {
      await exitLastUtility(0);
      return postMessage.mock.calls.at(-1)![1]['released'] as boolean;
    };

    requestRuntimePort(sender, { postMessage }, { requestId: 'release' });
    const { hostId } = postMessage.mock.calls.at(-1)![1] as { hostId: string };
    listeners.get('taucad:connect-runtime:release')?.({ sender }, { hostId });
    releasedFlags.push(await relayedRelease());

    requestRuntimePort(sender, { postMessage }, { requestId: 'destroyed' });
    senderOnce.mock.calls.findLast(([event]) => event === 'destroyed')![1]();
    releasedFlags.push(await relayedRelease());

    requestRuntimePort(sender, { postMessage }, { requestId: 'gone' });
    senderOnce.mock.calls.findLast(([event]) => event === 'render-process-gone')![1]();
    releasedFlags.push(await relayedRelease());

    const lease = handle.connect({ purpose: 'main-process-client' });
    lease.dispose();
    await exitLastUtility(0);
    const leaseExit = await lease.closed;
    releasedFlags.push(leaseExit.released);

    const quitting = handle.connect({ purpose: 'main-process-client' });
    handle.dispose();
    await exitLastUtility(0);
    const quittingExit = await quitting.closed;
    releasedFlags.push(quittingExit.released);

    expect(releasedFlags).toEqual([true, true, true, true, true]);
  });

  it('mints an independently leased main-client port and reacquires after a utility crash', async () => {
    const { registerElectronRuntimeMain } = await import('#electron/main.js');
    const resolveFork = vi.fn(() => ({}));
    const handle = registerElectronRuntimeMain({ resolveFork, utilityEntry: '/dist/main/kernel-host.js' });

    const first = handle.connect({
      purpose: 'main-process-client',
      context: { projectRoot: '/projects/a' },
    });
    const firstUtility = liveUtilities.at(-1);
    expect(first.port).toMatchObject({ id: 'renderer-port' });
    expect(resolveFork).toHaveBeenLastCalledWith({ projectRoot: '/projects/a' });

    await exitLastUtility(9);
    await expect(first.closed).resolves.toEqual({ exitCode: 9, released: false });

    const second = handle.connect({
      purpose: 'main-process-client',
      context: { projectRoot: '/projects/a' },
    });
    const secondUtility = liveUtilities.at(-1);
    expect(secondUtility).not.toBe(firstUtility);
    second.dispose();
    expect(secondUtility?.kill).toHaveBeenCalledOnce();
    expect(firstUtility?.kill).not.toHaveBeenCalled();

    handle.dispose();
    expect(() => handle.connect({ purpose: 'main-process-client' })).toThrow(/broker is disposed/u);
  });

  it('kills the exact utility when post-fork channel setup fails', async () => {
    const { registerElectronRuntimeMain } = await import('#electron/main.js');
    const handle = registerElectronRuntimeMain({ utilityEntry: '/dist/main/kernel-host.js' });
    const nextUtilityIndex = liveUtilities.length;
    const { utilityProcess } = await import('electron');
    vi.mocked(utilityProcess.fork).mockImplementationOnce(() => {
      const failed = {
        kill: vi.fn(),
        on: vi.fn(),
        postMessage: vi.fn(() => {
          throw new Error('port transfer failed');
        }),
      };
      liveUtilities.push(failed);
      return failed as unknown as UtilityProcess;
    });

    expect(() => handle.connect({ purpose: 'main-process-client' })).toThrow(/port transfer failed/u);
    expect(liveUtilities[nextUtilityIndex]?.kill).toHaveBeenCalledOnce();
    handle.dispose();
  });

  it('threads a sanitized fork context into the app resolver', async () => {
    const { registerElectronRuntimeMain } = await import('#electron/main.js');
    const { utilityProcess } = await import('electron');
    const fork = vi.mocked(utilityProcess.fork);
    const resolveFork = vi.fn(() => ({
      // eslint-disable-next-line @typescript-eslint/naming-convention -- Environment variable names are SCREAMING_SNAKE.
      env: { TAU_PROJECT_ROOT: '/projects/a' },
      utilityEntry: '/dist/main/debug-host.js',
    }));
    const handle = registerElectronRuntimeMain({
      // eslint-disable-next-line @typescript-eslint/naming-convention -- Node defines this environment variable name.
      env: { NODE_ENV: 'test' },
      forkEnvAllowlist: ['TAU_PROJECT_ROOT'],
      resolveFork,
      utilityEntry: '/dist/main/kernel-host.js',
    });

    requestRuntimePort({ once: vi.fn() }, undefined, { context: { definition: 'debug', projectRoot: '/projects/a' } });

    expect(resolveFork).toHaveBeenCalledExactlyOnceWith({ definition: 'debug', projectRoot: '/projects/a' });
    const [entry, , forkOptions] = fork.mock.calls.at(-1)!;
    expect(entry).toBe('/dist/main/debug-host.js');
    // eslint-disable-next-line @typescript-eslint/naming-convention -- Environment variable names are SCREAMING_SNAKE.
    expect(forkOptions?.env).toEqual({ NODE_ENV: 'test', TAU_PROJECT_ROOT: '/projects/a' });
    handle.dispose();
  });

  it('resolves with an empty context and the static entry when the renderer sends none', async () => {
    const { registerElectronRuntimeMain } = await import('#electron/main.js');
    const { utilityProcess } = await import('electron');
    const fork = vi.mocked(utilityProcess.fork);
    const resolveFork = vi.fn(() => ({}));
    const handle = registerElectronRuntimeMain({ resolveFork, utilityEntry: '/dist/main/kernel-host.js' });

    requestRuntimePort({ once: vi.fn() });

    expect(resolveFork).toHaveBeenCalledExactlyOnceWith({});
    expect(fork.mock.calls.at(-1)?.[0]).toBe('/dist/main/kernel-host.js');
    handle.dispose();
  });

  it('refuses a fork context that is not a flat, bounded string record', async () => {
    const { registerElectronRuntimeMain } = await import('#electron/main.js');
    const { utilityProcess } = await import('electron');
    const fork = vi.mocked(utilityProcess.fork);
    const forkCallsBefore = fork.mock.calls.length;
    const onError = vi.fn<(error: Error) => void>();
    const resolveFork = vi.fn(() => ({}));
    const handle = registerElectronRuntimeMain({ onError, resolveFork, utilityEntry: '/dist/main/kernel-host.js' });

    const refused: unknown[] = [
      'projectRoot=/a',
      ['projectRoot'],
      { projectRoot: 7 },
      { projectRoot: { path: '/a' } },
      /* An own, enumerable `__proto__` — what `JSON.parse` and `defineProperty`
       * produce, and what a plain object literal cannot. */
      Object.defineProperty({}, '__proto__', { enumerable: true, value: 'polluted' }),
      Object.fromEntries(Array.from({ length: 33 }, (_, index) => [`key-${index}`, 'value'])),
      { blob: 'x'.repeat(8193) },
    ];
    for (const context of refused) {
      requestRuntimePort({ once: vi.fn() }, undefined, { context });
    }

    expect(fork).toHaveBeenCalledTimes(forkCallsBefore);
    expect(resolveFork).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(refused.length);
    expect('polluted' in {}).toBe(false);
    handle.dispose();
  });

  it('refuses a resolver that throws or returns an env key outside the allowlist', async () => {
    const { registerElectronRuntimeMain } = await import('#electron/main.js');
    const { utilityProcess } = await import('electron');
    const fork = vi.mocked(utilityProcess.fork);
    const forkCallsBefore = fork.mock.calls.length;
    const onError = vi.fn<(error: Error) => void>();

    const throwing = registerElectronRuntimeMain({
      onError,
      resolveFork: () => {
        throw new Error('unknown project');
      },
      utilityEntry: '/dist/main/kernel-host.js',
    });
    requestRuntimePort({ once: vi.fn() }, undefined, { context: { projectRoot: '/projects/missing' } });
    throwing.dispose();

    /* No allowlist at all is the strict default: every returned key is denied. */
    const unlisted = registerElectronRuntimeMain({
      onError,
      // eslint-disable-next-line @typescript-eslint/naming-convention -- Environment variable names are SCREAMING_SNAKE.
      resolveFork: () => ({ env: { TAU_PROJECT_ROOT: '/projects/a' } }),
      utilityEntry: '/dist/main/kernel-host.js',
    });
    requestRuntimePort({ once: vi.fn() }, undefined, { context: { projectRoot: '/projects/a' } });
    unlisted.dispose();

    const disallowed = registerElectronRuntimeMain({
      forkEnvAllowlist: ['TAU_PROJECT_ROOT'],
      onError,
      // eslint-disable-next-line @typescript-eslint/naming-convention -- Environment variable names are SCREAMING_SNAKE.
      resolveFork: () => ({ env: { ELECTRON_RUN_AS_NODE: '1', TAU_PROJECT_ROOT: '/projects/a' } }),
      utilityEntry: '/dist/main/kernel-host.js',
    });
    requestRuntimePort({ once: vi.fn() }, undefined, { context: { projectRoot: '/projects/a' } });
    disallowed.dispose();

    expect(fork).toHaveBeenCalledTimes(forkCallsBefore);
    expect(onError).toHaveBeenCalledTimes(3);
    expect(onError.mock.calls.at(-1)?.[0].message).toContain('ELECTRON_RUN_AS_NODE');
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

    await exitLastUtility(3);

    expect(onError).toHaveBeenCalledOnce();
    /* The record is gone, so disposing the broker has nothing left to kill. */
    handle.dispose();
    expect(utility?.kill).not.toHaveBeenCalled();
  });
});
