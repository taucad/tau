/** Ephemeral signed first-download fixtures; run with Node after bundling this script. No production keys. */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'esbuild';

const main = async (): Promise<void> => {
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'tau-first-download-')));
  try {
    const script = join(directory, 'verify.mjs');
    await build({
      entryPoints: ['apps/desktop/scripts/verify-appimage-download.mts'],
      bundle: true,
      platform: 'node',
      format: 'esm',
      outfile: script,
    });
    const { publicKey, privateKey } = generateKeyPairSync('ed25519');
    const fingerprint = createHash('sha256')
      .update(publicKey.export({ type: 'spki', format: 'der' }))
      .digest('hex');
    const pem = join(directory, 'key.pem');
    const file = join(directory, 'Tau-linux-x64.AppImage');
    const metadata = join(directory, 'descriptor.json');
    const bytes = Buffer.from('Ephemeral fixture, not an executable AppImage');
    await writeFile(pem, publicKey.export({ type: 'spki', format: 'pem' }));
    await writeFile(file, bytes);
    const sourceCommit = 'a'.repeat(40);
    const descriptor = {
      schemaVersion: 1,
      keyId: 'fixture',
      tag: 'desktop@0.2.0',
      channel: 'production',
      version: '0.2.0',
      sourceCommit,
      arch: 'x64',
      route: 'linux-appimage',
      path: 'releases/desktop%400.2.0/Tau-linux-x64.AppImage',
      size: bytes.length,
      sha512: createHash('sha512').update(bytes).digest('base64'),
      issuedAt: new Date(Date.now() - 60_000).toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    };
    const envelope = (value: unknown) => {
      const payload = Buffer.from(JSON.stringify(value));
      return {
        schemaVersion: 1,
        keyId: 'fixture',
        descriptor: payload.toString('base64'),
        signature: sign(null, payload, privateKey).toString('base64'),
      };
    };
    const run = (keyFingerprint = fingerprint) =>
      spawnSync(
        process.execPath,
        [
          script,
          '--public-key',
          pem,
          '--key-sha256',
          keyFingerprint,
          '--descriptor',
          metadata,
          '--file',
          file,
          '--tag',
          descriptor.tag,
          '--source-commit',
          sourceCommit,
        ],
        { encoding: 'utf8' },
      );
    await writeFile(metadata, JSON.stringify(envelope(descriptor)));
    assert.equal(run().status, 0, run().stderr);
    assert.equal(run('0'.repeat(64)).status, 1);
    for (const change of [
      { sourceCommit: 'b'.repeat(40) },
      { tag: 'desktop@0.3.0', version: '0.3.0' },
      { channel: 'staging' },
      { path: '../Tau.AppImage' },
      { size: bytes.length + 1 },
      { sha512: 'A'.repeat(86) + '==' },
      { expiresAt: new Date(Date.now() - 1).toISOString() },
    ]) {
      // oxlint-disable-next-line no-await-in-loop -- Each subprocess consumes the same fixture path before the next mutation.
      await writeFile(metadata, JSON.stringify(envelope({ ...descriptor, ...change })));
      assert.equal(run().status, 1, JSON.stringify(change));
    }
    await writeFile(
      metadata,
      JSON.stringify(
        envelope({
          ...descriptor,
          issuedAt: new Date(Date.now() - 8 * 86_400_000).toISOString(),
          expiresAt: new Date(Date.now() - 86_400_000).toISOString(),
        }),
      ),
    );
    assert.equal(run().status, 1, 'Expired immutable original cannot authorize a first installation');
    await writeFile(
      metadata,
      JSON.stringify(
        envelope({
          ...descriptor,
          issuedAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
        }),
      ),
    );
    assert.equal(run().status, 0, 'Renewed signed descriptor for the identical release authorizes the same bytes');
    const invalid = envelope(descriptor);
    invalid.descriptor = Buffer.from(JSON.stringify({ ...descriptor, size: 1 })).toString('base64');
    await writeFile(metadata, JSON.stringify(invalid));
    assert.equal(run().status, 1);
    await writeFile(metadata, JSON.stringify(envelope(descriptor)));
    await writeFile(file, Buffer.alloc(bytes.length));
    assert.equal(run().status, 1);
    console.log('Passed 13 first-download verification scenarios with an ephemeral Ed25519 key.');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
};
try {
  await main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
