import { describe, expect, it } from 'vitest';
import {
  declaredSlots,
  describeOutcome,
  formatQuantity,
  materialSystemOf,
  materialSystemValue,
  observedSlots,
  slotKey,
} from '#components/print/machine-facts.js';
import { fffSlots, machineEntry, x1cManifest } from '#components/print/testing/machines.fixture.js';

describe('observedSlots', () => {
  it('should key every declared slot by its address and label, and mark the external holder', () => {
    const slots = observedSlots(machineEntry({ manifest: x1cManifest }));
    expect(slots.map(({ address, label, isExternal }) => [address, label, isExternal])).toEqual([
      [{ unitId: 'ams-a', slotId: 'a1' }, 'A1', false],
      [{ unitId: 'ams-a', slotId: 'a2' }, 'A2', false],
      [{ unitId: 'ams-a', slotId: 'a3' }, 'A3', false],
      [{ unitId: 'ams-a', slotId: 'a4' }, 'A4', false],
      [{ unitId: 'external', slotId: 'spool' }, 'Ext', true],
    ]);
    expect(slots[0]).toMatchObject({ state: 'loaded', materialId: 'PLA' });
  });
});

describe('slotKey', () => {
  it('should name a slot by its unit and slot ids', () => {
    expect(slotKey({ unitId: 'ams-a', slotId: 'a2' })).toBe('ams-a/a2');
  });
});

describe('declaredSlots', () => {
  it('should read a declared slot the machine does not report as unknown', () => {
    const system = materialSystemOf(x1cManifest);
    const reported = materialSystemValue(machineEntry({ manifest: x1cManifest }));
    const slots = declaredSlots(
      system,
      reported === undefined ? undefined : { ...reported, slots: fffSlots.slice(0, 1) },
    );
    expect(slots).toHaveLength(5);
    expect(slots[0]).toBe(fffSlots[0]);
    expect(slots[1]).toMatchObject({ slot: { unitId: 'ams-a', slotId: 'a2' }, state: 'unknown' });
  });
});

describe('describeOutcome', () => {
  it('should say what halting leaves the machine doing in one sentence', () => {
    expect(describeOutcome({ motion: 'halts', spindle: 'none', heaters: 'off', position: 'kept', recovery: [] })).toBe(
      'Motion halts at once, heaters turn off, the position is kept.',
    );
  });
});

describe('formatQuantity', () => {
  it('should round a quantity and use its unit symbol', () => {
    expect(formatQuantity({ value: 215.004, unit: 'Cel' })).toBe('215 °C');
    expect(formatQuantity({ value: 0.4, unit: 'mm' })).toBe('0.4 mm');
  });
});
