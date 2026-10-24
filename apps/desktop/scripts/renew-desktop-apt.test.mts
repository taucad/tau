#!/usr/bin/env node
/**
 * Purpose: Verify metadata-only APT renewal using real GPG and deliberately absent retained package/index files.
 * Environment: Disposable Linux container with gnupg; TAU_APT_DISPOSABLE_CONTAINER=1.
 * Usage: bundled by CI, then node renew-desktop-apt.test.mjs.
 * Exit: nonzero on authentication, byte preservation, ordering or validity regressions. No public writes.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
/* oxlint-disable no-restricted-imports -- Test actual native metadata renewal. */
import { renewDesktopApt } from './renew-desktop-apt.mjs';
import { desktopAptSnapshotPrefix, readDesktopAptSnapshot } from './desktop-apt-publication.mjs';
/* oxlint-enable no-restricted-imports */

const main = async (): Promise<void> => {
  assert.equal(process.platform, 'linux');
  assert.equal(process.env['TAU_APT_DISPOSABLE_CONTAINER'], '1');
  const root = await mkdtemp('/tmp/tau-apt-renew-');
  const home = join(root, 'keys');
  await mkdir(home, { mode: 0o700 });
  const command = (args: string[]) =>
    execFileSync('gpg', ['--homedir', home, '--batch', ...args], { encoding: 'utf8', timeout: 60_000 });
  command(['--passphrase', '', '--quick-generate-key', 'Renewal <renew@example.invalid>', 'ed25519', 'sign', '1d']);
  const fingerprint = command(['--with-colons', '--list-keys'])
    .split('\n')
    .find((line) => line.startsWith('fpr:'))!
    .split(':')[9]!;
  const hash = (data: Uint8Array<ArrayBuffer>) => createHash('sha256').update(data).digest('hex');
  const bytes = async (path: string) => Uint8Array.from(await readFile(path));
  const issuedAt = new Date(Date.now() - 9 * 86_400_000).toISOString();
  const validUntil = new Date(Date.parse(issuedAt) + 7 * 86_400_000).toISOString();
  const checksumLines = `SHA256:\n ${'b'.repeat(64)} 42 main/binary-amd64/Packages\n ${'c'.repeat(64)} 24 main/binary-amd64/Packages.gz\n`;
  const release = `Origin: Tau\nLabel: TauStaging\nSuite: staging\nCodename: staging\nDate: ${new Date(issuedAt).toUTCString()}\nValid-Until: ${new Date(validUntil).toUTCString()}\nArchitectures: amd64\nComponents: main\nAcquire-By-Hash: yes\n${checksumLines}`;
  await writeFile(join(root, 'Release'), release);
  command([
    '--local-user',
    `${fingerprint}!`,
    '--output',
    join(root, 'InRelease'),
    '--clearsign',
    join(root, 'Release'),
  ]);
  const inRelease = await bytes(join(root, 'InRelease'));
  const oldInventory = {
    schemaVersion: 1,
    channel: 'staging',
    issuedAt,
    validUntil,
    signingFingerprint: fingerprint,
    packages: [
      {
        tag: 'desktop-staging@0.1.0-staging.1',
        sourceCommit: 'a'.repeat(40),
        kind: 'linux-deb-runtime',
        name: 'tau-staging-runtime_1.0.1_amd64.deb',
        poolPath: 'pool/main/t/tau-staging/1.0.1/tau-staging-runtime_1.0.1_amd64.deb',
        sha256: 'd'.repeat(64),
        size: 4_000_000_000,
      },
    ],
    byHash: ['b', 'c'].map((character, index) => ({
      path: `dists/staging/main/binary-amd64/by-hash/SHA256/${character.repeat(64)}`,
      sha256: character.repeat(64),
      size: index === 0 ? 42 : 24,
    })),
  };
  await writeFile(
    join(root, 'inventory.json'),
    JSON.stringify({ schemaVersion: 1, inReleaseSha256: hash(inRelease), inventory: oldInventory }),
  );
  command([
    '--local-user',
    `${fingerprint}!`,
    '--output',
    join(root, 'inventory.json.gpg'),
    '--detach-sign',
    join(root, 'inventory.json'),
  ]);
  const common = {
    inRelease,
    signedInventory: await bytes(join(root, 'inventory.json')),
    signature: await bytes(join(root, 'inventory.json.gpg')),
    gnupgHome: home,
    signingFingerprint: fingerprint,
    channel: 'staging',
  } as const;
  const outputDirectory = join(root, 'renewed');
  const renewalTime = new Date().toISOString();
  const renewed = await renewDesktopApt({ ...common, outputDirectory, issuedAt: renewalTime });
  assert.deepEqual(renewed.inventory.packages, oldInventory.packages);
  assert.deepEqual(renewed.inventory.byHash, oldInventory.byHash);
  const updatedRelease = await readFile(join(outputDirectory, 'dists/staging/Release'), 'utf8');
  assert.equal(
    updatedRelease.replaceAll(/^Date: .*\n|^Valid-Until: .*\n/gmu, ''),
    release.replaceAll(/^Date: .*\n|^Valid-Until: .*\n/gmu, ''),
  );
  assert.ok(updatedRelease.endsWith(checksumLines));
  command([
    '--verify',
    join(outputDirectory, 'dists/staging/Release.gpg'),
    join(outputDirectory, 'dists/staging/Release'),
  ]);
  const pointer = await bytes(join(outputDirectory, 'dists/staging/InRelease'));
  const prefix = desktopAptSnapshotPrefix(pointer);
  await readDesktopAptSnapshot({
    ...common,
    inRelease: pointer,
    signedInventory: await bytes(join(outputDirectory, prefix, 'inventory.json')),
    signature: await bytes(join(outputDirectory, prefix, 'inventory.json.gpg')),
  });
  assert.deepEqual(await bytes(join(outputDirectory, prefix, 'InRelease')), pointer);
  const published: string[] = [];
  await renewed.publish({
    async put(object) {
      published.push(object.path);
      if (object.path === 'dists/staging/InRelease') {
        assert.equal(object.expectedPreviousSha256, hash(inRelease));
      }
    },
  });
  assert.equal(published.length, 6);
  assert.ok(published.slice(0, 3).every((path) => path.startsWith('snapshots/')));
  assert.deepEqual(published.slice(3), [
    'dists/staging/Release',
    'dists/staging/Release.gpg',
    'dists/staging/InRelease',
  ]);
  assert.ok(published.every((path) => !path.startsWith('pool/') && !path.includes('/by-hash/')));
  await assert.rejects(
    renewDesktopApt({
      ...common,
      outputDirectory: join(root, 'bad-key'),
      issuedAt: renewalTime,
      signingFingerprint: '0'.repeat(40),
    }),
  );
  await assert.rejects(
    renewDesktopApt({
      ...common,
      outputDirectory: join(root, 'bad-signature'),
      issuedAt: renewalTime,
      signature: new TextEncoder().encode('forged'),
    }),
  );
  await assert.rejects(renewDesktopApt({ ...common, outputDirectory: join(root, 'old-time'), issuedAt }));
  await assert.rejects(
    renewDesktopApt({
      ...common,
      outputDirectory: join(root, 'future'),
      issuedAt: new Date(Date.now() + 600_000).toISOString(),
    }),
  );
  await assert.rejects(
    renewDesktopApt({
      ...common,
      outputDirectory: join(root, 'expired'),
      issuedAt: new Date(Date.now() - 8 * 86_400_000).toISOString(),
    }),
  );
  await writeFile(join(outputDirectory, 'dists/staging/Release'), 'tampered');
  let writes = 0;
  await assert.rejects(
    renewed.publish({
      async put() {
        writes += 1;
      },
    }),
    /changed/u,
  );
  assert.equal(writes, 0);
  console.log(
    'PASS metadata-only renewal: expired signed predecessor, absent 4GB package, unchanged checksum closure, ordered CAS, exact key/signature/time refusal and tamper preflight',
  );
};
try {
  await main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
