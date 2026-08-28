import { expect, test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import type { Locator } from 'vitest/browser';
import * as target from '#support/external-target.js';

const seedRoute = '/__e2e/project-file-tree';
const seedProjectName = 'sgenoud/models file-tree e2e';

const treeItem = (owner: Locator, path: string): Locator =>
  owner.getByCss(`[data-testid="file-tree-item"][data-file-tree-path="${path}"]`);

const filesPane = (): Locator => selectors.getByRole('region', { name: /^Files for /u }).first();

const readCommandInputVisualState = async (input: Locator) =>
  target.evaluateLocator(input, (element) => {
    const wrapper = element.closest<HTMLElement>('[data-slot="command-input-wrapper"]');
    if (!wrapper) {
      throw new Error('Command input wrapper was missing.');
    }

    const inputBounds = element.getBoundingClientRect();
    const wrapperBounds = wrapper.getBoundingClientRect();
    const inputStyle = getComputedStyle(element);
    return {
      borderLeftWidth: Number.parseFloat(inputStyle.borderLeftWidth),
      borderRadius: Number.parseFloat(inputStyle.borderRadius),
      height: Number.parseFloat(inputStyle.height),
      leftInset: inputBounds.left - wrapperBounds.left,
      rightInset: wrapperBounds.right - inputBounds.right,
      wrapperBottomBorderWidth: Number.parseFloat(getComputedStyle(wrapper).borderBottomWidth),
    };
  });

const expectModernCommandInput = async (input: Locator): Promise<void> => {
  await target.expectVisible(input);
  const state = await readCommandInputVisualState(input);
  expect(state.height).toBeGreaterThanOrEqual(28);
  expect(state.height).toBeLessThan(32);
  expect(state.borderRadius).toBeGreaterThan(0);
  expect(state.borderLeftWidth).toBe(1);
  expect(state.leftInset).toBeGreaterThan(7);
  expect(state.leftInset).toBeLessThan(10);
  expect(state.leftInset).toBeCloseTo(state.rightInset, 1);
  expect(state.wrapperBottomBorderWidth).toBe(0);
};

const readHeaderInlinePadding = async (actions: Locator) =>
  target.evaluateLocator(actions, (element) => {
    const header = element.parentElement;
    if (!header) {
      throw new Error('File actions were not inside a stable header.');
    }
    const style = getComputedStyle(header);
    return {
      left: Number.parseFloat(style.paddingLeft),
      right: Number.parseFloat(style.paddingRight),
    };
  });

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
  const packageActions = selectors.getByRole('group', { name: 'File actions for package.json' });
  const packageFilesToggle = packageActions.getByRole('button', { name: 'Hide files for package.json' });
  const createFile = packageActions.getByRole('button', { name: 'Create new file' });
  await target.expectVisible(createFile);
  await target.expectVisible(packageActions.getByRole('button', { name: 'Create new folder' }));
  await target.expectVisible(packageActions.getByRole('button', { name: 'Collapse all folders' }));
  const toggleBounds = await target.boundingBox(packageFilesToggle);
  const createFileBounds = await target.boundingBox(createFile);
  if (!toggleBounds || !createFileBounds) {
    throw new Error('Files header controls did not have layout bounds.');
  }
  expect(createFileBounds.x).toBeLessThan(toggleBounds.x);
  expect(await readHeaderInlinePadding(packageActions)).toEqual({ left: 4, right: 4 });

  await target.click(selectors.getByRole('button', { name: 'package.json', exact: true }).first());
  const fileFilter = selectors.getByCss('input[data-slot="command-input"][placeholder="Filter files..."]');
  await expectModernCommandInput(fileFilter);
  const fileSelectorChrome = await target.evaluateLocator(fileFilter, (element) => {
    const popover = element.closest<HTMLElement>('[data-slot="popover-content"]');
    const filesRoot = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent.trim() === 'Files' && popover?.contains(button),
    );
    const breadcrumb = filesRoot?.closest<HTMLElement>('[data-slot="omni-scroller"]')?.parentElement;
    if (!popover || !breadcrumb) {
      throw new Error('File selector chrome was incomplete.');
    }
    return {
      breadcrumbBottomBorderWidth: Number.parseFloat(getComputedStyle(breadcrumb).borderBottomWidth),
      popoverBorderWidth: Number.parseFloat(getComputedStyle(popover).borderTopWidth),
    };
  });
  expect(fileSelectorChrome).toEqual({ breadcrumbBottomBorderWidth: 0, popoverBorderWidth: 1 });
  await target.fill(fileFilter, 'readme.md');
  await target.expectVisible(
    selectors
      .getByCss('[data-slot="popover-content"]:has(input[data-slot="command-input"][placeholder="Filter files..."])')
      .getByText('readme.md', { exact: true }),
  );
  await target.emulateColorScheme('light');
  await target.screenshot(selectors.getByCss('body'), 'workbench-file-selector-light.png');
  await target.emulateColorScheme('dark');
  await target.screenshot(selectors.getByCss('body'), 'workbench-file-selector-dark.png');
  await target.emulateColorScheme('light');
  await target.press(fileFilter, 'Escape');
  await target.expectCount(fileFilter, 0);

  await target.click(
    selectors.getByCss('.dv-groupview:has(.dv-tab[aria-label="package.json"]) button[aria-label="Split right"]'),
  );
  await target.click(selectors.getByRole('button', { name: /^Files/u }));

  const openFileRegion = selectors.getByRole('region', { name: 'Files for Open file' });
  const openFileActions = selectors.getByRole('group', { name: 'File actions for Open file' });
  await target.expectVisible(packageRegion, 15_000);
  await target.expectVisible(openFileRegion, 15_000);
  expect(await readHeaderInlinePadding(openFileActions)).toEqual({ left: 4, right: 4 });
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

  await target.click(packageFilesToggle);
  await target.expectCount(packageRegion, 0);
  await target.expectCount(packageActions.getByRole('button', { name: 'Create new file' }), 0);
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

test('should share modern command search chrome across command, model, kernel, and mobile drawers', async () => {
  await target.emulateColorScheme('light');
  await target.setViewport({ width: 1440, height: 900 });
  await openSeededProject();

  await target.click(selectors.getByRole('button', { name: /Search/u }));
  const commandFilter = selectors.getByPlaceholder('Search projects, chats, and actions...');
  await expectModernCommandInput(commandFilter);
  await target.press(commandFilter, 'Escape');

  const chatComposer = selectors.getByCss('[class*="group/chat-textarea"]');
  if (!(await target.isVisible(chatComposer))) {
    await target.click(selectors.getByRole('button', { name: 'Toggle Chat lane' }));
  }
  await target.expectVisible(chatComposer);
  const chatControlButtons = chatComposer.getByCss('button');
  await target.click(chatControlButtons.first());
  const modelFilter = selectors.getByPlaceholder('Search models...');
  await expectModernCommandInput(modelFilter);
  await target.press(modelFilter, 'Escape');

  await target.click(chatControlButtons.nth(1));
  const kernelFilter = selectors.getByPlaceholder('Search kernels...');
  await expectModernCommandInput(kernelFilter);
  await target.screenshot(selectors.getByCss('body'), 'workbench-command-search-light.png');
  await target.press(kernelFilter, 'Escape');

  const acceptCookies = selectors.getByRole('button', { name: 'Accept' });
  if (await target.isVisible(acceptCookies)) {
    await target.click(acceptCookies);
  }

  await target.setViewport({ width: 390, height: 844 });
  const chatToggle = selectors.getByRole('button', { name: 'Toggle Chat lane' });
  if (!(await target.isVisible(selectors.getByRole('button', { name: 'Open chat options' })))) {
    await target.click(chatToggle);
  }
  await target.click(selectors.getByRole('button', { name: 'Open chat options' }));
  const chatOptions = selectors.getByRole('dialog', { name: 'Chat Options' });
  await target.expectVisible(chatOptions);

  await target.click(chatOptions.getByText('AI model for responses', { exact: true }));
  const mobileModelFilter = selectors.getByPlaceholder('Search models...');
  await expectModernCommandInput(mobileModelFilter);
  await target.press(mobileModelFilter, 'Escape');
  await target.expectVisible(chatOptions);

  await target.click(chatOptions.getByText('CAD kernel for code execution', { exact: true }));
  const mobileKernelFilter = selectors.getByPlaceholder('Search kernels...');
  await expectModernCommandInput(mobileKernelFilter);
  await target.emulateColorScheme('dark');
  await target.screenshot(selectors.getByCss('body'), 'workbench-command-search-mobile-dark.png');
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
