/** Real ephemeral GPG subkey isolation and native Linux signed snapshot fixture; never emits qualification receipts. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { desktopArtifactKinds, desktopArtifactName, parseDesktopArtifactManifest } from '#shared/desktop-release.js';
/* oxlint-disable no-restricted-imports -- Test native repository preparation with ephemeral signing material. */
import { prepareQualificationAptSnapshot, verifyQualificationAptSigner } from './qualification-apt-snapshot.mjs';
import { prepareQualificationAptEnrollment } from './qualification-apt-enrollment.mjs';
import { readDesktopAptSnapshot } from './desktop-apt-publication.mjs';
/* oxlint-enable no-restricted-imports */
const main = async (): Promise<void> => {
  const root = await mkdtemp(join(tmpdir(), 'tau-qapt-'));
  const home = join(root, 'offline');
  const online = join(root, 'online');
  await mkdir(home, { mode: 0o700 });
  await mkdir(online, { mode: 0o700 });
  const gpg = (args: string[]): string =>
    execFileSync('gpg', ['--homedir', home, '--batch', '--pinentry-mode', 'loopback', '--passphrase', '', ...args], {
      encoding: 'utf8',
      timeout: 120_000,
    });
  try {
    gpg(['--quick-generate-key', 'Qualification Fixture <fixture@example.invalid>', 'ed25519', 'cert', '1d']);
    const fingerprint = gpg(['--with-colons', '--list-keys'])
      .split('\n')
      .find((line) => line.startsWith('fpr:'))!
      .split(':')[9]!;
    gpg(['--quick-add-key', fingerprint, 'ed25519', 'sign', '1d']);
    const fingerprints = gpg(['--with-colons', '--list-keys'])
      .split('\n')
      .filter((line) => line.startsWith('fpr:'))
      .map((line) => line.split(':')[9]!);
    const signing = fingerprints[1]!;
    assert.throws(() => {
      verifyQualificationAptSigner(home, fingerprint, signing);
    }, /offline primary/u);
    const secret = execFileSync('gpg', [
      '--homedir',
      home,
      '--batch',
      '--pinentry-mode',
      'loopback',
      '--passphrase',
      '',
      '--export-secret-subkeys',
      signing,
    ]);
    execFileSync('gpg', ['--homedir', online, '--batch', '--import'], {
      input: secret,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    verifyQualificationAptSigner(online, fingerprint, signing);
    assert.throws(() => {
      verifyQualificationAptSigner(online, fingerprint, fingerprint);
    }, /distinct/u);
    assert.throws(() => {
      verifyQualificationAptSigner(online, fingerprint, 'A'.repeat(40));
    }, /Unapproved usable secret subkey/u);
    execFileSync('gpg', [
      '--homedir',
      online,
      '--batch',
      '--pinentry-mode',
      'loopback',
      '--passphrase',
      '',
      '--quick-generate-key',
      'Unrelated Fixture <other@example.invalid>',
      'ed25519',
      'cert',
      '1d',
    ]);
    assert.throws(() => {
      verifyQualificationAptSigner(online, fingerprint, signing);
    }, /offline primary/u);
    const unrelated = execFileSync(
      'gpg',
      ['--homedir', online, '--with-colons', '--list-keys', 'other@example.invalid'],
      { encoding: 'utf8' },
    )
      .split('\n')
      .find((line) => line.startsWith('fpr:'))!
      .split(':')[9]!;
    execFileSync('gpg', ['--homedir', online, '--batch', '--yes', '--delete-secret-and-public-key', unrelated]);
    verifyQualificationAptSigner(online, fingerprint, signing);
    if (process.platform !== 'linux') {
      console.log(
        'PASS real GPG offline-primary refusal and certified online-subkey admission; native Debian bundle test requires Linux',
      );
      return;
    }
    const version = '1.0.1';
    const artifacts = [];
    /* oxlint-disable no-await-in-loop -- Build the two bounded native fixture packages serially. */
    for (const kind of ['linux-deb-runtime', 'linux-deb-selector'] as const) {
      const packageName = kind === 'linux-deb-runtime' ? `tau-staging-runtime-${version}` : 'tau-staging';
      const stage = join(root, packageName);
      await mkdir(join(stage, 'DEBIAN'), { recursive: true });
      await writeFile(
        join(stage, 'DEBIAN/control'),
        `Package: ${packageName}\nVersion: ${version}\nArchitecture: amd64\nMaintainer: Fixture <fixture@example.invalid>\nDescription: Inert snapshot fixture\n${kind === 'linux-deb-selector' ? `Depends: tau-staging-runtime-${version} (= ${version})\n` : ''}`,
      );
      const name = desktopArtifactName({ kind, channel: 'staging', version, arch: 'x64' });
      execFileSync('dpkg-deb', ['--build', stage, join(root, name)]);
      const data = await readFile(join(root, name));
      artifacts.push({
        kind,
        target: 'linux-x64',
        format: 'deb',
        roles: desktopArtifactKinds[kind].roles,
        name,
        size: data.length,
        sha256: createHash('sha256').update(data).digest('hex'),
        sha512: createHash('sha512').update(data).digest('base64'),
      });
    }
    /* oxlint-enable no-await-in-loop */
    const outputDirectory = join(root, 'bundle');
    const manifest = {
      schemaVersion: 1,
      tag: 'desktop-staging@0.1.0-staging.1',
      channel: 'staging',
      version,
      sourceCommit: 'a'.repeat(40),
      artifacts,
    };
    await prepareQualificationAptSnapshot({
      manifest,
      artifactDirectory: root,
      outputDirectory,
      gnupgHome: online,
      primaryFingerprint: fingerprint,
      signingFingerprint: signing,
      issuedAt: new Date().toISOString(),
    });
    const snapshot = await readDesktopAptSnapshot({
      channel: 'staging',
      gnupgHome: online,
      signingFingerprint: signing,
      inRelease: Uint8Array.from(await readFile(join(outputDirectory, 'qualification-apt-InRelease'))),
      signedInventory: Uint8Array.from(await readFile(join(outputDirectory, 'qualification-apt-inventory.json'))),
      signature: Uint8Array.from(await readFile(join(outputDirectory, 'qualification-apt-inventory.json.gpg'))),
    });
    assert.equal(snapshot.inventory.packages.length, 2);
    assert.equal(snapshot.inventory.signingFingerprint, signing);
    const archive = await readFile(join(outputDirectory, 'qualification-apt-snapshot.tar'));
    const metadata = JSON.parse(
      await readFile(join(outputDirectory, 'qualification-apt-snapshot.json'), 'utf8'),
    ) as Record<string, unknown>;
    assert.equal(metadata['archiveSha256'], createHash('sha256').update(archive).digest('hex'));
    assert.equal(metadata['primaryFingerprint'], fingerprint);
    assert.equal(metadata['signingFingerprint'], signing);
    assert.equal(
      metadata['manifestSha256'],
      createHash('sha256')
        .update(JSON.stringify(parseDesktopArtifactManifest(manifest)))
        .digest('hex'),
    );
    const candidate = {
      manifest: parseDesktopArtifactManifest(manifest),
      artifactDirectory: root,
      route: 'linux-apt',
    } as const;
    const enrollment = await prepareQualificationAptEnrollment({
      candidates: [candidate, candidate, candidate],
      bundleDirectories: [outputDirectory, outputDirectory, outputDirectory],
      primaryFingerprint: fingerprint,
      signingFingerprint: signing,
      publicKeyPath: join(outputDirectory, 'qualification-apt-public.asc'),
      runDirectory: join(root, 'enrollment'),
      origin: 'https://127.0.0.1:43111/',
    });
    assert.equal(enrollment.repositories.length, 3);
    await assert.rejects(enrollment.enroll(), /Ordinary-user disposable/u);
    const archivePath = join(outputDirectory, 'qualification-apt-snapshot.tar');
    execFileSync('python3', [
      '-c',
      "import tarfile,sys; t=tarfile.open(sys.argv[1],'a'); m=tarfile.TarInfo('../escape'); m.type=tarfile.SYMTYPE; m.linkname='/etc/passwd'; t.addfile(m); t.close()",
      archivePath,
    ]);
    const unsafeArchive = await readFile(archivePath);
    await writeFile(
      join(outputDirectory, 'qualification-apt-snapshot.json'),
      JSON.stringify({
        ...metadata,
        archiveSha256: createHash('sha256').update(unsafeArchive).digest('hex'),
        archiveSize: unsafeArchive.length,
      }),
    );
    await assert.rejects(
      prepareQualificationAptEnrollment({
        candidates: [candidate, candidate, candidate],
        bundleDirectories: [outputDirectory, outputDirectory, outputDirectory],
        primaryFingerprint: fingerprint,
        signingFingerprint: signing,
        publicKeyPath: join(outputDirectory, 'qualification-apt-public.asc'),
        runDirectory: join(root, 'unsafe-enrollment'),
        origin: 'https://127.0.0.1:43111/',
      }),
      /Unsafe archive entry/u,
    );
    await writeFile(join(outputDirectory, 'qualification-apt-snapshot.tar'), 'tampered archive');
    await assert.rejects(
      prepareQualificationAptEnrollment({
        candidates: [candidate, candidate, candidate],
        bundleDirectories: [outputDirectory, outputDirectory, outputDirectory],
        primaryFingerprint: fingerprint,
        signingFingerprint: signing,
        publicKeyPath: join(outputDirectory, 'qualification-apt-public.asc'),
        runDirectory: join(root, 'tampered-enrollment'),
        origin: 'https://127.0.0.1:43111/',
      }),
      /archive binding/u,
    );
    console.log(
      'PASS real GPG subkey-only signing, signed inventory authentication and exact qualification archive binding',
    );
  } finally {
    execFileSync('gpgconf', ['--homedir', home, '--kill', 'all']);
    execFileSync('gpgconf', ['--homedir', online, '--kill', 'all']);
    await rm(root, { recursive: true, force: true });
  }
};
try {
  await main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
