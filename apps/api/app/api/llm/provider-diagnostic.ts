import { createHash } from 'node:crypto';

/**
 * Members whose string values are a provider's own vocabulary (a status, an
 * error type or code, a parameter path, a detail's type URL) rather than prose.
 * Every other string is free text that can quote the request it rejected.
 */
const vocabularyKeys = new Set(['@type', 'code', 'domain', 'error_type', 'field', 'param', 'reason', 'status', 'type']);

/** A vocabulary value: one token, never a sentence. */
const vocabularyValue = /^[\w./:@[\]-]{1,128}$/u;

/** How much of the projected body reaches the server log. */
const maximumDiagnosticCharacters = 2 * 1024;
const maximumDepth = 6;
const maximumItems = 16;

/**
 * A free-text value as the log may carry it: its length and a short digest, so
 * an operator can group repeats of one provider sentence without reading it.
 *
 * @param text - The provider's sentence.
 * @returns A marker such as `[text 42 3f9a0c1d]`.
 */
export const textMarker = (text: string): string =>
  `[text ${text.length} ${createHash('sha256').update(text).digest('hex').slice(0, 8)}]`;

const project = (value: unknown, key: string | undefined, depth: number): unknown => {
  if (typeof value === 'string') {
    return key !== undefined && vocabularyKeys.has(key) && vocabularyValue.test(value) ? value : textMarker(value);
  }
  if (value === null || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (typeof value !== 'object' || depth >= maximumDepth) {
    return '[omitted]';
  }
  if (Array.isArray(value)) {
    return value.slice(0, maximumItems).map((item: unknown) => project(item, key, depth + 1));
  }
  return Object.fromEntries(
    Object.entries(value)
      .slice(0, maximumItems)
      .map(([member, item]: [string, unknown]) => [member, project(item, member, depth + 1)]),
  );
};

/**
 * The content-free form of a provider error body for operator logs (blueprint
 * T07). Structure, numbers and the provider's own vocabulary stay; every
 * sentence becomes a length and digest, because a provider sentence can quote
 * a fragment of the prompt, file or tool output it rejected, and server logs
 * reach Grafana and Sentry.
 *
 * @param body - A parsed provider body or SSE error frame.
 * @returns The projection as bounded JSON.
 */
export const providerDiagnostic = (body: unknown): string =>
  JSON.stringify(project(body, undefined, 0)).slice(0, maximumDiagnosticCharacters);

const vocabularyOf = (value: unknown): string | undefined =>
  (typeof value === 'string' || typeof value === 'number') && vocabularyValue.test(String(value))
    ? String(value)
    : undefined;

/**
 * The content-free description of a thrown error for operator logs: its class,
 * its system or HTTP code and its cause's, never its message or stack. A
 * provider SDK's message embeds the response body, which can quote the request.
 *
 * @param error - What a provider call or SDK threw.
 * @returns A line such as `TypeError ECONNREFUSED` or `BadRequestError 400`.
 */
export const errorDiagnostic = (error: unknown): string => {
  if (!(error instanceof Error)) {
    return typeof error;
  }
  const cause: unknown = error.cause;
  const codes = [
    vocabularyOf(Reflect.get(error, 'code')),
    vocabularyOf(Reflect.get(error, 'status')),
    cause instanceof Error ? vocabularyOf(Reflect.get(cause, 'code')) : undefined,
  ].filter((code): code is string => code !== undefined);
  return [vocabularyOf(error.name) ?? 'Error', ...new Set(codes)].join(' ');
};
