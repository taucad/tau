/**
 * Launch electron-vite through a Tau-branded macOS development bundle.
 *
 * Electron's `app.setName()` is intentionally internal-only; macOS reads the
 * Dock label from the executable bundle. This keeps node_modules immutable by
 * cloning Electron.app into ignored build output before launch.
 *
 * Usage:
 *   node --import @oxc-node/core/register scripts/run-electron-vite.mts dev
 *   node --import @oxc-node/core/register scripts/run-electron-vite.mts preview --skipBuild
 * Optional TAU_LOCAL_CODESIGN_IDENTITY: auto, exact Apple Development certificate name or fingerprint.
 *
 * Exit codes:
 *   0  Electron exited normally
 *   1  Bundle preparation or Electron launch failed
 */

import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { basename, dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { spawn, spawnSync } from 'node:child_process';

// oxlint-disable-next-line no-restricted-imports -- Shared operational signing helper.
import { localSigningIdentity } from './local-signing.mjs';

const desktopRoot = resolve(import.meta.dirname, '..');
const electronVite = resolve(desktopRoot, 'node_modules/electron-vite/bin/electron-vite.js');

const run = (command: string, args: readonly string[]): void => {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.status !== 0) {
    throw new Error(`${basename(command)} exited with ${result.status ?? 'no status'}`);
  }
};

const prepareMacBundle = (): string => {
  const require = createRequire(import.meta.url);
  const electronExecutable = require('electron') as string;
  const sourceBundle = dirname(dirname(dirname(electronExecutable)));
  const overrideRoot = resolve(desktopRoot, 'dist/dev-electron');
  const targetBundle = join(overrideRoot, 'Electron.app');
  const icon = resolve(desktopRoot, 'resources/icon.icns');
  const stampPath = join(overrideRoot, '.tau-brand');
  const identity = localSigningIdentity() ?? '-';
  const stamp = `${electronExecutable}\n${statSync(icon).size}:${statSync(icon).mtimeMs}\nmicrophone-dictation\n${identity}\n`;

  if (existsSync(targetBundle) && existsSync(stampPath) && readFileSync(stampPath, 'utf8') === stamp) {
    return join(targetBundle, 'Contents/MacOS/Electron');
  }

  rmSync(overrideRoot, { recursive: true, force: true });
  mkdirSync(overrideRoot, { recursive: true });
  run('/bin/cp', ['-cR', sourceBundle, targetBundle]);

  const plist = join(targetBundle, 'Contents/Info.plist');
  run('/usr/bin/plutil', ['-replace', 'CFBundleDisplayName', '-string', 'Tau', plist]);
  run('/usr/bin/plutil', ['-replace', 'CFBundleName', '-string', 'Tau', plist]);
  run('/usr/bin/plutil', ['-replace', 'CFBundleIdentifier', '-string', 'com.taucad.tau.dev', plist]);
  run('/usr/bin/plutil', ['-replace', 'CFBundleIconFile', '-string', 'tau.icns', plist]);
  run('/usr/bin/plutil', [
    '-replace',
    'NSMicrophoneUsageDescription',
    '-string',
    'Tau uses your microphone to dictate messages when you start dictation.',
    plist,
  ]);
  copyFileSync(icon, join(targetBundle, 'Contents/Resources/tau.icns'));
  run('/usr/bin/codesign', ['--force', '--deep', '--sign', identity, '--timestamp=none', targetBundle]);
  run('/usr/bin/codesign', ['--verify', '--deep', '--strict', targetBundle]);
  writeFileSync(stampPath, stamp);
  return join(targetBundle, 'Contents/MacOS/Electron');
};

const main = (): void => {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    throw new Error('pass an electron-vite command');
  }

  const environment = { ...process.env };
  if (process.platform === 'darwin') {
    environment['ELECTRON_EXEC_PATH'] = prepareMacBundle();
  }

  const child = spawn(process.execPath, [electronVite, ...args], { env: environment, stdio: 'inherit' });
  child.once('error', (error) => {
    console.error('electron-vite launch failed:', error);
    process.exit(1);
  });
  child.once('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 1);
  });
};

try {
  main();
} catch (error) {
  console.error('electron-vite launch failed:', error);
  process.exit(1);
}
