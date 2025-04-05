import { useSyncExternalStore, useMemo } from 'react';
import * as Cookies from 'es-cookie';
import { loader } from '@/root';
import { useRouteLoaderData } from '@remix-run/react';
import { metaConfig } from '@/config';
import { isFunction } from '@/utils/functions';

type Listener = () => void;

const cookieStore = () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- cookie value is always a string
  const cache = new Map<string, any>();
  const listenerMap = new Map<string, Set<Listener>>();

  const subscribe = (cookieName: string, listener: Listener) => {
    if (!listenerMap.has(cookieName)) {
      listenerMap.set(cookieName, new Set());
    }
    listenerMap.get(cookieName)?.add(listener);
    return () => listenerMap.get(cookieName)?.delete(listener);
  };

  const notify = (cookieName: string) => {
    const listeners = listenerMap.get(cookieName);
    if (listeners) {
      for (const listener of listeners) listener();
    }
  };

  const get = <T>(cookieName: string) => {
    const value = cache.get(cookieName);
    if (value) return value;
    const cookieValue = Cookies.get(cookieName);
    if (!cookieValue) return;

    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- cookie value is always a string
    const cachedValue = JSON.parse(cookieValue) as T;
    cache.set(cookieName, cachedValue);
    return cachedValue;
  };

  const update = <T>(cookieName: string, v: T) => {
    cache.set(cookieName, v);
    Cookies.set(cookieName, JSON.stringify(v));
    notify(cookieName);
  };

  const remove = (cookieName: string) => {
    cache.delete(cookieName);
    Cookies.remove(cookieName);
    notify(cookieName);
  };

  return {
    subscribe,
    get,
    update,
    remove,
  };
};

export const store = cookieStore();

export const useCookie = <T>(name: string, defaultValue: T) => {
  const cookieName = `${metaConfig.cookiePrefix}${name}`;
  // Get the latest cookie value from route data on each render
  const data = useRouteLoaderData<typeof loader>('root');

  const [selector, update, remove] = useMemo(
    () => [
      (): T => {
        // On client, use the store's already parsed value
        if (globalThis.document !== undefined) {
          const cookieValue = store.get<T>(cookieName);
          if (cookieValue === undefined) {
            // If the cookie value is undefined, return the default value
            return defaultValue;
          }
          return cookieValue;
        }

        // On server, parse from route data
        const serverCookie = Cookies.parse(data?.cookie ?? '')[cookieName];
        if (serverCookie === undefined) {
          // If the cookie value is undefined, return the default value
          return defaultValue;
        }

        // We need to parse the cookie from the server as stringification occurs when setting cookie.
        return JSON.parse(serverCookie);
      },
      (valueOrFunction: T | ((previous: T) => T)) => {
        const currentValue = selector();
        const updateValue: T = isFunction(valueOrFunction) ? valueOrFunction(currentValue) : valueOrFunction;
        store.update<T>(cookieName, updateValue);
      },
      () => store.remove(cookieName),
    ],
    [cookieName, data?.cookie, defaultValue],
  );

  const value = useSyncExternalStore((listener) => store.subscribe(cookieName, listener), selector, selector);

  return [value, update, remove] as const;
};

export default useCookie;
