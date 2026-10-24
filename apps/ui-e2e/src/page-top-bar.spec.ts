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
  /**
   * The page's one `h1`: how many there are and whether it still paints. Below `md` the heading
   * itself is `max-md:sr-only` (absolute 1px box, `clip-path: inset(50%)`), while its count stays.
   */
  readonly headings: number;
  readonly headingPainted: boolean;
  /** The bar's action: its accessible text and height; and whether the title row's copy still paints. */
  readonly action: { readonly text: string; readonly height: number } | undefined;
  readonly titleRowActionPainted: boolean;
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
      headings: document.querySelectorAll('h1').length,
      headingPainted: (() => {
        const heading = document.querySelector('h1');
        return heading
          ? heading.getBoundingClientRect().width > 1 && getComputedStyle(heading).clipPath !== 'inset(50%)'
          : true;
      })(),
      action: (() => {
        const link = header?.querySelector<HTMLElement>('[data-slot=page-header-action] a');
        return link ? { text: link.textContent.trim(), height: link.getBoundingClientRect().height } : undefined;
      })(),
      // The title row's own New project link only: the empty library's "Build from code" shares its href.
      titleRowActionPainted:
        document.querySelector<HTMLElement>('main > section [data-slot=new-project-link]')?.checkVisibility() ?? false,
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
    expect(nested).toMatchObject({
      height: 48,
      overflow: 0,
      title: 'New project',
      headings: 1,
      headingPainted: false,
    });
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
    const projects = await readTopBar();
    expect(projects).toMatchObject({ height: 48, overflow: 0, crumb: undefined, headings: 1, headingPainted: false });
    // PG-PROJ-1: New project is the bar's one action at 40px, and the title row's copy is gone (I4).
    expect(projects.action?.text).toBe('New project');
    expect(projects.action?.height).toBeGreaterThanOrEqual(40);
    expect(projects.titleRowActionPainted).toBe(false);
    await expect.poll(measureHorizontalOverflow).toEqual({ document: 0, scroller: 0, offenders: [] });
    await target.screenshot(undefined, `page-top-bar-projects-${width}.png`);
  });
});

// D11: from `md` up the phone bar takes no room and New project stays in the title row.
describe('shell page header at 1280px', () => {
  test('should keep /projects headerless with New project in its title row', async () => {
    await target.setViewport({ width: 1280, height: 720 });
    await target.navigate('/projects');
    await target.expectVisible(selectors.getByRole('heading', { level: 1, name: 'Projects' }), 60_000);
    const desktop = await target.evaluate(() => ({
      headerPainted: document.querySelector<HTMLElement>('main > header')?.checkVisibility() ?? false,
      titleRowLinkPainted:
        document.querySelector<HTMLElement>('main > section [data-slot=new-project-link]')?.checkVisibility() ?? false,
      sectionTop: document.querySelector('main > section')?.getBoundingClientRect().top,
    }));
    expect(desktop).toEqual({ headerPainted: false, titleRowLinkPainted: true, sectionTop: 0 });
  });
});
