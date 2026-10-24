import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { authenticateRunningAppImage } from '#main/appimage-running-identity.js';
import type { AppImageInstallationIdentity } from '#main/appimage-running-identity.js';

const { privateKey, publicKey } = generateKeyPairSync('ed25519');
const bytesA = 'known running image A';
const digest = createHash('sha512').update(bytesA).digest('base64');
const installation: AppImageInstallationIdentity = {
  schemaVersion: 1,
  route: 'linux-appimage',
  tag: 'desktop@0.1.0',
  channel: 'production',
  version: '0.1.0',
  sourceCommit: 'a'.repeat(40),
  arch: 'x64',
  trust: 'release',
  cache: 'tau-updater',
  keys: { fixture: publicKey.export({ type: 'spki', format: 'pem' }).toString() },
};
const descriptor = {
  schemaVersion: 1,
  keyId: 'fixture',
  tag: installation.tag,
  version: installation.version,
  sourceCommit: installation.sourceCommit,
  channel: installation.channel,
  route: installation.route,
  arch: installation.arch,
  path: 'releases/desktop%400.1.0/Tau-linux-x64.AppImage',
  size: Buffer.byteLength(bytesA),
  sha512: digest,
  issuedAt: '2026-01-01T00:00:00Z',
  expiresAt: '2026-01-02T00:00:00Z',
};
const envelope = (value: unknown) => {
  const bytes = Buffer.from(JSON.stringify(value));
  return {
    schemaVersion: 1,
    keyId: 'fixture',
    descriptor: bytes.toString('base64'),
    signature: sign(null, bytes, privateKey).toString('base64'),
  };
};
const withImage = (test: (path: string) => void): void => {
  const directory = mkdtempSync(join(tmpdir(), 'tau-running-image-'));
  try {
    const path = join(directory, 'Tau.AppImage');
    writeFileSync(path, bytesA);
    test(path);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
};
const now = Date.parse('2026-10-21T00:00:00Z');

describe('authenticated running AppImage baseline', () => {
  it('accepts historical signed identity for exact installed bytes after offer expiration', () => {
    withImage((current) => {
      expect(authenticateRunningAppImage({ current, installation, document: envelope(descriptor), now })).toBe(digest);
    });
  });
  it('rejects outer B replaced before A acknowledges startup and preserves the previous health record', () => {
    withImage((current) => {
      const health = `${current}.update-health.json`;
      writeFileSync(health, 'previous healthy A');
      writeFileSync(`${current}.next`, 'unexecuted image B!!!');
      renameSync(`${current}.next`, current);
      expect(() => authenticateRunningAppImage({ current, installation, document: envelope(descriptor), now })).toThrow(
        /Outer AppImage/u,
      );
      expect(readFileSync(health, 'utf8')).toBe('previous healthy A');
    });
  });
  it.each([
    { tag: 'desktop@0.2.0' },
    { version: '0.2.0' },
    { sourceCommit: 'b'.repeat(40) },
    { channel: 'staging' },
    { route: 'windows-nsis' },
    { arch: 'arm64' },
    { path: 'releases/other/Tau-linux-x64.AppImage' },
    { size: descriptor.size + 1 },
    { expiresAt: descriptor.issuedAt },
    { expiresAt: '2026-01-09T00:00:00Z' },
    { issuedAt: '2027-01-01T00:00:00Z', expiresAt: '2027-01-02T00:00:00Z' },
    { schemaVersion: 2 },
  ])('rejects a signed but inconsistent baseline: %j', (mutation) => {
    withImage((current) => {
      expect(() =>
        authenticateRunningAppImage({ current, installation, document: envelope({ ...descriptor, ...mutation }), now }),
      ).toThrow();
    });
  });
  it('rejects an unknown key and corrupt signature even when the outer bytes match', () => {
    withImage((current) => {
      expect(() =>
        authenticateRunningAppImage({
          current,
          installation,
          document: { ...envelope(descriptor), keyId: 'unknown' },
          now,
        }),
      ).toThrow();
      expect(() =>
        authenticateRunningAppImage({
          current,
          installation,
          document: { ...envelope(descriptor), signature: Buffer.alloc(64).toString('base64') },
          now,
        }),
      ).toThrow();
    });
  });
});
