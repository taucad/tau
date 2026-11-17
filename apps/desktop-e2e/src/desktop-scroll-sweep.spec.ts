import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { launchDesktopApp } from '#support/desktop-app.js';
import type { DesktopSession } from '#support/desktop-app.js';
import { expectVisible, parkPointer } from '#support/scenario.js';

/*
 * The desktop scroll sweep (page composition policy Rule 1; desktop resilient startup blueprint D4.3, D4.6, T-A.2).
 *
 * The web sweep (`apps/ui-e2e/src/page-scroll-sweep.spec.ts`) covers every shared route; this one covers what only the
 * desktop renderer has, at the window floor of a 400 × 300 content area and at zoom factor 2 on top of it:
 *
 * - Files with 30 connected folders scrolls to its last row (the incident's page, finding A3);
 * - the drag band across the top of the window covers no control (`app-region: drag` swallows clicks in Electron
 *   whatever `pointer-events` says, so a control under it must opt out with `no-drag`);
 * - the window cannot be made smaller than its content floor (D4.6).
 */

/** The folders Files lists: as many as the incident's profile, more than any short window shows. */
/** The renderer page, typed through the harness so this spec stays outside the direct browser-driver boundary. */
type Page = DesktopSession['page'];

const folderCount = 30;
const floor = { width: 400, height: 300 } as const;
const folderName = (index: number): string => `scroll-folder-${String(index + 1).padStart(2, '0')}`;

let session: DesktopSession | undefined;
let pickedParent: string | undefined;

afterEach(async (context) => {
  if (context.task.result?.state === 'fail' && session) {
    await session.capture(`desktop-scroll-sweep-${context.task.id}`);
  }
  await session?.close();
  session = undefined;
});

afterAll(async () => {
  if (pickedParent) {
    await rm(pickedParent, { recursive: true, force: true });
  }
});

/** The renderer's own window: the one serving `app://`. */
const resizeContent = async (desktop: DesktopSession, width: number, height: number): Promise<number[]> =>
  desktop.application.evaluate(
    ({ BrowserWindow }, size) => {
      const window = BrowserWindow.getAllWindows().find((candidate) =>
        candidate.webContents.getURL().startsWith('app://'),
      );
      if (!window) {
        throw new Error('No app:// window is open.');
      }
      window.setContentSize(size.width, size.height);
      return window.getContentSize();
    },
    { width, height },
  );

const setZoomFactor = async (desktop: DesktopSession, factor: number): Promise<void> => {
  await desktop.application.evaluate(({ BrowserWindow }, zoom) => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (window.webContents.getURL().startsWith('app://')) {
        window.webContents.setZoomFactor(zoom);
      }
    }
  }, factor);
  // The layout viewport changes on the next frame.
  await desktop.page.evaluate(
    async () =>
      new Promise((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(resolve));
      }),
  );
};

type Reach = { readonly control: string; readonly inView: boolean; readonly onTop: boolean; readonly topmost: string };

/**
 * Scrolls `selector`'s last match into view (or, with no selector, reads the element Tab focused) and reports whether
 * it is in the viewport and the topmost element at the centre of its visible part.
 */
const reach = async (page: Page, selector: string | undefined): Promise<Reach> =>
  page.evaluate(async (target) => {
    const name = (element: Element | undefined): string =>
      element
        ? `${element.tagName.toLowerCase()}[${String(element.getAttribute('aria-label') ?? element.textContent)
            .trim()
            .slice(0, 40)}]`
        : 'none';
    const control =
      target === undefined
        ? document.activeElement instanceof HTMLElement
          ? document.activeElement
          : undefined
        : [...document.querySelectorAll<HTMLElement>(target)].at(-1);
    if (!control || control === document.body) {
      return { control: name(control), inView: false, onTop: false, topmost: 'none' };
    }
    if (target !== undefined) {
      control.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
    await new Promise((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(resolve));
    });
    const rect = control.getBoundingClientRect();
    const inView = rect.bottom > 0 && rect.right > 0 && rect.top < innerHeight && rect.left < innerWidth;
    const topmost =
      (inView
        ? document.elementFromPoint(
            (Math.max(rect.left, 0) + Math.min(rect.right, innerWidth)) / 2,
            (Math.max(rect.top, 0) + Math.min(rect.bottom, innerHeight)) / 2,
          )
        : undefined) ?? undefined;
    return {
      control: name(control),
      inView,
      onTop: topmost !== undefined && (topmost === control || control.contains(topmost)),
      topmost: name(topmost),
    };
  }, selector);

/** Shift+Tab from the document start lands on the last focusable control; it must be in view and usable. */
const expectLastControlByTab = async (page: Page, label: string): Promise<void> => {
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  });
  await page.keyboard.press('Shift+Tab');
  const byTab = await reach(page, undefined);
  expect.soft(byTab.control, `${label}: Shift+Tab reaches a control`).not.toBe('none');
  expect
    .soft(byTab, `${label}: the control Tab reaches is in view and on top`)
    .toMatchObject({ inView: true, onTop: true });
};

/** Every visible control whose box reaches into the drag band without opting out of the drag region. */
const controlsUnderDragBand = async (page: Page): Promise<string[]> =>
  page.evaluate(() => {
    const band = document.querySelector('[data-slot="desktop-drag-band"]');
    if (!band) {
      return ['no desktop drag band is rendered'];
    }
    const bandBottom = band.getBoundingClientRect().bottom;
    const region = (element: Element): string => {
      const style = getComputedStyle(element);
      return style.getPropertyValue('app-region') || style.getPropertyValue('-webkit-app-region');
    };
    return [
      ...document.querySelectorAll<HTMLElement>(
        'a[href], button, input, select, textarea, summary, [tabindex]:not([tabindex="-1"]), [role="button"]',
      ),
    ]
      .filter((element) => {
        if (!element.checkVisibility({ opacityProperty: true, visibilityProperty: true })) {
          return false;
        }
        const rect = element.getBoundingClientRect();
        if (rect.height === 0 || rect.width === 0 || rect.top >= bandBottom || rect.bottom <= 0) {
          return false;
        }
        for (let node: Element | undefined = element; node; node = node.parentElement ?? undefined) {
          const value = region(node);
          if (value === 'no-drag') {
            return false;
          }
          if (value === 'drag') {
            return true;
          }
        }
        // No ancestor opts out, so the band's drag region, drawn over the whole width, takes the click.
        return true;
      })
      .map(
        (element) =>
          `${element.tagName.toLowerCase()}[${String(element.getAttribute('aria-label') ?? element.textContent)
            .trim()
            .slice(0, 40)}] top=${String(Math.round(element.getBoundingClientRect().top))}`,
      );
  });

describe('desktop scroll sweep', () => {
  it('should hold the content area at 400 × 300 when the window is made smaller', async () => {
    session = await launchDesktopApp({ token: 'unused' });
    await expectVisible(session.page.locator('main').first(), 120_000);
    expect(await resizeContent(session, 100, 100)).toEqual([floor.width, floor.height]);
  });

  it('should scroll Files with 30 folders to its last row at the floor and at zoom 2', async () => {
    pickedParent = await mkdtemp(join(tmpdir(), 'tau-desktop-e2e-scroll-'));
    const folders = Array.from({ length: folderCount }, (_, index) => join(pickedParent ?? '', folderName(index)));
    await Promise.all(folders.map(async (folder) => mkdir(folder, { recursive: true })));
    /* The dialog stub answers each pick with the next folder (`pickedDirectories`, WP12's harness option). Passed as a
     * variable so this file also compiles against a harness that predates the option; there it picks one folder and
     * this row stays red. */
    const options: Parameters<typeof launchDesktopApp>[0] & { readonly pickedDirectories: readonly string[] } = {
      token: 'unused',
      pickedDirectories: folders,
    };
    session = await launchDesktopApp(options);
    const { page } = session;

    await page.goto('app://tau/files', { waitUntil: 'domcontentloaded' });
    const addWorkspace = page.getByRole('button', { name: 'Add workspace', exact: true });
    for (const name of folders.map((_, index) => folderName(index))) {
      // oxlint-disable-next-line no-await-in-loop -- Each pick takes the dialog stub's next folder, in order.
      await parkPointer(page);
      // oxlint-disable-next-line no-await-in-loop -- See above.
      await expect.poll(async () => addWorkspace.isEnabled(), { timeout: 60_000 }).toBe(true);
      // oxlint-disable-next-line no-await-in-loop -- See above.
      await addWorkspace.click();
      // oxlint-disable-next-line no-await-in-loop -- See above.
      await expectVisible(page.getByText(name, { exact: true }).first(), 60_000);
    }

    await resizeContent(session, floor.width, floor.height);
    for (const zoom of [1, 2]) {
      // oxlint-disable-next-line no-await-in-loop -- The floor, then the floor at zoom 2, on one page.
      await setZoomFactor(session, zoom);
      const label = `Files at ${String(floor.width)}×${String(floor.height)}, zoom ${String(zoom)}`;
      // oxlint-disable-next-line no-await-in-loop -- See above.
      const lastRow = await page.evaluate(
        (name) => {
          const match = [...document.querySelectorAll('main *')].findLast(
            (element) => element.children.length === 0 && element.textContent.trim() === name,
          );
          if (match instanceof HTMLElement) {
            match.dataset['scrollSweepLastRow'] = '';
          }
          return match !== undefined;
        },
        folderName(folderCount - 1),
      );
      expect(lastRow, `${label}: the last folder row is rendered`).toBe(true);
      // oxlint-disable-next-line no-await-in-loop -- See above.
      const lastRowReach = await reach(page, '[data-scroll-sweep-last-row]');
      expect
        .soft(lastRowReach, `${label}: the last folder row scrolls into view`)
        .toMatchObject({ inView: true, onTop: true });
      // oxlint-disable-next-line no-await-in-loop -- See above.
      await expectLastControlByTab(page, label);
    }
    await setZoomFactor(session, 1);
  });

  it('should keep every control out from under the drag band at the floor and at zoom 2', async () => {
    session = await launchDesktopApp({ token: 'unused' });
    const { page } = session;
    await resizeContent(session, floor.width, floor.height);
    for (const route of ['/', '/files', '/projects', '/auth/sign-in']) {
      // oxlint-disable-next-line no-await-in-loop -- Each route is opened and measured in turn.
      await page.goto(`app://tau${route}`, { waitUntil: 'domcontentloaded' });
      // oxlint-disable-next-line no-await-in-loop -- See above.
      await expectVisible(page.locator('h1, main').first(), 60_000);
      for (const zoom of [1, 2]) {
        // oxlint-disable-next-line no-await-in-loop -- See above.
        await setZoomFactor(session, zoom);
        // oxlint-disable-next-line no-await-in-loop -- See above.
        expect.soft(await controlsUnderDragBand(page), `${route} at zoom ${String(zoom)}`).toEqual([]);
      }
      // oxlint-disable-next-line no-await-in-loop -- See above.
      await setZoomFactor(session, 1);
    }
  });

  // The database panel is WP9's (`hooks/use-file-manager.tsx`) and the safe-mode bar WP6/WP13's; neither exists on
  // this branch's base. Each row becomes a test in the package that adds its surface.
  it.todo('should reach the last button of the database panel at the floor and at zoom 2');
  it.todo('should reach the last button of the safe-mode bar at the floor and at zoom 2');
});
