/*
 * The project's geometry entry helpers, now owned by `@taucad/workbench-panes`. They stay at this path for the chat
 * composer, whose submit path the message queue model fences by source hash.
 */
import {
  findEntryGraphics as findSharedEntryGraphics,
  listGeometryEntryPaths as listSharedGeometryEntryPaths,
} from '@taucad/workbench-panes/units/geometry-units';

type SharedListArguments = Parameters<typeof listSharedGeometryEntryPaths>;

/**
 * Every geometry entry the project shows, main first.
 *
 * @param units - The admitted geometry units by entry path.
 * @param views - The views and the entries they show.
 * @param mainEntryPath - The project's main entry.
 * @returns The entry paths.
 */
export const listGeometryEntryPaths = (
  units: SharedListArguments[0],
  views: SharedListArguments[1],
  mainEntryPath: string,
): string[] => listSharedGeometryEntryPaths(units, views, mainEntryPath);

/**
 * The graphics of the view showing an entry.
 *
 * @param graphics - The views' graphics by view id.
 * @param entryPaths - The entry each view shows.
 * @param entryPath - The entry to find.
 * @returns The graphics, or `undefined` when no view shows the entry.
 */
export const findEntryGraphics = <T>(
  graphics: ReadonlyMap<string, T>,
  // oxlint-disable-next-line typescript/no-restricted-types -- A live empty viewer has a null entry.
  entryPaths: ReadonlyMap<string, string | null>,
  entryPath: string,
): T | undefined => findSharedEntryGraphics(graphics, entryPaths, entryPath);
