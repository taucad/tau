import { expect, test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import type { Locator } from 'vitest/browser';
import * as target from '#support/external-target.js';

const getHtml = (): Locator => selectors.getByCss('html');
const getThemeButton = (name = /^(?:light|dark|black|high contrast|system)$/i): Locator =>
  selectors.getByRole('button', { name });
const getThemeOption = (name: RegExp): Locator => selectors.getByRole('option', { name });
const getSettingsDialog = (): Locator => selectors.getByRole('dialog', { name: /^settings$/i });

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

async function selectTheme(nextName: RegExp): Promise<void> {
  await target.click(getThemeButton());
  await target.click(getThemeOption(nextName));
}

test.describe('theme persistence and accessibility media', () => {
  test('should persist explicit light theme across refresh on a dark system preference', async () => {
    await target.emulateColorScheme('dark');
    await target.navigate('/?settings=general');

    await selectTheme(/^light/i);
    await target.expectClass(getHtml(), /\blight\b/);
    await waitForThemeCookie('present');

    await target.reload();

    await target.expectVisible(getThemeButton(/^light$/i));
    await target.expectClass(getHtml(), /\blight\b/);
    await expectNoLegacyThemeCookie();
  });

  test('should persist High Contrast and broadcast it across tabs', async () => {
    await target.emulateColorScheme('light');
    await target.navigate('/?settings=general');
    await target.openSecondary('/');

    try {
      await selectTheme(/^high contrast/i);
      await target.expectClass(getHtml(), /\bdark\b.*\bhigh-contrast\b/);
      await waitForThemeCookie('present');
      await target.waitFor(
        () =>
          document.documentElement.classList.contains('dark') &&
          document.documentElement.classList.contains('high-contrast'),
        undefined,
        { surface: 'secondary' },
      );

      await target.reload();
      await target.expectVisible(getThemeButton(/^high contrast$/i));
      await target.expectClass(getHtml(), /\bdark\b.*\bhigh-contrast\b/);
      await target.screenshot(getSettingsDialog(), 'high-contrast-settings.png');
      await expectNoLegacyThemeCookie();
    } finally {
      await target.closeSecondary();
    }
  });

  test('should return to system and follow the dark system preference across refresh', async () => {
    await target.emulateColorScheme('dark');
    await target.navigate('/?settings=general');

    await selectTheme(/^high contrast/i);
    await waitForThemeCookie('present');
    await selectTheme(/^system/i);
    await target.expectClass(getHtml(), /\bdark\b/);
    await waitForThemeCookie('absent');

    await target.reload();

    await target.expectVisible(getThemeButton(/^system$/i));
    await target.expectClass(getHtml(), /\bdark\b/);
    await expectNoLegacyThemeCookie();
  });

  test('should enhance Light at runtime without changing theme persistence', async () => {
    await target.emulateColorScheme('light');
    await target.emulateContrast('no-preference');
    await target.navigate('/');

    const initialBorder = await target.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--border'),
    );
    await target.emulateContrast('more');
    await target.waitFor(() => matchMedia('(prefers-contrast: more)').matches);

    const enhancedBorder = await target.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--border'),
    );
    expect(enhancedBorder).not.toBe(initialBorder);
    await target.expectClass(getHtml(), /\blight\b/);
    await waitForThemeCookie('absent');
  });

  test('should preserve Black canvas under the increased-contrast preference', async () => {
    await target.emulateColorScheme('light');
    await target.emulateContrast('more');
    await target.navigate('/?settings=general');
    await selectTheme(/^black/i);

    expect(
      await target.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--background').trim()),
    ).toBe('oklch(0 0 none)');
    await target.expectClass(getHtml(), /\bdark\b.*\bblack\b/);
  });

  test('should leave forced colors under browser control', async () => {
    await target.emulateForcedColors('active');
    await target.navigate('/?settings=general');

    expect(await target.evaluate(() => matchMedia('(forced-colors: active)').matches)).toBe(true);
    expect(await target.evaluate(() => getComputedStyle(document.documentElement).forcedColorAdjust)).toBe('auto');
    await target.screenshot(getSettingsDialog(), 'forced-colors-settings.png');
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

    await target.expectClass(getHtml(), /\bdark\b/);
    const cookies = await target.cookies();
    expect(cookies.some((cookie) => cookie.name === 'tau-theme')).toBe(false);
  });
});
