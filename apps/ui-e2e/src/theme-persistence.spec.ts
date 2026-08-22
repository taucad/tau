import { expect, test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import type { Locator } from 'vitest/browser';
import * as target from '#support/external-target.js';

const getThemeToggle = (): Locator => selectors.getByRole('button', { name: /toggle theme/i });
const getHtml = (): Locator => selectors.getByCss('html');

async function waitForThemeCookie(expected: 'present' | 'absent'): Promise<void> {
  await expect
    .poll(async () => {
      const cookies = await target.cookies();
      return cookies.some((cookie) => cookie.name === 'tau-theme');
    })
    .toBe(expected === 'present');
}

async function expectNoLegacyThemeCookie(): Promise<void> {
  const cookies = await target.cookies();
  expect(cookies.some((cookie) => cookie.name === 'tau-color-theme')).toBe(false);
}

test.describe('theme persistence', () => {
  test('should persist explicit light theme across refresh on a dark system preference', async () => {
    await target.emulateColorScheme('dark');
    await target.navigate('/');

    const themeToggle = getThemeToggle();
    await target.expectAttribute(themeToggle, 'data-theme', 'system');

    await target.click(themeToggle);
    await target.expectAttribute(themeToggle, 'data-theme', 'light');
    await target.expectClass(getHtml(), /\blight\b/);
    await waitForThemeCookie('present');

    await target.reload();

    await target.expectAttribute(themeToggle, 'data-theme', 'light');
    await target.expectClass(getHtml(), /\blight\b/);
    await expectNoLegacyThemeCookie();
  });

  test('should return to system theme and follow dark system preference across refresh', async () => {
    await target.emulateColorScheme('dark');
    await target.navigate('/');

    const themeToggle = getThemeToggle();
    await target.expectAttribute(themeToggle, 'data-theme', 'system');

    await target.click(themeToggle);
    await target.expectAttribute(themeToggle, 'data-theme', 'light');
    await waitForThemeCookie('present');

    await target.click(themeToggle);
    await target.expectAttribute(themeToggle, 'data-theme', 'dark');

    await target.click(themeToggle);
    await target.expectAttribute(themeToggle, 'data-theme', 'system');
    await target.expectClass(getHtml(), /\bdark\b/);
    await waitForThemeCookie('absent');

    await target.reload();

    await target.expectAttribute(themeToggle, 'data-theme', 'system');
    await target.expectClass(getHtml(), /\bdark\b/);
    await expectNoLegacyThemeCookie();
  });

  test('should ignore a stale legacy tau-color-theme cookie without tau-theme', async () => {
    await target.emulateColorScheme('dark');
    await target.navigate('/');
    await target.addCookies([
      {
        name: 'tau-color-theme',
        value: '"light"',
        url: await target.currentUrl(),
      },
    ]);
    await target.reload();

    const themeToggle = getThemeToggle();
    await target.expectAttribute(themeToggle, 'data-theme', 'system');
    await target.expectClass(getHtml(), /\bdark\b/);

    const cookies = await target.cookies();
    expect(cookies.some((cookie) => cookie.name === 'tau-theme')).toBe(false);
  });
});
