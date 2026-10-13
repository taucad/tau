import { useEffect, useRef } from 'react';
import type { RevisionStatusProjection } from '@taucad/revisions';
import { useProject } from '#hooks/use-project.js';
import { useRevisionCommands, useRevisionStatus } from '#hooks/use-revision-status.js';

const storageKey = (projectId: string): string => `tau:revisions-pin:${projectId}`;

/* Storage can be absent or refuse (a private window, cleared site data): the pin is then only lost on reload. */
const readPin = (projectId: string): string | undefined => {
  try {
    return globalThis.localStorage.getItem(storageKey(projectId)) ?? undefined;
  } catch {
    return undefined;
  }
};

const writePin = (projectId: string, checkoutId: string | undefined): void => {
  try {
    if (checkoutId === undefined) {
      globalThis.localStorage.removeItem(storageKey(projectId));
    } else {
      globalThis.localStorage.setItem(storageKey(projectId), checkoutId);
    }
  } catch {
    // The pin still holds for this session when storage is unavailable.
  }
};

/**
 * The linked checkout a person *Switch*ed the workbench to, if that is where it is.
 *
 * Only a pin is remembered. The live checkout is the project directory, so a
 * branch applied to it is already on disk after a reload, and following a chat
 * is that chat's placement rather than a choice of this device.
 *
 * @param status - The current projection.
 * @returns The pinned linked checkout, or `undefined`.
 */
const pinnedLinkedCheckout = (status: RevisionStatusProjection): string | undefined =>
  status.follow === 'pinned' && status.liveCheckoutId !== undefined && status.checkoutId !== status.liveCheckoutId
    ? status.checkoutId
    : undefined;

/**
 * Keep the workbench's *Switch* pin across a reload, per project (R22).
 *
 * The selection belongs to `project-revisions.machine`, which a reload starts
 * again on the live checkout. This device remembers the linked checkout it was
 * pinned to and, once the registry has answered, pins it again with the
 * machine's own `pinTo` verb. A remembered checkout the registry no longer
 * lists (its branch was discarded, merged away or removed on another tab) is
 * forgotten and the workbench stays on the live checkout; the machine refuses
 * such a pin as well, so a listing that changes in between cannot strand it.
 *
 * Mount once per project, beside the component that re-roots the workbench,
 * so the pin returns whether or not the Revisions pane is open.
 */
export function useRevisionPinMemory(): void {
  const { projectId } = useProject();
  const status = useRevisionStatus();
  const { pinTo } = useRevisionCommands();
  /* The project whose remembered pin was already offered, so it is offered once per load. */
  const restoredFor = useRef<string | undefined>(undefined);
  const isCurrent = status !== undefined && status.projectId === projectId && status.registrySettled;
  const pinned = isCurrent ? pinnedLinkedCheckout(status) : undefined;
  const selected = isCurrent ? status.checkoutId : undefined;
  const listedIds = isCurrent
    ? status.branches.flatMap((row) => (row.checkoutId === undefined ? [] : [row.checkoutId])).join(' ')
    : '';

  useEffect(() => {
    if (!isCurrent) {
      return;
    }
    if (restoredFor.current !== projectId) {
      restoredFor.current = projectId;
      const remembered = readPin(projectId);
      if (remembered !== undefined && remembered !== selected) {
        if (listedIds.split(' ').includes(remembered)) {
          pinTo(remembered);
        } else {
          writePin(projectId, undefined);
        }
        /* The pin's own projection is recorded when it lands. */
        return;
      }
    }
    writePin(projectId, pinned);
  }, [isCurrent, listedIds, pinTo, pinned, projectId, selected]);
}
