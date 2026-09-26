#!/usr/bin/env node

/**
 * Purpose: Build Tau's two macOS Quick Look app extensions for Apple Silicon.
 * Why: Electron packaging must embed deterministic .appex bundles before signing.
 * Environment: macOS, Xcode command-line tools, generated Quick Look runtime assets.
 * Usage: node --import @oxc-node/core/register apps/desktop/macos/scripts/build-quick-look-extensions.mts
 * Exit codes: 0 on a validated arm64 build; non-zero on build or validation failure.
 */

import { cp, mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const macosRoot = resolve(import.meta.dirname, '..');
// Kept between runs: Xcode's OBJROOT holds the explicit system-module builds, so a rebuild is incremental.
const buildRoot = resolve(macosRoot, 'build');
const productsRoot = resolve(buildRoot, 'products');
const extensionsRoot = resolve(macosRoot, 'dist/extensions');
const products = ['TauQuickLookPreview.appex', 'TauQuickLookThumbnail.appex'] as const;

if (process.platform !== 'darwin') {
  throw new Error('Quick Look extensions can only be built on macOS with Xcode installed.');
}

await rm(extensionsRoot, { recursive: true, force: true });
await mkdir(extensionsRoot, { recursive: true });

execFileSync(
  'xcodebuild',
  [
    '-project',
    resolve(macosRoot, 'TauQuickLook.xcodeproj'),
    '-quiet',
    '-alltargets',
    '-configuration',
    'Release',
    `CONFIGURATION_BUILD_DIR=${productsRoot}`,
    `OBJROOT=${resolve(buildRoot, 'objects')}`,
    'CODE_SIGNING_ALLOWED=NO',
    'ARCHS=arm64',
    'ONLY_ACTIVE_ARCH=NO',
    'build',
  ],
  { cwd: macosRoot, stdio: 'inherit' },
);

await Promise.all(
  products.map(async (product) => {
    const source = resolve(productsRoot, product);
    const output = resolve(extensionsRoot, product);
    await cp(source, output, { recursive: true });
    execFileSync('plutil', ['-lint', resolve(output, 'Contents/Info.plist')], { stdio: 'inherit' });
    const executable = resolve(output, `Contents/MacOS/${product.slice(0, -'.appex'.length)}`);
    const architectures = execFileSync('lipo', ['-archs', executable], { encoding: 'utf8' }).trim();
    if (architectures !== 'arm64') {
      throw new Error(`${executable} is not arm64-only: ${architectures}`);
    }
  }),
);

console.log(`Built arm64 Quick Look extensions in ${extensionsRoot}`);
