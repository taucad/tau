/**
 * The expected-writer check for one Data Access Log write or delete.
 *
 * Each watched bucket names its expected writers in `AUDIT_EXPECTED_WRITERS`: token ids, which Data
 * Access Logs report as `actor.accessKeyId`, and Worker script names, reported as `scriptName` on
 * `interface = Workers` events. A write through the dashboard or the Cloudflare API (`interface = API`)
 * is unexpected on every bucket, whoever made it.
 */

import type { ExpectedWriterMap } from '#environment.js';
import type { UnexpectedWriterReason } from '#log.js';

/** The fields of a write the check reads. */
export type WriterIdentity = Readonly<{
  bucket: string;
  interface?: string;
  accessKeyId?: string;
  scriptName?: string;
}>;

/**
 * Why a write is unexpected, if it is.
 *
 * @param expected - The parsed `AUDIT_EXPECTED_WRITERS`.
 * @param writer - The write's bucket and actor.
 * @returns `undefined` for an expected writer; otherwise the reason.
 */
export const unexpectedWriter = (
  expected: ExpectedWriterMap,
  writer: WriterIdentity,
): UnexpectedWriterReason | undefined => {
  if (writer.interface === 'API') {
    return 'api-interface';
  }
  const allowed = expected.buckets.get(writer.bucket);
  if (allowed === undefined) {
    return 'unknown-bucket';
  }
  if (writer.interface === 'Workers') {
    return writer.scriptName !== undefined && allowed.scripts.has(writer.scriptName) ? undefined : 'unknown-actor';
  }
  return writer.accessKeyId !== undefined && allowed.tokenIds.has(writer.accessKeyId) ? undefined : 'unknown-actor';
};
