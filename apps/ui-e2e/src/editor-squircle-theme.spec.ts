import { expect, test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import type { Locator } from 'vitest/browser';
import * as target from '#support/external-target.js';

const seedRoute = '/__e2e/project-file-tree';
const seedProjectRoute = '/w/home/sgenoud-models-file-tree-e2e';
const mainPath = 'public/models/honeycomb.js';
const expectedSquircle = 'superellipse(1.5)';

const openSeededProject = async (): Promise<void> => {
  await target.navigate(seedRoute);
  try {
    await target.expectUrl(/\/w\/[^/]+\/[^/]+/u, 10_000);
  } catch {
    await target.navigate(seedProjectRoute);
    await target.expectUrl(/\/w\/[^/]+\/[^/]+/u, 60_000);
  }

  await target.expectVisible(selectors.getByCss('[aria-label="Ask Tau to build anything..."]'), 60_000);
  await target.click(selectors.getByRole('button', { name: /^decline$/iu }), { timeout: 5000 }).catch(() => undefined);
};

const openParameters = async (): Promise<void> => {
  await target.click(selectors.getByRole('button', { name: 'Search', exact: true }));
  const commandSearch = selectors.getByPlaceholder('Search projects, chats, and actions...');
  await target.fill(commandSearch, 'Open parameters');
  await target.click(selectors.getByText('Open parameters', { exact: true }));
};

type CornerGeometry = {
  readonly radius: string;
  readonly shape: string;
};

const readCornerGeometry = async (element: Locator): Promise<CornerGeometry> =>
  target.evaluateLocator(element, (node) => {
    const style = getComputedStyle(node);
    return {
      radius: style.borderTopLeftRadius,
      shape: style.getPropertyValue('corner-shape').trim(),
    };
  });

const readComposerCornerGeometry = async (editor: Locator): Promise<CornerGeometry> =>
  target.evaluateLocator(editor, (node) => {
    let candidate: HTMLElement | undefined = node as HTMLElement;
    while (candidate && candidate !== document.body) {
      const style = getComputedStyle(candidate);
      if (Number.parseFloat(style.borderTopWidth) > 0 && Number.parseFloat(style.borderTopLeftRadius) > 0) {
        return {
          radius: style.borderTopLeftRadius,
          shape: style.getPropertyValue('corner-shape').trim(),
        };
      }
      candidate = candidate.parentElement ?? undefined;
    }
    throw new Error('The bordered chat composer surface was missing.');
  });

test('should apply the shared squircle curve while preserving semantic circles', async () => {
  await target.emulateColorScheme('light');
  await target.setViewport({ width: 1440, height: 900 });
  await openSeededProject();
  await openParameters();

  const supportsSquircle = await target.evaluate((curve) => CSS.supports('corner-shape', curve), expectedSquircle);
  const expectedShape = supportsSquircle ? expectedSquircle : '';

  const composer = selectors.getByCss('[aria-label="Ask Tau to build anything..."]');
  const parametersTab = selectors.getByRole('tab', { name: 'Parameters', exact: true });
  const filter = selectors.getByRole('textbox', { name: 'Filter parameters' });
  const fullRoundAction = selectors.getByRole('button', { name: 'Add context' });
  const disclosure = selectors.getByRole('button', { name: mainPath, exact: true });

  await target.expectVisible(composer, 60_000);
  await target.expectVisible(parametersTab, 15_000);
  await target.expectVisible(filter, 15_000);
  await target.expectVisible(fullRoundAction);
  await target.expectVisible(disclosure, 60_000);

  expect(await readComposerCornerGeometry(composer)).toEqual({
    radius: supportsSquircle ? '28.5px' : '21px',
    shape: expectedShape,
  });
  expect(await readCornerGeometry(parametersTab)).toEqual({
    radius: supportsSquircle ? '12px' : '9px',
    shape: expectedShape,
  });
  expect(await readCornerGeometry(filter)).toEqual({
    radius: supportsSquircle ? '15px' : '11px',
    shape: expectedShape,
  });
  const fullRoundGeometry = await readCornerGeometry(fullRoundAction);
  expect(fullRoundGeometry.shape).toBe(supportsSquircle ? 'round' : '');

  const attachedSurface = await target.evaluateLocator(disclosure, (node) => {
    const header = node.closest<HTMLElement>('[data-slot="paneview-header"]');
    const pane = node.closest<HTMLElement>('.dv-pane');
    const body = pane?.querySelector<HTMLElement>('[data-slot="parameters"]');
    if (!header || !body) {
      throw new Error('The attached Parameters surface was incomplete.');
    }

    return {
      bodyShape: getComputedStyle(body).getPropertyValue('corner-shape').trim(),
      headerShape: getComputedStyle(header).getPropertyValue('corner-shape').trim(),
      seam: Math.abs(header.getBoundingClientRect().bottom - body.getBoundingClientRect().top),
    };
  });
  expect(attachedSurface.bodyShape).toBe(expectedShape);
  expect(attachedSurface.headerShape).toBe(expectedShape);
  expect(attachedSurface.seam).toBeLessThanOrEqual(1);

  await target.focus(filter);
  const focusedFilter = await target.evaluateLocator(filter, (node) => {
    const style = getComputedStyle(node);
    return {
      boxShadow: style.boxShadow,
      cornerShape: style.getPropertyValue('corner-shape').trim(),
      focused: document.activeElement === node,
    };
  });
  expect(focusedFilter.focused).toBe(true);
  expect(focusedFilter.cornerShape).toBe(expectedShape);
  expect(focusedFilter.boxShadow).not.toBe('none');

  await target.screenshot(selectors.getByCss('body'), 'editor-squircle-wide-light.png');
  await target.emulateColorScheme('dark');
  await target.screenshot(selectors.getByCss('body'), 'editor-squircle-wide-dark.png');
  await target.setViewport({ width: 1024, height: 800 });
  await target.screenshot(selectors.getByCss('body'), 'editor-squircle-narrow-dark.png');
});
