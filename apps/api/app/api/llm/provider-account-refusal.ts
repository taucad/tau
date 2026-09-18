import type { GatewayProviderId } from '#api/providers/provider-gateway.js';

/**
 * Who owns the provider account the gateway spent against: the operator of a
 * self-hosted API (their key, their billing page) or Tau (a Cloud supplier
 * account the customer can neither see nor top up).
 */
export type ProviderAccountOwner = 'operator' | 'tau';

/** Structured fields a `PROVIDER_ACCOUNT_EXHAUSTED` refusal carries to its clients. */
export type ProviderAccountRefusalDetails = {
  readonly providerId: GatewayProviderId;
  readonly providerCode?: string;
  readonly accountOwner: ProviderAccountOwner;
};

/** One recognised provider-account refusal: the provider's own code and sentence. */
export type ProviderAccountRefusal = {
  readonly providerCode?: string;
  /** The provider's own sentence, verbatim. Never sent to a Cloud customer. */
  readonly message: string;
};

/** What a Cloud customer is told: the supplier sentence never leaves the API. */
export const cloudProviderAccountMessage = "The model provider's account is unavailable.";

/** Where an operator tops the account up, for the providers that publish one page for it. */
export const providerBillingUrls: Partial<Record<GatewayProviderId, string>> = {
  openai: 'https://platform.openai.com/settings/organization/billing/',
  anthropic: 'https://console.anthropic.com/settings/billing',
  xai: 'https://console.x.ai/',
};

type ProviderError = {
  readonly type?: string;
  readonly code?: string;
  readonly message?: string;
};

const responsesCodes = new Set(['credit_balance_exhausted', 'insufficient_quota', 'billing_not_active']);
const completionsMessage = /insufficient (quota|credit|balance)|no credits|credit balance/i;
const anthropicMessage = /credit balance/i;

const responsesMatch = (error: ProviderError): boolean =>
  error.type === 'insufficient_quota' || (error.code !== undefined && responsesCodes.has(error.code));

const completionsMatch = (error: ProviderError): boolean =>
  error.type === 'insufficient_quota' || completionsMessage.test(error.message ?? '');

/**
 * The whole recognition surface: one predicate per provider, keyed by the wire
 * each provider actually answers on. Grow the table, not a taxonomy.
 */
const providerMatchers: Record<GatewayProviderId, (error: ProviderError) => boolean> = {
  openai: responsesMatch,
  xai: responsesMatch,
  anthropic: (error) =>
    error.type === 'billing_error' ||
    (error.type === 'invalid_request_error' && anthropicMessage.test(error.message ?? '')),
  cerebras: completionsMatch,
  moonshot: completionsMatch,
  morph: completionsMatch,
  together: completionsMatch,
  vertexai: completionsMatch,
};

const providerError = (body: unknown): ProviderError | undefined => {
  if (body === null || typeof body !== 'object') {
    return undefined;
  }
  const { error } = body as { error?: unknown };
  if (error === null || typeof error !== 'object') {
    return undefined;
  }
  const record = error as Record<string, unknown>;
  return {
    ...(typeof record['type'] === 'string' ? { type: record['type'] } : {}),
    ...(typeof record['code'] === 'string' ? { code: record['code'] } : {}),
    ...(typeof record['message'] === 'string' ? { message: record['message'] } : {}),
  };
};

/** The provider's own sentence, when its body carries one. */
export const providerErrorMessage = (body: unknown): string | undefined => providerError(body)?.message;

/**
 * Recognises "the provider account behind this key is not billable" from a
 * provider body — the parsed JSON of a pre-stream non-2xx response or of an SSE
 * `error` frame. Pure: both relay legs and the frame filter share it.
 *
 * @param input - The route's provider, the upstream status when there is one
 * (recognition is body-only; the status is part of the shared call shape), and
 * the parsed provider body.
 * @returns The provider's code and sentence, or undefined when the body is any
 * other failure.
 */
export const recognizeProviderAccountRefusal = (input: {
  readonly providerId: GatewayProviderId;
  readonly status?: number;
  readonly body: unknown;
}): ProviderAccountRefusal | undefined => {
  const error = providerError(input.body);
  if (!error || !providerMatchers[input.providerId](error)) {
    return undefined;
  }
  const providerCode = error.code ?? error.type;
  return {
    ...(providerCode === undefined ? {} : { providerCode }),
    message: error.message ?? 'The model provider account is not billable.',
  };
};

/** The message the owner of the failed account is allowed to read. */
export const providerAccountMessage = (accountOwner: ProviderAccountOwner, refusal: ProviderAccountRefusal): string =>
  accountOwner === 'tau' ? cloudProviderAccountMessage : refusal.message;

const maximumProviderBodyBytes = 64 * 1024;

/**
 * Reads a refused upstream response body once, bounded, and parses it as JSON.
 * A provider that answers megabytes of HTML to a refused request must not become
 * the gateway's memory profile, so the read stops at 64 KiB and cancels the rest.
 *
 * @param response - The non-2xx provider response. Its body is consumed.
 * @returns The parsed body, or undefined when there is none or it is not JSON.
 */
export const readBoundedProviderBody = async (response: Response): Promise<unknown> => {
  if (!response.body) {
    return undefined;
  }
  const reader = response.body.getReader();
  const parts: Array<Uint8Array<ArrayBuffer>> = [];
  let bytes = 0;
  try {
    for (;;) {
      // oxlint-disable-next-line no-await-in-loop -- a body is read serially, chunk by chunk.
      const part = await reader.read();
      if (part.done) {
        break;
      }
      parts.push(part.value);
      bytes += part.value.byteLength;
      if (bytes >= maximumProviderBodyBytes) {
        break;
      }
    }
  } catch {
    return undefined;
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  const buffer = new Uint8Array(bytes);
  let offset = 0;
  for (const part of parts) {
    buffer.set(part, offset);
    offset += part.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(buffer)) as unknown;
  } catch {
    return undefined;
  }
};
