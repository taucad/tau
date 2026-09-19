import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import { createDefaultEntry, createParameterEntry, serializeParameterEntry } from '#utils/parameter-config.utils.js';

describe('parameter project-creation records', () => {
  it('creates and serializes the current versioned record', () => {
    const entry = createParameterEntry({
      width: 10,
      options: { enabled: true },
    });

    expect(entry).toMatchObject({
      activeGroup: 'default',
      groups: {
        default: { values: { width: 10, options: { enabled: true } } },
      },
    });
    expect(JSON.parse(serializeParameterEntry(entry))).toEqual(entry);
    expect(createDefaultEntry().groups['default']?.values).toEqual({});
  });

  it('rejects values that cannot be represented by the current record', () => {
    expect(() => createParameterEntry({ width: Number.NaN })).toThrow(ZodError);
  });
});
