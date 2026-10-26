/** Native Windows qualification: install only the initial candidate and report measured identity/security. */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, mkdtemp, readFile, readdir, realpath, rm, rmdir, unlink, writeFile, mkdir } from 'node:fs/promises';
import { setTimeout as wait } from 'node:timers/promises';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { extractFile, uncache } from '@electron/asar';
import { z } from 'zod';
import { verifyWindowsSignature } from '#main/windows-signature.js';
import { parseDesktopInstallation } from '#main/update-identity.js';
import { parseDesktopArtifactManifest } from '#shared/desktop-release.js';
/* oxlint-disable no-restricted-imports -- Native qualification scripts share one driver contract. */
import { createQualificationReinstallGuard, QualificationUnavailable } from './qualification-platform-types.mjs';
import type {
  QualificationCandidate,
  QualificationDriverOptions,
  QualificationPlatformDriver,
} from './qualification-platform-types.mjs';
import {
  assertWindowsConsumerHost,
  assertWindowsConsumerManual,
  hasWindowsInternetZone,
  windowsConsumerHostDigest,
} from './qualification-evidence.mjs';
import type {
  WindowsConsumerHost,
  WindowsConsumerInstall,
  WindowsConsumerAcceptance,
} from './qualification-evidence.mjs';
/* oxlint-enable no-restricted-imports */

const hashFile = async (path: string): Promise<string> => {
  const info = await lstat(path);
  const canonical = await realpath(path);
  if (!info.isFile() || canonical.toLowerCase() !== resolve(path).toLowerCase()) {
    throw new Error('Qualification requires a canonical regular file');
  }
  const hash = createHash('sha256');
  for await (const bytes of createReadStream(path)) {
    if (!(bytes instanceof Uint8Array)) {
      throw new Error('Expected binary file data');
    }
    hash.update(bytes);
  }
  return hash.digest('hex');
};
const host = (): string => {
  if (
    process.platform !== 'win32' ||
    process.arch !== 'x64' ||
    process.env['TAU_QUALIFICATION_DISPOSABLE_HOST'] !== '1'
  ) {
    throw new QualificationUnavailable('Windows x64 disposable-host authorization is required');
  }
  const root = process.env['SystemRoot'];
  if (!root || !isAbsolute(root)) {
    throw new QualificationUnavailable('Absolute Windows system root unavailable');
  }
  return join(root, 'System32/WindowsPowerShell/v1.0/powershell.exe');
};
const powershell = (script: string, environment: Record<string, string> = {}): unknown => {
  const result = spawnSync(
    host(),
    [
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-EncodedCommand',
      Buffer.from(`$ErrorActionPreference='Stop'; ${script}`, 'utf16le').toString('base64'),
    ],
    { env: { ...process.env, ...environment }, encoding: 'utf8', timeout: 60_000, maxBuffer: 1024 * 1024 },
  );
  if (result.status !== 0) {
    throw new QualificationUnavailable(`Windows observation failed: ${result.stderr || result.error?.message}`);
  }
  return JSON.parse(result.stdout) as unknown;
};
const tokenInterop = String.raw`Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class TauQualificationToken {
 [DllImport("kernel32.dll")] static extern IntPtr OpenProcess(uint access, bool inherit, int pid);
 [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
 [DllImport("advapi32.dll")] static extern bool OpenProcessToken(IntPtr process, uint access, out IntPtr token);
 [DllImport("advapi32.dll")] static extern bool GetTokenInformation(IntPtr token, int type, IntPtr data, int size, out int needed);
 [DllImport("advapi32.dll")] static extern IntPtr GetSidSubAuthorityCount(IntPtr sid);
 [DllImport("advapi32.dll")] static extern IntPtr GetSidSubAuthority(IntPtr sid, uint index);
 [DllImport("kernel32.dll", SetLastError=true)] static extern bool IsWow64Process2(IntPtr process, out ushort processMachine, out ushort nativeMachine);
 [DllImport("shell32.dll")] static extern int SHGetKnownFolderPath([MarshalAs(UnmanagedType.LPStruct)] Guid folder, uint flags, IntPtr token, out IntPtr path);
 public static string Programs() {
  IntPtr path; int result=SHGetKnownFolderPath(new Guid("5CD7AEE2-2219-4A67-B85D-6C9CE15660CB"),0x4000,IntPtr.Zero,out path);
  try {if(result!=0) throw new Exception("UserProgramFiles unavailable"); return Marshal.PtrToStringUni(path);}
  finally {if(path!=IntPtr.Zero) Marshal.FreeCoTaskMem(path);}
 }
 public static int[] Machine(int pid) {
  var process=OpenProcess(0x1000,false,pid);
  try { ushort emulated,native; if(process==IntPtr.Zero || !IsWow64Process2(process,out emulated,out native)) throw new Exception("Cannot observe native machine"); return new int[]{emulated,native}; }
  finally {if(process!=IntPtr.Zero) CloseHandle(process);}
 }
 public static int Read(int pid, int type) {
  var process=OpenProcess(0x1000,false,pid); IntPtr token=IntPtr.Zero;
  try { if(process==IntPtr.Zero || !OpenProcessToken(process,8,out token)) throw new Exception("Cannot inspect process token");
   int needed; GetTokenInformation(token,type,IntPtr.Zero,0,out needed); var data=Marshal.AllocHGlobal(needed);
   try { if(!GetTokenInformation(token,type,data,needed,out needed)) throw new Exception("Cannot inspect token information");
    if(type==25) {var sid=Marshal.ReadIntPtr(data); var count=Marshal.ReadByte(GetSidSubAuthorityCount(sid)); return Marshal.ReadInt32(GetSidSubAuthority(sid,(uint)(count-1)));}
    return Marshal.ReadInt32(data);
   } finally {Marshal.FreeHGlobal(data);}
  } finally {if(token!=IntPtr.Zero) CloseHandle(token); if(process!=IntPtr.Zero) CloseHandle(process);}
 }
}
'@`;

/** Read native OS/token/security state before any qualification profile is created. */
export const observeWindowsConsumerHost = (runner: string): WindowsConsumerHost => {
  const value = powershell(
    String.raw`${tokenInterop}
$os=Get-CimInstance Win32_OperatingSystem;
$identity=[Security.Principal.WindowsIdentity]::GetCurrent();
$machine=[TauQualificationToken]::Machine($PID);
$defender=$null; try { $mp=Get-MpComputerStatus; $defender=@{service=$mp.AMServiceEnabled;antivirus=$mp.AntivirusEnabled;realTime=$mp.RealTimeProtectionEnabled;mode=$mp.AMRunningMode} } catch {}
$existing=@(); foreach($path in @((Join-Path $env:APPDATA 'Tau'),(Join-Path $env:APPDATA 'Tau Staging'))) {if(Test-Path -LiteralPath $path){$existing+='profile'}};
$registrations=@(Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*','HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*','HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*' -ErrorAction SilentlyContinue | Where-Object {$_.DisplayName -in @('Tau','Tau Staging')}); if($registrations.Count){$existing+='installation'};
$hash=[Security.Cryptography.SHA256]::Create(); try {$idHash=([BitConverter]::ToString($hash.ComputeHash([Text.Encoding]::UTF8.GetBytes($env:COMPUTERNAME+':'+$identity.User.Value)))).Replace('-','').ToLowerInvariant()} finally {$hash.Dispose()};
if([Diagnostics.Process]::GetCurrentProcess().SessionId -eq 0 -or ![Environment]::UserInteractive){throw 'Interactive consumer desktop unavailable'};
@{runner=$env:TAU_Q_RUNNER;identity=$idHash;osVersion=($os.Caption+' '+$os.Version);productType=[int]$os.ProductType;build=[int]$os.BuildNumber;processMachine=$machine[0];nativeMachine=$machine[1];elevated=[TauQualificationToken]::Read($PID,20);elevationType=[TauQualificationToken]::Read($PID,18);administrator=(@($identity.Groups | Where-Object {$_.Value -eq 'S-1-5-32-544'}).Count -gt 0);uacEnabled=(Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System').EnableLUA;defender=$defender;existing=$existing}|ConvertTo-Json -Depth 5 -Compress`,
    Object.fromEntries([['TAU_Q_RUNNER', runner]]),
  );
  return assertWindowsConsumerHost(value, false);
};
/** Admit an absent native-selected destination, including an absent Programs root, without creating it. */
export const admitWindowsConsumerDestination = async (programs: string, retained: boolean): Promise<string> => {
  if (!isAbsolute(programs) || retained) {
    throw new QualificationUnavailable('Consumer destination or retained installer registration already exists');
  }
  const destination = join(programs, 'tau-desktop');
  let ancestor = destination;
  // Missing ancestors are permitted; the first existing ancestor must resolve without links/reparse redirection.
  /* oxlint-disable no-await-in-loop -- Walk ancestors in dependency order; no path is created. */
  for (;;) {
    const info = await lstat(ancestor).catch((error: unknown) => {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        return undefined;
      }
      throw error;
    });
    if (info) {
      const canonical = await realpath(ancestor);
      if (
        ancestor === destination ||
        !info.isDirectory() ||
        canonical.toLowerCase() !== resolve(ancestor).toLowerCase()
      ) {
        throw new QualificationUnavailable('Consumer destination exists or its parent redirects');
      }
      return destination;
    }
    const parent = dirname(ancestor);
    if (parent === ancestor) {
      throw new QualificationUnavailable('Consumer destination has no canonical parent');
    }
    ancestor = parent;
  }
  /* oxlint-enable no-await-in-loop */
};

type WindowsConsumerRun = {
  host: WindowsConsumerHost;
  nonce: string;
  directory: string;
  origin: string;
  download(options: { url: string; directory: string; name: string }): Promise<{ path: string; browser: string }>;
};

/** Remove only the unchanged in-place NSIS uninstaller and its otherwise empty, canonical directory. */
export const removeWindowsUninstallerRemainder = async (options: {
  installationPath: string;
  uninstaller: string;
  sha256: string;
}): Promise<void> => {
  const { installationPath, uninstaller, sha256 } = options;
  const info = await lstat(installationPath).catch((error: unknown) => {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return undefined;
    }
    throw error;
  });
  if (!info) {
    return;
  }
  const canonical = await realpath(installationPath);
  if (
    !info.isDirectory() ||
    canonical.toLowerCase() !== resolve(installationPath).toLowerCase() ||
    !/^Uninstall[^/\\]*\.exe$/iu.test(uninstaller)
  ) {
    throw new Error('Uninstaller remainder path redirects or is invalid');
  }
  const remaining = await readdir(installationPath);
  if (remaining.some((name) => name !== uninstaller)) {
    throw new Error('Uninstaller retained unexpected installation contents');
  }
  if (remaining.length > 0) {
    const path = join(installationPath, uninstaller);
    if ((await hashFile(path)) !== sha256) {
      throw new Error('Uninstaller remainder bytes changed');
    }
    await unlink(path);
  }
  // Never recursively remove the directory: concurrent or unexpected contents must refuse cleanup.
  await rmdir(installationPath);
};

/** Wait for a complete JSON response; incomplete writes are retried only until the caller's deadline (milliseconds). */
export const readWindowsConsumerResponse = async (path: string, deadline: number): Promise<unknown> => {
  /* oxlint-disable no-await-in-loop -- Poll one operator response in order until its bounded deadline. */
  while (Date.now() < deadline) {
    try {
      return JSON.parse(await readFile(path, 'utf8')) as unknown;
    } catch (error) {
      if (!(error instanceof SyntaxError) && !(error instanceof Error && 'code' in error && error.code === 'ENOENT')) {
        throw error;
      }
    }
    await wait(Math.min(1000, Math.max(0, deadline - Date.now())));
  }
  /* oxlint-enable no-await-in-loop */
  throw new Error('Consumer response deadline expired');
};

const executeInstaller = (path: string, args: string[]): void => {
  host();
  const result = spawnSync(path, args, { windowsVerbatimArguments: true, encoding: 'utf8', timeout: 180_000 });
  if (result.status !== 0) {
    throw new Error(`Installer failed: ${result.status} ${result.stderr} ${result.error?.message ?? ''}`);
  }
};
const packageSchema = z.object({
  version: z.string(),
  tauDesktop: z.object({
    channel: z.enum(['production', 'staging']).default('production'),
    sourceCommit: z.string(),
    environmentOverrides: z.literal(false).optional(),
  }),
});
/** Admission mirrors desktopManifestFields: production and disabled overrides are omitted. */
export const windowsQualificationPackageSchema = packageSchema;

/** Check exact installer bytes before granting the native installer any execution authority. */
export const verifyWindowsQualificationArtifact = async (candidate: QualificationCandidate): Promise<string> => {
  const manifest = parseDesktopArtifactManifest(candidate.manifest);
  if (candidate.route !== 'windows-nsis') {
    throw new Error('Wrong Windows route');
  }
  const artifact = manifest.artifacts.find((item) => item.kind === 'windows-nsis');
  if (!artifact) {
    throw new Error('Missing NSIS artifact');
  }
  const path = join(candidate.artifactDirectory, artifact.name);
  const info = await lstat(path);
  if ((await hashFile(path)) !== artifact.sha256 || info.size !== artifact.size) {
    throw new Error('NSIS candidate bytes differ');
  }
  return path;
};

/** Extract exact authenticated NSIS payload bytes without executing the installer. */
export const windowsQualificationPayloadHashes = async (
  candidate: QualificationCandidate,
): Promise<{ executableSha256: string; asarSha256: string }> => {
  const installer = await verifyWindowsQualificationArtifact(candidate);
  const scratch = await realpath(await mkdtemp(join(tmpdir(), 'tau-qualification-nsis-')));
  const unpack = (source: string, destination: string): void => {
    const result = spawnSync('7z', ['x', '-y', `-o${destination}`, source], {
      encoding: 'utf8',
      timeout: 180_000,
      maxBuffer: 1024 * 1024,
    });
    if (result.status !== 0) {
      throw new QualificationUnavailable(`NSIS payload extraction failed: ${result.stderr || result.error?.message}`);
    }
  };
  try {
    const container = join(scratch, 'container');
    unpack(installer, container);
    const entries = await readdir(container, { recursive: true, withFileTypes: true });
    const archives = entries.filter((entry) => entry.isFile() && entry.name === 'app-64.7z');
    if (archives.length !== 1) {
      throw new Error('NSIS must contain exactly one x64 payload');
    }
    const payload = join(scratch, 'payload');
    unpack(join(archives[0]!.parentPath, archives[0]!.name), payload);
    return {
      executableSha256: await hashFile(join(payload, 'Tau.exe')),
      asarSha256: await hashFile(join(payload, 'resources/app.asar')),
    };
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
};

/** Release mode requires a configured exact Authenticode publisher; fixture mode is diagnostic only. */
export const createWindowsQualificationDriver = (
  options: QualificationDriverOptions & { publisher?: string; cleanHost?: WindowsConsumerRun },
): QualificationPlatformDriver & { windowsAcceptance?(): WindowsConsumerAcceptance } => {
  host();
  let { installationPath } = options;
  if (!isAbsolute(installationPath) || /["\r\n]/u.test(installationPath)) {
    throw new Error('Unsafe installation path');
  }
  if (options.mode === 'release' && !options.publisher?.trim()) {
    throw new QualificationUnavailable('Release qualification requires the configured Authenticode publisher');
  }
  if (options.cleanHost && options.mode !== 'release') {
    throw new QualificationUnavailable('Consumer qualification requires signed release candidates');
  }
  const installs: WindowsConsumerInstall[] = [];
  const visibleInstall = async (candidate: QualificationCandidate, stage: 'initial' | 'reinstall'): Promise<void> => {
    const run = options.cleanHost!;
    const manifest = parseDesktopArtifactManifest(candidate.manifest);
    if (manifest.channel !== 'staging') {
      throw new Error('Consumer qualification is staging only');
    }
    // Package-windows.mts uses oneClick/per-user with maker name tau-desktop. NSIS 26.18 resolves
    // UserProgramFiles/tau-desktop, unless its UUID-v5 application registration retains a previous location.
    const destination = z.strictObject({ programs: z.string(), retained: z.boolean() }).parse(
      powershell(String.raw`${tokenInterop}
@{programs=[TauQualificationToken]::Programs();retained=(Test-Path 'HKCU:\Software\0a1de57f-6fb2-5d9c-9ba2-127e3cd9dca5')}|ConvertTo-Json -Compress`),
    );
    const selectedPath = await admitWindowsConsumerDestination(destination.programs, destination.retained);
    if (stage === 'reinstall' && selectedPath.toLowerCase() !== installationPath.toLowerCase()) {
      throw new Error('Consumer destination changed');
    }
    installationPath = selectedPath;
    const artifact = manifest.artifacts.find((entry) => entry.kind === 'windows-nsis')!;
    const directory = join(run.directory, stage);
    await mkdir(directory, { recursive: false });
    const url = new URL(`/releases/${encodeURIComponent(manifest.tag)}/${artifact.name}`, run.origin).href;
    const download = await run.download({ url, directory, name: artifact.name });
    const info = await lstat(download.path);
    if ((await hashFile(download.path)) !== artifact.sha256 || info.size !== artifact.size) {
      throw new Error('Browser installer bytes differ');
    }
    await verifyWindowsSignature({
      path: download.path,
      publisher: options.publisher!,
      expectedVersion: manifest.version,
      expectedProductName: 'Tau Staging',
    });
    const zoneIdentifier = z
      .string()
      .parse(
        powershell(
          String.raw`Get-Content -LiteralPath $env:TAU_Q_DOWNLOAD -Stream Zone.Identifier -Raw | ConvertTo-Json`,
          Object.fromEntries([['TAU_Q_DOWNLOAD', download.path]]),
        ),
      );
    if (!hasWindowsInternetZone(zoneIdentifier)) {
      throw new Error('Internet-zone MOTW unavailable');
    }
    const binding = {
      nonce: run.nonce,
      hostSha256: windowsConsumerHostDigest(run.host),
      stage,
      artifactSha256: artifact.sha256,
      requestedAt: Date.now(),
    };
    await writeFile(
      join(directory, 'request.json'),
      JSON.stringify({
        ...binding,
        installer: download.path,
        responseTemplate: {
          ...binding,
          observedAt: null,
          observer: null,
          launchedFrom: null,
          defaultDestination: null,
          freshCapturesForRequest: null,
          smartScreen: { checkAppsAndFiles: 'unknown', result: 'unknown', publisher: null },
          uac: 'unknown',
          installer: 'unknown',
          screenshots: ['security-settings', 'installer-result'].map((kind) => ({
            kind,
            name: null,
            capturedAt: null,
            sha256: null,
            size: null,
          })),
        },
        instruction:
          'Open this exact download through Explorer or browser downloads without command-line arguments or changing destination. Capture new screenshots for this request; never reuse prior captures. Observe SmartScreen, publisher, UAC and visible installation. Save response.json plus referenced screenshots in this directory. Never disable protection or supply administrator credentials.',
      }),
      { flag: 'wx' },
    );
    const response = await readWindowsConsumerResponse(join(directory, 'response.json'), Date.now() + 1_800_000);
    const manual = assertWindowsConsumerManual(response, binding, options.publisher!);
    if (manual.observedAt > Date.now()) {
      throw new Error('Future manual observation');
    }
    await Promise.all(
      manual.screenshots.map(async (screenshot) => {
        const path = join(directory, screenshot.name);
        const file = await lstat(path);
        if (
          file.birthtimeMs < binding.requestedAt ||
          file.mtimeMs < binding.requestedAt ||
          file.mtimeMs > Date.now() ||
          (await hashFile(path)) !== screenshot.sha256 ||
          file.size !== screenshot.size
        ) {
          throw new Error('Manual screenshot bytes differ');
        }
      }),
    );
    const registered = z
      .string()
      .min(1)
      .parse(
        powershell(String.raw`
$user=@(Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*' -ErrorAction SilentlyContinue | Where-Object {$_.DisplayName -eq 'Tau Staging'}); if($user.Count -ne 1){throw 'Expected one per-user registration'};
[string](Get-ItemProperty -LiteralPath ('HKCU:\Software\'+$user[0].PSChildName)).InstallLocation | ConvertTo-Json`),
      );
    const canonical = await realpath(registered);
    if (
      canonical.toLowerCase() !== installationPath.toLowerCase() ||
      canonical.toLowerCase() !== resolve(registered).toLowerCase()
    ) {
      throw new Error('Consumer installation escaped its per-user location');
    }
    installationPath = canonical;
    installs.push({
      stage,
      artifact: { name: artifact.name, sha256: artifact.sha256, size: artifact.size },
      download: { browser: download.browser, url, sha256: artifact.sha256, size: info.size, zoneIdentifier },
      installedPath: installationPath,
      requestedAt: binding.requestedAt,
      completedAt: Date.now(),
      manual,
    });
  };
  const lifecycle = createQualificationReinstallGuard();
  let installed = false;
  let active: QualificationCandidate | undefined;
  const verifyInstalledSignature = async (path: string, version: string, name: string): Promise<void> => {
    if (options.mode === 'release') {
      await verifyWindowsSignature({
        path,
        publisher: options.publisher!,
        expectedVersion: version,
        expectedProductName: name,
      });
    }
  };
  const observe: QualificationPlatformDriver['observe'] = async (candidate) => {
    host();
    const manifest = parseDesktopArtifactManifest(candidate.manifest);
    const expected = await windowsQualificationPayloadHashes(candidate);
    const executablePath = join(installationPath, 'Tau.exe');
    const asar = join(installationPath, 'resources/app.asar');
    const executableSha256 = await hashFile(executablePath);
    const asarSha256 = await hashFile(asar);
    if (executableSha256 !== expected.executableSha256) {
      throw new Error('Installed Windows executable differs from authenticated NSIS');
    }
    if (asarSha256 !== expected.asarSha256) {
      throw new Error('Installed Windows payload differs from authenticated NSIS');
    }
    uncache(asar);
    const metadata = packageSchema.parse(JSON.parse(extractFile(asar, 'package.json').toString()));
    if (
      metadata.version !== manifest.version ||
      metadata.tauDesktop.sourceCommit !== manifest.sourceCommit ||
      metadata.tauDesktop.channel !== manifest.channel
    ) {
      throw new Error('Installed Windows source identity differs');
    }
    const marker = parseDesktopInstallation(
      JSON.parse(await readFile(join(installationPath, 'resources/desktop-installation.json'), 'utf8')),
      { platform: 'win32', arch: 'x64', channel: manifest.channel, version: manifest.version },
    );
    if (
      marker.route !== 'windows-nsis' ||
      marker.tag !== manifest.tag ||
      marker.sourceCommit !== manifest.sourceCommit ||
      marker.trust !== (options.mode === 'release' ? 'release' : 'test') ||
      (options.mode === 'release' && marker.publisher !== options.publisher)
    ) {
      throw new Error('Installed Windows trust/identity differs');
    }
    const name = manifest.channel === 'staging' ? 'Tau Staging' : 'Tau';
    await verifyInstalledSignature(executablePath, manifest.version, name);
    const scheme = manifest.channel === 'staging' ? 'tau-staging' : 'tau';
    const registration = z
      .object({
        user: z.number(),
        machine: z.number(),
        command: z.string(),
        machineProtocol: z.boolean(),
        installation: z.string(),
      })
      .parse(
        powershell(
          String.raw`
$user=@(Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*' -ErrorAction SilentlyContinue | Where-Object {$_.DisplayName -eq $env:TAU_Q_NAME});
$machine=@(Get-ItemProperty 'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*','HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*' -ErrorAction SilentlyContinue | Where-Object {$_.DisplayName -eq $env:TAU_Q_NAME});
$key='HKCU:\Software\Classes\'+$env:TAU_Q_SCHEME+'\shell\open\command';
# electron-builder stores InstallLocation under Software/<GUID>, separate from its same-GUID uninstall entry.
@{user=$user.Count;machine=$machine.Count;command=(Get-Item $key).GetValue('');machineProtocol=(Test-Path ('HKLM:\Software\Classes\'+$env:TAU_Q_SCHEME));installation=[string](Get-ItemProperty -LiteralPath ('HKCU:\Software\'+$user[0].PSChildName)).InstallLocation} | ConvertTo-Json -Compress`,
          Object.fromEntries([
            ['TAU_Q_NAME', name],
            ['TAU_Q_SCHEME', scheme],
          ]),
        ),
      );
    if (
      registration.user !== 1 ||
      registration.machine !== 0 ||
      registration.machineProtocol ||
      registration.command.toLowerCase() !== `"${executablePath}" "%1"`.toLowerCase() ||
      resolve(registration.installation).toLowerCase() !== resolve(installationPath).toLowerCase()
    ) {
      throw new Error('Windows per-user registration differs from installed executable');
    }
    active = candidate;
    lifecycle.observed(candidate);
    return {
      route: 'windows-nsis',
      channel: manifest.channel,
      tag: manifest.tag,
      version: manifest.version,
      sourceCommit: manifest.sourceCommit,
      executablePath,
      executableSha256,
      asarSha256,
      installationPath,
      measurements: {
        registration: JSON.stringify(registration),
        trust: options.mode,
        expectedExecutableSha256: expected.executableSha256,
        expectedAsarSha256: expected.asarSha256,
        candidateArtifactSha256: manifest.artifacts.find((item) => item.kind === 'windows-nsis')!.sha256,
      },
    };
  };
  return {
    ...(options.cleanHost
      ? {
          windowsAcceptance: (): WindowsConsumerAcceptance => ({ kind: 'vm', host: options.cleanHost!.host, installs }),
        }
      : {}),
    async install(candidate) {
      if (installed) {
        throw new Error('Driver installs initial baseline only; use shipping updater for later candidates');
      }
      const manifest = parseDesktopArtifactManifest(candidate.manifest);
      const existingPath = await lstat(installationPath).catch((error: unknown) => {
        if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
          return undefined;
        }
        throw error;
      });
      const name = manifest.channel === 'staging' ? 'Tau Staging' : 'Tau';
      const existingRegistrations = z.number().parse(
        powershell(
          String.raw`
$items=@(Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*','HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*','HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*' -ErrorAction SilentlyContinue | Where-Object {$_.DisplayName -eq $env:TAU_Q_NAME}); $items.Count | ConvertTo-Json`,
          Object.fromEntries([['TAU_Q_NAME', name]]),
        ),
      );
      if (existingPath ?? existingRegistrations !== 0) {
        throw new QualificationUnavailable(
          'Clean Windows qualification requires absent target and channel installation',
        );
      }
      const path = await verifyWindowsQualificationArtifact(candidate);
      if (options.mode === 'release') {
        await verifyWindowsSignature({
          path,
          publisher: options.publisher!,
          expectedVersion: manifest.version,
          expectedProductName: manifest.channel === 'staging' ? 'Tau Staging' : 'Tau',
        });
      }
      if (options.cleanHost) {
        await visibleInstall(candidate, 'initial');
      } else {
        executeInstaller(path, ['/S', `/D=${installationPath}`]);
      }
      installed = true;
      lifecycle.installed();
      return observe(candidate);
    },
    async reinstall(candidate, preservedFiles) {
      lifecycle.admit(candidate, preservedFiles);
      await Promise.all(
        preservedFiles.map(async (file) => {
          if ((await hashFile(file.path)) !== file.sha256) {
            throw new Error('Preserved file changed before reinstall');
          }
        }),
      );
      const path = await verifyWindowsQualificationArtifact(candidate);
      const manifest = parseDesktopArtifactManifest(candidate.manifest);
      if (options.mode === 'release') {
        await verifyWindowsSignature({
          path,
          publisher: options.publisher!,
          expectedVersion: manifest.version,
          expectedProductName: manifest.channel === 'staging' ? 'Tau Staging' : 'Tau',
        });
      }
      if (options.cleanHost) {
        await visibleInstall(candidate, 'reinstall');
      } else {
        executeInstaller(path, ['/S', `/D=${installationPath}`]);
      }
      const observation = await observe(candidate);
      await Promise.all(
        preservedFiles.map(async (file) => {
          if ((await hashFile(file.path)) !== file.sha256) {
            throw new Error('Reinstall changed preserved user file');
          }
        }),
      );
      return observation;
    },
    observe,
    async measureSecurity(processes) {
      const ids = [processes.mainPid, ...processes.rendererPids, ...processes.nativeChildPids];
      if (
        processes.rendererPids.length === 0 ||
        processes.nativeChildPids.length === 0 ||
        ids.some((pid) => !Number.isSafeInteger(pid) || pid < 1) ||
        new Set(ids).size !== ids.length
      ) {
        throw new QualificationUnavailable('Live distinct main, renderer and native child PIDs are required');
      }
      const result = powershell(
        String.raw`
${tokenInterop}
$items=@(); foreach($idValue in ($env:TAU_Q_PIDS | ConvertFrom-Json)) {
 $p=Get-CimInstance Win32_Process -Filter ('ProcessId='+$idValue); if(!$p.ExecutablePath -or !$p.CommandLine){throw 'Process observation unavailable'};
 $items+=@{pid=[int]$idValue;executable=$p.ExecutablePath;commandLine=$p.CommandLine;measurements=@{parentPid=[string]$p.ParentProcessId;integrityRid=[string][TauQualificationToken]::Read($idValue,25);elevated=[string][TauQualificationToken]::Read($idValue,20);appContainer=[string][TauQualificationToken]::Read($idValue,29)}};
}
$os=Get-CimInstance Win32_OperatingSystem;
@{platform='win32';architecture=$env:PROCESSOR_ARCHITECTURE;osVersion=($os.Caption+' '+$os.Version+' '+$os.BuildNumber);measurements=@{runnerElevated=[string][TauQualificationToken]::Read($PID,20);uacEnabled=[string](Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System').EnableLUA;trustMode=$env:TAU_Q_MODE};processes=$items}|ConvertTo-Json -Depth 6 -Compress`,
        Object.fromEntries([
          ['TAU_Q_PIDS', JSON.stringify(ids)],
          ['TAU_Q_MODE', options.mode],
        ]),
      );
      const observation = z
        .object({
          platform: z.string(),
          architecture: z.string(),
          osVersion: z.string(),
          measurements: z.record(z.string(), z.string()),
          processes: z.array(
            z.object({
              pid: z.number(),
              executable: z.string(),
              commandLine: z.string(),
              measurements: z.record(z.string(), z.string()),
            }),
          ),
        })
        .parse(result);
      if (options.cleanHost) {
        observation.measurements['consumerHost'] = JSON.stringify(
          observeWindowsConsumerHost(options.cleanHost.host.runner),
        );
      }
      return observation;
    },
    async remove(preservedFiles) {
      lifecycle.assertRemoval();
      if (!active) {
        throw new Error('No observed installation to remove');
      }
      await Promise.all(
        preservedFiles.map(async (file) => {
          if ((await hashFile(file.path)) !== file.sha256) {
            throw new Error('Preserved file changed before uninstall');
          }
        }),
      );
      const files = await readdir(installationPath);
      const uninstallers = files.filter((name) => /^Uninstall.*\.exe$/iu.test(name));
      if (uninstallers.length !== 1) {
        throw new Error('Ambiguous uninstaller');
      }
      const uninstaller = uninstallers[0]!;
      const uninstallerSha256 = await hashFile(join(installationPath, uninstaller));
      executeInstaller(join(installationPath, uninstaller), ['/S', `_?=${installationPath}`]);
      try {
        await lstat(join(installationPath, 'Tau.exe'));
        throw new Error('Uninstaller retained executable');
      } catch (error) {
        if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) {
          throw error;
        }
      }
      await removeWindowsUninstallerRemainder({ installationPath, uninstaller, sha256: uninstallerSha256 });
      await Promise.all(
        preservedFiles.map(async (file) => {
          if ((await hashFile(file.path)) !== file.sha256) {
            throw new Error('Uninstall changed preserved user file');
          }
        }),
      );
      lifecycle.removed(preservedFiles);
    },
  };
};
