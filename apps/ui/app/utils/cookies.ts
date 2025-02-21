import { loader } from '@/root';
import { useRouteLoaderData } from '@remix-run/react';

import { useState, useEffect, useCallback } from 'react';

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

  const data = useRouteLoaderData<typeof loader>('root');
  const extractedCookie = data?.cookies[name];
  const parsedCookie = extractedCookie ? parser(extractedCookie) : defaultValue;
  const [value, setValue] = useState(parsedCookie);

  const handleSetValue = useCallback(
    (value: T | ((value: T) => T)) => {
      setValue((oldValue) => {
        const updatedValue = typeof value === 'function' ? (value as (value: T) => T)(oldValue) : value;
        const stringifiedValue = stringifier(updatedValue);
        setCookie(name, stringifiedValue, options.maxAge ?? DEFAULT_COOKIE_MAX_AGE);

        return updatedValue;
      });
    },
    [name, stringifier, options.maxAge],
  );

  useEffect(() => {
    setValue(parsedCookie);
  }, [parsedCookie]);

  return [value, handleSetValue] as const;
};
