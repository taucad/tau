import { describe, expect, test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import * as target from '#support/external-target.js';
import {
  declineCookies,
  hoverContrastViolations,
  measureFilledButtonFocusRings,
  measureHorizontalOverflow,
  readPageSemantics,
  seriousAxeViolations,
  setTextZoom,
} from '#support/page-audit.js';

/*
 * The route accessibility sweep (page composition policy, Enforcement; blueprint
 * W3.5): the five product index routes at a laptop and a phone viewport, then
 * reflow at 320 px and at 200 % text. Soft assertions report every rule a route
 * breaks in one run instead of stopping at the first.
 */

const routes = ['/community', '/projects', '/files', '/plugins', '/usage'] as const;
/** Routes whose collection is always populated in the e2e environment. */
const populatedRoutes = new Set<string>(['/community']);
const firstRowBudget = 180;
const defaultTitle = 'Tau';

/**
 * Opens `route` and says why it cannot be audited here, if it cannot: a sign-in
 * redirect, or the not-found page of a build that leaves the route out
 * (`apps/ui/app/routes.ts` drops `/usage` unless TAU_CLOUD_ENABLED, and this tier
 * builds the self-host variant).
 */
const openRoute = async (route: string, viewport: { width: number; height: number }): Promise<string | undefined> => {
  await target.setViewport(viewport);
  await target.navigate(route);
  await target.expectVisible(selectors.getByRole('main'), 60_000);
  await declineCookies();
  const landed = new URL(await target.currentUrl()).pathname;
  if (landed !== route) {
    return `${route} redirected to ${landed}; it needs an account the e2e environment has not got.`;
  }
  // Headings arrive with the route module; a page without one is reported by the rules, not here.
  await target.expectVisible(selectors.getByRole('heading', { level: 1 }), 30_000).catch(() => undefined);
  const { headingOnes } = await readPageSemantics();
  return headingOnes[0] === '404' ? `${route} is not part of this build (self-host builds omit it).` : undefined;
};

describe.each(routes)('%s', (route) => {
  for (const viewport of [
    { width: 1280, height: 720 },
    { width: 390, height: 844 },
  ]) {
    test(`should meet the page rules at ${String(viewport.width)}×${String(viewport.height)}`, async ({ skip }) => {
      const unavailable = await openRoute(route, viewport);
      skip(unavailable !== undefined, unavailable);
      await target.screenshot(undefined, `route${route.replaceAll('/', '-')}-${String(viewport.width)}.png`);

      const semantics = await readPageSemantics();
      const axeFindings = await seriousAxeViolations();
      const rings = await measureFilledButtonFocusRings();
      const hover = await hoverContrastViolations();
      const slug = `${route.replaceAll('/', '')}-${String(viewport.width)}`;
      await target.writeArtifact(
        `route-accessibility/${slug}.json`,
        `${JSON.stringify({ route, viewport, semantics, axeFindings, rings, hover }, null, 2)}\n`,
      );

      expect.soft(semantics.headingOnes, 'exactly one h1').toHaveLength(1);
      expect.soft(semantics.title, 'a route-owned document title').not.toBe(defaultTitle);
      expect.soft(semantics.title, 'a non-empty document title').not.toBe('');
      expect.soft(semantics.mainLandmarks, 'one main landmark').toBe(1);
      if (populatedRoutes.has(route)) {
        expect.soft(semantics.firstListItemTop, 'a first list item').toBeDefined();
      }
      if (viewport.width === 1280 && semantics.firstListItemTop !== undefined) {
        expect
          .soft(semantics.firstListItemTop, 'first list item within the first-row budget')
          .toBeLessThanOrEqual(firstRowBudget);
      }
      // Includes `target-size` (wcag22aa), which applies WCAG 2.5.8's spacing exception.
      expect.soft(axeFindings, 'serious or critical axe violations').toEqual([]);
      for (const ring of rings) {
        expect.soft(ring.focusVisible, `${ring.name}: focus-visible`).toBe(true);
        expect.soft(ring.outline, `${ring.name}: a painted outline`).toMatch(/^solid [1-9]/u);
        expect.soft(ring.contrast, `${ring.name}: ring against its fill`).toBeGreaterThanOrEqual(3);
      }
      expect.soft(hover.findings, `hover text contrast over ${String(hover.tested)} controls`).toEqual([]);
    });
  }

  test('should reflow without horizontal overflow at 320 px and at 200 % text', async ({ skip }) => {
    const unavailable = await openRoute(route, { width: 320, height: 720 });
    skip(unavailable !== undefined, unavailable);
    const narrow = await measureHorizontalOverflow();
    await target.screenshot(undefined, `route${route.replaceAll('/', '-')}-320.png`);

    await target.setViewport({ width: 1280, height: 720 });
    await setTextZoom(200);
    await target.delay(100);
    const largeText = await measureHorizontalOverflow();
    await target.screenshot(undefined, `route${route.replaceAll('/', '-')}-text-200.png`);
    await setTextZoom(100);
    await target.writeArtifact(
      `route-accessibility/${route.replaceAll('/', '')}-reflow.json`,
      `${JSON.stringify({ route, narrow, largeText }, null, 2)}\n`,
    );

    expect.soft(narrow, '320 px').toEqual({ document: 0, scroller: 0, offenders: [] });
    expect.soft(largeText, '200 % text').toEqual({ document: 0, scroller: 0, offenders: [] });
  });
});
