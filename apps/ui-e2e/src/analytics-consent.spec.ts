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

/*
 * Consent changes must not remount the product. The old boundary switched
 * element type above <html>, so accepting analytics discarded every editor draft.
 * Withdrawal and re-acceptance arrive as another tab would deliver them: a
 * cookie write followed by focus.
 */
test('keeps the application mounted through acceptance, withdrawal and re-acceptance', async ({ skip }) => {
  await target.navigate('/');
  await target.expectVisible(selectors.getByRole('heading', { name: 'Cookies', exact: true }));
  await target.evaluate(() => {
    (globalThis as typeof globalThis & { tauMounted?: Element[] }).tauMounted = [...document.body.children].filter(
      (element) => element.tagName !== 'SCRIPT' && !/Cookies/u.test(element.querySelector('h3')?.textContent ?? ''),
    );
  });
  const stillMounted = async (): Promise<boolean> =>
    target.evaluate(() => {
      const mounted = (globalThis as typeof globalThis & { tauMounted?: Element[] }).tauMounted ?? [];
      return mounted.length > 0 && mounted.every((element) => element.isConnected);
    });
  const writeDecision = async (status: 'accepted' | 'declined'): Promise<void> => {
    await target.addCookies([
      {
        name: consentCookieName,
        value: encodeURIComponent(JSON.stringify({ status, version: 1 })),
        url: await target.currentUrl(),
      },
    ]);
    await target.evaluate(() => {
      globalThis.dispatchEvent(new Event('focus'));
    });
  };
  const hasAnalyticsKey = await target.evaluate(() =>
    Boolean((globalThis as typeof globalThis & { ENV?: { POSTHOG_CLIENT_KEY?: string } }).ENV?.POSTHOG_CLIENT_KEY),
  );

  await target.click(selectors.getByRole('button', { name: 'Accept', exact: true }));
  await expect.poll(consentStatus).toBe('accepted');
  expect(await stillMounted()).toBe(true);

  await writeDecision('declined');
  await expect.poll(hasCookiePrompt).toBe(false);
  expect(await stillMounted()).toBe(true);

  await writeDecision('accepted');
  expect(await stillMounted()).toBe(true);

  if (!hasAnalyticsKey) {
    skip('POSTHOG_CLIENT_KEY is not configured for this UI server; the analytics data plane cannot be observed.');
  }
  /*
   * Persistence, not request count: the headless tab is never visible, and the SDK
   * holds its initial pageview until `visibilityState` is visible. Accepted
   * persistence still proves the SDK ran with a real key, and its removal proves
   * withdrawal cleanup.
   */
  const storedIdentifiers = async (): Promise<number> => {
    const { cookies, storage } = await posthogState();
    return cookies.length + storage.length;
  };
  await expect.poll(storedIdentifiers, { timeout: 15_000 }).toBeGreaterThan(0);

  await writeDecision('declined');
  await expect.poll(storedIdentifiers, { timeout: 15_000 }).toBe(0);
  expect(await stillMounted()).toBe(true);
});
