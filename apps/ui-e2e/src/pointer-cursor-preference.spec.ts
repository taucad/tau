import { expect, test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import type { Locator } from 'vitest/browser';
import * as target from '#support/external-target.js';

const html = selectors.getByCss('html');
const pointerSwitch = selectors.getByRole('switch', { name: 'Use pointer cursors' });
const themeButton = selectors.getByRole('button', { name: /^(?:light|dark|black|high contrast|system)$/i });
const linkProbe = selectors.getByCss('[data-cursor-link-probe]');
const settingsSearch = selectors.getByRole('searchbox', { name: 'Search settings' });

const computedCursor = async (locator: Locator): Promise<string> =>
  target.evaluateLocator(locator, (element) => getComputedStyle(element).cursor);

const computedBackground = async (locator: Locator): Promise<string> =>
  target.evaluateLocator(locator, (element) => getComputedStyle(element).backgroundColor);

const visibleNonLinkPointers = async (): Promise<string[]> =>
  target.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('*')]
      .filter((element) => {
        const { cursor, display, visibility } = getComputedStyle(element);
        const { width, height } = element.getBoundingClientRect();
        return (
          cursor === 'pointer' &&
          (element.parentElement === null || getComputedStyle(element.parentElement).cursor !== 'pointer') &&
          display !== 'none' &&
          visibility !== 'hidden' &&
          width > 0 &&
          height > 0 &&
          element.closest('a[href], area[href]') === null
        );
      })
      .map((element) => element.outerHTML.slice(0, 300)),
  );

const visibleSidebarLinkCursors = async (): Promise<string[]> =>
  target.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>("[data-slot='sidebar'] a[href]")]
      .filter((element) => {
        const { display, visibility } = getComputedStyle(element);
        const { width, height } = element.getBoundingClientRect();
        return display !== 'none' && visibility !== 'hidden' && width > 0 && height > 0;
      })
      .map((element) => getComputedStyle(element).cursor),
  );

test('defaults actions to arrows and persists the pointer-cursor opt-in', async () => {
  await target.navigate('/?settings=general');
  await target.evaluate(() => {
    const link = document.createElement('a');
    link.href = '/';
    link.dataset['cursorLinkProbe'] = '';
    link.textContent = 'Cursor link probe';
    document.body.append(link);
  });

  await expect.poll(async () => computedCursor(themeButton)).toBe('default');
  expect(await computedCursor(linkProbe)).toBe('pointer');
  expect(await computedCursor(settingsSearch)).toBe('text');
  expect(await target.getAttribute(html, 'data-pointer-cursors')).toBeNull();
  expect(await visibleNonLinkPointers()).toEqual([]);

  await target.click(themeButton);
  const blackOption = selectors.getByRole('option', { name: /^black/i });
  const restBackground = await computedBackground(blackOption);
  expect(await computedCursor(blackOption)).toBe('default');
  await target.hover(blackOption);
  await expect.poll(async () => computedBackground(blackOption)).not.toBe(restBackground);
  await target.keyboardPress('Escape');

  await target.click(pointerSwitch);
  await expect.poll(async () => target.getAttribute(html, 'data-pointer-cursors')).toBe('true');
  await expect.poll(async () => computedCursor(themeButton)).toBe('pointer');
  expect(await computedCursor(linkProbe)).toBe('pointer');
  const cookies = await target.cookies();
  expect(cookies.some(({ name }) => name === 'tau-pointer-cursors')).toBe(false);
  expect(await target.evaluate(() => localStorage.getItem('tau-pointer-cursors'))).toBe('true');

  await target.reload();
  await target.expectAttribute(pointerSwitch, 'data-state', 'checked');
  await expect.poll(async () => target.getAttribute(html, 'data-pointer-cursors')).toBe('true');
  expect(await computedCursor(themeButton)).toBe('pointer');

  await target.click(pointerSwitch);
  await expect.poll(async () => target.getAttribute(html, 'data-pointer-cursors')).toBeNull();
  await expect.poll(async () => computedCursor(themeButton)).toBe('default');
  expect(await target.evaluate(() => localStorage.getItem('tau-pointer-cursors'))).toBe('false');

  await target.evaluateLocator(pointerSwitch, (element) => {
    element.setAttribute('disabled', '');
  });
  expect(await computedCursor(pointerSwitch)).toBe('not-allowed');
  expect(
    await target.evaluate(() => {
      const probe = document.createElement('div');
      probe.className = 'cursor-col-resize';
      document.body.append(probe);
      const { cursor } = getComputedStyle(probe);
      probe.remove();
      return cursor;
    }),
  ).toBe('col-resize');

  await target.navigate('/__e2e/project-navigation');
  await target.expectVisible(selectors.getByText('Project Navigation A', { exact: true }), 60_000);
  expect(await visibleNonLinkPointers()).toEqual([]);
  const sidebarLinkCursors = await visibleSidebarLinkCursors();
  expect(sidebarLinkCursors.length).toBeGreaterThan(0);
  expect(new Set(sidebarLinkCursors)).toEqual(new Set(['default']));

  await target.evaluate(() => {
    document.documentElement.dataset['pointerCursors'] = 'true';
  });
  expect(new Set(await visibleSidebarLinkCursors())).toEqual(new Set(['pointer']));
  await target.evaluate(() => {
    delete document.documentElement.dataset['pointerCursors'];
  });

  expect(
    await target.evaluate(() => {
      const tab = document.querySelector<HTMLElement>('.dv-tab');
      const tabBar = tab?.closest<HTMLElement>('.dv-tabs-and-actions-container');

      if (!tab || !tabBar) {
        throw new Error('Expected a Dockview tab and tab bar');
      }

      const tabStyle = getComputedStyle(tab);
      return {
        tabBarHeight: tabBar.getBoundingClientRect().height,
        tabHeight: tab.getBoundingClientRect().height,
        tabMarginBlock: [tabStyle.marginBlockStart, tabStyle.marginBlockEnd],
      };
    }),
  ).toEqual({ tabBarHeight: 36, tabHeight: 27, tabMarginBlock: ['4px', '4px'] });
});
