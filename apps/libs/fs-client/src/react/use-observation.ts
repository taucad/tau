import { useCallback, useEffect, useSyncExternalStore } from 'react';
import type { ObservationService, ObservationSnapshot } from '#observation-service.js';

/**
 * No observation has started: the service does not exist yet (server render, early hydration),
 * or it is idle between its last release and this consumer's acquisition. `closed` is reserved
 * for an observation that actually closed, so consumers can treat it as a failure.
 */
const notStarted: ObservationSnapshot<never> = { status: 'registering' };
const subscribeAbsent = (): (() => void) => () => undefined;
const snapshotAbsent = (): ObservationSnapshot<never> => notStarted;

/**
 * Read a service's snapshot as a consumer that is about to acquire it.
 * A released service reports `closed` until its next acquisition restarts it; that is not a
 * close this consumer can observe, so it reads as not started. A disposed service stays `closed`.
 * @param service - Resource owner.
 * @returns The service's snapshot, or the not-started snapshot while it is idle.
 */
function readSnapshot<T>(service: ObservationService<T>): ObservationSnapshot<T> {
  const snapshot = service.getSnapshot();
  return snapshot.status === 'closed' && service.activeLeaseCount === 0 && !service.isDisposed ? notStarted : snapshot;
}

/**
 * Select a service-owned projection and acquire its shared I/O after commit.
 * Subscription is installed by useSyncExternalStore before the acquisition.
 * Before the service exists, on the server, and while it is idle, the status is `registering`;
 * `closed` only reports an observation that closed.
 * @param service - Resource owner, or undefined before it is available.
 * @returns Stable value and explicit lifecycle status.
 * @public
 */
export function useObservation<T>(service: ObservationService<T> | undefined): ObservationSnapshot<T> {
  const getSnapshot = useCallback(
    (): ObservationSnapshot<T> => (service ? readSnapshot(service) : notStarted),
    [service],
  );
  const snapshot = useSyncExternalStore(service?.subscribe ?? subscribeAbsent, getSnapshot, snapshotAbsent);
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
