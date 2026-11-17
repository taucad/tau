import { describe, expect, test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import type { Locator } from 'vitest/browser';
import * as target from '#support/external-target.js';
import { measureHorizontalOverflow } from '#support/page-audit.js';

/*
 * The short-viewport scroll sweep (page composition policy Rule 1; desktop resilient startup blueprint D4.3, T-A.1).
 *
 * Pages always scroll to their full content. Every document route, wrapped and wrapperless, is opened and then held at
 * a short laptop window, a phone, the desktop window floor and the floor at 200 % zoom (a 400 × 300 window at zoom 2 is
 * a 200 × 150 CSS viewport). At each size the last focusable control must be reachable two ways: by Tab (Shift+Tab
 * from the document start lands on it) and by scrolling it into view, and either way it must be the topmost element at
 * its own centre, so it is neither clipped by an ancestor nor covered. From 320 px up nothing may overflow sideways.
 * The same holds for the Settings dialog, an alert dialog, the phone sidebar sheet and the root error document at the
 * floor. The workbench and its preview are the reviewed `contained` routes and are not swept here.
 */

type Viewport = { readonly width: number; readonly height: number };

/** 1280 × 480 and 390 × 640 from the blueprint; 400 × 300 is the desktop content floor; 200 × 150 is it at zoom 2. */
const viewports: readonly Viewport[] = [
  { width: 1280, height: 480 },
  { width: 390, height: 640 },
  { width: 400, height: 300 },
  { width: 200, height: 150 },
];
const floor: Viewport = { width: 400, height: 300 };
/** The narrowest width the product lays out for without sideways overflow (route accessibility sweep). */
const reflowWidth = 320;

/** Every document route a visitor can open without data of their own, by the URL it serves. */
const wrappedRoutes = [
  '/',
  '/community',
  '/projects',
  '/projects/new',
  '/files',
  '/plugins',
  '/parts',
  '/convert',
  '/workflows',
  '/usage',
  '/machines',
  '/machines/e2e-host/e2e-machine',
  '/import',
  '/invitations/e2e-invitation-token',
  '/welcome',
  '/loader',
  '/loader/glass',
  '/github/complete',
  '/no-such-page',
] as const;
/** Routes that opt out of the shell's wrapper (`enablePageWrapper: false`) and get the wrapperless scroller. */
const wrapperlessRoutes = [
  '/auth/sign-in',
  '/auth/sign-up',
  '/auth/forgot-password',
  '/auth/desktop',
  '/auth/cli',
  '/connect/github-gist',
  '/s/e2e-missing-share',
] as const;

type Reach = {
  /** How many focusable controls the scope holds; zero means there is nothing to reach. */
  readonly focusable: number;
  /** A short description of the control checked. */
  readonly control: string;
  /** The control's box intersects the viewport. */
  readonly inView: boolean;
  /** The control (or a descendant) is the topmost element at the centre of its visible part. */
  readonly onTop: boolean;
  readonly topmost: string;
};

/**
 * Scrolls the scope's last focusable control into view, or, with `active`, reads the focused element as Tab left it,
 * and reports whether it can be seen and used where it landed.
 */
const reach = async (scope: string | undefined, active: boolean): Promise<Reach> =>
  target.evaluate(
    async ({ scope: scopeSelector, active: readActive }) => {
      const name = (element: Element | undefined): string =>
        element
          ? `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ''}[${String(
              element.getAttribute('aria-label') ?? element.textContent,
            )
              .trim()
              .slice(0, 40)}]`
          : 'none';
      const root =
        (scopeSelector ? document.querySelector(scopeSelector) : undefined) ??
        document.querySelector('main') ??
        document.body;
      const focusable = [
        ...root.querySelectorAll<HTMLElement>(
          'a[href], button, input, select, textarea, summary, [tabindex], [contenteditable="true"]',
        ),
      ].filter(
        (element) =>
          !(element as HTMLButtonElement).disabled &&
          element.tabIndex >= 0 &&
          !element.closest('[inert], [aria-hidden="true"]') &&
          element.checkVisibility({ opacityProperty: true, visibilityProperty: true }),
      );
      const control = readActive
        ? document.activeElement instanceof HTMLElement
          ? document.activeElement
          : undefined
        : focusable.at(-1);
      if (!control || control === document.body) {
        return { focusable: focusable.length, control: name(control), inView: false, onTop: false, topmost: 'none' };
      }
      if (!readActive) {
        control.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      }
      // Smooth scrolling and focus scrolling settle over a frame or two.
      await new Promise((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(resolve));
      });
      const rect = control.getBoundingClientRect();
      const inView = rect.bottom > 0 && rect.right > 0 && rect.top < innerHeight && rect.left < innerWidth;
      const x = (Math.max(rect.left, 0) + Math.min(rect.right, innerWidth)) / 2;
      const y = (Math.max(rect.top, 0) + Math.min(rect.bottom, innerHeight)) / 2;
      const topmost = (inView ? document.elementFromPoint(x, y) : undefined) ?? undefined;
      return {
        focusable: focusable.length,
        control: name(control),
        inView,
        onTop: topmost !== undefined && (topmost === control || control.contains(topmost)),
        topmost: name(topmost),
      };
    },
    { scope, active },
  );

/** Moves focus to the document start, or the scope's first control, then presses Shift+Tab once. */
const tabBackward = async (scope: string | undefined): Promise<void> => {
  await target.evaluate((scopeSelector) => {
    const root = scopeSelector ? document.querySelector<HTMLElement>(scopeSelector) : undefined;
    if (root) {
      // A modal traps focus and Shift+Tab from its first control wraps to its last.
      root
        .querySelector<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), [tabindex="0"]')
        ?.focus();
    } else if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  }, scope ?? null);
  await target.keyboardPress('Shift+Tab');
};

/** Asserts both ways of reaching the last control at the current size. */
const expectReachable = async (label: string, scope?: string): Promise<void> => {
  await tabBackward(scope);
  const byTab = await reach(scope, true);
  expect.soft(byTab.control, `${label}: Shift+Tab reaches a control`).not.toBe('none');
  expect
    .soft(byTab, `${label}: the control Tab reaches is in view and on top`)
    .toMatchObject({ inView: true, onTop: true });

  const byScroll = await reach(scope, false);
  if (byScroll.focusable > 0) {
    expect
      .soft(byScroll, `${label}: the last focusable control scrolls into view and is on top`)
      .toMatchObject({ inView: true, onTop: true });
  }
};

/** Waits until the route has drawn a heading, a landmark or the error document, whichever it renders. */
const settle = async (): Promise<void> => {
  await target
    .waitFor(() => document.querySelector('h1, h2, main, [data-slot="root-error-document"]') !== null, undefined, {
      timeout: 60_000,
    })
    .catch(() => undefined);
  await target.delay(250);
};

const sweepCurrentPage = async (route: string): Promise<void> => {
  for (const viewport of viewports) {
    // oxlint-disable-next-line no-await-in-loop -- Each size is set, laid out and measured in turn on one page.
    await target.setViewport(viewport);
    // oxlint-disable-next-line no-await-in-loop -- See above.
    await target.delay(150);
    const size = `${route} at ${String(viewport.width)}×${String(viewport.height)}`;
    // oxlint-disable-next-line no-await-in-loop -- See above.
    await expectReachable(size);
    if (viewport.width >= reflowWidth) {
      // oxlint-disable-next-line no-await-in-loop -- See above.
      const overflow = await measureHorizontalOverflow();
      expect.soft(overflow.document, `${size}: no sideways overflow of the document`).toBe(0);
      expect.soft(overflow.offenders, `${size}: no element wider than the viewport`).toEqual([]);
    }
  }
};

describe('page scroll sweep', () => {
  describe.each([
    ...wrappedRoutes.map((route) => ['wrapped', route]),
    ...wrapperlessRoutes.map((route) => ['wrapperless', route]),
  ])('%s %s', (_kind, route) => {
    test('should reach its last control by Tab and by scrolling at every short viewport', async () => {
      await target.setViewport(viewports[0]!);
      await target.navigate(route);
      await settle();
      await sweepCurrentPage(route);
      await target.screenshot(undefined, `page-scroll-sweep${route.replaceAll('/', '-')}-floor.png`);
    });
  });

  test('should reach the last control of the Settings dialog at the floor', async () => {
    await target.setViewport(floor);
    await target.navigate('/?settings=general');
    const dialog = selectors.getByRole('dialog', { name: 'Settings' });
    await target.expectVisible(dialog, 60_000);
    await expectReachable('Settings dialog', '[role="dialog"]');
  });

  test('should reach the last control of the phone sidebar sheet at the floor', async () => {
    await target.setViewport(floor);
    await target.navigate('/projects');
    await settle();
    await target.click(selectors.getByRole('button', { name: 'Open sidebar', exact: true }));
    const sheet = selectors.getByRole('dialog', { name: 'Sidebar' });
    await target.expectVisible(sheet, 30_000);
    await target.evaluateLocator(sheet, async (element) => {
      await Promise.all(element.getAnimations().map(async (animation) => animation.finished.catch(() => undefined)));
    });
    await expectReachable('Sidebar sheet', '[role="dialog"]');
  });

  /**
   * An alert dialog the e2e build can raise without data: the AR recovery alert. Chromium has no AR runtime, so
   * `immersive-ar` is emulated with a session request the camera permission refuses (the viewer-ar precedent).
   */
  test('should reach the last control of an alert dialog at the floor', async () => {
    await target.addInitScript(() => {
      Object.defineProperty(globalThis, 'XRSession', {
        configurable: true,
        value: class {
          public requestHitTestSource(): undefined {
            return undefined;
          }
        },
      });
      Object.defineProperty(navigator, 'xr', {
        configurable: true,
        value: {
          isSessionSupported: async (mode: string) => mode === 'immersive-ar',
          requestSession: async () => {
            throw new DOMException('Emulated permission refusal', 'NotAllowedError');
          },
        },
      });
    });
    await target.setViewport(floor);
    await target.navigate('/__e2e/example-fixture?locator=jscad.section-picking-fixture&graphicsBackend=webgl');
    await target.expectVisible(selectors.getByCss('canvas[data-engine]'), 60_000);
    const arButton: Locator = selectors.getByRole('button', { name: 'View in your space', exact: true });
    await target.expectVisible(arButton, 30_000);
    await target.click(arButton);
    await target.expectVisible(selectors.getByRole('alertdialog', { name: 'Camera access is off' }));
    await expectReachable('AR recovery alert', '[role="alertdialog"]');
  });

  /** An invalid fixture makes a loader throw on a route with no boundary of its own, so the root error page renders. */
  test('should scroll the root error document at every short viewport', async () => {
    await target.setViewport(viewports[0]!);
    await target.navigate('/__e2e/project-creation-location?fixture=-');
    await target.expectVisible(selectors.getByCss('[data-slot="root-error-document"]'), 60_000);
    await sweepCurrentPage('root error document');
  });
});
