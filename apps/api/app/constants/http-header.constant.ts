import type { ConstantRecord } from '@taucad/types';

/**
 * Headers MUST NOT be prefixed with `X-` per https://datatracker.ietf.org/doc/html/rfc6648.
 *
 * All headers MUST be lowercase.
 * Per https://datatracker.ietf.org/doc/html/rfc9110.html, all HTTP headers are case-insensitive.
 * Furthermore, HTTP/2 specifies all headers to be lowercase per https://datatracker.ietf.org/doc/html/rfc7540#section-8.1.2
 */

/**
 * HTTP header keys.
 */
export const httpHeader = {
  requestId: 'request-id',
  authorization: 'authorization',
  userAgent: 'user-agent',
  contentType: 'content-type',
} as const;

/**
 * Union of all HTTP header values
 */
export type HttpHeader = ConstantRecord<typeof httpHeader>;
