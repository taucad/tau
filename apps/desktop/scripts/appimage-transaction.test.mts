#!/usr/bin/env node
/* oxlint-disable no-await-in-loop -- Fault scenarios run serially with isolated filesystem state. */
/**
 * Purpose: Exercise the real AppImage transaction with kernel leases, process kills and filesystem failures.
 * Environment: Linux, util-linux flock; optional /limited tmpfs of 1 MiB for real ENOSPC coverage.
 * Usage: pnpm nx run desktop:test-appimage-transaction
 * Exit: nonzero on a missing/raced image, lost healthy recovery or incorrect commit state.
 */
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  acknowledgeHealthyAppImage,
  acquireAppImageLease,
  appImageDigest,
  AppImageCommitError,
  prepareAppImageInstallation,
  validateAppImageLocation,
} from '#main/appimage-transaction.js';

const self = fileURLToPath(import.meta.url);
const bytesA = '#!/bin/sh\nprintf "A\\n"\n';
const bytesB = '#!/bin/sh\nprintf "B\\n"\n';
const digest = (bytes: string | Uint8Array<ArrayBuffer>): string => createHash('sha512').update(bytes).digest('base64');
const child = (arguments_: string[]) =>
  spawnSync(process.execPath, [...process.execArgv, self, ...arguments_], { encoding: 'utf8' });
const setup = (full = false) => {
  const root = mkdtempSync(full ? '/limited/tau-appimage-' : '/tmp/tau-appimage-');
  const install = join(root, 'install');
  mkdirSync(install, { mode: 0o700 });
  const current = join(install, 'Tau.AppImage');
  const cache = mkdtempSync('/dev/shm/tau-appimage-');
  const path = join(cache, 'download.AppImage');
  writeFileSync(current, bytesA, { mode: 0o700 });
  writeFileSync(path, bytesB, { mode: 0o700 });
  writeFileSync(join(root, 'profile.json'), '{"project":"preserve","schema":1}\n');
  acknowledgeHealthyAppImage({ current, expectedCurrent: digest(bytesA), version: '1.0.1' });
  return {
    root,
    install,
    current,
    cache,
    path,
    candidate: { path, sha512: digest(bytesB), size: Buffer.byteLength(bytesB), version: '1.0.2' },
  };
};
const cleanup = (fixture: ReturnType<typeof setup>) => {
  chmodSync(fixture.install, 0o700);
  rmSync(fixture.root, { recursive: true, force: true });
  rmSync(fixture.cache, { recursive: true, force: true });
};
const unchangedProfile = (root: string) => {
  assert.equal(readFileSync(join(root, 'profile.json'), 'utf8'), '{"project":"preserve","schema":1}\n');
};
const oldRecovery = (install: string) =>
  readdirSync(install)
    .filter((name) => name.includes('.healthy-') && name.endsWith('.AppImage'))
    .some((name) => readFileSync(join(install, name), 'utf8') === bytesA);

const main = async (): Promise<void> => {
  if (process.platform !== 'linux') {
    throw new Error(
      'AppImage transaction acceptance requires Linux; run the compiled fixture in the documented Linux container',
    );
  }
  if (process.argv[2] === '--lease') {
    const release = acquireAppImageLease(process.argv[3]!);
    release();
    return;
  }
  if (process.argv[2] === '--lease-kill') {
    acquireAppImageLease(process.argv[3]!);
    process.kill(process.pid, 'SIGKILL');
    return;
  }
  if (process.argv[2] === '--child') {
    const [current, candidatePath, fault] = process.argv.slice(3);
    const candidate = {
      path: candidatePath!,
      sha512: digest(bytesB),
      size: Buffer.byteLength(bytesB),
      version: '1.0.2',
    };
    const installation = await prepareAppImageInstallation({
      current: current!,
      expectedCurrent: digest(bytesA),
      candidate,
      checkpoint: (phase) => {
        if (fault === `kill-${phase}`) {
          process.kill(process.pid, 'SIGKILL');
        }
      },
    });
    installation.commit();
    return;
  }
  let passed = 0;
  for (const phase of ['copied', 'staged', 'backup-durable', 'renamed', 'committed']) {
    const fixture = setup();
    try {
      const result = child(['--child', fixture.current, fixture.path, `kill-${phase}`]);
      assert.equal(result.signal, 'SIGKILL', result.stderr);
      assert.equal(readFileSync(fixture.current, 'utf8'), ['renamed', 'committed'].includes(phase) ? bytesB : bytesA);
      assert.equal(oldRecovery(fixture.install), true);
      unchangedProfile(fixture.root);
      assert.equal(child(['--lease', fixture.current]).status, 0, 'dead owner must release the kernel lease');
      passed += 1;
    } finally {
      cleanup(fixture);
    }
  }
  for (const fault of [
    'none',
    'cancel',
    'permissions',
    'candidate-tamper',
    'staged-tamper',
    'current-tamper',
    'postcommit',
  ]) {
    const fixture = setup();
    try {
      if (fault === 'permissions') {
        chmodSync(fixture.install, 0o500);
      }
      if (fault === 'candidate-tamper') {
        writeFileSync(fixture.path, 'x'.repeat(Buffer.byteLength(bytesB)));
      }
      const preparing = prepareAppImageInstallation({
        current: fixture.current,
        expectedCurrent: digest(bytesA),
        candidate: fixture.candidate,
        checkpoint: (phase) => {
          if (fault === 'staged-tamper' && phase === 'copied') {
            const pending = readdirSync(fixture.install).find((name) => name.endsWith('.pending'))!;
            writeFileSync(join(fixture.install, pending), 'tampered');
          }
          if (fault === 'postcommit' && phase === 'renamed') {
            throw new Error('injected directory fsync failure');
          }
        },
      });
      if (['permissions', 'candidate-tamper', 'staged-tamper'].includes(fault)) {
        await assert.rejects(preparing, fault === 'permissions' ? /EACCES/u : /Staged AppImage digest mismatch/u);
        assert.equal(readFileSync(fixture.current, 'utf8'), bytesA);
      } else {
        const installation = await preparing;
        assert.notEqual(child(['--lease', fixture.current]).status, 0, 'another process cannot acquire active lease');
        switch (fault) {
          case 'cancel': {
            installation.release();
            installation.release();
            assert.equal(readFileSync(fixture.current, 'utf8'), bytesA);

            break;
          }
          case 'current-tamper': {
            writeFileSync(fixture.current, '#!/bin/sh\nprintf "external replacement"\n');
            assert.throws(() => {
              installation.commit();
            }, /AppImage changed before commit/u);

            break;
          }
          case 'postcommit': {
            assert.throws(
              () => {
                installation.commit();
              },
              (error: unknown) => error instanceof AppImageCommitError && error.committed,
            );
            assert.equal(readFileSync(fixture.current, 'utf8'), bytesB);

            break;
          }
          default: {
            installation.commit();
            assert.equal(execFileSync(fixture.current, [], { encoding: 'utf8' }), 'B\n');
            assert.throws(() => {
              installation.commit();
            }, /no longer prepared/u);
          }
        }
      }
      unchangedProfile(fixture.root);
      if (fault !== 'current-tamper') {
        assert.equal(oldRecovery(fixture.install), true);
      }
      passed += 1;
    } finally {
      cleanup(fixture);
    }
  }
  const fixture = setup();
  try {
    const release = acquireAppImageLease(fixture.current);
    assert.notEqual(child(['--lease', fixture.current]).status, 0);
    release();
    assert.equal(child(['--lease-kill', fixture.current]).signal, 'SIGKILL');
    assert.equal(child(['--lease', fixture.current]).status, 0);
    const alias = join(fixture.install, 'alias.AppImage');
    symlinkSync(fixture.current, alias);
    assert.throws(() => validateAppImageLocation(alias), /real absolute outer image path/u);
    chmodSync(fixture.current, 0o722);
    assert.throws(() => validateAppImageLocation(fixture.current), /shared write permissions/u);
    chmodSync(fixture.current, 0o700);
    const first = await prepareAppImageInstallation({
      current: fixture.current,
      expectedCurrent: digest(bytesA),
      candidate: fixture.candidate,
    });
    first.commit();
    // B never acknowledged readiness. C is a forward repair; A remains the last healthy image.
    const bytesC = '#!/bin/sh\nprintf "C\\n"\n';
    writeFileSync(fixture.path, bytesC);
    const second = await prepareAppImageInstallation({
      current: fixture.current,
      expectedCurrent: digest(bytesB),
      candidate: { path: fixture.path, sha512: digest(bytesC), size: Buffer.byteLength(bytesC), version: '1.0.3' },
    });
    second.commit();
    acknowledgeHealthyAppImage({ current: fixture.current, expectedCurrent: digest(bytesC), version: '1.0.3' });
    const health = JSON.parse(readFileSync(`${fixture.current}.update-health.json`, 'utf8')) as {
      previousHealthy: { sha512: string };
      healthy: { sha512: string };
    };
    assert.equal(health.previousHealthy.sha512, digest(bytesA));
    assert.equal(health.healthy.sha512, digest(bytesC));
    assert.equal(oldRecovery(fixture.install), true);
    unchangedProfile(fixture.root);
    passed += 4;
  } finally {
    cleanup(fixture);
  }
  if (existsSync('/limited')) {
    const full = setup(true);
    try {
      const bytes = Buffer.alloc(2 * 1024 * 1024, 0x23);
      writeFileSync(full.path, bytes);
      await assert.rejects(
        prepareAppImageInstallation({
          current: full.current,
          expectedCurrent: digest(bytesA),
          candidate: { ...full.candidate, sha512: digest(bytes), size: bytes.length },
        }),
        /ENOSPC/u,
      );
      assert.equal(appImageDigest(full.current), digest(bytesA));
      assert.equal(oldRecovery(full.install), true);
      passed += 1;
    } finally {
      cleanup(full);
    }
  } else {
    console.log('Real ENOSPC scenario not run: mount a private 1 MiB tmpfs at /limited.');
  }
  console.log(`AppImage transaction: ${passed} scenarios passed; no Electron/FUSE/VM qualification implied.`);
};
try {
  await main();
} catch (error) {
  console.error(error);
  process.exit(1);
}

/* oxlint-enable no-await-in-loop -- End fault scenarios. */
