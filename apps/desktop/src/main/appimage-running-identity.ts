/** Bind a healthy acknowledgement to the immutable signed release actually running from the mounted image. */
import { lstatSync } from 'node:fs';

import { z } from 'zod';

import { desktopArtifactName } from '#shared/desktop-release.js';
import { appImageDigest } from '#main/appimage-transaction.js';
import { parseDesktopInstallation, verifyDesktopDescriptor } from '#main/update-identity.js';
import type { DesktopInstallation } from '#main/update-identity.js';

export type AppImageInstallationIdentity = Extract<DesktopInstallation, { route: 'linux-appimage' }>;

/** Historical expiration is irrelevant to immutable installed bytes; it never admits an update offer. */
export const authenticateRunningAppImage = (options: {
  current: string;
  installation: AppImageInstallationIdentity;
  document: unknown;
  now?: number;
}): string => {
  const { installation, current } = options;
  parseDesktopInstallation(installation, {
    platform: 'linux',
    arch: 'x64',
    channel: installation.channel,
    version: installation.version,
  });
  // Signature verification first validates the entire signed schema and its key binding.
  const descriptor = z
    .object({
      tag: z.string(),
      version: z.string(),
      sourceCommit: z.string(),
      channel: z.string(),
      route: z.string(),
      arch: z.string(),
      path: z.string(),
      sha512: z.string(),
      size: z.number(),
      issuedAt: z.string(),
      expiresAt: z.string(),
    })
    .parse(verifyDesktopDescriptor(options.document, installation.keys));
  const issued = Date.parse(descriptor.issuedAt);
  const descriptorExpires = Date.parse(descriptor.expiresAt);
  const artifact = desktopArtifactName({ kind: 'linux-appimage', ...installation });
  if (
    descriptor.tag !== installation.tag ||
    descriptor.version !== installation.version ||
    descriptor.sourceCommit !== installation.sourceCommit ||
    descriptor.channel !== installation.channel ||
    descriptor.route !== installation.route ||
    descriptor.arch !== installation.arch ||
    descriptor.path !== `releases/${encodeURIComponent(installation.tag)}/${artifact}` ||
    issued > (options.now ?? Date.now()) + 300_000 ||
    descriptorExpires <= issued ||
    descriptorExpires - issued > 7 * 24 * 60 * 60 * 1000
  ) {
    throw new Error('AppImage baseline descriptor does not identify the running installed release');
  }
  const info = lstatSync(current);
  if (!info.isFile() || info.size !== descriptor.size || appImageDigest(current) !== descriptor.sha512) {
    throw new Error('Outer AppImage differs from the authenticated running release; restart from a verified image');
  }
  return descriptor.sha512;
};
