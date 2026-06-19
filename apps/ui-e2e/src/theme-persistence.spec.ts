import { test, expect } from '@playwright/test';
import type { BrowserContext, Locator, Page } from '@playwright/test';

test.use({ colorScheme: 'dark' });

const getThemeToggle = (page: Page): Locator => page.getByRole('button', { name: /toggle theme/i });
const getHtml = (page: Page): Locator => page.locator('html');

async function waitForThemeCookie(context: BrowserContext, expected: 'present' | 'absent'): Promise<void> {
  await expect
    .poll(async () => {
      const cookies = await context.cookies();
      return cookies.some((cookie) => cookie.name === 'tau-theme');
    })
    .toBe(expected === 'present');
}

async function expectNoLegacyThemeCookie(context: BrowserContext): Promise<void> {
  const cookies = await context.cookies();
  expect(cookies.some((cookie) => cookie.name === 'tau-color-theme')).toBe(false);
}

test.describe('theme persistence', () => {
  test('should persist explicit light theme across refresh on a dark system preference', async ({ page, context }) => {
    await page.goto('/');

    const themeToggle = getThemeToggle(page);
    await expect(themeToggle).toHaveAttribute('data-theme', 'system');

    await themeToggle.click();
    await expect(themeToggle).toHaveAttribute('data-theme', 'light');
    await expect(getHtml(page)).toHaveClass(/\blight\b/);
    await waitForThemeCookie(context, 'present');

    await page.reload();

    await expect(themeToggle).toHaveAttribute('data-theme', 'light');
    await expect(getHtml(page)).toHaveClass(/\blight\b/);
    await expectNoLegacyThemeCookie(context);
  });

  test('should return to system theme and follow dark system preference across refresh', async ({ page, context }) => {
    await page.goto('/');

    const themeToggle = getThemeToggle(page);
    await expect(themeToggle).toHaveAttribute('data-theme', 'system');

    await themeToggle.click();
    await expect(themeToggle).toHaveAttribute('data-theme', 'light');
    await waitForThemeCookie(context, 'present');

    await themeToggle.click();
    await expect(themeToggle).toHaveAttribute('data-theme', 'dark');

    await themeToggle.click();
    await expect(themeToggle).toHaveAttribute('data-theme', 'system');
    await expect(getHtml(page)).toHaveClass(/\bdark\b/);
    await waitForThemeCookie(context, 'absent');

    await page.reload();

    await expect(themeToggle).toHaveAttribute('data-theme', 'system');
    await expect(getHtml(page)).toHaveClass(/\bdark\b/);
    await expectNoLegacyThemeCookie(context);
  });

  test('should ignore a stale legacy tau-color-theme cookie without tau-theme', async ({ page, context, baseURL }) => {
    await context.addCookies([
      {
        name: 'tau-color-theme',
        value: '"light"',
        url: baseURL ?? 'http://localhost:3000',
      },
    ]);

    await page.goto('/');

    const themeToggle = getThemeToggle(page);
    await expect(themeToggle).toHaveAttribute('data-theme', 'system');
    await expect(getHtml(page)).toHaveClass(/\bdark\b/);

    const cookies = await context.cookies();
    expect(cookies.some((cookie) => cookie.name === 'tau-theme')).toBe(false);
  });
});
