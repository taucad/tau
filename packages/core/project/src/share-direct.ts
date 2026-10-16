import { decodeShareArchive, sealShareArchiveWithPassword, shareArtifactLimits } from '#share-artifact.js';
import type { ShareArtifactCodec, ShareOpenedArtifact } from '#share-artifact.js';
import { ShareError } from '#share-error.js';
import { formatShareUrl } from '#share-locator.js';
import type { ShareLocator, ShareLocatorSecrets } from '#share-locator.js';
import type { ShareProjectSnapshot } from '#share-snapshot.js';

/** Portable artifact protection selected by the person sharing. @public */
export type DirectShareProtection =
  | { readonly kind: 'none' }
  | { readonly kind: 'password'; readonly password: string; readonly includePassword: boolean };

/** The locator every direct link carries: the project travels in the fragment, not the route. @public */
export const directShareLocator = { providerId: 'direct' } as const satisfies ShareLocator;

/** A direct link's locator and the fragment secrets that carry the project. @public */
export type DirectSharePublication = {
  readonly locator: typeof directShareLocator;
  readonly secrets: ShareLocatorSecrets;
};

/**
 * Format a direct link and refuse one longer than {@link shareArtifactLimits.maxDirectUrlCharacters}.
 *
 * @param input - The Tau web origin and the fragment secrets.
 * @returns The link.
 * @throws {ShareError} `SHARE_ARTIFACT_LIMIT` when the project is too large for a URL.
 * @public
 */
export const formatDirectShareUrl = (input: {
  readonly origin: string;
  readonly secrets: ShareLocatorSecrets;
}): string => {
  const url = formatShareUrl({ origin: input.origin, locator: directShareLocator, secrets: input.secrets });
  if (url.length > shareArtifactLimits.maxDirectUrlCharacters) {
    throw new ShareError('SHARE_ARTIFACT_LIMIT', 'This project is too large for a direct URL.');
  }
  return url;
};

const sealedSecrets = (compactJwe: string, protection: DirectShareProtection & { kind: 'password' }) => ({
  v: '2',
  jwe: compactJwe,
  ...(protection.includePassword ? { p: protection.password } : {}),
});

/**
 * Publish a project snapshot as a direct link: packed, or sealed under a password, into the fragment.
 *
 * @param input - The snapshot, its protection, and a cancel signal.
 * @param context - The Tau web origin the link is checked against, and the artifact codec.
 * @returns The locator and secrets of the link.
 * @throws {ShareError} When the snapshot breaks a portable-share limit or the link is too long.
 * @public
 */
export const publishDirectShare = async (
  input: {
    readonly snapshot: ShareProjectSnapshot;
    readonly protection?: DirectShareProtection | undefined;
    readonly signal?: AbortSignal | undefined;
  },
  context: { readonly origin: string; readonly artifactCodec: ShareArtifactCodec },
): Promise<DirectSharePublication> => {
  const protection = input.protection ?? { kind: 'none' };
  let secrets: ShareLocatorSecrets;
  if (protection.kind === 'password') {
    const artifact = await context.artifactCodec.sealWithPassword(input.snapshot, protection.password, input.signal);
    secrets = sealedSecrets(artifact.compactJwe, protection);
  } else {
    const artifact = await context.artifactCodec.pack(input.snapshot, input.signal);
    secrets = { v: '2', zip: artifact.encodedArchive };
  }
  formatDirectShareUrl({ origin: context.origin, secrets });
  return { locator: directShareLocator, secrets };
};

/**
 * Make a direct link from a portable share ZIP another process already packed (base64url, as
 * {@link ShareArtifactCodec.pack} encodes it), sealing it here when a password protects it.
 *
 * The secrets are those {@link publishDirectShare} makes from the snapshot the ZIP was packed from.
 *
 * @param input - The Tau web origin, the encoded ZIP, its protection, and a cancel signal.
 * @returns The link and its secrets.
 * @throws {ShareError} When the ZIP or the password breaks a portable-share limit or the link is too long.
 * @public
 */
export const createDirectShareUrlFromArchive = async (input: {
  readonly origin: string;
  readonly encodedArchive: string;
  readonly protection?: DirectShareProtection | undefined;
  readonly signal?: AbortSignal | undefined;
}): Promise<DirectSharePublication & { readonly url: string }> => {
  const protection = input.protection ?? { kind: 'none' };
  let secrets: ShareLocatorSecrets;
  if (protection.kind === 'password') {
    const archive = decodeShareArchive(input.encodedArchive);
    secrets = sealedSecrets(await sealShareArchiveWithPassword(archive, protection.password, input.signal), protection);
  } else {
    decodeShareArchive(input.encodedArchive);
    input.signal?.throwIfAborted();
    secrets = { v: '2', zip: input.encodedArchive };
  }
  const url = formatDirectShareUrl({ origin: input.origin, secrets });
  return { locator: directShareLocator, secrets, url };
};

/**
 * Open the project a direct link carries.
 *
 * @param input - The parsed locator, its fragment secrets, and a cancel signal.
 * @param context - The artifact codec.
 * @returns The validated project files.
 * @throws {ShareError} `SHARE_LOCATOR_INVALID` for a malformed link; `SHARE_PASSWORD_REQUIRED` for a sealed link
 * without its password; otherwise what the codec throws.
 * @public
 */
export const resolveDirectShare = async (
  input: {
    readonly locator: ShareLocator;
    readonly secrets: ShareLocatorSecrets;
    readonly signal?: AbortSignal | undefined;
  },
  context: { readonly artifactCodec: ShareArtifactCodec },
): Promise<ShareOpenedArtifact> => {
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
};
