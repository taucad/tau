/* oxlint-disable no-eval -- axe-core crosses the trusted browser-command evaluation boundary as source text (the revision-ux-visual-matrix precedent). */
import axe from 'axe-core';
import { page as selectors } from 'vitest/browser';
import * as target from '#support/external-target.js';

/**
 * Page-level checks shared by the Community spec and the route accessibility
 * sweep (page composition policy, Enforcement). Every callback runs in the
 * target page, so each one is self-contained.
 */

/**
 * The sweep's axe rule set: WCAG 2.0–2.2 A/AA plus best practice. `wcag22aa`
 * brings `target-size`, the policy's target gate: 24 × 24 px, or spaced per
 * WCAG 2.5.8's exception (DESIGN, Accessibility).
 */
const sweepTags = ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa', 'best-practice'];

export type AxeFinding = {
  readonly id: string;
  readonly impact: string | undefined;
  readonly targets: readonly string[];
};

/**
 * Serious and critical axe violations in `selector` (the whole document by
 * default), with the full sweep tags or only the named `rules`.
 */
export const seriousAxeViolations = async (
  options: { readonly rules?: readonly string[]; readonly selector?: string } = {},
): Promise<AxeFinding[]> =>
  target.evaluate(
    async ({ axeSource, tags, rules, selector }) => {
      type AxeResults = {
        violations: Array<{ id: string; impact?: string; nodes: Array<{ target: unknown[] }> }>;
      };
      const scope = globalThis as typeof globalThis & {
        axe?: { run(root: Element | Document, options: unknown): Promise<AxeResults> };
      };
      if (!scope.axe) {
        globalThis.eval(axeSource);
      }
      const root = selector ? document.querySelector(selector) : document;
      if (!root || !scope.axe) {
        throw new Error(`Accessibility audit root ${String(selector)} is unavailable.`);
      }
      const results = await scope.axe.run(root, {
        runOnly: rules ? { type: 'rule', values: rules } : { type: 'tag', values: tags },
      });
      return results.violations
        .filter(({ impact }) => impact === 'serious' || impact === 'critical')
        .map(({ id, impact, nodes }) => ({
          id,
          impact,
          targets: nodes.slice(0, 5).map((node) => node.target.join(' ')),
        }));
    },
    { axeSource: axe.source, tags: sweepTags, rules: options.rules, selector: options.selector },
  );

/** Declines analytics so the consent banner neither covers the page nor joins its tab order. */
export const declineCookies = async (): Promise<void> => {
  const decline = selectors.getByRole('button', { name: 'Decline', exact: true });
  await target.expectVisible(decline, 15_000);
  await target.click(decline);
  await target.expectHidden(decline);
};

export type HorizontalOverflow = {
  /** Width the document scrolls past the viewport. */
  readonly document: number;
  /** Width the shell's page scroller (the one holding the `h1`) scrolls past its box. */
  readonly scroller: number;
  /** Up to five elements in `<main>` whose right edge leaves the viewport unclipped. */
  readonly offenders: readonly string[];
};

/** Horizontal overflow of the page at the current viewport and text size. */
export const measureHorizontalOverflow = async (): Promise<HorizontalOverflow> =>
  target.evaluate(() => {
    const root = document.documentElement;
    const width = root.clientWidth;
    let scroller: HTMLElement | undefined = document.querySelector('h1') ?? undefined;
    while (scroller && !/auto|scroll/u.test(getComputedStyle(scroller).overflowY)) {
      scroller = scroller.parentElement ?? undefined;
    }
    const main = document.querySelector('main') ?? document.body;
    const offenders = [...main.querySelectorAll<HTMLElement>('*')]
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        if (rect.width === 0 || rect.right <= width + 1) {
          return false;
        }
        // Content clipped or scrolled by an ancestor inside the viewport is not page overflow;
        // the page scroller itself is the box being measured, so the walk stops there.
        for (
          let ancestor = element.parentElement;
          ancestor && ancestor !== main && ancestor !== scroller;
          ancestor = ancestor.parentElement
        ) {
          if (
            getComputedStyle(ancestor).overflowX !== 'visible' &&
            ancestor.getBoundingClientRect().right <= width + 1
          ) {
            return false;
          }
        }
        return true;
      })
      .slice(0, 5)
      .map(
        (element) =>
          `${element.tagName.toLowerCase()}[${String(element.getAttribute('class')).slice(0, 60)}] right=${Math.round(element.getBoundingClientRect().right)}`,
      );
    return {
      document: Math.max(root.scrollWidth, document.body.scrollWidth) - width,
      scroller: scroller ? scroller.scrollWidth - scroller.clientWidth : 0,
      offenders,
    };
  });

/** Sets the root text size (100 is the default), as a browser's text-only zoom does. */
export const setTextZoom = async (percent: number): Promise<void> =>
  target.evaluate((value) => {
    document.documentElement.style.fontSize = value === 100 ? '' : `${String(value)}%`;
  }, percent);

export type PageSemantics = {
  readonly title: string;
  readonly headingOnes: readonly string[];
  readonly mainLandmarks: number;
  /** Viewport top of the first list item in `<main>` with the page scrolled to the top, if the page lists anything. */
  readonly firstListItemTop: number | undefined;
};

export const readPageSemantics = async (): Promise<PageSemantics> =>
  target.evaluate(() => {
    let scroller: HTMLElement | undefined = document.querySelector('h1') ?? undefined;
    while (scroller && !/auto|scroll/u.test(getComputedStyle(scroller).overflowY)) {
      scroller = scroller.parentElement ?? undefined;
    }
    if (scroller) {
      scroller.scrollTop = 0;
    }
    const main = document.querySelector('main');
    const firstItem = main
      ? [...main.querySelectorAll<HTMLElement>('li, [role="listitem"]')].find(
          (item) => !item.closest('nav') && item.checkVisibility() && item.getBoundingClientRect().height > 0,
        )
      : undefined;
    return {
      title: document.title,
      headingOnes: [...document.querySelectorAll('h1')]
        .filter((heading) => heading.checkVisibility())
        .map((heading) => heading.textContent.trim()),
      mainLandmarks: document.querySelectorAll('main, [role="main"]').length,
      firstListItemTop: firstItem ? Math.round(firstItem.getBoundingClientRect().top * 10) / 10 : undefined,
    };
  });

export type FocusRing = {
  readonly name: string;
  readonly focusVisible: boolean;
  readonly outline: string;
  /** Contrast of the computed outline colour against the button's fill. */
  readonly contrast: number;
};

/**
 * Focuses each visible filled (`primary-action`) button in `<main>` after a
 * key press, so `:focus-visible` applies, and measures its outline against its fill.
 */
export const measureFilledButtonFocusRings = async (): Promise<FocusRing[]> => {
  await target.keyboardPress('Shift');
  return target.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) {
      throw new Error('2D canvas is unavailable for colour resolution.');
    }
    // The canvas resolves any CSS colour (oklch included) to sRGB bytes.
    const toLuminance = (color: string): number => {
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = '#000';
      context.fillStyle = color;
      context.fillRect(0, 0, 1, 1);
      const [red = 0, green = 0, blue = 0] = context.getImageData(0, 0, 1, 1).data;
      const [r, g, b] = [red, green, blue].map((channel) => {
        const value = channel / 255;
        return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
    };
    const buttons = [...document.querySelectorAll<HTMLElement>('main .primary-action')].filter(
      (button) => button.checkVisibility() && !button.matches(':disabled, [aria-disabled="true"]'),
    );
    const rings = buttons.map((button) => {
      button.focus();
      const style = getComputedStyle(button);
      const [lighter, darker] = [toLuminance(style.outlineColor), toLuminance(style.backgroundColor)].sort(
        (a, b) => b - a,
      );
      return {
        name: (button.getAttribute('aria-label') ?? button.textContent).trim(),
        focusVisible: button.matches(':focus-visible'),
        outline: `${style.outlineStyle} ${style.outlineWidth}`,
        contrast: Math.round((((lighter ?? 0) + 0.05) / ((darker ?? 0) + 0.05)) * 100) / 100,
      };
    });
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    return rings;
  });
};

/**
 * Hovers up to `limit` visible buttons and links in `<main>` and returns the
 * serious axe colour-contrast findings in each hovered state.
 */
export const hoverContrastViolations = async (limit = 8): Promise<{ tested: number; findings: AxeFinding[] }> => {
  const count = await target.evaluate((max) => {
    const candidates = [...document.querySelectorAll<HTMLElement>('main :is(button, a[href])')].filter(
      (element) =>
        element.checkVisibility() &&
        element.getBoundingClientRect().width > 1 &&
        element.textContent.trim() !== '' &&
        !element.matches(':disabled'),
    );
    for (const [index, element] of candidates.slice(0, max).entries()) {
      element.dataset['hoverAudit'] = String(index);
    }
    return Math.min(candidates.length, max);
  }, limit);
  const findings: AxeFinding[] = [];
  for (let index = 0; index < count; index += 1) {
    const selector = `[data-hover-audit="${String(index)}"]`;
    // oxlint-disable-next-line no-await-in-loop -- one pointer, so each hover is measured before the next.
    await target.hover(selectors.getByCss(selector));
    // oxlint-disable-next-line no-await-in-loop -- see above.
    findings.push(...(await seriousAxeViolations({ rules: ['color-contrast'], selector })));
  }
  await target.mouseMove(0, 0);
  return { tested: count, findings };
};
