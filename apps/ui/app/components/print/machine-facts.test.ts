import { describe, expect, it } from 'vitest';
import {
  declaredSlots,
  describeOutcome,
  formatQuantity,
  materialSystemOf,
  materialSystemValue,
  observedTrays,
  trayLabel,
} from '#components/print/machine-facts.js';
import { fffSlots, machineEntry, x1cManifest } from '#components/print/testing/machines.fixture.js';

describe('observedTrays', () => {
  it('should number every declared slot as the provider encodes it and mark the external holder', () => {
    const trays = observedTrays(machineEntry({ manifest: x1cManifest }));
    expect(trays.map(({ slot, label, isExternal }) => [slot, label, isExternal])).toEqual([
      [0, 'A1', false],
      [1, 'A2', false],
      [2, 'A3', false],
      [3, 'A4', false],
      [254, 'Ext', true],
    ]);
    expect(trays[0]).toMatchObject({ state: 'loaded', materialId: 'PLA' });
  });
});

describe('trayLabel', () => {
  it.each([
    { slot: 0, label: 'A1' },
    { slot: 254, label: 'Ext' },
    { slot: 9, label: 'Slot 10' },
  ])('should name tray $slot as $label', ({ slot, label }) => {
    expect(trayLabel(x1cManifest, slot)).toBe(label);
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
