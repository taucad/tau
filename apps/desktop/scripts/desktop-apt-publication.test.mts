/** Native Linux publication interruptions with ephemeral keys and inert debs; TAU_APT_DISPOSABLE_CONTAINER=1 only. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmod, copyFile, cp, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { desktopArtifactKinds, desktopArtifactName } from '#shared/desktop-release.js';
/* oxlint-disable no-restricted-imports -- Exercise the adjacent publication script with native tools. */
import {
  desktopAptSnapshotPrefix,
  prepareDesktopAptPublication,
  readDesktopAptSnapshot,
} from './desktop-apt-publication.mjs';
/* oxlint-enable no-restricted-imports */

const main = async (): Promise<void> => {
  assert.equal(process.platform, 'linux');
  assert.equal(process.env['TAU_APT_DISPOSABLE_CONTAINER'], '1');
  const root = await mkdtemp('/tmp/tau-apt-publication-');
  await chmod(root, 0o755);
  const home = join(root, 'keys');
  await mkdir(home, { mode: 0o700 });
  const command = (name: string, args: string[]) => execFileSync(name, args, { encoding: 'utf8', timeout: 120_000 });
  command('gpg', [
    '--homedir',
    home,
    '--batch',
    '--pinentry-mode',
    'loopback',
    '--passphrase',
    '',
    '--quick-generate-key',
    'Tau Fixture <tau@example.invalid>',
    'rsa2048',
    'sign',
    '1d',
  ]);
  const fingerprint = command('gpg', ['--homedir', home, '--with-colons', '--list-keys'])
    .split('\n')
    .find((line) => line.startsWith('fpr:'))!
    .split(':')[9]!;
  const hash = (bytes: Uint8Array<ArrayBuffer>) => createHash('sha256').update(bytes).digest('hex');
  const bytes = async (path: string) => Uint8Array.from(await readFile(path));
  const version = '1.0.1';
  const tag = 'desktop-staging@0.1.0-staging.1';
  const artifacts = [];
  /* oxlint-disable no-await-in-loop -- Native filesystem fixtures and publication boundaries are explicitly serial. */
  for (const kind of ['linux-deb-runtime', 'linux-deb-selector'] as const) {
    const name = kind === 'linux-deb-runtime' ? `tau-staging-runtime-${version}` : 'tau-staging';
    const stage = join(root, name);
    await mkdir(join(stage, 'DEBIAN'), { recursive: true });
    await writeFile(
      join(stage, 'DEBIAN/control'),
      `Package: ${name}\nVersion: ${version}\nArchitecture: amd64\nMaintainer: Test <test@example.invalid>\nDescription: Inert publication fixture\n${kind === 'linux-deb-selector' ? `Depends: tau-staging-runtime-${version} (= ${version})\n` : ''}`,
    );
    const filename = desktopArtifactName({ kind, channel: 'staging', version, arch: 'x64' });
    command('dpkg-deb', ['--build', stage, join(root, filename)]);
    const data = await bytes(join(root, filename));
    artifacts.push({
      kind,
      target: 'linux-x64',
      format: 'deb',
      roles: desktopArtifactKinds[kind].roles,
      name: filename,
      sha256: hash(data),
      sha512: createHash('sha512').update(data).digest('base64'),
      size: data.byteLength,
    });
  }
  const manifest = { schemaVersion: 1, tag, channel: 'staging', version, sourceCommit: 'a'.repeat(40), artifacts };
  const common = { channel: 'staging', gnupgHome: home, signingFingerprint: fingerprint } as const;
  const firstDirectory = join(root, 'first');
  const first = await prepareDesktopAptPublication({
    ...common,
    issuedAt: new Date(Date.now() - 60_000).toISOString(),
    outputDirectory: firstDirectory,
    manifest,
    artifactDirectory: root,
  });
  const inRelease = await bytes(join(firstDirectory, 'dists/staging/InRelease'));
  const prefix = desktopAptSnapshotPrefix(inRelease);
  assert.deepEqual(await bytes(join(firstDirectory, prefix, 'InRelease')), inRelease);
  const signedInventory = await bytes(join(firstDirectory, prefix, 'inventory.json'));
  const signature = await bytes(join(firstDirectory, prefix, 'inventory.json.gpg'));
  const previous = { directory: firstDirectory, inRelease, signedInventory, signature };
  const verified = await readDesktopAptSnapshot({ ...common, ...previous });
  assert.equal(verified.objects.length, 4);
  const second = await prepareDesktopAptPublication({
    ...common,
    issuedAt: new Date().toISOString(),
    outputDirectory: join(root, 'second'),
    previous,
  });
  assert.deepEqual(second.inventory.packages, first.inventory.packages);
  assert.equal(second.publication.at(-1)?.path, 'dists/staging/InRelease');
  const snapshotPointerIndex = second.publication.findIndex(
    (item) => item.path.startsWith('snapshots/') && item.path.endsWith('/InRelease'),
  );
  assert.ok(
    snapshotPointerIndex !== -1 && snapshotPointerIndex < second.publication.findIndex((item) => !item.immutable),
  );
  assert.equal(second.publication[snapshotPointerIndex]?.immutable, true);
  assert.ok(second.publication.slice(0, -5).every((item) => item.immutable));
  const publicKey = join(root, 'public.gpg');
  command('gpg', ['--homedir', home, '--output', publicKey, '--export', fingerprint]);
  let scenarios = 0;
  for (let stop = 0; stop < second.publication.length; stop += 1) {
    const hosted = join(root, `hosted-${stop}`);
    await cp(firstDirectory, hosted, { recursive: true });
    let count = 0;
    await assert.rejects(
      second.publish({
        async put(object) {
          if (count++ === stop) {
            throw new Error('Injected transport interruption');
          }
          const path = join(hosted, object.path);
          await mkdir(dirname(path), { recursive: true });
          await copyFile(object.sourcePath, path);
        },
      }),
      /Injected transport interruption/u,
    );
    assert.deepEqual(await bytes(join(hosted, 'dists/staging/InRelease')), inRelease);
    command('gpgv', ['--keyring', publicKey, join(hosted, 'dists/staging/InRelease')]);
    for (const object of verified.objects) {
      assert.equal(hash(await bytes(join(hosted, object.path))), object.sha256);
    }
    scenarios += 1;
  }
  const hosted = join(root, 'complete');
  await cp(firstDirectory, hosted, { recursive: true });
  await second.publish({
    async put(object) {
      const path = join(hosted, object.path);
      if (object.expectedPreviousSha256 !== undefined) {
        assert.equal(hash(await bytes(path)), object.expectedPreviousSha256);
      }
      await mkdir(dirname(path), { recursive: true });
      await copyFile(object.sourcePath, path);
    },
  });
  const updated = await bytes(join(hosted, 'dists/staging/InRelease'));
  assert.notEqual(hash(updated), hash(inRelease));
  const updatedPrefix = desktopAptSnapshotPrefix(updated);
  assert.deepEqual(await bytes(join(hosted, updatedPrefix, 'InRelease')), updated);
  assert.deepEqual(await bytes(join(hosted, prefix, 'InRelease')), inRelease);
  await readDesktopAptSnapshot({
    ...common,
    inRelease: await bytes(join(hosted, prefix, 'InRelease')),
    signedInventory: await bytes(join(hosted, prefix, 'inventory.json')),
    signature: await bytes(join(hosted, prefix, 'inventory.json.gpg')),
  });
  await readDesktopAptSnapshot({
    ...common,
    inRelease: updated,
    signedInventory: await bytes(join(hosted, updatedPrefix, 'inventory.json')),
    signature: await bytes(join(hosted, updatedPrefix, 'inventory.json.gpg')),
  });
  await assert.rejects(
    readDesktopAptSnapshot({ ...common, ...previous, signedInventory: new TextEncoder().encode('{}') }),
  );
  await assert.rejects(readDesktopAptSnapshot({ ...common, ...previous, inRelease: updated }), /identity/u);
  await assert.rejects(readDesktopAptSnapshot({ ...common, ...previous, channel: 'production' }), /identity/u);
  const unsafeInventory = structuredClone(first.inventory);
  unsafeInventory.packages[0]!.poolPath = '../outside.deb';
  const unsafePath = join(root, 'unsafe.json');
  const unsafeSignaturePath = join(root, 'unsafe.json.gpg');
  await writeFile(
    unsafePath,
    JSON.stringify({ schemaVersion: 1, inReleaseSha256: hash(inRelease), inventory: unsafeInventory }),
  );
  command('gpg', [
    '--homedir',
    home,
    '--batch',
    '--yes',
    '--local-user',
    `${fingerprint}!`,
    '--output',
    unsafeSignaturePath,
    '--detach-sign',
    unsafePath,
  ]);
  await assert.rejects(
    readDesktopAptSnapshot({
      ...common,
      ...previous,
      signedInventory: await bytes(unsafePath),
      signature: await bytes(unsafeSignaturePath),
    }),
    /unsafe/u,
  );
  await writeFile(join(root, 'second', second.publication[0]!.path), 'tampered');
  let writes = 0;
  await assert.rejects(
    second.publish({
      async put() {
        writes += 1;
      },
    }),
    /changed/u,
  );
  assert.equal(writes, 0);
  /* oxlint-enable no-await-in-loop */
  console.log(`Passed ${scenarios + 6} signed APT publication and interruption scenarios.`);
};
try {
  await main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
