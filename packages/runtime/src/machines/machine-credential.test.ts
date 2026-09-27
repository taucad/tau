import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { machineCredentialReference } from '#machines/machine-credential.js';

const shortDigest = (value: string): string => createHash('sha256').update(value).digest('hex').slice(0, 16);

describe('machineCredentialReference', () => {
  it('should keep a safe physical id as the reference segment', () => {
    expect(machineCredentialReference('bambu', '00M09A350100123')).toBe('vault:machine/bambu/00M09A350100123');
    expect(machineCredentialReference('bambu', 'a'.repeat(128))).toBe(`vault:machine/bambu/${'a'.repeat(128)}`);
  });

  it('should replace an unsafe or over-long physical id with the first 16 hex of its SHA-256', () => {
    for (const physicalId of ['serial/../other', 'x1c serial', 'séríal', 'a'.repeat(129)]) {
      expect(machineCredentialReference('bambu', physicalId)).toBe(
        `vault:machine/bambu/sha256-${shortDigest(physicalId)}`,
      );
    }
  });

  it('should map one printer to one reference, distinct per provider and printer', () => {
    const reference = machineCredentialReference('bambu', 'x1c serial');
    expect(machineCredentialReference('bambu', 'x1c serial')).toBe(reference);
    expect(machineCredentialReference('bambu', 'x1c serial 2')).not.toBe(reference);
    expect(machineCredentialReference('other', 'x1c serial')).not.toBe(reference);
  });

  it('should refuse an empty provider or physical id', () => {
    expect(() => machineCredentialReference('', 'serial')).toThrow(
      new TypeError('MACHINE_CREDENTIAL_REFERENCE_INVALID'),
    );
    expect(() => machineCredentialReference('bambu', '')).toThrow(
      new TypeError('MACHINE_CREDENTIAL_REFERENCE_INVALID'),
    );
  });
});
