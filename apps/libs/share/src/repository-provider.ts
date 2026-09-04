import { shareArtifactLimits } from '#artifact.js';
import type { ShareOpenedArtifact } from '#artifact.js';
import type { ShareProviderContext, ShareResolveInput } from '#provider.js';
import { ShareError } from '#provider.js';
import { parseRepositoryTarget } from '#repository-target.js';
import type { RepositoryProviderId } from '#repository-target.js';

/** Repository gateway override supplied by hosts that serve Tau's API on a separate origin. @internal */
export type RepositoryShareProviderContext = ShareProviderContext & {
  /** Absolute archive endpoint; defaults to the legacy same-origin `/api/import` route. */
  readonly archiveUrl?: string;
};

const readArchive = async (response: Response, signal?: AbortSignal): Promise<Uint8Array<ArrayBuffer>> => {
  const declared = Number(response.headers.get('content-length') ?? 0);
  if (Number.isFinite(declared) && declared > shareArtifactLimits.maxArchiveBytes) {
    throw new ShareError('SHARE_ARTIFACT_LIMIT', 'The repository archive exceeds the portable-share limit.');
  }
  const reader = response.body?.getReader();
  if (!reader) {
    throw new ShareError('SHARE_PROVIDER_INVALID_RESPONSE', 'The repository provider returned no archive.');
  }
  const chunks: Array<Uint8Array<ArrayBuffer>> = [];
  let length = 0;
  try {
    // oxlint-disable-next-line @typescript-eslint/no-unnecessary-condition -- standard stream reader contract.
    while (true) {
      signal?.throwIfAborted();
      // oxlint-disable-next-line no-await-in-loop -- the byte ceiling is enforced before reading the next chunk.
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      length += value.byteLength;
      if (length > shareArtifactLimits.maxArchiveBytes) {
        // oxlint-disable-next-line no-await-in-loop -- cancellation must settle before the stream lock is released.
        await reader.cancel();
        throw new ShareError('SHARE_ARTIFACT_LIMIT', 'The repository archive exceeds the portable-share limit.');
      }
      chunks.push(new Uint8Array(value));
    }
  } finally {
    reader.releaseLock();
  }
  const archive = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    archive.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return archive;
};

/** Resolve one immutable public repository target through Tau's bounded same-origin gateway. @internal */
export const resolveRepositoryShare = async (
  providerId: RepositoryProviderId,
  input: ShareResolveInput,
  context: RepositoryShareProviderContext,
): Promise<ShareOpenedArtifact> => {
  const { reference } = input.locator;
  if (input.locator.providerId !== providerId || !reference) {
    throw new ShareError('SHARE_LOCATOR_INVALID', 'The repository share locator is malformed.');
  }
  parseRepositoryTarget(providerId, reference);
  const url = new URL(context.archiveUrl ?? '/api/import', context.origin);
  url.searchParams.set('provider', providerId);
  url.searchParams.set('target', reference);
  let response: Response;
  try {
    response = await context.fetch(url, { credentials: 'omit', signal: input.signal });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw error;
    }
    throw new ShareError('SHARE_PROVIDER_UNAVAILABLE', 'The repository provider could not be reached.');
  }
  if (!response.ok) {
    const code =
      response.status === 400 || response.status === 422
        ? 'SHARE_PROVIDER_INVALID_RESPONSE'
        : 'SHARE_PROVIDER_UNAVAILABLE';
    throw new ShareError(code, 'The repository project could not be opened.');
  }
  const contentType = response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase();
  if (contentType !== 'application/zip') {
    throw new ShareError('SHARE_PROVIDER_INVALID_RESPONSE', 'The repository provider returned an invalid archive.');
  }
  return context.artifactCodec.openArchive(await readArchive(response, input.signal), input.signal);
};
