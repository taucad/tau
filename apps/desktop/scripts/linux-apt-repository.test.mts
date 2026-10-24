#!/usr/bin/env node
/**
 * Purpose: Verify actual GPG signatures and APT acquisition against disposable signed repository snapshots.
 * Environment: Linux disposable container with node, dpkg-deb, apt-get, gpg/gpgv; no real signing keys.
 * Usage: bundle this file then run in node:24-bookworm-slim with TAU_APT_DISPOSABLE_CONTAINER=1.
 * Exit: nonzero on tamper, identity, expiry, retention, or signed repository regressions.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmod, cp, copyFile, mkdir, mkdtemp, readFile, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
// oxlint-disable-next-line no-restricted-imports -- Test the real repository builder with native tools.
import { buildLinuxAptRepository } from './linux-apt-repository.mjs';
// oxlint-disable-next-line no-restricted-imports -- The test uses the exact public producer input contract.
import type { LinuxAptRepositoryPackage } from './linux-apt-repository.mjs';

const main = async (): Promise<void> => {
  assert.equal(process.platform, 'linux');
  assert.equal(process.env['TAU_APT_DISPOSABLE_CONTAINER'], '1');
  const root = await mkdtemp('/tmp/tau-apt-repository-');
  await chmod(root, 0o755);
  const command = (name: string, args: string[]) =>
    execFileSync(name, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 120_000 });
  const home = join(root, 'keys');
  await mkdir(home, { mode: 0o700 });
  command('gpg', [
    '--homedir',
    home,
    '--batch',
    '--pinentry-mode',
    'loopback',
    '--passphrase',
    '',
    '--quick-generate-key',
    'Tau Test <tau@example.invalid>',
    'rsa2048',
    'sign',
    '1d',
  ]);
  const fingerprint = command('gpg', ['--homedir', home, '--with-colons', '--list-keys'])
    .split('\n')
    .find((line) => line.startsWith('fpr:'))!
    .split(':')[9]!;
  const keyring = join(root, 'public.gpg');
  command('gpg', ['--homedir', home, '--output', keyring, '--export', fingerprint]);
  const issuedAt = new Date(Date.now() - 60_000).toISOString();
  const sourceCommit = 'a'.repeat(40);
  /* oxlint-disable no-await-in-loop -- Native fixture assembly and byte comparisons are serial and bounded to two package roles. */
  const packages = async (version: string): Promise<LinuxAptRepositoryPackage[]> => {
    const result: LinuxAptRepositoryPackage[] = [];
    for (const kind of ['linux-deb-runtime', 'linux-deb-selector'] as const) {
      const name = kind === 'linux-deb-runtime' ? `tau-runtime-${version}` : 'tau';
      const stage = join(root, `${name}-${version}`);
      await mkdir(join(stage, 'DEBIAN'), { recursive: true });
      await writeFile(
        join(stage, 'DEBIAN/control'),
        `Package: ${name}\nVersion: ${version}\nArchitecture: amd64\nMaintainer: Test <test@example.invalid>\nDescription: Inert repository fixture\n${kind === 'linux-deb-selector' ? `Depends: tau-runtime-${version} (= ${version})\n` : ''}`,
      );
      const path = join(root, `${name}-${version}.deb`);
      command('dpkg-deb', ['--build', stage, path]);
      const bytes = await readFile(path);
      result.push({
        path,
        kind,
        tag: `desktop@${version}`,
        sourceCommit,
        sha256: createHash('sha256').update(bytes).digest('hex'),
        size: bytes.length,
      });
    }
    return result;
  };
  const firstPackages = await packages('0.1.0');
  const common = { channel: 'production', issuedAt, gnupgHome: home, signingFingerprint: fingerprint } as const;
  const firstDirectory = join(root, 'first');
  const first = await buildLinuxAptRepository({ ...common, outputDirectory: firstDirectory, packages: firstPackages });
  assert.equal(first.inventory.packages.length, 2);
  assert.equal(first.inventory.byHash.length, 2);
  assert.deepEqual(
    first.publication.slice(-3).map((item) => item.path),
    ['dists/stable/Release', 'dists/stable/Release.gpg', 'dists/stable/InRelease'],
  );
  assert.ok(first.publication.slice(0, 4).every((item) => item.immutable));
  const release = await readFile(join(firstDirectory, 'dists/stable/Release'), 'utf8');
  assert.match(release, /Origin: Tau\nLabel: TauProduction\nSuite: stable\nCodename: stable/u);
  assert.match(release, /Acquire-By-Hash: yes/u);
  assert.equal(Date.parse(first.inventory.validUntil) - Date.parse(first.inventory.issuedAt), 7 * 24 * 60 * 60 * 1000);
  const aptUpdate = async (directory: string, expectedKey = keyring): Promise<string> => {
    const state = await mkdtemp(join(root, 'apt-'));
    await chmod(state, 0o755);
    await mkdir(join(state, 'lists/partial'), { recursive: true });
    const source = join(state, 'sources.list');
    await writeFile(source, `deb [arch=amd64 signed-by=${expectedKey}] file:${directory} stable main\n`);
    return command('apt-get', [
      '-o',
      `Dir::Etc::sourcelist=${source}`,
      '-o',
      'Dir::Etc::sourceparts=-',
      '-o',
      `Dir::State::lists=${state}/lists`,
      '-o',
      'APT::Get::List-Cleanup=0',
      '-o',
      'Acquire::Languages=none',
      '-o',
      'Acquire::IndexTargets::deb::DEP-11::DefaultEnabled=false',
      'update',
      '--error-on=any',
    ]);
  };
  assert.match(await aptUpdate(firstDirectory), /Reading package lists/u);
  const secondDirectory = join(root, 'second');
  const second = await buildLinuxAptRepository({
    ...common,
    issuedAt: new Date(Date.parse(issuedAt) + 10_000).toISOString(),
    outputDirectory: secondDirectory,
    packages: await packages('0.2.0'),
    previous: { directory: firstDirectory, inventory: first.inventory },
  });
  assert.equal(second.inventory.packages.length, 4);
  assert.equal(second.inventory.byHash.length, 4);
  for (const retained of first.inventory.byHash) {
    assert.deepEqual(
      await readFile(join(firstDirectory, retained.path)),
      await readFile(join(secondDirectory, retained.path)),
    );
  }
  for (const retained of first.inventory.packages) {
    assert.deepEqual(
      await readFile(join(firstDirectory, retained.poolPath)),
      await readFile(join(secondDirectory, retained.poolPath)),
    );
  }
  assert.match(await aptUpdate(secondDirectory), /Reading package lists/u);
  const mixedDirectory = join(root, 'cached-release');
  await cp(secondDirectory, mixedDirectory, { recursive: true });
  await copyFile(join(firstDirectory, 'dists/stable/InRelease'), join(mixedDirectory, 'dists/stable/InRelease'));
  assert.match(await aptUpdate(mixedDirectory), /Reading package lists/u);
  const damagedDirectory = join(root, 'damaged-index');
  await cp(secondDirectory, damagedDirectory, { recursive: true });
  for (const item of second.inventory.byHash) {
    await writeFile(join(damagedDirectory, item.path), 'damaged');
  }
  await writeFile(join(damagedDirectory, 'dists/stable/main/binary-amd64/Packages'), 'damaged');
  await writeFile(join(damagedDirectory, 'dists/stable/main/binary-amd64/Packages.gz'), 'damaged');
  await assert.rejects(aptUpdate(damagedDirectory), /Hash Sum mismatch|unexpected size|File has unexpected size/u);
  const renewed = await buildLinuxAptRepository({
    ...common,
    issuedAt: new Date(Date.parse(issuedAt) + 20_000).toISOString(),
    outputDirectory: join(root, 'renewed'),
    packages: [],
    previous: { directory: secondDirectory, inventory: second.inventory },
  });
  assert.equal(renewed.inventory.packages.length, 4);
  assert.equal(renewed.inventory.byHash.length, 4);
  await assert.rejects(
    buildLinuxAptRepository({
      ...common,
      outputDirectory: join(root, 'wrong-hash'),
      packages: firstPackages.map((item) => ({ ...item, sha256: 'f'.repeat(64) })),
    }),
    /differ from the manifest/u,
  );
  await assert.rejects(
    buildLinuxAptRepository({ ...common, outputDirectory: join(root, 'partial'), packages: firstPackages.slice(0, 1) }),
    /both|selector and runtime/u,
  );
  await assert.rejects(
    buildLinuxAptRepository({
      ...common,
      signingFingerprint: '0'.repeat(40),
      outputDirectory: join(root, 'wrong-key'),
      packages: firstPackages,
    }),
  );
  await assert.rejects(
    buildLinuxAptRepository({
      ...common,
      outputDirectory: join(root, 'cross-channel'),
      packages: firstPackages.map((item) => ({ ...item, tag: 'desktop-staging@0.1.0-staging.1' })),
    }),
    /another channel/u,
  );
  const traversal = structuredClone(first.inventory);
  traversal.packages[0]!.poolPath = '../escape';
  await assert.rejects(
    buildLinuxAptRepository({
      ...common,
      issuedAt: new Date().toISOString(),
      outputDirectory: join(root, 'traversal'),
      packages: [],
      previous: { directory: firstDirectory, inventory: traversal },
    }),
    /path/u,
  );
  const linked = join(root, 'linked.deb');
  await symlink(firstPackages[0]!.path, linked);
  await assert.rejects(
    buildLinuxAptRepository({
      ...common,
      outputDirectory: join(root, 'symlink'),
      packages: [{ ...firstPackages[0]!, path: linked }, firstPackages[1]!],
    }),
    /symlink/u,
  );
  const expiredDirectory = join(root, 'expired');
  await buildLinuxAptRepository({
    ...common,
    issuedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
    outputDirectory: expiredDirectory,
    packages: firstPackages,
  });
  await assert.rejects(aptUpdate(expiredDirectory), /expired/u);
  const wrongHome = join(root, 'wrong-keys');
  await mkdir(wrongHome, { mode: 0o700 });
  command('gpg', [
    '--homedir',
    wrongHome,
    '--batch',
    '--pinentry-mode',
    'loopback',
    '--passphrase',
    '',
    '--quick-generate-key',
    'Other Test <other@example.invalid>',
    'rsa2048',
    'sign',
    '1d',
  ]);
  const wrongKey = join(root, 'wrong.gpg');
  command('gpg', ['--homedir', wrongHome, '--output', wrongKey, '--export']);
  await assert.rejects(aptUpdate(firstDirectory, wrongKey), /NO_PUBKEY|signature|public key/u);
  const inline = join(firstDirectory, 'dists/stable/InRelease');
  const originalInline = await readFile(inline, 'utf8');
  await writeFile(inline, originalInline.replace('Origin: Tau', 'Origin: Evil'));
  await assert.rejects(aptUpdate(firstDirectory), /BADSIG|signature/u);
  await copyFile(join(secondDirectory, 'dists/stable/InRelease'), join(root, 'signature-copy'));
  const tamperedPath = join(secondDirectory, second.inventory.packages[0]!.poolPath);
  await writeFile(tamperedPath, 'tampered');
  await assert.rejects(
    buildLinuxAptRepository({
      ...common,
      issuedAt: new Date().toISOString(),
      outputDirectory: join(root, 'retained-tamper'),
      packages: [],
      previous: { directory: secondDirectory, inventory: second.inventory },
    }),
    /differ from the manifest/u,
  );
  console.log(
    JSON.stringify({
      status: 'passed',
      scenarios: 17,
      signingTrust: 'ephemeral-test-only',
      apt: 'real signature/index/expiry acquisition',
      retainedPackages: renewed.inventory.packages.length,
      retainedIndexes: renewed.inventory.byHash.length,
    }),
  );

  /* oxlint-enable no-await-in-loop */
};
try {
  await main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
