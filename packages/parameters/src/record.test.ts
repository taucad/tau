import { describe, expect, it } from 'vitest';
import { fileParameterRecordProfile } from '@taucad/types';
import { planParameterRecordMigration, readParameterRecord, serializeParameterRecord } from '#record.js';

const encoder = new TextEncoder();
const legacy = {
  activeGroup: 'default',
  groups: { default: { values: { width: 10 } } },
};

describe('parameter record persistence', () => {
  it('classifies current, legacy, unsupported, and invalid bytes without changing them', () => {
    const cases = [
      {
        bytes: encoder.encode(
          JSON.stringify({
            recordVersion: 1,
            profile: fileParameterRecordProfile,
            ...legacy,
          }),
        ),
        status: 'current',
      },
      {
        bytes: encoder.encode(JSON.stringify(legacy)),
        status: 'migration-ready',
      },
      {
        bytes: encoder.encode(JSON.stringify({ recordVersion: 2, profile: 'future', ...legacy })),
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

  it('migrates exact legacy bytes into a versioned record with a correlated backup receipt', async () => {
    const source = readParameterRecord(encoder.encode(` ${JSON.stringify(legacy)}\n`));
    expect(source.status).toBe('migration-ready');
    if (source.status !== 'migration-ready') {
      throw new Error('Expected a legacy record');
    }

    const migration = await planParameterRecordMigration(source, 'backup:revision-1');

    expect(migration.sourceDigest).toMatch(/^sha256:[0-9a-f]{64}$/u);
    expect(migration.record).toMatchObject({
      recordVersion: 1,
      profile: fileParameterRecordProfile,
      migration: {
        sourceDigest: migration.sourceDigest,
        backupRevision: 'backup:revision-1',
      },
      groups: legacy.groups,
    });
    expect(readParameterRecord(migration.bytes)).toMatchObject({
      status: 'current',
      record: migration.record,
    });
    expect(serializeParameterRecord(migration.record)).toEqual(migration.bytes);
  });

  it('classifies the same legacy bytes as readable when no migration owner exists', () => {
    const bytes = encoder.encode(JSON.stringify(legacy));
    expect(readParameterRecord(bytes, { migrationAvailable: false })).toEqual({
      status: 'legacy-readable',
      bytes,
      record: legacy,
    });
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
