import { createCookie } from 'react-router';
import { metaConfig } from '#constants/meta.constants.js';
import { themeSchema } from '#hooks/use-theme.js';
import type { ThemeWithSystem } from '#hooks/use-theme.js';

/**
 * Theme preference cookie, reading half.
 *
 * Isomorphic on purpose: `root.tsx` is the shared route module for both the
 * web (SSR) and desktop (SPA) builds, so anything it imports must stay out of
 * `*.server` files — React Router refuses to resolve a server-only module from
 * a client graph, and the desktop root re-exports `root.tsx` rather than being
 * a route module React Router could strip the loader from.
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
