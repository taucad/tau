import { Topic } from '@taucad/events';
import { prepareSectionWrite, readSection } from '@taucad/preferences';
import type { SectionDefinition } from '@taucad/preferences';
import type { CookieName } from '@taucad/ui-core/constants/cookie.constants';
import { metaConfig } from '#constants/meta.constants.js';

/**
 * What a write did. `saved` is stored under the key. `refused` (the browser rejected the write) and `newer` (a later
 * build wrote this section, so it is left alone) keep the value applied in memory until the tab closes; the surface
 * that wrote it shows its status line.
 */
export type SectionWriteResult = 'saved' | 'refused' | 'newer';

/** One section of the person or device record in this tab: read, written and refreshed from other tabs. */
export type SectionStore<T, Write> = Readonly<{
  /** The value in effect: the stored section with every write this tab could not store applied over it. */
  read: () => T;
  /** The value before any storage is read, for server rendering and hydration. */
  readInitial: () => T;
  /** Read what is stored, merge the write into it and store the result, in one synchronous step. */
  write: (write: Write) => SectionWriteResult;
  /** Calls `listener` when this tab writes the section or another tab changes it. */
  subscribe: (listener: () => void) => () => void;
}>;

type Snapshot<T> = Readonly<{ raw: string | undefined; pending: number; value: T }>;

const getRaw = (key: string): string | undefined => {
  try {
    return globalThis.localStorage.getItem(key) ?? undefined;
  } catch {
    return undefined;
  }
};

const setRaw = (key: string, raw: string): boolean => {
  try {
    globalThis.localStorage.setItem(key, raw);
    return true;
  } catch {
    return false;
  }
};

/**
 * Create the store for one section kept under one local-storage key. Unlike `useCookie`, a write reads the raw
 * stored text immediately before merging, so a tab holding a stale copy merges into what another tab stored; it
 * returns whether the write was accepted; and it never writes a section a later build wrote. Nothing here touches a
 * cookie, so no request carries the section.
 *
 * @param name - The section's key in `cookieName`.
 * @param section - The section's definition from `@taucad/preferences`.
 * @returns The section store.
 */
export const createSectionStore = <T extends { version: number }, Write>(
  name: CookieName,
  section: SectionDefinition<T, Write>,
): SectionStore<T, Write> => {
  const key = `${metaConfig.cookiePrefix}${name}`;
  const changes = new Topic<void>({ name: `preference-section:${name}` });
  /** Writes this tab could not store, applied over what is stored until the tab closes. */
  const pending: Write[] = [];
  let snapshot: Snapshot<T> | undefined;

  const notify = (): void => {
    changes.emit();
  };

  const read = (): T => {
    const raw = getRaw(key);
    if (snapshot !== undefined && snapshot.raw === raw && snapshot.pending === pending.length) {
      return snapshot.value;
    }
    const stored = readSection(section, raw).value;
    let value = stored;
    for (const write of pending) {
      value = section.schema.parse(section.merge(value, write));
    }
    snapshot = { raw, pending: pending.length, value };
    return value;
  };

  const write = (next: Write): SectionWriteResult => {
    // Merge every write this tab still holds, then this one, into the text stored right now.
    let raw = getRaw(key);
    let isNewer = false;
    for (const each of [...pending, next]) {
      const prepared = prepareSectionWrite(section, raw, each);
      if (prepared.status === 'newer') {
        isNewer = true;
        break;
      }
      raw = prepared.raw;
    }
    let result: SectionWriteResult = 'newer';
    if (!isNewer && raw !== undefined) {
      result = setRaw(key, raw) ? 'saved' : 'refused';
    }
    if (result === 'saved') {
      pending.length = 0;
    } else {
      pending.push(next);
    }
    notify();
    return result;
  };

  const onStorage = (event: StorageEvent): void => {
    if (event.key === null || event.key === key) {
      notify();
    }
  };

  const subscribe = (listener: () => void): (() => void) => {
    if (changes.size === 0 && typeof globalThis.addEventListener === 'function') {
      globalThis.addEventListener('storage', onStorage);
    }
    const unsubscribe = changes.subscribe(listener);
    return () => {
      unsubscribe();
      if (changes.size === 0 && typeof globalThis.removeEventListener === 'function') {
        globalThis.removeEventListener('storage', onStorage);
      }
    };
  };

  return { read, readInitial: () => section.empty, write, subscribe };
};
