import { loader } from '@/root';
import { useRouteLoaderData } from '@remix-run/react';

import { useState, useCallback } from 'react';

const DEFAULT_COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

/* eslint-disable unicorn/no-document-cookie */
export const extractCookie = (cookie: string | null, key: string, defaultValue = ''): string => {
  const cookieString = cookie?.split('; ').find((item) => item.startsWith(key));
  if (!cookieString) {
    return defaultValue;
  }
  return cookieString.split('=')[1];
};

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
  options: { maxAge?: number; parse?: (value: string) => T; stringify?: (value: T) => string } = {},
) => {
  const parser = options.parse ?? ((value: string) => value as T);
  const stringifier = options.stringify ?? String;

  // Get the latest cookie value from route data on each render
  const data = useRouteLoaderData<typeof loader>('root');
  const extractedCookie = data?.cookies[name];
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
          typeof valueOrUpdater === 'function' ? (valueOrUpdater as (value: T) => T)(currentValue) : valueOrUpdater;

        const stringifiedValue = stringifier(updatedValue);
        setCookie(name, stringifiedValue, options.maxAge ?? DEFAULT_COOKIE_MAX_AGE);

        return updatedValue;
      });
    },
    [name, stringifier, options.maxAge, cookieValue],
  );

  return [value, handleSetValue] as const;
};
