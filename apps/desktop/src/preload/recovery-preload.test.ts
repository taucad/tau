import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ipcRenderer } from 'electron';
import { recoveryChannels } from '#shared/desktop-bootstrap.js';

const state = vi.hoisted(() => ({ exposed: new Map<string, unknown>() }));
vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: vi.fn((name: string, value: unknown) => {
      state.exposed.set(name, value);
    }),
  },
  ipcRenderer: { invoke: vi.fn(async () => ({ mode: 'normal' })), on: vi.fn(), off: vi.fn() },
}));

type RecoveryBridge = Readonly<{
  state(): Promise<unknown>;
  act(action: unknown): Promise<void>;
  onChange(listener: (state: unknown) => void): () => void;
}>;

beforeEach(async () => {
  state.exposed.clear();
  vi.resetModules();
  await import('./recovery-preload.js');
});

describe('recovery window preload (T-R12.6)', () => {
  it('should use the shared recovery channels', async () => {
    const { recoveryPreloadChannels } = await import('./recovery-preload.js');
    expect(recoveryPreloadChannels).toEqual(recoveryChannels);
  });

  it('should expose only state, act and onChange, and forward each on its channel', async () => {
    const bridge = state.exposed.get('tauRecovery') as RecoveryBridge;
    expect(Object.keys(bridge).sort()).toEqual(['act', 'onChange', 'state']);
    await expect(bridge.state()).resolves.toEqual({ mode: 'normal' });
    await bridge.act({ type: 'show-logs' });
    expect(vi.mocked(ipcRenderer.invoke).mock.calls).toEqual([
      [recoveryChannels.state],
      [recoveryChannels.action, { type: 'show-logs' }],
    ]);
    const listener = vi.fn();
    const stop = bridge.onChange(listener);
    const handler = vi.mocked(ipcRenderer.on).mock.calls[0]![1] as (event: unknown, value: unknown) => void;
    expect(vi.mocked(ipcRenderer.on).mock.calls[0]![0]).toBe(recoveryChannels.changed);
    handler({ sender: 'not for the page' }, { mode: 'safe-auto' });
    expect(listener).toHaveBeenCalledExactlyOnceWith({ mode: 'safe-auto' });
    stop();
    expect(ipcRenderer.off).toHaveBeenCalledWith(recoveryChannels.changed, handler);
  });
});
