import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type { MachineManifest, MachineProvider } from '@taucad/runtime/machine';
import type { MachineSettingsService, MachineSettingsRecord, MachineSettingsSave } from '@taucad/types';
import { MachineSettingsStore } from '#components/print/machine-settings-store.js';
import { useMachineSettings } from '#components/print/use-machine-settings.js';

const manager = vi.hoisted(() => ({ store: undefined as MachineSettingsStore | undefined }));
vi.mock('#hooks/use-file-manager.js', () => ({ useFileManager: () => ({ machineSettings: manager.store }) }));
afterEach(() => {
  manager.store?.dispose();
  manager.store = undefined;
});
const manifest = mock<MachineManifest>({ identity: mock<MachineManifest['identity']>({ typeId: 'bambu.x1c' }) });
// The hook reads the provider's manifest and its own settings form; this provider declares none.
const provider = mock<MachineProvider>({ manifest, settingsConfiguration: undefined });

describe('mounted machine settings acquisition', () => {
  it('should keep closed observation health when a queued dirty save acknowledges', async () => {
    const closed = Promise.withResolvers<void>();
    const edit = Promise.withResolvers<MachineSettingsSave>();
    const record: MachineSettingsRecord = {
      version: 1,
      typeId: 'bambu.x1c',
      activeProfile: 'default',
      profiles: { default: { name: 'Saved', configurations: {} } },
    };
    const service = mock<MachineSettingsService>({
      readMachineSettings: vi.fn(async () => ({ status: 'current', record }) as const),
      editMachineSettings: vi.fn(async () => edit.promise),
    });
    manager.store = new MachineSettingsStore(
      Promise.resolve(service),
      () => ({
        ready: Promise.resolve(),
        closed: closed.promise,
        dispose: () => undefined,
      }),
      () => undefined,
    );
    const hook = renderHook(() => useMachineSettings(provider));
    await waitFor(() => {
      expect(hook.result.current.record?.profiles['default']?.name).toBe('Saved');
    });
    act(() => {
      hook.result.current.updateRecord((value) => ({
        ...value,
        profiles: { default: { name: 'Dirty draft', configurations: {} } },
      }));
    });
    await waitFor(() => {
      expect(service.editMachineSettings).toHaveBeenCalledOnce();
    });
    await act(async () => {
      closed.resolve();
    });
    expect(hook.result.current.error).toContain('Settings observation closed');
    expect(hook.result.current.record?.profiles['default']?.name).toBe('Dirty draft');
    await act(async () => {
      edit.resolve({ status: 'saved', record: vi.mocked(service.editMachineSettings).mock.calls[0]![0].next });
      await manager.store?.flush('bambu.x1c');
    });
    expect(hook.result.current.error).toContain('Settings observation closed');
    expect(hook.result.current.record?.profiles['default']?.name).toBe('Dirty draft');
    expect(hook.result.current.selectionBlocked).toBe(true);
    hook.unmount();
  });

  it('should keep a rejected registration visible through a held retry acknowledgement', async () => {
    const first = Promise.withResolvers<void>();
    const retryReady = Promise.withResolvers<void>();
    const watch = vi
      .fn()
      .mockReturnValueOnce({ ready: first.promise, closed: Promise.withResolvers<void>().promise, dispose: vi.fn() })
      .mockReturnValue({ ready: retryReady.promise, closed: Promise.withResolvers<void>().promise, dispose: vi.fn() });
    const service = mock<MachineSettingsService>({
      readMachineSettings: vi.fn(async () => ({ status: 'absent' }) as const),
    });
    manager.store = new MachineSettingsStore(Promise.resolve(service), watch, () => undefined);
    const hook = renderHook(() => useMachineSettings(provider));
    expect(service.readMachineSettings).not.toHaveBeenCalled();
    await act(async () => {
      first.reject(new Error('registration denied'));
    });
    await waitFor(() => {
      expect(hook.result.current.file.status).toBe('unavailable');
    });
    expect(hook.result.current.error).toContain('registration denied');
    let retry!: Promise<void>;
    act(() => {
      retry = hook.result.current.retry();
    });
    expect(watch).toHaveBeenCalledTimes(2);
    expect(hook.result.current.file.status).toBe('unavailable');
    expect(service.readMachineSettings).not.toHaveBeenCalled();
    await act(async () => {
      retryReady.resolve();
      await retry;
    });
    expect(hook.result.current.file.status).toBe('absent');
    expect(hook.result.current.error).toBeUndefined();
    expect(service.readMachineSettings).toHaveBeenCalledOnce();
    hook.unmount();
  });
});
