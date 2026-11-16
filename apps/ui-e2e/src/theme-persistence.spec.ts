import { expect, test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import type { Locator } from 'vitest/browser';
import * as target from '#support/external-target.js';

const getHtml = (): Locator => selectors.getByCss('html');
const getThemeButton = (name = /^(?:light|dark|black|high contrast|system)$/i): Locator =>
  selectors.getByRole('button', { name });
const getThemeOption = (name: RegExp): Locator => selectors.getByRole('option', { name });
const getSettingsDialog = (): Locator => selectors.getByRole('dialog', { name: /^settings$/i });

/** The theme choice in the client-facts record (P2): `system` once settled, `undefined` before the first load stores it. */
async function storedTheme(): Promise<string | undefined> {
  return target.evaluate(() => {
    try {
      return (JSON.parse(localStorage.getItem('tau-client-facts') ?? '{}') as { theme?: string }).theme;
    } catch {
      return undefined;
    }
  });
}

async function waitForStoredTheme(expected: string): Promise<void> {
  await expect.poll(storedTheme).toBe(expected);
}

/** The theme never rides a request: no `tau-theme` cookie is ever set. */
async function expectNoThemeCookie(): Promise<void> {
  const cookies = await target.cookies();
  expect(cookies.some((cookie) => cookie.name === 'tau-theme')).toBe(false);
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
    await waitForStoredTheme('light');
    await expectNoThemeCookie();

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
      await waitForStoredTheme('high-contrast');
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
    await waitForStoredTheme('high-contrast');
    await selectTheme(/^system/i);
    await target.expectClass(getHtml(), /\bdark\b/);
    await waitForStoredTheme('system');

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
    // The one-time cookie migration settles a visitor with no choice as System; contrast is never stored.
    await waitForStoredTheme('system');
    await expectNoThemeCookie();
  });

  test('should preserve Black canvas under the increased-contrast preference', async () => {
    await target.emulateColorScheme('light');
    await target.emulateContrast('more');
    await target.navigate('/?settings=general');
    await selectTheme(/^black/i);

    // The canvas is pure black whatever notation the build serializes it in: the production CSS minifier rewrites the
    // source's `oklch(0 0 none)` as `lab(0% 0 0)` with a `#000` fallback, so read the painted pixel, not the text.
    expect(
      await target.evaluate(() => {
        const canvas = document.createElement('canvas');
        canvas.width = 1;
        canvas.height = 1;
        const context = canvas.getContext('2d');
        if (!context) {
          throw new Error('Expected a 2D canvas context');
        }
        // White first, so a value the canvas cannot parse (which it ignores) cannot pass as black.
        context.fillStyle = '#fff';
        context.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--background').trim();
        context.fillRect(0, 0, 1, 1);
        return [...context.getImageData(0, 0, 1, 1).data];
      }),
    ).toEqual([0, 0, 0, 255]);
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
