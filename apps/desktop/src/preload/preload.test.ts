import { beforeEach, describe, expect, it, vi } from 'vitest';
import { quitChannels } from '#shared/desktop-bootstrap.js';

const state = vi.hoisted(() => ({
  exposed: new Map<string, unknown>(),
  listeners: new Map<string, Array<() => void>>(),
}));

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: vi.fn((name: string, value: unknown) => {
      state.exposed.set(name, value);
    }),
  },
  ipcRenderer: {
    invoke: vi.fn(),
    send: vi.fn(),
    on: vi.fn((channel: string, listener: () => void) => {
      state.listeners.set(channel, [...(state.listeners.get(channel) ?? []), listener]);
    }),
    off: vi.fn((channel: string, listener: () => void) => {
      state.listeners.set(
        channel,
        (state.listeners.get(channel) ?? []).filter((candidate) => candidate !== listener),
      );
    }),
  },
}));

vi.mock('@taucad/runtime/electron/preload', () => ({
  exposeElectronRuntime: vi.fn(),
  relayElectronPorts: vi.fn(),
}));

type QuitApi = Readonly<{
  isReady(): boolean;
  onAsk(handler: () => void): () => void;
  reportQuiesced(forced: boolean): void;
}>;

const quitApi = (): QuitApi => {
  const tau = state.exposed.get('tau') as { readonly quit: QuitApi };
  return tau.quit;
};

const askBeforeRendererMounts = (): void => {
  for (const listener of state.listeners.get(quitChannels.ask) ?? []) {
    listener();
  }
};

beforeEach(async () => {
  state.exposed.clear();
  state.listeners.clear();
  vi.resetModules();
  await import('./preload.js');
});

describe('desktop preload quit bridge', () => {
  it('should report renderer readiness only while the quit subscriber is installed', () => {
    expect(quitApi().isReady()).toBe(false);

    const unsubscribe = quitApi().onAsk(vi.fn());
    expect(quitApi().isReady()).toBe(true);

    unsubscribe();
    expect(quitApi().isReady()).toBe(false);
  });

  it('should deliver a quit ask that arrives before the renderer subscribes', () => {
    const handler = vi.fn();

    askBeforeRendererMounts();
    quitApi().onAsk(handler);

    expect(handler).toHaveBeenCalledOnce();
  });
});
