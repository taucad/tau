import { expect, test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import type { Locator } from 'vitest/browser';
import * as target from '#support/external-target.js';

/**
 * The phone pane pass (charter W6, T6) on the production route at 320px. Each listed pane opens in the sheet with
 * its named Close, without horizontal overflow, with no control under the 24px floor (I3), and with its filter on
 * the 40px touch row under a coarse pointer.
 *
 * The seed (`/__e2e/project-file-tree?main=touch-parameters`) renders one number and one boolean parameter, so the
 * Parameters check is not vacuous: it requires a typed field and a switch row, both 40px tall. The seed has no
 * mechanism, so Kinematics is checked for fit, targets and its filter only. Telemetry and Console also changed but
 * are behind debug mode, which this route does not turn on; unit tests cover them.
 */

const seedRoute = '/__e2e/project-file-tree?main=touch-parameters';
const seedProjectName = 'Touch parameters e2e';

const navigation = (): Locator => selectors.getByRole('navigation', { name: 'Workbench' });
const navButton = (name: string): Locator => navigation().getByRole('button', { name, exact: true });
const allSheet = (): Locator => selectors.getByRole('dialog', { name: 'All surfaces' });
const surface = (title: string): Locator => selectors.getByRole('region', { name: title, exact: true });

/**
 * Opened as a person would: Parameters from the nav, the rest from All. Revisions, Jobs and Agents needed no change
 * in the pass; they stay here as a 320px regression guard.
 */
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
  /** Parameter value fields and switch rows measured, so the Parameters check can require data. */
  parameterFields: number;
  switchRows: number;
}>;

/**
 * Measures one open pane in the page. Self-contained: it is serialized into the target page.
 *
 * A control meets the floor through its own box, through a label that activates it (a checkbox or radio label), or,
 * for a parameter switch, through its switch row: the switch's ::after spans the row, and a pseudo-element has no
 * box of its own to measure. An inline link inside running text is exempt, as WCAG 2.5.8 exempts it.
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
    const switchRow = control.getAttribute('role') === 'switch' ? control.closest('[data-switch-row]') : null;
    if (switchRow !== null && isShown(switchRow) && meets(switchRow.getBoundingClientRect())) {
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
  // A boolean's row is its switch's target (canvas review R2), so the row takes the touch row too.
  const switchRows = [...region.querySelectorAll('[data-switch-row]')].filter((row) => isShown(row));
  for (const row of switchRows) {
    if (row.getBoundingClientRect().height < touchRow - 0.5) {
      shortFields.push(`switch row[${row.textContent.trim().slice(0, 40)}]`);
    }
  }
  const content = region.querySelector('[data-slot=floating-panel-content]') ?? region;
  return {
    parameterFields: [...region.querySelectorAll('[data-slot=parameters] input:not([type=hidden])')].filter((field) =>
      isShown(field),
    ).length,
    switchRows: switchRows.length,
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
  await target.setViewport({ width: 320, height: 640 });
  await target.navigate(seedRoute);
  try {
    await target.expectUrl(/\/w\/[^/]+\/[^/]+/u, 10_000);
  } catch {
    // A reused browser already holds the seeded project; open it from the list, as the other seed specs do.
    const project = selectors.getByRole('link', { name: seedProjectName }).first();
    await target.expectVisible(project, 60_000);
    const href = await target.getAttribute(project, 'href');
    if (!href) {
      throw new Error('Seeded project link did not include an href.');
    }
    await target.navigate(href);
    await target.expectUrl(/\/w\/[^/]+\/[^/]+/u, 60_000);
  }
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
      .poll(
        async () => {
          const measured = await target.evaluateLocator(surface(title), measurePane);
          // Parameters is measured once the seeded number and boolean have rendered, never on an empty pane.
          return title === 'Parameters' && (measured.parameterFields === 0 || measured.switchRows === 0)
            ? { ...measured, undersized: ['parameters not rendered yet'] }
            : measured;
        },
        { timeout: 60_000 },
      )
      .toMatchObject({ undersized: [], shortFields: [] });
    // oxlint-disable-next-line no-await-in-loop -- one pane at a time.
    const measured = await target.evaluateLocator(surface(title), measurePane);
    expect(measured.overflow, `${title} scrolls sideways at 320px`).toBeLessThanOrEqual(0);
    if (title === 'Parameters') {
      expect(measured.parameterFields).toBeGreaterThan(0);
      expect(measured.switchRows).toBeGreaterThan(0);
    }

    // oxlint-disable-next-line no-await-in-loop -- one pane at a time.
    await target.click(navButton('Model'), { touch: true });
    // oxlint-disable-next-line no-await-in-loop -- one pane at a time.
    await target.expectCount(selectors.getByCss('[data-slot="mobile-surface"]'), 0);
  }
});
