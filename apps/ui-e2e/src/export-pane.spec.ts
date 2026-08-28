import { expect, test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import type { Locator } from 'vitest/browser';
import * as target from '#support/external-target.js';

const seedRoute = '/__e2e/project-file-tree';
const seedProjectName = 'sgenoud/models file-tree e2e';

const openCommand = async (name: string): Promise<void> => {
  await target.click(selectors.getByRole('button', { name: 'Search', exact: true }));
  const commandSearch = selectors.getByPlaceholder('Search projects, chats, and actions...');
  await target.fill(commandSearch, name);
  await target.click(selectors.getByRole('option', { name: new RegExp(`^${name}(?:\\s|$)`, 'u') }));
};

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
  await target.click(selectors.getByRole('button', { name: /^decline$/iu }), { timeout: 5000 }).catch(() => undefined);
};

const selectFormat = async (format: string): Promise<void> => {
  const button = selectors.getByRole('button', { name: new RegExp(`^${format}$`, 'iu') });
  await target.expectVisible(button, 15_000);
  if ((await target.getAttribute(button, 'aria-pressed')) !== 'true') {
    await target.click(button);
  }
};

const optionsDisclosure = (format: string): Locator =>
  selectors.getByRole('button', { name: new RegExp(`^${format} options (Defaults|Modified)$`, 'iu') });

test('keeps export option roots flat, disclosures independent, and the action reachable', async () => {
  await target.emulateColorScheme('light');
  await target.setViewport({ width: 1440, height: 900 });
  await openSeededProject();
  await openCommand('Export');

  const panel = selectors.getByCss('[data-slot="export-panel-body"]');
  await target.expectVisible(panel, 15_000);
  await selectFormat('STL');

  const stlOptions = optionsDisclosure('STL');
  await target.expectAttribute(stlOptions, 'aria-expanded', 'true');
  await target.expectVisible(selectors.getByRole('button', { name: 'Group: Tessellation' }), 15_000);
  await target.expectCount(panel.getByCss('[data-slot="parameter-catalog"]'), 0);
  await target.expectCount(panel.getByCss('[data-slot="embedded-form-root"]'), 1);

  await selectFormat('STEP');
  const stepOptions = optionsDisclosure('STEP');
  await target.expectAttribute(stepOptions, 'aria-expanded', 'true');
  await target.expectCount(panel.getByCss('[data-slot="embedded-form-root"]'), 2);

  await target.click(stlOptions);
  await target.expectAttribute(stlOptions, 'aria-expanded', 'false');
  await target.expectAttribute(stepOptions, 'aria-expanded', 'true');

  const surfaceState = await target.evaluateLocator(panel, (element) => {
    const scrollBody = element.querySelector<HTMLElement>('[data-slot="export-scroll-body"]');
    const footer = element.querySelector<HTMLElement>('[data-slot="export-action-footer"]');
    const destination = element.querySelector<HTMLElement>('section[aria-label="Destination"]');
    const embeddedRoot = element.querySelector<HTMLElement>('[data-slot="embedded-form-root"]');
    const ids = [...element.querySelectorAll<HTMLElement>('[id]')].map(({ id }) => id);
    if (!scrollBody || !footer || !destination || !embeddedRoot) {
      throw new Error('Export scroll surface, destination, embedded form, or action footer was missing.');
    }
    const embeddedRootStyle = getComputedStyle(embeddedRoot);
    return {
      footerInsideScroll: scrollBody.contains(footer),
      footerInsideDestination: destination.contains(footer),
      embeddedRootPaddingInline: [embeddedRootStyle.paddingLeft, embeddedRootStyle.paddingRight],
      idsAreUnique: ids.length === new Set(ids).size,
    };
  });
  expect(surfaceState).toEqual({
    footerInsideScroll: true,
    footerInsideDestination: true,
    embeddedRootPaddingInline: ['8px', '8px'],
    idsAreUnique: true,
  });
  const exportAction = panel.getByRole('button', { name: /Export 2 formats/iu });
  await target.expectCount(exportAction, 1);
  await target.screenshot(panel, 'export-pane-light-wide.png');

  await target.emulateColorScheme('dark');
  await target.setViewport({ width: 960, height: 760 });
  await target.expectVisible(stepOptions);
  await target.scrollIntoView(exportAction);
  await target.expectVisible(exportAction);
  await target.screenshot(panel, 'export-pane-dark-narrow.png');
});
