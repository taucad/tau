import { expect, test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import * as target from '#support/external-target.js';

const consentCookieName = 'tau-cookie-consent';
const consentStatus = async (): Promise<string | undefined> => {
  const cookies = await target.cookies();
  const cookie = cookies.find(({ name }) => name === consentCookieName);
  return cookie ? (JSON.parse(decodeURIComponent(cookie.value)) as { status?: string }).status : undefined;
};

const hasCookiePrompt = async (): Promise<boolean> =>
  target.evaluate(() =>
    [...document.querySelectorAll('h1, h2, h3')].some(({ textContent }) => textContent === 'Cookies'),
  );

const posthogState = async (): Promise<{ cookies: string[]; storage: string[]; requests: string[] }> => {
  const cookies = await target.cookies();
  return {
    cookies: cookies.map(({ name }) => name).filter((name) => name.startsWith('ph_')),
    storage: await target.evaluate(() =>
      Object.keys(localStorage).filter((name) => name.startsWith('ph_') || name.startsWith('posthog')),
    ),
    requests: await target.evaluate(() =>
      performance
        .getEntriesByType('resource')
        .map(({ name }) => name)
        .filter((name) => /\/api\/ph(?:\/|$)|posthog\.com/iu.test(name)),
    ),
  };
};

test('requires a reversible web analytics choice and remembers it', async () => {
  await target.navigate('/');
  await target.expectVisible(selectors.getByRole('heading', { name: 'Cookies', exact: true }));
  expect(await posthogState()).toEqual({ cookies: [], storage: [], requests: [] });

  await target.click(selectors.getByRole('button', { name: 'Decline', exact: true }));
  await expect.poll(consentStatus).toBe('declined');
  expect(await posthogState()).toEqual({ cookies: [], storage: [], requests: [] });

  await target.navigate('/legal/cookies#preferences');
  await target.click(selectors.getByRole('checkbox', { name: 'Product analytics' }));
  await target.click(selectors.getByRole('button', { name: 'Save settings' }));
  await expect.poll(consentStatus).toBe('accepted');

  await target.reload();
  await expect.poll(hasCookiePrompt).toBe(false);
});

test('treats Global Privacy Control as a hard analytics decline', async () => {
  await target.navigate('/');
  await target.addCookies([
    {
      name: consentCookieName,
      value: encodeURIComponent(JSON.stringify({ status: 'accepted', version: 1 })),
      url: await target.currentUrl(),
    },
  ]);
  await target.addInitScript(() => {
    Object.defineProperty(navigator, 'globalPrivacyControl', { configurable: true, value: true });
  });
  await target.reload();

  expect(
    await target.evaluate(() => (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl),
  ).toBe(true);
  expect(await hasCookiePrompt()).toBe(false);
  await target.navigate('/legal/cookies#preferences');
  await target.expectVisible(selectors.getByRole('checkbox', { name: 'Product analytics' }));
  expect(await target.evaluate(() => document.querySelector<HTMLButtonElement>('#analytics')?.disabled)).toBe(true);
  expect(await posthogState()).toEqual({ cookies: [], storage: [], requests: [] });
});
