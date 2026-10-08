#!/usr/bin/env node

/**
 * Purpose: Assemble and verify Tau macOS packages, with signing/notarization selected explicitly.
 * Why: Quick Look extensions must enter Contents/PlugIns before one inside-out signing pass.
 * Environment: macOS, Xcode tools, built desktop/UI/native artifacts;
 * optional TAU_GEOSPEC_NATIVE_ASSEMBLY_ROOT selects a qualified assemble-package.sh output;
 * otherwise a verified current-source CI delivery snapshot is used;
 * optional TAU_MACOS_PACKAGE_OUTPUT_ROOT; optional TAU_DESKTOP_CHANNEL (production, the default, or staging);
 * Apple credentials only for --release; --unsigned skips all package signing.
 * Usage: node --import @oxc-node/core/register scripts/package-macos.mts [--release | --unsigned] [--zip]
 * Output: <output root>/Tau-darwin-arm64/Tau.app, copied as APFS clones of its inputs; the distribution archive
 * <output root>/Tau-macos-arm64.zip only for --release or when --zip is passed.
 * Exit codes: 0 on a verified app/ZIP; non-zero on missing artifacts, credentials, or validation failure.
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { closeSync, existsSync, openSync, readSync } from 'node:fs';
import { cp, mkdir, open, readFile, readdir, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { flipFuses, FuseVersion } from '@electron/fuses';
import { notarize } from '@electron/notarize';
import { sign } from '@electron/osx-sign';
import { packager } from '@electron/packager';

import { quickLookEnabled } from '#shared/quick-look.js';

// oxlint-disable-next-line no-restricted-imports -- Operational scripts are outside the app's # source alias.
import { macosPackageFuses, parseMacosPackageMode } from './macos-package-mode.mjs';
/* oxlint-disable no-restricted-imports -- Operational scripts are outside the app's # source alias. */
import { copyGeoSpecNativeAssembly, copyGeoSpecSourceRelink, copyTree } from './runtime-closure.mjs';
import {
  desktopManifestFields,
  desktopPackageChannel,
  excludesBuildDiagnostics,
  resolveRuntimePackages,
  stageRuntimePackages,
} from './runtime-stage.mjs';
/* oxlint-enable no-restricted-imports -- End operational script import exception. */

type PackageMetadata = {
  readonly name: string;
  readonly productName: string;
  readonly version: string;
  readonly main: string;
  readonly type: string;
};

type PythonResourceManifest = {
  readonly pythonRelativePath: string;
  pythonSha256: string;
};

type PicoGkResourceManifest = {
  readonly workerPath: string;
  workerSha256: string;
  resourceFiles: Array<{ readonly label: string; readonly path: string; sha256: string }>;
};

const desktopRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const workspaceRoot = resolve(desktopRoot, '../..');
const outputRoot = resolve(process.env['TAU_MACOS_PACKAGE_OUTPUT_ROOT'] ?? resolve(desktopRoot, 'package-out'));
if (process.platform !== 'darwin') {
  throw new Error('The macOS package can only be assembled on macOS.');
}
const stageRoot = resolve(outputRoot, 'stage');
const extensionRoot = resolve(desktopRoot, 'macos/dist/extensions');
const hostInfo = resolve(desktopRoot, 'macos/generated/TauHost-Info.plist');
const extensionEntitlements = resolve(desktopRoot, 'macos/Config/TauQuickLook.entitlements');
const uiClientRoot = resolve(workspaceRoot, 'apps/ui/desktop/build/client');
const pythonResourceRoot = resolve(desktopRoot, 'resources/python');
const picoGkResourceRoot = resolve(desktopRoot, 'resources/picogk');
/* The `git` this app records revisions with, prepared beside python and picogk
 * (OQ3). One payload, not two: `git-lfs` lives inside this git's own exec path,
 * so `git lfs` resolves through the binary main points the services host at. */
const gitResourceRoot = resolve(desktopRoot, 'resources/git/darwin-arm64');
const shipsGit = existsSync(gitResourceRoot);
/* GPL-2.0 §3(a): the exact source the payload was built from travels with it
 * (`prepare-git.mts`). A payload without it is not shipped. */
const gitSourceRoot = resolve(desktopRoot, 'resources/git/SOURCES');
if (shipsGit && !existsSync(gitSourceRoot)) {
  throw new Error(`The git payload ships with its source; ${gitSourceRoot} is missing. Run prepare-git again.`);
}
const { release, unsigned, zip } = parseMacosPackageMode(process.argv.slice(2));
// Local non-ZIP packages remain development-only; every distribution archive is held.
if (zip) {
  execFileSync(process.execPath, [resolve(workspaceRoot, 'packages/plugins/tscircuit/check-vendored-licenses.mjs')], {
    stdio: 'inherit',
  });
}
// ponytail: no Quick Look extensions in the bundle while `quickLookEnabled` is off.
const extensions = quickLookEnabled ? (['TauQuickLookPreview.appex', 'TauQuickLookThumbnail.appex'] as const) : [];
const adhocAppEntitlements = [
  'com.apple.security.cs.allow-jit',
  'com.apple.security.cs.disable-library-validation',
  'com.apple.security.device.audio-input',
  'com.apple.security.device.bluetooth',
  'com.apple.security.device.camera',
  'com.apple.security.device.print',
  'com.apple.security.device.usb',
  'com.apple.security.personal-information.location',
  'com.apple.security.personal-information.photos-library',
];
const universalMagics = new Set([0xca_fe_ba_be, 0xbe_ba_fe_ca, 0xca_fe_ba_bf, 0xbf_ba_fe_ca]);
const machObjectMagics = new Set([...universalMagics, 0xfe_ed_fa_ce, 0xce_fa_ed_fe, 0xfe_ed_fa_cf, 0xcf_fa_ed_fe]);
/** `CPU_TYPE_ARM64`; with subtype `CPU_SUBTYPE_ARM64_ALL` (0) it is the header `lipo -archs` names `arm64`. */
const arm64CpuType = 0x01_00_00_0c;

/* A shipped app records revisions with the binaries it carries: a machine
 * launched from Finder has `/usr/bin:/bin:/usr/sbin:/sbin` and no `git-lfs`, so
 * a release without this payload is an app that cannot back a project up. A
 * development package still assembles, and says what it left out. */
if (release && !shipsGit) {
  throw new Error(`A release package must ship the git payload at ${gitResourceRoot} (OQ3).`);
}
if (!shipsGit) {
  console.log(`No git payload at ${gitResourceRoot}; this package records with the machine's own git and git-lfs.`);
}
if ([resolve('/'), homedir(), tmpdir(), desktopRoot, workspaceRoot].includes(outputRoot)) {
  throw new Error(`Refusing unsafe package output root: ${outputRoot}`);
}
const selectedGeoSpecAssembly = process.env['TAU_GEOSPEC_NATIVE_ASSEMBLY_ROOT'];
if (selectedGeoSpecAssembly === '') {
  throw new Error('TAU_GEOSPEC_NATIVE_ASSEMBLY_ROOT must name a qualified native assembly.');
}
let geospecAssemblyInput: string;
if (selectedGeoSpecAssembly === undefined) {
  const output = execFileSync(
    process.execPath,
    [resolve(workspaceRoot, 'packages/geospec-engine-native/scripts/ci-artifacts.mjs'), 'snapshot-delivery'],
    { cwd: workspaceRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] },
  );
  const selections = [...output.matchAll(/^ASSEMBLY_ROOT=(.+)$/gmu)].map((match) => match[1]?.trim());
  if (selections.length !== 1 || !selections[0]) {
    throw new Error('GeoSpec delivery did not select one verified immutable assembly snapshot.');
  }
  geospecAssemblyInput = selections[0];
} else {
  geospecAssemblyInput = selectedGeoSpecAssembly;
}
const ownedGeoSpecSnapshot =
  selectedGeoSpecAssembly === undefined ? resolve(workspaceRoot, geospecAssemblyInput) : undefined;
if (
  ownedGeoSpecSnapshot !== undefined &&
  (dirname(ownedGeoSpecSnapshot) !== resolve(workspaceRoot, 'node_modules/.cache/geospec-engine-native') ||
    !basename(ownedGeoSpecSnapshot).startsWith('assembly-snapshot-'))
) {
  throw new Error('GeoSpec delivery selected an assembly snapshot outside its owned cache.');
}
try {
  const geospecAssemblyRoot = await realpath(resolve(workspaceRoot, geospecAssemblyInput));
  if (
    geospecAssemblyRoot === outputRoot ||
    geospecAssemblyRoot.startsWith(`${outputRoot}/`) ||
    outputRoot.startsWith(`${geospecAssemblyRoot}/`)
  ) {
    throw new Error('GeoSpec native assembly must be outside the disposable package output root.');
  }
  const readJson = async <Value extends NonNullable<unknown>>(path: string): Promise<Value> =>
    JSON.parse(await readFile(path, 'utf8')) as Value;

  const sha256 = async (path: string): Promise<string> =>
    createHash('sha256')
      .update(await readFile(path))
      .digest('hex');

  /** The Mach-O header (magic, CPU type, CPU subtype) in a file's first 12 bytes, or `undefined` for any other file. */
  const machHeader = (bytes: Uint8Array<ArrayBuffer>): DataView | undefined => {
    const header = new DataView(bytes.buffer);
    return machObjectMagics.has(header.getUint32(0)) ? header : undefined;
  };

  const isMachObject = (path: string): boolean => {
    const bytes = new Uint8Array(12);
    const file = openSync(path, 'r');
    try {
      readSync(file, bytes, 0, bytes.byteLength, 0);
    } finally {
      closeSync(file);
    }
    return machHeader(bytes) !== undefined;
  };

  const thinIntelSlices = async (root: string): Promise<number> => {
    const entries = await readdir(root, { recursive: true, withFileTypes: true });
    const files = entries.filter((entry) => entry.isFile()).map((entry) => resolve(entry.parentPath, entry.name));
    const universal: string[] = [];
    /* A fresh clone shares no page cache with its source, so every header is a
     * disk read: read them concurrently, one bounded batch of open files at a time. */
    for (let start = 0; start < files.length; start += 256) {
      // oxlint-disable-next-line no-await-in-loop -- See above.
      await Promise.all(
        files.slice(start, start + 256).map(async (path) => {
          const bytes = new Uint8Array(12);
          const file = await open(path, 'r');
          try {
            await file.read(bytes, 0, bytes.byteLength, 0);
          } finally {
            await file.close();
          }
          const header = machHeader(bytes);
          if (header && universalMagics.has(header.getUint32(0))) {
            universal.push(path);
          } else if (header) {
            /* A thin file names its one architecture in its own header, so only a
             * universal file needs `lipo`. The header is in the file's byte order:
             * an arm64 or x86_64 file starts `cf fa ed fe`, a little-endian magic. */
            const littleEndian = [0xfe_ed_fa_ce, 0xfe_ed_fa_cf].includes(header.getUint32(0, true));
            const cpuType = header.getUint32(4, littleEndian);
            // oxlint-disable-next-line no-bitwise -- The high byte of a CPU subtype holds capability flags.
            const cpuSubtype = header.getUint32(8, littleEndian) & 0x00_ff_ff_ff;
            if (cpuType !== arm64CpuType || cpuSubtype !== 0) {
              throw new Error(
                `${path} has no arm64 slice: CPU type 0x${cpuType.toString(16)}, subtype ${String(cpuSubtype)}`,
              );
            }
          }
        }),
      );
    }
    let count = 0;
    for (const path of universal) {
      const architectures = execFileSync('lipo', ['-archs', path], { encoding: 'utf8' }).trim().split(/\s+/u);
      if (!architectures.includes('arm64')) {
        throw new Error(`${path} has no arm64 slice: ${architectures.join(', ')}`);
      }
      if (architectures.includes('x86_64')) {
        const output = `${path}.arm64`;
        execFileSync('lipo', [path, '-thin', 'arm64', '-output', output]);
        // oxlint-disable-next-line no-await-in-loop -- Each replacement follows its synchronous lipo operation.
        await rename(output, path);
        count += 1;
      }
    }
    return count;
  };

  const developerIdentity = (): string => {
    const configured = process.env['TAU_CODESIGN_IDENTITY'];
    if (configured) {
      return configured;
    }
    const identities = [
      ...execFileSync('security', ['find-identity', '-v', '-p', 'codesigning'], { encoding: 'utf8' }).matchAll(
        /"(Developer ID Application: [^"]+)"/gu,
      ),
    ].flatMap((match) => (match[1] ? [match[1]] : []));
    if (identities.length !== 1) {
      throw new Error(
        identities.length === 0
          ? 'No Developer ID Application identity is installed. Create one in Xcode Settings > Accounts > Manage Certificates.'
          : 'Multiple Developer ID Application identities are installed; set TAU_CODESIGN_IDENTITY to the intended identity.',
      );
    }
    const identity = identities[0];
    if (!identity) {
      throw new Error('Developer ID identity discovery returned no result');
    }
    return identity;
  };

  /* Every runtime package is resolved before the previous output is removed. */
  const runtimePackages = await resolveRuntimePackages({ desktopRoot, workspaceRoot, target: 'darwin-arm64' });

  await rm(outputRoot, { recursive: true, force: true });
  const geospecNativeDependencies = await copyGeoSpecNativeAssembly(
    geospecAssemblyRoot,
    resolve(stageRoot, 'node_modules'),
  );
  const geospecSourceRelinkReceipt = await readFile(
    resolve(stageRoot, 'node_modules/@taucad/geospec-engine-native/licenses/SOURCE-RELINK.json'),
    'utf8',
  );

  const metadata = await readJson<PackageMetadata>(resolve(desktopRoot, 'package.json'));
  const electron = await readJson<{ readonly version: string }>(
    resolve(desktopRoot, 'node_modules/electron/package.json'),
  );
  await stageRuntimePackages({
    desktopRoot,
    stageRoot,
    packages: runtimePackages,
    stagedDependencies: geospecNativeDependencies,
    /* Ad-hoc and unsigned packages back the packaged e2e lane, which points
     * the app at local services; a release ignores those overrides
     * (`packagedOverridesEnabled` in src/main/environment.ts). A staging
     * package defaults to taucad.dev and never checks for updates. */
    manifestFields: desktopManifestFields({
      environmentOverrides: !release,
      channel: desktopPackageChannel(process.env['TAU_DESKTOP_CHANNEL']),
    }),
  });

  const packagePaths = await packager({
    dir: stageRoot,
    out: outputRoot,
    overwrite: true,
    platform: 'darwin',
    arch: 'arm64',
    name: 'Tau',
    appBundleId: 'com.taucad.tau.desktop',
    appCategoryType: 'public.app-category.graphics-design',
    appVersion: metadata.version,
    /* Squirrel.Mac compares bundle versions, so the build version is the release version. */
    buildVersion: metadata.version,
    electronVersion: electron.version,
    icon: resolve(desktopRoot, 'resources/icon.icns'),
    extendInfo: hostInfo,
    /* `CFBundleURLTypes`, which is what makes `tau://` links reach `open-url` at
     * all (R4, ruling D4) — on macOS a deep link only works from a packaged app.
     * Safe beside `extendInfo`: the packager applies the extension plist first
     * and writes this key afterwards, and `TauHost-Info.plist` declares document
     * types and UTIs only, never a URL type. */
    protocols: [{ name: 'Tau', schemes: ['tau'] }],
    asar: { unpack: '**/{*.node,bin/esbuild,@agentclientprotocol/**,@img/**}' },
    prune: false,
  });

  if (packagePaths.length !== 1) {
    throw new Error(`Expected one arm64 app, received ${String(packagePaths.length)}`);
  }
  const appPath = resolve(packagePaths[0]!, 'Tau.app');
  const resources = resolve(appPath, 'Contents/Resources');
  const plugins = resolve(appPath, 'Contents/PlugIns');
  await Promise.all([
    mkdir(resolve(resources, 'branding'), { recursive: true }),
    mkdir(resolve(resources, 'legal'), { recursive: true }),
  ]);
  await Promise.all([
    copyTree(uiClientRoot, resolve(resources, 'ui/client'), excludesBuildDiagnostics),
    cp(resolve(desktopRoot, 'resources/icon.png'), resolve(resources, 'branding/icon.png')),
    cp(resolve(desktopRoot, 'resources/icon-dark.png'), resolve(resources, 'branding/icon-dark.png')),
    /* The legal routes stay web-only; the notices (OCCT's LGPL-2.1 and exception included) still ship offline. */
    cp(
      resolve(workspaceRoot, 'apps/ui/app/routes/legal.open-source/open-source-notices.txt'),
      resolve(resources, 'legal/OPEN-SOURCE-NOTICES.md'),
    ),
    copyTree(resolve(pythonResourceRoot, 'darwin-arm64'), resolve(resources, 'python/darwin-arm64')),
    copyTree(resolve(picoGkResourceRoot, 'darwin-arm64'), resolve(resources, 'picogk/darwin-arm64')),
    copyGeoSpecSourceRelink(geospecAssemblyRoot, geospecSourceRelinkReceipt, resources),
    ...(shipsGit
      ? [
          copyTree(gitResourceRoot, resolve(resources, 'git/darwin-arm64')),
          copyTree(gitSourceRoot, resolve(resources, 'git/SOURCES')),
        ]
      : []),
    ...extensions.map(async (extension) =>
      copyTree(resolve(extensionRoot, extension), resolve(plugins, extension), excludesBuildDiagnostics),
    ),
  ]);
  if (selectedGeoSpecAssembly === undefined) {
    await rm(geospecAssemblyRoot, { recursive: true, force: true });
  }
  console.log(`Removed Intel slices from ${String(await thinIntelSlices(appPath))} bundled Mach-O files`);

  /* Before the first signature: flipping rewrites the Electron Framework binary.
   * An unsigned arm64 binary must keep a valid ad-hoc signature to launch at all. */
  await flipFuses(appPath, {
    version: FuseVersion.V1,
    resetAdHocDarwinSignature: unsigned,
    ...macosPackageFuses({ release }),
  });

  const identity = release ? developerIdentity() : '-';
  if (!unsigned) {
    await sign({
      app: appPath,
      platform: 'darwin',
      identity,
      identityValidation: release,
      preAutoEntitlements: false,
      preEmbedProvisioningProfile: false,
      strictVerify: true,
      batchCodesignCalls: true,
      ignore: (path) =>
        (path.includes('/Contents/Resources/python/') ||
          path.includes('/Contents/Resources/picogk/') ||
          path.includes('/Contents/Resources/git/')) &&
        !isMachObject(path),
      optionsForFile: (path) => ({
        ...(!release && (path === appPath || /\/Tau Helper(?: \([^)]+\))?\.app(?:\/|$)/u.test(path))
          ? { entitlements: adhocAppEntitlements }
          : {}),
        ...(release && path.endsWith('/Tau Helper (Plugin).app')
          ? {
              entitlements: [
                'com.apple.security.cs.allow-jit',
                'com.apple.security.cs.allow-unsigned-executable-memory',
              ],
            }
          : {}),
        ...(path.includes('/Contents/PlugIns/') ? { entitlements: extensionEntitlements } : {}),
        ...(path.includes('/Contents/Resources/python/') && path.endsWith('/bin/python3.13')
          ? { entitlements: ['com.apple.security.cs.disable-library-validation'] }
          : {}),
        ...(path.endsWith('/Contents/Resources/picogk/darwin-arm64/Tau.PicoGK.Worker')
          ? {
              entitlements: [
                'com.apple.security.cs.allow-jit',
                ...(release ? [] : ['com.apple.security.cs.disable-library-validation']),
              ],
            }
          : {}),
        ...(release ? {} : { timestamp: 'none' }),
      }),
    });
  }

  const packagedPythonRoot = resolve(resources, 'python/darwin-arm64');
  const packagedPythonManifestPath = resolve(packagedPythonRoot, 'tau-runtime-manifest.json');
  const packagedPythonManifest = await readJson<PythonResourceManifest>(packagedPythonManifestPath);
  packagedPythonManifest.pythonSha256 = await sha256(
    resolve(packagedPythonRoot, packagedPythonManifest.pythonRelativePath),
  );
  await writeFile(packagedPythonManifestPath, `${JSON.stringify(packagedPythonManifest, undefined, 2)}\n`);

  const packagedPicoGkRoot = resolve(resources, 'picogk/darwin-arm64');
  const packagedPicoGkManifestPath = resolve(packagedPicoGkRoot, 'tau-runtime-manifest.json');
  const packagedPicoGkManifest = await readJson<PicoGkResourceManifest>(packagedPicoGkManifestPath);
  packagedPicoGkManifest.workerSha256 = await sha256(resolve(packagedPicoGkRoot, packagedPicoGkManifest.workerPath));
  await Promise.all(
    packagedPicoGkManifest.resourceFiles.map(async (resource) => {
      resource.sha256 = await sha256(resolve(packagedPicoGkRoot, resource.path));
    }),
  );
  await writeFile(packagedPicoGkManifestPath, `${JSON.stringify(packagedPicoGkManifest, undefined, 2)}\n`);

  // The inner signing pass mutates Mach-O bytes. Refresh their integrity hashes, then reseal only the
  // outer bundle so runtime verification covers the exact executable macOS will launch.
  if (!unsigned) {
    await sign({
      app: appPath,
      platform: 'darwin',
      identity,
      identityValidation: release,
      preAutoEntitlements: false,
      preEmbedProvisioningProfile: false,
      strictVerify: true,
      batchCodesignCalls: true,
      ignore: (path) => path !== appPath,
      optionsForFile: (path) => ({
        ...(path === appPath && !release ? { entitlements: adhocAppEntitlements } : {}),
        ...(release ? {} : { timestamp: 'none' }),
      }),
    });
  }

  if (!unsigned) {
    execFileSync('codesign', ['--verify', '--deep', '--strict', '--verbose=2', appPath], { stdio: 'inherit' });
  }
  const assertArm64 = (path: string): void => {
    const architectures = execFileSync('lipo', ['-archs', path], { encoding: 'utf8' }).trim();
    if (architectures !== 'arm64') {
      throw new Error(`${path} is not arm64-only: ${architectures}`);
    }
  };
  assertArm64(resolve(appPath, 'Contents/MacOS/Tau'));
  assertArm64(resolve(packagedPicoGkRoot, packagedPicoGkManifest.workerPath));
  for (const extension of extensions) {
    const name = extension.slice(0, -'.appex'.length);
    assertArm64(resolve(plugins, extension, `Contents/MacOS/${name}`));
  }

  if (release) {
    await notarize({ appPath, keychainProfile: process.env['TAU_NOTARYTOOL_PROFILE'] ?? 'tau-notary' });
    execFileSync('xcrun', ['stapler', 'staple', appPath], { stdio: 'inherit' });
    execFileSync('xcrun', ['stapler', 'validate', appPath], { stdio: 'inherit' });
    execFileSync('spctl', ['--assess', '--type', 'execute', '--verbose=2', appPath], { stdio: 'inherit' });
  }

  const zipPath = resolve(outputRoot, 'Tau-macos-arm64.zip');
  if (zip) {
    execFileSync('ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', appPath, zipPath], { stdio: 'inherit' });
  }
  await rm(stageRoot, { recursive: true, force: true });
  console.log(`${release ? 'Signed and notarized' : unsigned ? 'Unsigned' : 'Ad-hoc signed'} Tau: ${appPath}`);
  console.log(zip ? `Distribution archive: ${zipPath}` : 'No distribution archive; pass --zip to write one.');
} finally {
  if (ownedGeoSpecSnapshot !== undefined) {
    await rm(ownedGeoSpecSnapshot, { recursive: true, force: true });
  }
}
