import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ipcRenderer } from 'electron';
import { quitChannels, slicersChannels } from '#shared/desktop-bootstrap.js';
import { generatedImageIpcChannel, isQuickLookEnabled } from '#shared/quick-look.js';

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

describe('desktop preload generated image bridge', () => {
  it('should forward the requested path and return its bytes', async () => {
    const response = { path: 'run-1/top.png', bytes: new Uint8Array([1, 2]) };
    vi.mocked(ipcRenderer.invoke).mockReset().mockResolvedValue(response);
    const tau = state.exposed.get('tau') as {
      readonly generatedImages: { read(path: string): Promise<typeof response> };
    };
    await expect(tau.generatedImages.read('/Users/tester/.codex/generated_images/run-1/top.png')).resolves.toEqual(
      response,
    );
    expect(ipcRenderer.invoke).toHaveBeenCalledExactlyOnceWith(
      generatedImageIpcChannel,
      '/Users/tester/.codex/generated_images/run-1/top.png',
    );
  });
});

describe('desktop preload Bambu Studio bridge', () => {
  type BambuStudioApi = Readonly<
    Record<'status' | 'catalog' | 'resolveSelection' | 'settings', (input?: unknown) => Promise<unknown>>
  >;

  const bambuStudio = (): BambuStudioApi =>
    (state.exposed.get('tau') as { readonly slicers: { readonly bambuStudio: BambuStudioApi } }).slicers.bambuStudio;

  it('should send each Bambu Studio call on its own channel with the renderer input', async () => {
    vi.mocked(ipcRenderer.invoke).mockClear();
    vi.mocked(ipcRenderer.invoke).mockResolvedValue({ ok: true, value: 'answer' });
    const hints = { model: 'X1C', materials: [] };

    await expect(bambuStudio().resolveSelection({ hints })).resolves.toEqual({ ok: true, value: 'answer' });
    await bambuStudio().status();
    await bambuStudio().catalog({ model: 'X1C' });
    await bambuStudio().settings({ printer: 'p', process: 'q', filaments: [] });

    expect(vi.mocked(ipcRenderer.invoke).mock.calls).toEqual([
      [slicersChannels.bambuStudio.resolveSelection, { hints }],
      [slicersChannels.bambuStudio.status],
      [slicersChannels.bambuStudio.catalog, { model: 'X1C' }],
      [slicersChannels.bambuStudio.settings, { printer: 'p', process: 'q', filaments: [] }],
    ]);
  });
});

describe('desktop preload Quick Look bridge', () => {
  it('should expose tau.quickLook only while the Quick Look flag is on', () => {
    const tau = state.exposed.get('tau') as Readonly<Record<string, unknown>>;

    expect('quickLook' in tau).toBe(isQuickLookEnabled());
  });
});
