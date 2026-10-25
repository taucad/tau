/**
 * The model stage as the specs wait on it, on a phone or a desktop.
 *
 * Each stage canvas reports `aria-busy` until its first frame is on screen. On the software WebGPU profile the browser
 * compiles the stage's pipelines before that frame shows, and the compositor produces no frames meanwhile, even for a
 * page navigated to next: taps wait for an element to be stable and screenshots wait for a frame. A spec waits here in
 * its setup, once the stage has mounted, before its first tap, screenshot or navigation away.
 */

import { page as selectors } from 'vitest/browser';
import type { Locator } from 'vitest/browser';
import * as target from '#support/external-target.js';

/** The stage's canvas region (`role="application"`, named "CAD canvas" by default). */
export const stageRegion = (): Locator => selectors.getByTestId('cad-viewer-canvas-region').first();

/**
 * Wait until a stage canvas has mounted and every one on screen has its first frame shown (`aria-busy` cleared). A
 * stage with no area, such as one behind another pane, draws nothing until it is shown, so it is not waited on.
 */
export const waitForStageReady = async (): Promise<void> => {
  await target.expectVisible(stageRegion(), 60_000);
  await target.waitFor(
    () => {
      const canvases = [
        ...document.querySelectorAll('[data-testid="cad-viewer-canvas-region"] [data-slot="viewer-canvas"]'),
      ].filter((canvas) => canvas.clientWidth > 0 && canvas.clientHeight > 0);
      return canvases.length > 0 && canvases.every((canvas) => canvas.getAttribute('aria-busy') !== 'true');
    },
    undefined,
    { timeout: 60_000 },
  );
};
