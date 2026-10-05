import { useEffect, useSyncExternalStore } from 'react';
import type { ObservationService, ObservationSnapshot } from '#observation-service.js';

const absent: ObservationSnapshot<never> = { status: 'closed' };
const subscribeAbsent = (): (() => void) => () => undefined;
const snapshotAbsent = (): ObservationSnapshot<never> => absent;

/**
 * Select a service-owned projection and acquire its shared I/O after commit.
 * Subscription is installed by useSyncExternalStore before the acquisition.
 * @param service - Resource owner, or undefined before it is available.
 * @returns Stable value and explicit lifecycle status.
 * @public
 */
export function useObservation<T>(service: ObservationService<T> | undefined): ObservationSnapshot<T> {
  const snapshot = useSyncExternalStore(
    service?.subscribe ?? subscribeAbsent,
    service?.getSnapshot ?? snapshotAbsent,
    snapshotAbsent,
  );
  useEffect(() => {
    const lease = service?.acquire();
    return () => lease?.release();
  }, [service]);
  return snapshot;
}

const valueAbsent = (): undefined => undefined;

/**
 * Select only the decoded value, avoiding renders for lifecycle-only changes.
 * @param service - Shared resource owner.
 * @returns The current decoded value, or undefined before publication.
 * @public
 */
export function useObservationValue<T>(service: ObservationService<T> | undefined): T | undefined {
  const value = useSyncExternalStore(
    service?.subscribe ?? subscribeAbsent,
    () => service?.getSnapshot().value,
    valueAbsent,
  );
  useEffect(() => {
    const lease = service?.acquire();
    return () => lease?.release();
  }, [service]);
  return value;
}
