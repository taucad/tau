import { useContext, useMemo, useSyncExternalStore } from 'react';
import * as Cookies from 'es-cookie';
import { Topic } from '@taucad/events';
import { metaConfig } from '#constants/meta.constants.js';
import { isFunction } from '#utils/function.utils.js';
import { serverVisiblePreferences } from '#constants/cookie.constants.js';
import type { CookieName } from '#constants/cookie.constants.js';
import { noServerPreferences, serverPreferencesContext } from '#hooks/server-preferences.js';
import type { ServerPreferences } from '#hooks/server-preferences.js';

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

/** Storage names whose value the server also needs: kept in a request cookie beside `localStorage`. */
const mirroredNames: ReadonlySet<string> = new Set(
  serverVisiblePreferences.map((name) => `${metaConfig.cookiePrefix}${name}`),
);

/** Days a mirrored preference cookie lives; each change renews it. */
const mirrorLifetimeDays = 365;

const mirrorAttributes = (): Cookies.CookieAttributes =>
  // oxlint-disable-next-line @typescript-eslint/no-unnecessary-condition -- `location` is absent outside a document.
  globalThis.location?.protocol === 'https:'
    ? { expires: mirrorLifetimeDays, sameSite: 'lax', secure: true }
    : { expires: mirrorLifetimeDays, sameSite: 'lax' };

/**
 * Keep a request cookie in step with the durable value: a mirrored preference rides requests as the same JSON it is
 * stored as, any other name must not ride them at all.
 */
const syncCookie = (name: string, raw: string): void => {
  if (mirroredNames.has(name)) {
    if (Cookies.get(name) !== raw) {
      Cookies.set(name, raw, mirrorAttributes());
    }
    return;
  }
  if (Cookies.get(name) !== undefined) {
    Cookies.remove(name);
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
        // Local storage wins: a mirrored cookie is brought in step, any other cookie only rides requests.
        if (legacyCookie !== storedValue) {
          syncCookie(name, storedValue);
        }
        return local.value as T;
      }
      removeRaw(name);
    }

    if (legacyCookie === undefined) {
      // Unset preferences are read on every render; `update` and `remove` refresh this.
      cache.set(name, undefined);
      return undefined;
    }
    const legacy = parse(legacyCookie);
    if (!legacy.isValid) {
      Cookies.remove(name);
      return undefined;
    }
    cache.set(name, legacy.value);
    // Delete the cookie only once its value is durable elsewhere; a mirrored one stays.
    if (writeRaw(name, legacyCookie)) {
      syncCookie(name, legacyCookie);
    }
    return legacy.value as T;
  };

  const update = <T>(name: string, value: T) => {
    cache.set(name, value);
    const raw = JSON.stringify(value);
    if (writeRaw(name, raw)) {
      syncCookie(name, raw);
    }
    notify(name);
  };

  const remove = (name: string) => {
    cache.delete(name);
    removeRaw(name);
    Cookies.remove(name);
    notify(name);
  };

  /* Another tab's or window's write: drop the cached value so the next read sees it (D2, R1). */
  if (typeof globalThis.addEventListener === 'function') {
    globalThis.addEventListener('storage', (event: StorageEvent) => {
      if (event.key === null) {
        const names = [...cache.keys()];
        cache.clear();
        for (const name of names) {
          notify(name);
        }
      } else if (cache.delete(event.key)) {
        notify(event.key);
      }
    });
  }

  return { get, remove, subscribe, update };
};

export const store = preferenceStore();

/**
 * Read the server-visible preferences from a request's `Cookie` header. Values are untrusted, so only valid JSON is
 * kept and each consumer still validates its own value.
 *
 * @param cookieHeader - The request's `Cookie` header.
 * @returns The mirrored preferences the request carried, by storage name.
 */
export const readServerPreferences = (cookieHeader: string | undefined): ServerPreferences => {
  if (!cookieHeader) {
    return noServerPreferences;
  }
  const cookies = Cookies.parse(cookieHeader);
  const preferences: Record<string, unknown> = {};
  for (const name of mirroredNames) {
    const raw = cookies[name];
    if (raw !== undefined) {
      try {
        preferences[name] = JSON.parse(raw) as unknown;
      } catch {
        // A malformed cookie reads as unset; the client store repairs it on its next read.
      }
    }
  }
  return preferences;
};

/**
 * Legacy-named UI preference hook. Ordinary preferences use localStorage on
 * both hosts; an old web cookie is migrated once when first read. A preference
 * in `serverVisiblePreferences` is also mirrored into a request cookie, and its
 * server snapshot is the value that cookie carried, so SSR and hydration agree.
 */
// oxlint-disable-next-line @typescript-eslint/explicit-module-boundary-types -- infer type for hooks
export const useCookie = <T>(name: CookieName, defaultValue: T) => {
  const storageName = `${metaConfig.cookiePrefix}${name}`;
  // Only a mirrored preference has a server value; the request's cookie is the same JSON the store holds.
  const serverValue = useContext(serverPreferencesContext)[storageName] as T | undefined;
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
    () => serverValue ?? defaultValue,
  );
  return [value, update, remove] as const;
};
