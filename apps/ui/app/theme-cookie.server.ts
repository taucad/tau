import { createThemeCookie } from '#theme-cookie.js';

/**
 * Expire the pre-record theme cookie (the one-time migration in `routes/action.migrate-theme.ts`).
 *
 * @param requestUrl - The request's URL, which decides `Secure`.
 * @returns The `Set-Cookie` value.
 */
export const destroyThemeCookie = async (requestUrl: string): Promise<string> =>
  createThemeCookie(requestUrl).serialize('', { expires: new Date(0) });
