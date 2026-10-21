/**
 * Verify a first AppImage download with an independently trusted Ed25519 key.
 * Usage: node verify-appimage-download.mjs --public-key KEY.pem --key-sha256 HEX
 *   --descriptor ENVELOPE.json --file Tau-linux-x64.AppImage --tag TAG --source-commit SHA
 * No environment inputs; exits 0 only for exact authenticated, fresh bytes, otherwise 1.
 */
import { createHash, createPublicKey } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, readFile, realpath } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { z } from 'zod';

import { parseDesktopUpdateDescriptor, verifyDesktopDescriptor } from '#main/update-identity.js';
import { desktopReleaseIdentity } from '#shared/desktop-release.js';

const main = async (): Promise<void> => {
  const { values } = parseArgs({
    options: {
      'public-key': { type: 'string' },
      'key-sha256': { type: 'string' },
      descriptor: { type: 'string' },
      file: { type: 'string' },
      tag: { type: 'string' },
      'source-commit': { type: 'string' },
    },
    strict: true,
    allowPositionals: false,
  });
  const arguments_ = z
    .strictObject({
      'public-key': z.string().min(1),
      'key-sha256': z.string().regex(/^[a-f\d]{64}$/u),
      descriptor: z.string().min(1),
      file: z.string().min(1),
      tag: z.string().min(1),
      'source-commit': z.string().regex(/^[a-f\d]{40}$/u),
    })
    .parse(values);
  const key = createPublicKey(await readFile(arguments_['public-key']));
  const fingerprint = createHash('sha256')
    .update(key.export({ type: 'spki', format: 'der' }))
    .digest('hex');
  if (key.asymmetricKeyType !== 'ed25519' || fingerprint !== arguments_['key-sha256']) {
    throw new Error('Public key does not match the independently trusted Ed25519 fingerprint');
  }
  const metadata = await lstat(arguments_.descriptor);
  if (!metadata.isFile() || metadata.size > 32_768) {
    throw new Error('Descriptor must be a bounded regular file');
  }
  const envelope: unknown = JSON.parse(await readFile(arguments_.descriptor, 'utf8'));
  const { keyId } = z.object({ keyId: z.string().min(1).max(128) }).parse(envelope);
  const pem = key.export({ type: 'spki', format: 'pem' }).toString();
  const identity = desktopReleaseIdentity(arguments_.tag);
  const descriptor = parseDesktopUpdateDescriptor(verifyDesktopDescriptor(envelope, { [keyId]: pem }), {
    schemaVersion: 1,
    route: 'linux-appimage',
    tag: arguments_.tag,
    ...identity,
    sourceCommit: arguments_['source-commit'],
    arch: 'x64',
    trust: 'release',
    cache: identity.channel === 'production' ? 'tau-updater' : 'tau-staging-updater',
    keys: { [keyId]: pem },
  });
  if (descriptor.tag !== arguments_.tag || descriptor.sourceCommit !== arguments_['source-commit']) {
    throw new Error('Signed descriptor does not match the requested release and source');
  }
  const path = resolve(arguments_.file);
  const file = await lstat(path);
  if (!file.isFile() || (await realpath(path)) !== path || file.size !== descriptor.size) {
    throw new Error('AppImage must be a regular file with the exact authenticated size');
  }
  const hash = createHash('sha512');
  let size = 0;
  for await (const chunk of createReadStream(path)) {
    if (!(chunk instanceof Uint8Array)) {
      throw new Error('AppImage stream did not return binary bytes');
    }
    size += chunk.byteLength;
    hash.update(chunk);
  }
  if (size !== descriptor.size || hash.digest('base64') !== descriptor.sha512) {
    throw new Error('AppImage bytes do not match the signed descriptor');
  }
  console.log(`Verified ${descriptor.tag} (${descriptor.sourceCommit}): ${descriptor.path}`);
};

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
