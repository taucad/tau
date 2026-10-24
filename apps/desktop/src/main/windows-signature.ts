/** Windows trust evaluation shared by installer qualification and downloaded updates. */
import { execFile } from 'node:child_process';
import { win32 } from 'node:path';
import { promisify } from 'node:util';

import { z } from 'zod';

const signatureSchema = z.strictObject({
  path: z.string().min(1),
  status: z.literal('Valid'),
  subject: z.string().min(1),
  timestamp: z.string().min(1).nullable(),
  productVersion: z.string().nullable(),
  productName: z.string().nullable(),
});

/** Bind Windows' trust verdict to the requested file and complete publisher identity. */
export const validateWindowsSignature = (
  value: unknown,
  expected: {
    path: string;
    publisher: string;
    timestampRequired: boolean;
    expectedVersion?: string;
    expectedProductName?: string;
  },
): void => {
  const signature = signatureSchema.parse(value);
  if (
    !win32.isAbsolute(expected.path) ||
    !expected.publisher.trim() ||
    win32.normalize(signature.path).toLowerCase() !== win32.normalize(expected.path).toLowerCase() ||
    signature.subject !== expected.publisher ||
    (expected.timestampRequired && !signature.timestamp) ||
    (expected.expectedVersion !== undefined && signature.productVersion !== expected.expectedVersion) ||
    (expected.expectedProductName !== undefined && signature.productName !== expected.expectedProductName)
  ) {
    throw new Error(
      'Windows signature path, publisher, timestamp or signed product identity disagrees with the required identity',
    );
  }
};

const execute = promisify(execFile);
// File names are process data, never PowerShell source. ConvertTo-Json failure is fatal.
const verificationScript = `
$ErrorActionPreference = 'Stop'
$s = Get-AuthenticodeSignature -LiteralPath $env:TAU_SIGNATURE_FILE
if ($null -eq $s.SignerCertificate) { throw 'Missing signer certificate' }
$t = $null
if ($null -ne $s.TimeStamperCertificate) { $t = $s.TimeStamperCertificate.Subject }
$v = [System.Diagnostics.FileVersionInfo]::GetVersionInfo($env:TAU_SIGNATURE_FILE)
[ordered]@{productVersion=$v.ProductVersion;productName=$v.ProductName;path=$s.Path;status=$s.Status.ToString();subject=$s.SignerCertificate.Subject;timestamp=$t} | ConvertTo-Json -Compress
`;

/** Fail closed on tool errors, absent JSON/certificates, wrong publisher or untrusted files. */
export const verifyWindowsSignature = async (options: {
  path: string;
  publisher: string;
  timestampRequired?: boolean;
  expectedVersion?: string;
  expectedProductName?: string;
}): Promise<void> => {
  if (process.platform !== 'win32') {
    throw new Error('Authenticode verification requires Windows');
  }
  const windowsRoot = process.env['SystemRoot'];
  if (!windowsRoot || !win32.isAbsolute(windowsRoot) || !win32.isAbsolute(options.path)) {
    throw new Error('Windows signature verification requires absolute system and candidate paths');
  }
  const environment = { ...process.env };
  environment['TAU_SIGNATURE_FILE'] = options.path;
  const { stdout, stderr } = await execute(
    win32.join(windowsRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
    [
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-EncodedCommand',
      Buffer.from(verificationScript, 'utf16le').toString('base64'),
    ],
    {
      env: environment,
      timeout: 30_000,
      maxBuffer: 64 * 1024,
      windowsHide: true,
      encoding: 'utf8',
    },
  );
  if (stderr.trim()) {
    throw new Error('Windows signature verification reported a tool error');
  }
  validateWindowsSignature(JSON.parse(stdout), { ...options, timestampRequired: options.timestampRequired ?? true });
};
