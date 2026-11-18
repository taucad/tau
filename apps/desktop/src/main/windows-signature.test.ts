import { describe, expect, it } from 'vitest';

import { createWindowsPowerShellEnvironment, validateWindowsSignature } from '#main/windows-signature.js';

const path = String.raw`C:\Users\Person\Downloads\Tau setup.exe`;
const publisher = 'CN=Tau Limited, O=Tau Limited, L=Auckland, C=NZ';
const signature = {
  path,
  status: 'Valid',
  signatureType: 'Authenticode',
  isOSBinary: false,
  subject: publisher,
  embeddedSubject: publisher,
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
    { ...signature, embeddedSubject: 'CN=Tau Limited, O=Attacker, C=NZ' },
    { ...signature, embeddedSubject: null },
    { ...signature, signatureType: 'Catalog' },
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

  // Observed in candidate run 44415372548: Electron's d3dcompiler_47.dll is a Windows build (10.0.26100.7705) whose
  // bytes are in the windows-2025 host's OS catalog, so Get-AuthenticodeSignature reports the catalog signer, not the
  // Tau signature signtool just embedded (the Authenticode hash excludes the embedded signature).
  const componentPath = String.raw`D:\a\tau\tau\out\installer-output\app\d3dcompiler_47.dll`;
  const windowsComponent = {
    path: componentPath,
    status: 'Valid',
    signatureType: 'Catalog',
    isOSBinary: true,
    subject: 'CN=Microsoft Windows, O=Microsoft Corporation, L=Redmond, S=Washington, C=US',
    embeddedSubject: publisher,
    timestamp: null,
    productVersion: '10.0.26100.7705',
    productName: 'Microsoft® Windows® Operating System',
  };
  const componentExpected = { path: componentPath, publisher, timestampRequired: true, allowWindowsComponent: true };

  it('should admit a Tau-signed Windows component that Windows verifies by its OS catalog', () => {
    expect(() => {
      validateWindowsSignature(windowsComponent, componentExpected);
    }).not.toThrow();
  });

  it('should reject a catalog verdict where only Tau binaries are admitted', () => {
    expect(() => {
      validateWindowsSignature(windowsComponent, { path: componentPath, publisher, timestampRequired: true });
    }).toThrow();
  });

  it.each([
    { ...windowsComponent, isOSBinary: false },
    { ...windowsComponent, signatureType: 'Authenticode' },
    {
      ...windowsComponent,
      subject: 'CN=Microsoft Corporation, O=Microsoft Corporation, L=Redmond, S=Washington, C=US',
    },
    { ...windowsComponent, subject: publisher },
    { ...windowsComponent, embeddedSubject: null },
    {
      ...windowsComponent,
      embeddedSubject: 'CN=Microsoft Corporation, O=Microsoft Corporation, L=Redmond, S=Washington, C=US',
    },
    { ...windowsComponent, status: 'HashMismatch' },
    { ...windowsComponent, path: String.raw`D:\a\tau\tau\out\installer-output\app\Tau.exe` },
  ])('should reject a Windows component verdict that is not an OS catalog over a Tau signature: %j', (value) => {
    expect(() => {
      validateWindowsSignature(value, componentExpected);
    }).toThrow();
  });

  it('should drop an inherited PowerShell 7 module path in any casing', () => {
    const parent: NodeJS.ProcessEnv = {};
    parent['PSModulePath'] = String.raw`C:\Program Files\PowerShell\7\Modules`;
    parent['psmodulepath'] = 'x';
    parent['Path'] = String.raw`C:\Windows`;

    expect(Object.entries(createWindowsPowerShellEnvironment(parent))).toEqual([['Path', String.raw`C:\Windows`]]);
  });
});
