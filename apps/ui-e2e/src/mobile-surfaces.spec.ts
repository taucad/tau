import { expect, test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import type { Locator } from 'vitest/browser';
import * as target from '#support/external-target.js';
import { prepareComposerPage } from '#support/chat-attachments.js';

/**
 * I1 on a real phone route: every Workbench surface is reachable by touch from the nav or All, opens in the sheet
 * under its desktop title with its own Close, and Model restores the stage. The unit registry test proves the
 * mapping; this proves the production route renders and recovers each pane at 320px and 390px.
 */

const navigation = (): Locator => selectors.getByRole('navigation', { name: 'Workbench' });
const navButton = (name: string): Locator => navigation().getByRole('button', { name, exact: true });
const allSheet = (): Locator => selectors.getByRole('dialog', { name: 'All surfaces' });

/**
 * Surfaces All lists in the web build whatever the deployment flags (Print, Telemetry and Console are gated as on
 * desktop). Browser ships only in the desktop app, and Jobs is unfinished and ships nowhere.
 */
const ungatedSurfaces = [
  'Model tree',
  'Kinematics',
  'Revisions',
  'Agents',
  'Files',
  'Editor',
  'Export',
  'Share',
  'Details',
] as const;

test.each([
  { width: 320, height: 640 },
  { width: 390, height: 844 },
])('reaches every surface from All and returns to the model at $width×$height', async (viewport) => {
  await target.commands.uiOpenTarget({ hasTouch: true, isMobile: true });
  await prepareComposerPage();
  await target.setViewport(viewport);
  await target.navigate('/__e2e/chat-attachments');
  await target.expectUrl(/\/w\/[^/]+\/[^/?]+\?/u, 60_000);
  await target.expectVisible(navigation(), 60_000);

  await target.click(navButton('All'), { touch: true });
  await target.expectVisible(allSheet());
  const listed = await target.evaluateLocator(allSheet(), (sheet) =>
    [...sheet.querySelectorAll('section[aria-labelledby^="all-surfaces-"] button')].map((button) =>
      button.textContent.trim(),
    ),
  );
  for (const title of ungatedSurfaces) {
    expect(listed).toContain(title);
  }
  expect(listed).not.toContain('Browser');
  expect(listed).not.toContain('Jobs');
  // No horizontal scroll in All at 320px (W3).
  const overflow = await target.evaluateLocator(allSheet(), (element) => element.scrollWidth - element.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await target.keyboardPress('Escape');

  for (const title of listed) {
    // oxlint-disable-next-line no-await-in-loop -- one surface at a time, as a person taps.
    await target.click(navButton('All'), { touch: true });
    // oxlint-disable-next-line no-await-in-loop -- one surface at a time.
    await target.click(allSheet().getByRole('button', { name: title, exact: true }), { touch: true });
    const surface = selectors.getByRole('region', { name: title, exact: true });
    // oxlint-disable-next-line no-await-in-loop -- one surface at a time.
    await target.expectVisible(surface, 60_000);
    // The closing All sheet hides the nav from the accessibility tree until its exit animation ends, so the nav's
    // buttons are found by role only after it; poll as the Model check below does.
    // oxlint-disable-next-line no-await-in-loop -- one surface at a time.
    await expect.poll(async () => target.getAttribute(navButton('All'), 'aria-current')).toBe('page');
    // oxlint-disable-next-line no-await-in-loop -- one surface at a time.
    await target.click(navButton('Model'), { touch: true });
    // oxlint-disable-next-line no-await-in-loop -- one surface at a time.
    await expect.poll(async () => target.getAttribute(navButton('Model'), 'aria-current')).toBe('page');
    // oxlint-disable-next-line no-await-in-loop -- one surface at a time.
    await target.expectCount(selectors.getByCss('[data-slot="mobile-surface"]'), 0);
  }
});
