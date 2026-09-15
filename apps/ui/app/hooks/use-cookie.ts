import { useMemo, useSyncExternalStore } from 'react';
import * as Cookies from 'es-cookie';
import { Topic } from '@taucad/events';
import { metaConfig } from '#constants/meta.constants.js';
import { isFunction } from '#utils/function.utils.js';
import type { CookieName } from '#constants/cookie.constants.js';

type Listener = () => void;

const readRaw = (name: string): string | undefined => {
  try {
    return globalThis.localStorage.getItem(name) ?? undefined;
  } catch {
    return undefined;
  }
};

const writeRaw = (name: string, value: string): void => {
  try {
    globalThis.localStorage.setItem(name, value);
  } catch {
    // Persistence is best-effort; a blocked store must not break the setting.
  }
};

const removeRaw = (name: string): void => {
  try {
    globalThis.localStorage.removeItem(name);
  } catch {
    // Persistence is best-effort; a blocked store must not break the setting.
  }
};

const preferenceStore = () => {
  const cache = new Map<string, unknown>();
  const listenerTopics = new Map<string, Topic<void>>();

  const subscribe = (name: string, listener: Listener) => {
    const topic = listenerTopics.get(name) ?? new Topic<void>({ name: `preference:${name}` });
    listenerTopics.set(name, topic);
    const unsubscribe = topic.subscribe(listener);
    return () => {
      unsubscribe();
      if (topic.size === 0) {
        listenerTopics.delete(name);
      }
    };
  };

  const notify = (name: string) => {
    listenerTopics.get(name)?.emit();
  };

  const get = <T>(name: string): T | undefined => {
    if (cache.has(name)) {
      return cache.get(name) as T;
    }

    const storedValue = readRaw(name);
    const legacyCookie = storedValue === undefined ? Cookies.get(name) : undefined;
    const rawValue = storedValue ?? legacyCookie;
    if (rawValue === undefined) {
      return undefined;
    }

    try {
      const value = JSON.parse(rawValue) as T;
      cache.set(name, value);
      if (legacyCookie !== undefined) {
        writeRaw(name, rawValue);
        Cookies.remove(name);
      }
      return value;
    } catch {
      removeRaw(name);
      Cookies.remove(name);
      return undefined;
    }
  };

  const update = <T>(name: string, value: T) => {
    cache.set(name, value);
    writeRaw(name, JSON.stringify(value));
    Cookies.remove(name);
    notify(name);
  };

  const remove = (name: string) => {
    cache.delete(name);
    removeRaw(name);
    Cookies.remove(name);
    notify(name);
  };

  return { get, remove, subscribe, update };
};

export const store = preferenceStore();

/**
 * Legacy-named UI preference hook. Ordinary preferences use localStorage on
 * both hosts; an old web cookie is migrated once when first read.
 */
// oxlint-disable-next-line @typescript-eslint/explicit-module-boundary-types -- infer type for hooks
export const useCookie = <T>(name: CookieName, defaultValue: T) => {
  const storageName = `${metaConfig.cookiePrefix}${name}`;
  const [selector, update, remove] = useMemo(
    () => [
      (): T => store.get<T>(storageName) ?? defaultValue,
      (valueOrFunction: T | ((previous: T) => T)) => {
        const value = isFunction(valueOrFunction) ? valueOrFunction(selector()) : valueOrFunction;
        store.update(storageName, value);
      },
      () => {
        store.remove(storageName);
      },
    ],
    [defaultValue, storageName],
  );
  const value = useSyncExternalStore(
    (listener) => store.subscribe(storageName, listener),
    selector,
    () => defaultValue,
  );
  return [value, update, remove] as const;
};
