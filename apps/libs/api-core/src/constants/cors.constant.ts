import type { FastifyCorsOptions } from '@fastify/cors';
import { httpHeader } from '#constants/http-header.constant.js';

/**
 * CORS max age in seconds.
 */
const corsMaxAge = 21_600; // 6 hours

/**
 * CORS allowed headers. `sentry-trace` and `baggage` let a traced browser request continue its Sentry trace into
 * the error it causes here (SB17); the browser never sends `traceparent`, which would change OpenTelemetry sampling.
 */
const corsAllowedHeaders = [...Object.values(httpHeader), 'x-tau-attempt-id', 'sentry-trace', 'baggage'];

/**
 * CORS allowed methods.
 */
const corsAllowedMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'];

/**
 * CORS configuration.
 */
export const corsBaseConfiguration = {
  allowedHeaders: corsAllowedHeaders,
  // `retry-after` carries a rate-limited refusal's retry estimate (`GITHUB_RATE_LIMITED`); the body does not.
  // `request-id` lets the browser tag the error a failed call raises with the id this API's Sentry event carries.
  // `x-tau-commit` names the commit a repository import archive was resolved to.
  exposedHeaders: [
    'x-tau-chat-run-id',
    'x-tau-operation-id',
    'set-auth-token',
    'retry-after',
    httpHeader.requestId,
    'x-tau-commit',
  ],
  methods: corsAllowedMethods,
  credentials: true,
  maxAge: corsMaxAge,
} as const satisfies FastifyCorsOptions;
