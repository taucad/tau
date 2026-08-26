import { useSyncExternalStore, useMemo } from 'react';
import * as Cookies from 'es-cookie';
import { useRouteLoaderData } from 'react-router';
import { Topic } from '@taucad/events';
import type { loader } from '#root.js';
import { metaConfig } from '#constants/meta.constants.js';
import { isFunction } from '#utils/function.utils.js';
import type { CookieName } from '#constants/cookie.constants.js';

type Listener = () => void;

const cookieStore = () => {
  const cache = new Map<string, unknown>();
  const listenerTopics = new Map<string, Topic<void>>();

  const subscribe = (cookieName: string, listener: Listener) => {
    const topic = listenerTopics.get(cookieName) ?? new Topic<void>({ name: `cookie:${cookieName}` });
    listenerTopics.set(cookieName, topic);
    const unsubscribe = topic.subscribe(listener);
    return () => {
      unsubscribe();
      if (topic.size === 0) {
        listenerTopics.delete(cookieName);
      }
    };
  };

  const notify = (cookieName: string) => {
    listenerTopics.get(cookieName)?.emit();
  };

  const get = <T>(cookieName: string): T | undefined => {
    const value = cache.get(cookieName);
    if (value) {
      return value as T;
    }

    const cookieValue = Cookies.get(cookieName);
    if (!cookieValue) {
      return;
    }

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

/**
 * A hook to get and set a cookie.
 *
 * The cookie must be serializable with `JSON.stringify`
 * and deserializable with `JSON.parse`.
 *
 * @param name - The name of the cookie.
 * @param defaultValue - The default value of the cookie.
 * @returns The value of the cookie.
 */
// oxlint-disable-next-line @typescript-eslint/explicit-module-boundary-types -- infer type for hooks
export const useCookie = <T>(name: CookieName, defaultValue: T) => {
  const cookieName = `${metaConfig.cookiePrefix}${name}`;
  // Get the latest cookie value from route data on each render
  const data = useRouteLoaderData<typeof loader>('root');

  const [selector, update, remove] = useMemo(
    () => [
      (): T => {
        // On client, use the store's already parsed value
        // oxlint-disable-next-line @typescript-eslint/no-unnecessary-condition -- can be undefined on server
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
        return JSON.parse(serverCookie) as T;
      },
      (valueOrFunction: T | ((previous: T) => T)) => {
        const currentValue = selector();
        const updateValue: T = isFunction(valueOrFunction) ? valueOrFunction(currentValue) : valueOrFunction;
        store.update<T>(cookieName, updateValue);
      },
      () => {
        store.remove(cookieName);
      },
    ],
    [cookieName, data?.cookie, defaultValue],
  );

  const value = useSyncExternalStore((listener) => store.subscribe(cookieName, listener), selector, selector);

  return [value, update, remove] as const;
};
