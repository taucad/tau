import { describe, expect, it } from 'vitest';
import { workbenchRecords } from '@taucad/workbench';
import { proposeEntriesCorrection } from '#workbench-records/entries-repair.js';

const encoder = new TextEncoder();
const bytes = (value: unknown): Uint8Array<ArrayBuffer> => encoder.encode(JSON.stringify(value));
const historical = {
  version: 1,
  entries: {
    'main.ts': { operationTimeout: 240_000, components: { hidden: ['housing'], isolated: [], opacity: [] } },
    'carrier.ts': { renderTimeout: 90_000 },
  },
};

describe('proposeEntriesCorrection', () => {
  it('renames the historical timeout key and keeps every other value', () => {
    const correction = proposeEntriesCorrection(bytes(historical));
    expect(correction).toEqual({
      renamed: [{ path: 'main.ts', renderTimeout: 240_000 }],
      unchanged: 1,
      record: {
        version: 1,
        entries: {
          'main.ts': { renderTimeout: 240_000, components: { hidden: ['housing'], isolated: [], opacity: [] } },
          'carrier.ts': { renderTimeout: 90_000 },
        },
      },
    });
    expect(
      workbenchRecords.entries.read(encoder.encode(workbenchRecords.entries.serialize(correction!.record))),
    ).toMatchObject({ status: 'current' });
  });

  it('renames every entry the historical writer touched', () => {
    const correction = proposeEntriesCorrection(
      bytes({ version: 1, entries: { 'a.ts': { operationTimeout: 0 }, 'b.ts': { operationTimeout: 600_000 } } }),
    );
    expect(correction?.renamed).toEqual([
      { path: 'a.ts', renderTimeout: 0 },
      { path: 'b.ts', renderTimeout: 600_000 },
    ]);
    expect(correction?.unchanged).toBe(0);
  });

  it.each([
    ['a valid record', { version: 1, entries: { 'a.ts': { renderTimeout: 1 } } }],
    ['both spellings in one entry', { version: 1, entries: { 'a.ts': { operationTimeout: 1, renderTimeout: 2 } } }],
    ['an out-of-range value', { version: 1, entries: { 'a.ts': { operationTimeout: 700_000 } } }],
    ['a non-integer value', { version: 1, entries: { 'a.ts': { operationTimeout: '240000' } } }],
    ['another unknown key', { version: 1, entries: { 'a.ts': { operationTimeout: 1, colour: 'red' } } }],
    ['an unknown key in a sibling', { version: 1, entries: { 'a.ts': { operationTimeout: 1 }, 'b.ts': { x: 1 } } }],
    ['a newer record', { version: 2, entries: { 'a.ts': { operationTimeout: 1 } } }],
    ['a record without entries', { version: 1 }],
  ])('offers no correction for %s', (_name, value) => {
    expect(proposeEntriesCorrection(bytes(value))).toBeUndefined();
  });

  it('offers no correction for bytes that are not UTF-8 JSON', () => {
    expect(proposeEntriesCorrection(encoder.encode('{broken'))).toBeUndefined();
    expect(proposeEntriesCorrection(new Uint8Array([0xff, 0xfe]))).toBeUndefined();
  });

  it('offers no correction when the corrected record would carry a prototype key', () => {
    expect(
      proposeEntriesCorrection(
        encoder.encode('{"version":1,"entries":{"a.ts":{"operationTimeout":1,"__proto__":{}}}}'),
      ),
    ).toBeUndefined();
  });
});
