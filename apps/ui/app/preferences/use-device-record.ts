import { useSyncExternalStore } from 'react';
import type { DeviceRecord, LeafPatch } from '@taucad/preferences';
import { deviceRecordStore } from '#preferences/person-record.store.js';
import type { SectionWriteResult } from '#preferences/section-store.js';

/** This computer's device record and its writer. */
export type DeviceRecordState = Readonly<{
  device: DeviceRecord;
  /** Set or reset device leaves. */
  writeDevice: (patch: LeafPatch<DeviceRecord>) => SectionWriteResult;
}>;

/**
 * Read and write the device record: what describes this computer (input device, paused tour, dismissed invite).
 *
 * @returns The device record and its writer.
 */
export const useDeviceRecord = (): DeviceRecordState => {
  const device = useSyncExternalStore(
    deviceRecordStore.subscribe,
    deviceRecordStore.read,
    deviceRecordStore.readInitial,
  );
  return { device, writeDevice: deviceRecordStore.write };
};
