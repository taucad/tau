import type { FastifyCorsOptions } from '@fastify/cors';
import { httpHeader } from '#constants/http-header.constant.js';

/**
 * CORS max age in seconds.
 */
const corsMaxAge = 21_600; // 6 hours

/**
 * CORS allowed headers.
 */
const corsAllowedHeaders = [...Object.values(httpHeader), 'x-tau-attempt-id'];

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
  exposedHeaders: ['x-tau-chat-run-id', 'x-tau-operation-id', 'set-auth-token', 'retry-after'],
  methods: corsAllowedMethods,
  credentials: true,
  maxAge: corsMaxAge,
} as const satisfies FastifyCorsOptions;
