import { useSyncExternalStore } from 'react';
import * as Cookies from 'es-cookie';
import { z } from 'zod';
import { Topic } from '@taucad/events';

/**
 * Client facts: the last-known view facts of this device, applied to `<html>` before first paint (progressive loading
 * architecture P2; loading-states blueprint GM2).
 *
 * One versioned record in `localStorage`, written by each fact's owner through {@link writeClientFacts}, and one inline
 * head script ({@link clientFactsScript}) that turns it into classes, attributes and CSS variables on `<html>` before
 * the body parses. The server reads none of it, so the document's markup is the same for every visitor and the facts
 * that change what is visible are carried by CSS keyed on those attributes. React reads the record with
 * {@link useClientFact}, whose server snapshot is the neutral default, so hydration agrees by construction; a fact
 * React renders onto `<html>` itself is read with {@link useDocumentFact}, which hydrates with the stored value the
 * head script already applied.
 */

/** The `localStorage` key holding the record. */
export const clientFactsStorageKey = 'tau-client-facts';

const recordVersion = 1;

/** The app theme names, as `#hooks/use-theme` defines them; `system` follows the operating system. */
const themeNames = ['light', 'dark', 'black', 'high-contrast'] as const;

/** The facts, all optional: an absent fact is unknown and renders as the neutral default. */
const clientFactsSchema = z.object({
  /** The theme choice; absent until the person, or the one-time cookie migration, settles it. */
  theme: z.enum([...themeNames, 'system']).optional(),
  /** Whether the desktop sidebar was open when last left. */
  sidebarOpen: z.boolean().optional(),
  /** The pointer-cursors preference. */
  pointerCursors: z.boolean().optional(),
});

/** The client facts. @public */
export type ClientFacts = z.infer<typeof clientFactsSchema>;

const recordSchema = clientFactsSchema.extend({ v: z.literal(recordVersion) });

/** What the server renders and the hydrating render agrees with: nothing known. */
const neutralFacts: ClientFacts = {};

const changes = new Topic<void>({ name: 'client-facts' });
let cached: ClientFacts | undefined;

const readStoredFacts = (): ClientFacts => {
  try {
    const raw = globalThis.localStorage.getItem(clientFactsStorageKey);
    const parsed = recordSchema.safeParse(raw === null ? undefined : JSON.parse(raw));
    if (parsed.success) {
      const { v: _version, ...facts } = parsed.data;
      return facts;
    }
  } catch {
    // Blocked storage or a corrupt record reads as nothing known.
  }
  return neutralFacts;
};

/**
 * Read the record.
 *
 * @returns The stored facts, or none outside a document.
 */
export const readClientFacts = (): ClientFacts => {
  if (typeof document === 'undefined') {
    return neutralFacts;
  }
  cached ??= readStoredFacts();
  return cached;
};

/**
 * Apply the facts to `<html>`, as the head script does before first paint. Keep the two in step: the parity test runs
 * both over the facts matrix.
 *
 * @param facts - The facts to apply.
 * @param root - The document element.
 * @param prefersLight - Whether the operating system prefers a light scheme.
 */
export const applyClientFacts = (facts: ClientFacts, root: HTMLElement, prefersLight: boolean): void => {
  const theme = facts.theme === undefined || facts.theme === 'system' ? (prefersLight ? 'light' : 'dark') : facts.theme;
  root.classList.remove(...themeNames);
  if (theme === 'black' || theme === 'high-contrast') {
    root.classList.add('dark');
  }
  root.classList.add(theme);
  root.toggleAttribute('data-sidebar-closed', facts.sidebarOpen === false);
  if (facts.pointerCursors === true) {
    root.dataset['pointerCursors'] = 'true';
  } else {
    delete root.dataset['pointerCursors'];
  }
};

const prefersLightMediaQuery = '(prefers-color-scheme: light)';

const applyToDocument = (facts: ClientFacts): void => {
  applyClientFacts(facts, document.documentElement, globalThis.matchMedia(prefersLightMediaQuery).matches);
};

/**
 * Write facts. Each owner writes only its own; the rest are kept. The record is stored, applied to `<html>` and
 * announced in this tab; other tabs follow through the `storage` event.
 *
 * @param facts - The facts to set; `undefined` forgets one.
 */
export const writeClientFacts = (facts: { readonly [K in keyof ClientFacts]?: ClientFacts[K] | undefined }): void => {
  if (typeof document === 'undefined') {
    return;
  }
  const merged: Record<string, unknown> = { ...readClientFacts(), ...facts };
  const next = Object.fromEntries(Object.entries(merged).filter(([, value]) => value !== undefined)) as ClientFacts;
  cached = next;
  try {
    globalThis.localStorage.setItem(clientFactsStorageKey, JSON.stringify({ v: recordVersion, ...next }));
  } catch {
    // Best effort: this page keeps the facts in memory.
  }
  applyToDocument(next);
  changes.emit();
};

/** Forget the cached read, so the next one reads storage; tests reset storage between cases. */
export const forgetClientFacts = (): void => {
  cached = undefined;
};

/**
 * Hear of any change to the record, from this tab or another.
 *
 * @param listener - Called after the record changes.
 * @returns The unsubscribe.
 */
export const subscribeClientFacts = (listener: () => void): (() => void) => changes.subscribe(listener);

/** Cookies the server read for presentation before the record; expired once by {@link retireLegacyFactCookies}. */
const legacyFactCookies = ['tau-shell-op-sidebar', 'tau-layout-flags', 'tau-chat-model', 'tau-chat-effort'] as const;

/** Expire the presentation cookies the record replaced, so they stop riding every request. */
export const retireLegacyFactCookies = (): void => {
  if (typeof document === 'undefined') {
    return;
  }
  for (const name of legacyFactCookies) {
    if (Cookies.get(name) !== undefined) {
      Cookies.remove(name, { path: '/' });
    }
  }
};

/* Another tab's write: re-read, re-apply and announce. One listener for the module's lifetime. */
if (typeof document !== 'undefined') {
  globalThis.addEventListener('storage', (event: StorageEvent) => {
    if (event.key !== null && event.key !== clientFactsStorageKey) {
      return;
    }
    cached = readStoredFacts();
    applyToDocument(cached);
    changes.emit();
  });
  retireLegacyFactCookies();
}

/**
 * Read one fact for something rendered inside `<body>`. The server and the hydrating render see it as unknown, so
 * the markup is visitor-neutral and hydration agrees; React re-renders with the stored value right after. A visible
 * difference must therefore be carried by CSS from the `<html>` attribute the head script set.
 *
 * @param key - The fact.
 * @returns The stored value, or `undefined` while unknown.
 */
export function useClientFact<K extends keyof ClientFacts>(key: K): ClientFacts[K] {
  return useSyncExternalStore(
    subscribeClientFacts,
    () => readClientFacts()[key],
    () => undefined,
  );
}

/**
 * Read one fact for a prop React renders on `<html>`. The head script applied the stored value before hydration, so
 * the hydrating render reads the same value and matches the document; the server renders the neutral default.
 *
 * @param key - The fact.
 * @returns The stored value, or `undefined` while unknown.
 */
export function useDocumentFact<K extends keyof ClientFacts>(key: K): ClientFacts[K] {
  const read = (): ClientFacts[K] => readClientFacts()[key];
  return useSyncExternalStore(subscribeClientFacts, read, read);
}

/** Pre-record stores the head script folds into the record once: their facts survive the release without a flash. */
const legacyKeys = {
  /** The desktop theme key: a theme name or `system`. */
  theme: 'tau-theme',
  /** `useCookie(cookieName.sidebarOp)`: JSON boolean. */
  sidebarOpen: 'tau-sidebar-op',
  /** `useCookie(cookieName.pointerCursors)`: JSON boolean. */
  pointerCursors: 'tau-pointer-cursors',
} as const;

/**
 * The inline head script. It reads only the record, `matchMedia` and nothing else, never throws, and leaves the
 * neutral default when storage fails. On the first load with no record it folds the {@link legacyKeys} stores in.
 * Keep it in step with {@link applyClientFacts}.
 */
export const clientFactsScript = String.raw`(function(){try{
var d=document.documentElement,s=window.localStorage,k=${JSON.stringify(clientFactsStorageKey)},f=null;
try{f=JSON.parse(s.getItem(k))}catch(e){}
if(!f||f.v!==${recordVersion}){f={v:${recordVersion}};
try{var t=s.getItem(${JSON.stringify(legacyKeys.theme)});if(t)f.theme=t;
var o=JSON.parse(s.getItem(${JSON.stringify(legacyKeys.sidebarOpen)}));if(typeof o==="boolean")f.sidebarOpen=o;
var p=JSON.parse(s.getItem(${JSON.stringify(legacyKeys.pointerCursors)}));if(typeof p==="boolean")f.pointerCursors=p;
s.setItem(k,JSON.stringify(f));s.removeItem(${JSON.stringify(legacyKeys.theme)});s.removeItem(${JSON.stringify(legacyKeys.sidebarOpen)});s.removeItem(${JSON.stringify(legacyKeys.pointerCursors)})}catch(e){}}
var n=${JSON.stringify(themeNames)},a=n.indexOf(f.theme)<0?(window.matchMedia(${JSON.stringify(prefersLightMediaQuery)}).matches?"light":"dark"):f.theme;
if(a==="black"||a==="high-contrast")d.classList.add("dark");
d.classList.add(a);
if(f.sidebarOpen===false)d.setAttribute("data-sidebar-closed","");
if(f.pointerCursors===true)d.setAttribute("data-pointer-cursors","true");
}catch(e){}})();`;
