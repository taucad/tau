import { describe, expect, it } from 'vitest';
import { isMemoryConstrainedDevice, runtimeRecycleHeapBytes } from '#lib/device-memory-class.js';

const environment = (options: { readonly coarse?: boolean; readonly deviceMemory?: number }) => ({
  matchMedia: (query: string) => ({ matches: query === '(pointer: coarse)' && options.coarse === true }),
  navigator: options.deviceMemory === undefined ? {} : { deviceMemory: options.deviceMemory },
});

describe('isMemoryConstrainedDevice', () => {
  it('treats a coarse primary pointer as a phone or tablet', () => {
    expect(isMemoryConstrainedDevice(environment({ coarse: true }))).toBe(true);
  });

  it('treats a device reporting 4 GB or less as constrained', () => {
    expect(isMemoryConstrainedDevice(environment({ deviceMemory: 4 }))).toBe(true);
    expect(isMemoryConstrainedDevice(environment({ deviceMemory: 8 }))).toBe(false);
  });

  it('treats a fine-pointer device with no memory hint as unconstrained', () => {
    expect(isMemoryConstrainedDevice(environment({}))).toBe(false);
  });

  it('is unconstrained where there is no window (SSR)', () => {
    expect(isMemoryConstrainedDevice({})).toBe(false);
  });
});

// D-RT-03: the heap above which an idle editor runtime is recycled scales with the device (W8 1.5 GiB browser default).
describe('runtimeRecycleHeapBytes', () => {
  it('recycles a phone runtime past 512 MiB and any other past 1.5 GiB', () => {
    expect(runtimeRecycleHeapBytes(true)).toBe(512 * 2 ** 20);
    expect(runtimeRecycleHeapBytes(false)).toBe(1.5 * 2 ** 30);
  });
});
