import { describe, expect, it } from 'vitest';
import { fileParameterRecordProfile } from '@taucad/types';
import { readParameterRecord, serializeParameterRecord } from '#record.js';

const encoder = new TextEncoder();
const unversioned = {
  activeGroup: 'default',
  groups: { default: { values: { width: 10 } } },
};

describe('parameter record persistence', () => {
  it('classifies current, unsupported, and invalid bytes without changing them', () => {
    const cases = [
      {
        bytes: encoder.encode(
          JSON.stringify({
            recordVersion: 1,
            profile: fileParameterRecordProfile,
            ...unversioned,
          }),
        ),
        status: 'current',
      },
      {
        bytes: encoder.encode(JSON.stringify(unversioned)),
        status: 'invalid-preserved',
      },
      {
        bytes: encoder.encode(JSON.stringify({ recordVersion: 2, profile: 'future', ...unversioned })),
        status: 'unsupported-preserved',
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

  it('round-trips a serialized record byte for byte', () => {
    const record = { recordVersion: 1, profile: fileParameterRecordProfile, ...unversioned } as const;
    const bytes = serializeParameterRecord(record);
    expect(readParameterRecord(bytes)).toEqual({ status: 'current', bytes, record });
  });

  it('serializes permuted value and binding keys to identical canonical bytes', () => {
    const binding = {
      parameter: { value: 'width', stability: 'stable' },
      schema: { resource: 'urn:taucad:parameter-schema:root', pointer: '/width' },
      unit: 'mm',
      representation: 'binary64',
    } as const;
    const permuted = {
      representation: 'binary64',
      unit: 'mm',
      schema: { pointer: '/width', resource: 'urn:taucad:parameter-schema:root' },
      parameter: { stability: 'stable', value: 'width' },
    } as const;
    const left = {
      recordVersion: 1,
      profile: fileParameterRecordProfile,
      activeGroup: 'default',
      groups: {
        default: { values: { width: 1, height: 2 }, bindings: { '/width': binding, '/height': binding } },
      },
    } as const;
    const right = {
      groups: {
        default: { bindings: { '/height': permuted, '/width': permuted }, values: { height: 2, width: 1 } },
      },
      activeGroup: 'default',
      profile: fileParameterRecordProfile,
      recordVersion: 1,
    } as const;
    const bytes = serializeParameterRecord(left);
    expect(serializeParameterRecord(right)).toEqual(bytes);
    const lines = new TextDecoder().decode(bytes).split('\n');
    expect(lines[1]).toContain('"recordVersion": 1');
    expect(lines[2]).toContain('"profile"');
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
