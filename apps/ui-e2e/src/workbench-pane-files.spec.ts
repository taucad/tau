import { expect, test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import type { Locator } from 'vitest/browser';
import * as target from '#support/external-target.js';

const seedRoute = '/__e2e/project-file-tree';
const seedProjectName = 'sgenoud/models file-tree e2e';

const treeItem = (owner: Locator, path: string): Locator =>
  owner.getByCss(`[data-testid="file-tree-item"][data-file-tree-path="${path}"]`);

const filesPane = (): Locator => selectors.getByRole('region', { name: /^Files for /u }).first();

const openSeededProject = async (): Promise<void> => {
  await target.navigate(seedRoute);
  try {
    await target.expectUrl(/\/w\/[^/]+\/[^/]+/u, 10_000);
  } catch {
    const project = selectors.getByRole('link', { name: seedProjectName }).first();
    await target.expectVisible(project, 60_000);
    const href = await target.getAttribute(project, 'href');
    if (!href) {
      throw new Error('Seeded project link did not include an href.');
    }
    await target.navigate(href);
    await target.expectUrl(/\/w\/[^/]+\/[^/]+/u, 60_000);
  }

  await target.expectVisible(selectors.getByTestId('cad-viewer-canvas-region').getByCss('canvas').first(), 60_000);
  if (!(await target.isVisible(filesPane()))) {
    await target.click(selectors.getByRole('button', { name: /Search/u }));
    const search = selectors.getByPlaceholder('Search projects, chats, and actions...');
    await target.fill(search, 'Open files');
    await target.click(selectors.getByText('Open files', { exact: true }));
  }
  await target.expectVisible(filesPane(), 15_000);
};

test('should own Files and Markdown views independently in each Workbench pane', async () => {
  await target.setViewport({ width: 1440, height: 900 });
  await openSeededProject();

  await target.expectCount(selectors.getByRole('button', { name: 'Toggle Files pane' }), 0);
  const initialRegion = selectors.getByRole('region', { name: 'Files for Open file' });
  await target.click(treeItem(initialRegion, 'package.json'));

  const packageTab = selectors.getByCss('.dv-tab[aria-label="package.json"]');
  const packageRegion = selectors.getByRole('region', { name: 'Files for package.json' });
  await target.expectVisible(packageTab, 15_000);
  await target.expectVisible(packageRegion, 15_000);

  await target.click(
    selectors.getByCss('.dv-groupview:has(.dv-tab[aria-label="package.json"]) button[aria-label="Split right"]'),
  );
  await target.click(selectors.getByRole('button', { name: /^Files/u }));

  const openFileRegion = selectors.getByRole('region', { name: 'Files for Open file' });
  await target.expectVisible(packageRegion, 15_000);
  await target.expectVisible(openFileRegion, 15_000);
  await target.screenshot(selectors.getByCss('body'), 'workbench-pane-files-wide.png');

  const packageSeparator = packageRegion.getByRole('separator', { name: 'Resize Files pane' });
  await target.press(packageSeparator, 'ArrowLeft');
  await target.expectAttribute(packageSeparator, 'aria-valuenow', '248');

  await target.delay(1200);
  await target.reload();
  await target.expectVisible(packageRegion, 60_000);
  await target.expectVisible(openFileRegion, 60_000);
  await target.expectAttribute(
    packageRegion.getByRole('separator', { name: 'Resize Files pane' }),
    'aria-valuenow',
    '248',
  );

  await target.click(selectors.getByRole('button', { name: 'Hide files for package.json' }));
  await target.expectCount(packageRegion, 0);
  await target.expectVisible(openFileRegion);

  const sourceDirectory = treeItem(openFileRegion, 'src');
  if ((await target.getAttribute(sourceDirectory, 'aria-expanded')) !== 'true') {
    await target.click(sourceDirectory, { position: { x: 8, y: 14 } });
  }
  await target.expectAttribute(sourceDirectory, 'aria-expanded', 'true');
  await target.click(treeItem(openFileRegion, 'src/readme.md'));

  const markdownRegion = selectors.getByRole('region', { name: 'Files for readme.md' });
  await target.expectVisible(markdownRegion, 15_000);
  await target.click(selectors.getByRole('button', { name: 'View source' }));
  await target.expectVisible(selectors.getByRole('button', { name: 'View preview' }));

  await target.click(packageTab, { button: 'right' });
  await target.click(selectors.getByRole('menuitem', { name: 'Reveal in File Tree' }));
  await target.expectVisible(packageRegion, 15_000);
  await target.expectAttribute(treeItem(packageRegion, 'package.json'), 'aria-selected', 'true');
  expect(await target.getAttribute(treeItem(markdownRegion, 'package.json'), 'aria-selected')).not.toBe('true');

  await target.setViewport({ width: 960, height: 800 });
  await target.expectVisible(selectors.getByRole('button', { name: 'View preview' }));
  await target.expectVisible(selectors.getByRole('button', { name: 'Hide files for package.json' }));
  await target.screenshot(selectors.getByCss('body'), 'workbench-pane-files-narrow.png');
});

test('should render native image controls in the file header instead of over the image', async () => {
  await target.setViewport({ width: 1440, height: 900 });
  await openSeededProject();

  await target.click(treeItem(filesPane(), 'thumbnail.webp'));

  const actions = selectors.getByRole('group', { name: 'File actions for thumbnail.webp' });
  const imageRegion = selectors.getByRole('region', { name: 'Image viewer: thumbnail.webp' });
  const fit = actions.getByRole('button', { name: 'Fit image' });
  const zoomOut = actions.getByRole('button', { name: 'Zoom out' });
  const actualSize = actions.getByRole('button', { name: 'Actual size' });
  const zoomIn = actions.getByRole('button', { name: 'Zoom in' });
  const download = actions.getByRole('link', { name: 'Download image' });

  await target.expectVisible(imageRegion, 15_000);
  await target.expectVisible(fit);
  await target.expectVisible(zoomOut);
  await target.expectVisible(actualSize);
  await target.expectVisible(zoomIn);
  await target.expectVisible(download);
  await target.expectCount(imageRegion.getByRole('button'), 0);
  await target.expectCount(imageRegion.getByRole('link'), 0);
  await target.expectCount(selectors.getByRole('region', { name: 'Files for thumbnail.webp' }), 0);
  await target.expectCount(selectors.getByRole('button', { name: 'Toggle Files pane' }), 0);

  await target.click(actualSize);
  expect(await target.textContent(actualSize)).toBe('100%');
  await target.click(zoomIn);
  expect(await target.textContent(actualSize)).toBe('125%');
  await target.click(fit);
  expect(await target.textContent(actualSize)).toBe('Fit');
  await target.screenshot(selectors.getByCss('body'), 'workbench-image-controls-wide.png');

  await target.setViewport({ width: 1100, height: 800 });
  await target.expectVisible(actions);
  await target.expectVisible(download);
  const downloadBounds = await target.boundingBox(download);
  if (!downloadBounds) {
    throw new Error('Download image control did not have layout bounds.');
  }
  expect(downloadBounds.x + downloadBounds.width).toBeLessThanOrEqual(1100);
  await target.screenshot(selectors.getByCss('body'), 'workbench-image-controls-narrow.png');
});
