import { isDesktopTarget } from '#lib/build-target.js';

/**
 * Whether this build offers a Workbench surface at all, before flags and profile. Browser drives the desktop app's
 * guest view, so only the desktop app offers it. Jobs is unfinished and offered nowhere.
 *
 * @param id - A desktop Workbench pane or a phone surface; they share the ids this checks.
 * @returns Whether launchers may list the surface and `openPanel` may open it.
 */
export const isSurfaceShipped = (id: string): boolean => id !== 'jobs' && (id !== 'browser' || isDesktopTarget());
