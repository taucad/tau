import { describe, expect, it } from 'vitest';

import { validateWindowsSignature } from '#main/windows-signature.js';

const path = String.raw`C:\Users\Person\Downloads\Tau setup.exe`;
const publisher = 'CN=Tau Limited, O=Tau Limited, L=Auckland, C=NZ';
const signature = {
  path,
  status: 'Valid',
  subject: publisher,
  timestamp: 'CN=Trusted Timestamp',
  productVersion: '1.2.3',
  productName: 'Tau',
};
const expected = { path, publisher, timestampRequired: true, expectedVersion: '1.2.3', expectedProductName: 'Tau' };

describe('Windows Authenticode verdict', () => {
  it('should admit a trusted timestamped file from the exact publisher', () => {
    expect(() => {
      validateWindowsSignature(signature, expected);
    }).not.toThrow();
  });

  it.each([
    { ...signature, status: 'UnknownError' },
    { ...signature, status: 'NotSigned' },
    { ...signature, path: String.raw`C:\another.exe` },
    { ...signature, subject: 'CN=Tau Limited, O=Attacker, C=NZ' },
    { ...signature, timestamp: null },
    { ...signature, productVersion: '1.2.2' },
    { ...signature, productName: 'Tau Staging' },
    { ...signature, productVersion: null },
    { path, status: 'Valid' },
    null,
    'Valid',
  ])('should reject an incomplete or inconsistent trust verdict: %j', (value) => {
    expect(() => {
      validateWindowsSignature(value, expected);
    }).toThrow();
  });

  it('should reject an absent publisher even with a syntactically valid verdict', () => {
    expect(() => {
      validateWindowsSignature(signature, { ...expected, publisher: '' });
    }).toThrow();
  });
});
