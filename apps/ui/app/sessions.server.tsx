import { createCookieSessionStorage } from 'react-router';
import { createThemeSessionResolver } from 'remix-themes';
import type { ThemeSessionResolver } from 'remix-themes';
import { metaConfig } from '#constants/meta.constants.js';

export type ThemeCookieOptionsInput = {
  requestUrl: string;
};

type ThemeCookieOptions = {
  name: string;
  path: string;
  httpOnly: boolean;
  sameSite: 'lax';
  secrets: string[];
  secure: boolean;
};

export const buildThemeCookieOptions = ({ requestUrl }: ThemeCookieOptionsInput): ThemeCookieOptions => {
  const secure = new URL(requestUrl).protocol === 'https:';

  return {
    name: `${metaConfig.cookiePrefix}theme`,
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secrets: ['s3cr3t'],
    secure,
  };
};

export const themeSessionResolver: ThemeSessionResolver = async (request) => {
  const sessionStorage = createCookieSessionStorage({
    cookie: buildThemeCookieOptions({ requestUrl: request.url }),
  });

  const resolveThemeSession = createThemeSessionResolver(sessionStorage);
  return resolveThemeSession(request);
};
