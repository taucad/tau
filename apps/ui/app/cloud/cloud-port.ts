import { useCallback, useSyncExternalStore } from 'react';
import { Topic } from '@taucad/events';
import { createAskDeadlines } from '#lib/ask-deadline.js';
import type { AskDeadlineTimer } from '#lib/ask-deadline.js';

/**
 * The Cloud port (adaptive app deployment mode charter D6, I4): plan facts as data, stored per financial identity and
 * read for the current one. A lazily loaded bridge, mounted only while the mode is `funded`, publishes what the real
 * hooks computed; a facade reads the entry for its identity, or nothing, which every facade treats as unresolved.
 * Part of Core: static in an adaptive build, and never reached from a pinned one (I10).
 */

/** The financial identity a fact was computed for: origin, environment and owner (D6). @public */
export type CloudIdentity = Readonly<{ apiBaseUrl: string; environment: string; ownerId: string }>;

/**
 * One identity as a map key.
 *
 * @param identity - The identity.
 * @returns Its key.
 * @public
 */
export const cloudIdentityKey = (identity: CloudIdentity): string =>
  JSON.stringify([identity.apiBaseUrl, identity.environment, identity.ownerId]);

/** The facts one identity holds, by name. Data only, never closures (D6). @public */
export type CloudFacts = Readonly<Record<string, unknown>>;

/** The port's store. @public */
export type CloudPortStore = Readonly<{
  /**
   * Bind the page's current identity, or none: what a fact used outside render reads when it is called (I4). Binding
   * an identity with no facts yet starts its wait, which reads `unavailable` after the deadline (I15).
   */
  bind: (identityKey: string | undefined) => void;
  /** The bound identity's key, read when a callable fact is called (I4). */
  current: () => string | undefined;
  /** The person's Retry: the identity's wait starts its deadline again. */
  recheck: (identityKey: string | undefined) => void;
  /** Whether a bound identity still waits within its deadline (`checking`) or has outlived it (`unavailable`). */
  wait: (identityKey: string | undefined) => 'checking' | 'unavailable';
  /** The facts published for an identity, or `undefined`. */
  read: (identityKey: string | undefined) => CloudFacts | undefined;
  /** Publish an identity's facts, replacing what it held. */
  publish: (identityKey: string, facts: CloudFacts) => void;
  /** Forget one identity, or every identity. */
  clear: (identityKey?: string) => void;
  subscribe: (listener: () => void) => () => void;
}>;

/**
 * A port store.
 *
 * @returns The store.
 * @public
 */
export const createCloudPortStore = (timer?: AskDeadlineTimer): CloudPortStore => {
  const entries = new Map<string, CloudFacts>();
  const changed = new Topic<void>({ name: 'cloud-port' });
  const deadlines = createAskDeadlines(timer);
  let bound: string | undefined;
  return {
    bind: (identityKey) => {
      if (identityKey === bound) {
        return;
      }
      if (bound !== undefined && !deadlines.expired(bound)) {
        deadlines.cancel(bound);
      }
      bound = identityKey;
      if (identityKey !== undefined && !entries.has(identityKey)) {
        deadlines.start(identityKey);
      }
      changed.emit(undefined);
    },
    current: () => bound,
    recheck: (identityKey) => {
      if (identityKey !== undefined && !entries.has(identityKey)) {
        deadlines.restart(identityKey);
      }
    },
    wait: (identityKey) => (deadlines.expired(identityKey) ? 'unavailable' : 'checking'),
    read: (identityKey) => (identityKey === undefined ? undefined : entries.get(identityKey)),
    publish: (identityKey, facts) => {
      entries.set(identityKey, facts);
      changed.emit(undefined);
    },
    clear: (identityKey) => {
      if (identityKey === undefined) {
        entries.clear();
        deadlines.cancel();
      } else {
        entries.delete(identityKey);
      }
      changed.emit(undefined);
    },
    subscribe: (listener) => {
      const offPort = changed.subscribe(listener);
      const offDeadlines = deadlines.subscribe(listener);
      return () => {
        offPort();
        offDeadlines();
      };
    },
  };
};

/** The page's one port. @public */
export const cloudPort = createCloudPortStore();

/**
 * The facts for an identity, read through the port's subscription, so a render follows each publish.
 *
 * @param identityKey - The current identity's key, or `undefined` when none is bound.
 * @returns The facts, or `undefined` while none are published for it.
 * @public
 */
export const useCloudFacts = (identityKey: string | undefined): CloudFacts | undefined => {
  const read = useCallback(() => cloudPort.read(identityKey), [identityKey]);
  return useSyncExternalStore(cloudPort.subscribe, read, read);
};
