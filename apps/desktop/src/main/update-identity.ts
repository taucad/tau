/** Installed route and authenticated update admission; no network or install authority comes from the renderer. */
import { createPublicKey, verify } from 'node:crypto';

import { z } from 'zod';

import { desktopArtifactName, desktopReleaseIdentity } from '#shared/desktop-release.js';
import { isNewerVersion } from '#main/updater.js';

const commonInstallation = {
  schemaVersion: z.literal(1),
  tag: z.string(),
  channel: z.enum(['production', 'staging']),
  version: z.string(),
  sourceCommit: z.string().regex(/^[a-f\d]{40}$/u),
  arch: z.literal('x64'),
  trust: z.enum(['test', 'release']),
  cache: z.enum(['tau-updater', 'tau-staging-updater']),
};
const installationSchema = z.discriminatedUnion('route', [
  z.strictObject({ ...commonInstallation, route: z.literal('windows-nsis'), publisher: z.string().min(1).nullable() }),
  z.strictObject({ ...commonInstallation, route: z.literal('linux-apt') }),
  z.strictObject({
    ...commonInstallation,
    route: z.literal('linux-appimage'),
    keys: z.record(z.string().min(1), z.string().min(1)),
  }),
]);
export type DesktopInstallation = z.infer<typeof installationSchema>;

/** The shipped marker must agree with the actual running app and selected platform. */
export const parseDesktopInstallation = (
  input: unknown,
  expected: { platform: NodeJS.Platform; arch: string; channel: string; version: string },
): DesktopInstallation => {
  const installation = installationSchema.parse(input);
  const identity = desktopReleaseIdentity(installation.tag);
  if (
    installation.channel !== expected.channel ||
    installation.version !== expected.version ||
    installation.arch !== expected.arch ||
    identity.channel !== installation.channel ||
    identity.version !== installation.version ||
    installation.cache !== (installation.channel === 'staging' ? 'tau-staging-updater' : 'tau-updater') ||
    (installation.route === 'windows-nsis' ? expected.platform !== 'win32' : expected.platform !== 'linux')
  ) {
    throw new TypeError('Installed update route disagrees with the running app');
  }
  return installation;
};

const descriptorSchema = z.strictObject({
  schemaVersion: z.literal(1),
  keyId: z.string().min(1).max(128),
  tag: z.string(),
  channel: z.enum(['production', 'staging']),
  version: z.string(),
  sourceCommit: z.string().regex(/^[a-f\d]{40}$/u),
  arch: z.literal('x64'),
  route: z.enum(['windows-nsis', 'linux-appimage']),
  path: z.string(),
  size: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  sha512: z.string().regex(/^[A-Za-z\d+/]{85}[AQgw]==$/u),
  issuedAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
});
export type DesktopUpdateDescriptor = z.infer<typeof descriptorSchema>;
const envelopeSchema = z.strictObject({
  schemaVersion: z.literal(1),
  keyId: z.string().min(1).max(128),
  descriptor: z
    .string()
    .max(24_000)
    .regex(/^[A-Za-z\d+/]+={0,2}$/u),
  signature: z.string().regex(/^[A-Za-z\d+/]{85}[AQgw]==$/u),
});

/** Verify the exact signed bytes before parsing; the feed can select only an embedded trusted key. */
export const verifyDesktopDescriptor = (input: unknown, keys: Readonly<Record<string, string>>): unknown => {
  const envelope = envelopeSchema.parse(input);
  const pem = keys[envelope.keyId];
  if (!pem) {
    throw new Error('Update descriptor uses an untrusted signing key');
  }
  const bytes = Buffer.from(envelope.descriptor, 'base64');
  if (bytes.length > 16_384 || bytes.toString('base64') !== envelope.descriptor) {
    throw new Error('Update descriptor is oversized or noncanonical');
  }
  const key = createPublicKey(pem);
  if (key.asymmetricKeyType !== 'ed25519' || !verify(null, bytes, key, Buffer.from(envelope.signature, 'base64'))) {
    throw new Error('Update descriptor signature is invalid');
  }
  const descriptor: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  const parsed = descriptorSchema.parse(descriptor);
  if (parsed.keyId !== envelope.keyId) {
    throw new Error('Signed descriptor key identity disagrees with its envelope');
  }
  return parsed;
};

/** Admit only a fresh candidate for the installed route and exact immutable relative path. */
export const parseDesktopUpdateDescriptor = (
  input: unknown,
  installation: DesktopInstallation,
  now = Date.now(),
): DesktopUpdateDescriptor => {
  const descriptor = descriptorSchema.parse(input);
  const identity = desktopReleaseIdentity(descriptor.tag);
  const issued = Date.parse(descriptor.issuedAt);
  const descriptorExpires = Date.parse(descriptor.expiresAt);
  const artifact = desktopArtifactName({
    kind: descriptor.route === 'windows-nsis' ? 'windows-nsis' : 'linux-appimage',
    channel: descriptor.channel,
    version: descriptor.version,
    arch: descriptor.arch,
  });
  if (
    descriptor.route !== installation.route ||
    descriptor.channel !== installation.channel ||
    identity.channel !== descriptor.channel ||
    identity.version !== descriptor.version ||
    descriptor.path !== `releases/${encodeURIComponent(descriptor.tag)}/${artifact}` ||
    issued > now + 300_000 ||
    descriptorExpires <= now ||
    descriptorExpires <= issued ||
    descriptorExpires - issued > 7 * 24 * 60 * 60 * 1000
  ) {
    throw new Error('Update descriptor identity, path or validity period is invalid');
  }
  if (descriptor.version !== installation.version && !isNewerVersion(descriptor.version, installation.version)) {
    throw new Error('Update descriptor would downgrade the installed app');
  }
  return descriptor;
};

/** A request may stay on the single admitted immutable URL; redirects cannot widen that authority. */
export const allowedUpdateRequest = (request: string, expected: string): boolean => {
  try {
    const actual = new URL(request);
    const allowed = new URL(expected);
    return (
      actual.protocol === 'https:' &&
      actual.username === '' &&
      actual.password === '' &&
      actual.search === '' &&
      actual.hash === '' &&
      actual.href === allowed.href
    );
  } catch {
    return false;
  }
};

/** App-update.yml is JSON (a YAML subset), generated beside the immutable installed marker. */
export const validateWindowsUpdateConfig = (input: unknown, installation: DesktopInstallation): void => {
  const config = z
    .strictObject({ publisherName: z.array(z.string().min(1)).length(1), updaterCacheDirName: z.string() })
    .parse(input);
  if (
    installation.route !== 'windows-nsis' ||
    !installation.publisher ||
    config.publisherName[0] !== installation.publisher ||
    config.updaterCacheDirName !== installation.cache
  ) {
    throw new Error('Windows update configuration lacks the exact installed publisher and cache identity');
  }
};
