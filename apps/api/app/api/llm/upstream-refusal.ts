import { HttpStatus } from '@nestjs/common';
import type { LlmGatewayErrorType } from '#api/llm/llm-gateway.error.js';
import { readBoundedProviderBody } from '#api/llm/provider-account-refusal.js';
import type { ProviderAccountOwner } from '#api/llm/provider-account-refusal.js';

/**
 * How much of a refused upstream body reaches the server log. Enough for a
 * provider's own diagnosis (the Vertex schema rejection is ~300 bytes) without
 * putting a provider's HTML error page into the log stream.
 */
const maximumLoggedBodyBytes = 2 * 1024;

/**
 * Credential shapes a provider can echo back in a refusal: the request's own
 * authorization, the API keys the three wires issue, a signed assertion, and the
 * service-account private key. The log is a server log, not a secret store.
 */
const credentialPatterns: readonly RegExp[] = [
  /"private_key(?:_id)?"\s*:\s*"(?:\\.|[^"\\])*"/gi,
  /-{5}BEGIN [ A-Z]*PRIVATE KEY-{5}[\S\s]*?-{5}END [ A-Z]*PRIVATE KEY-{5}/g,
  /\bbearer\s+[\w+./=~-]+/gi,
  /\beyJ[\w-]*(?:\.[\w-]+){2}/g,
  /\bAIza[\w-]{10,}/g,
  /\b(?:sk|xai|gsk|rk)-[\w-]{8,}/g,
];

/**
 * Removes credential-shaped text from a body before it is logged.
 *
 * @param text - The upstream body as it arrived.
 * @returns The same text with every recognised credential replaced.
 */
export const redactCredentials = (text: string): string => {
  let redacted = text;
  for (const pattern of credentialPatterns) {
    redacted = redacted.replace(pattern, '[redacted]');
  }
  return redacted;
};

/** A refused upstream response, read once for both recognition and the server log. */
export type UpstreamRefusal = {
  /** The parsed JSON body refusal recognition and the client message read. */
  readonly body: unknown;
  /** That body re-serialised, credentials removed and bounded, for the server log only. */
  readonly loggedBody?: string;
};

/**
 * Reads a non-OK upstream response once and returns both the body refusal
 * recognition classifies and the redacted, bounded copy the operator needs in the
 * log. Total: an absent, already-consumed or torn body simply logs nothing.
 *
 * ponytail: the log carries the body only when it is JSON, which is what all four
 * routed wires answer; a provider that answers HTML is diagnosed from its status.
 * Give `readBoundedProviderBody` a text form if that stops being enough.
 *
 * @param response - The upstream response. Its body is consumed.
 * @returns The parsed body and the loggable copy, both absent when there is none.
 */
export const readUpstreamRefusal = async (response: Response): Promise<UpstreamRefusal> => {
  if (response.bodyUsed || !response.body) {
    return { body: undefined };
  }
  const body = await readBoundedProviderBody(response);
  // Redacted before the bound, so a credential straddling it cannot survive as a fragment.
  return body === undefined
    ? { body }
    : { body, loggedBody: redactCredentials(JSON.stringify(body)).slice(0, maximumLoggedBodyBytes) };
};

/**
 * Reads an upstream retry estimate.
 *
 * @param headers - The refused response's headers.
 * @returns The delta-seconds estimate, or undefined when there is none.
 */
export const upstreamRetryAfterSeconds = (headers: Headers): number | undefined => {
  const header = headers.get('retry-after')?.trim();
  if (header === undefined || header === '') {
    return undefined;
  }
  // Ponytail: delta-seconds only; an HTTP-date Retry-After simply carries no estimate.
  const seconds = Number(header);
  return Number.isInteger(seconds) && seconds >= 0 ? seconds : undefined;
};

/** How the gateway answers one upstream status. Messages stay with each caller. */
export type UpstreamClassification = {
  readonly status: HttpStatus;
  readonly type: LlmGatewayErrorType;
  readonly details?: { readonly retryAfterSeconds: number };
};

/** The statuses the mapping turns on, as the wire sends them rather than as Nest's enum. */
const upstreamStatus = {
  badRequest: 400,
  unauthorized: 401,
  forbidden: 403,
  tooManyRequests: 429,
  /** Google answers CANCELLED as 499 on the Vertex wire: an outage, not a rejected request. */
  cancelled: 499,
  serverError: 500,
} as const;

/**
 * The one status mapping both relay legs use, so the self-host and funded paths
 * cannot drift. A recognised provider-account refusal is classified before this.
 *
 * @param input - The upstream status, its retry estimate when it sent one, and who
 * owns the provider account the request spent against.
 * @returns The gateway status, refusal code and retry details to answer with.
 */
export const classifyUpstreamRefusal = (input: {
  readonly status: number;
  readonly retryAfterSeconds?: number;
  readonly accountOwner: ProviderAccountOwner;
}): UpstreamClassification => {
  if (input.status === upstreamStatus.tooManyRequests) {
    return {
      status: HttpStatus.TOO_MANY_REQUESTS,
      type: 'RATE_LIMITED',
      ...(input.retryAfterSeconds === undefined ? {} : { details: { retryAfterSeconds: input.retryAfterSeconds } }),
    };
  }
  if (input.status === upstreamStatus.cancelled || input.status >= upstreamStatus.serverError) {
    return { status: HttpStatus.SERVICE_UNAVAILABLE, type: 'PROVIDER_UNAVAILABLE' };
  }
  /* 401/403 keeps the answer each path already gave: an operator owns their own key and
   * is told the provider refused it; on Cloud the key is Tau's, so its refusal is a
   * Tau-side outage rather than something the customer's request can fix. */
  const credentialRefusal = input.status === upstreamStatus.unauthorized || input.status === upstreamStatus.forbidden;
  if (input.status < upstreamStatus.badRequest || (credentialRefusal && input.accountOwner === 'tau')) {
    return { status: HttpStatus.SERVICE_UNAVAILABLE, type: 'PROVIDER_UNAVAILABLE' };
  }
  return { status: HttpStatus.BAD_GATEWAY, type: 'UPSTREAM_REJECTED' };
};

/**
 * How much of a supplier's own sentence an operator is shown. The message is
 * persisted into the chat's error row, so a provider that echoes a fragment of
 * the request it rejected cannot make that row unbounded.
 */
export const maximumRefusalMessageCharacters = 500;

/**
 * What a Cloud customer is told about a refused upstream call. Tau owns the key
 * on that path, so the supplier's own sentence never leaves the API; these three
 * sentences are all a customer reads. Shared so the pre-stream leg and the
 * mid-stream frame filter cannot drift apart.
 *
 * @param input - The classification this refusal already mapped to, and the
 * upstream status it came from.
 * @returns The message the customer may read.
 */
export const cloudUpstreamRefusalMessage = (input: {
  readonly type: LlmGatewayErrorType;
  readonly status: number;
}): string => {
  if (input.type === 'UPSTREAM_REJECTED') {
    return `The model provider rejected the request (HTTP ${String(input.status)}).`;
  }
  return input.type === 'RATE_LIMITED'
    ? 'The model provider is rate limiting this request.'
    : 'The model provider is unavailable.';
};
