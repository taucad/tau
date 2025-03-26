import { metaConfig } from '@/config';
import { loader } from '@/root';
import { useRouteLoaderData } from '@remix-run/react';

import { useState, useCallback } from 'react';

const DEFAULT_COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

/* eslint-disable unicorn/no-document-cookie -- this is the only allowable entry point for cookie management */
export const setCookie = (name: string, value: string, maxAge: number) => {
  document.cookie = `${name}=${value}; path=/; max-age=${maxAge}`;
};

export const getCookie = (cookie: string, name: string): string | undefined => {
  const match = cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
  return match ? match[2] : undefined;
};

export const deleteCookie = (name: string) => {
  document.cookie = `${name}=; path=/; max-age=0`;
};

export const parseCookies = (cookie: string) => {
  const cookies = cookie.split('; ');
  const parsedCookies: Record<string, string> = {};
  for (const cookie of cookies) {
    const [key, value] = cookie.split('=');
    parsedCookies[key] = value;
  }
  return parsedCookies;
};

export const useCookie = <T>(
  name: string,
  defaultValue: T,
  options: {
    maxAge?: number;
    parse?: (value: string) => T;
    stringify?: (value: T) => string;
  } = {},
) => {
  const cookieName = `${metaConfig.cookiePrefix}${name}`;
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- We can safely assert the type here because we know the value is a string, which is the only type that can be stored in a cookie.
  const parser = options.parse ?? (JSON.parse as (value: string) => T);
  const stringifier = options.stringify ?? JSON.stringify;

  // Get the latest cookie value from route data on each render
  const data = useRouteLoaderData<typeof loader>('root');

  // If we're on the server, use the cookie from the route data
  // If we're on the client, use the cookie from the document
  const extractedCookie =
    globalThis.document === undefined ? data?.cookies[cookieName] : getCookie(document.cookie, cookieName);
  const cookieValue = extractedCookie ? parser(extractedCookie) : defaultValue;

  // Use the cookie value directly from route data instead of maintaining separate state
  // This eliminates the need for useEffect or other sync mechanisms
  const [localOverride, setLocalOverride] = useState<T | undefined>();

  // Use localOverride if it exists, otherwise use the cookie value from route data
  const value = localOverride === undefined ? cookieValue : localOverride;

  const handleSetValue = useCallback(
    (valueOrUpdater: T | ((previousValue: T) => T)) => {
      setLocalOverride((oldValue) => {
        // If oldValue is undefined, use the current value from cookie
        const currentValue = oldValue === undefined ? cookieValue : oldValue;
        const updatedValue =
          // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- only a value or a function is passed
          typeof valueOrUpdater === 'function' ? (valueOrUpdater as (value: T) => T)(currentValue) : valueOrUpdater;

        const stringifiedValue = stringifier(updatedValue);
        setCookie(cookieName, stringifiedValue, options.maxAge ?? DEFAULT_COOKIE_MAX_AGE);

        return updatedValue;
      });
    },
    [cookieName, stringifier, options.maxAge, cookieValue],
  );

  return [value, handleSetValue] as const;
};

/* eslint-enable unicorn/no-document-cookie -- renabling */
