import { httpHeader } from '~/constants/http-header.constant.js';

/**
 * CORS max age in seconds.
 */
export const corsMaxAge = 21_600; // 6 hours

export const corsAllowedHeaders = Object.values(httpHeader);

export const corsAllowedMethods = ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'];
