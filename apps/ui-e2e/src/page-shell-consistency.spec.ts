import { describe, expect, test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import * as target from '#support/external-target.js';
import { measureHorizontalOverflow, seriousAxeViolations } from '#support/page-audit.js';

describe('page shell and populated Projects', () => {
  test('should keep top-edge content reachable and preserve collection state across views', async () => {
    await target.setViewport({ width: 1280, height: 720 });
    await target.navigate('/__e2e/project-navigation');
    await target.expectUrl(/\/w\/[^/]+\/[^/]+$/u, 60_000);
    await target.navigate('/projects');
    await target.expectVisible(selectors.getByRole('searchbox', { name: 'Search projects' }), 60_000);
    const decline = selectors.getByRole('button', { name: 'Decline', exact: true });
    if (await target.isVisible(decline)) {
      await target.click(decline);
    }
    const geometry = await target.evaluate(() => {
      const scroller = document.querySelector('main > section');
      const card = document.querySelector('ul[aria-label="Projects"] > li');
      return { top: scroller?.getBoundingClientRect().top, firstCard: card?.getBoundingClientRect().top };
    });
    expect(geometry.top).toBe(0);
    expect(geometry.firstCard).toBeLessThanOrEqual(180);
    await target.screenshot(undefined, 'projects-production-1280.png');
    await target.setViewport({ width: 1280, height: 320 });
    for (const top of [0, 20, 36, 60, 0]) {
      // oxlint-disable-next-line no-await-in-loop -- Scroll offsets must be observed sequentially in the same scrollport.
      const result = await target.evaluate((offset) => {
        const scroller = document.querySelector<HTMLElement>('main > section');
        if (!scroller) {
          throw new Error('Page scrollport missing');
        }
        scroller.scrollTop = offset;
        return { top: scroller.getBoundingClientRect().top, scrollTop: scroller.scrollTop };
      }, top);
      expect(result).toEqual({ top: 0, scrollTop: top });
    }
    await target.setViewport({ width: 1280, height: 720 });
    await target.fill(selectors.getByRole('searchbox', { name: 'Search projects' }), 'Navigation A');
    await target.click(selectors.getByRole('button', { name: 'View mode', exact: true }));
    await target.click(selectors.getByRole('menuitemcheckbox', { name: 'Table' }));
    await target.expectVisible(selectors.getByRole('button', { name: 'Toggle columns' }));
    expect(new URL(await target.currentUrl()).searchParams.get('q')).toBe('Navigation A');
    await target.click(selectors.getByRole('button', { name: 'View mode', exact: true }));
    await target.click(selectors.getByRole('menuitemcheckbox', { name: 'Grid' }));
    await target.expectHidden(selectors.getByRole('button', { name: 'Toggle columns' }));
    await target.setViewport({ width: 320, height: 720 });
    expect(await measureHorizontalOverflow()).toEqual({ document: 0, scroller: 0, offenders: [] });
    expect(await seriousAxeViolations()).toEqual([]);
    await target.screenshot(undefined, 'projects-production-320.png');
  });
});
