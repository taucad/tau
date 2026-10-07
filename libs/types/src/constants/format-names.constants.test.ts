import { describe, expect, it } from 'vitest';
import { formatConfigurations } from '#constants/format-names.constants.js';
import { mimeTypes } from '#constants/mime-types.constants.js';

describe('formatConfigurations', () => {
  it('should describe exactly the extensions catalogued in mimeTypes', () => {
    expect(Object.keys(formatConfigurations).sort()).toEqual(Object.keys(mimeTypes).sort());
  });

  it('should give every format a non-empty name and description', () => {
    for (const [extension, configuration] of Object.entries(formatConfigurations)) {
      expect(configuration.name, extension).not.toBe('');
      expect(configuration.description, extension).not.toBe('');
    }
  });

  it('should name the EDA kernel export formats', () => {
    expect(formatConfigurations.csv.name).toBe('Comma-Separated Values (CSV)');
    expect(formatConfigurations.txt.name).toBe('Plain Text (TXT)');
    expect(formatConfigurations.json.name).toBe('JavaScript Object Notation (JSON)');
  });
});
