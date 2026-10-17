import { desktopUpdateChannels } from '@taucad/types/desktop-updates';
import type { DesktopUpdateBridge } from '@taucad/types/desktop-updates';
import type { BrowserBridge, BrowserSnapshot } from '@taucad/types/browser';
import { browserChannels } from '@taucad/types/browser';
import { mock } from 'vitest-mock-extended';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ipcRenderer } from 'electron';
import {
  hostHandOffChannel,
  openDirectoryChannel,
  revealPathChannel,
  quitChannels,
  slicersChannels,
  windowFullscreenChannel,
} from '#shared/desktop-bootstrap.js';
import { generatedImageIpcChannel, isQuickLookEnabled } from '#shared/quick-look.js';

const state = vi.hoisted(() => ({
  exposed: new Map<string, unknown>(),
  listeners: new Map<string, Array<(...args: unknown[]) => void>>(),
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
    on: vi.fn((channel: string, listener: (...args: unknown[]) => void) => {
      state.listeners.set(channel, [...(state.listeners.get(channel) ?? []), listener]);
    }),
    off: vi.fn((channel: string, listener: (...args: unknown[]) => void) => {
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
  onNavigate(handler: (route: string) => void): () => void;
  onAsk(handler: (attemptId: string) => void): () => void;
  reportQuiesced(attemptId: string, forced: boolean): void;
}>;

const quitApi = (): QuitApi => {
  const tau = state.exposed.get('tau') as { readonly quit: QuitApi };
  return tau.quit;
};

const askBeforeRendererMounts = (): void => {
  for (const listener of state.listeners.get(quitChannels.ask) ?? []) {
    listener({}, 'attempt-1');
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

    expect(handler).toHaveBeenCalledExactlyOnceWith('attempt-1');
  });
});

describe('desktop machine navigation bridge', () => {
  it('buffers a machine route until the app subscribes and ignores unrelated routes', () => {
    for (const listener of state.listeners.get(quitChannels.navigate) ?? []) {
      listener({}, '/machines/host/machine');
      listener({}, 'https://example.com');
    }
    const handler = vi.fn();
    const unsubscribe = quitApi().onNavigate(handler);
    expect(handler).toHaveBeenCalledExactlyOnceWith('/machines/host/machine');
    unsubscribe();
  });
  it('returns the exact attempt and forced decision to main', () => {
    vi.mocked(ipcRenderer.send).mockClear();
    quitApi().reportQuiesced('attempt-2', true);
    expect(ipcRenderer.send).toHaveBeenCalledExactlyOnceWith(quitChannels.quiesced, 'attempt-2', true);
  });
});

describe('desktop host hand-off bridge', () => {
  it('should buffer a daemon hand-off until the page subscribes, and drop a malformed one', () => {
    for (const listener of state.listeners.get(hostHandOffChannel) ?? []) {
      listener({}, { origin: 'http://127.0.0.1:7180', code: 'one-time-code' });
      listener({}, { origin: 7180 });
    }
    const { hostHandOff } = state.exposed.get('tau') as {
      readonly hostHandOff: {
        onHandOff(handler: (handOff: { readonly origin: string; readonly code: string }) => void): () => void;
      };
    };
    const handler = vi.fn();

    const unsubscribe = hostHandOff.onHandOff(handler);

    expect(handler).toHaveBeenCalledExactlyOnceWith({ origin: 'http://127.0.0.1:7180', code: 'one-time-code' });
    unsubscribe();
  });
});

describe('desktop preload fullscreen snapshot', () => {
  it('should retain early native state, notify subscribers and stop notifications on unsubscribe', () => {
    const { window } = state.exposed.get('tau') as {
      readonly window: { isFullscreen(): boolean; onFullscreenChange(listener: () => void): () => void };
    };
    const emit = (value: unknown): void => {
      for (const listener of state.listeners.get(windowFullscreenChannel) ?? []) {
        listener({}, value);
      }
    };
    expect(window.isFullscreen()).toBe(false);
    emit(true);
    expect(window.isFullscreen()).toBe(true);
    const observed: boolean[] = [];
    const unsubscribe = window.onFullscreenChange(() => {
      observed.push(window.isFullscreen());
    });
    emit(false);
    expect(observed).toEqual([false]);
    unsubscribe();
    emit(true);
    expect(observed).toEqual([false]);
    expect(window.isFullscreen()).toBe(true);
    emit('not a boolean');
    expect(window.isFullscreen()).toBe(true);
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

describe('native directory access', () => {
  it('should advertise the native file manager and forward the selected directory', async () => {
    const tau = state.exposed.get('tau') as {
      directories: {
        openLabel: string;
        openIcon: string;
        revealLabel: string;
        open(path: string): Promise<void>;
        reveal(path: string): Promise<void>;
      };
    };
    expect(tau.directories.openLabel).toBe(
      process.platform === 'darwin'
        ? 'Open in Finder'
        : process.platform === 'win32'
          ? 'Open in File Explorer'
          : 'Open in file manager',
    );
    expect(tau.directories.openIcon).toBe(
      process.platform === 'darwin' ? 'finder' : process.platform === 'win32' ? 'file-explorer' : 'folder',
    );
    await tau.directories.open('/picked/Project');
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(openDirectoryChannel, '/picked/Project');
    expect(tau.directories.revealLabel).toBe(
      process.platform === 'darwin'
        ? 'Reveal in Finder'
        : process.platform === 'win32'
          ? 'Reveal in File Explorer'
          : 'Reveal in file manager',
    );
    await tau.directories.reveal('/picked/Project/main.ts');
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(revealPathChannel, '/picked/Project/main.ts');
  });
});

describe('desktop browser bridge', () => {
  it('should expose a finite command API and strip Electron events from subscriptions', async () => {
    const bridge = state.exposed.get('tauBrowser') as BrowserBridge;
    expect(Object.keys(bridge).sort()).toEqual(['command', 'subscribe']);
    const snapshot: BrowserSnapshot = {
      tabs: [],
      settings: { searchEngine: 'duckduckgo', rememberHistory: true, defaultZoom: 1 },
      history: [],
      downloads: [],
    };
    vi.mocked(ipcRenderer.invoke).mockReset().mockResolvedValue(snapshot);
    await expect(bridge.command({ kind: 'snapshot' })).resolves.toEqual(snapshot);
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(browserChannels.command, { kind: 'snapshot' });
    const listener = vi.fn();
    const unsubscribe = bridge.subscribe(listener);
    const registration = vi
      .mocked(ipcRenderer.on)
      .mock.calls.findLast(([channel]) => channel === browserChannels.state)!;
    registration[1](mock<Electron.IpcRendererEvent>(), snapshot);
    expect(listener).toHaveBeenCalledExactlyOnceWith(snapshot);
    unsubscribe();
    expect(ipcRenderer.off).toHaveBeenCalledWith(browserChannels.state, registration[1]);
  });
});

describe('desktop update preload bridge', () => {
  it('should expose only fixed update actions and remove the state listener on unsubscribe', async () => {
    const { updates } = state.exposed.get('tau') as { readonly updates: DesktopUpdateBridge };
    const receive = vi.fn();
    const unsubscribe = updates.subscribe(receive);
    const snapshot = { revision: 2, phase: 'ready' };
    state.listeners.get(desktopUpdateChannels.changed)?.[0]?.({}, snapshot);
    expect(receive).toHaveBeenCalledWith(snapshot);
    await updates.snapshot();
    await updates.check();
    await updates.install();
    await updates.download();
    for (const channel of [
      desktopUpdateChannels.snapshot,
      desktopUpdateChannels.check,
      desktopUpdateChannels.install,
      desktopUpdateChannels.download,
    ]) {
      expect(ipcRenderer.invoke).toHaveBeenCalledWith(channel);
    }
    unsubscribe();
    expect(state.listeners.get(desktopUpdateChannels.changed)).toEqual([]);
  });
});
