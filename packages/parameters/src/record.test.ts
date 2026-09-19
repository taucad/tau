import { describe, expect, it } from 'vitest';
import { readParameterRecord, requireParameterRecord, sameRecordBytes, serializeParameterRecord } from '#record.js';

const encoder = new TextEncoder();
const record = {
  activeGroup: 'default',
  groups: { default: { values: { width: 10 } } },
} as const;

describe('parameter record persistence', () => {
  it('classifies current and invalid bytes without changing them', () => {
    const cases = [
      { bytes: encoder.encode(JSON.stringify(record)), status: 'current' },
      // The pre-simplification format is refused like any other unreadable record; its bytes stay.
      {
        bytes: encoder.encode(
          JSON.stringify({ recordVersion: 1, profile: 'tau-json-structure-units-03-v1', ...record }),
        ),
        status: 'invalid-preserved',
      },
      { bytes: encoder.encode('{'), status: 'invalid-preserved' },
    ] as const;

    for (const item of cases) {
      const result = readParameterRecord(item.bytes);
      expect(result.status).toBe(item.status);
      expect(result.bytes).toEqual(item.bytes);
      expect(result.bytes).not.toBe(item.bytes);
    }
  });

  it('refuses an old-format record as INVALID_RECORD without overwriting it', () => {
    const bytes = encoder.encode(
      JSON.stringify({
        recordVersion: 1,
        profile: 'tau-json-structure-units-03-v1',
        activeGroup: 'default',
        order: ['default'],
        groups: { default: { values: {}, bindings: { '/width': { unit: 'mm' } } } },
        identity: { sourceRevision: 'a', manifestRevision: 'b', valueRevision: 'c', dependencyRevision: 'd' },
      }),
    );
    expect(() => requireParameterRecord(bytes)).toThrow(
      expect.objectContaining({ code: 'INVALID_RECORD', applicationState: 'known-not-applied' }),
    );
    expect(readParameterRecord(bytes).bytes).toEqual(bytes);
  });

  it('round-trips a serialized record byte for byte', () => {
    const bytes = serializeParameterRecord(record);
    expect(readParameterRecord(bytes)).toEqual({ status: 'current', bytes, record });
    expect(new TextDecoder().decode(bytes)).toBe(
      '{\n  "activeGroup": "default",\n  "groups": {\n    "default": {\n      "values": {\n        "width": 10\n      }\n    }\n  }\n}\n',
    );
  });

  it('serializes permuted value and unit keys to identical canonical bytes', () => {
    const left = {
      activeGroup: 'default',
      groups: {
        default: {
          values: { width: 1, height: 2 },
          units: { '/width': 'in', '/height': 'cm' },
          sourceUnits: { '/width': 'in' },
        },
      },
    } as const;
    const right = {
      groups: {
        default: {
          sourceUnits: { '/width': 'in' },
          units: { '/height': 'cm', '/width': 'in' },
          values: { height: 2, width: 1 },
        },
      },
      activeGroup: 'default',
    } as const;
    const bytes = serializeParameterRecord(left);
    expect(serializeParameterRecord(right)).toEqual(bytes);
    expect(new TextDecoder().decode(bytes).split('\n')[1]).toContain('"activeGroup": "default"');
  });

  it('omits empty claim maps and compares bytes exactly', () => {
    const bare = serializeParameterRecord({ activeGroup: 'default', groups: { default: { values: {}, units: {} } } });
    expect(new TextDecoder().decode(bare)).not.toContain('units');
    expect(
      sameRecordBytes(bare, serializeParameterRecord({ activeGroup: 'default', groups: { default: { values: {} } } })),
    ).toBe(true);
    expect(sameRecordBytes(bare, null)).toBe(false);
    expect(sameRecordBytes(null, null)).toBe(true);
  });

  it('preserves records that exceed byte or structural admission limits', () => {
    const oversized = encoder.encode(JSON.stringify({ value: 'x'.repeat(1_048_576) }));
    const oversizedResult = readParameterRecord(oversized);
    expect(oversizedResult).toMatchObject({
      status: 'invalid-preserved',
      error: 'PARAMETER_RECORD_BYTE_LIMIT',
    });
    expect(
      oversizedResult.bytes.byteLength === oversized.byteLength &&
        oversizedResult.bytes.every((value, index) => value === oversized[index]),
    ).toBe(true);

    let nested = '0';
    for (let depth = 0; depth < 6000; depth += 1) {
      nested = `{"x":${nested}}`;
    }
    const deeplyNested = encoder.encode(nested);
    const nestedResult = readParameterRecord(deeplyNested);
    expect(nestedResult).toMatchObject({
      status: 'invalid-preserved',
      error: 'PARAMETER_RECORD_LIMIT',
    });
    expect(nestedResult.bytes).toEqual(deeplyNested);
  });
});
