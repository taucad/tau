/**
 * The remote-host transport harness (`/__e2e/remote-host`), which exists only in a debug build. The root layout renders
 * it with no file manager and no project sessions, and the client entry starts its runtime with idle file managers, so
 * its transport check runs alone.
 */

/** The harness's path. @public */
export const remoteHostHarnessPath = '/__e2e/remote-host';

/**
 * Whether a page is the remote-host harness.
 *
 * @param debug - Whether this is a debug build (`TAU_DEBUG`).
 * @param pathname - The page's path.
 * @returns Whether the page is the harness.
 * @public
 */
export const isRemoteHostHarness = (debug: boolean | undefined, pathname: string | undefined): boolean =>
  debug === true && pathname === remoteHostHarnessPath;
