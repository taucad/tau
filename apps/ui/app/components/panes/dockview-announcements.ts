/**
 * What a Tau Dockview says to assistive technology. Dockview narrates every panel it adds or removes in its own live
 * regions, naming a panel by its title or, without one, by its raw id ("v-1a2b3c4d opened"). Tau speaks only for the
 * person's own changes: an arrangement the app lands (a layout record's apply, the seeded tab of a fresh dock) is no
 * news, and while a project opens the open speaks once, in `ProjectSyncAnnouncement` (progressive-loading rule 22).
 *
 * @module
 */
import type { DockviewApi, LiveRegionEvent } from 'dockview-react';

/** How deep each dock (by its component id) is in a programmatic change. */
const quietDepth = new Map<string, number>();

/**
 * Make a programmatic change to a dock without Dockview announcing the panels it opens or closes.
 *
 * @param api - The dock the change is made to.
 * @param change - The synchronous change; Dockview announces as it mutates, so the change must not defer its work.
 * @returns What `change` returns.
 */
export function changeQuietly<T>(api: DockviewApi, change: () => T): T {
  const { id } = api;
  quietDepth.set(id, (quietDepth.get(id) ?? 0) + 1);
  try {
    return change();
  } finally {
    const depth = (quietDepth.get(id) ?? 1) - 1;
    if (depth === 0) {
      quietDepth.delete(id);
    } else {
      quietDepth.set(id, depth);
    }
  }
}

/**
 * Whether a dock is inside {@link changeQuietly}.
 *
 * @param api - The dock.
 * @returns `true` while a programmatic change to it runs.
 */
export const isChangingQuietly = (api: DockviewApi): boolean => quietDepth.has(api.id);

/**
 * Dockview's `getAnnouncement` for a Tau dock: silent inside {@link changeQuietly} and for a panel with no title, so a
 * raw id (Dockview's title for a panel added without one) is never spoken; otherwise Dockview's own words.
 *
 * @param api - The dock the event is from, once it is ready.
 * @param event - Dockview's announcement event.
 * @returns `null` to say nothing, or `undefined` to keep Dockview's message.
 */
// oxlint-disable-next-line typescript/no-restricted-types -- Dockview's contract: `null` suppresses an announcement.
export function tauDockviewAnnouncement(api: DockviewApi | undefined, event: LiveRegionEvent): null | undefined {
  if (api !== undefined && isChangingQuietly(api)) {
    return null;
  }
  // Dockview titles a panel added without one by its id.
  const title = event.panel.title?.trim();
  return title === undefined || title === '' || title === event.panel.id ? null : undefined;
}
