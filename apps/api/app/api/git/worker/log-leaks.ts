/**
 * What a log sample must never hold (DC1; W9 review FR20): a storage grant or
 * receipt, by its signed-token shape or as the grant header's value, and a
 * presigned URL's `X-Amz-Signature`. `scripts/check-storage-log-sample.mts`
 * runs this over a captured staging sample; the worker's `JsonLineLogger` and
 * the API's pino redaction are what keep it empty.
 *
 * Dependency-free, so the script imports it without the API's module graph.
 */

/** One finding: where, and what kind. Never the value, so the report is itself safe to log. */
export type LogLeak = {
  readonly line: number;
  readonly kind: 'signed_token' | 'grant_header' | 'amz_signature' | 'amz_credential';
};

const checks: ReadonlyArray<readonly [LogLeak['kind'], RegExp]> = [
  /* `v.kid.payload.signature`: a contract version, a kid, and two base64url runs. */
  ['signed_token', /\b\d{1,4}\.[\w-]{1,64}\.[\w-]{20,}\.[\w-]{40,}/u],
  ['grant_header', /tau-storage-grant["']?\s*[:=]\s*["']?(?!\*\*REDACTED\*\*|["'\s,}])/iu],
  ['amz_signature', /X-Amz-Signature=(?!\*\*REDACTED\*\*)[\da-f]{8,}/iu],
  ['amz_credential', /X-Amz-Credential=(?!\*\*REDACTED\*\*)[\w%/-]{8,}/iu],
];

/**
 * Finds every leak in a log sample.
 *
 * @param sample - The captured log, any line format.
 * @returns One entry per offending line and kind, in line order.
 */
export const findLogLeaks = (sample: string): LogLeak[] =>
  sample
    .split('\n')
    .flatMap((text, index) =>
      checks.flatMap(([kind, pattern]) => (pattern.test(text) ? [{ line: index + 1, kind }] : [])),
    );
