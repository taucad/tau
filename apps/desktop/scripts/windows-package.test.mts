#!/usr/bin/env node
/**
 * Purpose: Assemble a real unsigned NSIS fixture and inspect its native manifest, version and embedded app.
 * Environment: Windows x64, installed Electron distribution, 7z on PATH; no signing credentials or publication.
 * Usage: pnpm nx run desktop:test-windows-package
 * Exit: nonzero on installer identity, elevation, payload or prepackaged-input preservation failure.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, readdir, rename, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { createPackage } from '@electron/asar';
import { z } from 'zod';

import { desktopArtifactName, desktopReleaseIdentity, parseDesktopArtifactManifest } from '#shared/desktop-release.js';

// oxlint-disable-next-line no-restricted-imports -- Native maker fixture exercises the actual qualification driver.
import { createWindowsQualificationDriver } from './qualification-windows.mjs';

const inspectScript = `
$ErrorActionPreference = 'Stop'
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class TauPeResource {
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] public static extern IntPtr LoadLibraryEx(string name, IntPtr file, uint flags);
  [DllImport("kernel32.dll", SetLastError=true)] public static extern IntPtr FindResource(IntPtr module, IntPtr name, IntPtr type);
  [DllImport("kernel32.dll", SetLastError=true)] public static extern IntPtr LoadResource(IntPtr module, IntPtr resource);
  [DllImport("kernel32.dll", SetLastError=true)] public static extern IntPtr LockResource(IntPtr resource);
  [DllImport("kernel32.dll", SetLastError=true)] public static extern uint SizeofResource(IntPtr module, IntPtr resource);
  [DllImport("kernel32.dll")] public static extern bool FreeLibrary(IntPtr module);
}
'@
$module = [TauPeResource]::LoadLibraryEx($env:TAU_FIXTURE_INSTALLER, [IntPtr]::Zero, 2)
if ($module -eq [IntPtr]::Zero) { throw 'Cannot load installer resources' }
try {
  $resource = [TauPeResource]::FindResource($module, [IntPtr]1, [IntPtr]24)
  if ($resource -eq [IntPtr]::Zero) { throw 'Missing executable manifest' }
  $size = [TauPeResource]::SizeofResource($module, $resource)
  $pointer = [TauPeResource]::LockResource([TauPeResource]::LoadResource($module, $resource))
  if ($pointer -eq [IntPtr]::Zero -or $size -eq 0) { throw 'Cannot read executable manifest' }
  $bytes = New-Object byte[] $size
  [Runtime.InteropServices.Marshal]::Copy($pointer, $bytes, 0, $size)
  $manifest = [Text.Encoding]::UTF8.GetString($bytes).Trim([char]0)
  [xml]$xml = $manifest
  $level = $xml.SelectSingleNode("//*[local-name()='requestedExecutionLevel']").GetAttribute('level')
  $version = [Diagnostics.FileVersionInfo]::GetVersionInfo($env:TAU_FIXTURE_INSTALLER)
  [ordered]@{ productName=$version.ProductName; productVersion=$version.ProductVersion; level=$level } | ConvertTo-Json -Compress
} finally { [void][TauPeResource]::FreeLibrary($module) }
`;

const walkFiles = async (directory: string): Promise<string[]> => {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      assert.equal(entry.isSymbolicLink(), false, 'Unexpected symlink in installer payload');
      return entry.isDirectory() ? walkFiles(path) : [path];
    }),
  );
  return nested.flat();
};

const main = async (): Promise<void> => {
  assert.equal(process.platform, 'win32', 'NSIS assembly acceptance requires Windows');
  assert.equal(process.arch, 'x64', 'NSIS assembly acceptance requires x64');
  assert.equal(
    process.env['TAU_WINDOWS_DISPOSABLE_HOST'],
    '1',
    'Install/uninstall fixture requires an explicitly disposable Windows host',
  );
  const desktopRoot = resolve(import.meta.dirname, '..');
  const root = resolve(
    desktopRoot,
    '../../out/research/desktop-release-signing-pipeline/implementation-2026-10-21/windows',
  );
  await mkdir(root, { recursive: true });
  const fixture = await mkdtemp(join(root, 'maker-'));
  const input = join(fixture, 'input');
  // Package installation does not guarantee Electron's distribution; prepare the pinned host binary explicitly.
  const prepared = spawnSync(process.execPath, [join(desktopRoot, 'node_modules/electron/install.js')], {
    encoding: 'utf8',
    timeout: 240_000,
  });
  assert.equal(prepared.status, 0, `${prepared.stdout}\n${prepared.stderr}`);
  await cp(join(desktopRoot, 'node_modules/electron/dist'), input, { recursive: true });
  await rename(join(input, 'electron.exe'), join(input, 'Tau.exe'));
  const source = join(fixture, 'source');
  await mkdir(source);
  const tag = 'desktop-staging@0.1.0-staging.123';
  const identity = desktopReleaseIdentity(tag);
  const sourceCommit = 'a'.repeat(40);
  await writeFile(
    join(source, 'package.json'),
    JSON.stringify({
      name: 'tau-fixture',
      version: identity.version,
      main: 'main.cjs',
      tauDesktop: { channel: identity.channel, sourceCommit, environmentOverrides: false },
    }),
  );
  await writeFile(
    join(source, 'main.cjs'),
    `const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
if (!process.env.TAU_FIXTURE_PROFILE) throw new Error('Disposable profile required');
app.setPath('userData', process.env.TAU_FIXTURE_PROFILE);
app.whenReady().then(() => {
  fs.mkdirSync(app.getPath('userData'), {recursive:true});
  fs.writeFileSync(path.join(app.getPath('userData'), 'startup.json'), JSON.stringify({version:app.getVersion(),executable:app.getPath('exe')}));
  app.quit();
});
`,
  );
  await createPackage(source, join(input, 'resources/app.asar'));
  const original = await readFile(join(input, 'resources/app.asar'));
  const output = join(fixture, 'output');
  const environment = { ...process.env };
  environment['TAU_WINDOWS_APP_DIR'] = input;
  environment['DESKTOP_RELEASE_TAG'] = tag;
  environment['TAU_DESKTOP_SOURCE_SHA'] = sourceCommit;
  environment['TAU_DESKTOP_PACKAGE_OUTPUT_ROOT'] = output;
  const made = spawnSync(
    process.execPath,
    [...process.execArgv, join(import.meta.dirname, 'package-windows.mts'), '--unsigned'],
    {
      env: environment,
      encoding: 'utf8',
      timeout: 300_000,
      maxBuffer: 16 * 1024 * 1024,
    },
  );
  assert.equal(made.status, 0, `${made.stdout}\n${made.stderr}`);
  assert.deepEqual(await readFile(join(input, 'resources/app.asar')), original);
  const installer = join(output, desktopArtifactName({ kind: 'windows-nsis', ...identity, arch: 'x64' }));
  const windowsRoot = process.env['SystemRoot'];
  assert.ok(windowsRoot, 'SystemRoot is required');
  environment['TAU_FIXTURE_INSTALLER'] = installer;
  const inspected = spawnSync(
    join(windowsRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe'),
    [
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-EncodedCommand',
      Buffer.from(inspectScript, 'utf16le').toString('base64'),
    ],
    { env: environment, encoding: 'utf8', timeout: 30_000 },
  );
  assert.equal(inspected.status, 0, inspected.stderr);
  assert.deepEqual(
    z
      .object({ productName: z.string(), productVersion: z.string(), level: z.string() })
      .parse(JSON.parse(inspected.stdout)),
    {
      productName: 'Tau Staging',
      productVersion: identity.version,
      level: 'asInvoker',
    },
  );
  const extracted = join(fixture, 'extracted');
  const unpacked = spawnSync('7z', ['x', '-y', `-o${extracted}`, installer], { encoding: 'utf8', timeout: 120_000 });
  assert.equal(unpacked.status, 0, `${unpacked.stdout}\n${unpacked.stderr}`);
  const installerFiles = await walkFiles(extracted);
  const archives = installerFiles.filter((path) => path.endsWith('app-64.7z'));
  assert.equal(archives.length, 1, 'Installer must contain one x64 app payload');
  const payload = join(fixture, 'payload');
  const payloadUnpacked = spawnSync('7z', ['x', '-y', `-o${payload}`, archives[0]!], {
    encoding: 'utf8',
    timeout: 120_000,
  });
  assert.equal(payloadUnpacked.status, 0, `${payloadUnpacked.stdout}\n${payloadUnpacked.stderr}`);
  assert.deepEqual(await readFile(join(payload, 'resources/app.asar')), original);
  const marker: unknown = JSON.parse(await readFile(join(payload, 'resources/desktop-installation.json'), 'utf8'));
  assert.deepEqual(marker, {
    schemaVersion: 1,
    route: 'windows-nsis',
    ...identity,
    tag,
    sourceCommit,
    arch: 'x64',
    trust: 'test',
    publisher: null,
    cache: 'tau-staging-updater',
  });
  const updateConfig: unknown = JSON.parse(await readFile(join(payload, 'resources/app-update.yml'), 'utf8'));
  assert.deepEqual(updateConfig, { updaterCacheDirName: 'tau-staging-updater', publisherName: [] });
  const payloadFiles = await walkFiles(payload);
  assert.equal(
    [...installerFiles, ...payloadFiles].some((path) => /(?:^|[\\/])elevate\.exe$/iu.test(path)),
    false,
  );
  const installed = join(fixture, 'installed app');
  const appData = process.env['APPDATA'];
  assert.ok(appData, 'Windows roaming app data must be available');
  const profile = join(appData, 'Tau Staging');
  environment['TAU_FIXTURE_PROFILE'] = profile;
  await mkdir(profile);
  await writeFile(join(profile, 'project.json'), '{"keep":"user project"}');
  const originalQualificationGuard = process.env['TAU_QUALIFICATION_DISPOSABLE_HOST'];
  process.env['TAU_QUALIFICATION_DISPOSABLE_HOST'] = '1';
  try {
    const sha256 = createHash('sha256');
    const sha512 = createHash('sha512');
    for await (const bytes of createReadStream(installer)) {
      assert.ok(bytes instanceof Uint8Array);
      sha256.update(bytes);
      sha512.update(bytes);
    }
    const installerInfo = await stat(installer);
    const candidate = {
      route: 'windows-nsis',
      artifactDirectory: output,
      manifest: parseDesktopArtifactManifest({
        schemaVersion: 1,
        ...identity,
        tag,
        sourceCommit,
        artifacts: [
          {
            kind: 'windows-nsis',
            target: 'win32-x64',
            format: 'exe',
            roles: ['installer', 'update'],
            name: desktopArtifactName({ kind: 'windows-nsis', ...identity, arch: 'x64' }),
            size: installerInfo.size,
            sha256: sha256.digest('hex'),
            sha512: sha512.digest('base64'),
          },
        ],
      }),
    } as const;
    const occupied = join(fixture, 'occupied target');
    await mkdir(occupied);
    await writeFile(join(occupied, 'keep.txt'), 'existing application data');
    const occupiedDriver = createWindowsQualificationDriver({ mode: 'fixture', installationPath: occupied });
    await assert.rejects(occupiedDriver.install(candidate), /absent target and channel installation/u);
    assert.equal(await readFile(join(occupied, 'keep.txt'), 'utf8'), 'existing application data');
    const driver = createWindowsQualificationDriver({ mode: 'fixture', installationPath: installed });
    const installedObservation = await driver.install(candidate);
    assert.equal(installedObservation.version, identity.version);
    assert.equal(installedObservation.sourceCommit, sourceCommit);
    assert.equal(installedObservation.measurements['trust'], 'fixture');
    assert.equal(installedObservation.asarSha256, createHash('sha256').update(original).digest('hex'));
    assert.equal(
      installedObservation.executableSha256,
      createHash('sha256')
        .update(await readFile(join(payload, 'Tau.exe')))
        .digest('hex'),
    );
    assert.equal(installedObservation.measurements['expectedAsarSha256'], installedObservation.asarSha256);
    assert.equal(installedObservation.measurements['expectedExecutableSha256'], installedObservation.executableSha256);
    await assert.rejects(driver.install(candidate), /initial baseline only/u);
    const registeredDriver = createWindowsQualificationDriver({
      mode: 'fixture',
      installationPath: join(fixture, 'different target'),
    });
    await assert.rejects(registeredDriver.install(candidate), /absent target and channel installation/u);
    assert.deepEqual(await driver.observe(candidate), installedObservation);
    const modifiedAsar = Buffer.from(original);
    modifiedAsar[modifiedAsar.length - 1] = (modifiedAsar.at(-1)! + 1) % 256;
    await writeFile(join(installed, 'resources/app.asar'), modifiedAsar);
    try {
      await assert.rejects(driver.observe(candidate), /payload differs from authenticated NSIS/u);
    } finally {
      await writeFile(join(installed, 'resources/app.asar'), original);
    }
    const restoredObservation = await driver.observe(candidate);
    assert.equal(restoredObservation.asarSha256, installedObservation.asarSha256);
    const registrations = spawnSync(
      join(windowsRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe'),
      [
        '-NoProfile',
        '-NonInteractive',
        '-EncodedCommand',
        Buffer.from(
          `$ErrorActionPreference='Stop'; $user=@(Get-ItemProperty 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*' -ErrorAction SilentlyContinue | Where-Object {$_.DisplayName -eq 'Tau Staging'}); $machine=@(Get-ItemProperty 'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*','HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*' -ErrorAction SilentlyContinue | Where-Object {$_.DisplayName -eq 'Tau Staging'}); @{user=$user.Count;machine=$machine.Count;userProtocol=(Test-Path 'HKCU:\\Software\\Classes\\tau-staging');command=(Get-Item 'HKCU:\\Software\\Classes\\tau-staging\\shell\\open\\command').GetValue('');machineProtocol=(Test-Path 'HKLM:\\Software\\Classes\\tau-staging')} | ConvertTo-Json -Compress`,
          'utf16le',
        ).toString('base64'),
      ],
      { encoding: 'utf8', timeout: 30_000 },
    );
    assert.equal(registrations.status, 0, registrations.stderr);
    assert.deepEqual(JSON.parse(registrations.stdout), {
      user: 1,
      machine: 0,
      userProtocol: true,
      machineProtocol: false,
      command: `"${join(installed, 'Tau.exe')}" "%1"`,
    });

    assert.deepEqual(await readFile(join(installed, 'resources/app.asar')), original);
    assert.deepEqual(
      JSON.parse(await readFile(join(installed, 'resources/desktop-installation.json'), 'utf8')),
      marker,
    );
    assert.deepEqual(JSON.parse(await readFile(join(installed, 'resources/app-update.yml'), 'utf8')), updateConfig);
    const launched = spawnSync(join(installed, 'Tau.exe'), [], { env: environment, encoding: 'utf8', timeout: 60_000 });
    assert.equal(launched.status, 0, `${launched.stdout}\n${launched.stderr}`);
    const startup = JSON.parse(await readFile(join(profile, 'startup.json'), 'utf8')) as {
      version: string;
      executable: string;
    };
    assert.equal(startup.version, identity.version);
    assert.equal(startup.executable.toLowerCase(), join(installed, 'Tau.exe').toLowerCase());
    const installedFiles = await readdir(installed);
    const uninstallers = installedFiles.filter((name) => /^Uninstall.*\.exe$/iu.test(name));
    assert.equal(uninstallers.length, 1);
    const preserved = await Promise.all(
      ['project.json', 'startup.json'].map(async (name) => {
        const path = join(profile, name);
        return {
          path,
          sha256: createHash('sha256')
            .update(await readFile(path))
            .digest('hex'),
        };
      }),
    );
    await assert.rejects(driver.reinstall(candidate, preserved), /own completed removal/u);
    await driver.remove(preserved);
    const removedProtocol = spawnSync(
      join(windowsRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe'),
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        String.raw`if (Test-Path 'HKCU:\Software\Classes\tau-staging') { exit 1 }`,
      ],
      { encoding: 'utf8', timeout: 30_000 },
    );
    assert.equal(removedProtocol.status, 0, removedProtocol.stderr);
    await assert.rejects(stat(join(installed, 'Tau.exe')), { code: 'ENOENT' });
    assert.equal(await readFile(join(profile, 'project.json'), 'utf8'), '{"keep":"user project"}');
    assert.equal(JSON.parse(await readFile(join(profile, 'startup.json'), 'utf8')).version, identity.version);
    // A later installation can take over the protocol; this uninstaller must leave its command intact.
    await assert.rejects(
      driver.reinstall({ ...candidate, manifest: { ...candidate.manifest, sourceCommit: 'b'.repeat(40) } }, preserved),
      /exact last observed candidate/u,
    );
    assert.deepEqual(await driver.reinstall(candidate, preserved), installedObservation);
    const foreignCommand = String.raw`"C:\Other Tau\Tau.exe" "%1"`;
    const replaceProtocol = spawnSync(
      join(windowsRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe'),
      [
        '-NoProfile',
        '-NonInteractive',
        '-EncodedCommand',
        Buffer.from(
          `$ErrorActionPreference='Stop'; Set-Item 'HKCU:\\Software\\Classes\\tau-staging\\shell\\open\\command' '${foreignCommand}'`,
          'utf16le',
        ).toString('base64'),
      ],
      { encoding: 'utf8', timeout: 30_000 },
    );
    assert.equal(replaceProtocol.status, 0, replaceProtocol.stderr);
    const foreignUninstall = spawnSync(join(installed, uninstallers[0]!), ['/S', `_?=${installed}`], {
      windowsVerbatimArguments: true,
      env: environment,
      encoding: 'utf8',
      timeout: 120_000,
    });
    assert.equal(foreignUninstall.status, 0, `${foreignUninstall.stdout}\n${foreignUninstall.stderr}`);
    const preservedProtocol = spawnSync(
      join(windowsRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe'),
      [
        '-NoProfile',
        '-NonInteractive',
        '-EncodedCommand',
        Buffer.from(
          `$ErrorActionPreference='Stop'; $command=(Get-Item 'HKCU:\\Software\\Classes\\tau-staging\\shell\\open\\command').GetValue(''); if ($command -ne '${foreignCommand}') { throw 'Foreign handler changed' }; Remove-Item 'HKCU:\\Software\\Classes\\tau-staging' -Recurse`,
          'utf16le',
        ).toString('base64'),
      ],
      { encoding: 'utf8', timeout: 30_000 },
    );
    assert.equal(preservedProtocol.status, 0, preservedProtocol.stderr);
  } finally {
    if (originalQualificationGuard === undefined) {
      delete process.env['TAU_QUALIFICATION_DISPOSABLE_HOST'];
    } else {
      process.env['TAU_QUALIFICATION_DISPOSABLE_HOST'] = originalQualificationGuard;
    }
  }
  console.log(
    'PASS native NSIS resources, payload, actual qualification driver install/observe/tamper/preexisting refusal/uninstall, fixture startup and profile preservation; release signing/full Tau A-to-B remain gated',
  );
};
try {
  await main();
} catch (error) {
  console.error(error);
  process.exit(1);
}
