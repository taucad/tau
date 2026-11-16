import { useCallback, useLayoutEffect, useState, useSyncExternalStore } from 'react';
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
 * A surface whose placeholder is mounted and unmounted several times before its adopter arrives — the project
 * composer passes through the workspace skeleton of each gate on the way to the live workspace — keeps one native
 * input for the whole load. Each placeholder hosts a {@link HandOffSlot}; the store moves the one element into the
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
  element: HandOffElement | undefined;
  /** Mounted slots, oldest first; the element lives in the last. */
  hosts: HTMLElement[];
  /** Where the person was when the element last left the document. */
  place: Place | undefined;
  adopted: boolean;
  version: number;
  listeners: Set<() => void>;
};

const createEntry = (): Entry => ({
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

/** Put the person back where they were: caret, scroll and, if it had it, focus, without scrolling the page. */
const restorePlace = (element: HandOffElement, place: Place | undefined): void => {
  if (place === undefined) {
    return;
  }
  element.setSelectionRange(place.start, place.end, place.direction);
  element.scrollTop = place.scrollTop;
  if (place.focused && document.activeElement !== element) {
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
  attach: (surface: HandOffSurface, host: HTMLElement) => void;
  detach: (surface: HandOffSurface, host: HTMLElement) => void;
  adopt: (surface: HandOffSurface) => HandOffAdoption;
  isAdopted: (surface: HandOffSurface) => boolean;
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
    /** A slot mounted: the first one's input becomes the surface's, every later one receives it. */
    attach: (surface, host) => {
      const entry = entryOf(surface);
      if (entry.adopted) {
        return;
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
      }
    },
    adopt: (surface) => {
      const entry = entryOf(surface);
      const { element } = entry;
      if (entry.adopted || element === undefined) {
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
    isAdopted: (surface) => entryOf(surface).adopted,
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
 * Whether a surface's native input has been adopted, for its slots. The server and the hydrating render say no.
 *
 * @param surface - The surface.
 * @returns Whether the adopter has taken it.
 */
export function useHandOffAdopted(surface: HandOffSurface): boolean {
  const subscribe = useCallback((listener: () => void) => handOffStore.subscribe(surface, listener), [surface]);
  return useSyncExternalStore(subscribe, () => handOffStore.isAdopted(surface), neverAdopted);
}

/** The adopter's view: still waiting on an open composition, or done with what was handed over, if anything. */
export type HandOffAdoptionState =
  | { readonly kind: 'waiting' }
  | { readonly kind: 'done'; readonly snapshot: HandOffSnapshot | undefined };

const noVersion = (): number => 0;
const noSubscription = (): (() => void) => () => undefined;

/**
 * Adopt a surface's native input when the rich surface mounts.
 *
 * The attempt runs in a layout effect and its result re-renders before the browser paints or delivers another key,
 * so the snapshot and the rich surface's first commit are one step: nothing typed between them is lost. While a
 * composition is open the state stays `waiting`, and the attempt runs again when it closes.
 *
 * @param surface - The surface to adopt, or undefined for a mount that adopts nothing.
 * @param onAdopted - Called once with the snapshot, before the rich surface renders it; it moves the text into its
 *   owner.
 * @returns The adoption state.
 */
export function useHandOffAdoption(
  surface: HandOffSurface | undefined,
  onAdopted: (snapshot: HandOffSnapshot) => void,
): HandOffAdoptionState {
  const subscribe = useCallback(
    (listener: () => void) => (surface === undefined ? noSubscription() : handOffStore.subscribe(surface, listener)),
    [surface],
  );
  const version = useSyncExternalStore(
    subscribe,
    () => (surface === undefined ? 0 : handOffStore.version(surface)),
    noVersion,
  );
  const [state, setState] = useState<HandOffAdoptionState>(() =>
    surface === undefined ? { kind: 'done', snapshot: undefined } : { kind: 'waiting' },
  );
  const isWaiting = state.kind === 'waiting';
  useLayoutEffect(() => {
    if (!isWaiting || surface === undefined) {
      return;
    }
    const adoption = handOffStore.adopt(surface);
    if (adoption.kind === 'pending') {
      return;
    }
    if (adoption.kind === 'adopted') {
      onAdopted(adoption.snapshot);
    }
    // oxlint-disable-next-line react/set-state-in-effect -- A layout-effect update renders before paint, so the snapshot and the rich surface commit as one step.
    setState({ kind: 'done', snapshot: adoption.kind === 'adopted' ? adoption.snapshot : undefined });
  }, [isWaiting, surface, version, onAdopted]);
  return state;
}
