/**
 * Where the macOS app bundle runs from, and whether Squirrel.Mac can replace it there.
 *
 * Gatekeeper runs a quarantined app opened in place (an unzipped download) from a randomized read-only
 * mount (App Translocation), and an app opened from its disk image runs from a read-only volume. Squirrel.Mac
 * replaces the bundle where it lies, so in either place every update fails with a read-only volume error.
 * Moving the app to Applications through Finder or Electron ends both.
 */
import { accessSync, constants, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export type AppLocation = {
  /** The `.app` bundle the running executable belongs to. */
  readonly bundlePath: string;
  /** Gatekeeper is running a randomized read-only copy of the bundle. */
  readonly translocated: boolean;
  /** The bundle and the folder holding it can be written, so the bundle can be replaced in place. */
  readonly writable: boolean;
};

/**
 * The `.app` bundle an executable inside `Contents/MacOS/` belongs to.
 *
 * @param execPath - `process.execPath`.
 * @returns The bundle path, or undefined when the executable is not inside an app bundle.
 */
export const appBundlePath = (execPath: string): string | undefined => {
  const marker = '.app/Contents/MacOS/';
  const index = execPath.indexOf(marker);
  return index === -1 ? undefined : execPath.slice(0, index + '.app'.length);
};

const canWrite = (path: string): boolean => {
  try {
    accessSync(path, constants.W_OK);
    return true;
  } catch {
    return false;
  }
};

/**
 * Assess where the running app bundle lives.
 *
 * @param execPath - `process.execPath`.
 * @param writable - Whether a path can be written; the real file system by default.
 * @returns The location, or undefined outside an app bundle.
 */
export const assessAppLocation = (
  execPath: string,
  writable: (path: string) => boolean = canWrite,
): AppLocation | undefined => {
  const bundlePath = appBundlePath(execPath);
  if (bundlePath === undefined) {
    return undefined;
  }
  return {
    bundlePath,
    translocated: bundlePath.includes('/AppTranslocation/'),
    writable: writable(bundlePath) && writable(dirname(bundlePath)),
  };
};

/**
 * Whether Squirrel.Mac cannot replace the bundle where it runs.
 *
 * @param location - The assessed location.
 * @returns True when updates cannot install from here.
 */
export const locationBlocksUpdates = (location: AppLocation | undefined): boolean =>
  location !== undefined && (location.translocated || !location.writable);

/** What the updater and its card tell a person whose copy of Tau cannot update in place. */
export const moveToApplicationsDetail =
  'Tau is running from a read-only location, such as Downloads or a disk image, so it can’t update itself. Move Tau to Applications to receive updates.';

const stateFile = (userData: string): string => join(userData, 'app-location.json');

/**
 * Whether the person already answered the launch question with Not now.
 *
 * @param userData - The app's user data directory.
 * @returns True once declined.
 */
export const moveOfferDeclined = (userData: string): boolean => {
  try {
    const state: unknown = JSON.parse(readFileSync(stateFile(userData), 'utf8'));
    return typeof state === 'object' && state !== null && Reflect.get(state, 'moveDeclined') === true;
  } catch {
    return false;
  }
};

const recordMoveDeclined = (userData: string): void => {
  mkdirSync(userData, { recursive: true });
  writeFileSync(stateFile(userData), `${JSON.stringify({ moveDeclined: true })}\n`);
};

export type MoveToApplicationsHost = {
  /** `dialog.showMessageBoxSync` with the options a question needs. */
  readonly ask: (options: {
    type: 'question';
    buttons: string[];
    defaultId: number;
    cancelId: number;
    message: string;
    detail: string;
  }) => number;
  /** `app.moveToApplicationsFolder`: true once the move is done and Tau is relaunching from Applications. */
  readonly move: (options: { conflictHandler: (conflictType: 'exists' | 'existsAndRunning') => boolean }) => boolean;
  readonly log: (level: 'info' | 'warn', event: string, detail?: unknown) => void;
};

/**
 * Move Tau to Applications, asking before it replaces another copy already there.
 *
 * @param host - The dialog, move and log the move uses.
 * @returns True when Tau is relaunching from Applications.
 */
export const moveToApplications = (host: MoveToApplicationsHost): boolean => {
  try {
    return host.move({
      conflictHandler: (conflictType) =>
        /* A running copy takes focus and this one quits, which is Electron's own handling. */
        conflictType === 'existsAndRunning' ||
        host.ask({
          type: 'question',
          buttons: ['Replace', 'Cancel'],
          defaultId: 0,
          cancelId: 1,
          message: 'Replace the copy of Tau in Applications?',
          detail: 'Applications already has a Tau. Replacing it moves the older copy to the Trash.',
        }) === 0,
    });
  } catch (error) {
    host.log('warn', 'app-location.move-failed', { message: String(error) });
    return false;
  }
};

/**
 * Once, at launch, offer to move a copy of Tau that cannot update in place to Applications.
 *
 * @param location - Where the app runs from.
 * @param userData - The app's user data directory, which remembers a Not now.
 * @param host - The dialog, move and log the offer uses.
 * @returns True when Tau is relaunching from Applications and this launch should stop.
 */
export const offerMoveToApplications = (
  location: AppLocation | undefined,
  userData: string,
  host: MoveToApplicationsHost,
): boolean => {
  if (!locationBlocksUpdates(location) || moveOfferDeclined(userData)) {
    return false;
  }
  host.log('info', 'app-location.offer', { translocated: location?.translocated, writable: location?.writable });
  const response = host.ask({
    type: 'question',
    buttons: ['Move to Applications', 'Not now'],
    defaultId: 0,
    cancelId: 1,
    message: 'Move Tau to your Applications folder?',
    detail:
      'Tau is running from a read-only location, such as Downloads or a disk image, so it can’t update itself. Moving it to Applications keeps it up to date. Tau reopens from there.',
  });
  if (response !== 0) {
    try {
      recordMoveDeclined(userData);
    } catch (error) {
      host.log('warn', 'app-location.record-failed', { message: String(error) });
    }
    return false;
  }
  return moveToApplications(host);
};
