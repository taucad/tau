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

const writeRaw = (name: string, value: string): boolean => {
  try {
    globalThis.localStorage.setItem(name, value);
    return true;
  } catch {
    // Persistence is best-effort; a blocked store must not break the setting.
    return false;
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

  const parse = (raw: string): { readonly isValid: boolean; readonly value?: unknown } => {
    try {
      return { isValid: true, value: JSON.parse(raw) as unknown };
    } catch {
      return { isValid: false };
    }
  };

  const get = <T>(name: string): T | undefined => {
    if (cache.has(name)) {
      return cache.get(name) as T;
    }

    const legacyCookie = Cookies.get(name);
    const storedValue = readRaw(name);
    if (storedValue !== undefined) {
      const local = parse(storedValue);
      if (local.isValid) {
        cache.set(name, local.value);
        // Local storage wins; a surviving legacy cookie only rides requests.
        if (legacyCookie !== undefined) {
          Cookies.remove(name);
        }
        return local.value as T;
      }
      removeRaw(name);
    }

    if (legacyCookie === undefined) {
      return undefined;
    }
    const legacy = parse(legacyCookie);
    if (!legacy.isValid) {
      Cookies.remove(name);
      return undefined;
    }
    cache.set(name, legacy.value);
    // Delete the cookie only once its value is durable elsewhere.
    if (writeRaw(name, legacyCookie)) {
      Cookies.remove(name);
    }
    return legacy.value as T;
  };

  const update = <T>(name: string, value: T) => {
    cache.set(name, value);
    if (writeRaw(name, JSON.stringify(value))) {
      Cookies.remove(name);
    }
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
