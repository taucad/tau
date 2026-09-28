/**
 * The main window's size, position and maximized/fullscreen state, remembered
 * across launches as desktop platforms expect.
 *
 * The first launch has nothing saved, so the caller opens on the work area of
 * the display under the cursor. A saved frame is used only while it still
 * lands on a connected display: a frame from an unplugged monitor, or one
 * larger than the display it now falls on, would otherwise open off-screen or
 * overflow it.
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import type { Rectangle } from 'electron';

/** What is remembered: the un-maximized frame plus the two window modes. */
export type WindowState = {
  /** Frame outside maximized and fullscreen, so un-maximizing returns to it. */
  readonly bounds: Rectangle;
  readonly maximized: boolean;
  readonly fullScreen: boolean;
};

const isRectangle = (value: unknown): value is Rectangle => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const { x, y, width, height } = value as Record<string, unknown>;
  return (
    [x, y, width, height].every((entry) => typeof entry === 'number' && Number.isFinite(entry)) &&
    (width as number) > 0 &&
    (height as number) > 0
  );
};

/**
 * Fit a saved frame to the displays connected now.
 *
 * The frame is kept when its top-centre point, where the user grabs the title
 * bar, lies in a display's work area; it is then shrunk and shifted to fit
 * that work area.
 *
 * @param bounds - Saved frame.
 * @param workAreas - Work area of every connected display.
 * @returns The frame to open at, or `undefined` when no display shows it.
 */
export const fitToDisplays = (bounds: Rectangle, workAreas: readonly Rectangle[]): Rectangle | undefined => {
  const grabX = bounds.x + bounds.width / 2;
  const area = workAreas.find(
    (candidate) =>
      grabX >= candidate.x &&
      grabX < candidate.x + candidate.width &&
      bounds.y >= candidate.y &&
      bounds.y < candidate.y + candidate.height,
  );
  if (area === undefined) {
    return undefined;
  }
  const width = Math.min(bounds.width, area.width);
  const height = Math.min(bounds.height, area.height);
  return {
    x: Math.min(Math.max(bounds.x, area.x), area.x + area.width - width),
    y: Math.min(Math.max(bounds.y, area.y), area.y + area.height - height),
    width,
    height,
  };
};

/**
 * Read the saved state and fit it to the connected displays.
 *
 * @param storePath - JSON file the state was written to.
 * @param workAreas - Work area of every connected display.
 * @returns The state to restore, or `undefined` when there is none, it is
 * corrupt, or no connected display shows it.
 */
export const readWindowState = (storePath: string, workAreas: readonly Rectangle[]): WindowState | undefined => {
  let stored: unknown;
  try {
    stored = JSON.parse(readFileSync(storePath, 'utf8'));
  } catch {
    /* First launch or a corrupt file: open at the default frame. */
    return undefined;
  }
  if (typeof stored !== 'object' || stored === null) {
    return undefined;
  }
  const { bounds, maximized, fullScreen } = stored as Record<string, unknown>;
  if (!isRectangle(bounds)) {
    return undefined;
  }
  const fitted = fitToDisplays(bounds, workAreas);
  return fitted === undefined
    ? undefined
    : { bounds: fitted, maximized: maximized === true, fullScreen: fullScreen === true };
};

/**
 * Save the state, replacing the file atomically so a crash mid-write leaves
 * the previous state rather than a truncated one.
 *
 * @param storePath - JSON file to write.
 * @param state - State to remember.
 */
export const writeWindowState = (storePath: string, state: WindowState): void => {
  mkdirSync(dirname(storePath), { recursive: true });
  const temporary = `${storePath}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(state, undefined, 2)}\n`, 'utf8');
  renameSync(temporary, storePath);
};
