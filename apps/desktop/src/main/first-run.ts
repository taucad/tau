import { existsSync } from 'node:fs';

/** What the first-run decision reads at startup. */
export type FirstRunInput = Readonly<{
  /** The path `window-state.ts` writes whenever a window closes. */
  windowStatePath: string;
  /** Whether the launch carried a `tau://` link. */
  hasLaunchLink: boolean;
  /** Whether the launch carried a file to open. */
  hasLaunchFiles: boolean;
}>;

/**
 * Whether this launch is the install's first run: no window-state file
 * on disk, and no `tau://` link or file in the launch. The file is written whenever a window closes, so any install
 * that has been used has one; it is tested with `existsSync`, never with the fitted read, which also returns nothing
 * when the file does not parse or the saved frame fits no connected display. An upgraded install therefore never
 * counts. The renderer adds the last fact, an empty project list.
 *
 * @param input - The window-state path and what the launch carried.
 * @returns Whether this is the first run.
 */
export const isFirstRun = ({ windowStatePath, hasLaunchLink, hasLaunchFiles }: FirstRunInput): boolean =>
  !hasLaunchLink && !hasLaunchFiles && !existsSync(windowStatePath);
