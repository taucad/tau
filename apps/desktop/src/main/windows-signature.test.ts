import { describe, expect, it } from 'vitest';

import {
  createWindowsPowerShellEnvironment,
  parseSigntoolVerification,
  validateWindowsSignature,
  windowsProductIdentity,
} from '#main/windows-signature.js';
import { desktopReleaseIdentity } from '#shared/desktop-release.js';

const path = String.raw`C:\Users\Person\Downloads\Tau setup.exe`;
const publisher = 'CN=Tau Limited, O=Tau Limited, L=Auckland, C=NZ';
const signature = {
  path,
  status: 'Valid',
  signatureType: 'Authenticode',
  osBinary: false,
  subject: publisher,
  embeddedSubject: publisher,
  timestamp: 'CN=Trusted Timestamp',
  productVersion: '1.2.3',
  productName: 'Tau',
};
const expected = {
  path,
  publisher,
  timestampRequired: true,
  expectedVersion: '1.2.3',
  expectedProductName: 'Tau',
};

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
    osBinary: true,
    subject: 'CN=Microsoft Windows, O=Microsoft Corporation, L=Redmond, S=Washington, C=US',
    embeddedSubject: publisher,
    timestamp: null,
    productVersion: '10.0.26100.7705',
    productName: 'Microsoft® Windows® Operating System',
  };
  const componentExpected = {
    path: componentPath,
    publisher,
    timestampRequired: true,
    allowWindowsComponent: true,
  };

  // `signtool verify /pa /all /v` checks only the embedded signature: chain, signature bytes and timestamp.
  const verifiedEmbedded = { verified: true, timestamped: true };

  it('should admit a Tau-signed Windows component whose embedded signature verifies', () => {
    expect(() => {
      validateWindowsSignature(windowsComponent, componentExpected, verifiedEmbedded);
    }).not.toThrow();
  });

  it.each([undefined, { verified: false, timestamped: true }, { verified: true, timestamped: false }])(
    'should reject a catalog-vouched component whose embedded signature is unverified: %j',
    (embedded) => {
      expect(() => {
        validateWindowsSignature(windowsComponent, componentExpected, embedded);
      }).toThrow();
    },
  );

  it('should never admit the application executable through the Windows component path', () => {
    const executable = String.raw`D:\a\tau\tau\out\installer-output\app\Tau.exe`;

    expect(() => {
      validateWindowsSignature(
        { ...windowsComponent, path: executable },
        { ...componentExpected, path: executable },
        verifiedEmbedded,
      );
    }).toThrow();
  });

  it('should report the file name and identity but never the directory', () => {
    const userPath = String.raw`C:\Users\Person\AppData\Local\tau-updater\pending\Tau setup.exe`;

    expect(() => {
      validateWindowsSignature({ ...signature, path: userPath, subject: 'CN=Other' }, { ...expected, path: userPath });
    }).toThrow(/"path":"Tau setup\.exe".*"subject":"CN=Other"/u);
    expect(() => {
      validateWindowsSignature({ ...signature, path: userPath, subject: 'CN=Other' }, { ...expected, path: userPath });
    }).not.toThrow(/Users|Person|AppData/u);
  });

  // Observed by route qualification run 44527145723 (jobs 135570680836 and 135570680866) on the installed Tau.exe of
  // desktop-staging@0.5.0-staging.1572. Electron Packager stamps the application executable with the channel's package
  // version and the product name Tau on every channel; only the NSIS installer carries the channel's product name.
  const stagingRelease = desktopReleaseIdentity('desktop-staging@0.5.0-staging.1572');
  const installedPath = String.raw`C:\Users\runneradmin\AppData\Local\Programs\tau-desktop\Tau.exe`;
  const installedExecutable = {
    path: installedPath,
    status: 'Valid',
    signatureType: 'Authenticode',
    osBinary: false,
    subject: publisher,
    embeddedSubject: publisher,
    timestamp: 'CN=Trusted Timestamp',
    productVersion: '1.15.72',
    productName: 'Tau',
  };

  it('should admit the installed staging Tau.exe under the application executable identity', () => {
    expect(windowsProductIdentity(stagingRelease, 'executable')).toEqual({
      expectedVersion: '1.15.72',
      expectedProductName: 'Tau',
    });
    expect(() => {
      validateWindowsSignature(installedExecutable, {
        path: installedPath,
        publisher,
        timestampRequired: true,
        ...windowsProductIdentity(stagingRelease, 'executable'),
      });
    }).not.toThrow();
  });

  it('should keep the channel product name for the installer', () => {
    expect(windowsProductIdentity(stagingRelease, 'installer')).toEqual({
      expectedVersion: '1.15.72',
      expectedProductName: 'Tau Staging',
    });
    expect(windowsProductIdentity({ channel: 'production', version: '0.5.0' }, 'installer')).toEqual({
      expectedVersion: '0.5.0',
      expectedProductName: 'Tau',
    });
  });

  it('should name only the disagreeing product field, without a directory', () => {
    const check = (): void => {
      validateWindowsSignature(installedExecutable, {
        path: installedPath,
        publisher,
        timestampRequired: true,
        expectedVersion: '1.15.72',
        expectedProductName: 'Tau Staging',
      });
    };

    // The field list ends at the first colon, so this also proves no other field is named.
    expect(check).toThrow(
      /^Windows signature disagrees with the required identity in productName \(expected "Tau Staging"\): \{"path":"Tau\.exe"/u,
    );
    expect(check).not.toThrow(/Users|runneradmin|AppData/u);
  });

  it.each([
    [{ productVersion: '1.15.71' }, 'productVersion (expected "1.15.72")'],
    [{ subject: 'CN=Other' }, 'subject'],
    [{ embeddedSubject: 'CN=Other' }, 'embeddedSubject'],
    [{ timestamp: null }, 'timestamp'],
    [{ signatureType: 'Catalog' }, 'signatureType'],
    [{ path: String.raw`C:\Users\runneradmin\Tau.exe` }, 'path'],
  ])('should name the disagreeing field %j', (change, field) => {
    expect(() => {
      validateWindowsSignature(
        { ...installedExecutable, ...change },
        {
          path: installedPath,
          publisher,
          timestampRequired: true,
          ...windowsProductIdentity(stagingRelease, 'executable'),
        },
      );
    }).toThrow(`disagrees with the required identity in ${field}:`);
  });

  it('should verify a correctly signed Tau update as the runtime updater requests it', () => {
    const update = String.raw`C:\Users\Person\AppData\Local\tau-staging-updater\pending\Tau-Staging-1.2.3-win-x64.exe`;

    expect(() => {
      validateWindowsSignature(
        { ...signature, path: update, productName: 'Tau Staging' },
        {
          path: update,
          publisher,
          timestampRequired: true,
          expectedVersion: '1.2.3',
          expectedProductName: 'Tau Staging',
        },
      );
    }).not.toThrow();
  });

  it('should reject a catalog verdict where only Tau binaries are admitted', () => {
    expect(() => {
      validateWindowsSignature(windowsComponent, {
        path: componentPath,
        publisher,
        timestampRequired: true,
      });
    }).toThrow();
  });

  it.each([
    { ...windowsComponent, osBinary: false },
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
    {
      ...windowsComponent,
      path: String.raw`D:\a\tau\tau\out\installer-output\app\Tau.exe`,
    },
  ])('should reject a Windows component verdict that is not an OS catalog over a Tau signature: %j', (value) => {
    expect(() => {
      validateWindowsSignature(value, componentExpected, verifiedEmbedded);
    }).toThrow();
  });

  const verifyOutput = (timestamp: string): string =>
    [
      String.raw`Verifying: D:\a\tau\tau\out\installer-output\app\d3dcompiler_47.dll`,
      '',
      'Signature Index: 0 (Primary Signature)',
      'Hash of file (sha256): 0F1E',
      '',
      'Signing Certificate Chain:',
      '    Issued to: Microsoft Identity Verification Root Certificate Authority 2020',
      '    Issued to: TAUCAD LIMITED',
      '',
      timestamp,
      '',
      String.raw`Successfully verified: D:\a\tau\tau\out\installer-output\app\d3dcompiler_47.dll`,
      '',
      'Number of files successfully Verified: 1',
      'Number of warnings: 0',
      'Number of errors: 0',
    ].join('\r\n');

  it('should read a verified, timestamped embedded signature from signtool', () => {
    expect(parseSigntoolVerification(verifyOutput('The signature is timestamped: Tue Nov 18 22:56:55 2026'))).toEqual({
      verified: true,
      timestamped: true,
    });
  });

  it.each([
    ['untimestamped', verifyOutput('File is not timestamped.'), { verified: true, timestamped: false }],
    [
      'catalog-verified',
      verifyOutput('The signature is timestamped: Tue Nov 18 22:56:55 2026').replace(
        'Signature Index: 0 (Primary Signature)',
        String.raw`File is signed in catalog: C:\Windows\system32\CatRoot\x.cat`,
      ),
      { verified: false, timestamped: false },
    ],
    [
      'errored',
      verifyOutput('The signature is timestamped: Tue Nov 18 22:56:55 2026').replace(
        'Number of errors: 0',
        'Number of errors: 1',
      ),
      { verified: false, timestamped: true },
    ],
    ['empty', '', { verified: false, timestamped: false }],
  ])('should not treat an %s signtool report as a verified timestamped signature', (_name, output, verdict) => {
    expect(parseSigntoolVerification(output)).toEqual(verdict);
  });

  it('should drop an inherited PowerShell 7 module path in any casing', () => {
    const parent: NodeJS.ProcessEnv = {};
    parent['PSModulePath'] = String.raw`C:\Program Files\PowerShell\7\Modules`;
    parent['psmodulepath'] = 'x';
    parent['Path'] = String.raw`C:\Windows`;

    expect(Object.entries(createWindowsPowerShellEnvironment(parent))).toEqual([['Path', String.raw`C:\Windows`]]);
  });
});
