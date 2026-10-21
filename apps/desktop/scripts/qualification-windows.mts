/** Native Windows qualification: install only the initial candidate and report measured identity/security. */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, mkdtemp, readFile, readdir, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
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
  options: QualificationDriverOptions & { publisher?: string },
): QualificationPlatformDriver => {
  host();
  if (!isAbsolute(options.installationPath) || /["\r\n]/u.test(options.installationPath)) {
    throw new Error('Unsafe installation path');
  }
  if (options.mode === 'release' && !options.publisher?.trim()) {
    throw new QualificationUnavailable('Release qualification requires the configured Authenticode publisher');
  }
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
    const executablePath = join(options.installationPath, 'Tau.exe');
    const asar = join(options.installationPath, 'resources/app.asar');
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
      JSON.parse(await readFile(join(options.installationPath, 'resources/desktop-installation.json'), 'utf8')),
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
      resolve(registration.installation).toLowerCase() !== resolve(options.installationPath).toLowerCase()
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
      installationPath: options.installationPath,
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
    async install(candidate) {
      if (installed) {
        throw new Error('Driver installs initial baseline only; use shipping updater for later candidates');
      }
      const manifest = parseDesktopArtifactManifest(candidate.manifest);
      const existingPath = await lstat(options.installationPath).catch((error: unknown) => {
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
      executeInstaller(path, ['/S', `/D=${options.installationPath}`]);
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
      executeInstaller(path, ['/S', `/D=${options.installationPath}`]);
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
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class TauQualificationToken {
 [DllImport("kernel32.dll")] static extern IntPtr OpenProcess(uint access, bool inherit, int pid);
 [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
 [DllImport("advapi32.dll")] static extern bool OpenProcessToken(IntPtr process, uint access, out IntPtr token);
 [DllImport("advapi32.dll")] static extern bool GetTokenInformation(IntPtr token, int type, IntPtr data, int size, out int needed);
 [DllImport("advapi32.dll")] static extern IntPtr GetSidSubAuthorityCount(IntPtr sid);
 [DllImport("advapi32.dll")] static extern IntPtr GetSidSubAuthority(IntPtr sid, uint index);
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
'@
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
      return z
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
      const files = await readdir(options.installationPath);
      const uninstallers = files.filter((name) => /^Uninstall.*\.exe$/iu.test(name));
      if (uninstallers.length !== 1) {
        throw new Error('Ambiguous uninstaller');
      }
      executeInstaller(join(options.installationPath, uninstallers[0]!), ['/S', `_?=${options.installationPath}`]);
      try {
        await lstat(join(options.installationPath, 'Tau.exe'));
        throw new Error('Uninstaller retained executable');
      } catch (error) {
        if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) {
          throw error;
        }
      }
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
