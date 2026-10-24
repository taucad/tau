import { expect, test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import type { Locator } from 'vitest/browser';
import * as target from '#support/external-target.js';
import { prepareComposerPage } from '#support/chat-attachments.js';

/**
 * The phone pane pass (charter W6, T6) on the production route at 320px: each pane the pass changed opens in the
 * sheet without horizontal overflow, no control in it is smaller than the 24px floor (I3), and its filter and
 * typed fields take the 40px touch row under a coarse pointer. Unit tests prove each pane's behavior; this proves
 * the real layout at the narrowest width.
 */

const navigation = (): Locator => selectors.getByRole('navigation', { name: 'Workbench' });
const navButton = (name: string): Locator => navigation().getByRole('button', { name, exact: true });
const allSheet = (): Locator => selectors.getByRole('dialog', { name: 'All surfaces' });
const surface = (title: string): Locator => selectors.getByRole('region', { name: title, exact: true });

/** Panes the pass changed, opened as a person would: Parameters from the nav, the rest from All. */
const panes = [
  'Parameters',
  'Files',
  'Model tree',
  'Kinematics',
  'Revisions',
  'Share',
  'Export',
  'Details',
  'Jobs',
  'Agents',
] as const;

type Measurement = Readonly<{
  overflow: number;
  undersized: readonly string[];
  shortFields: readonly string[];
}>;

/**
 * Measures one open pane in the page. Self-contained: it is serialized into the target page.
 *
 * A control meets the floor through its own box or through a label that activates it (a switch row, a checkbox
 * label). An inline link inside running text is exempt, as WCAG 2.5.8 exempts it.
 */
const measurePane = (region: Element): Measurement => {
  const floor = 24;
  const touchRow = 40;
  const isShown = (element: Element): boolean => {
    const box = element.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) {
      return false;
    }
    const style = getComputedStyle(element);
    return style.visibility !== 'hidden' && Number(style.opacity) > 0 && element.closest('[aria-hidden=true]') === null;
  };
  const meets = (box: DOMRect): boolean => box.width >= floor - 0.5 && box.height >= floor - 0.5;
  const nameOf = (element: Element): string =>
    `${element.tagName.toLowerCase()}[${element.getAttribute('aria-label') ?? element.textContent.trim().slice(0, 40)}]`;
  const controls = region.querySelectorAll(
    'button, a[href], input:not([type=hidden]), select, textarea, [role=switch], [role=checkbox], [role=radio], [role=slider], [role=combobox], [role=tab]',
  );
  const undersized: string[] = [];
  for (const control of controls) {
    if (!isShown(control) || meets(control.getBoundingClientRect())) {
      continue;
    }
    if (control.tagName === 'A' && control.closest('p') !== null) {
      continue;
    }
    const labels = [
      ...((control as HTMLInputElement).labels ?? []),
      ...(control.closest('label') ? [control.closest('label')!] : []),
    ];
    if (labels.some((label) => isShown(label) && meets(label.getBoundingClientRect()))) {
      continue;
    }
    undersized.push(nameOf(control));
  }
  const shortFields: string[] = [];
  // The fields the pass moved to the touch row: pane filters, and parameter and joint values.
  for (const field of region.querySelectorAll(
    'input[type=search], [data-slot=parameters] input:not([type=hidden]), [data-slot=kinematics-joint] input',
  )) {
    if (isShown(field) && field.getBoundingClientRect().height < touchRow - 0.5) {
      shortFields.push(nameOf(field));
    }
  }
  const content = region.querySelector('[data-slot=floating-panel-content]') ?? region;
  return {
    overflow: Math.max(
      region.scrollWidth - region.clientWidth,
      content.scrollWidth - content.clientWidth,
      document.documentElement.scrollWidth - window.innerWidth,
    ),
    undersized,
    shortFields,
  };
};

test('opens every changed pane at 320×640 with no horizontal overflow and no target under 24px', async () => {
  await target.commands.uiOpenTarget({ hasTouch: true, isMobile: true });
  await prepareComposerPage();
  await target.setViewport({ width: 320, height: 640 });
  await target.navigate('/__e2e/chat-attachments');
  await target.expectUrl(/\/w\/[^/]+\/[^/?]+\?/u, 60_000);
  await target.expectVisible(navigation(), 60_000);
  // The touch rows below are coarse-pointer rules; the emulated phone must report a coarse pointer (D12).
  expect(await target.evaluate(() => globalThis.matchMedia('(pointer: coarse)').matches)).toBe(true);

  for (const title of panes) {
    if (title === 'Parameters') {
      // oxlint-disable-next-line no-await-in-loop -- one pane at a time, as a person taps.
      await target.click(navButton('Parameters'), { touch: true });
    } else {
      // oxlint-disable-next-line no-await-in-loop -- one pane at a time.
      await target.click(navButton('All'), { touch: true });
      // oxlint-disable-next-line no-await-in-loop -- one pane at a time.
      await target.click(allSheet().getByRole('button', { name: title, exact: true }), { touch: true });
    }
    // oxlint-disable-next-line no-await-in-loop -- one pane at a time.
    await target.expectVisible(surface(title), 60_000);
    // The pane's own Close, named after it (D4, I6).
    // oxlint-disable-next-line no-await-in-loop -- one pane at a time.
    await target.expectVisible(surface(title).getByRole('button', { name: `Close ${title}`, exact: true }));

    // Lazy bodies settle after the region mounts; poll until the measurement is clean or the poll times out.
    // oxlint-disable-next-line no-await-in-loop -- one pane at a time.
    await expect
      .poll(async () => target.evaluateLocator(surface(title), measurePane), { timeout: 15_000 })
      .toEqual({ overflow: expect.any(Number) as number, undersized: [], shortFields: [] });
    // oxlint-disable-next-line no-await-in-loop -- one pane at a time.
    const { overflow } = await target.evaluateLocator(surface(title), measurePane);
    expect(overflow, `${title} scrolls sideways at 320px`).toBeLessThanOrEqual(0);

    // oxlint-disable-next-line no-await-in-loop -- one pane at a time.
    await target.click(navButton('Model'), { touch: true });
    // oxlint-disable-next-line no-await-in-loop -- one pane at a time.
    await target.expectCount(selectors.getByCss('[data-slot="mobile-surface"]'), 0);
  }
});
