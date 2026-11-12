import { createContext, useCallback, useContext, useState, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { Topic } from '@taucad/events';

/**
 * The controls a tour tip can be placed beside. Each tip names a target and the controls that bring that target on
 * screen (its reveal controls); see `tour-steps.ts`.
 */
export const tourAnchorIds = [
  /* The chat composer. */
  'composer',
  /* The main viewer; Look around hangs from its top-left corner. */
  'viewer',
  /* The Parameters pane. */
  'parameters',
  /* A workbench group's "Open workbench tab" menu, which opens the Parameters and Export panes. */
  'workbench-open-tab',
  /* The first transcript activity row whose families include a test run. */
  'activity-test',
  /* The chat lane's transcript, which scrolls a row into view. */
  'chat-lane',
  /* The Export pane's tab in the workbench. */
  'export',
  /* The phone layout's tab-bar entries: one region shows at a time, and Export lives under All. */
  'mobile-tab-chat',
  'mobile-tab-model',
  'mobile-tab-parameters',
  'mobile-tab-all',
] as const;

/** One of {@link tourAnchorIds}. */
export type TourAnchorId = (typeof tourAnchorIds)[number];

/** What the registry knows about the controls on screen. */
export type TourAnchorRegistry = Readonly<{
  /** Register `element` under `id`; the returned function removes it. Several elements may share an id. */
  register: (id: TourAnchorId, element: HTMLElement) => () => void;
  /** The first element registered under `id` in document order (the first transcript row with a test run, say). */
  element: (id: TourAnchorId) => HTMLElement | undefined;
  /** Whether the element under `id` is on screen: connected, laid out, and not clipped away by a scroll container. */
  isVisible: (id: TourAnchorId) => boolean;
  /** Wakes when an anchor is registered, removed, or scrolls in or out of view. */
  subscribe: (listener: () => void) => () => void;
  /** Changes whenever {@link TourAnchorRegistry.subscribe} wakes. */
  version: () => number;
}>;

type Entry = {
  readonly element: HTMLElement;
  isIntersecting: boolean | undefined;
  observer: IntersectionObserver | undefined;
};

const isLaidOut = (element: HTMLElement): boolean =>
  element.isConnected && element.closest('[inert],[hidden]') === null && element.getClientRects().length > 0;

const inDocumentOrder = (left: Entry, right: Entry): number =>
  // oxlint-disable-next-line no-bitwise -- compareDocumentPosition answers with a bit mask.
  left.element.compareDocumentPosition(right.element) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;

/**
 * A registry of the controls the tour can anchor to. Visibility comes from an `IntersectionObserver` in the element's
 * own window, so a control scrolled out of the transcript, or one in a popped-out window, is judged where it lives.
 * Without one (server rendering, some tests) a connected, laid-out element counts as visible.
 *
 * @returns A new registry.
 */
export const createTourAnchorRegistry = (): TourAnchorRegistry => {
  const entries = new Map<TourAnchorId, Entry[]>();
  const changes = new Topic<number>({ name: 'tour.anchors' });
  let version = 0;
  const notify = (): void => {
    version += 1;
    changes.emit(version);
  };
  const first = (id: TourAnchorId): Entry | undefined =>
    (entries.get(id) ?? []).filter((entry) => entry.element.isConnected).toSorted(inDocumentOrder)[0];
  return {
    register: (id, element) => {
      const Observer = element.ownerDocument.defaultView?.IntersectionObserver;
      const entry: Entry = { element, isIntersecting: undefined, observer: undefined };
      if (Observer !== undefined) {
        entry.observer = new Observer((records) => {
          const latest = records.at(-1);
          if (latest !== undefined && latest.isIntersecting !== entry.isIntersecting) {
            entry.isIntersecting = latest.isIntersecting;
            notify();
          }
        });
        entry.observer.observe(element);
      }
      entries.set(id, [...(entries.get(id) ?? []), entry]);
      notify();
      return () => {
        entry.observer?.disconnect();
        entries.set(
          id,
          (entries.get(id) ?? []).filter((other) => other !== entry),
        );
        notify();
      };
    },
    element: (id) => first(id)?.element,
    isVisible: (id) => {
      const entry = first(id);
      if (entry === undefined || !isLaidOut(entry.element)) {
        return false;
      }
      return entry.isIntersecting ?? true;
    },
    subscribe: (listener) =>
      changes.subscribe(() => {
        listener();
      }),
    version: () => version,
  };
};

const TourAnchorContext = createContext<TourAnchorRegistry | undefined>(undefined);

/**
 * Holds the tour's anchor registry for the editor below it.
 *
 * @param properties - The editor.
 * @returns The provider.
 */
export function TourAnchorProvider({ children }: { readonly children: ReactNode }): React.JSX.Element {
  const [registry] = useState(createTourAnchorRegistry);
  return <TourAnchorContext.Provider value={registry}>{children}</TourAnchorContext.Provider>;
}

/**
 * A ref callback that registers its element as a tour anchor. Outside the editor (no provider) it does nothing, so a
 * shared control can carry it everywhere.
 *
 * @param id - The anchor this element is.
 * @returns The ref callback.
 */
export const useTourAnchor = (
  id: TourAnchorId,
  // oxlint-disable-next-line no-restricted-types -- React passes null to a ref callback on detach.
): ((element: HTMLElement | null) => (() => void) | undefined) => {
  const registry = useContext(TourAnchorContext);
  return useCallback(
    // oxlint-disable-next-line no-restricted-types -- React passes null to a ref callback on detach.
    (element: HTMLElement | null) =>
      element === null || registry === undefined ? undefined : registry.register(id, element),
    [id, registry],
  );
};

/**
 * One ref callback that registers its element under several anchors, for a control that is two of them (the composer
 * region is also the chat lane's foot).
 *
 * @param ids - The anchors this element is.
 * @returns The ref callback.
 */
export const useTourAnchors = (
  ...ids: readonly TourAnchorId[]
  // oxlint-disable-next-line no-restricted-types -- React passes null to a ref callback on detach.
): ((element: HTMLElement | null) => (() => void) | undefined) => {
  const registry = useContext(TourAnchorContext);
  const key = ids.join(' ');
  return useCallback(
    // oxlint-disable-next-line no-restricted-types -- React passes null to a ref callback on detach.
    (element: HTMLElement | null) => {
      if (element === null || registry === undefined) {
        return undefined;
      }
      const removals = key.split(' ').map((id) => registry.register(id as TourAnchorId, element));
      return () => {
        for (const remove of removals) {
          remove();
        }
      };
    },
    [key, registry],
  );
};

/**
 * The registry, re-read whenever an anchor is registered, removed, or scrolls in or out of view.
 *
 * @returns The registry, or `undefined` outside the editor.
 */
export const useTourAnchorRegistry = (): TourAnchorRegistry | undefined => {
  const registry = useContext(TourAnchorContext);
  useSyncExternalStore(registry?.subscribe ?? subscribeToNothing, registry?.version ?? zero, zero);
  return registry;
};

const subscribeToNothing = (): (() => void) => () => undefined;
const zero = (): number => 0;
