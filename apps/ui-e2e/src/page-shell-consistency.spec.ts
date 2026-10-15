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
    await target.expectVisible(decline, 15_000);
    await target.click(decline);
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
    await expect.poll(measureHorizontalOverflow).toEqual({ document: 0, scroller: 0, offenders: [] });
    expect(await seriousAxeViolations()).toEqual([]);
    await target.screenshot(undefined, 'projects-production-320.png');
  });
});

describe('mobile Preview controls', () => {
  test('should connect drawer panels and keep Edit outside the orientation controls', async () => {
    await target.setViewport({ width: 1280, height: 720 });
    await target.navigate('/__e2e/project-navigation');
    await target.expectUrl(/\/w\/[^/]+\/[^/]+$/u, 60_000);
    const editorUrl = new URL(await target.currentUrl()).pathname;
    const decline = selectors.getByRole('button', { name: 'Decline', exact: true });
    await target.expectVisible(decline, 15_000);
    await target.click(decline);
    await target.setViewport({ width: 320, height: 720 });
    await target.navigate(`${editorUrl}/preview`);
    const model = selectors.getByRole('tab', { name: 'Model', exact: true });
    await target.expectVisible(model, 60_000);
    await target.expectVisible(selectors.getByRole('tabpanel', { name: 'Model', exact: true }));
    expect(await seriousAxeViolations()).toEqual([]);
    await target.click(selectors.getByRole('tab', { name: 'Files', exact: true }));
    await target.expectVisible(selectors.getByRole('tabpanel', { name: 'Files', exact: true }));
    await target.click(selectors.getByRole('tab', { name: 'Details', exact: true }));
    await target.expectVisible(selectors.getByRole('tabpanel', { name: 'Details', exact: true }));
    await target.click(model);
    const edit = selectors.getByRole('button', { name: 'Edit', exact: true });
    await target.expectVisible(edit);
    const editIsHittable = async (): Promise<boolean> =>
      target.evaluate(() => {
        const button = [...document.querySelectorAll('button')].find(
          (element) => element.checkVisibility() && element.textContent.trim() === 'Edit',
        );
        if (!button) {
          return false;
        }
        const bounds = button.getBoundingClientRect();
        const hit = document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
        return hit !== null && button.contains(hit);
      });
    await target.screenshot(undefined, 'preview-production-320.png');
    await expect.poll(editIsHittable).toBe(true);
    await target.click(edit);
    await target.expectUrl(new RegExp(`${editorUrl}$`, 'u'));
  });
});

describe.each(['Light', 'Dark', 'Black', 'High Contrast'])('Projects in %s', (theme) => {
  test('should retain readable controls and reflow across the reviewed widths', async () => {
    await target.setViewport({ width: 1280, height: 720 });
    await target.navigate('/__e2e/project-navigation');
    await target.expectUrl(/\/w\/[^/]+\/[^/]+$/u, 60_000);
    await target.navigate('/projects?settings=general');
    await target.click(selectors.getByRole('button', { name: /^(?:light|dark|black|high contrast|system)$/iu }));
    await target.click(selectors.getByRole('option', { name: new RegExp(`^${theme}`, 'iu') }));
    await target.keyboardPress('Escape');
    await target.expectHidden(selectors.getByRole('dialog', { name: /^settings$/iu }));
    const decline = selectors.getByRole('button', { name: 'Decline', exact: true });
    await target.expectVisible(decline, 15_000);
    await target.click(decline);
    for (const width of [320, 390, 768, 1280, 1920, 2560]) {
      // oxlint-disable-next-line no-await-in-loop -- Each width owns the same page and must settle before measurement.
      await target.setViewport({ width, height: 720 });
      // oxlint-disable-next-line no-await-in-loop -- Measure the current viewport before changing it.
      await expect.poll(measureHorizontalOverflow).toEqual({ document: 0, scroller: 0, offenders: [] });
      if (width === 320 || width === 1280) {
        // oxlint-disable-next-line no-await-in-loop -- Audit the current theme and viewport before changing it.
        expect(await seriousAxeViolations()).toEqual([]);
      }
    }
  });
});
