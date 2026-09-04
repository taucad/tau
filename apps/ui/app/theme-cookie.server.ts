import { createThemeCookie } from '#theme-cookie.js';
import type { Theme } from '#hooks/use-theme.js';

type SerializeThemeCookieInput = {
  requestUrl: string;
  theme: Theme;
};

export const serializeThemeCookie = async ({ requestUrl, theme }: SerializeThemeCookieInput): Promise<string> =>
  createThemeCookie(requestUrl).serialize(theme);

export const destroyThemeCookie = async (requestUrl: string): Promise<string> =>
  createThemeCookie(requestUrl).serialize('', { expires: new Date(0) });
