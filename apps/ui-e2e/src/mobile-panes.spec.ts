import { expect, test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import type { Locator } from 'vitest/browser';
import * as target from '#support/external-target.js';
import { waitForStageReady } from '#support/viewer-stage.js';

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
 * Opened as a person would: Parameters from the nav, the rest from All. Revisions and Agents needed no change in the
 * pass; they stay here as a 320px regression guard. Jobs is not shipped, so All does not list it.
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
  // A number field is a slider input: its text input stays transparent until it is edited, and the person sees and
  // taps the slider's own box, so that box is the field.
  const fieldOf = (input: Element): Element => input.closest('[data-slot=slider-input]') ?? input;
  const shortFields: string[] = [];
  // The fields the pass moved to the touch row: pane filters, and parameter and joint values.
  for (const input of region.querySelectorAll(
    'input[type=search], [data-slot=parameters] input:not([type=hidden]), [data-slot=kinematics-joint] input',
  )) {
    const field = fieldOf(input);
    if (isShown(field) && field.getBoundingClientRect().height < touchRow - 0.5) {
      shortFields.push(nameOf(input));
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
    parameterFields: [...region.querySelectorAll('[data-slot=parameters] input:not([type=hidden])')].filter((input) =>
      isShown(fieldOf(input)),
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
  await waitForStageReady();
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

const grabber = (): Locator => selectors.getByRole('slider', { name: 'Drawer height' });

/**
 * What a pointer reaches on the pane's header strip: each visible header control at its centre must be that control
 * (on top of the grabber's target, which reaches over the strip), and the strip's blank middle must be the grabber's
 * target, so dragging there moves the sheet (I3, W1). Self-contained: it is serialized into the target page.
 */
const probeHeaderStrip = (region: Element): Readonly<{ covered: readonly string[]; blankIsGrabber: boolean }> => {
  const header = region.querySelector('[data-slot=floating-panel-content-header]');
  if (!header) {
    return { covered: ['no header'], blankIsGrabber: false };
  }
  const covered: string[] = [];
  for (const control of header.querySelectorAll<HTMLElement>('button, a[href], [role=button], [tabindex]')) {
    const box = control.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) {
      continue;
    }
    const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    if (!hit || !control.contains(hit)) {
      covered.push(control.getAttribute('aria-label') ?? control.textContent.trim());
    }
  }
  // The strip's blank middle: between the title and the actions, clear of every control.
  const box = header.getBoundingClientRect();
  const controls = [...header.querySelectorAll('button, a[href], [role=button]')].map((control) =>
    control.getBoundingClientRect(),
  );
  const title = header.firstElementChild?.getBoundingClientRect();
  const left = Math.max(box.left, ...controls.filter((c) => c.right < box.left + box.width / 2).map((c) => c.right));
  const right = Math.min(box.right, ...controls.filter((c) => c.left > box.left + box.width / 2).map((c) => c.left));
  const x = title && title.right < right ? (Math.max(left, title.right) + right) / 2 : (left + right) / 2;
  const blank = document.elementFromPoint(x, box.top + box.height / 2);
  return { covered, blankIsGrabber: blank?.closest('[data-vaul-handle]') !== null && blank !== null };
};

test('holds Parameters, Files, Revisions and Kinematics at half at 320×640, their header strips dragging the sheet', async () => {
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
  await waitForStageReady();

  for (const title of ['Parameters', 'Files', 'Revisions', 'Kinematics'] as const) {
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
    await target.expectVisible(surface(title).getByRole('button', { name: `Close ${title}`, exact: true }), 60_000);
    // oxlint-disable-next-line no-await-in-loop -- one pane at a time.
    expect(await target.getAttribute(grabber(), 'aria-valuetext'), `${title} opens at half`).toBe('Half');
    /* Its body loads and lays out after it opens: across 2s, sampled every frame, the sheet never raises itself.
     * Only a decision above the composer may raise it (I5); a pane that holds more than half shows scrolls. */
    // oxlint-disable-next-line no-await-in-loop -- one pane at a time.
    const heldDetents = await target.evaluateLocator(grabber(), async (handle) => {
      const seen = new Set<string>();
      const until = performance.now() + 2000;
      while (performance.now() < until) {
        seen.add(handle.getAttribute('aria-valuetext') ?? '');
        // oxlint-disable-next-line no-await-in-loop -- one sample per frame.
        await new Promise<void>((resolve) => {
          requestAnimationFrame(() => {
            resolve();
          });
        });
      }
      return [...seen];
    });
    expect(heldDetents, `${title} holds at half`).toEqual(['Half']);
    // oxlint-disable-next-line no-await-in-loop -- one pane at a time.
    expect(await target.evaluateLocator(surface(title), probeHeaderStrip), `${title}'s header strip`).toEqual({
      covered: [],
      blankIsGrabber: true,
    });

    // oxlint-disable-next-line no-await-in-loop -- one pane at a time.
    await target.click(navButton('Model'), { touch: true });
    // oxlint-disable-next-line no-await-in-loop -- one pane at a time.
    await target.expectCount(selectors.getByCss('[data-slot="mobile-surface"]'), 0);
  }
});
