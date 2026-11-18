/** Windows trust evaluation shared by installer qualification and downloaded updates. */
import { execFile } from 'node:child_process';
import { win32 } from 'node:path';
import { promisify } from 'node:util';

import { z } from 'zod';

const signatureSchema = z.strictObject({
  path: z.string().min(1),
  status: z.literal('Valid'),
  signatureType: z.string().min(1),
  osBinary: z.boolean(),
  subject: z.string().min(1),
  embeddedSubject: z.string().min(1).nullable(),
  timestamp: z.string().min(1).nullable(),
  productVersion: z.string().nullable(),
  productName: z.string().nullable(),
});

/** The signer Windows reports for its own operating-system components through the OS catalog. */
const windowsComponentSigner = 'CN=Microsoft Windows, O=Microsoft Corporation, L=Redmond, S=Washington, C=US';

/**
 * Bind Windows' trust verdict to the requested file and complete publisher identity.
 *
 * Get-AuthenticodeSignature consults the OS catalog before the embedded signature, and the Authenticode hash excludes
 * the embedded signature. A Windows component that Tau re-signs (Electron ships d3dcompiler_47.dll from a Windows build)
 * therefore still reports the catalog signer. `allowWindowsComponent` admits exactly that verdict: Windows itself vouches
 * for the bytes as an OS component and the embedded signer is Tau's. Every other file must carry a valid, timestamped,
 * embedded signature from the exact publisher.
 */
export const validateWindowsSignature = (
  value: unknown,
  expected: {
    path: string;
    publisher: string;
    timestampRequired: boolean;
    expectedVersion?: string;
    expectedProductName?: string;
    allowWindowsComponent?: boolean;
  },
): void => {
  const signature = signatureSchema.parse(value);
  const embeddedPublisher =
    signature.signatureType === 'Authenticode' &&
    !signature.osBinary &&
    signature.subject === expected.publisher &&
    !(expected.timestampRequired && !signature.timestamp);
  const windowsComponent =
    expected.allowWindowsComponent === true &&
    signature.signatureType === 'Catalog' &&
    signature.osBinary &&
    signature.subject === windowsComponentSigner;
  if (
    !win32.isAbsolute(expected.path) ||
    !expected.publisher.trim() ||
    win32.normalize(signature.path).toLowerCase() !== win32.normalize(expected.path).toLowerCase() ||
    signature.embeddedSubject !== expected.publisher ||
    !(embeddedPublisher || windowsComponent) ||
    (expected.expectedVersion !== undefined && signature.productVersion !== expected.expectedVersion) ||
    (expected.expectedProductName !== undefined && signature.productName !== expected.expectedProductName)
  ) {
    // Certificate subjects and product fields are public identity, never secrets; print them so a failure is diagnosable.
    const observed = { ...signature, timestamp: signature.timestamp !== null };
    throw new Error(
      `Windows signature path, publisher, timestamp or signed product identity disagrees with the required identity: ${JSON.stringify(observed)}`,
    );
  }
};

const execute = promisify(execFile);
// File names are process data, never PowerShell source. ConvertTo-Json failure is fatal.
// With stderr redirected, Windows PowerShell 5.1 writes progress records (such as "Preparing modules
// for first use") to stderr as CLIXML; they are not errors, so the progress stream is silenced.
// CreateFromSignedFile reads only the embedded signer, so it names Tau's signature even when the verdict is the catalog's.
const verificationScript = `
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$s = Get-AuthenticodeSignature -LiteralPath $env:TAU_SIGNATURE_FILE
if ($null -eq $s.SignerCertificate) { throw 'Missing signer certificate' }
$t = $null
if ($null -ne $s.TimeStamperCertificate) { $t = $s.TimeStamperCertificate.Subject }
$e = $null
try { $e = [System.Security.Cryptography.X509Certificates.X509Certificate]::CreateFromSignedFile($env:TAU_SIGNATURE_FILE).Subject } catch { $e = $null }
$v = [System.Diagnostics.FileVersionInfo]::GetVersionInfo($env:TAU_SIGNATURE_FILE)
[ordered]@{productVersion=$v.ProductVersion;productName=$v.ProductName;path=$s.Path;status=$s.Status.ToString();signatureType=$s.SignatureType.ToString();osBinary=[bool]$s.IsOSBinary;subject=$s.SignerCertificate.Subject;embeddedSubject=$e;timestamp=$t} | ConvertTo-Json -Compress
`;

/**
 * Windows PowerShell 5.1 must rebuild its own module path. A PSModulePath inherited from a
 * PowerShell 7 parent (the default GitHub Actions Windows shell) makes 5.1 autoload the Core
 * Microsoft.PowerShell.Security module, which it cannot load, so Get-AuthenticodeSignature fails.
 */
export const createWindowsPowerShellEnvironment = (parent: NodeJS.ProcessEnv): NodeJS.ProcessEnv => {
  const environment: NodeJS.ProcessEnv = {};
  for (const [name, value] of Object.entries(parent)) {
    if (name.toLowerCase() !== 'psmodulepath') {
      environment[name] = value;
    }
  }
  return environment;
};

/** Fail closed on tool errors, absent JSON/certificates, wrong publisher or untrusted files. */
export const verifyWindowsSignature = async (options: {
  path: string;
  publisher: string;
  timestampRequired?: boolean;
  expectedVersion?: string;
  expectedProductName?: string;
  allowWindowsComponent?: boolean;
}): Promise<void> => {
  if (process.platform !== 'win32') {
    throw new Error('Authenticode verification requires Windows');
  }
  const windowsRoot = process.env['SystemRoot'];
  if (!windowsRoot || !win32.isAbsolute(windowsRoot) || !win32.isAbsolute(options.path)) {
    throw new Error('Windows signature verification requires absolute system and candidate paths');
  }
  const environment = createWindowsPowerShellEnvironment(process.env);
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
    throw new Error(`Windows signature verification reported a tool error: ${stderr.trim().slice(0, 1000)}`);
  }
  validateWindowsSignature(JSON.parse(stdout), { ...options, timestampRequired: options.timestampRequired ?? true });
};
