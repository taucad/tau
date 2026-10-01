import { describe, expect, it, vi } from 'vitest';
import type { MachineSettingsRecord, MachineSettingsService, MachineSettingsSave } from '@taucad/types';
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
  const observe = vi.fn(() => () => undefined);
  const store = new MachineSettingsStore(Promise.resolve(service), observe, () => undefined);
  return { store, service, observe };
};

describe('machine preference projections', () => {
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
});
