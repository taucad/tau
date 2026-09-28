/* oxlint-disable no-await-in-loop -- The keyboard walk and the viewport rows drive one page in order. */
import { describe, expect, test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import * as target from '#support/external-target.js';
import {
  declineCookies,
  measureHorizontalOverflow,
  readPageSemantics,
  seriousAxeViolations,
} from '#support/page-audit.js';

/*
 * The Community explorer (community-page-refresh blueprint, W2.3): URL-backed
 * kernel and search, standard pagination over the 20 curated examples, the
 * featured card, #locator anchors, the card's three tab stops, the first-row
 * budget, the card's Remix flow, the palette's Examples group, axe and reflow.
 */

const featuredName = 'Kestrel 240 Racing Quadcopter';
const search = selectors.getByRole('searchbox', { name: 'Search examples' });
const status = selectors.getByRole('status').filter({ hasText: /examples|match/u });
const listItems = selectors.getByCss('main ul[role="list"] > li');
const featuredBadge = selectors.getByText('Featured', { exact: true });
const kernelTile = (name: RegExp) => selectors.getByRole('radio', { name });

const laptop = { width: 1280, height: 720 };

const openCommunity = async (path = '/community'): Promise<void> => {
  await target.setViewport(laptop);
  await target.navigate(path);
  await target.expectVisible(search, 60_000);
  await declineCookies();
};

const searchParameters = async (): Promise<Record<string, string>> =>
  Object.fromEntries(new URL(await target.currentUrl()).searchParams);

/** The page's own scroller: `html` and `body` never scroll in the shell. */
const pageScrollTop = async (next?: number): Promise<number> =>
  target.evaluate((value) => {
    let scroller: HTMLElement | undefined = document.querySelector('h1') ?? undefined;
    while (scroller && !/auto|scroll/u.test(getComputedStyle(scroller).overflowY)) {
      scroller = scroller.parentElement ?? undefined;
    }
    if (!scroller) {
      throw new Error('The Community page has no scroller.');
    }
    if (value >= 0) {
      scroller.scrollTop = value;
    }
    return scroller.scrollTop;
  }, next ?? -1);

const focusedControl = async (): Promise<string> =>
  target.evaluate(() => {
    const element = document.activeElement;
    return element
      ? `${element.tagName.toLowerCase()}:${(element.getAttribute('aria-label') ?? element.textContent).trim()}`
      : '';
  });

const leaveForExample = async (name: string): Promise<void> => {
  await target.click(selectors.getByRole('link', { name: `Open ${name}`, exact: true }));
  await expect
    .poll(async () => new URL(await target.currentUrl()).pathname, { timeout: 30_000 })
    .not.toBe('/community');
};

const goBack = async (): Promise<void> => {
  await target.evaluate(() => {
    history.back();
  });
  await expect.poll(async () => new URL(await target.currentUrl()).pathname, { timeout: 30_000 }).toBe('/community');
  await target.expectVisible(search, 30_000);
};

describe('Community explorer', () => {
  test('should keep the kernel and search in the URL across reload and Back', async () => {
    await openCommunity();
    await target.expectText(status, '20 examples');

    await target.click(kernelTile(/^OpenSCAD/u));
    await expect.poll(searchParameters).toEqual({ kernel: 'openscad' });
    await target.expectText(status, '4 of 20 match');
    await target.expectCount(listItems, 4);

    await target.fill(search, 'vase');
    await expect.poll(searchParameters).toEqual({ kernel: 'openscad', q: 'vase' });
    await target.expectText(status, '1 of 20 match');
    await target.expectCount(listItems, 1);

    const expectVaseView = async (): Promise<void> => {
      await target.expectValue(search, 'vase', 30_000);
      await target.expectAttribute(kernelTile(/^OpenSCAD/u), 'aria-checked', 'true');
      await target.expectText(status, '1 of 20 match');
      await target.expectCount(listItems, 1);
      await target.expectVisible(selectors.getByRole('link', { name: 'Open Fluted Vase', exact: true }));
      expect(await searchParameters()).toEqual({ kernel: 'openscad', q: 'vase' });
    };

    await target.reload();
    await target.expectVisible(search, 60_000);
    await expectVaseView();

    await leaveForExample('Fluted Vase');
    await goBack();
    await expectVaseView();
  });

  test('should return to the scroll offset when Back leaves an example', async () => {
    await openCommunity();
    await target.expectCount(listItems, 20);
    const offset = await pageScrollTop(900);
    expect(offset).toBeGreaterThan(600);
    /* A card wholly inside the scroller's box, so clicking it does not scroll the page first. */
    const visibleCard = await target.evaluate(() => {
      const list = document.querySelector('main ul[role="list"]');
      let scroller = list?.parentElement ?? undefined;
      while (scroller && !/auto|scroll/u.test(getComputedStyle(scroller).overflowY)) {
        scroller = scroller.parentElement ?? undefined;
      }
      const box = scroller?.getBoundingClientRect();
      const item = [...(list?.children ?? [])].find((candidate) => {
        const rect = candidate.getBoundingClientRect();
        return box !== undefined && rect.top >= box.top && rect.bottom <= box.bottom;
      });
      return item?.querySelector('h2')?.textContent.trim();
    });
    expect(visibleCard).toBeTypeOf('string');
    // Let the scroll event record the offset before the navigation.
    await expect.poll(async () => pageScrollTop()).toBe(offset);
    await target.delay(200);

    await leaveForExample(visibleCard!);
    await goBack();
    await expect.poll(async () => pageScrollTop(), { timeout: 10_000 }).toBe(offset);
  });

  test('should page the curated examples and restart a new filter at page one', async () => {
    await openCommunity();
    await target.expectVisible(selectors.getByText('Page 1 of 1', { exact: true }));
    await target.expectVisible(selectors.getByText('1–20 of 20 examples', { exact: true }));
    await target.expectCount(listItems, 20);
    await target.expectVisible(selectors.getByRole('heading', { level: 2, name: featuredName }));
    await target.expectCount(featuredBadge, 1);
    await target.expectText(selectors.getByRole('combobox', { name: 'Items per page' }), '20');

    /* The page-size menu offers 20/50/100, so one page holds the whole list. A stored
       preference of 5 (the same per-device key the menu writes) exercises real paging. */
    await target.addInitScript(() => {
      localStorage.setItem('tau-example-page-size', '5');
    });
    await target.reload();
    await target.expectVisible(search, 60_000);
    await target.expectVisible(selectors.getByText('Page 1 of 4', { exact: true }), 30_000);
    await target.expectVisible(selectors.getByText('1–5 of 20 examples', { exact: true }));
    await target.expectCount(listItems, 5);
    await target.expectCount(featuredBadge, 1);

    await target.click(selectors.getByRole('button', { name: 'Go to next page' }));
    await target.expectVisible(selectors.getByText('Page 2 of 4', { exact: true }));
    await target.expectVisible(selectors.getByText('6–10 of 20 examples', { exact: true }));
    await target.expectCount(listItems, 5);
    // The featured card leads only the unfiltered first page.
    await target.expectCount(featuredBadge, 0);

    await target.click(kernelTile(/^Replicad/u));
    await target.expectVisible(selectors.getByText('Page 1 of 3', { exact: true }));
    await target.expectVisible(selectors.getByText('1–5 of 15 examples', { exact: true }));
    await target.expectCount(featuredBadge, 0);

    await target.click(selectors.getByRole('button', { name: 'Go to next page' }));
    await target.expectVisible(selectors.getByText('Page 2 of 3', { exact: true }));
    await target.fill(search, 'gear');
    await target.expectVisible(selectors.getByText(/^Page 1 of \d+$/u));
    await target.expectVisible(selectors.getByText(/^1–\d+ of \d+ examples?$/u));

    await target.click(selectors.getByRole('button', { name: 'Clear', exact: true }));
    await target.expectText(status, '20 examples');
    await target.expectVisible(selectors.getByText('Page 1 of 4', { exact: true }));
    await target.expectCount(featuredBadge, 1);
    expect(await searchParameters()).toEqual({});
  });

  test('should focus the anchored card link from a #locator URL', async () => {
    await openCommunity();
    /* Declining cookies takes focus, so the anchored load comes after it: a reload of the #locator URL. */
    await target.evaluate(() => {
      history.replaceState(null, '', '/community#replicad.bench-vise');
    });
    await target.reload();
    const link = selectors.getByRole('link', { name: 'Open BV-125 Bench Vice', exact: true });
    await target.expectFocused(link, 15_000);
    const box = await target.boundingBox(link);
    expect(box).toBeDefined();
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.y + box!.height).toBeLessThanOrEqual(720);
  });

  test('should give each card three tab stops: its link, the eye and Remix', async () => {
    await openCommunity();
    const names = await target.evaluate(() =>
      [...document.querySelectorAll('main ul[role="list"] > li h2')].map((heading) => heading.textContent.trim()),
    );
    expect(names).toHaveLength(20);
    expect(names[0]).toBe(featuredName);

    await target.focus(selectors.getByRole('link', { name: `Open ${featuredName}`, exact: true }));
    const walk = [await focusedControl()];
    for (let index = 1; index < names.length * 3; index += 1) {
      await target.keyboardPress('Tab');
      walk.push(await focusedControl());
    }
    expect(walk).toEqual(names.flatMap((name) => [`a:Open ${name}`, 'button:Preview model', `button:Remix ${name}`]));
    // After the last card, Tab leaves the grid for the pagination controls.
    await target.keyboardPress('Tab');
    expect(await focusedControl()).toMatch(/^button:|^select:|^input:/u);
    expect(await focusedControl()).not.toMatch(/Open |Preview model|Remix /u);
  });

  test('should start the first card row within 180 px of the top at 1280×720', async () => {
    await openCommunity();
    const semantics = await readPageSemantics();
    expect(semantics.firstListItemTop).toBeDefined();
    expect(semantics.firstListItemTop).toBeLessThanOrEqual(180);
  });

  test('should open the remix location dialog from a card and cancel without creating a project', async () => {
    await openCommunity();
    const remix = selectors.getByRole('button', { name: 'Remix BV-125 Bench Vice', exact: true });
    await target.click(remix);
    const dialog = selectors.getByRole('dialog', { name: 'Remix BV-125 Bench Vice' });
    await target.expectVisible(dialog, 15_000);
    await target.expectVisible(dialog.getByText('Choose where the project files will be persisted.'));
    await target.click(dialog.getByRole('button', { name: 'Cancel', exact: true }));
    await target.expectHidden(dialog);
    await target.expectFocused(remix);
    expect(new URL(await target.currentUrl()).pathname).toBe('/community');
  });

  test('should list the curated examples under Examples in the command palette', async () => {
    await openCommunity();
    await target.keyboardPress('ControlOrMeta+k');
    const dialog = selectors.getByRole('dialog');
    const input = dialog.getByPlaceholder('Search projects, chats, and actions…');
    await target.expectVisible(input, 15_000);
    await target.fill(input, 'Kestrel');
    await target.expectVisible(dialog.getByText('Examples', { exact: true }));
    await target.expectVisible(dialog.getByRole('option', { name: new RegExp(featuredName, 'u') }));
    await target.keyboardPress('Escape');
    await target.expectHidden(input);
  });

  test('should pass axe and reflow without horizontal overflow from 1280 to 320 px', async () => {
    await openCommunity();
    expect(await seriousAxeViolations()).toEqual([]);
    await target.screenshot(undefined, 'community-1280x720.png');

    for (const viewport of [
      { width: 390, height: 844 },
      { width: 320, height: 720 },
    ]) {
      await target.setViewport(viewport);
      await target.expectVisible(search);
      await target.screenshot(undefined, `community-${String(viewport.width)}x${String(viewport.height)}.png`);
      expect({ viewport, overflow: await measureHorizontalOverflow() }).toEqual({
        viewport,
        overflow: { document: 0, scroller: 0, offenders: [] },
      });
      expect(await seriousAxeViolations()).toEqual([]);
    }
  });
});
