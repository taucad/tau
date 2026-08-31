import { createCookieSessionStorage } from 'react-router';
import { metaConfig } from '#constants/meta.constants.js';
import { isTheme } from '#hooks/use-theme.js';
import type { Theme, ThemeWithSystem } from '#hooks/use-theme.js';

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

type ThemeSession = {
  getTheme: () => ThemeWithSystem;
  setTheme: (theme: Theme) => void;
  commit: () => Promise<string>;
  destroy: () => Promise<string>;
};

export const themeSessionResolver = async (request: Request): Promise<ThemeSession> => {
  const sessionStorage = createCookieSessionStorage({
    cookie: buildThemeCookieOptions({ requestUrl: request.url }),
  });
  const session = await sessionStorage.getSession(request.headers.get('Cookie'));

  return {
    getTheme: (): ThemeWithSystem => {
      const theme: unknown = session.get('theme');
      return isTheme(theme) ? theme : null;
    },
    setTheme: (theme: Theme): void => {
      session.set('theme', theme);
    },
    commit: async (): Promise<string> => sessionStorage.commitSession(session),
    destroy: async (): Promise<string> => sessionStorage.destroySession(session),
  };
};
