import { expect, test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import type { Locator } from 'vitest/browser';
import * as target from '#support/external-target.js';

const projectFixtureRoute = '/__e2e/project-file-tree';
const navigationFixtureRoute = '/__e2e/project-navigation';
const seededProjectName = 'sgenoud/models file-tree e2e';

const shareRegion = (): Locator => selectors.getByRole('region', { name: 'Share project' });
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
  await target.expectVisible(shareRegion().getByRole('tab', { name: 'Direct link' }));
  await target.expectVisible(shareRegion().getByRole('tab', { name: 'Tau link' }));
  await target.expectVisible(shareRegion().getByRole('tab', { name: 'GitHub Gist' }));

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
  await target.expectAttribute(shareRegion().getByRole('tab', { name: 'GitHub Gist' }), 'data-state', 'active');
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

  await target.click(selectors.getByRole('button', { name: 'More actions for Project Navigation B' }));
  await target.click(selectors.getByRole('menuitem', { name: 'Share project' }));
  await target.expectVisible(selectors.getByText('Project Navigation B', { exact: true }).first(), 60_000);
  await target.expectVisible(shareRegion(), 60_000);
  const next = new URL(await target.currentUrl());
  expect(next.pathname).toMatch(/\/w\/[^/]+\/project-navigation-b$/u);
  expect(next.searchParams.has('chat')).toBe(false);
  expect(next.searchParams.has('workbench')).toBe(false);
});

test('uses the same Share body in the mobile drawer without clipping its navigation action', async () => {
  await target.setViewport({ width: 390, height: 844 });
  await openSeededProject();
  await openShare();

  const mobileShareTab = selectors.getByRole('tab', { name: 'Share', exact: true });
  await target.expectVisible(mobileShareTab);
  await target.expectAttribute(mobileShareTab, 'data-state', 'active');
  await target.expectVisible(shareRegion().getByRole('button', { name: 'Copy direct link' }));
  const navigationBounds = await target.boundingBox(mobileShareTab);
  if (!navigationBounds) {
    throw new Error('Mobile Share navigation action did not have layout bounds.');
  }
  expect(navigationBounds.x).toBeGreaterThanOrEqual(0);
  expect(navigationBounds.x + navigationBounds.width).toBeLessThanOrEqual(390);

  await target.click(shareRegion().getByRole('tab', { name: 'GitHub Gist' }));
  await target.expectVisible(shareRegion().getByText(/GitHub stores the compressed project/u));
  await target.click(selectors.getByRole('tab', { name: 'Model', exact: true }));
  await target.expectHidden(shareRegion());
  await target.screenshot(selectors.getByCss('body'), 'share-pane-mobile.png');
});
