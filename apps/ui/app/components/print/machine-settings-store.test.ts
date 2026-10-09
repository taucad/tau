import { describe, expect, it, vi } from 'vitest';
import type { MachineSettingsRecord, MachineSettingsService, MachineSettingsSave } from '@taucad/types';
import { WorkerChangeChannel } from '@taucad/fs-client/worker-change-channel';
import type { WatchEvent } from '@taucad/filesystem';
import { MachineSettingsStore } from '#components/print/machine-settings-store.js';

const typeId = 'bambu.x1c';
const record: MachineSettingsRecord = {
  version: 1,
  typeId,
  activeProfile: 'default',
  profiles: {
    default: { name: 'Default', configurations: {} },
    fine: { name: 'Fine', configurations: {} },
  },
};
const deferred = <Value>() => {
  let settle!: (value: Value) => void;
  const promise = new Promise<Value>((resolve) => {
    settle = resolve;
  });
  return { promise, resolve: settle };
};
const fixture = () => {
  const service: MachineSettingsService = {
    readMachineSettings: vi.fn<MachineSettingsService['readMachineSettings']>(async () => ({
      status: 'current',
      record,
    })),
    editMachineSettings: vi.fn<MachineSettingsService['editMachineSettings']>(async ({ next }) => ({
      status: 'saved',
      record: next,
    })),
    machineSettingsSettlement: vi.fn<MachineSettingsService['machineSettingsSettlement']>(async () => ({
      status: 'saved',
      record,
    })),
  };
  const observe = vi.fn(() => ({
    ready: Promise.resolve(),
    closed: Promise.withResolvers<void>().promise,
    dispose: () => undefined,
  }));
  const store = new MachineSettingsStore(Promise.resolve(service), observe, () => undefined);
  return { store, service, observe };
};

describe('machine preference projections', () => {
  it('should restore the admitted settings file after retry returns the same stable snapshot identity', async () => {
    const { store, service } = fixture();
    const stable = { status: 'current', record } as const;
    vi.mocked(service.readMachineSettings)
      .mockResolvedValueOnce(stable)
      .mockRejectedValueOnce(new Error('Native settings read refused.'))
      .mockResolvedValue(stable);
    const off = store.subscribe(typeId, () => undefined);
    await vi.waitFor(() => {
      expect(store.get(typeId).file.status).toBe('current');
    });
    await expect(store.refresh(typeId)).rejects.toThrow('Native settings read refused.');
    expect(store.get(typeId).file.status).toBe('unavailable');
    await store.refresh(typeId);
    expect(store.get(typeId).observation?.status).toBe('ready');
    expect(store.get(typeId).file.status).toBe('current');
    expect(store.record(typeId)).toEqual(record);
    expect(service.readMachineSettings).toHaveBeenCalledTimes(3);
    off();
    store.dispose();
  });

  it('should refuse held pre-reset settings and converge through one trailing driver acquisition', async () => {
    const { service } = fixture();
    const stale = Promise.withResolvers<Awaited<ReturnType<MachineSettingsService['readMachineSettings']>>>();
    vi.mocked(service.readMachineSettings)
      .mockReturnValueOnce(stale.promise)
      .mockResolvedValue({
        status: 'current',
        record: { ...record, activeProfile: 'fine' },
      });
    let onEvent: ((event: WatchEvent) => void) | undefined;
    const channel = new WorkerChangeChannel({
      transport: {
        listen: () => () => undefined,
        watchReady: (_request, handler) => {
          onEvent = handler;
          return { ready: Promise.resolve(), closed: Promise.withResolvers<void>().promise, unsubscribe: vi.fn() };
        },
      },
    });
    const store = new MachineSettingsStore(
      Promise.resolve(service),
      (_typeId, handler) => channel.watchReady({ paths: ['.tau/machines/settings/bambu.x1c.json'] }, handler),
      () => undefined,
    );
    const observed: Array<string | undefined> = [];
    const off = store.subscribe(typeId, () => {
      observed.push(store.record(typeId)?.activeProfile);
    });
    await vi.waitFor(() => {
      expect(service.readMachineSettings).toHaveBeenCalledOnce();
    });
    onEvent?.({ type: 'reset' });
    await Promise.resolve();
    expect(service.readMachineSettings).toHaveBeenCalledOnce();
    stale.resolve({ status: 'current', record });
    await vi.waitFor(() => {
      expect(store.record(typeId)?.activeProfile).toBe('fine');
    });
    expect(observed).not.toContain('default');
    expect(service.readMachineSettings).toHaveBeenCalledTimes(2);
    off();
    store.dispose();
    channel.dispose();
  });

  it('should wait for actual settings watch acknowledgement before a mounted read', async () => {
    const { service } = fixture();
    const ready = Promise.withResolvers<void>();
    const dispose = vi.fn();
    const watch = vi.fn(() => ({ ready: ready.promise, closed: Promise.withResolvers<void>().promise, dispose }));
    const store = new MachineSettingsStore(Promise.resolve(service), watch, () => undefined);
    const off = store.subscribe(typeId, () => undefined);
    await new Promise<void>((resolve) => {
      setImmediate(resolve);
    });
    expect(service.readMachineSettings).not.toHaveBeenCalled();
    ready.resolve();
    await vi.waitFor(() => {
      expect(store.get(typeId).file.status).toBe('current');
    });
    expect(service.readMachineSettings).toHaveBeenCalledOnce();
    off();
    expect(dispose).toHaveBeenCalledOnce();
    store.dispose();
  });

  it('should surface rejected settings registration and retry with a new acknowledged watch', async () => {
    const { service } = fixture();
    const first = Promise.withResolvers<void>();
    const second = Promise.withResolvers<void>();
    const watch = vi
      .fn()
      .mockReturnValueOnce({ ready: first.promise, closed: Promise.withResolvers<void>().promise, dispose: vi.fn() })
      .mockReturnValue({ ready: second.promise, closed: Promise.withResolvers<void>().promise, dispose: vi.fn() });
    const store = new MachineSettingsStore(Promise.resolve(service), watch, () => undefined);
    const off = store.subscribe(typeId, () => undefined);
    first.reject(new Error('settings watch refused'));
    await vi.waitFor(() => {
      expect(store.get(typeId).file.status).toBe('unavailable');
    });
    expect(service.readMachineSettings).not.toHaveBeenCalled();
    const retry = store.refresh(typeId);
    expect(watch).toHaveBeenCalledTimes(2);
    expect(store.get(typeId).file.status).toBe('unavailable');
    expect(service.readMachineSettings).not.toHaveBeenCalled();
    second.resolve();
    await retry;
    expect(store.get(typeId).file.status).toBe('current');
    expect(service.readMachineSettings).toHaveBeenCalledOnce();
    off();
    store.dispose();
  });

  it('should mark retained settings as registering until a reacquired watch acknowledges', async () => {
    const { service } = fixture();
    const ready = Promise.withResolvers<void>();
    const watch = vi
      .fn()
      .mockReturnValueOnce({
        ready: Promise.resolve(),
        closed: Promise.withResolvers<void>().promise,
        dispose: vi.fn(),
      })
      .mockReturnValue({ ready: ready.promise, closed: Promise.withResolvers<void>().promise, dispose: vi.fn() });
    const store = new MachineSettingsStore(Promise.resolve(service), watch, () => undefined);
    const off = store.subscribe(typeId, () => undefined);
    await vi.waitFor(() => {
      expect(store.get(typeId).file.status).toBe('current');
    });
    off();
    const fresh = store.subscribe(typeId, () => undefined);
    expect(store.record(typeId)?.activeProfile).toBe('default');
    expect(store.get(typeId).observation?.status).toBe('registering');
    expect(service.readMachineSettings).toHaveBeenCalledOnce();
    ready.resolve();
    await vi.waitFor(() => {
      expect(store.get(typeId).observation?.status).toBe('ready');
    });
    expect(service.readMachineSettings).toHaveBeenCalledTimes(2);
    fresh();
    store.dispose();
  });

  it('should reacquire a fresh acknowledged watch while a released settings read is held', async () => {
    const { service } = fixture();
    const stale = Promise.withResolvers<Awaited<ReturnType<MachineSettingsService['readMachineSettings']>>>();
    const nextReady = Promise.withResolvers<void>();
    const disposed = vi.fn();
    const watch = vi
      .fn()
      .mockReturnValueOnce({
        ready: Promise.resolve(),
        closed: Promise.withResolvers<void>().promise,
        dispose: disposed,
      })
      .mockReturnValue({ ready: nextReady.promise, closed: Promise.withResolvers<void>().promise, dispose: vi.fn() });
    vi.mocked(service.readMachineSettings)
      .mockReturnValueOnce(stale.promise)
      .mockResolvedValue({
        status: 'current',
        record: { ...record, activeProfile: 'fine' },
      });
    const store = new MachineSettingsStore(Promise.resolve(service), watch, () => undefined);
    const first = store.subscribe(typeId, () => undefined);
    const second = store.subscribe(typeId, () => undefined);
    await vi.waitFor(() => {
      expect(service.readMachineSettings).toHaveBeenCalledOnce();
    });
    first();
    expect(disposed).not.toHaveBeenCalled();
    second();
    expect(disposed).toHaveBeenCalledOnce();
    const observed: Array<string | undefined> = [];
    const fresh = store.subscribe(typeId, () => {
      observed.push(store.record(typeId)?.activeProfile);
    });
    expect(watch).toHaveBeenCalledTimes(2);
    expect(service.readMachineSettings).toHaveBeenCalledOnce();
    nextReady.resolve();
    await vi.waitFor(() => {
      expect(store.record(typeId)?.activeProfile).toBe('fine');
    });
    expect(service.readMachineSettings).toHaveBeenCalledTimes(2);
    expect(store.get(typeId).observation?.status).toBe('ready');
    store.update(typeId, (current) => ({
      ...current,
      profiles: { ...current.profiles, fine: { ...current.profiles['fine']!, name: 'Edited while old read is held' } },
    }));
    await store.flush(typeId);
    expect(service.editMachineSettings).toHaveBeenCalledOnce();
    const trailing = Promise.withResolvers<Awaited<ReturnType<MachineSettingsService['readMachineSettings']>>>();
    vi.mocked(service.readMachineSettings).mockReturnValueOnce(trailing.promise);
    const refresh = store.refresh(typeId);
    await vi.waitFor(() => {
      expect(service.readMachineSettings).toHaveBeenCalledTimes(3);
    });
    stale.resolve({ status: 'current', record });
    await new Promise<void>((resolve) => {
      setImmediate(resolve);
    });
    expect(store.record(typeId)?.activeProfile).toBe('fine');
    expect(store.get(typeId).observation?.status).toBe('pending');
    expect(observed).not.toContain('default');
    const coalesced = store.refresh(typeId);
    await new Promise<void>((resolve) => {
      setImmediate(resolve);
    });
    expect(service.readMachineSettings).toHaveBeenCalledTimes(3);
    trailing.resolve({ status: 'current', record: { ...record, activeProfile: 'fine' } });
    await Promise.all([refresh, coalesced]);
    expect(service.readMachineSettings).toHaveBeenCalledTimes(4);
    expect(store.get(typeId).observation?.status).toBe('ready');
    fresh();
    store.dispose();
  });

  it('should release an observer-owned pending refresh before independently reacquiring a held old read', async () => {
    const { service } = fixture();
    const stale = Promise.withResolvers<Awaited<ReturnType<MachineSettingsService['readMachineSettings']>>>();
    const nextReady = Promise.withResolvers<void>();
    const disposed = vi.fn();
    const watch = vi
      .fn()
      .mockReturnValueOnce({
        ready: Promise.resolve(),
        closed: Promise.withResolvers<void>().promise,
        dispose: disposed,
      })
      .mockReturnValue({ ready: nextReady.promise, closed: Promise.withResolvers<void>().promise, dispose: vi.fn() });
    vi.mocked(service.readMachineSettings)
      .mockReturnValueOnce(stale.promise)
      .mockResolvedValue({
        status: 'current',
        record: { ...record, activeProfile: 'fine' },
      });
    const store = new MachineSettingsStore(Promise.resolve(service), watch, () => undefined);
    const off = store.subscribe(typeId, () => undefined);
    await vi.waitFor(() => {
      expect(service.readMachineSettings).toHaveBeenCalledOnce();
    });
    const refresh = (async () => {
      try {
        await store.refresh(typeId);
        return 'resolved';
      } catch {
        return 'closed';
      }
    })();
    off();
    expect(disposed).toHaveBeenCalledOnce();
    expect(await refresh).toBe('closed');
    const fresh = store.subscribe(typeId, () => undefined);
    expect(watch).toHaveBeenCalledTimes(2);
    nextReady.resolve();
    await vi.waitFor(() => {
      expect(store.record(typeId)?.activeProfile).toBe('fine');
    });
    expect(service.readMachineSettings).toHaveBeenCalledTimes(2);
    stale.resolve({ status: 'current', record });
    await new Promise<void>((resolve) => {
      setImmediate(resolve);
    });
    expect(store.record(typeId)?.activeProfile).toBe('fine');
    expect(service.readMachineSettings).toHaveBeenCalledTimes(2);
    fresh();
    store.dispose();
  });

  it('should share warm reads and retain stable active blocks after inactive and formatting changes', async () => {
    const { store, service, observe } = fixture();
    const off = store.subscribe(typeId, () => undefined);
    await store.refresh(typeId);
    const active = store.record(typeId)!.profiles['default'];
    const second = store.subscribe(typeId, () => undefined);
    store.get(typeId);
    store.record(typeId);
    expect(observe).toHaveBeenCalledOnce();
    vi.mocked(service.readMachineSettings).mockResolvedValue({
      status: 'current',
      record: {
        ...record,
        profiles: {
          ...record.profiles,
          fine: { name: 'Renamed', configurations: {} },
        },
      },
    });
    await store.refresh(typeId);
    expect(store.record(typeId)!.profiles['default']).toBe(active);
    off();
    second();
    store.dispose();
  });
  it('should not let A acknowledge over draft B, and should preserve the original profile through switching', async () => {
    const { store, service } = fixture();
    await store.refresh(typeId);
    const first = deferred<MachineSettingsSave>();
    vi.mocked(service.editMachineSettings).mockImplementationOnce(async () => first.promise);
    store.update(typeId, (base) => ({
      ...base,
      profiles: {
        ...base.profiles,
        default: { ...base.profiles['default']!, name: 'Draft A' },
      },
    }));
    store.update(typeId, (base) => ({ ...base, activeProfile: 'fine' }));
    await vi.waitFor(() => {
      expect(service.editMachineSettings).toHaveBeenCalledOnce();
    });
    const inputA = vi.mocked(service.editMachineSettings).mock.calls[0]![0];
    first.resolve({ status: 'saved', record: inputA.next });
    await store.flush(typeId);
    const inputB = vi.mocked(service.editMachineSettings).mock.calls[1]![0];
    expect(inputA.next.activeProfile).toBe('default');
    expect(inputB.next.activeProfile).toBe('fine');
    expect(store.record(typeId)?.activeProfile).toBe('fine');
    expect(store.record(typeId)?.profiles['default']?.name).toBe('Draft A');
    store.dispose();
  });
  it('should check a lost A reply without resubmitting A or losing queued B', async () => {
    const { store, service } = fixture();
    await store.refresh(typeId);
    vi.mocked(service.editMachineSettings).mockRejectedValueOnce(new Error('Reply lost'));
    store.update(typeId, (base) => ({
      ...base,
      profiles: {
        ...base.profiles,
        default: { ...base.profiles['default']!, name: 'A' },
      },
    }));
    store.update(typeId, (base) => ({ ...base, activeProfile: 'fine' }));
    await expect(store.flush(typeId)).rejects.toThrow('Reply lost');
    await store.refresh(typeId);
    expect(store.get(typeId).failure?.result.status).toBe('uncertain');
    expect(store.record(typeId)?.activeProfile).toBe('fine');
    const inputA = vi.mocked(service.editMachineSettings).mock.calls[0]![0];
    vi.mocked(service.machineSettingsSettlement).mockResolvedValue({
      status: 'saved',
      record: inputA.next,
    });
    await store.checkSave(typeId);
    await store.flush(typeId);
    expect(service.machineSettingsSettlement).toHaveBeenCalledWith(inputA.operationId);
    expect(service.editMachineSettings).toHaveBeenCalledTimes(2);
    expect(vi.mocked(service.editMachineSettings).mock.calls[1]![0].operationId).not.toBe(inputA.operationId);
    expect(store.record(typeId)?.activeProfile).toBe('fine');
    store.dispose();
  });
  it('should retain an external change arriving during a pending refresh and isolate type/root drafts', async () => {
    const { store, service } = fixture();
    const first = deferred<Awaited<ReturnType<MachineSettingsService['readMachineSettings']>>>();
    vi.mocked(service.readMachineSettings).mockImplementationOnce(async () => first.promise);
    const pending = store.refresh(typeId);
    await vi.waitFor(() => {
      expect(service.readMachineSettings).toHaveBeenCalledOnce();
    });
    const trailing = store.refresh(typeId);
    vi.mocked(service.readMachineSettings).mockResolvedValue({
      status: 'current',
      record: { ...record, activeProfile: 'fine' },
    });
    first.resolve({ status: 'current', record });
    await Promise.all([pending, trailing]);
    expect(store.record(typeId)?.activeProfile).toBe('fine');
    expect(service.readMachineSettings).toHaveBeenCalledTimes(2);
    const other = fixture();
    await other.store.refresh(typeId);
    expect(other.store.record(typeId)?.activeProfile).toBe('default');
    store.dispose();
    other.store.dispose();
  });
  it('should discard a read reply overtaken by a saved selection', async () => {
    const { store, service } = fixture();
    await store.refresh(typeId);
    const stale = deferred<Awaited<ReturnType<MachineSettingsService['readMachineSettings']>>>();
    vi.mocked(service.readMachineSettings).mockImplementationOnce(async () => stale.promise);
    const refresh = store.refresh(typeId);
    await vi.waitFor(() => {
      expect(service.readMachineSettings).toHaveBeenCalledTimes(2);
    });
    const saved = { ...record, activeProfile: 'fine' };
    store.update(typeId, () => saved);
    const flush = store.flush(typeId);
    expect(store.record(typeId)?.activeProfile).toBe('fine');
    vi.mocked(service.readMachineSettings).mockResolvedValue({ status: 'current', record: saved });
    stale.resolve({ status: 'current', record });
    await flush;
    expect(store.record(typeId)?.activeProfile).toBe('fine');
    await refresh;
    expect(service.readMachineSettings).toHaveBeenCalledTimes(3);
    store.dispose();
  });
  it('should acquire the current record after a pending save instead of replaying its delayed receipt', async () => {
    const { store, service } = fixture();
    await store.refresh(typeId);
    const ack = deferred<MachineSettingsSave>();
    vi.mocked(service.editMachineSettings).mockImplementationOnce(async () => ack.promise);
    store.update(typeId, (base) => ({
      ...base,
      profiles: { ...base.profiles, default: { name: 'Renamed', configurations: {} } },
    }));
    await vi.waitFor(() => {
      expect(service.editMachineSettings).toHaveBeenCalledOnce();
    });
    const actual = { ...record, activeProfile: 'fine', profiles: { fine: record.profiles['fine']! } };
    vi.mocked(service.readMachineSettings).mockResolvedValue({ status: 'current', record: actual });
    const refresh = store.refresh(typeId);
    await Promise.resolve();
    expect(service.readMachineSettings).toHaveBeenCalledOnce();
    ack.resolve({ status: 'saved', record: vi.mocked(service.editMachineSettings).mock.calls[0]![0].next });
    await store.flush(typeId);
    expect(store.record(typeId)).toEqual(actual);
    await refresh;
    expect(store.record(typeId)?.profiles['default']).toBeUndefined();
    store.dispose();
  });
  it.each(['flush', 'dispose'] as const)(
    'should drain deferred saves admitted during settlement before %s completes',
    async (action) => {
      const { service } = fixture();
      const dispose = vi.fn();
      const store = new MachineSettingsStore(
        Promise.resolve(service),
        () => ({ ready: Promise.resolve(), closed: Promise.withResolvers<void>().promise, dispose: () => undefined }),
        dispose,
      );
      await store.refresh(typeId);
      vi.mocked(service.editMachineSettings).mockRejectedValueOnce(new Error('Reply lost'));
      store.update(typeId, (base) => ({ ...base, activeProfile: 'fine' }));
      store.update(typeId, (base) => ({
        ...base,
        profiles: { ...base.profiles, fine: { name: 'Captured B', configurations: {} } },
      }));
      await expect(store.flush(typeId)).rejects.toThrow('Reply lost');
      const settlement = deferred<MachineSettingsSave>();
      const savedB = deferred<MachineSettingsSave>();
      vi.mocked(service.machineSettingsSettlement).mockImplementationOnce(async () => settlement.promise);
      vi.mocked(service.editMachineSettings).mockImplementationOnce(async () => savedB.promise);
      const check = store.checkSave(typeId);
      let flushed = false;
      const flush =
        action === 'flush'
          ? (async () => {
              await store.flush(typeId);
              flushed = true;
            })()
          : undefined;
      if (action === 'dispose') {
        store.dispose();
      }
      settlement.resolve({ status: 'saved', record: vi.mocked(service.editMachineSettings).mock.calls[0]![0].next });
      await check;
      await vi.waitFor(() => {
        expect(service.editMachineSettings).toHaveBeenCalledTimes(2);
      });
      expect(flushed).toBe(false);
      expect(dispose).not.toHaveBeenCalled();
      const inputB = vi.mocked(service.editMachineSettings).mock.calls[1]![0];
      expect(inputB.next.profiles['fine']?.name).toBe('Captured B');
      savedB.resolve({ status: 'saved', record: inputB.next });
      if (action === 'flush') {
        await flush;
        expect(store.record(typeId)).toEqual(inputB.next);
        expect(store.get(typeId).pending).toBe(0);
        store.dispose();
      }
      await vi.waitFor(() => {
        expect(dispose).toHaveBeenCalledOnce();
      });
    },
  );
  it('should reconcile a terminal uncertain receipt against the current root snapshot', async () => {
    const { store, service } = fixture();
    await store.refresh(typeId);
    vi.mocked(service.editMachineSettings).mockRejectedValueOnce(new Error('Reply lost'));
    store.update(typeId, (base) => ({
      ...base,
      profiles: { ...base.profiles, default: { name: 'Renamed', configurations: {} } },
    }));
    await expect(store.flush(typeId)).rejects.toThrow('Reply lost');
    const actual = { ...record, activeProfile: 'fine', profiles: { fine: record.profiles['fine']! } };
    vi.mocked(service.readMachineSettings).mockResolvedValue({ status: 'current', record: actual });
    await store.refresh(typeId);
    vi.mocked(service.machineSettingsSettlement).mockResolvedValue({
      status: 'saved',
      record: vi.mocked(service.editMachineSettings).mock.calls[0]![0].next,
    });
    await store.checkSave(typeId);
    await store.flush(typeId);
    expect(store.record(typeId)).toEqual(actual);
    expect(store.get(typeId).failure).toBeUndefined();
    store.dispose();
  });
});
