import { createCookie } from 'react-router';
import { metaConfig } from '#constants/meta.constants.js';
import { themeSchema } from '#hooks/use-theme.js';
import type { ThemeWithSystem } from '#hooks/use-theme.js';

/**
 * The theme cookie from before the client-facts record, reading half. Only the one-time migration route reads it
 * (`routes/action.migrate-theme.ts`); the theme itself is a client fact (`#lib/client-facts`).
 */
/* `requestUrl` is `request.url`, read for its protocol only, which a `.data` suffix never changes (B4). */
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
