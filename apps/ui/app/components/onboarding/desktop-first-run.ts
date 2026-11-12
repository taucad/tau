import { desktopBridge } from '#filesystem/desktop-bridge.js';
import { useProjects } from '#hooks/use-projects.js';

/** What decides a desktop first run. */
export type DesktopFirstRunInput = Readonly<{
  /** Main's verdict: no window-state file and nothing in the launch. */
  isFirstLaunch: boolean;
  /** The project listing is still loading. */
  isLoading: boolean;
  /** The project listing failed, so whether a project exists is unknown. */
  isListingFailed: boolean;
  /** Projects in the workspace, trashed ones included. */
  projectCount: number;
}>;

/**
 * The first launch after install, with nothing to open and no project yet, trashed ones included. A failed listing
 * says nothing about the workspace, so it is not read as an empty one.
 *
 * @param input - Main's verdict and the project listing.
 * @returns Whether setup opens before home.
 */
export const isDesktopFirstRun = ({
  isFirstLaunch,
  isLoading,
  isListingFailed,
  projectCount,
}: DesktopFirstRunInput): boolean => isFirstLaunch && !isLoading && !isListingFailed && projectCount === 0;

/**
 * Whether this desktop launch is the first run, read from the bridge and the project listing.
 *
 * @returns Whether setup opens before home.
 */
export const useIsDesktopFirstRun = (): boolean => {
  const { projects, isLoading, error } = useProjects({ includeDeleted: true });
  return isDesktopFirstRun({
    isFirstLaunch: desktopBridge()?.firstRun === true,
    isLoading,
    isListingFailed: error !== undefined,
    projectCount: projects.length,
  });
};
