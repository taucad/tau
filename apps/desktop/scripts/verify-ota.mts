#!/usr/bin/env node
/* eslint-disable @typescript-eslint/naming-convention -- Child process environment keys use their external uppercase contract. */
/**
 * Purpose: Launch a previous signed Tau and observe native replacement and relaunch into the candidate.
 * Environment: macOS GUI runner, DESKTOP_RELEASE_TAG, TAU_DESKTOP_SOURCE_SHA, DESKTOP_ASSETS_DIR,
 * OTA_BASELINE_ZIP. A fresh OS user profile is required. No signing secrets are used.
 * Usage: pnpm nx run desktop:verify-ota
 * Exit: nonzero unless Squirrel replaces and relaunches Tau with retained data and the expected signature.
 */
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { access, mkdir, readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

import { z } from 'zod';

import { desktopArchiveName, desktopReleaseIdentity } from '#shared/desktop-release.js';

const required = (name: string): string => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name}`);
  }
  return value;
};
const main = async (): Promise<void> => {
  const tag = required('DESKTOP_RELEASE_TAG');
  const { channel, version } = desktopReleaseIdentity(tag);
  const root = resolve(required('DESKTOP_ASSETS_DIR'));
  const outputRoot = resolve(root, 'ota-install');
  const target = `darwin-${process.arch}`;
  const archive = desktopArchiveName(process.platform, process.arch);
  if (process.platform !== 'darwin') {
    throw new Error('Native macOS OTA must run on a Mac');
  }
  const installation = resolve(outputRoot, `Tau-${target}`);
  const profile = resolve(homedir(), 'Library/Application Support', channel === 'staging' ? 'Tau Staging' : 'Tau');
  try {
    await access(profile);
    throw new Error(`OTA requires a fresh runner account: ${profile} already exists`);
  } catch (error) {
    if (!(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')) {
      throw error;
    }
  }
  await mkdir(installation, { recursive: true });
  execFileSync('ditto', ['-xk', required('OTA_BASELINE_ZIP'), installation]);
  const app = resolve(installation, 'Tau.app');
  const executable = resolve(app, 'Contents/MacOS/Tau');
  const verify = (): void => {
    execFileSync('codesign', ['--verify', '--deep', '--strict', app]);
  };
  verify();
  const signature = spawnSync('codesign', ['-d', '--verbose=4', '-r-', app], { encoding: 'utf8' });
  if (signature.status !== 0) {
    throw new Error('Cannot read baseline signing requirement');
  }
  // Identity details go to stderr; codesign writes the designated requirement to stdout.
  const requirement = `${signature.stderr}\n${signature.stdout}`;
  const team = /^TeamIdentifier=(.+)$/mu.exec(requirement)?.[1];
  if (!team || !requirement.includes('Authority=Developer ID Application:')) {
    throw new Error('OTA baseline must carry a Developer ID Application signature');
  }
  const designated = /designated => (.+)/u.exec(requirement)?.[1];
  if (!designated) {
    throw new Error('Missing baseline designated requirement');
  }
  const child = spawn(executable, [`--tau-ota-probe=${tag}`], { stdio: 'inherit' });
  const receiptPath = resolve(profile, 'ota-probe.result.json');
  const deadline = Date.now() + 25 * 60 * 1000;
  let receipt: z.infer<typeof resultSchema> | undefined;
  try {
    /* oxlint-disable no-await-in-loop -- Poll one process receipt until native replacement completes. */
    while (Date.now() < deadline) {
      try {
        receipt = resultSchema.parse(JSON.parse(await readFile(receiptPath, 'utf8')));
        break;
      } catch (error) {
        if (!(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')) {
          throw error;
        }
      }
      if (child.exitCode !== null && child.exitCode !== 0) {
        throw new Error(`Baseline exited with ${child.exitCode}`);
      }
      await sleep(1000);
    }
    /* oxlint-enable no-await-in-loop */
    if (
      !receipt ||
      receipt.version !== version ||
      receipt.candidateTag !== tag ||
      receipt.pid === receipt.sourcePid ||
      receipt.sourcePid !== child.pid
    ) {
      throw new Error('Native OTA replacement/relaunch timed out or reported the wrong process/version');
    }
    verify();
    execFileSync('codesign', ['--verify', '--strict', '-R', `=${designated}`, app]);
    const actualVersion = execFileSync(
      'plutil',
      ['-extract', 'CFBundleShortVersionString', 'raw', '-o', '-', resolve(app, 'Contents/Info.plist')],
      { encoding: 'utf8' },
    ).trim();
    if (actualVersion !== version) {
      throw new Error('Installed plist version differs from candidate');
    }
    const manifest = JSON.parse(
      execFileSync(
        executable,
        ['-p', `JSON.stringify(require(${JSON.stringify(resolve(app, 'Contents/Resources/app.asar/package.json'))}))`],
        { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, encoding: 'utf8' },
      ),
    ) as { version: string; tauDesktop?: { channel?: string; sourceCommit?: string } };
    if (
      manifest.version !== version ||
      (manifest.tauDesktop?.channel ?? 'production') !== channel ||
      manifest.tauDesktop?.sourceCommit !== required('TAU_DESKTOP_SOURCE_SHA')
    ) {
      throw new Error('Installed manifest provenance disagrees with candidate');
    }
    if (channel === 'production') {
      execFileSync('xcrun', ['stapler', 'validate', app]);
    }
    const candidate = resolve(root, 'ota-candidate');
    await mkdir(candidate, { recursive: true });
    execFileSync('ditto', ['-xk', resolve(root, archive), candidate]);
    // The signed ASAR is the complete application code; compare it byte for byte after ShipIt.
    const hash = async (path: string): Promise<string> => {
      const value = createHash('sha256');
      for await (const chunk of createReadStream(path)) {
        value.update(Buffer.from(chunk));
      }
      return value.digest('hex');
    };
    const installedHash = await hash(resolve(app, 'Contents/Resources/app.asar'));
    if (installedHash !== (await hash(resolve(candidate, 'Tau.app/Contents/Resources/app.asar')))) {
      throw new Error('Installed signed application differs from the candidate archive');
    }
    execFileSync(
      process.execPath,
      [
        '--import',
        '@oxc-node/core/register',
        resolve(import.meta.dirname, 'verify-macos-package.mts'),
        '--release',
        ...(channel === 'staging' ? ['--skip-notarization'] : []),
      ],
      {
        stdio: 'inherit',
        env: {
          ...process.env,
          TAU_MACOS_PACKAGE_OUTPUT_ROOT: outputRoot,
          TAU_DESKTOP_CHANNEL: channel,
          TAU_DESKTOP_RELEASE_TAG: tag,
          APPLE_TEAM_ID: team,
        },
      },
    );
    const { writeFile } = await import('node:fs/promises');
    await writeFile(
      resolve(root, `ota-receipt-${target}.json`),
      JSON.stringify(
        {
          ...receipt,
          status: 'passed',
          target,
          tag,
          sourceCommit: required('TAU_DESKTOP_SOURCE_SHA'),
          asarSha256: installedHash,
        },
        null,
        2,
      ) + '\n',
    );
    console.log(`Native OTA passed: ${receipt.sourceVersion} → ${version} (${channel})`);
  } finally {
    if (receipt?.pid) {
      try {
        process.kill(receipt.pid, 'SIGTERM');
      } catch {
        /* The observed candidate may have already exited. */
      }
    }
    if (child.exitCode === null) {
      child.kill('SIGTERM');
    }
  }
};
const resultSchema = z
  .object({
    sourcePid: z.number().int(),
    pid: z.number().int(),
    version: z.string(),
    sourceVersion: z.string(),
    candidateTag: z.string(),
  })
  .loose();
try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

/* eslint-enable @typescript-eslint/naming-convention -- End child process environment contract. */
