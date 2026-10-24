#!/usr/bin/env node
/**
 * Purpose: Verify DMG source preservation, installation layout and mismatch rejection.
 * Environment: Node; macOS additionally exercises real hdiutil with an unsigned tiny fixture.
 * Usage: pnpm nx run desktop:test-macos-dmg
 * Exit: nonzero for a changed source, invalid trust mode or mismatched mounted payload.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// oxlint-disable-next-line no-restricted-imports -- Operational helper under test.
import { createMacosDmg, macosAppContentDigest, verifyMacosDmg } from './macos-dmg.mjs';

const main = async (): Promise<void> => {
  const scratch = await mkdtemp(join(tmpdir(), 'tau-dmg-test-'));
  const appPath = join(scratch, 'Tau.app');
  const dmgPath = join(scratch, 'Tau-macos-arm64.dmg');
  try {
    await mkdir(join(appPath, 'Contents/MacOS'), { recursive: true });
    await mkdir(join(appPath, 'Contents/Resources'));
    await writeFile(join(appPath, 'Contents/MacOS/Tau'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
    await writeFile(join(appPath, 'Contents/Resources/payload'), 'finalized app bytes\n');
    await symlink('Resources', join(appPath, 'Contents/ResourcesLink'));
    const before = await macosAppContentDigest(appPath);
    await assert.rejects(createMacosDmg({ appPath, dmgPath, trust: { signed: true, notarized: false } }), {
      name: 'TypeError',
      message: 'Signed DMG requires an explicit signing identity',
    });
    await assert.rejects(createMacosDmg({ appPath, dmgPath, trust: { signed: false, notarized: true } }), {
      name: 'TypeError',
      message: 'Notarized DMG requires signing and a keychain profile',
    });
    await chmod(join(appPath, 'Contents/MacOS/Tau'), 0o644);
    assert.notEqual(await macosAppContentDigest(appPath), before, 'content proof includes executable modes');
    await chmod(join(appPath, 'Contents/MacOS/Tau'), 0o755);
    assert.equal(await macosAppContentDigest(appPath), before);
    if (process.platform !== 'darwin') {
      console.log('DMG trust and content checks passed; native hdiutil acceptance requires macOS.');
      return;
    }
    const zipPath = join(scratch, 'Tau-macos-arm64.zip');
    execFileSync('/usr/bin/ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', appPath, zipPath]);
    const zipBefore = await readFile(zipPath);
    assert.equal(await createMacosDmg({ appPath, dmgPath, trust: { signed: false, notarized: false } }), before);
    assert.equal(await macosAppContentDigest(appPath), before, 'DMG creation leaves finalized app unchanged');
    assert.deepEqual(await readFile(zipPath), zipBefore, 'DMG creation leaves existing ZIP unchanged');
    const trustCalls: string[] = [];
    const fakeTrust = (command: string, arguments_: readonly string[]): string => {
      if (command === '/usr/bin/codesign' || command === '/usr/bin/xcrun' || command === '/usr/sbin/spctl') {
        trustCalls.push(`${command} ${arguments_.join(' ')}`);
        return arguments_.includes('submit') ? '{"status":"Accepted"}' : '';
      }
      return execFileSync(command, arguments_, { encoding: 'utf8' }).trim();
    };
    await createMacosDmg(
      {
        appPath,
        dmgPath,
        trust: { signed: true, notarized: true, team: 'TESTTEAM12', developerId: true },
        identity: 'fixture-identity',
        keychainProfile: 'fixture-profile',
      },
      fakeTrust,
    );
    const signing = trustCalls.findIndex((call) => call.includes('--sign fixture-identity'));
    const submission = trustCalls.findIndex((call) => call.includes('notarytool submit'));
    const stapling = trustCalls.findIndex((call) => call.includes('stapler staple'));
    const validation = trustCalls.findIndex((call) => call.includes('stapler validate'));
    assert.ok(signing !== -1 && submission > signing && stapling > submission && validation > stapling);
    assert.ok(
      trustCalls.some(
        (call) =>
          call.includes('anchor apple generic') &&
          call.includes('1.2.840.113635.100.6.1.13') &&
          call.includes('1.2.840.113635.100.6.2.6'),
      ),
    );
    execFileSync('/usr/bin/codesign', ['--force', '--sign', '-', dmgPath]);
    await assert.rejects(
      verifyMacosDmg({
        appPath,
        dmgPath,
        trust: { signed: true, notarized: false, team: 'TESTTEAM12', developerId: true },
      }),
      (error: unknown) =>
        error instanceof Error && error.message.includes('code failed to satisfy specified code requirement'),
    );
    trustCalls.length = 0;
    await assert.rejects(
      createMacosDmg(
        {
          appPath,
          dmgPath,
          trust: { signed: true, notarized: true },
          identity: 'fixture-identity',
          keychainProfile: 'fixture-profile',
        },
        (command, arguments_) => {
          if (arguments_.includes('submit')) {
            return '{"status":"Invalid"}';
          }
          return fakeTrust(command, arguments_);
        },
      ),
      { name: 'Error', message: 'DMG notarization was not accepted' },
    );
    assert.ok(!trustCalls.some((call) => call.includes('stapler staple')), 'rejected notarization must not staple');
    await writeFile(join(appPath, 'Contents/Resources/payload'), 'changed bytes\n');
    await assert.rejects(verifyMacosDmg({ appPath, dmgPath, trust: { signed: false, notarized: false } }), {
      name: 'Error',
      message: 'DMG app content differs from the finalized ZIP source',
    });
    console.log(
      'DMG native fixture passed: real mount, Applications shortcut, identical app and ZIP, mismatch refusal.',
    );
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
};

try {
  await main();
} catch (error) {
  console.error('DMG acceptance failed:', error);
  process.exit(1);
}
