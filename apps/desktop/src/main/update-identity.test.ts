import { generateKeyPairSync, sign } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  allowedUpdateRequest,
  parseDesktopInstallation,
  parseDesktopUpdateDescriptor,
  validateWindowsUpdateConfig,
  verifyDesktopDescriptor,
} from '#main/update-identity.js';

const marker = {
  schemaVersion: 1,
  route: 'windows-nsis',
  tag: 'desktop@0.1.0',
  channel: 'production',
  version: '0.1.0',
  sourceCommit: 'a'.repeat(40),
  arch: 'x64',
  trust: 'release',
  cache: 'tau-updater',
  publisher: 'CN=Tau, O=Tau Limited, C=NZ',
};
const expected = { platform: 'win32', arch: 'x64', channel: 'production', version: '0.1.0' } as const;
const now = Date.parse('2026-10-21T00:00:00Z');
const descriptor = {
  schemaVersion: 1,
  keyId: 'authenticode',
  tag: 'desktop@0.2.0',
  channel: 'production',
  version: '0.2.0',
  sourceCommit: 'b'.repeat(40),
  arch: 'x64',
  route: 'windows-nsis',
  path: 'releases/desktop%400.2.0/Tau-win32-x64.exe',
  size: 10,
  sha512: Buffer.alloc(64).toString('base64'),
  issuedAt: '2026-10-21T00:00:00Z',
  expiresAt: '2026-10-22T00:00:00Z',
};
describe('installed update identity', () => {
  it('admits the shipped route and mandatory exact publisher/cache', () => {
    const installed = parseDesktopInstallation(marker, expected);
    expect(installed.route).toBe('windows-nsis');
    expect(() => {
      validateWindowsUpdateConfig({ publisherName: [marker.publisher], updaterCacheDirName: 'tau-updater' }, installed);
    }).not.toThrow();
    for (const value of [
      {},
      { publisherName: ['CN=Other'], updaterCacheDirName: 'tau-updater' },
      { publisherName: [marker.publisher], updaterCacheDirName: 'tau-staging-updater' },
    ]) {
      expect(() => {
        validateWindowsUpdateConfig(value, installed);
      }).toThrow();
    }
  });
  it.each([
    { schemaVersion: 2 },
    { version: '0.2.0' },
    { channel: 'staging' },
    { arch: 'arm64' },
    { sourceCommit: 'bad' },
    { route: 'linux-apt' },
    { cache: 'tau-staging-updater' },
    { extra: true },
  ])('refuses incompatible marker %j', (change) => {
    expect(() => parseDesktopInstallation({ ...marker, ...change }, expected)).toThrow();
  });
  it('pins candidate identity, immutable path and validity', () => {
    const installed = parseDesktopInstallation(marker, expected);
    expect(parseDesktopUpdateDescriptor(descriptor, installed, now).version).toBe('0.2.0');
    for (const change of [
      { channel: 'staging' },
      { version: '0.3.0' },
      { route: 'linux-appimage' },
      { arch: 'arm64' },
      { path: 'latest/Tau-win32-x64.exe' },
      { sha512: 'invalid' },
      { expiresAt: '2026-10-20T00:00:00Z' },
      { issuedAt: '2026-10-22T00:00:00Z' },
      { expiresAt: '2026-11-21T00:00:00Z' },
      { schemaVersion: 2 },
    ]) {
      expect(() => parseDesktopUpdateDescriptor({ ...descriptor, ...change }, installed, now)).toThrow();
    }
    expect(() =>
      parseDesktopUpdateDescriptor(
        { ...descriptor, version: '0.0.9', tag: 'desktop@0.0.9', path: 'releases/desktop%400.0.9/Tau-win32-x64.exe' },
        installed,
        now,
      ),
    ).toThrow(/downgrade/u);
  });
  it('authenticates exact descriptor bytes before parsing and refuses key substitution', () => {
    const { privateKey, publicKey } = generateKeyPairSync('ed25519');
    const payload = Buffer.from(
      JSON.stringify({
        ...descriptor,
        route: 'linux-appimage',
        keyId: 'first',
        path: 'releases/desktop%400.2.0/Tau-linux-x64.AppImage',
      }),
    );
    const envelope = {
      schemaVersion: 1,
      keyId: 'first',
      descriptor: payload.toString('base64'),
      signature: sign(null, payload, privateKey).toString('base64'),
    };
    const keys = { first: publicKey.export({ type: 'spki', format: 'pem' }).toString() };
    expect(verifyDesktopDescriptor(envelope, keys)).toMatchObject({ keyId: 'first' });
    expect(() => verifyDesktopDescriptor({ ...envelope, keyId: 'unknown' }, keys)).toThrow();
    expect(() =>
      verifyDesktopDescriptor({ ...envelope, descriptor: Buffer.from('{}').toString('base64') }, keys),
    ).toThrow(/signature/u);
    expect(() =>
      verifyDesktopDescriptor({ ...envelope, signature: Buffer.alloc(64).toString('base64') }, keys),
    ).toThrow();
  });
  it('never widens the admitted URL on redirects', () => {
    const url = 'https://downloads.tau.new/releases/test/Tau.exe';
    expect(allowedUpdateRequest(url, url)).toBe(true);
    for (const request of [
      url + '?token=x',
      url + '#x',
      url.replace('https:', 'http:'),
      url.replace('downloads.tau.new', 'evil.test'),
      'file:///tmp/update.exe',
      'https://downloads.tau.new/latest/Tau.exe',
    ]) {
      expect(allowedUpdateRequest(request, url)).toBe(false);
    }
  });
});
