/**
 * This browser's stable identity among the devices writing one workspace.
 *
 * A document, not a person: the same browser profile keeps one id across
 * reloads, and two browsers — or two people on one machine — are two devices.
 * The page sends it to the file-manager worker (`setDeviceId`), and it does
 * two things there. First, a worker that holds it records chat refs; one that
 * does not writes none. Second, it counts as one of this host's own devices,
 * so a chat segment written under it before record devices existed is never
 * projected back as another device's. It names no pushed record: chat
 * segments, conflict lines and the operation log use a random record device
 * per actor form (`packages/revisions/src/ops-ref.ts`, EQ10). A signed-out
 * pseudonym derives from a separate random salt (`revision-actor.ts`).
 *
 * It is a local identifier and nothing else: never sent anywhere on its own,
 * never derived from hardware, and regenerated the moment a person clears their
 * site data — which is exactly what "forget this device" should mean.
 */

import { randomUuid } from '@taucad/utils/id';

/** Where the id lives; one per browser profile, not per workspace. @public */
export const deviceIdStorageKey = 'tau-device-id';

/**
 * The id for this browser, created on first use.
 *
 * Read rather than memoized, so clearing site data takes effect without a
 * reload and a test can stand in as a second device.
 *
 * @returns This device's id, or a fresh per-call one when storage is unavailable.
 * @public
 */
export const deviceId = (): string => {
  try {
    const stored = globalThis.localStorage.getItem(deviceIdStorageKey);
    if (stored !== null && stored !== '') {
      return stored;
    }
    const minted = randomUuid();
    globalThis.localStorage.setItem(deviceIdStorageKey, minted);
    return minted;
  } catch {
    /* A private window with storage denied is a device that forgets itself
     * between page loads; within one load it is still one device. */
    return randomUuid();
  }
};
