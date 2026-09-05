#!/usr/bin/env node

/**
 * Purpose: Assemble, sign, optionally notarize, and verify the distributable Tau macOS app.
 * Why: Quick Look extensions must enter Contents/PlugIns before one inside-out signing pass.
 * Environment: macOS, Xcode tools, built desktop/UI/native artifacts; optional TAU_MACOS_PACKAGE_OUTPUT_ROOT;
 * Apple credentials only for --release.
 * Usage: node --import @oxc-node/core/register scripts/package-macos.mts [--release]
 * Exit codes: 0 on a verified app/ZIP; non-zero on missing artifacts, credentials, or validation failure.
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { closeSync, openSync, readSync } from 'node:fs';
import { cp, mkdir, readFile, readdir, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { homedir, tmpdir } from 'node:os';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { notarize } from '@electron/notarize';
import { sign } from '@electron/osx-sign';
import { packager } from '@electron/packager';

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
const stageRoot = resolve(outputRoot, 'stage');
const extensionRoot = resolve(desktopRoot, 'macos/dist/extensions');
const hostInfo = resolve(desktopRoot, 'macos/generated/TauHost-Info.plist');
const extensionEntitlements = resolve(desktopRoot, 'macos/Config/TauQuickLook.entitlements');
const uiClientRoot = resolve(workspaceRoot, 'apps/ui/desktop/build/client');
const openrscadPluginModules = resolve(workspaceRoot, 'packages/plugins/openrscad/node_modules');
const assimpPluginModules = resolve(workspaceRoot, 'packages/plugins/assimp/node_modules');
const pythonResourceRoot = resolve(desktopRoot, 'resources/python');
const picoGkResourceRoot = resolve(desktopRoot, 'resources/picogk');
const release = process.argv.slice(2).includes('--release');
const extensions = ['TauQuickLookPreview.appex', 'TauQuickLookThumbnail.appex'] as const;
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
const machObjectMagics = new Set([
  0xfe_ed_fa_ce, 0xce_fa_ed_fe, 0xfe_ed_fa_cf, 0xcf_fa_ed_fe, 0xca_fe_ba_be, 0xbe_ba_fe_ca, 0xca_fe_ba_bf,
  0xbf_ba_fe_ca,
]);

if (process.platform !== 'darwin') {
  throw new Error('The macOS package can only be assembled on macOS.');
}
if ([resolve('/'), homedir(), tmpdir(), desktopRoot, workspaceRoot].includes(outputRoot)) {
  throw new Error(`Refusing unsafe package output root: ${outputRoot}`);
}
if (process.argv.slice(2).some((argument) => argument !== '--release')) {
  throw new TypeError('Usage: package-macos.mts [--release]');
}

const readJson = async <Value extends NonNullable<unknown>>(path: string): Promise<Value> =>
  JSON.parse(await readFile(path, 'utf8')) as Value;

const sha256 = async (path: string): Promise<string> =>
  createHash('sha256')
    .update(await readFile(path))
    .digest('hex');

const isMachObject = (path: string): boolean => {
  const file = openSync(path, 'r');
  const bytes = Buffer.allocUnsafe(4);
  try {
    return (
      readSync(file, bytes, 0, bytes.byteLength, 0) === bytes.byteLength && machObjectMagics.has(bytes.readUInt32BE())
    );
  } finally {
    closeSync(file);
  }
};

const thinIntelSlices = async (root: string): Promise<number> => {
  let count = 0;
  const visit = async (path: string): Promise<void> => {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const child = resolve(path, entry.name);
      if (entry.isDirectory()) {
        // oxlint-disable-next-line no-await-in-loop -- Serial traversal avoids unbounded filesystem work.
        await visit(child);
      } else if (entry.isFile() && isMachObject(child)) {
        const architectures = execFileSync('lipo', ['-archs', child], { encoding: 'utf8' }).trim().split(/\s+/u);
        if (!architectures.includes('arm64')) {
          throw new Error(`${child} has no arm64 slice: ${architectures.join(', ')}`);
        }
        if (architectures.includes('x86_64')) {
          const output = `${child}.arm64`;
          execFileSync('lipo', [child, '-thin', 'arm64', '-output', output]);
          // oxlint-disable-next-line no-await-in-loop -- Each replacement follows its synchronous lipo operation.
          await rename(output, child);
          count += 1;
        }
      }
    }
  };
  await visit(root);
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

const excludesSourceMaps = (path: string): boolean => !path.endsWith('.map');

const copyRuntimePackage = async (name: string, source: string): Promise<void> => {
  await cp(source, resolve(stageRoot, 'node_modules', name), {
    recursive: true,
    filter: (path) => !['node_modules', 'src'].includes(basename(path)) && excludesSourceMaps(path),
  });
};

const openrscadEngine = await realpath(resolve(openrscadPluginModules, '@taulabs/openrscad-engine'));
/* One engine package, two payloads: the addon ships in the platform package its
 * `node` entry loads, exactly as libassimp does. Staging the engine without it
 * would still run — through the WebAssembly fallback — which is precisely the
 * silent downgrade `verify-macos-package.mts` refuses. */
const openrscadEngineDarwinArm64 = dirname(
  createRequire(resolve(openrscadEngine, 'package.json')).resolve(
    '@taulabs/openrscad-engine-darwin-arm64/package.json',
  ),
);
const openrscadMetadata = await readJson<{ readonly version: string }>(resolve(openrscadEngine, 'package.json'));
const libassimp = await realpath(resolve(assimpPluginModules, 'libassimp'));
const libassimpDarwinArm64 = dirname(
  createRequire(resolve(libassimp, 'package.json')).resolve('libassimp-darwin-arm64/package.json'),
);
const libassimpMetadata = await readJson<{ readonly version: string }>(resolve(libassimp, 'package.json'));

await rm(outputRoot, { recursive: true, force: true });
await Promise.all([
  mkdir(resolve(stageRoot, 'dist'), { recursive: true }),
  mkdir(resolve(stageRoot, 'node_modules/@taulabs'), { recursive: true }),
]);

const metadata = await readJson<PackageMetadata>(resolve(desktopRoot, 'package.json'));
const electron = await readJson<{ readonly version: string }>(
  resolve(desktopRoot, 'node_modules/electron/package.json'),
);
await Promise.all([
  cp(resolve(desktopRoot, 'dist/main'), resolve(stageRoot, 'dist/main'), {
    recursive: true,
    filter: excludesSourceMaps,
  }),
  cp(resolve(desktopRoot, 'dist/preload'), resolve(stageRoot, 'dist/preload'), {
    recursive: true,
    filter: excludesSourceMaps,
  }),
  copyRuntimePackage('@taulabs/openrscad-engine', openrscadEngine),
  copyRuntimePackage('@taulabs/openrscad-engine-darwin-arm64', openrscadEngineDarwinArm64),
  copyRuntimePackage('libassimp', libassimp),
  copyRuntimePackage('libassimp-darwin-arm64', libassimpDarwinArm64),
  writeFile(
    resolve(stageRoot, 'package.json'),
    `${JSON.stringify(
      {
        name: metadata.name,
        productName: metadata.productName,
        version: metadata.version,
        main: metadata.main,
        type: metadata.type,
        dependencies: {
          '@taulabs/openrscad-engine': openrscadMetadata.version,
          '@taulabs/openrscad-engine-darwin-arm64': openrscadMetadata.version,
          libassimp: libassimpMetadata.version,
          'libassimp-darwin-arm64': libassimpMetadata.version,
        },
      },
      undefined,
      2,
    )}\n`,
  ),
]);

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
  buildVersion: '1',
  electronVersion: electron.version,
  icon: resolve(desktopRoot, 'resources/icon.icns'),
  extendInfo: hostInfo,
  asar: { unpack: '**/*.node' },
  prune: false,
});

if (packagePaths.length !== 1) {
  throw new Error(`Expected one arm64 app, received ${String(packagePaths.length)}`);
}
const appPath = resolve(packagePaths[0]!, 'Tau.app');
const resources = resolve(appPath, 'Contents/Resources');
const plugins = resolve(appPath, 'Contents/PlugIns');
await mkdir(resolve(resources, 'branding'), { recursive: true });
await Promise.all([
  cp(uiClientRoot, resolve(resources, 'ui/client'), { recursive: true, filter: excludesSourceMaps }),
  cp(resolve(desktopRoot, 'resources/icon.png'), resolve(resources, 'branding/icon.png')),
  cp(resolve(desktopRoot, 'resources/icon-dark.png'), resolve(resources, 'branding/icon-dark.png')),
  cp(resolve(pythonResourceRoot, 'darwin-arm64'), resolve(resources, 'python/darwin-arm64'), {
    recursive: true,
    verbatimSymlinks: true,
  }),
  cp(resolve(picoGkResourceRoot, 'darwin-arm64'), resolve(resources, 'picogk/darwin-arm64'), {
    recursive: true,
    verbatimSymlinks: true,
  }),
  mkdir(plugins, { recursive: true }),
]);
await Promise.all(
  extensions.map(async (extension) =>
    cp(resolve(extensionRoot, extension), resolve(plugins, extension), {
      recursive: true,
      filter: excludesSourceMaps,
    }),
  ),
);
console.log(`Removed Intel slices from ${String(await thinIntelSlices(appPath))} bundled Mach-O files`);

const identity = release ? developerIdentity() : '-';
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
    (path.includes('/Contents/Resources/python/') || path.includes('/Contents/Resources/picogk/')) &&
    !isMachObject(path),
  optionsForFile: (path) => ({
    ...(!release && (path === appPath || /\/Tau Helper(?: \([^)]+\))?\.app(?:\/|$)/u.test(path))
      ? { entitlements: adhocAppEntitlements }
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

execFileSync('codesign', ['--verify', '--deep', '--strict', '--verbose=2', appPath], { stdio: 'inherit' });
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
execFileSync('ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', appPath, zipPath], { stdio: 'inherit' });
await rm(stageRoot, { recursive: true, force: true });
console.log(`${release ? 'Signed and notarized' : 'Ad-hoc signed'} Tau: ${appPath}`);
console.log(`Distribution archive: ${zipPath}`);
