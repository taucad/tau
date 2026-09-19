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
  // Gateway pass-through headers for the Anthropic-compatible LLM surface
  // (allowlisted and validated in apps/api/app/api/llm/llm-gateway.headers.ts).
  anthropicVersion: 'anthropic-version',
  anthropicBeta: 'anthropic-beta',
  /**
   * The credential for a THIRD-PARTY git remote reached through
   * `POST /v1/git/proxy` — never the Tau session, which travels in
   * `authorization` on the same request and is never forwarded (I8).
   */
  // The key mirrors the value by the constants contract, so it keeps the
  // `x-tau-` prefix of `x-tau-attempt-id` rather than RFC 6648's advice.
  xTauProxyAuthorization: 'x-tau-proxy-authorization',
  /**
   * Git's own protocol-version request header (`version=2`), which
   * `isomorphic-git` sends on every smart-HTTP request the browser leg makes.
   *
   * It is not CORS-safelisted, so without it in the allow-list Chromium answers
   * the preflight `204` and then silently drops the request that follows — the
   * browser leg of Tau Cloud cannot make one call (W18 DEF-5).
   */
  gitProtocol: 'git-protocol',
  /**
   * Best-effort attribution for a gateway relay: which project and which chat
   * the turn belongs to, so its receipt can be filtered by them on `/usage`.
   * Both are opaque owner-scoped ids, optional on every request, dropped rather
   * than refused when malformed (`readHint` in
   * `apps/api/app/api/llm/llm-gateway.headers.ts`).
   *
   * Like `git-protocol` above, their value here is that CORS derives its
   * allow-list from this record: omit them and the browser answers the preflight
   * `204` and drops every gateway call, with nothing in the API log to see.
   */
  xTauProjectId: 'x-tau-project-id',
  xTauChatId: 'x-tau-chat-id',
} as const;

/**
 * Union of all HTTP header values
 */
export type HttpHeader = ConstantRecord<typeof httpHeader>;
