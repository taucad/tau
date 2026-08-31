import { shareArtifactLimits } from '#artifact.js';
import { formatShareUrl } from '#locator.js';
import type { ShareLocatorSecrets } from '#locator.js';
import { ShareError } from '#provider.js';
import type { ShareProvider, ShareProviderDescriptor } from '#provider.js';

/** Direct self-contained URL provider metadata. @public */
export const directShareProviderDescriptor = {
  id: 'direct',
  label: 'Direct link',
  capabilities: ['project.publish', 'project.resolve'],
  maxArtifactCharacters: shareArtifactLimits.maxDirectUrlCharacters,
} as const satisfies ShareProviderDescriptor;

/** Direct self-contained URL share provider. @public */
export const directShareProvider: ShareProvider = {
  descriptor: directShareProviderDescriptor,
  async publish(input, context) {
    const locator = { providerId: 'direct' } as const;
    const protection = input.protection ?? { kind: 'none' };
    let secrets: ShareLocatorSecrets;
    if (protection.kind === 'password') {
      const artifact = await context.artifactCodec.sealWithPassword(input.snapshot, protection.password, input.signal);
      secrets = {
        v: '2',
        jwe: artifact.compactJwe,
        ...(protection.includePassword ? { p: protection.password } : {}),
      };
    } else {
      const artifact = await context.artifactCodec.pack(input.snapshot, input.signal);
      secrets = { v: '2', zip: artifact.encodedArchive };
    }
    const url = formatShareUrl({ origin: context.origin, locator, secrets });
    if (url.length > shareArtifactLimits.maxDirectUrlCharacters) {
      throw new ShareError('SHARE_ARTIFACT_LIMIT', 'This project is too large for a direct URL.');
    }
    return { locator, secrets };
  },
  async resolve(input, context) {
    if (input.locator.providerId !== 'direct') {
      throw new ShareError('SHARE_LOCATOR_INVALID', 'The direct share link is malformed.');
    }
    const encodedArchive = input.secrets['zip'];
    if (encodedArchive) {
      return context.artifactCodec.openPlain(encodedArchive, input.signal);
    }
    const compactJwe = input.secrets['jwe'];
    if (!compactJwe) {
      throw new ShareError('SHARE_LOCATOR_INVALID', 'The direct share link is malformed.');
    }
    const password = input.secrets['p'];
    if (!password) {
      throw new ShareError('SHARE_PASSWORD_REQUIRED', 'Enter the password to open this shared project.');
    }
    return context.artifactCodec.openWithPassword({ compactJwe, password }, input.signal);
  },
};
