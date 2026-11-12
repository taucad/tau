import { desktopBridge } from '#filesystem/desktop-bridge.js';
import { useProjects } from '#hooks/use-projects.js';

/** What decides a desktop first run. */
export type DesktopFirstRunInput = Readonly<{
  /** Main's verdict: no window-state file and nothing in the launch. */
  isFirstLaunch: boolean;
  /** The project listing is still loading. */
  isLoading: boolean;
  /** Projects in the workspace, trashed ones included. */
  projectCount: number;
}>;

/**
 * DT1: the first launch after install, with nothing to open and no project yet, trashed ones included.
 *
 * @param input - Main's verdict and the project listing.
 * @returns Whether setup opens before home.
 */
export const isDesktopFirstRun = ({ isFirstLaunch, isLoading, projectCount }: DesktopFirstRunInput): boolean =>
  isFirstLaunch && !isLoading && projectCount === 0;

/**
 * Whether this desktop launch is the first run (DT1), read from the bridge and the project listing.
 *
 * @returns Whether setup opens before home.
 */
export const useIsDesktopFirstRun = (): boolean => {
  const { projects, isLoading } = useProjects({ includeDeleted: true });
  return isDesktopFirstRun({
    isFirstLaunch: desktopBridge()?.firstRun === true,
    isLoading,
    projectCount: projects.length,
  });
};
