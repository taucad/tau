import { createCookie } from 'react-router';
import { metaConfig } from '#constants/meta.constants.js';
import { themeSchema } from '#hooks/use-theme.js';
import type { ThemeWithSystem } from '#hooks/use-theme.js';

/**
 * Theme preference cookie, reading half.
 *
 * Isomorphic because the web root loader imports it while the client also
 * shares its schema. The desktop root has no loader and does not import this.
 *
 * `createCookie` is framework core with no server-only dependency; the
 * `Set-Cookie` half of the flow stays in `theme-cookie.server.ts`.
 */
export const createThemeCookie = (requestUrl: string): ReturnType<typeof createCookie> =>
  createCookie(`${metaConfig.cookiePrefix}theme`, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: new URL(requestUrl).protocol === 'https:',
  });

export const readThemeCookie = async (request: Request): Promise<ThemeWithSystem> => {
  const value: unknown = await createThemeCookie(request.url).parse(request.headers.get('Cookie'));
  const parsed = themeSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
};
