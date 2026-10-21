#!/usr/bin/env node
/**
 * Purpose: Exercise real APT signature and HTTPS acquisition through the qualification mirror.
 * Environment: node:24-bookworm-slim, gpg, openssl, dpkg-deb; TAU_APT_DISPOSABLE_CONTAINER=1.
 * Usage: bundle this diagnostic fixture with esbuild, then execute inside the disposable container.
 * Exit: nonzero on canonical route, cumulative index, TLS, or repository signature regression.
 */
/* oxlint-disable no-await-in-loop -- Fixture packages and repository generations are deliberately serial. */
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
// oxlint-disable-next-line no-restricted-imports -- Exercise the real script-owned signing boundary.
import { buildLinuxAptRepository } from './linux-apt-repository.mjs';
// oxlint-disable-next-line no-restricted-imports -- Share the repository producer input contract.
import type { LinuxAptRepositoryPackage } from './linux-apt-repository.mjs';
// oxlint-disable-next-line no-restricted-imports -- Keep the server event loop live while native APT runs.
import { startQualificationMirror } from './qualification-mirror.mjs';
// oxlint-disable-next-line no-restricted-imports -- Exact script-owned transport inventory.
import type { QualificationMirrorObject } from './qualification-mirror.mjs';

const execute = promisify(execFile);
const command = async (name: string, args: string[]): Promise<string> => {
  const result = await execute(name, args, { encoding: 'utf8', timeout: 60_000, maxBuffer: 4 * 1024 * 1024 });
  return result.stdout;
};
assert.equal(process.platform, 'linux');
assert.equal(process.env['TAU_APT_DISPOSABLE_CONTAINER'], '1');
const root = await mkdtemp('/tmp/tau-apt-mirror-');
await chmod(root, 0o755);
try {
  const home = join(root, 'keys');
  await mkdir(home, { mode: 0o700 });
  await command('gpg', [
    '--homedir',
    home,
    '--batch',
    '--pinentry-mode',
    'loopback',
    '--passphrase',
    '',
    '--quick-generate-key',
    'Tau Mirror Fixture <mirror@example.invalid>',
    'rsa2048',
    'sign',
    '1d',
  ]);
  const listing = await command('gpg', ['--homedir', home, '--with-colons', '--list-keys']);
  const fingerprint = listing
    .split('\n')
    .find((line) => line.startsWith('fpr:'))!
    .split(':')[9]!;
  const keyring = join(root, 'public.gpg');
  await command('gpg', ['--homedir', home, '--output', keyring, '--export', fingerprint]);
  const certificate = join(root, 'certificate.pem');
  const key = join(root, 'key.pem');
  const createCertificate = async (output: string, privateKey: string): Promise<void> => {
    await command('openssl', [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-keyout',
      privateKey,
      '-out',
      output,
      '-days',
      '1',
      '-subj',
      '/CN=127.0.0.1',
      '-addext',
      'subjectAltName=IP:127.0.0.1',
    ]);
  };
  await createCertificate(certificate, key);
  const packages = async (version: string): Promise<LinuxAptRepositoryPackage[]> => {
    const result: LinuxAptRepositoryPackage[] = [];
    for (const kind of ['linux-deb-runtime', 'linux-deb-selector'] as const) {
      const name = kind === 'linux-deb-runtime' ? `tau-runtime-${version}` : 'tau';
      const stage = join(root, `${name}-${version}`);
      await mkdir(join(stage, 'DEBIAN'), { recursive: true });
      await writeFile(
        join(stage, 'DEBIAN/control'),
        `Package: ${name}\nVersion: ${version}\nArchitecture: amd64\nMaintainer: Test <test@example.invalid>\nDescription: Inert mirror fixture\n${kind === 'linux-deb-selector' ? `Depends: tau-runtime-${version} (= ${version})\n` : ''}`,
      );
      const path = join(root, `${name}-${version}.deb`);
      await command('dpkg-deb', ['--build', stage, path]);
      const bytes = await readFile(path);
      result.push({
        path,
        kind,
        tag: `desktop@${version}`,
        sourceCommit: 'a'.repeat(40),
        sha256: createHash('sha256').update(bytes).digest('hex'),
        size: bytes.length,
      });
    }
    return result;
  };
  const common = {
    channel: 'production',
    issuedAt: new Date(Date.now() - 60_000).toISOString(),
    gnupgHome: home,
    signingFingerprint: fingerprint,
  } as const;
  const directoryB = join(root, 'B');
  const snapshotB = await buildLinuxAptRepository({
    ...common,
    outputDirectory: directoryB,
    packages: await packages('0.1.0'),
  });
  const directoryC = join(root, 'C');
  const snapshotC = await buildLinuxAptRepository({
    ...common,
    issuedAt: new Date(Date.parse(common.issuedAt) + 10_000).toISOString(),
    outputDirectory: directoryC,
    packages: await packages('0.2.0'),
    previous: { directory: directoryB, inventory: snapshotB.inventory },
  });
  const object = async (path: string): Promise<QualificationMirrorObject> => {
    const bytes = await readFile(path);
    return {
      path,
      size: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      contentType: 'application/octet-stream',
    };
  };
  const inventory = async (directory: string, publication: typeof snapshotB.publication) => {
    const entries = new Map<string, QualificationMirrorObject>();
    for (const entry of publication) {
      entries.set(`/${entry.path}`, await object(join(directory, entry.path)));
    }
    return entries;
  };
  const objectsB = await inventory(directoryB, snapshotB.publication);
  const objectsC = await inventory(directoryC, snapshotC.publication);
  const mirror = await startQualificationMirror({
    key: await readFile(key, 'utf8'),
    certificate: await readFile(certificate, 'utf8'),
    objects: objectsB,
  });
  const apt = async (ca = certificate): Promise<string> => {
    const state = await mkdtemp(join(root, 'apt-'));
    await chmod(state, 0o755);
    await mkdir(join(state, 'lists/partial'), { recursive: true });
    await mkdir(join(state, 'cache/archives/partial'), { recursive: true });
    const source = join(state, 'sources.list');
    await writeFile(source, `deb [arch=amd64 signed-by=${keyring}] ${mirror.origin} stable main\n`);
    const options = [
      '-o',
      'APT::Architecture=amd64',
      '-o',
      `Dir::Etc::sourcelist=${source}`,
      '-o',
      'Dir::Etc::sourceparts=-',
      '-o',
      `Dir::State::lists=${state}/lists`,
      '-o',
      `Dir::Cache=${state}/cache`,
      '-o',
      `Acquire::https::CaInfo=${ca}`,
      '-o',
      'Acquire::https::Timeout=5',
      '-o',
      'Acquire::Retries=0',
      '-o',
      'Acquire::Languages=none',
      '-o',
      'Acquire::IndexTargets::deb::DEP-11::DefaultEnabled=false',
    ];
    await command('apt-get', [...options, 'update', '--error-on=any']);
    return command('apt-cache', [...options, 'policy', 'tau']);
  };
  try {
    assert.match(await apt(), /Candidate: 0\.1\.0/u);
    const additions = new Map([...objectsC].filter(([path]) => !objectsB.has(path)));
    await mirror.addImmutable(additions);
    const mutableC = new Map(
      snapshotC.publication
        .filter((entry) => !entry.immutable)
        .map((entry) => [`/${entry.path}`, objectsC.get(`/${entry.path}`)!]),
    );
    await mirror.switchLatest(mutableC);
    assert.match(await apt(), /Candidate: 0\.2\.0/u);
    // A client retaining B's signed Release still acquires B's preserved content-addressed index.
    await mirror.switchLatest(new Map([['/dists/stable/InRelease', objectsB.get('/dists/stable/InRelease')!]]));
    assert.match(await apt(), /Candidate: 0\.1\.0/u);
    await mirror.switchLatest(mutableC);
    assert.ok(mirror.requests.some((request) => request.path === '/dists/stable/InRelease' && request.status === 200));
    assert.ok(
      mirror.requests.some(
        (request) =>
          request.path.startsWith('/dists/stable/main/binary-amd64/by-hash/SHA256/') && request.status === 200,
      ),
    );
    assert.ok(mirror.requests.every((request) => !request.path.startsWith('/apt/')));
    const wrongCa = join(root, 'wrong-ca.pem');
    await createCertificate(wrongCa, join(root, 'wrong-key.pem'));
    await assert.rejects(
      apt(wrongCa),
      /Certificate verification failed|certificate is NOT trusted|Could not handshake/u,
    );
    // Admit transport-correct bytes with an invalid repository signature: APT remains the trust authority.
    const damaged = join(root, 'damaged-InRelease');
    const signed = await readFile(join(directoryC, 'dists/stable/InRelease'), 'utf8');
    assert.ok(signed.includes('Origin: Tau'));
    await writeFile(damaged, signed.replace('Origin: Tau', 'Origin: Evil'));
    await mirror.switchLatest(new Map([['/dists/stable/InRelease', await object(damaged)]]));
    await assert.rejects(apt(), /BADSIG|invalid signature|signatures were invalid/u);
    await mirror.switchLatest(mutableC);
    assert.match(await apt(), /Candidate: 0\.2\.0/u);
    process.stdout.write(
      'Diagnostic APT HTTPS fixture passed: B, C, retained B by-hash, wrong CA, tampered signature, recovery. No qualification receipt.\n',
    );
  } finally {
    await mirror.close();
  }
} finally {
  await rm(root, { recursive: true, force: true });
}
