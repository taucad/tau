/**
 * The model stage as the specs wait on it, on a phone or a desktop.
 *
 * The stage's canvas region (`role="application"`, "CAD canvas") is `aria-busy` until its canvas's first frame is on
 * screen. On the software WebGPU profile the browser compiles the stage's pipelines before that frame shows, and the
 * compositor (and any main-thread call that waits on the GPU process) stalls meanwhile: taps wait for an element to be
 * stable and screenshots wait for a frame. A spec waits here in its setup, once the stage has mounted, before its first
 * tap, screenshot or navigation away.
 */

import { expect } from 'vitest';
import { page as selectors } from 'vitest/browser';
import type { Locator } from 'vitest/browser';
import * as target from '#support/external-target.js';

const stageName = 'CAD canvas';

/**
 * Wait until a stage is shown and none of the stages with area is busy. A stage with no area, such as one behind
 * another pane, draws nothing until it is shown, so it is not waited on.
 */
export const waitForStageReady = async (): Promise<void> => {
  await target.waitFor(
    (name) => {
      // Every stage by role and accessible name; the external page's locators resolve one element, not all of them.
      const stages = [...document.querySelectorAll<HTMLElement>('[role="application"]')].filter(
        (stage) => stage.getAttribute('aria-label') === name && stage.clientWidth > 0 && stage.clientHeight > 0,
      );
      return stages.length > 0 && stages.every((stage) => stage.getAttribute('aria-busy') !== 'true');
    },
    stageName,
    { timeout: 60_000 },
  );
};

/** The stage's viewer controls (the first group, on a page with more than one stage). */
export const viewerControls = (): Locator => selectors.getByRole('group', { name: 'Viewer controls' }).first();

/**
 * Wait for a rendered stage with geometry rather than an empty first frame: the stage is ready and the model has
 * geometry, so Section view is enabled.
 *
 * @param options - Optional evidence.
 * @param options.diagnostics - When the stage is not ready, save a screenshot and the target's diagnostics under this
 *   artifact name before failing.
 */
export const waitForModelReady = async (options: Readonly<{ diagnostics?: string }> = {}): Promise<void> => {
  try {
    await waitForStageReady();
  } catch (error) {
    if (options.diagnostics !== undefined) {
      await target.screenshot(undefined, `${options.diagnostics}.png`);
      const diagnostics = await target.commands.uiCaptureTargetDiagnostics();
      await target.writeArtifact(
        `${options.diagnostics}.json`,
        JSON.stringify({ ...diagnostics, screenshot: undefined }, null, 2),
      );
    }
    throw error;
  }
  await expect
    .poll(
      async () =>
        target.getAttribute(
          viewerControls().getByRole('button', { name: 'Section view', exact: true }),
          'aria-disabled',
        ),
      { timeout: 60_000 },
    )
    .toBe('false');
};
