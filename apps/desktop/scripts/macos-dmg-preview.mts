#!/usr/bin/env node
/**
 * Purpose: Show how the install container's Finder window looks, for review of the DMG backdrop.
 * Environment: macOS with a logged-in GUI session (hosted runners have one) and `uv`; never signs.
 * Usage: node --import @oxc-node/core/register apps/desktop/scripts/macos-dmg-preview.mts <output-directory>
 * Exit: nonzero when the DMG cannot be built or mounted; screenshots are best-effort evidence, not acceptance.
 */
import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

// oxlint-disable-next-line no-restricted-imports -- Operational helper under preview.
import { createMacosDmg } from './macos-dmg.mjs';

const output = resolve(process.argv[2] ?? 'out/dmg-preview');
const desktopRoot = resolve(import.meta.dirname, '..');
await mkdir(output, { recursive: true });
const scratch = await mkdtemp(join(tmpdir(), 'tau-dmg-preview-'));
const appPath = join(scratch, 'Tau.app');
const dmgPath = join(output, 'Tau-preview.dmg');
let device: string | undefined;
try {
  // A stand-in bundle with the real icon: Finder draws it exactly as it draws the shipped app.
  await mkdir(join(appPath, 'Contents/MacOS'), { recursive: true });
  await mkdir(join(appPath, 'Contents/Resources'));
  await writeFile(join(appPath, 'Contents/MacOS/Tau'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  await copyFile(join(desktopRoot, 'resources/icon.icns'), join(appPath, 'Contents/Resources/icon.icns'));
  await writeFile(
    join(appPath, 'Contents/Info.plist'),
    `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleExecutable</key><string>Tau</string>
<key>CFBundleIconFile</key><string>icon</string>
<key>CFBundleIdentifier</key><string>com.taucad.tau.dmg-preview</string>
<key>CFBundleName</key><string>Tau</string>
<key>CFBundlePackageType</key><string>APPL</string>
</dict></plist>
`,
  );
  await createMacosDmg({ appPath, dmgPath, trust: { signed: false, notarized: false } });
  // Mount where Finder can see it, as a user's double-click would, then let Finder open the window.
  // Use the device and mount point hdiutil reports: another volume named Tau would move this one off /Volumes/Tau.
  const attached = execFileSync('/usr/bin/hdiutil', ['attach', '-readonly', dmgPath], { encoding: 'utf8' });
  const volumeRow = attached
    .split('\n')
    .map((row) => row.split('\t').map((field) => field.trim()))
    .find((fields) => fields.length >= 3 && fields[2]!.startsWith('/Volumes/'));
  // Checksum lines come first in hdiutil output; the image's whole-disk device is the first /dev/ row.
  device = /^(\/dev\/disk\d+)\s/mu.exec(attached)?.[1];
  if (volumeRow === undefined) {
    throw new Error(`hdiutil attach reported no mount point:\n${attached}`);
  }
  execFileSync('/usr/bin/open', [volumeRow[2]!]);
  await delay(6000);
  try {
    execFileSync('/usr/sbin/screencapture', ['-x', join(output, 'screen.png')]);
    const bounds = execFileSync('/usr/bin/osascript', ['-e', 'tell application "Finder" to get bounds of window 1'], {
      encoding: 'utf8',
    })
      .trim()
      .split(/,\s*/u)
      .map((value) => Number.parseInt(value, 10));
    const [left, top, right, bottom] = bounds;
    if (bounds.length === 4 && bounds.every((value) => Number.isFinite(value))) {
      // Include the title bar and a margin for the window's shadow.
      execFileSync('/usr/sbin/screencapture', [
        '-x',
        `-R${left! - 24},${top! - 40},${right! - left! + 48},${bottom! - top! + 72}`,
        join(output, 'window.png'),
      ]);
    }
  } catch (error) {
    console.warn('Screen capture incomplete; screenshots are best-effort evidence:', error);
  }
  console.log(`DMG preview written to ${output}`);
} finally {
  if (device !== undefined) {
    execFileSync('/usr/bin/hdiutil', ['detach', device, '-force']);
  }
  await rm(scratch, { recursive: true, force: true });
}
