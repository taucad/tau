import { isWeakKey } from '#lib/weak-key.js';

/*
 * Browser–API correlation (SB13): the `request-id` the API answers every request with, recorded on the error a
 * failed response raises, so the `tau-ui` event carries `api_request_id` and one search finds the `tau-api` event
 * that carries the same `request_id`.
 */

/** The response header the API names each request by (`apps/api` `httpHeader.requestId`, exposed through CORS). */
export const apiRequestIdHeader = 'request-id';

/** The shape the API itself accepts for a request id: no separators or whitespace, at most 64 characters. */
const requestIdPattern = /^[\w-]{1,64}$/u;

/** How many `cause` links {@link apiRequestIdTags} follows from a reported error. */
const causeDepth = 5;

const requestIds = new WeakMap<WeakKey, string>();

/**
 * The request id a response names, when it has one of the accepted shape.
 *
 * @param response - An API response.
 * @returns The request id, or `undefined`.
 */
export const readApiRequestId = (response: Response): string | undefined => {
  // Recording an id never breaks the failure it describes: a response-like value without headers names none.
  const headers: Partial<Pick<Headers, 'get'>> | undefined = (response as Partial<Response>).headers;
  const value = typeof headers?.get === 'function' ? headers.get(apiRequestIdHeader) : null;
  return value !== null && requestIdPattern.test(value) ? value : undefined;
};

/**
 * Record on an error the request id of the failed API response it was raised from. A primitive cannot carry one,
 * and a response without an id leaves the error as it was.
 *
 * @param error - The error raised for the failure.
 * @param response - The failed response.
 * @returns The same error, for `throw recordApiRequestId(new Error(...), response)`.
 */
export const recordApiRequestId = <Failure>(error: Failure, response: Response): Failure => {
  const requestId = readApiRequestId(response);
  if (requestId !== undefined && isWeakKey(error)) {
    requestIds.set(error, requestId);
  }
  return error;
};

/**
 * The `api_request_id` tag of a reported value: its own recorded request id, else the nearest one along its
 * `cause` chain (an error that wraps the API failure).
 *
 * @param error - The reported value.
 * @returns `{ api_request_id }`, or no tags.
 */
export const apiRequestIdTags = (error: unknown): Readonly<Record<string, string>> => {
  let current = error;
  for (let depth = 0; depth <= causeDepth; depth += 1) {
    if (!isWeakKey(current)) {
      return {};
    }
    const requestId = requestIds.get(current);
    if (requestId !== undefined) {
      // eslint-disable-next-line @typescript-eslint/naming-convention -- Sentry tag name searched beside `request_id`.
      return { api_request_id: requestId };
    }
    current = current instanceof Error ? current.cause : undefined;
  }
  return {};
};
