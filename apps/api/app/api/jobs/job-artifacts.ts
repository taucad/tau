import { createHash } from 'node:crypto';

/** Private object-store key for one owner-scoped content-addressed job blob. */
export const jobArtifactStorageKey = (ownerId: string, digest: `sha256:${string}`): string =>
  `jobs/${encodeURIComponent(ownerId)}/sha256/${digest.slice('sha256:'.length)}`;

/** Private object-store key for one job-scoped immutable action record. */
export const jobActionRecordStorageKey = (ownerId: string, jobId: string, digest: `sha256:${string}`): string =>
  `jobs/${encodeURIComponent(ownerId)}/actions/${encodeURIComponent(jobId)}/sha256/${digest.slice('sha256:'.length)}.json`;

/** S3 checksum header value for Tau's hexadecimal SHA-256 wire identity. */
export const jobArtifactChecksum = (digest: `sha256:${string}`): string =>
  Buffer.from(digest.slice('sha256:'.length), 'hex').toString('base64');

/** Stream and verify one complete object independently of backend ETag/multipart checksum semantics. */
export const verifyJobArtifactStream = async (input: {
  readonly body: AsyncIterable<unknown> & { destroy?: () => void };
  readonly expectedDigest: `sha256:${string}`;
  readonly expectedSize: number;
}): Promise<{ readonly verified: true } | { readonly verified: false; readonly reason: 'digest' | 'size' }> => {
  const hash = createHash('sha256');
  let size = 0;
  for await (const chunk of input.body) {
    if (typeof chunk !== 'string' && !(chunk instanceof Uint8Array)) {
      input.body.destroy?.();
      throw new TypeError('Job artifact storage returned a non-byte stream chunk.');
    }
    const bytes = Buffer.from(chunk);
    size += bytes.byteLength;
    if (size > input.expectedSize) {
      input.body.destroy?.();
      return { verified: false, reason: 'size' };
    }
    hash.update(bytes);
  }
  if (size !== input.expectedSize) {
    return { verified: false, reason: 'size' };
  }
  return `sha256:${hash.digest('hex')}` === input.expectedDigest
    ? { verified: true }
    : { verified: false, reason: 'digest' };
};
