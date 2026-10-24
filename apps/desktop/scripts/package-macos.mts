#!/usr/bin/env node

/**
 * Purpose: Assemble and verify Tau macOS packages, with signing/notarization selected explicitly.
 * Why: Quick Look extensions must enter Contents/PlugIns before one inside-out signing pass.
 * Environment: macOS, Xcode tools, built desktop/UI artifacts and the installed `geospec-engine` pin (the app ships no
 * native kernel closure: it downloads each on first use);
 * TAU_GEOSPEC_SOURCE_RELINK_ARCHIVE names that engine version's source/relink archive (required for an arm64 --release);
 * optional TAU_MACOS_PACKAGE_OUTPUT_ROOT; optional TAU_DESKTOP_CHANNEL (production, the default, or staging);
 * A signing certificate is required for --release or local signing; --unsigned skips package signing.
 * TAU_LOCAL_CODESIGN_IDENTITY opts a staging development package into Apple Development signing
 * (auto, an exact certificate name, or its fingerprint), preserving debugging and local overrides.
 * Local acceptance: pnpm nx run desktop:package-macos:local (auto-selects the single development certificate).
 * Usage: node --import @oxc-node/core/register scripts/package-macos.mts [--release | --unsigned] [--zip] [--dmg]
 * Output: <output root>/Tau-darwin-<arch>/Tau.app, copied as APFS clones of its inputs; the distribution archive
 * <output root>/Tau-macos-<arch>.zip only for --release or when --zip is passed; optional Tau-macos-<arch>.dmg with --dmg.
 * Exit codes: 0 on a verified app/ZIP; non-zero on missing artifacts, credentials, or validation failure.
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { closeSync, existsSync, openSync, readSync } from 'node:fs';
import { cp, mkdir, open, readFile, readdir, rename, rm } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { flipFuses, FuseVersion } from '@electron/fuses';
import { notarize } from '@electron/notarize';
import { sign } from '@electron/osx-sign';
import { packager } from '@electron/packager';

import { desktopArtifactName } from '#shared/desktop-release.js';

import { isQuickLookEnabled } from '#shared/quick-look.js';

// oxlint-disable-next-line no-restricted-imports -- Operational scripts are outside the app's # source alias.
import { macosPackageArchitecture, macosPackageFuses, parseMacosPackageMode } from './macos-package-mode.mjs';
// oxlint-disable-next-line no-restricted-imports -- Shared operational signing helper.
import { localSigningIdentity } from './local-signing.mjs';
// oxlint-disable-next-line no-restricted-imports -- Shared install container builder and verifier.
import { createMacosDmg } from './macos-dmg.mjs';
/* oxlint-disable no-restricted-imports -- Operational scripts are outside the app's # source alias. */
import { copyTree } from '@taucad/nx/runtime-closure';
import { copyGeoSpecEngine, copyGeoSpecSourceRelink } from './runtime-closure.mjs';
import { uploadDesktopSourceMaps } from './desktop-sourcemaps.mjs';
import {
  desktopManifestFields,
  desktopPackageChannel,
  desktopPackageVersion,
  excludesBuildDiagnostics,
  resolveRuntimePackages,
  runtimeAsarOptions,
  stageNativePackageFiles,
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

const desktopRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const workspaceRoot = resolve(desktopRoot, '../..');
const outputRoot = resolve(process.env['TAU_MACOS_PACKAGE_OUTPUT_ROOT'] ?? resolve(desktopRoot, 'package-out'));
if (process.platform !== 'darwin') {
  throw new Error('The macOS package can only be assembled on macOS.');
}
const architecture = macosPackageArchitecture(process.platform, process.arch);
const target = `darwin-${architecture}` as const;
const machArchitecture = architecture === 'arm64' ? 'arm64' : 'x86_64';
// Intel has the portable desktop feature set; native GeoSpec remains ARM-only. Which native kernel closures ship is
// each kernel's `tau-plugin.json` business (PicoGK declares darwin-arm64 only).
const shipsNativeGeometry = architecture === 'arm64';
const stageRoot = resolve(outputRoot, 'stage');
const extensionRoot = resolve(desktopRoot, 'macos/dist/extensions');
const hostInfo = resolve(desktopRoot, 'macos/generated/TauHost-Info.plist');
const extensionEntitlements = resolve(desktopRoot, 'macos/Config/TauQuickLook.entitlements');
const uiClientRoot = resolve(workspaceRoot, 'apps/ui/desktop/build/client');
/* The `git` this app records revisions with, prepared beside the native kernels' payloads
 * (OQ3). One payload, not two: `git-lfs` lives inside this git's own exec path,
 * so `git lfs` resolves through the binary main points the services host at. */
const gitResourceRoot = resolve(desktopRoot, `resources/git/${target}`);
const shipsGit = existsSync(gitResourceRoot);
/* GPL-2.0 §3(a): the exact source the payload was built from travels with it
 * (`prepare-git.mts`). A payload without it is not shipped. */
const gitSourceRoot = resolve(desktopRoot, 'resources/git/SOURCES');
if (shipsGit && !existsSync(gitSourceRoot)) {
  throw new Error(`The git payload ships with its source; ${gitSourceRoot} is missing. Run prepare-git again.`);
}
const {
  release,
  unsigned,
  zip,
  dmg,
  notarize: shouldNotarize,
} = parseMacosPackageMode(process.argv.slice(2), desktopPackageChannel(process.env['TAU_DESKTOP_CHANNEL']));
if (
  process.env['TAU_LOCAL_CODESIGN_IDENTITY'] !== undefined &&
  (release || unsigned || desktopPackageChannel(process.env['TAU_DESKTOP_CHANNEL']) !== 'staging')
) {
  throw new Error('Local signing requires a staging development package, without --release or --unsigned.');
}
if (dmg && release && !/^[A-Z0-9]{10}$/u.test(process.env['APPLE_TEAM_ID'] ?? '')) {
  throw new Error('A release DMG requires APPLE_TEAM_ID for signer verification.');
}
// Resolve before removing any previous package output.
const localIdentity = localSigningIdentity();
// Local non-ZIP packages remain development-only; every distribution archive is held.
if (zip || dmg) {
  execFileSync(process.execPath, [resolve(workspaceRoot, 'packages/plugins/tscircuit/check-vendored-licenses.mjs')], {
    stdio: 'inherit',
  });
}
// ponytail: no Quick Look extensions in the bundle while `isQuickLookEnabled()` is off.
const extensions =
  isQuickLookEnabled() && shipsNativeGeometry
    ? (['TauQuickLookPreview.appex', 'TauQuickLookThumbnail.appex'] as const)
    : [];
const developmentAppEntitlements = [
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
/** Native Mach-O CPU identity; Intel uses CPU_TYPE_X86_64 / CPU_SUBTYPE_X86_64_ALL. */
const cpuTypeForTarget = architecture === 'arm64' ? 0x01_00_00_0c : 0x01_00_00_07;
const cpuSubtypeForTarget = architecture === 'arm64' ? 0 : 3;

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
/* LGPL-2.1 co-delivery: the engine compiles OCCT in, so a release that ships it carries the engine's
 * source and relink archive. taucad/geospec publishes it beside each engine release; the receipt inside
 * the installed package pins its bytes. An Intel package ships no native engine, so it needs none.
 * A development package still assembles, and says what it left out. */
const geospecSourceRelinkArchive = process.env['TAU_GEOSPEC_SOURCE_RELINK_ARCHIVE']?.trim()
  ? process.env['TAU_GEOSPEC_SOURCE_RELINK_ARCHIVE']
  : undefined;
if (shipsNativeGeometry && release && geospecSourceRelinkArchive === undefined) {
  throw new Error(
    'A release package must ship the GeoSpec source/relink archive; set TAU_GEOSPEC_SOURCE_RELINK_ARCHIVE.',
  );
}
if (shipsNativeGeometry && geospecSourceRelinkArchive === undefined) {
  console.log('No GeoSpec source/relink archive; this development package omits SOURCES for the GeoSpec engine.');
}
const readJson = async <Value extends NonNullable<unknown>>(path: string): Promise<Value> =>
  JSON.parse(await readFile(path, 'utf8')) as Value;

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

const thinOtherSlices = async (root: string): Promise<number> => {
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
          if (cpuType !== cpuTypeForTarget || cpuSubtype !== cpuSubtypeForTarget) {
            throw new Error(
              `${path} has no ${machArchitecture} slice: CPU type 0x${cpuType.toString(16)}, subtype ${String(cpuSubtype)}`,
            );
          }
        }
      }),
    );
  }
  let count = 0;
  for (const path of universal) {
    const architectures = execFileSync('lipo', ['-archs', path], { encoding: 'utf8' }).trim().split(/\s+/u);
    if (!architectures.includes(machArchitecture)) {
      throw new Error(`${path} has no ${machArchitecture} slice: ${architectures.join(', ')}`);
    }
    if (architectures.length > 1) {
      const output = `${path}.${architecture}`;
      execFileSync('lipo', [path, '-thin', machArchitecture, '-output', output]);
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
const runtimePackages = await resolveRuntimePackages({ desktopRoot, workspaceRoot, target });

await rm(outputRoot, { recursive: true, force: true });
const geospecEngineDependencies = shipsNativeGeometry
  ? await copyGeoSpecEngine(desktopRoot, resolve(stageRoot, 'node_modules'))
  : {};
const geospecSourceRelinkReceipt = shipsNativeGeometry
  ? await readFile(resolve(stageRoot, 'node_modules/geospec-engine/licenses/SOURCE-RELINK.json'), 'utf8')
  : undefined;

const metadata = await readJson<PackageMetadata>(resolve(desktopRoot, 'package.json'));
const electron = await readJson<{ readonly version: string }>(
  resolve(desktopRoot, 'node_modules/electron/package.json'),
);
await stageRuntimePackages({
  desktopRoot,
  stageRoot,
  packages: runtimePackages,
  stagedDependencies: geospecEngineDependencies,
  /* Development packages back the packaged e2e lane, which points
   * the app at local services; a release ignores those overrides
   * (`packagedOverridesEnabled` in src/main/environment.ts). A staging
   * package defaults to taucad.dev and follows its isolated update feed. */
  manifestFields: desktopManifestFields({
    environmentOverrides: !release,
    channel: desktopPackageChannel(process.env['TAU_DESKTOP_CHANNEL']),
  }),
});

if (release && process.env['SENTRY_DSN']) {
  await uploadDesktopSourceMaps(
    resolve(desktopRoot, 'dist'),
    resolve(stageRoot, 'dist'),
    resolve(workspaceRoot, 'scripts/node_modules/.bin/sentry-cli'),
  );
}

const packagePaths = await packager({
  dir: stageRoot,
  out: outputRoot,
  // Isolate Packager cleanup; ASAR's absolute-path unpack glob cannot cross hidden worktree directories.
  tmpdir: resolve(tmpdir(), `tau-packager-${createHash('sha256').update(outputRoot).digest('hex').slice(0, 16)}`),
  overwrite: true,
  platform: 'darwin',
  arch: architecture,
  name: 'Tau',
  appBundleId: localIdentity ? 'com.taucad.tau.desktop.local' : 'com.taucad.tau.desktop',
  appCategoryType: 'public.app-category.graphics-design',
  appVersion: desktopPackageVersion(metadata.version),
  /* Squirrel.Mac compares bundle versions, so the build version is the release version. */
  buildVersion: desktopPackageVersion(metadata.version),
  electronVersion: electron.version,
  icon: resolve(desktopRoot, 'resources/icon.icns'),
  extendInfo: hostInfo,
  /* `CFBundleURLTypes`, which is what makes `tau://` links reach `open-url` at
   * all (R4, ruling D4) — on macOS a deep link only works from a packaged app.
   * Safe beside `extendInfo`: the packager applies the extension plist first
   * and writes this key afterwards, and `TauHost-Info.plist` declares document
   * types and UTIs only, never a URL type. */
  protocols: [{ name: 'Tau', schemes: ['tau'] }],
  asar: runtimeAsarOptions,
  prune: false,
});

if (packagePaths.length !== 1) {
  throw new Error(`Expected one ${architecture} app, received ${String(packagePaths.length)}`);
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
  stageNativePackageFiles(resources),
  cp(resolve(desktopRoot, 'resources/icon.png'), resolve(resources, 'branding/icon.png')),
  cp(resolve(desktopRoot, 'resources/icon-dark.png'), resolve(resources, 'branding/icon-dark.png')),
  /* The legal pages live on the website; the notices (OCCT's LGPL-2.1 and exception included) still ship offline. */
  cp(
    resolve(workspaceRoot, 'apps/www/content/legal/open-source.md'),
    resolve(resources, 'legal/OPEN-SOURCE-NOTICES.md'),
  ),
  ...(geospecSourceRelinkArchive === undefined || geospecSourceRelinkReceipt === undefined
    ? []
    : [copyGeoSpecSourceRelink(resolve(geospecSourceRelinkArchive), geospecSourceRelinkReceipt, resources)]),
  ...(shipsGit
    ? [
        copyTree(gitResourceRoot, resolve(resources, `git/${target}`)),
        copyTree(gitSourceRoot, resolve(resources, 'git/SOURCES')),
      ]
    : []),
  ...extensions.map(async (extension) =>
    copyTree(resolve(extensionRoot, extension), resolve(plugins, extension), excludesBuildDiagnostics),
  ),
]);
console.log(`Retained ${machArchitecture} slices in ${String(await thinOtherSlices(appPath))} bundled Mach-O files`);

/* Before the first signature: flipping rewrites the Electron Framework binary.
 * An unsigned arm64 binary must keep a valid ad-hoc signature to launch at all. */
await flipFuses(appPath, {
  version: FuseVersion.V1,
  resetAdHocDarwinSignature: unsigned,
  ...macosPackageFuses({ release }),
});

const identity = release ? developerIdentity() : (localIdentity ?? '-');
if (!unsigned) {
  await sign({
    app: appPath,
    platform: 'darwin',
    identity,
    identityValidation: release || localIdentity !== undefined,
    preAutoEntitlements: false,
    preEmbedProvisioningProfile: false,
    strictVerify: true,
    batchCodesignCalls: true,
    /* The git payload's code is signed, its other files are not. */
    ignore: (path) => path.includes('/Contents/Resources/git/') && !isMachObject(path),
    optionsForFile: (path) => ({
      ...(!release && (path === appPath || /\/Tau Helper(?: \([^)]+\))?\.app(?:\/|$)/u.test(path))
        ? { entitlements: developmentAppEntitlements }
        : {}),
      ...(release && path.endsWith('/Tau Helper (Plugin).app')
        ? {
            entitlements: ['com.apple.security.cs.allow-jit', 'com.apple.security.cs.allow-unsigned-executable-memory'],
          }
        : {}),
      ...(path.includes('/Contents/PlugIns/') ? { entitlements: extensionEntitlements } : {}),
      ...(release ? {} : { timestamp: 'none' }),
    }),
  });
}

if (!unsigned) {
  execFileSync('codesign', ['--verify', '--deep', '--strict', '--verbose=2', appPath], { stdio: 'inherit' });
}
const assertArchitecture = (path: string): void => {
  const architectures = execFileSync('lipo', ['-archs', path], { encoding: 'utf8' }).trim();
  if (architectures !== machArchitecture) {
    throw new Error(`${path} is not ${machArchitecture}-only: ${architectures}`);
  }
};
assertArchitecture(resolve(appPath, 'Contents/MacOS/Tau'));
for (const extension of extensions) {
  const name = extension.slice(0, -'.appex'.length);
  assertArchitecture(resolve(plugins, extension, `Contents/MacOS/${name}`));
}

if (shouldNotarize) {
  await notarize({ appPath, keychainProfile: process.env['TAU_NOTARYTOOL_PROFILE'] ?? 'tau-notary' });
  execFileSync('xcrun', ['stapler', 'staple', appPath], { stdio: 'inherit' });
  execFileSync('xcrun', ['stapler', 'validate', appPath], { stdio: 'inherit' });
  execFileSync('spctl', ['--assess', '--type', 'execute', '--verbose=2', appPath], { stdio: 'inherit' });
}

const zipPath = resolve(outputRoot, `Tau-macos-${architecture}.zip`);
if (zip) {
  execFileSync('ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', appPath, zipPath], { stdio: 'inherit' });
}
if (dmg) {
  const dmgPath = resolve(
    outputRoot,
    desktopArtifactName({
      kind: 'macos-dmg',
      channel: desktopPackageChannel(process.env['TAU_DESKTOP_CHANNEL']),
      version: desktopPackageVersion(metadata.version),
      arch: architecture,
    }),
  );
  await createMacosDmg({
    appPath,
    dmgPath,
    trust: {
      signed: release || localIdentity !== undefined,
      notarized: shouldNotarize,
      developerId: release,
      team: release ? process.env['APPLE_TEAM_ID'] : undefined,
    },
    identity,
    keychainProfile: process.env['TAU_NOTARYTOOL_PROFILE'] ?? 'tau-notary',
  });
  console.log(`Verified install container: ${dmgPath}`);
}
await rm(stageRoot, { recursive: true, force: true });
console.log(
  `${shouldNotarize ? 'Signed and notarized' : release ? 'Developer ID signed' : unsigned ? 'Unsigned' : localIdentity ? 'Apple Development signed' : 'Ad-hoc signed'} Tau: ${appPath}`,
);
console.log(zip ? `Distribution archive: ${zipPath}` : 'No distribution archive; pass --zip to write one.');
