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

/** The signtool verdict on a file's embedded signature alone (`signtool verify /pa /all /v` never consults a catalog). */
export type EmbeddedSignatureVerdict = { verified: boolean; timestamped: boolean };

/**
 * Read `signtool verify /pa /all /v` output. Verified means signtool reported success with no errors and no catalog;
 * timestamped means every reported signature carries a verified timestamp.
 */
export const parseSigntoolVerification = (output: string): EmbeddedSignatureVerdict => {
  const signatures = output.match(/^Signature Index: \d+/gmu)?.length ?? 0;
  const timestamps = output.match(/^The signature is timestamped: /gmu)?.length ?? 0;
  const verified =
    signatures > 0 &&
    !/signed in catalog/iu.test(output) &&
    /^Successfully verified: /mu.test(output) &&
    /^Number of errors: 0\s*$/mu.test(output);
  return { verified, timestamped: signatures > 0 && timestamps === signatures };
};

/** The signer Windows reports for its own operating-system components through the OS catalog. */
const windowsComponentSigner = 'CN=Microsoft Windows, O=Microsoft Corporation, L=Redmond, S=Washington, C=US';

type WindowsSignatureExpectation = {
  path: string;
  publisher: string;
  timestampRequired: boolean;
  expectedVersion?: string;
  expectedProductName?: string;
  allowWindowsComponent?: boolean;
};

/** Name each field that disagrees, by the observed report's key; product fields add their public expected value. */
const identityDisagreements = (
  signature: z.infer<typeof signatureSchema>,
  expected: WindowsSignatureExpectation,
  trustedSigner: boolean,
): string[] => {
  const disagreements: string[] = [];
  if (
    !win32.isAbsolute(expected.path) ||
    win32.normalize(signature.path).toLowerCase() !== win32.normalize(expected.path).toLowerCase()
  ) {
    disagreements.push('path');
  }
  if (!expected.publisher.trim() || signature.embeddedSubject !== expected.publisher) {
    disagreements.push('embeddedSubject');
  }
  if (!trustedSigner) {
    if (signature.signatureType !== 'Authenticode' || signature.osBinary) {
      disagreements.push('signatureType');
    }
    if (signature.subject !== expected.publisher) {
      disagreements.push('subject');
    }
    if (expected.timestampRequired && !signature.timestamp) {
      disagreements.push('timestamp');
    }
  }
  if (expected.expectedVersion !== undefined && signature.productVersion !== expected.expectedVersion) {
    disagreements.push(`productVersion (expected ${JSON.stringify(expected.expectedVersion)})`);
  }
  if (expected.expectedProductName !== undefined && signature.productName !== expected.expectedProductName) {
    disagreements.push(`productName (expected ${JSON.stringify(expected.expectedProductName)})`);
  }
  return disagreements;
};

/**
 * Bind Windows' trust verdict to the requested file and complete publisher identity.
 *
 * Get-AuthenticodeSignature consults the OS catalog before the embedded signature, and the Authenticode hash excludes
 * the embedded signature. A Windows component that Tau re-signs (Electron ships d3dcompiler_47.dll from a Windows build)
 * therefore still reports the catalog signer. `allowWindowsComponent` admits exactly that verdict, never for Tau.exe,
 * when Windows vouches for the bytes as an OS component, the embedded signer is Tau's and signtool independently verified
 * the embedded signature's chain, bytes and timestamp (`embedded`). Every other file must carry a valid, timestamped,
 * embedded signature from the exact publisher.
 */
export const validateWindowsSignature = (
  value: unknown,
  expected: WindowsSignatureExpectation,
  embedded?: EmbeddedSignatureVerdict,
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
    signature.subject === windowsComponentSigner &&
    win32.basename(expected.path).toLowerCase() !== 'tau.exe' &&
    embedded?.verified === true &&
    (!expected.timestampRequired || embedded.timestamped);
  const disagreements = identityDisagreements(signature, expected, embeddedPublisher || windowsComponent);
  if (disagreements.length > 0) {
    // Certificate subjects and product fields are public identity, never secrets; print them so a failure is diagnosable.
    // Reports never carry a directory (a runtime update lives under the user's profile), only the file name.
    const observed = {
      ...signature,
      path: win32.basename(signature.path),
      timestamp: signature.timestamp !== null,
      embedded,
    };
    throw new Error(
      `Windows signature disagrees with the required identity in ${disagreements.join(', ')}: ${JSON.stringify(observed)}`,
    );
  }
};

/**
 * The signed product identity of a Windows release file. The NSIS installer carries the channel's product name (Tau
 * Staging on staging). The application executable, Tau.exe, is stamped by Electron Packager in package-desktop.mts with
 * the product name Tau on every channel, the same as the Mac bundle; its channel is bound by its bytes, its ASAR
 * manifest and its installation marker instead. Both carry the channel's package version.
 */
export const windowsProductIdentity = (
  release: { readonly channel: 'production' | 'staging'; readonly version: string },
  file: 'installer' | 'executable',
): { expectedVersion: string; expectedProductName: string } => ({
  expectedVersion: release.version,
  expectedProductName: file === 'installer' && release.channel === 'staging' ? 'Tau Staging' : 'Tau',
});

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
  /** Absolute signtool.exe, required to admit a catalog-vouched Windows component. */
  signtool?: string;
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
  const verdict: unknown = JSON.parse(stdout);
  const { signtool, ...expected } = options;
  let embedded: EmbeddedSignatureVerdict | undefined;
  if (
    options.allowWindowsComponent &&
    signtool &&
    win32.isAbsolute(signtool) &&
    signatureSchema.safeParse(verdict).data?.signatureType === 'Catalog'
  ) {
    // Without /a, signtool verifies only the embedded signature; a nonzero exit rejects the promise.
    const report = await execute(signtool, ['verify', '/pa', '/all', '/v', options.path], {
      timeout: 60_000,
      maxBuffer: 1024 * 1024,
      windowsHide: true,
      encoding: 'utf8',
    });
    embedded = parseSigntoolVerification(report.stdout);
  }
  validateWindowsSignature(verdict, { ...expected, timestampRequired: options.timestampRequired ?? true }, embedded);
};
