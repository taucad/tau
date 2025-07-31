import type { FastifyCorsOptions } from '@fastify/cors';
import { httpHeader } from '#constants/http-header.constant.js';

/**
 * CORS max age in seconds.
 */
const corsMaxAge = 21_600; // 6 hours

/**
 * CORS allowed headers.
 */
const corsAllowedHeaders = Object.values(httpHeader);

/**
 * CORS allowed methods.
 */
const corsAllowedMethods = ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'];

/**
 * CORS configuration.
 */
export const corsBaseConfiguration = {
  allowedHeaders: corsAllowedHeaders,
  methods: corsAllowedMethods,
  credentials: true,
  maxAge: corsMaxAge,
} as const satisfies FastifyCorsOptions;
