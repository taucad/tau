import { createContext, useCallback, useContext, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  captureHandOff,
  installHandOffTracker,
  isHandOffComposing,
  recordInputAccepted,
} from '#components/hand-off/hand-off.js';
import type { HandOffElement, HandOffOptions, HandOffSnapshot } from '#components/hand-off/hand-off.js';

/**
 * The page's hand-off surfaces: one native input per surface per load (P4 identity).
 *
 * A surface whose placeholder may be mounted and unmounted several times before its adopter arrives keeps one native
 * input for the whole load. (The project composer's placeholder is the persistent workspace frame's composer box, one
 * mount per load; a client move to another project mounts the next project's.) Each placeholder hosts a {@link HandOffSlot}; the store moves the one element into the
 * newest mounted slot and restores its caret and focus there, so the text, its order and the person's place in it
 * survive every remount. The adopter takes it over once, through {@link useHandOffAdoption}.
 *
 * @module
 */

/** The surfaces that serve a native input before their adopter, with the recorder's choices for each. */
export const handOffSurfaces = {
  /** The project's main composer: Enter queues a send, as the rich composer sends on Enter. */
  'project-composer': { queueSubmit: true },
} as const satisfies Record<string, HandOffOptions>;

/** A surface name. */
export type HandOffSurface = keyof typeof handOffSurfaces;

/**
 * A surface for one owner, such as one project: text served for one scope is never offered to another's placeholder
 * or adopter, so a client navigation before adoption starts over instead of carrying the text across.
 */
export type HandOffTarget = { readonly surface: HandOffSurface; readonly scope: string };

/** What an adoption attempt found. */
export type HandOffAdoption =
  | { readonly kind: 'none' }
  | { readonly kind: 'pending' }
  | { readonly kind: 'adopted'; readonly snapshot: HandOffSnapshot };

type Place = {
  focused: boolean;
  start: number;
  end: number;
  direction: 'forward' | 'backward' | 'none';
  scrollTop: number;
};

type Entry = {
  /** Whom the element's text was typed for. */
  scope: string | undefined;
  element: HandOffElement | undefined;
  /** Mounted slots, oldest first; the element lives in the last. */
  hosts: HTMLElement[];
  /** Where the person was when the element last left the document. */
  place: Place | undefined;
  /** The adopter of {@link Entry.scope} has taken the input. */
  adopted: boolean;
  version: number;
  listeners: Set<() => void>;
};

const createEntry = (): Entry => ({
  scope: undefined,
  element: undefined,
  hosts: [],
  place: undefined,
  adopted: false,
  version: 0,
  listeners: new Set(),
});

const readPlace = (element: HandOffElement): Place => ({
  focused: document.activeElement === element,
  start: element.selectionStart,
  end: element.selectionEnd,
  direction: element.selectionDirection,
  scrollTop: element.scrollTop,
});

/**
 * Put the person back where they were: caret and scroll always, and focus, without scrolling the page, only when it
 * had it and nothing else took it meanwhile.
 */
const restorePlace = (element: HandOffElement, place: Place | undefined): void => {
  if (place === undefined) {
    return;
  }
  element.setSelectionRange(place.start, place.end, place.direction);
  element.scrollTop = place.scrollTop;
  const active = document.activeElement;
  if (place.focused && (active === null || active === document.body)) {
    element.focus({ preventScroll: true });
  }
};

/** Move the element into `host`, in place of the throwaway input a client-mounted slot renders. */
const placeInto = (entry: Entry, element: HandOffElement, host: HTMLElement): void => {
  if (host.contains(element)) {
    return;
  }
  const place = element.isConnected ? readPlace(element) : entry.place;
  const stand = host.querySelector('textarea');
  if (stand === null) {
    host.prepend(element);
  } else {
    stand.replaceWith(element);
  }
  restorePlace(element, place);
};

/**
 * Create a store. The app uses the page's one, {@link handOffStore}.
 *
 * @returns The store.
 */
export const createHandOffStore = (): {
  attach: (target: HandOffTarget, host: HTMLElement) => void;
  detach: (surface: HandOffSurface, host: HTMLElement) => void;
  adopt: (target: HandOffTarget) => HandOffAdoption;
  holds: (target: HandOffTarget) => boolean;
  isAdopted: (target: HandOffTarget) => boolean;
  version: (surface: HandOffSurface) => number;
  subscribe: (surface: HandOffSurface, listener: () => void) => () => void;
  reset: () => void;
} => {
  const entries = new Map<HandOffSurface, Entry>();
  const entryOf = (surface: HandOffSurface): Entry => {
    let entry = entries.get(surface);
    if (entry === undefined) {
      entry = createEntry();
      entries.set(surface, entry);
    }
    return entry;
  };
  const notify = (entry: Entry): void => {
    entry.version++;
    for (const listener of entry.listeners) {
      listener();
    }
  };

  return {
    /**
     * A slot mounted: the first one's input becomes the surface's, every later one for the same scope receives it.
     * A slot for another scope drops the unadopted input and starts over with its own, even after the last scope's
     * adoption.
     */
    attach: ({ surface, scope }, host) => {
      const entry = entryOf(surface);
      if (entry.scope === scope && entry.adopted) {
        return;
      }
      if (entry.scope !== scope) {
        const previous = entry.element;
        if (previous !== undefined && host.contains(previous)) {
          /* The same slot, now for another scope: an empty input with the same attributes takes the old one's place
           * (a clone would copy the value). */
          const fresh = document.createElement('textarea');
          for (const attribute of previous.attributes) {
            fresh.setAttribute(attribute.name, attribute.value);
          }
          previous.replaceWith(fresh);
        } else {
          previous?.remove();
        }
        entry.scope = scope;
        entry.element = undefined;
        entry.hosts = [];
        entry.place = undefined;
        if (entry.adopted) {
          entry.adopted = false;
          notify(entry);
        }
      }
      entry.hosts.push(host);
      if (entry.element === undefined) {
        const served = host.querySelector('textarea');
        if (served === null) {
          return;
        }
        const element = served as HandOffElement;
        installHandOffTracker(element, handOffSurfaces[surface]);
        /* An adoption that waited on a composition retries when it closes. */
        element.addEventListener('compositionend', () => {
          queueMicrotask(() => {
            notify(entry);
          });
        });
        entry.element = element;
      } else {
        placeInto(entry, entry.element, host);
      }
      recordInputAccepted();
    },
    /** A slot is about to leave the document: remember the person's place, or hand the input to a slot still standing. */
    detach: (surface, host) => {
      const entry = entryOf(surface);
      entry.hosts = entry.hosts.filter((candidate) => candidate !== host);
      const { element } = entry;
      if (element === undefined || !host.contains(element)) {
        return;
      }
      entry.place = readPlace(element);
      const remaining = entry.hosts.at(-1);
      if (remaining !== undefined) {
        placeInto(entry, element, remaining);
      } else if (element.tauHandOff?.composing === true) {
        /* The composition cannot go on outside the document: an adoption waiting on it tries again. */
        notify(entry);
      }
    },
    adopt: ({ surface, scope }) => {
      const entry = entryOf(surface);
      const { element } = entry;
      if (entry.adopted || element === undefined || entry.scope !== scope) {
        return { kind: 'none' };
      }
      if (isHandOffComposing(element)) {
        return { kind: 'pending' };
      }
      const snapshot = captureHandOff(element, entry.place?.focused);
      entry.adopted = true;
      entry.element = undefined;
      entry.hosts = [];
      element.remove();
      notify(entry);
      return { kind: 'adopted', snapshot };
    },
    /** Whether an input served for this scope is waiting for its adopter. */
    holds: ({ surface, scope }) => {
      const entry = entryOf(surface);
      return entry.element !== undefined && entry.scope === scope;
    },
    isAdopted: ({ surface, scope }) => {
      const entry = entryOf(surface);
      return entry.adopted && entry.scope === scope;
    },
    version: (surface) => entryOf(surface).version,
    subscribe: (surface, listener) => {
      const { listeners } = entryOf(surface);
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    reset: () => {
      entries.clear();
    },
  };
};

/** The page's store. */
export const handOffStore = createHandOffStore();

/** Test seam: start from a page with nothing served. */
export const resetHandOffStoreForTest = (): void => {
  handOffStore.reset();
};

const neverAdopted = (): boolean => false;

/**
 * Whether a surface's native input has been adopted for a scope, for its slots. The server and the hydrating render
 * say no.
 *
 * @param target - The surface and scope.
 * @returns Whether the scope's adopter has taken it.
 */
export function useHandOffAdopted({ surface, scope }: HandOffTarget): boolean {
  const subscribe = useCallback((listener: () => void) => handOffStore.subscribe(surface, listener), [surface]);
  return useSyncExternalStore(subscribe, () => handOffStore.isAdopted({ surface, scope }), neverAdopted);
}

/**
 * Whether the adopters below are shown. A host whose adopter mounts before it can be seen or typed into, such as the
 * desktop workspace's panes before the split view's first layout (`content-visibility: hidden`), says no until then:
 * the native input stays the one to type in, and the adoption runs in the commit that shows the adopter.
 */
export const handOffRevealContext = createContext(true);

/** The adopter's view: still waiting on an open composition, or done with what was handed over, if anything. */
export type HandOffAdoptionState =
  | { readonly kind: 'waiting' }
  | { readonly kind: 'done'; readonly snapshot: HandOffSnapshot | undefined };

const noVersion = (): number => 0;

const initialAdoptionState = (scope: string | undefined): HandOffAdoptionState =>
  scope === undefined ? { kind: 'done', snapshot: undefined } : { kind: 'waiting' };
const noSubscription = (): (() => void) => () => undefined;

/**
 * Adopt a surface's native input, served for the same scope, when the rich surface mounts.
 *
 * The attempt runs in a layout effect and its result re-renders before the browser paints or delivers another key,
 * so the snapshot and the rich surface's first commit are one step: nothing typed between them is lost. While a
 * composition is open the state stays `waiting`, and the attempt runs again when it closes. Behind a host that is not
 * shown yet ({@link handOffRevealContext}) a served input also keeps the state `waiting`, and the attempt runs in the
 * commit that shows the adopter; with nothing served there is nothing to wait for. A move to another scope starts over.
 *
 * @param target - The surface and scope to adopt, or undefined for a mount that adopts nothing.
 * @param onAdopted - Called once with the snapshot, before the rich surface renders it; it moves the text into its
 *   owner.
 * @returns The adoption state.
 */
export function useHandOffAdoption(
  target: HandOffTarget | undefined,
  onAdopted: (snapshot: HandOffSnapshot) => void,
): HandOffAdoptionState {
  const surface = target?.surface;
  const scope = target?.scope;
  const subscribe = useCallback(
    (listener: () => void) => (surface === undefined ? noSubscription() : handOffStore.subscribe(surface, listener)),
    [surface],
  );
  const version = useSyncExternalStore(
    subscribe,
    () => (surface === undefined ? 0 : handOffStore.version(surface)),
    noVersion,
  );
  const isShown = useContext(handOffRevealContext);
  /* The state is the scope's: a move to another scope waits again, for that scope's input. */
  const [scoped, setScoped] = useState<{ readonly scope: string | undefined; readonly state: HandOffAdoptionState }>(
    () => ({ scope, state: initialAdoptionState(scope) }),
  );
  const state = scoped.scope === scope ? scoped.state : initialAdoptionState(scope);
  const isWaiting = state.kind === 'waiting';
  /* The scope and store version this mount last tried at: a closed composition bumps the version, a move to another
   * scope changes the scope, and either runs the attempt again. */
  const lastAttempt = useRef<{ readonly scope: string; readonly version: number } | undefined>(undefined);
  useLayoutEffect(() => {
    if (
      !isWaiting ||
      surface === undefined ||
      scope === undefined ||
      (lastAttempt.current?.scope === scope && lastAttempt.current.version === version) ||
      (!isShown && handOffStore.holds({ surface, scope }))
    ) {
      return;
    }
    lastAttempt.current = { scope, version };
    const adoption = handOffStore.adopt({ surface, scope });
    if (adoption.kind === 'pending') {
      return;
    }
    if (adoption.kind === 'adopted') {
      onAdopted(adoption.snapshot);
    }
    // oxlint-disable-next-line react/set-state-in-effect -- A layout-effect update renders before paint, so the snapshot and the rich surface commit as one step.
    setScoped({
      scope,
      state: { kind: 'done', snapshot: adoption.kind === 'adopted' ? adoption.snapshot : undefined },
    });
  }, [isWaiting, isShown, surface, scope, version, onAdopted]);
  return state;
}
