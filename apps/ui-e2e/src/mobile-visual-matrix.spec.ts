import { afterEach, describe, expect, test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import type { Locator } from 'vitest/browser';
import * as target from '#support/external-target.js';
import { composerSelector, prepareComposerPage } from '#support/chat-attachments.js';
import { measureHorizontalOverflow, seriousAxeViolations, setTextZoom } from '#support/page-audit.js';
import {
  allSheet,
  detent,
  detents,
  grabber,
  moveSheet,
  navButton,
  navigation,
  sheetSettled,
  tapDestination,
} from '#support/phone-shell.js';
import { waitForStageReady } from '#support/viewer-stage.js';
import { readWorkbenchTree, writeWorkbenchFile } from '#support/workbench-files.js';

/**
 * T5 on the real project route (W1–W11; I3, I7, D12): the phone shell's geometry across the responsive matrix, read
 * from layout boxes and hit tests rather than from screenshots alone. At 320, 360 and 390px, at the stage, with the
 * sheet at Half, with All open and with the project sheet open, nothing scrolls sideways, every visible action is at
 * least 24px, wholly inside the viewport and its clip, and is what a tap at its centre reaches; the top bar's and the
 * nav's controls are 40px, the viewer's are 28px and centred, the grabber's target is 40px, nothing blank sits under
 * the nav, and the composer and Send clear it. The same holds in all four themes, at 200% text, with a 34px
 * home-indicator inset and with reduced motion, which also stills the status glyph and the sheet's slide. 767px is the
 * last phone width and 768px the first desktop one; a coarse-pointer tablet and a landscape phone keep the desktop
 * composition with the coarse rules (D12). Screenshots are saved for the record beside the boxes.
 */

const seedRoute = '/__e2e/chat-attachments';
const portraitViewports = [
  { width: 320, height: 640 },
  { width: 360, height: 780 },
  { width: 390, height: 844 },
] as const;
const themes = ['Light', 'Dark', 'Black', 'High Contrast'] as const;

/** Retain navigation, layout and renderer evidence before the failed case's target closes. */
afterEach(async (context) => {
  if (context.task.result?.state !== 'fail') {
    return;
  }
  const name = `mobile-matrix-failure-${context.task.id}`;
  const page = await target.evaluate(() => ({
    href: location.href,
    readyState: document.readyState,
    visibilityState: document.visibilityState,
    navigation: performance.getEntriesByType('navigation').map((entry) => ({
      name: entry.name,
      startTime: entry.startTime,
      duration: entry.duration,
    })),
    dialogs: [...document.querySelectorAll('[role="dialog"]')].map((dialog) => ({
      label: dialog.getAttribute('aria-label'),
      rect: {
        x: dialog.getBoundingClientRect().x,
        y: dialog.getBoundingClientRect().y,
        width: dialog.getBoundingClientRect().width,
        height: dialog.getBoundingClientRect().height,
      },
      text: dialog.textContent.slice(0, 2000),
    })),
    animations: document.getAnimations().map((animation) => ({
      state: animation.playState,
      timing: animation.effect?.getComputedTiming(),
    })),
  }));
  const diagnostics = await target.commands.uiCaptureTargetDiagnostics();
  await target.writeArtifact(
    `${name}.json`,
    JSON.stringify({ test: context.task.name, page, ...diagnostics, screenshot: undefined }, null, 2),
  );
  await target.screenshot(undefined, `${name}.png`);
});

const topBar = (): Locator => selectors.getByCss('[data-slot="mobile-project-top-bar"]');
const titleButton = (): Locator => selectors.getByCss('[data-slot="project-title-button"]');
const projectSheet = (): Locator => selectors.getByCss('[data-slot="project-sheet"]');
const viewerControls = (): Locator => selectors.getByRole('group', { name: 'Viewer controls' }).first();
const composer = (): Locator => selectors.getByCss(composerSelector).first();
const send = (): Locator => selectors.getByRole('button', { name: 'Send', exact: true }).first();
const chatLaneToggle = (): Locator => selectors.getByRole('button', { name: 'Toggle Chat lane' });

type Box = Readonly<{ left: number; top: number; right: number; bottom: number; width: number; height: number }>;

type LayerAudit = Readonly<{
  viewport: Readonly<{ width: number; height: number }>;
  /** Width the document scrolls past the viewport. */
  documentOverflow: number;
  /** How many visible actions were judged. */
  judged: number;
  /** Why each failing action fails: under 24px, outside the viewport or its clip, covered, or overlapping another. */
  problems: readonly string[];
}>;

/**
 * Judge every visible action on screen: each one a tap can reach (`elementFromPoint` at its centre lands in it) must
 * be at least 24 × 24 (I3; inline text links are WCAG 2.5.8's exception), wholly inside the viewport and any ancestor
 * that clips it sideways, and must not overlap another action in its layer. An action behind another layer (the sheet
 * or a dialog over the stage) is that layer's to answer for, and one scrolled out of its scroller is not on screen.
 *
 * @returns The audit.
 */
const auditLayer = async (): Promise<LayerAudit> =>
  target.evaluate(() => {
    const actionSelector = [
      'button',
      'a[href]',
      '[role="button"]',
      '[role="slider"]',
      '[role="tab"]',
      '[role="switch"]',
      '[role="checkbox"]',
      '[role="radio"]',
      '[role="menuitem"]',
      '[role="option"]',
      'input:not([type="hidden"])',
      'select',
    ].join(', ');
    const layerSelector = '[role="dialog"], [role="alertdialog"]';
    const width = document.documentElement.clientWidth;
    const height = window.innerHeight;
    type Judged = { element: HTMLElement; box: DOMRect; layer: Element | undefined };
    const describe = (element: Element): string => {
      const label = element.getAttribute('aria-label') ?? element.textContent.trim().slice(0, 30);
      const slot = element instanceof HTMLElement ? element.dataset['slot'] : undefined;
      const what = slot ? `[${slot}]` : `.${String(element.getAttribute('class')).split(' ').slice(0, 3).join('.')}`;
      return `${element.tagName.toLowerCase()}${what} "${label}"`;
    };
    /** A control a person can aim at: shown, hit-testable, and more than a visually hidden 1px box. */
    const isAimable = (element: HTMLElement): boolean =>
      !element.closest('[aria-hidden="true"], [inert]') &&
      element.checkVisibility({ opacityProperty: true, visibilityProperty: true }) &&
      getComputedStyle(element).pointerEvents !== 'none' &&
      element.getBoundingClientRect().width > 1 &&
      element.getBoundingClientRect().height > 1;
    /** The vertical clip its scrollers give it, and the first ancestor that cuts it off sideways. */
    const clipOf = (
      element: HTMLElement,
      box: DOMRect,
    ): { top: number; bottom: number; sideways?: string; vertical?: string } => {
      const clip: { top: number; bottom: number; sideways?: string; vertical?: string } = { top: 0, bottom: height };
      // Feasible top-edge positions after scrolling each ancestor, intersected with every intervening clip.
      // A hidden/clip ancestor contributes no movement; an outer scroller cannot repair clipping inside it.
      let reachableTop = box.top;
      let reachableBottom = box.top;
      let escapesToFixedBlock = getComputedStyle(element).position === 'fixed';
      for (let parent = element.parentElement; parent; parent = parent.parentElement) {
        const style = getComputedStyle(parent);
        // Fixed descendants escape intermediate overflow until the ancestor establishing their containing block.
        const establishesFixedBlock =
          [
            style.transform,
            style.translate,
            style.rotate,
            style.scale,
            style.perspective,
            style.filter,
            style.backdropFilter,
          ].some((value) => value !== '' && value !== 'none') ||
          /layout|paint|strict|content/u.test(style.contain) ||
          /transform|translate|rotate|scale|perspective|filter/u.test(style.willChange) ||
          style.contentVisibility === 'auto';
        if (escapesToFixedBlock && !establishesFixedBlock) {
          continue;
        }
        escapesToFixedBlock = style.position === 'fixed';
        const parentBox = parent.getBoundingClientRect();
        if (style.overflowY !== 'visible') {
          clip.top = Math.max(clip.top, parentBox.top);
          clip.bottom = Math.min(clip.bottom, parentBox.bottom);
          if (/auto|scroll/u.test(style.overflowY)) {
            reachableTop -= Math.max(0, parent.scrollHeight - parent.clientHeight - parent.scrollTop);
            reachableBottom += parent.scrollTop;
          }
          reachableTop = Math.max(reachableTop, parentBox.top);
          reachableBottom = Math.min(reachableBottom, parentBox.bottom - box.height);
          if (reachableTop > reachableBottom + 0.5 && clip.vertical === undefined) {
            clip.vertical = `${describe(element)} is cut off vertically by ${describe(parent)} without scroll recovery`;
          }
        }
        const cutSideways = box.left < parentBox.left - 0.5 || box.right > parentBox.right + 0.5;
        /* A sideways scroller lets a person scroll the rest in, as a vertical one does, so long as the action fits it
         * whole; others clip. Dockview's tab strip hides its native overflow and scrolls with its own scrollbar. */
        const isScroller = /auto|scroll/u.test(style.overflowX) || parent.classList.contains('dv-tabs-container');
        const scrollsSideways =
          isScroller && parent.scrollWidth > parent.clientWidth && box.width <= parent.clientWidth + 0.5;
        if (style.overflowX !== 'visible' && !scrollsSideways && clip.sideways === undefined && cutSideways) {
          clip.sideways = `${describe(element)} is cut off sideways by ${describe(parent)}`;
        }
      }
      if (
        Math.max(reachableTop, 0) > Math.min(reachableBottom, height - box.height) + 0.5 &&
        clip.vertical === undefined
      ) {
        clip.vertical = `${describe(element)} leaves the viewport vertically without scroll recovery`;
      }
      return clip;
    };
    /** What a tap at its centre reaches: it, another layer over it, or something in its own layer covering it. */
    const tapAt = (element: HTMLElement, box: DOMRect): 'reaches' | 'behind' | string => {
      const hit = document.elementFromPoint((box.left + box.right) / 2, (box.top + box.bottom) / 2);
      if (!hit) {
        return `${describe(element)} has its centre off screen`;
      }
      if (element.contains(hit) || (hit instanceof HTMLLabelElement && hit.control === element)) {
        return 'reaches';
      }
      const hitLayer = hit.closest(layerSelector) ?? undefined;
      if (hitLayer && hitLayer !== (element.closest(layerSelector) ?? undefined) && !hitLayer.contains(element)) {
        return 'behind';
      }
      return `${describe(element)} is covered by ${describe(hit)}`;
    };
    const problems: string[] = [];
    const judged: Judged[] = [];
    for (const element of document.querySelectorAll<HTMLElement>(actionSelector)) {
      if (!isAimable(element)) {
        continue;
      }
      const box = element.getBoundingClientRect();
      // Wholly beside the viewport is offstage (a lane parked off screen), not on screen; part-way is judged.
      if (box.left >= width - 0.5 || box.right <= 0.5) {
        continue;
      }
      const clip = clipOf(element, box);
      // Exclude a clipped control only when scrolling can actually bring the whole target into view.
      if (box.top < clip.top - 0.5 || box.bottom > clip.bottom + 0.5) {
        if (clip.vertical) {
          problems.push(clip.vertical);
        }
        continue;
      }
      const tap = tapAt(element, box);
      if (tap === 'behind') {
        // Behind another layer: that layer is judged, not what it covers.
        continue;
      }
      if (tap !== 'reaches') {
        problems.push(tap);
        continue;
      }
      const isInlineLink = element.tagName === 'A' && getComputedStyle(element).display === 'inline';
      if (!isInlineLink && (box.width < 23.5 || box.height < 23.5)) {
        problems.push(`${describe(element)} is ${box.width.toFixed(1)}×${box.height.toFixed(1)}, under 24px`);
      }
      if (box.left < -0.5 || box.right > width + 0.5) {
        problems.push(
          `${describe(element)} leaves the viewport sideways (${box.left.toFixed(1)}–${box.right.toFixed(1)})`,
        );
      } else if (clip.sideways) {
        problems.push(clip.sideways);
      }
      judged.push({ element, box, layer: element.closest(layerSelector) ?? undefined });
    }
    const within = (inner: DOMRect, outer: DOMRect): boolean =>
      inner.left >= outer.left - 0.5 &&
      inner.right <= outer.right + 0.5 &&
      inner.top >= outer.top - 0.5 &&
      inner.bottom <= outer.bottom + 0.5;
    /* Two actions in one layer collide when their boxes cross each other's edges. One nested in the other, or a row's
     * own action drawn over its row (a ⋯ on a sidebar link), is not a collision: both took a tap at their centres. */
    const collides = (first: Judged, second: Judged): boolean => {
      if (
        first.layer !== second.layer ||
        first.element.contains(second.element) ||
        second.element.contains(first.element)
      ) {
        return false;
      }
      if (within(first.box, second.box) || within(second.box, first.box)) {
        return false;
      }
      const overlapX = Math.min(first.box.right, second.box.right) - Math.max(first.box.left, second.box.left);
      const overlapY = Math.min(first.box.bottom, second.box.bottom) - Math.max(first.box.top, second.box.top);
      return overlapX > 1 && overlapY > 1;
    };
    for (const [index, first] of judged.entries()) {
      for (const second of judged.slice(index + 1)) {
        if (collides(first, second)) {
          problems.push(`${describe(first.element)} overlaps ${describe(second.element)}`);
        }
      }
    }
    return {
      viewport: { width, height },
      documentOverflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - width,
      judged: judged.length,
      problems,
    };
  });

/**
 * Assert the generic T5 rules for the state on screen and return the audit.
 *
 * @param state - The state's name, for the failure message.
 */
const expectWholeLayer = async (state: string): Promise<LayerAudit> => {
  const audit = await auditLayer();
  if (audit.problems.length > 0) {
    await target.screenshot(undefined, 'mobile-matrix-audit-failure.png');
    await target.writeArtifact('mobile-matrix-audit-failure.json', JSON.stringify({ state, audit }, null, 2));
  }
  expect(audit.documentOverflow, `${state}: the page scrolls sideways`).toBeLessThanOrEqual(0);
  expect(audit.problems, `${state}: actions`).toEqual([]);
  expect(audit.judged, `${state}: no action was on screen to judge`).toBeGreaterThan(0);
  return audit;
};

const boxOf = async (locator: Locator, what: string): Promise<Box> =>
  target.evaluateLocator(
    locator,
    (element, name) => {
      const { left, top, right, bottom, width, height } = element.getBoundingClientRect();
      if (width === 0 && height === 0) {
        throw new Error(`${name} has no layout box.`);
      }
      return { left, top, right, bottom, width, height };
    },
    what,
  );

/** Whether a tap at the element's centre reaches it. */
const reachable = async (locator: Locator): Promise<boolean> =>
  target.evaluateLocator(locator, (element) => {
    const box = element.getBoundingClientRect();
    const hit = document.elementFromPoint((box.left + box.right) / 2, (box.top + box.bottom) / 2);
    return hit !== null && element.contains(hit);
  });

/** Wait for every running animation and transition in the document to finish or be replaced. */
const motionSettled = async (): Promise<void> =>
  target.evaluate(async () => {
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          resolve();
        });
      });
    });
    const finite = document
      .getAnimations()
      .filter((animation) => Number.isFinite(Number(animation.effect?.getComputedTiming().endTime ?? 0)));
    await Promise.all(finite.map(async (animation) => animation.finished.catch(() => undefined)));
  });

/** Wait for a rendered stage with geometry, rather than an empty first frame. */
const waitForModelReady = async (): Promise<void> => {
  try {
    await waitForStageReady();
  } catch (error) {
    await target.screenshot(undefined, 'mobile-matrix-stage-not-ready.png');
    const diagnostics = await target.commands.uiCaptureTargetDiagnostics();
    await target.writeArtifact(
      'mobile-matrix-stage-not-ready.json',
      JSON.stringify({ ...diagnostics, screenshot: undefined }, null, 2),
    );
    throw error;
  }
  await expect
    .poll(
      async () =>
        target.getAttribute(
          viewerControls().getByRole('button', { name: 'Section view', exact: true }),
          'aria-disabled',
        ),
      { timeout: 60_000 },
    )
    .toBe('false');
};

/**
 * Open a touch phone at `viewport` on the seed route and wait for its geometry.
 *
 * @param viewport - The phone's size.
 * @param route - The seed route.
 */
const openPhoneProject = async (
  viewport: Readonly<{ width: number; height: number }>,
  route: string = seedRoute,
): Promise<void> => {
  await target.commands.uiOpenTarget({ hasTouch: true, isMobile: true });
  await prepareComposerPage();
  await target.setViewport(viewport);
  await target.navigate(route);
  await target.expectUrl(/\/w\/[^/]+\/[^/?]+/u, 120_000);
  await target.expectVisible(navigation(), 60_000);
  await target.expectVisible(titleButton(), 60_000);
  await waitForModelReady();
};

/** The project's 48px bar: three controls, each at least 40px tall, side by side inside it (D2, I3). */
const expectTopBar = async (viewport: Readonly<{ width: number }>): Promise<void> => {
  const bar = await boxOf(topBar(), 'The project top bar');
  expect(bar.top).toBeLessThanOrEqual(0.5);
  expect(bar.right).toBeLessThanOrEqual(viewport.width + 0.5);
  const controls = await target.evaluateLocator(topBar(), (element) =>
    [...element.querySelectorAll('button')].map((button) => {
      const { left, right, top, bottom, width, height } = button.getBoundingClientRect();
      return { name: button.getAttribute('aria-label') ?? 'title', left, right, top, bottom, width, height };
    }),
  );
  expect(controls).toHaveLength(3);
  for (const control of controls) {
    expect(control.height, `${control.name} height`).toBeGreaterThanOrEqual(40);
    expect(control.top).toBeGreaterThanOrEqual(bar.top - 0.5);
    expect(control.bottom).toBeLessThanOrEqual(bar.bottom + 0.5);
  }
  const [sidebar, title, share] = controls;
  expect(sidebar!.width).toBeGreaterThanOrEqual(40);
  expect(share!.width).toBeGreaterThanOrEqual(40);
  expect(sidebar!.right).toBeLessThanOrEqual(title!.left + 0.5);
  expect(title!.right).toBeLessThanOrEqual(share!.left + 0.5);
};

/**
 * The nav: four 40px destinations a tap reaches, and nothing under it: it ends at the viewport's bottom, so a tap on
 * the last pixel row lands in it.
 *
 * @returns The nav's box.
 */
const expectNavigation = async (): Promise<Box> => {
  const nav = await boxOf(navigation(), 'The workbench nav');
  const viewportHeight = await target.evaluate(() => window.innerHeight);
  expect(nav.bottom).toBeGreaterThanOrEqual(viewportHeight - 0.5);
  expect(nav.bottom).toBeLessThanOrEqual(viewportHeight + 0.5);
  const lastRow = await target.evaluateLocator(navigation(), (element) => {
    const hit = document.elementFromPoint(document.documentElement.clientWidth / 2, window.innerHeight - 1);
    return hit !== null && element.contains(hit);
  });
  expect(lastRow, 'the last pixel row should be the nav, not a blank strip').toBe(true);
  for (const name of ['Chat', 'Parameters', 'Model', 'All']) {
    // oxlint-disable-next-line no-await-in-loop -- one destination at a time.
    const button = await boxOf(navButton(name), `The ${name} destination`);
    expect(button.height, `${name} height`).toBeGreaterThanOrEqual(40);
    expect(button.top).toBeGreaterThanOrEqual(nav.top - 0.5);
    expect(button.bottom).toBeLessThanOrEqual(nav.bottom + 0.5);
    // oxlint-disable-next-line no-await-in-loop -- one destination at a time.
    expect(await reachable(navButton(name)), `${name} should take a tap`).toBe(true);
    // Its icon and label stay inside it on one line each, at any text size.
    // oxlint-disable-next-line no-await-in-loop -- one destination at a time.
    const spill = await target.evaluateLocator(navButton(name), (element) => {
      const outer = element.getBoundingClientRect();
      return [...element.querySelectorAll(':scope > span:not([hidden])')]
        .map((part) => part.getBoundingClientRect())
        .filter((part) => part.top < outer.top - 0.5 || part.bottom > outer.bottom + 0.5)
        .map(
          (part) =>
            `${part.top.toFixed(1)}–${part.bottom.toFixed(1)} outside ${outer.top.toFixed(1)}–${outer.bottom.toFixed(1)}`,
        );
    });
    expect(spill, `${name}'s icon and label should stay inside it`).toEqual([]);
  }
  return nav;
};

/** The viewer bar: one group of 28px tools (scaled with the root text size), centred on the stage, inside it (D6). */
const expectViewerBar = async (): Promise<void> => {
  const layout = await target.evaluateLocator(viewerControls(), (group) => {
    const toBox = (element: Element): Box => {
      const { left, top, right, bottom, width, height } = element.getBoundingClientRect();
      return { left, top, right, bottom, width, height };
    };
    const frame = group.closest('[data-viewer-frame]');
    if (!frame) {
      throw new Error('The viewer bar is not on a viewer stage.');
    }
    return {
      frame: toBox(frame),
      group: toBox(group),
      tools: [...group.querySelectorAll('button')]
        .filter((button) => button.getClientRects().length > 0)
        .map((button) => ({
          name: button.getAttribute('aria-label') ?? '',
          box: toBox(button),
          // A wider bar shows some tools' labels beside their icons (a container query); those grow sideways only.
          labelled: [...button.querySelectorAll('span')].some(
            (span) => span.checkVisibility() && span.textContent.trim() !== '',
          ),
        })),
      /* The tools are sized in rem, so text zoom scales them with the rest of the page. */
      scale: Number.parseFloat(getComputedStyle(document.documentElement).fontSize) / 16,
    };
  });
  const tools = layout.tools.slice(layout.tools.findIndex(({ name }) => name.startsWith('Grid ')));
  expect(tools.map(({ name }) => name)).toEqual(
    expect.arrayContaining(['Section view', 'Measure', 'Fit view', 'Viewer settings']),
  );
  const size = 28 * layout.scale;
  for (const tool of tools) {
    expect([tool.name, tool.box.height]).toEqual([tool.name, size]);
    if (tool.labelled) {
      expect(tool.box.width, tool.name).toBeGreaterThanOrEqual(size);
    } else {
      expect([tool.name, tool.box.width]).toEqual([tool.name, size]);
    }
  }
  const centre = (box: Box): number => (box.left + box.right) / 2;
  expect(Math.abs(centre(layout.group) - centre(layout.frame))).toBeLessThanOrEqual(1);
  expect(layout.group.left).toBeGreaterThanOrEqual(layout.frame.left - 0.5);
  expect(layout.group.right).toBeLessThanOrEqual(layout.frame.right + 0.5);
};

/**
 * The stage state: the model fills the space between the bar and the nav with no blank band, the viewer bar is whole.
 *
 * @param viewport - The phone's size.
 */
const expectStage = async (viewport: Readonly<{ width: number }>): Promise<void> => {
  await expect.poll(async () => target.getAttribute(navButton('Model'), 'aria-current')).toBe('page');
  await target.expectCount(selectors.getByCss('[data-slot="mobile-surface"]'), 0);
  await target.expectVisible(viewerControls(), 60_000);
  await expectTopBar(viewport);
  const nav = await expectNavigation();
  const bar = await boxOf(topBar(), 'The project top bar');
  const frame = await boxOf(selectors.getByCss('[data-viewer-frame]').first(), 'The viewer stage');
  // D1: the stage starts directly below the project bar, without a Dockview header.
  expect(frame.top).toBeCloseTo(bar.bottom, 0);
  expect(frame.bottom).toBeGreaterThanOrEqual(nav.top - 0.5);
  expect(frame.left).toBeLessThanOrEqual(0.5);
  expect(frame.right).toBeGreaterThanOrEqual(viewport.width - 0.5);
  // Nothing blank between the bar and the nav: every point down the left edge, the middle and the right edge lands in
  // the stage's pane, never on the page behind it.
  const blanks = await target.evaluate(
    ({ from, to }) => {
      const misses: string[] = [];
      const width = document.documentElement.clientWidth;
      for (let y = from + 1; y < to - 1; y += 8) {
        for (const x of [1, width / 2, width - 1]) {
          const hit = document.elementFromPoint(x, y);
          if (!hit || hit === document.body || hit === document.documentElement) {
            misses.push(`${String(Math.round(x))},${String(Math.round(y))}`);
          }
        }
      }
      return misses;
    },
    { from: bar.bottom, to: nav.top },
  );
  expect(blanks, 'blank points between the bar and the nav').toEqual([]);
  await expectViewerBar();
  const visibleHeaders = await target.evaluate(
    () =>
      [...document.querySelectorAll<HTMLElement>('.dv-tabs-and-actions-container')].filter((header) =>
        header.checkVisibility(),
      ).length,
  );
  expect(visibleHeaders, 'D1: phones have no dock strip, Split or tab close').toBe(0);
  await expectWholeLayer('stage');
};

/**
 * Chat at Half: the grabber's target is 40px, the sheet reaches down to the nav, and the composer and Send are whole,
 * reachable and above the nav.
 *
 * @param viewport - The phone's size.
 */
const expectChatAtHalf = async (viewport: Readonly<{ width: number }>): Promise<void> => {
  await tapDestination('Chat');
  await target.expectVisible(composer(), 60_000);
  await expect.poll(detent).toBe(detents.half);
  await sheetSettled();
  await expectTopBar(viewport);
  const nav = await expectNavigation();
  const handle = await boxOf(grabber(), 'The grabber');
  expect(handle.height).toBeGreaterThanOrEqual(40);
  const chat = await boxOf(selectors.getByRole('region', { name: 'Chat', exact: true }), 'The chat surface');
  expect(chat.bottom).toBeLessThanOrEqual(nav.top + 0.5);
  for (const [what, locator] of [
    ['The composer', composer()],
    ['Send', send()],
  ] as const) {
    // oxlint-disable-next-line no-await-in-loop -- each in turn.
    const box = await boxOf(locator, what);
    expect(box.bottom, `${what} should end above the nav`).toBeLessThanOrEqual(nav.top + 0.5);
    expect(box.top).toBeGreaterThanOrEqual(0);
    expect(box.left).toBeGreaterThanOrEqual(-0.5);
    expect(box.right).toBeLessThanOrEqual(viewport.width + 0.5);
    // oxlint-disable-next-line no-await-in-loop -- each in turn.
    expect(await reachable(locator), `${what} should take a tap`).toBe(true);
  }
  await expectWholeLayer('Chat at Half');
};

/** All: its destinations fit across the sheet without sideways scroll, each one whole. */
const expectAllOpen = async (): Promise<void> => {
  await target.click(navButton('All'), { touch: true });
  await target.expectVisible(allSheet());
  await motionSettled();
  const overflow = await target.evaluateLocator(allSheet(), (sheet) => sheet.scrollWidth - sheet.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await expectWholeLayer('All open');
};

/** The project sheet: each row is a 40px target inside the viewport. */
const expectProjectSheetOpen = async (viewport: Readonly<{ width: number }>): Promise<void> => {
  await target.click(titleButton(), { touch: true });
  await target.expectVisible(projectSheet());
  await motionSettled();
  const rows = await target.evaluateLocator(projectSheet(), (sheet) =>
    [...sheet.querySelectorAll<HTMLElement>('[data-slot="project-sheet-row"]')].map((row) => {
      const { height, right } = row.getBoundingClientRect();
      return { height, right };
    }),
  );
  expect(rows.length).toBeGreaterThanOrEqual(3);
  for (const row of rows) {
    expect(row.height).toBeGreaterThanOrEqual(40);
    expect(row.right).toBeLessThanOrEqual(viewport.width + 0.5);
  }
  await expectWholeLayer('project sheet open');
};

/** Close whatever sheet or dialog is open with Escape and wait for it to leave. */
const dismiss = async (locator: Locator): Promise<void> => {
  await target.keyboardPress('Escape');
  await target.expectCount(locator, 0, 30_000);
  await motionSettled();
};

/** Return to the stage through Model (D8). */
const returnToStage = async (): Promise<void> => {
  await tapDestination('Model');
  await target.expectCount(selectors.getByCss('[data-slot="mobile-surface"]'), 0, 30_000);
  await motionSettled();
};

/**
 * Choose a theme in Settings › General, as a person does on a phone: the list, then General, then the theme.
 *
 * @param theme - The theme's name.
 */
/** How many dialogs are on screen, counted in the page so a dialog leaving mid-count is simply not counted. */
const openDialogs = async (): Promise<number> =>
  target.evaluate(
    () => [...document.querySelectorAll('[role="dialog"]')].filter((dialog) => dialog.checkVisibility()).length,
  );

const chooseTheme = async (theme: (typeof themes)[number]): Promise<void> => {
  await target.click(selectors.getByRole('button', { name: 'Open sidebar', exact: true }), { touch: true });
  const sidebar = selectors.getByRole('dialog', { name: 'Sidebar' });
  await target.expectVisible(sidebar);
  await target.click(sidebar.getByRole('button', { name: 'Account', exact: true }), { touch: true });
  await target.click(selectors.getByRole('menuitem', { name: 'Settings', exact: true }), { touch: true });
  const settings = selectors.getByRole('dialog', { name: /^settings$/iu });
  await target.expectVisible(settings, 60_000);
  const themeButton = selectors.getByRole('button', { name: /^(?:light|dark|black|high contrast|system)$/iu });
  if (!(await target.isVisible(themeButton))) {
    await target.click(settings.getByRole('button', { name: /^General/u }).first(), { touch: true });
  }
  await target.click(themeButton, { touch: true });
  await target.click(selectors.getByRole('option', { name: new RegExp(`^${theme}`, 'iu') }), { touch: true });
  const themeClass = theme.toLowerCase().replaceAll(' ', '-');
  await target.expectClass(selectors.getByCss('html'), new RegExp(`\\b${themeClass}\\b`, 'u'));
  await target.expectCount(selectors.getByRole('listbox'), 0, 30_000);
  /* On a phone Settings is a list and a detail: Escape steps back from General to the list (whose dialog is then named
   * Settings again) and from the list closes it. Close by Escape until no dialog is left. */
  // oxlint-disable-next-line no-await-in-loop -- whether a dialog is left decides the next step.
  for (let step = 0; step < 3 && (await openDialogs()) > 0; step++) {
    // oxlint-disable-next-line no-await-in-loop -- one step back at a time.
    await target.keyboardPress('Escape');
    // oxlint-disable-next-line no-await-in-loop -- the dialog's exit animation runs between steps.
    await motionSettled();
  }
  await target.expectCount(selectors.getByRole('dialog'), 0, 30_000);
  await target.expectVisible(navigation(), 60_000);
  await waitForModelReady();
  await motionSettled();
};

test.each(['hidden', 'clip', 'auto', 'scroll'] as const)(
  'audits vertically clipped controls with overflow %s',
  async (overflow) => {
    await target.setViewport({ width: 360, height: 780 });
    await target.evaluate((overflowY) => {
      document.body.replaceChildren();
      const clip = document.createElement('div');
      clip.style.cssText = 'position:fixed;top:40px;left:40px;width:100px;height:48px';
      clip.style.overflowY = overflowY;
      const button = document.createElement('button');
      button.textContent = 'Clipped action';
      button.style.cssText = 'display:block;width:80px;height:40px;margin-top:32px';
      clip.append(button);
      document.body.append(clip);
    }, overflow);
    const audit = await auditLayer();
    if (overflow === 'auto' || overflow === 'scroll') {
      expect(audit.problems).toEqual([]);
    } else {
      expect(audit.problems).toEqual(expect.arrayContaining([expect.stringContaining('Clipped action')]));
    }
  },
);

test.each([false, true])('audits a fixed action with a transformed containing ancestor: %s', async (transformed) => {
  await target.setViewport({ width: 360, height: 780 });
  await target.evaluate((hasTransform) => {
    document.body.replaceChildren();
    const clip = document.createElement('div');
    clip.style.cssText = 'position:absolute;top:0;left:0;width:200px;height:100px;overflow:hidden';
    if (hasTransform) {
      clip.style.transform = 'translateZ(0)';
    }
    const button = document.createElement('button');
    button.textContent = 'Fixed action';
    button.style.cssText = 'position:fixed;top:80px;left:40px;width:100px;height:40px';
    clip.append(button);
    document.body.append(clip);
  }, transformed);
  const audit = await auditLayer();
  if (transformed) {
    expect(audit.problems).toEqual(expect.arrayContaining([expect.stringContaining('Fixed action')]));
  } else {
    expect(await reachable(selectors.getByRole('button', { name: 'Fixed action' }))).toBe(true);
    expect(audit.problems).toEqual([]);
  }
});

test('reports a dialog action covered by page chrome', async () => {
  await target.setViewport({ width: 360, height: 780 });
  await target.evaluate(() => {
    document.body.replaceChildren();
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    dialog.style.cssText = 'position:fixed;top:40px;left:40px;width:100px;height:48px';
    const button = document.createElement('button');
    button.textContent = 'Dialog action';
    button.style.cssText = 'width:80px;height:40px';
    dialog.append(button);
    const navigation = document.createElement('nav');
    navigation.textContent = 'Page navigation';
    navigation.style.cssText = 'position:fixed;top:40px;left:40px;width:100px;height:48px;z-index:2';
    document.body.append(dialog, navigation);
  });
  const audit = await auditLayer();
  expect(audit.problems).toEqual(expect.arrayContaining([expect.stringContaining('"Dialog action" is covered by')]));
});

describe('the phone shell across portrait widths', () => {
  test.each(portraitViewports)(
    'keeps the stage, Half, All and the project sheet whole at $width×$height',
    async (viewport) => {
      await openPhoneProject(viewport);

      await expectStage(viewport);
      if (viewport.width === 320) {
        await target.screenshot(undefined, `mobile-matrix-stage-${String(viewport.width)}.png`);
      }

      await expectChatAtHalf(viewport);
      if (viewport.width === 360) {
        await target.screenshot(undefined, `mobile-matrix-half-${String(viewport.width)}.png`);
      }

      await expectAllOpen();
      if (viewport.width === 390) {
        await target.screenshot(undefined, `mobile-matrix-all-${String(viewport.width)}.png`);
      }
      await dismiss(allSheet());

      await returnToStage();
      await expectProjectSheetOpen(viewport);
      if (viewport.width === 390) {
        await target.screenshot(undefined, `mobile-matrix-project-sheet-${String(viewport.width)}.png`);
      }
      await dismiss(projectSheet());
      await expectStage(viewport);
    },
  );
});

test('switches model files through phone Files actions without desktop tabs', async () => {
  await openPhoneProject(portraitViewports[1], '/__e2e/project-file-tree?main=touch-parameters');
  for (const file of ['box-corner.js', 'touch-parameters.js']) {
    // oxlint-disable-next-line no-await-in-loop -- each file switch uses the real phone navigation in sequence.
    await target.click(navButton('All'), { touch: true });
    // oxlint-disable-next-line no-await-in-loop -- the All sheet must open before its destination is tapped.
    await target.click(allSheet().getByRole('button', { name: 'Files', exact: true }), { touch: true });
    // oxlint-disable-next-line no-await-in-loop -- expand the parent directories before reaching the file action.
    await target.expectVisible(selectors.getByRole('tree', { name: 'Project files' }));
    for (const path of ['public', 'public/models']) {
      const folder = selectors.getByCss(`[data-file-tree-path="${path}"]`);
      // oxlint-disable-next-line no-await-in-loop -- open only closed ancestors of the file being selected.
      if ((await target.getAttribute(folder, 'aria-expanded')) !== 'true') {
        // oxlint-disable-next-line no-await-in-loop -- a child is reachable only after its parent opens.
        await target.click(folder, { touch: true, position: { x: 8, y: 14 } });
      }
    }
    // oxlint-disable-next-line no-await-in-loop -- a touch-visible menu is the phone's file-view selection route.
    await target.click(
      selectors
        .getByCss(`[data-file-tree-path="public/models/${file}"]`)
        .getByRole('button', { name: `More actions for ${file}` }),
      {
        touch: true,
      },
    );
    // oxlint-disable-next-line no-await-in-loop -- choose the real viewer action, not a programmatic projection edit.
    await target.click(selectors.getByRole('menuitem', { name: 'Open in Viewer', exact: true }), { touch: true });
    const title = `public/models/${file}`;
    const selectedTab = selectors.getByCss(`.dv-tab.dv-active-tab[aria-label="${title}"]`);
    // oxlint-disable-next-line no-await-in-loop -- the tab component's accessible name carries the full entry path.
    await target.expectCount(selectedTab, 1);
    // oxlint-disable-next-line no-await-in-loop -- verify the selected view's durable file identity as well as its title.
    const selectedView = await target.getAttribute(selectedTab, 'data-tab-panel-id');
    // oxlint-disable-next-line no-await-in-loop -- wait for that selected view's persisted record.
    await expect
      .poll(async () => {
        const tree = await readWorkbenchTree();
        const bytes = tree[`/.tau/workbench/views/${selectedView}.json`];
        return bytes ? (JSON.parse(bytes) as { entryPath: string }).entryPath : undefined;
      })
      .toBe(`public/models/${file}`);
    // oxlint-disable-next-line no-await-in-loop -- the selected file must produce geometry before judging it.
    await waitForModelReady();
    // oxlint-disable-next-line no-await-in-loop -- return to Model after the newly selected canvas is ready for input.
    await tapDestination('Model');
    // oxlint-disable-next-line no-await-in-loop -- every selected model retains the phone composition.
    await expectStage(portraitViewports[1]);
  }
  await target.expectCount(selectors.getByCss('.dv-tab'), 2);
  await target.screenshot(undefined, 'mobile-matrix-file-switch-360.png');
});

test('keeps both ends of the All focus loop visible at 320px', async () => {
  await openPhoneProject(portraitViewports[0]);
  await target.click(navButton('All'), { touch: true });
  await motionSettled();
  const first = allSheet().getByRole('button', { name: 'Open file', exact: true });
  const last = allSheet().getByRole('button', { name: 'Console', exact: true });
  await target.focus(last);
  await target.keyboardPress('Tab');
  await expect.poll(async () => target.evaluate(() => document.activeElement?.textContent)).toBe('Open file');
  expect(await reachable(first)).toBe(true);
  const heading = await boxOf(allSheet().getByRole('heading', { name: 'Views', exact: true }), 'Views heading');
  const firstBox = await boxOf(first, 'Open file');
  expect(heading.bottom).toBeLessThanOrEqual(firstBox.top);
  expect(await reachable(allSheet().getByRole('heading', { name: 'Views', exact: true }))).toBe(true);
  await target.keyboardPress('Shift+Tab');
  await expect.poll(async () => target.evaluate(() => document.activeElement?.textContent)).toBe('Console');
  expect(await reachable(last)).toBe(true);
  await target.keyboardPress('Tab');
  expect(await reachable(first)).toBe(true);
});

test('reveals the exact nested viewer file when Files has never mounted', async () => {
  await openPhoneProject(
    portraitViewports[1],
    '/__e2e/project-file-tree?main=touch-parameters&workspace=phone-cold-file-reveal',
  );
  await target.expectCount(selectors.getByRole('tree'), 0);
  await target.click(navButton('All'), { touch: true });
  await target.click(
    allSheet()
      .getByRole('button', { name: /More actions/ })
      .first(),
    { touch: true },
  );
  await target.click(selectors.getByRole('menuitem', { name: 'Reveal in File Tree', exact: true }), { touch: true });
  await motionSettled();
  const files = selectors.getByRole('region', { name: 'Files', exact: true });
  await target.expectVisible(files);
  await target.expectAttribute(files.getByRole('treeitem', { name: 'public', exact: true }), 'aria-expanded', 'true');
  await target.expectAttribute(files.getByRole('treeitem', { name: 'models', exact: true }), 'aria-expanded', 'true');
  const item = files.getByRole('treeitem', { name: 'touch-parameters.js', exact: true });
  await target.expectAttribute(item, 'aria-selected', 'true');
  expect(await reachable(item)).toBe(true);
  await target.screenshot(undefined, 'mobile-matrix-cold-file-reveal-360.png');
});

test('opens a fresh same-file view and keeps view actions reachable after closing every view', async () => {
  const viewport = portraitViewports[1];
  const workspace = 'phone-view-actions';
  const entryPath = 'public/models/touch-parameters.js';
  await openPhoneProject(viewport, `/__e2e/project-file-tree?main=touch-parameters&workspace=${workspace}`);
  const activeTab = selectors.getByCss('.dv-tab.dv-active-tab');
  const originalId = await target.getAttribute(activeTab, 'data-tab-panel-id');
  expect(originalId).toBeTruthy();
  const originalPath = `/.tau/workbench/views/${originalId}.json`;
  await expect
    .poll(
      async () => {
        const tree = await readWorkbenchTree(workspace);
        return tree[originalPath];
      },
      { timeout: 60_000 },
    )
    .toBeDefined();
  const before = await readWorkbenchTree(workspace);
  expect(before['/tau.json']).toBeDefined();

  await target.click(navButton('All'), { touch: true });
  const openFile = () => allSheet().getByRole('button', { name: 'Open file', exact: true });
  const picker = () => selectors.getByRole('dialog', { name: 'Open File', exact: true });
  await target.click(openFile(), { touch: true });
  await target.expectVisible(picker());
  await dismiss(picker());
  await target.expectVisible(allSheet());
  await expect
    .poll(async () =>
      target.evaluate(
        () =>
          document.activeElement instanceof HTMLElement && document.activeElement.dataset['openViewFile'] !== undefined,
      ),
    )
    .toBe(true);
  expect(await reachable(openFile())).toBe(true);

  const selectSameFile = async (): Promise<void> => {
    await target.click(openFile(), { touch: true });
    await target.expectVisible(picker());
    await target.fill(picker().getByCss('[cmdk-input]'), 'touch-parameters');
    await target.click(picker().getByCss(`[cmdk-item][data-value="${entryPath}"]`), { touch: true });
    await target.waitFor(() => document.querySelector('[role="dialog"][data-vaul-drawer]') === null, undefined, {
      timeout: 10_000,
    });
    await waitForModelReady();
    await expect
      .poll(async () =>
        target.evaluate(
          () =>
            document.activeElement?.textContent === 'Model' &&
            document.activeElement.closest('nav[aria-label="Workbench"]') !== null,
        ),
      )
      .toBe(true);
    expect(await reachable(navButton('Model'))).toBe(true);
    await expectStage(viewport);
  };
  await selectSameFile();
  await target.expectCount(selectors.getByCss('.dv-tab'), 2);
  const freshId = await target.getAttribute(activeTab, 'data-tab-panel-id');
  expect(freshId).toBeTruthy();
  expect(freshId).not.toBe(originalId);
  const freshPath = `/.tau/workbench/views/${freshId}.json`;
  await expect
    .poll(
      async () => {
        const tree = await readWorkbenchTree(workspace);
        const bytes = tree[freshPath];
        return bytes ? (JSON.parse(bytes) as { entryPath: string }).entryPath : undefined;
      },
      { timeout: 60_000 },
    )
    .toBe(entryPath);
  const created = await readWorkbenchTree(workspace);
  expect(created['/tau.json']).toBe(before['/tau.json']);
  expect(JSON.parse(created[originalPath]!)).toEqual(JSON.parse(before[originalPath]!));
  await target.reload();
  await waitForModelReady();
  await target.expectCount(selectors.getByCss('.dv-tab'), 2);
  await target.expectAttribute(activeTab, 'data-tab-panel-id', freshId!);
  await target.click(navButton('All'), { touch: true });
  await motionSettled();
  await expectWholeLayer('All view actions');
  await target.screenshot(undefined, 'mobile-matrix-view-actions-360.png');
  await target.click(
    allSheet()
      .getByCss(`[data-view-id="${freshId}"]`)
      .getByRole('button', { name: /More actions/ }),
    { touch: true },
  );
  await target.expectCount(selectors.getByRole('menuitem', { name: 'Split Right' }), 0);
  await target.screenshot(undefined, 'mobile-matrix-view-menu-360.png');
  await target.click(selectors.getByRole('menuitem', { name: 'Close', exact: true }), { touch: true });
  await target.expectCount(selectors.getByCss('.dv-tab'), 1);
  await expect
    .poll(
      async () => {
        const tree = await readWorkbenchTree(workspace);
        return tree[freshPath];
      },
      { timeout: 60_000 },
    )
    .toBeUndefined();
  const afterClose = await readWorkbenchTree(workspace);
  expect(afterClose[originalPath]).toBeDefined();
  await expect
    .poll(async () =>
      target.evaluate(
        () =>
          document.activeElement instanceof HTMLElement && document.activeElement.dataset['openViewFile'] !== undefined,
      ),
    )
    .toBe(true);
  await target.click(
    allSheet()
      .getByCss(`[data-view-id="${originalId}"]`)
      .getByRole('button', { name: /More actions/ }),
    { touch: true },
  );
  await target.expectAttribute(selectors.getByRole('menuitem', { name: 'Close Others' }), 'aria-disabled', 'true');
  await target.click(selectors.getByRole('menuitem', { name: 'Close All', exact: true }), { touch: true });
  await target.expectCount(selectors.getByCss('.dv-tab'), 0);
  await expect
    .poll(async () =>
      target.evaluate(
        () =>
          document.activeElement instanceof HTMLElement && document.activeElement.dataset['openViewFile'] !== undefined,
      ),
    )
    .toBe(true);
  expect(await reachable(openFile())).toBe(true);
  await target.screenshot(undefined, 'mobile-matrix-empty-view-actions-360.png');
  await selectSameFile();
  await target.expectCount(selectors.getByCss('.dv-tab'), 1);
  const afterReopen = await readWorkbenchTree(workspace);
  expect(afterReopen['/tau.json']).toBe(before['/tau.json']);
});

test('reselects same-file saved views through All after reload without changing their records', async () => {
  const workspace = 'phone-saved-views';
  await openPhoneProject(portraitViewports[1], `/__e2e/project-file-tree?main=touch-parameters&workspace=${workspace}`);
  const layoutPath = '/.tau/workbench/layout.json';
  const frontPath = '/.tau/workbench/views/phone-front.json';
  const rightPath = '/.tau/workbench/views/phone-right.json';
  await expect
    .poll(
      async () => {
        const tree = await readWorkbenchTree(workspace);
        return tree[layoutPath];
      },
      { timeout: 60_000 },
    )
    .toBeDefined();
  const initialTree = await readWorkbenchTree(workspace);
  const initial = JSON.parse(initialTree[layoutPath]!) as Record<string, unknown>;
  const entryPath = 'public/models/touch-parameters.js';
  const front = JSON.stringify({
    version: 1,
    entryPath,
    name: 'Front inspection',
    camera: { kind: 'preset', preset: 'front' },
    grid: { unit: 'mm' },
  });
  const right = JSON.stringify({
    version: 1,
    entryPath,
    name: 'Right inspection',
    camera: { kind: 'preset', preset: 'right' },
    grid: { unit: 'in' },
  });
  await writeWorkbenchFile(frontPath, front, workspace);
  await writeWorkbenchFile(rightPath, right, workspace);
  await writeWorkbenchFile(
    layoutPath,
    JSON.stringify({
      ...initial,
      viewer: {
        kind: 'group',
        tabs: [
          { kind: 'view', view: 'phone-front' },
          { kind: 'view', view: 'phone-right' },
        ],
        active: 0,
      },
    }),
    workspace,
  );
  await target.reload();
  await waitForModelReady();
  const cameras: number[][] = [];
  for (const [id, name, unit, keyboard] of [
    ['phone-right', 'Right inspection', 'in', false],
    ['phone-front', 'Front inspection', 'mm', true],
    ['phone-right', 'Right inspection', 'in', false],
  ] as const) {
    // oxlint-disable-next-line no-await-in-loop -- each saved view is selected from the existing All sheet.
    await target.click(navButton('All'), { touch: true });
    const choice = allSheet()
      .getByRole('region', { name: 'Views', exact: true })
      .getByRole('button', { name: `${name} · touch-parameters.js`, exact: true });
    // oxlint-disable-next-line no-await-in-loop -- every target must be visible and named before it is used.
    await target.expectVisible(choice);
    // oxlint-disable-next-line no-await-in-loop -- audit the settled drawer, as the other All cases do.
    await motionSettled();
    // oxlint-disable-next-line no-await-in-loop -- the distinguishing name must be visible, not only accessible.
    const visibleName = await target.evaluateLocator(choice, (button) => {
      const label = button.querySelector('span')!;
      const text = label.firstChild!;
      const range = document.createRange();
      range.setStart(text, 0);
      range.setEnd(text, text.textContent!.indexOf(' · '));
      return { nameRight: range.getBoundingClientRect().right, labelRight: label.getBoundingClientRect().right };
    });
    expect(visibleName.nameRight).toBeLessThanOrEqual(visibleName.labelRight + 0.5);
    // oxlint-disable-next-line no-await-in-loop -- the added section must keep the existing target/clip audit whole.
    await expectWholeLayer('All with saved views');
    if (keyboard) {
      // oxlint-disable-next-line no-await-in-loop -- exercise the same choice through keyboard activation.
      await target.focus(choice);
      // oxlint-disable-next-line no-await-in-loop -- focus must remain visible before Enter.
      expect(await reachable(choice)).toBe(true);
      // oxlint-disable-next-line no-await-in-loop -- activate the focused saved view.
      await target.keyboardPress('Enter');
    } else {
      // oxlint-disable-next-line no-await-in-loop -- exercise real touch activation.
      await target.click(choice, { touch: true });
    }
    // oxlint-disable-next-line no-await-in-loop -- selection closes All and restores the Model destination.
    await target.waitFor(() => document.querySelector('[role="dialog"][data-vaul-drawer]') === null, undefined, {
      timeout: 10_000,
    });
    if (keyboard) {
      // oxlint-disable-next-line no-await-in-loop -- dismissal must restore a visible focus destination.
      await expect
        .poll(async () =>
          target.evaluate(
            () =>
              document.activeElement?.closest('nav[aria-label="Workbench"]') !== null &&
              document.activeElement?.textContent === 'Model',
          ),
        )
        .toBe(true);
      // oxlint-disable-next-line no-await-in-loop -- focus must land on a reachable Model button, not a hidden tab.
      expect(await reachable(navButton('Model'))).toBe(true);
    }
    // oxlint-disable-next-line no-await-in-loop -- the selected panel identity, not merely a file match, must change.
    await target.expectAttribute(selectors.getByCss(`.dv-tab[data-tab-panel-id="${id}"]`), 'aria-selected', 'true');
    // oxlint-disable-next-line no-await-in-loop -- wait for the selected record's geometry.
    await waitForModelReady();
    // oxlint-disable-next-line no-await-in-loop -- its saved settings must be applied to the live viewer.
    await target.expectVisible(
      selectors.getByRole('button', { name: new RegExp(`Grid .* ${unit}, units and grid`, 'u') }),
    );
    // oxlint-disable-next-line no-await-in-loop -- capture the rendered camera, not only the authored record.
    cameras.push(
      // oxlint-disable-next-line no-await-in-loop -- capture each selected live camera before switching away.
      await target.evaluate(
        () =>
          (
            globalThis as { __TAU_SECTION_VIEW_TEST__?: { getCamera(): { position: number[] } } }
          ).__TAU_SECTION_VIEW_TEST__!.getCamera().position,
      ),
    );
    // oxlint-disable-next-line no-await-in-loop -- capture the selected geometry before All overlays the stage.
    await target.screenshot(undefined, `mobile-matrix-saved-view-${id}.png`);
    // oxlint-disable-next-line no-await-in-loop -- reload proves selection survives panel reconstruction.
    await target.reload();
    // oxlint-disable-next-line no-await-in-loop -- the same selected panel must be restored after reload.
    await target.expectAttribute(
      selectors.getByCss(`.dv-tab[data-tab-panel-id="${id}"]`),
      'aria-selected',
      'true',
      60_000,
    );
    // oxlint-disable-next-line no-await-in-loop -- settle each restored viewer before continuing.
    await waitForModelReady();
  }
  expect(cameras[0]).not.toEqual(cameras[1]);
  for (let axis = 0; axis < 3; axis++) {
    expect(cameras[2]![axis]).toBeCloseTo(cameras[0]![axis]!, 3);
  }
  const finalFiles = await readWorkbenchTree(workspace);
  expect(JSON.parse(finalFiles[frontPath]!)).toEqual(JSON.parse(front));
  expect(JSON.parse(finalFiles[rightPath]!)).toEqual(JSON.parse(right));
  await target.click(navButton('All'), { touch: true });
  expect(await seriousAxeViolations({ selector: '[role="dialog"]' })).toEqual([]);
  await target.screenshot(undefined, 'mobile-matrix-saved-views-360.png');
});

describe.each(themes)('the phone shell in %s', (theme) => {
  test('keeps the top bar, viewer bar, sheet and All whole and readable at 360×780', async () => {
    const viewport = portraitViewports[1];
    await openPhoneProject(viewport);
    await chooseTheme(theme);
    await expectStage(viewport);
    await expectChatAtHalf(viewport);
    expect(
      await seriousAxeViolations({ rules: ['color-contrast'], selector: '[data-slot="mobile-project-top-bar"]' }),
    ).toEqual([]);
    expect(await seriousAxeViolations({ rules: ['color-contrast'], selector: 'nav[aria-label="Workbench"]' })).toEqual(
      [],
    );
    await target.screenshot(undefined, `mobile-matrix-theme-${theme.replaceAll(' ', '-').toLowerCase()}-360.png`);
    await expectAllOpen();
    expect(await seriousAxeViolations({ rules: ['color-contrast'], selector: '[role="dialog"]' })).toEqual([]);
    await dismiss(allSheet());
  });
});

describe('the 767/768 breakpoint', () => {
  test('keeps the phone composition at 767px and the desktop one at 768px', async () => {
    const phone = { width: 767, height: 1024 };
    await openPhoneProject(phone);
    await expectStage(phone);
    await expectChatAtHalf(phone);
    await target.screenshot(undefined, 'mobile-matrix-breakpoint-767.png');

    await target.setViewport({ width: 768, height: 1024 });
    await target.expectCount(navigation(), 0, 30_000);
    await target.expectCount(topBar(), 0, 30_000);
    await target.expectVisible(chatLaneToggle(), 60_000);
    await waitForModelReady();
    await motionSettled();
    await expect.poll(measureHorizontalOverflow).toEqual({ document: 0, scroller: 0, offenders: [] });
    await expectWholeLayer('desktop at 768');
    await target.screenshot(undefined, 'mobile-matrix-breakpoint-768.png');
  });
});

/**
 * D12: from 768px up the layout is the desktop's, and a coarse pointer adds only I2, I3 and I7 — row actions shown
 * without hover, nothing under 24px, and no keyboard hints.
 *
 * @param state - The state's name.
 */
const expectCoarseDesktop = async (state: string): Promise<void> => {
  expect(await target.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);
  await target.expectCount(navigation(), 0);
  await target.expectCount(topBar(), 0);
  await target.expectVisible(chatLaneToggle(), 60_000);
  // I7: the keyboard hints are in the page, and none of them shows.
  const hints = await target.evaluate(() => {
    const all = [...document.querySelectorAll<HTMLElement>('[class~="pointer-coarse:hidden"]')];
    return { present: all.length, shown: all.filter((hint) => hint.checkVisibility()).length };
  });
  expect(hints.present).toBeGreaterThan(0);
  expect(hints.shown).toBe(0);
  await expect.poll(measureHorizontalOverflow).toEqual({ document: 0, scroller: 0, offenders: [] });
  // I3: the dock tab's close glyph (decorative to assistive technology, which closes with Delete) is a 24px target.
  const closes = await target.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.dv-tab .dv-default-tab-action')]
      .filter((glyph) => glyph.checkVisibility({ opacityProperty: true }))
      .map((glyph) => {
        const { width, height } = glyph.getBoundingClientRect();
        return { width, height };
      }),
  );
  expect(closes.length, 'the active dock tab should show its close glyph').toBeGreaterThan(0);
  for (const close of closes) {
    expect(close.width).toBeGreaterThanOrEqual(23.5);
    expect(close.height).toBeGreaterThanOrEqual(23.5);
  }
  await expectWholeLayer(state);
};

describe('the desktop composition under a coarse pointer', () => {
  test.each([
    { width: 768, height: 1024 },
    { width: 844, height: 390 },
  ])('keeps active tools reachable in a narrow desktop viewer at $width×$height', async (viewport) => {
    await target.commands.uiOpenTarget({ hasTouch: true });
    await prepareComposerPage();
    await target.setViewport(viewport);
    await target.navigate(seedRoute);
    await target.expectUrl(/\/w\/[^/]+\/[^/?]+/u, 120_000);
    await waitForModelReady();
    await motionSettled();
    await expectCoarseDesktop('narrow desktop before tools');
    const sidebarTrigger = selectors.getByRole('button', { name: 'Toggle Sidebar' }).first();
    await target.focus(sidebarTrigger);
    for (let step = 0; step < (viewport.width === 768 ? 4 : 8); step++) {
      // oxlint-disable-next-line no-await-in-loop -- resize through the sidebar's real keyboard control.
      await target.press(sidebarTrigger, 'ArrowRight');
    }
    await motionSettled();
    const sectionToggle = viewerControls().getByRole('button', { name: 'Section view', exact: true });
    await expect
      .poll(async () => target.getAttribute(sectionToggle, 'aria-disabled'), { timeout: 60_000 })
      .not.toBe('true');
    await target.click(sectionToggle, { touch: true });
    await target.click(viewerControls().getByRole('button', { name: 'Measure', exact: true }), { touch: true });
    await target.expectVisible(selectors.getByRole('group', { name: 'Measuring options' }));
    await target.expectVisible(selectors.getByRole('group', { name: 'Section view options' }));
    await motionSettled();
    const toolBounds = await target.evaluateLocator(viewerControls(), (element) => {
      const frame = element.closest('[data-viewer-frame]')!;
      const bounds = (node: Element): Box => {
        const { left, top, right, bottom, width, height } = node.getBoundingClientRect();
        return { left, top, right, bottom, width, height };
      };
      return {
        frame: bounds(frame),
        bar: bounds(element.closest('[data-slot="viewer-controls"]')!),
        controls: [...frame.querySelectorAll('button')].map((button) => ({
          name: button.getAttribute('aria-label') ?? button.textContent,
          box: bounds(button),
        })),
      };
    });
    expect(toolBounds.frame.width).toBeGreaterThanOrEqual(198);
    expect(toolBounds.frame.width).toBeLessThanOrEqual(212);
    expect(toolBounds.frame.right).toBeLessThanOrEqual(viewport.width);
    expect(toolBounds.bar.top).toBeGreaterThanOrEqual(toolBounds.frame.top);
    expect(toolBounds.bar.bottom).toBeLessThanOrEqual(toolBounds.frame.bottom);
    await target.screenshot(undefined, `mobile-matrix-active-tools-${String(viewport.width)}.png`);
    await expectWholeLayer(`narrow desktop with active tools ${JSON.stringify(toolBounds)}`);
    await target.focus(selectors.getByRole('button', { name: 'Done with measure' }));
    await expectWholeLayer('narrow desktop with the last tool action focused');
    await target.screenshot(undefined, `mobile-matrix-active-tools-scrolled-${String(viewport.width)}.png`);
    await target.click(selectors.getByRole('button', { name: 'Done with measure' }), { touch: true });
    await target.expectCount(selectors.getByRole('group', { name: 'Measuring options' }), 0);
    await target.click(selectors.getByRole('button', { name: 'Done with section' }), { touch: true });
    await target.expectCount(selectors.getByRole('group', { name: 'Section view options' }), 0);
    const actions = selectors.getByRole('group', { name: 'Workbench actions', exact: true });
    await target.click(actions.getByRole('button', { name: 'Share', exact: true }), { touch: true });
    await target.expectVisible(selectors.getByRole('region', { name: 'Share project', exact: true }));
    await target.click(actions.getByRole('button', { name: 'Export', exact: true }), { touch: true });
    await target.expectVisible(selectors.getByRole('region', { name: 'Export', exact: true }));
  });

  test('keeps a 1024×1366 touch tablet on the desktop layout with the coarse rules (D12)', async () => {
    await target.commands.uiOpenTarget({ hasTouch: true });
    await prepareComposerPage();
    await target.setViewport({ width: 1024, height: 1366 });
    await target.navigate(seedRoute);
    await target.expectUrl(/\/w\/[^/]+\/[^/?]+/u, 120_000);
    await waitForModelReady();
    await motionSettled();
    await expectCoarseDesktop('tablet 1024×1366');
    await target.screenshot(undefined, 'mobile-matrix-tablet-1024x1366.png');
  });

  test('keeps a landscape phone at 844×390 on the desktop layout with the composer and Send whole', async () => {
    await target.commands.uiOpenTarget({ hasTouch: true, isMobile: true });
    await prepareComposerPage();
    await target.setViewport({ width: 844, height: 390 });
    await target.navigate(seedRoute);
    await target.expectUrl(/\/w\/[^/]+\/[^/?]+/u, 120_000);
    await waitForModelReady();
    await motionSettled();
    await expectCoarseDesktop('landscape 844×390');
    await target.expectVisible(composer(), 60_000);
    for (const [what, locator] of [
      ['The composer', composer()],
      ['Send', send()],
    ] as const) {
      // oxlint-disable-next-line no-await-in-loop -- each in turn.
      const box = await boxOf(locator, what);
      expect(box.bottom, `${what} should end inside the viewport`).toBeLessThanOrEqual(390.5);
      expect(box.right).toBeLessThanOrEqual(844.5);
      // oxlint-disable-next-line no-await-in-loop -- each in turn.
      expect(await reachable(locator), `${what} should take a tap`).toBe(true);
    }
    await target.screenshot(undefined, 'mobile-matrix-landscape-844x390.png');
  });
});

describe('the phone shell with a home-indicator inset', () => {
  test('keeps the nav, composer and Send clear of a 34px bottom inset at 390×844', async () => {
    const viewport = portraitViewports[2];
    const inset = 34;
    await openPhoneProject(viewport);
    const before = await boxOf(navigation(), 'The workbench nav');
    await target.emulateSafeAreaInsets({ bottom: inset });
    try {
      await expect
        .poll(async () => {
          const nav = await boxOf(navigation(), 'The workbench nav');
          return nav.height;
        })
        .toBeCloseTo(before.height + inset, 0);
      await expectStage(viewport);
      const nav = await expectNavigation();
      for (const name of ['Chat', 'Parameters', 'Model', 'All']) {
        // oxlint-disable-next-line no-await-in-loop -- one destination at a time.
        const button = await boxOf(navButton(name), `The ${name} destination`);
        expect(button.bottom, `${name} should sit above the inset`).toBeLessThanOrEqual(nav.bottom - inset + 0.5);
      }
      await expectChatAtHalf(viewport);
      await target.screenshot(undefined, 'mobile-matrix-safe-area-390.png');
    } finally {
      await target.emulateSafeAreaInsets(null);
    }
  });
});

describe('the phone shell at 200% text', () => {
  test('reflows the stage and Half without sideways scroll at 360×780', async () => {
    const viewport = portraitViewports[1];
    await openPhoneProject(viewport);
    await setTextZoom(200);
    try {
      await motionSettled();
      await expectStage(viewport);
      await expectChatAtHalf(viewport);
      await target.screenshot(undefined, 'mobile-matrix-text-200-360.png');
    } finally {
      await setTextZoom(100);
    }
  });
});

type MotionRecord = Readonly<{ what: string; duration: number }>;

/** Record every transition that starts inside a sheet from now on, with its duration in milliseconds. */
const recordSheetTransitions = async (): Promise<void> =>
  target.evaluate(() => {
    const scope = globalThis as typeof globalThis & { tauSheetTransitions?: MotionRecord[] };
    scope.tauSheetTransitions = [];
    document.addEventListener(
      'transitionrun',
      (event) => {
        if (!(event.target instanceof Element) || !event.target.closest('[data-slot="drawer-content"]')) {
          return;
        }
        for (const animation of event.target.getAnimations()) {
          scope.tauSheetTransitions?.push({
            what: `${(event.target instanceof HTMLElement ? event.target.dataset['slot'] : undefined) ?? event.target.tagName.toLowerCase()} ${event.propertyName}`,
            duration: Number(animation.effect?.getComputedTiming().duration ?? 0),
          });
        }
      },
      true,
    );
  });

const readSheetTransitions = async (): Promise<MotionRecord[]> =>
  target.evaluate(
    () => (globalThis as typeof globalThis & { tauSheetTransitions?: MotionRecord[] }).tauSheetTransitions ?? [],
  );

describe('the phone shell with reduced motion', () => {
  test('stills the Saving glyph and moves the sheet without a slide at 390×844', async () => {
    const viewport = portraitViewports[2];
    await target.commands.uiOpenTarget({ hasTouch: true, isMobile: true });
    await target.emulateReducedMotion('reduce');
    await prepareComposerPage();
    /* Every time the status glyph turns busy, what its computed animation is at that moment: the busy state lasts as
     * long as the save, so it is caught as it happens rather than polled for. */
    await target.addInitScript(() => {
      const scope = globalThis as typeof globalThis & {
        tauBusyGlyphs?: Array<{ animationName: string; running: number }>;
      };
      const seen: Array<{ animationName: string; running: number }> = [];
      scope.tauBusyGlyphs = seen;
      const inspect = (node: Node): void => {
        if (!(node instanceof Element)) {
          return;
        }
        for (const element of [node, ...node.querySelectorAll('[data-slot="status-line-icon"]')]) {
          if (element.matches('[data-slot="status-line-icon"][class~="animate-spin"]')) {
            seen.push({
              animationName: getComputedStyle(element).animationName,
              running: element.getAnimations().filter((animation) => animation.playState === 'running').length,
            });
          }
        }
      };
      new MutationObserver((records) => {
        for (const record of records) {
          inspect(record.target);
          for (const added of record.addedNodes) {
            inspect(added);
          }
        }
      }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
    });
    await target.setViewport(viewport);
    await target.navigate('/__e2e/project-file-tree?main=touch-parameters');
    await target.expectUrl(/\/w\/[^/]+\/[^/?]+/u, 120_000);
    await target.expectVisible(titleButton(), 60_000);
    await waitForModelReady();
    expect(await target.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true);

    // A real save: change Width, then Save revision from the project sheet's Revisions.
    await tapDestination('Parameters');
    const width = selectors.getByRole('region', { name: 'Parameters', exact: true }).getByLabelText('Input for Width');
    await target.expectVisible(width.first(), 60_000);
    await target.fill(width.first(), '31');
    await target.press(width.first(), 'Enter');
    await target.expectValue(width.first(), '31', 30_000);
    await target.click(titleButton(), { touch: true });
    await target.click(projectSheet().getByRole('button', { name: 'Revisions', exact: true }), { touch: true });
    const save = selectors
      .getByRole('region', { name: 'Revisions', exact: true })
      .getByRole('region', { name: 'Where you are', exact: true })
      .getByRole('button', { name: 'Save revision', exact: true });
    await target.expectVisible(save, 60_000);
    await target.click(save, { touch: true });
    await target.expectVisible(titleButton().getByText('Saved', { exact: true }), 120_000);
    const glyphs = await target.evaluate(
      () =>
        (globalThis as typeof globalThis & { tauBusyGlyphs?: Array<{ animationName: string; running: number }> })
          .tauBusyGlyphs ?? [],
    );
    expect(glyphs.length, 'the save should have shown the busy glyph').toBeGreaterThan(0);
    for (const glyph of glyphs) {
      expect(glyph).toEqual({ animationName: 'none', running: 0 });
    }

    // The sheet moves between detents in one step: every transition it starts is the reduced-motion 0.01ms.
    await recordSheetTransitions();
    await moveSheet('Home', detents.peek);
    await moveSheet('End', detents.full);
    await moveSheet('ArrowDown', detents.half);
    const reduced = await readSheetTransitions();
    for (const transition of reduced) {
      expect(transition.duration, transition.what).toBeLessThanOrEqual(1);
    }

    // The same moves with motion allowed do slide, so the recorder sees the sheet's transitions.
    await target.emulateReducedMotion('no-preference');
    await recordSheetTransitions();
    await moveSheet('Home', detents.peek);
    await moveSheet('End', detents.full);
    const allowed = await readSheetTransitions();
    expect(Math.max(0, ...allowed.map(({ duration }) => duration))).toBeGreaterThan(100);
    expect(reduced.length, 'the reduced moves should have started transitions too').toBeGreaterThan(0);
  });
});
