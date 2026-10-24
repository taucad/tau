import { describe, expect, test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import * as target from '#support/external-target.js';
import { measureHorizontalOverflow, seriousAxeViolations } from '#support/page-audit.js';

type TopBarGeometry = {
  readonly height: number | undefined;
  readonly overflow: number | undefined;
  readonly title: string | undefined;
  readonly trigger: number | undefined;
  readonly crumb: { readonly height: number; readonly right: number } | undefined;
};

/** The phone top bar's box, its own overflow, its title and its primary targets' sizes. */
const readTopBar = async (): Promise<TopBarGeometry> =>
  target.evaluate(() => {
    const header = document.querySelector<HTMLElement>('main > header');
    const trigger = header?.querySelector('[data-slot=sidebar-trigger]')?.getBoundingClientRect();
    const crumb = header?.querySelector('[data-slot=page-parent-crumb]')?.getBoundingClientRect();
    return {
      height: header?.getBoundingClientRect().height,
      overflow: header ? header.scrollWidth - header.clientWidth : undefined,
      title: header?.querySelector('[data-slot=page-title]')?.textContent ?? undefined,
      trigger: trigger?.height,
      crumb: crumb ? { height: crumb.height, right: crumb.right } : undefined,
    };
  });

// D11/W9 (PG-NEW-1, PG-PROJ-1): sidebar, back-to-parent crumb, title, at most one action.
describe.each([320, 390])('shell page top bar at %ipx', (width) => {
  test('should fit the bar and return from a nested route to its parent', async () => {
    await target.setViewport({ width, height: 720 });
    await target.navigate('/projects/new');
    const crumb = selectors.getByRole('link', { name: 'Back to Projects', exact: true });
    await target.expectVisible(crumb, 60_000);

    const nested = await readTopBar();
    expect(nested).toMatchObject({ height: 48, overflow: 0, title: 'New project' });
    expect(nested.trigger).toBeGreaterThanOrEqual(40);
    expect(nested.crumb?.height).toBeGreaterThanOrEqual(40);
    expect(nested.crumb?.right).toBeLessThanOrEqual(width);
    await expect.poll(measureHorizontalOverflow).toEqual({ document: 0, scroller: 0, offenders: [] });
    expect(await seriousAxeViolations()).toEqual([]);
    await target.screenshot(undefined, `page-top-bar-nested-${width}.png`);

    await target.click(crumb);
    await target.expectUrl(/\/projects$/u);
    await target.expectHidden(selectors.getByRole('link', { name: /^Back to /u }));
    await expect
      .poll(async () => {
        const { title } = await readTopBar();
        return title;
      })
      .toBe('Projects');
    expect(await readTopBar()).toMatchObject({ height: 48, overflow: 0, crumb: undefined });
  });
});
