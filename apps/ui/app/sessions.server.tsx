import { createCookieSessionStorage } from 'react-router';
import { createThemeSessionResolver } from 'remix-themes';
import { ENV } from '#config.js';
import { metaConfig } from '#constants/meta.constants.js';

const isProduction = ENV.NODE_ENV === 'production';

const sessionStorage = createCookieSessionStorage({
  cookie: {
    name: `${metaConfig.cookiePrefix}theme`,
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secrets: ['s3cr3t'],
    // Set domain and secure only if in production
    ...(isProduction ? { domain: 'taucad.com', secure: true } : {}),
  },
});

export const themeSessionResolver = createThemeSessionResolver(sessionStorage);
