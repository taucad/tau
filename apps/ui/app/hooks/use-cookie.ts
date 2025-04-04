import { metaConfig } from '@/config';
import { loader } from '@/root';
import { getCookie, setCookie } from '@/utils/cookies';
import { useRouteLoaderData } from '@remix-run/react';
import { useCallback, useSyncExternalStore } from 'react';

const DEFAULT_COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

// Cookie store implementation
const createCookieStore = <T>(cookieName: string, defaultValue: T) => {
  const listeners = new Set<() => void>();
  let currentValue: T | undefined;

  return {
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getValue: (cookiesJson: Record<string, string>, parser: (value: string) => T): T => {
      const extractedCookie =
        globalThis.document === undefined ? cookiesJson[cookieName] : getCookie(document.cookie, cookieName);

      return extractedCookie ? parser(extractedCookie) : defaultValue;
    },
    setValue: (value: T, maxAge: number, stringify: (value: T) => string) => {
      currentValue = value;
      setCookie(cookieName, stringify(value), maxAge);
      for (const listener of listeners) listener();
    },
    // For direct access to current override
    getOverride: () => currentValue,
  };
};

// Global cache of cookie stores
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add fully linked typing via generics.
const cookieStores = new Map<string, ReturnType<typeof createCookieStore<any>>>();

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
  const maxAge = options.maxAge ?? DEFAULT_COOKIE_MAX_AGE;

  // Get the route data for accessing cookies
  const data = useRouteLoaderData<typeof loader>('root');
  const cookies = data?.cookies;

  // Get or create the store for this cookie
  if (!cookieStores.has(cookieName)) {
    cookieStores.set(cookieName, createCookieStore<T>(cookieName, defaultValue));
  }
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- TODO: add fully linked typing via generics.
  const store = cookieStores.get(cookieName) as ReturnType<typeof createCookieStore<T>>;

  if (!store) {
    throw new Error(`Cookie store for ${cookieName} not found`);
  }

  // Snapshot functions for client and server
  const getSnapshot = useCallback(() => {
    const override = store.getOverride();
    if (override !== undefined) {
      return override;
    }
    // Return a fresh value from the cookie each time
    return store.getValue(cookies ?? {}, parser);
  }, [cookies, parser, store]);

  // Use same snapshot function for server as it's the same as client
  const getServerSnapshot = getSnapshot;

  // Use the store's subscribe function directly
  const value = useSyncExternalStore(store.subscribe, getSnapshot, getServerSnapshot);

  const setValue = useCallback(
    (valueOrUpdater: T | ((previousValue: T) => T)) => {
      const currentValue = getSnapshot();
      const updatedValue =
        // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- only a value or a function is passed
        typeof valueOrUpdater === 'function' ? (valueOrUpdater as (value: T) => T)(currentValue) : valueOrUpdater;

      store.setValue(updatedValue, maxAge, stringifier);
    },
    [getSnapshot, maxAge, store, stringifier],
  );

  return [value, setValue] as const;
};
