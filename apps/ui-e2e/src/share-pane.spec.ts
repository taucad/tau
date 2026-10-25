import { expect, test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import type { Locator } from 'vitest/browser';
import * as target from '#support/external-target.js';

const projectFixtureRoute = '/__e2e/project-file-tree';
const navigationFixtureRoute = '/__e2e/project-navigation';
const seededProjectName = 'sgenoud/models file-tree e2e';

const shareRegion = (): Locator => selectors.getByRole('region', { name: 'Share project' });
/** The "Share with" method picker, named by the method it shows. */
const shareMethodPicker = (method: string): Locator =>
  shareRegion().getByRole('button', { name: `Share with ${method}`, exact: true });
const shareTab = (): Locator => selectors.getByCss('.dv-tab[aria-label="Share"]');

const openSeededProject = async (): Promise<void> => {
  await target.navigate(projectFixtureRoute);
  try {
    await target.expectUrl(/\/w\/[^/]+\/[^/]+/u, 10_000);
  } catch {
    const project = selectors.getByRole('link', { name: seededProjectName }).first();
    await target.expectVisible(project, 60_000);
    const href = await target.getAttribute(project, 'href');
    if (!href) {
      throw new Error('Seeded project link did not include an href.');
    }
    await target.navigate(href);
  }
  await target.expectVisible(selectors.getByTestId('cad-viewer-canvas-region').getByCss('canvas').first(), 60_000);
};

const openShare = async (): Promise<void> => {
  await target.click(selectors.getByRole('button', { name: 'Share', exact: true }).first());
  await target.expectVisible(shareRegion(), 15_000);
};

test('keeps one movable Share pane, restores it, and resolves an unencrypted Direct link', async () => {
  await target.setViewport({ width: 1440, height: 900 });
  await openSeededProject();
  await openShare();

  await target.expectCount(shareTab(), 1);
  await target.expectCount(selectors.getByRole('dialog', { name: 'Share project' }), 0);
  /* The methods are one "Share with" picker (#765), not tabs: it shows the chosen method and lists all three. */
  await target.click(shareMethodPicker('Direct link'));
  await target.expectVisible(selectors.getByRole('option', { name: 'Direct link' }));
  await target.expectVisible(selectors.getByRole('option', { name: 'Hosted link' }));
  await target.expectVisible(selectors.getByRole('option', { name: 'GitHub Gist' }));
  await target.keyboardPress('Escape');
  await target.expectCount(selectors.getByRole('option', { name: 'GitHub Gist' }), 0);

  await target.click(selectors.getByRole('button', { name: 'Share', exact: true }).first());
  await target.expectCount(shareTab(), 1);

  await target.click(shareTab(), { button: 'right' });
  await target.click(selectors.getByRole('menuitem', { name: 'Split Right' }));
  await target.expectCount(shareTab(), 1);
  const splitBounds = await target.boundingBox(selectors.getByCss('.dv-groupview:has(.dv-tab[aria-label="Share"])'));
  if (!splitBounds) {
    throw new Error('Split Share group did not have layout bounds.');
  }

  await target.delay(1200);
  await target.reload();
  await target.expectVisible(shareRegion(), 60_000);
  await target.expectCount(shareTab(), 1);
  const restoredBounds = await target.boundingBox(selectors.getByCss('.dv-groupview:has(.dv-tab[aria-label="Share"])'));
  expect(restoredBounds?.x).toBeCloseTo(splitBounds.x, 0);

  await target.expectAttribute(
    shareRegion().getByRole('checkbox', { name: 'Encrypt with a password' }),
    'data-state',
    'unchecked',
  );
  await target.click(shareRegion().getByRole('button', { name: 'Copy direct link' }));
  const shareLink = shareRegion().getByRole('textbox', { name: 'Share link' });
  await target.expectVisible(shareLink, 60_000);
  const shareLinkState = await target.read(shareLink);
  const plainUrl = shareLinkState.value;
  if (!plainUrl) {
    throw new Error('Direct Share did not expose its generated URL.');
  }
  expect(plainUrl).toMatch(/\/s\/direct#v=2&zip=/u);
  expect(plainUrl).not.toContain('jwe=');

  const parsed = new URL(plainUrl);
  await target.openSecondary(`${parsed.pathname}${parsed.search}${parsed.hash}`);
  /* A shared model is someone's code, so the link asks before it runs (shared-project-workbench's run consent). */
  const runModel = selectors.getByRole('button', { name: 'Run this model' });
  await target.expectVisible(runModel, 60_000, 'secondary');
  await target.click(runModel, undefined, 'secondary');
  await target.expectVisible(selectors.getByRole('button', { name: 'Download source' }), 60_000, 'secondary');
  await target.expectCount(shareTab(), 0, 10_000, 'secondary');
  expect(await target.currentUrl()).toContain('/w/');
  await target.closeSecondary();
  await target.screenshot(shareRegion(), 'share-pane-desktop.png');
});

test('restores a GitHub authorization return and routes sidebar Share to the selected project', async () => {
  await target.setViewport({ width: 1280, height: 820 });
  await target.navigate(navigationFixtureRoute);
  await target.expectUrl(/\/w\/[^/]+\/[^/]+$/u, 60_000);

  const current = new URL(await target.currentUrl());
  current.search =
    '?chat=missing&keep=1&workbench=share&shareProvider=github-gist&shareAuth=github-gist&error=access_denied&error_description=provider-copy';
  await target.navigate(`${current.pathname}${current.search}`);

  await target.expectVisible(shareRegion(), 60_000);
  await target.expectVisible(shareRegion().getByText('GitHub Gist access was not granted.', { exact: true }));
  await target.expectVisible(shareMethodPicker('GitHub Gist'));
  await target.waitFor(() => {
    const url = new URL(location.href);
    return (
      url.searchParams.get('keep') === '1' &&
      !url.searchParams.has('workbench') &&
      !url.searchParams.has('shareProvider') &&
      !url.searchParams.has('shareAuth') &&
      !url.searchParams.has('error') &&
      !url.searchParams.has('error_description')
    );
  });

  const projectA = new URL(await target.currentUrl());
  expect(projectA.searchParams.get('chat')).not.toBeNull();

  /* Row actions show on hover or focus (sidebar v2 D7). */
  await target.hover(selectors.getByRole('link', { name: 'Project Navigation B', exact: true }));
  await target.click(selectors.getByRole('button', { name: 'More actions for Project Navigation B' }));
  await target.click(selectors.getByRole('menuitem', { name: 'Share project' }));
  await target.expectVisible(selectors.getByText('Project Navigation B', { exact: true }).first(), 60_000);
  await target.expectVisible(shareRegion(), 60_000);
  const next = new URL(await target.currentUrl());
  expect(next.pathname).toMatch(/\/w\/[^/]+\/project-navigation-b$/u);
  /* Nothing of project A's URL comes along. Project B may name its own focused chat once it resolves (the project
   * route writes the resolved chat back to the URL), so only A's chat is ruled out. */
  expect(next.searchParams.has('keep')).toBe(false);
  expect(next.searchParams.get('chat')).not.toBe(projectA.searchParams.get('chat'));
  expect(next.searchParams.has('workbench')).toBe(false);
});

test('uses the same Share body in the mobile drawer without clipping its navigation action', async () => {
  await target.setViewport({ width: 390, height: 844 });
  await openSeededProject();
  await openShare();

  // Share is a secondary surface: All carries the selection in the nav, and the sheet is named Share.
  const mobileNavigation = selectors.getByRole('navigation', { name: 'Workbench' });
  const allButton = mobileNavigation.getByRole('button', { name: 'All', exact: true });
  await target.expectVisible(allButton);
  await target.expectAttribute(allButton, 'aria-current', 'page');
  await target.expectVisible(selectors.getByRole('region', { name: 'Share', exact: true }));
  await target.expectVisible(shareRegion().getByRole('button', { name: 'Copy direct link' }));
  const navigationBounds = await target.boundingBox(allButton);
  if (!navigationBounds) {
    throw new Error('Mobile All navigation action did not have layout bounds.');
  }
  expect(navigationBounds.x).toBeGreaterThanOrEqual(0);
  expect(navigationBounds.x + navigationBounds.width).toBeLessThanOrEqual(390);

  await target.click(shareMethodPicker('Direct link'));
  await target.click(selectors.getByRole('option', { name: 'GitHub Gist' }));
  await target.expectVisible(shareMethodPicker('GitHub Gist'));
  await target.expectVisible(shareRegion().getByText(/Tau sends the compressed project to GitHub/u));
  await target.click(mobileNavigation.getByRole('button', { name: 'Model', exact: true }));
  await target.expectHidden(shareRegion());
  await target.screenshot(selectors.getByCss('body'), 'share-pane-mobile.png');
});
